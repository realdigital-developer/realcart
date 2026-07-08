import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { sendOtp } from '@/lib/sms-otp'

const SELLERS_COLLECTION = 'sellers'

/**
 * POST /api/auth/seller/send-otp
 * Send an OTP to a mobile number for new seller registration (or resend).
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

    // Check if mobile is already registered
    const existing = await db.collection(SELLERS_COLLECTION).findOne({ phone: mobile })
    if (existing) {
      return NextResponse.json(
        { error: 'This mobile number is already registered. Please login instead.' },
        { status: 409 },
      )
    }

    // Send OTP via SMS gateway (MSG91 SMS API or dev mode)
    await sendOtp(mobile, 'seller')

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully',
    })
  } catch (error) {
    console.error('[Seller Send OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send OTP' },
      { status: 500 },
    )
  }
}
