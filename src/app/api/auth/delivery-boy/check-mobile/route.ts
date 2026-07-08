import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { sendOtp } from '@/lib/sms-otp'

const DELIVERY_BOYS_COLLECTION = 'delivery_boys'

/**
 * POST /api/auth/delivery-boy/check-mobile
 * Check if a mobile number exists in the delivery_boys collection. If new, send an OTP.
 *
 * Body: { mobile: string }
 * Response:
 *   - { exists: true, message } — existing delivery boy, login with passcode
 *   - { exists: false, otpSent: true, message } — new delivery boy, OTP sent via SMS
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

    // New delivery boy — send OTP via SMS gateway (MSG91 SMS API or dev mode)
    await sendOtp(mobile, 'delivery_boy')

    return NextResponse.json({
      exists: false,
      otpSent: true,
      message: 'OTP sent to your mobile number. Please verify to continue registration.',
    })
  } catch (error) {
    console.error('[Delivery Boy Check Mobile Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 },
    )
  }
}
