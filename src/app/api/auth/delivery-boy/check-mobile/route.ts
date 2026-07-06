import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

const DELIVERY_BOYS_COLLECTION = 'delivery_boys'

/**
 * POST /api/auth/delivery-boy/check-mobile
 * Check if a mobile number exists in the delivery_boys collection.
 *
 * Firebase Phone Auth change: This endpoint NO LONGER sends the OTP.
 * Previously (2Factor) it sent the OTP server-side. Now the client sends
 * the OTP directly via Firebase after receiving `exists: false` from here.
 * This split is necessary because Firebase Phone Auth requires client-side
 * reCAPTCHA + signInWithPhoneNumber — it cannot be done server-side.
 *
 * Body: { mobile: string }
 * Response:
 *   - { exists: true, message } — existing delivery boy, login with passcode
 *   - { exists: false, otpSent: false, message } — new delivery boy, client should
 *      call Firebase signInWithPhoneNumber() to send the OTP
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').replace(/\D/g, '').slice(-10)

    if (!mobile || mobile.length !== 10) {
      return NextResponse.json({ error: 'Valid 10-digit mobile number is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const existingDeliveryBoy = await db.collection(DELIVERY_BOYS_COLLECTION).findOne({ mobile })

    if (existingDeliveryBoy) {
      // Existing delivery boy — they need to enter passcode to login
      return NextResponse.json({
        exists: true,
        message: 'Mobile number found. Please enter your passcode to login.',
      })
    }

    // New delivery boy — the client will send the OTP via Firebase Phone Auth.
    return NextResponse.json({
      exists: false,
      otpSent: false,
      message: 'New mobile number. Please verify with OTP to continue registration.',
    })
  } catch (error) {
    console.error('[Delivery Boy Check Mobile Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 },
    )
  }
}
