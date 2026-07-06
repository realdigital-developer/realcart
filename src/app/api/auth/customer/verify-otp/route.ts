import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyIdToken } from '@/lib/firebase-admin'

/**
 * POST /api/auth/customer/verify-otp
 * Verify the Firebase ID token returned by the client-side Firebase Phone Auth flow.
 *
 * Architecture (Firebase Phone Auth replaces 2Factor):
 *   1. Client calls Firebase signInWithPhoneNumber() → Firebase sends OTP to user
 *   2. User enters OTP → client calls confirmationResult.confirm(otp) → gets ID token
 *   3. Client POSTs { mobile, idToken } to THIS endpoint
 *   4. Server verifies the ID token with Firebase Admin → extracts verified phone number
 *   5. Server cross-checks the phone number matches the requested mobile (security)
 *   6. Server marks otp_sessions.verified = true (register endpoint requires this gate)
 *
 * Dev-mode fallback: if Firebase Admin is not configured, a dev token
 * `dev-otp-<mobile>-123456` is accepted (test OTP = 123456).
 *
 * Body: { mobile: string, idToken: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').replace(/\D/g, '').slice(-10)
    const idToken = typeof body.idToken === 'string' ? body.idToken.trim() : ''

    if (!mobile || mobile.length !== 10) {
      return NextResponse.json({ error: 'Valid 10-digit mobile number is required' }, { status: 400 })
    }

    if (!idToken) {
      return NextResponse.json(
        { error: 'Firebase ID token is required. Please complete the OTP verification.' },
        { status: 400 },
      )
    }

    const { db } = await connectToDatabase()

    // ── Verify the Firebase ID token (or dev token) ──
    let verifiedMobile: string
    try {
      const verifiedUser = await verifyIdToken(idToken)
      verifiedMobile = verifiedUser.mobile
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'OTP verification failed' },
        { status: 401 },
      )
    }

    // ── Security cross-check: the verified phone must match the requested mobile ──
    // This prevents someone from verifying mobile A and registering mobile B.
    if (verifiedMobile !== mobile) {
      return NextResponse.json(
        { error: 'Phone number mismatch. The verified number does not match the requested mobile.' },
        { status: 403 },
      )
    }

    // ── Create / update the OTP session to mark it as verified ──
    // The register endpoint checks `otp_sessions.verified === true` as its gate.
    // We upsert so this works even if check-mobile didn't create a session (e.g.
    // the client called Firebase directly without hitting check-mobile first).
    await db.collection('otp_sessions').updateOne(
      { mobile },
      {
        $set: {
          mobile,
          verified: true,
          verifiedAt: new Date(),
          // Keep a sessionId field for backward compat with any code that reads it.
          // In the Firebase flow there's no 2Factor sessionId, so we store the
          // Firebase UID (or 'dev' in dev mode) for traceability.
          sessionId: idToken.slice(0, 50),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10-min window to complete registration
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
    })
  } catch (error) {
    console.error('[Verify OTP Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify OTP' },
      { status: 500 },
    )
  }
}
