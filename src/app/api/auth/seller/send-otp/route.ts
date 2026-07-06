import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

/**
 * POST /api/auth/seller/send-otp
 * Compatibility endpoint — kept for backward compatibility with the frontend
 * send-OTP button. With Firebase Phone Auth, OTP sending happens client-side
 * via Firebase's signInWithPhoneNumber(). This endpoint:
 *   1. Validates the mobile number
 *   2. Confirms the seller doesn't already exist (checks `sellers.phone`)
 *   3. Returns success — the client handles the actual send via Firebase
 *
 * The client's send handler should call Firebase signInWithPhoneNumber()
 * directly (via the usePhoneOtp hook), NOT rely on this endpoint to send the OTP.
 *
 * Body: { mobile: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').trim()

    if (!mobile || mobile.replace(/\D/g, '').length < 10) {
      return NextResponse.json(
        { error: 'Valid 10-digit mobile number is required' },
        { status: 400 },
      )
    }

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10)

    // Check if mobile is already registered
    const { db } = await connectToDatabase()
    const existing = await db.collection('sellers').findOne({ phone: cleanMobile })
    if (existing) {
      return NextResponse.json(
        { error: 'This mobile number is already registered. Please login instead.' },
        { status: 409 },
      )
    }

    // With Firebase Phone Auth, the client sends the OTP directly via Firebase.
    return NextResponse.json({
      success: true,
      message: 'Please use the send OTP button to get a new OTP via Firebase.',
    })
  } catch (error) {
    console.error('[Seller Send OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 },
    )
  }
}
