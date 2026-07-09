import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { sendOtp } from '@/lib/sms-otp'

const DELIVERY_BOYS_COLLECTION = 'delivery_boys'

/**
 * POST /api/auth/delivery-boy/send-otp
 * Send an OTP to a mobile number for new delivery boy registration (or resend).
 * Uses SIM Binding (SIM Binding) with dev-mode fallback (auto-verify after 3s).
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

    // Check if delivery boy already exists (new users only)
    const existingDeliveryBoy = await db.collection(DELIVERY_BOYS_COLLECTION).findOne({ mobile })
    if (existingDeliveryBoy) {
      return NextResponse.json(
        { error: 'This mobile number is already registered. Please login with your passcode.' },
        { status: 409 },
      )
    }

    // Send OTP via SMS gateway (SIM Binding or dev mode)
    const result = await sendOtp(mobile, 'delivery_boy')

    return NextResponse.json({
      success: true,
      message: 'SIM binding code generated',
      bindingCode: result.bindingCode,
      serverNumber: result.serverNumber || '',
    })
  } catch (error) {
    console.error('[Delivery Boy Send OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send OTP' },
      { status: 500 },
    )
  }
}
