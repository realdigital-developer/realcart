import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { sendOtp } from '@/lib/sms-otp'

const CUSTOMERS_COLLECTION = 'customers'

/**
 * POST /api/auth/customer/check-mobile
 * Check if a mobile number exists in the database. If new, send an OTP.
 *
 * Body: { mobile: string }
 * Response:
 *   - { exists: true, message } — existing customer, login with passcode
 *   - { exists: false, otpSent: true, message } — new customer, OTP sent via SMS
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

    // New customer — send OTP via SMS gateway (Authgear API or dev mode)
    await sendOtp(mobile, 'customer')

    return NextResponse.json({
      exists: false,
      otpSent: true,
      message: 'OTP sent to your mobile number. Please verify to continue registration.',
    })
  } catch (error) {
    console.error('[Check Mobile Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 },
    )
  }
}
