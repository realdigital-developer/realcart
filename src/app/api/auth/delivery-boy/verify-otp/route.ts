import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyOTP } from '@/lib/2factor'

/**
 * POST /api/auth/delivery-boy/verify-otp
 * Verify OTP entered by the delivery boy
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

    const { db } = await connectToDatabase()

    // Get the OTP session
    const otpSession = await db.collection('otp_sessions').findOne({
      mobile,
      expiresAt: { $gt: new Date() },
    })

    if (!otpSession) {
      return NextResponse.json(
        { error: 'OTP session expired. Please request a new OTP.' },
        { status: 400 }
      )
    }

    // Verify OTP via 2factor.in
    const isValid = await verifyOTP(otpSession.sessionId, otp)

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid OTP. Please try again.' },
        { status: 401 }
      )
    }

    // Mark OTP session as verified
    await db.collection('otp_sessions').updateOne(
      { mobile },
      {
        $set: {
          verified: true,
          verifiedAt: new Date(),
        },
      }
    )

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
    })
  } catch (error) {
    console.error('[Delivery Boy Verify OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify OTP' },
      { status: 500 }
    )
  }
}
