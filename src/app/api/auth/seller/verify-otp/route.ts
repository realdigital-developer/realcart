import { NextRequest, NextResponse } from 'next/server'
import { verifyOTP } from '@/lib/2factor'

/**
 * POST /api/auth/seller/verify-otp
 * Verify OTP sent to seller's mobile number
 * Body: { mobile: string, sessionId: string, otp: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').trim()
    const sessionId = (body.sessionId || '').trim()
    const otp = (body.otp || '').trim()

    if (!mobile || !sessionId || !otp) {
      return NextResponse.json(
        { error: 'Mobile number, session ID, and OTP are required' },
        { status: 400 }
      )
    }

    // Verify OTP via 2factor
    const isValid = await verifyOTP(sessionId, otp)

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid OTP. Please try again.' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Mobile number verified successfully',
      verified: true,
    })
  } catch (error) {
    console.error('[Seller Verify OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OTP verification failed' },
      { status: 500 }
    )
  }
}
