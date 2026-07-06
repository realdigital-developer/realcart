import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

const CUSTOMERS_COLLECTION = 'customers'

/**
 * POST /api/auth/customer/check-mobile
 * Check if a mobile number exists in the database.
 *
 * Firebase Phone Auth change: This endpoint NO LONGER sends the OTP.
 * Previously (2Factor) it sent the OTP server-side. Now the client sends
 * the OTP directly via Firebase after receiving `exists: false` from here.
 * This split is necessary because Firebase Phone Auth requires client-side
 * reCAPTCHA + signInWithPhoneNumber — it cannot be done server-side.
 *
 * Body: { mobile: string }
 * Response:
 *   - { exists: true, message } — existing customer, login with passcode
 *   - { exists: false, otpSent: false, message } — new customer, client should
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
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION).findOne({ mobile })

    if (existingCustomer) {
      // Existing customer — they need to enter passcode to login
      return NextResponse.json({
        exists: true,
        message: 'Mobile number found. Please enter your passcode to login.',
      })
    }

    // New customer — the client will send the OTP via Firebase Phone Auth.
    // We no longer send the OTP server-side (Firebase requires client-side reCAPTCHA).
    return NextResponse.json({
      exists: false,
      otpSent: false,
      message: 'New mobile number. Please verify with OTP to continue registration.',
    })
  } catch (error) {
    console.error('[Check Mobile Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 },
    )
  }
}
