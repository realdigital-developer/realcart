import { NextRequest, NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/sms-otp'

/**
 * POST /api/auth/delivery-boy/verify-otp
 * Verify the OTP entered by the delivery boy.
 *
 * Architecture (SIM Binding — replaces Firebase Phone Auth):
 *   1. Client POSTs { mobile, otp }
 *   2. Server calls verifyOtp(mobile, otp) → checks against the stored OTP hash (or dev OTP)
 *   3. On success, marks otp_sessions.verified = true (register route gates on this)
 *
 * Body: { mobile: string, otp: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').replace(/\D/g, '').slice(-10)
    const otp = (body.otp || '').replace(/\D/g, '')

    if (!mobile || mobile.length !== 10) {
      return NextResponse.json({ error: 'Valid 10-digit mobile number is required' }, { status: 400 })
    }

    if (!otp || otp.length < 4) {
      return NextResponse.json({ error: 'Valid OTP is required' }, { status: 400 })
    }

    // Verify the OTP via the SMS gateway (SIM Binding or dev mode)
    try {
      const result = await verifyOtp(mobile, otp, 'delivery_boy')
      if (!result.valid) {
        return NextResponse.json(
          { error: 'Invalid OTP. Please try again.' },
          { status: 401 },
        )
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'OTP verification failed' },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
    })
  } catch (error) {
    console.error('[Delivery Boy Verify OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify OTP' },
      { status: 500 },
    )
  }
}
