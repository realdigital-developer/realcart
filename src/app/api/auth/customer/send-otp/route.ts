import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { sendOTP, verifyOTP } from '@/lib/2factor'

const CUSTOMERS_COLLECTION = 'customers'

/**
 * POST /api/auth/customer/send-otp
 * Send OTP to a mobile number (for new customer registration)
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

    // Check if customer already exists
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION).findOne({ mobile })
    if (existingCustomer) {
      return NextResponse.json(
        { error: 'This mobile number is already registered. Please login with your passcode.' },
        { status: 409 }
      )
    }

    // Send OTP via 2factor.in
    const { sessionId } = await sendOTP(mobile)

    // Store the OTP session ID temporarily
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
      success: true,
      message: 'OTP sent successfully',
    })
  } catch (error) {
    console.error('[Send OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send OTP' },
      { status: 500 }
    )
  }
}
