import { NextRequest, NextResponse } from 'next/server'
import { sendOTP } from '@/lib/2factor'

/**
 * POST /api/auth/seller/send-otp
 * Send OTP to seller's mobile number for verification
 * Body: { mobile: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').trim()

    if (!mobile || mobile.replace(/\D/g, '').length < 10) {
      return NextResponse.json(
        { error: 'Valid 10-digit mobile number is required' },
        { status: 400 }
      )
    }

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10)

    // Check if mobile is already registered
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { db } = await connectToDatabase()
    const existing = await db.collection('sellers').findOne({ phone: cleanMobile })
    if (existing) {
      return NextResponse.json(
        { error: 'This mobile number is already registered. Please login instead.' },
        { status: 409 }
      )
    }

    // Send OTP via 2factor
    const { sessionId } = await sendOTP(cleanMobile)

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully',
      sessionId,
    })
  } catch (error) {
    console.error('[Seller Send OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send OTP' },
      { status: 500 }
    )
  }
}
