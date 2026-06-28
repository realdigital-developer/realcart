import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { sendOTP } from '@/lib/2factor'

const CUSTOMERS_COLLECTION = 'customers'

/**
 * POST /api/auth/customer/check-mobile
 * Check if a mobile number exists in the database and send OTP if new
 * Body: { mobile: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').replace(/\D/g, '').slice(-10)

    if (!mobile || mobile.length !== 10) {
      return NextResponse.json({ error: 'Valid 10-digit mobile number is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION).findOne({ mobile })

    if (existingCustomer) {
      // Existing customer — they need to enter passcode to login
      return NextResponse.json({
        exists: true,
        message: 'Mobile number found. Please enter your passcode to login.',
      })
    }

    // New customer — send OTP for verification
    const { sessionId } = await sendOTP(mobile)

    // Store the OTP session ID temporarily (5 min TTL)
    await db.collection('otp_sessions').updateOne(
      { mobile },
      {
        $set: {
          mobile,
          sessionId,
          verified: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      },
      { upsert: true }
    )

    return NextResponse.json({
      exists: false,
      message: 'OTP sent to your mobile number. Please verify to continue registration.',
      otpSent: true,
    })
  } catch (error) {
    console.error('[Check Mobile Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    )
  }
}
