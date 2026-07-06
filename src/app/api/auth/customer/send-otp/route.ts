import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

const CUSTOMERS_COLLECTION = 'customers'

/**
 * POST /api/auth/customer/send-otp
 * Compatibility endpoint — kept for backward compatibility with the frontend
 * resend-OTP button. With Firebase Phone Auth, OTP sending happens client-side
 * via Firebase's signInWithPhoneNumber(). This endpoint:
 *   1. Validates the mobile number
 *   2. Confirms the customer doesn't already exist (new customers only)
 *   3. Returns success — the client handles the actual resend via Firebase
 *
 * The client's resend handler should call Firebase signInWithPhoneNumber()
 * directly (NOT rely on this endpoint to send the OTP).
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

    // With Firebase Phone Auth, the client sends the OTP directly via Firebase.
    // This endpoint just returns success — the client's resend handler calls
    // Firebase signInWithPhoneNumber() to trigger a new OTP.
    return NextResponse.json({
      success: true,
      message: 'Please use the resend button to get a new OTP via Firebase.',
    })
  } catch (error) {
    console.error('[Send OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 },
    )
  }
}
