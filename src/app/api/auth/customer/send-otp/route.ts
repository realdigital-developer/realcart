import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { sendOtp } from '@/lib/sms-otp'

const CUSTOMERS_COLLECTION = 'customers'

/**
 * POST /api/auth/customer/send-otp
 * Send an OTP to a mobile number for new customer registration (or resend).
 * Uses server-side SMS OTP (MSG91 SMS API) with dev-mode fallback (test OTP 123456).
 *
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

    // Check if customer already exists (new customers only)
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION).findOne({ mobile })
    if (existingCustomer) {
      return NextResponse.json(
        { error: 'This mobile number is already registered. Please login with your passcode.' },
        { status: 409 },
      )
    }

    // Send OTP via SMS gateway (MSG91 SMS API or dev mode)
    await sendOtp(mobile, 'customer')

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully',
    })
  } catch (error) {
    console.error('[Send OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send OTP' },
      { status: 500 },
    )
  }
}
