/**
 * SMS OTP Module — Server-Side OTP via Twilio Verify (replaces Firebase Phone Auth)
 *
 * Architecture (server-side OTP — simpler than Firebase):
 *   - sendOtp(mobile) → calls Twilio Verify to send a real SMS OTP
 *   - verifyOtp(mobile, otp) → calls Twilio VerificationCheck to verify the OTP
 *   - Twilio generates and verifies the OTP (we never touch the code)
 *
 * Dev-mode fallback (free tier / no Twilio creds):
 *   If Twilio credentials are NOT configured, the module enters "dev mode".
 *   In dev mode, sendOtp() stores a test OTP (123456) in MongoDB's otp_sessions
 *   collection, and verifyOtp() checks against it. This keeps the app fully
 *   functional in the sandbox without any SMS provider.
 *
 * Free tier: Twilio offers a free trial with $15 credit (≈ hundreds of OTP SMS).
 *   Sign up at https://www.twilio.com/ — no credit card needed for trial.
 *   After the trial, pay-as-you-go (~$0.05–$0.10 per SMS).
 *
 * Server-side only. Never import from client components.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { getBrandSettings, DEFAULT_BRAND_NAME } from '@/lib/brand-settings'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface SendOtpResult {
  /** Whether the OTP was sent successfully. */
  success: boolean
  /** Twilio verification SID (or 'dev-session' in dev mode). */
  sid: string
  /** Status: 'pending' (sent, awaiting verification) or 'cancelled'. */
  status: string
}

export interface VerifyOtpResult {
  /** Whether the OTP was correct. */
  valid: boolean
  /** Status: 'approved' (valid) or 'pending' (invalid). */
  status: string
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve Twilio credentials from environment variables.
 * Returns null if any required value is missing → triggers dev mode.
 */
function getTwilioConfig(): {
  accountSid: string
  authToken: string
  verifyServiceSid: string
} | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID

  if (!accountSid || !authToken || !verifyServiceSid) {
    return null
  }
  return { accountSid, authToken, verifyServiceSid }
}

/** Whether Twilio is properly configured (false = dev mode). */
export function isSmsConfigured(): boolean {
  return getTwilioConfig() !== null
}

/* ------------------------------------------------------------------ */
/*  Dev-mode constants                                                  */
/* ------------------------------------------------------------------ */

/** Test OTP used in dev mode (no Twilio configured). */
const DEV_TEST_OTP = '123456'

/** OTP session TTL: 5 minutes. */
const OTP_TTL_MS = 5 * 60 * 1000

/* ------------------------------------------------------------------ */
/*  Phone formatting                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convert a 10-digit Indian mobile to E.164 format for Twilio.
 * "9876543210" → "+919876543210"
 */
function toE164(mobile: string): string {
  const clean = mobile.replace(/\D/g, '').slice(-10)
  return `+91${clean}`
}

/* ------------------------------------------------------------------ */
/*  Professional OTP Message Template                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a professional, branded OTP SMS message.
 *
 * Twilio Verify supports a `ChannelConfiguration` parameter with a
 * `customMessage` field. The `{{otp}}` placeholder is replaced by Twilio
 * with the actual OTP code at send time (we never see the code).
 *
 * Message formats (exactly as specified):
 *
 *   Customer:
 *     "Welcome! {{otp}} is your login OTP for RealCart Account.
 *      Valid for 5 minutes. Please do not share this code with anyone."
 *
 *   Seller:
 *     "Welcome! {{otp}} is your login OTP for RealCart Seller Account.
 *      Valid for 5 minutes. Please do not share this code with anyone."
 *
 *   Delivery Partner:
 *     "Welcome! {{otp}} is your login OTP for RealCart Delivery Partner account.
 *      Valid for 5 minutes. Please do not share this code with anyone."
 *
 * @param brandName - The platform brand name (e.g. "RealCart")
 * @param type - The user type (customer / delivery_boy / seller)
 * @returns The SMS message string with {{otp}} placeholder
 */
function buildOtpMessage(brandName: string, type: 'customer' | 'delivery_boy' | 'seller'): string {
  // Account label per user type — matches the exact formats requested.
  const accountLabel =
    type === 'customer'
      ? 'Account'
      : type === 'delivery_boy'
        ? 'Delivery Partner account'
        : 'Seller Account'

  return (
    `Welcome! {{otp}} is your login OTP for ${brandName} ${accountLabel}. ` +
    `Valid for 5 minutes. Please do not share this code with anyone.`
  )
}

/* ------------------------------------------------------------------ */
/*  sendOtp — send an OTP via Twilio Verify (or store dev OTP)          */
/* ------------------------------------------------------------------ */

/**
 * Send an OTP to the given mobile number.
 *
 * Production (Twilio configured): calls Twilio Verify to send a real SMS.
 * Dev mode (no Twilio): stores the test OTP (123456) in otp_sessions.
 *
 * @param mobile - 10-digit Indian mobile number
 * @param type - 'customer' | 'delivery_boy' | 'seller' (for otp_sessions scoping)
 * @returns SendOtpResult with success flag + sid
 */
export async function sendOtp(
  mobile: string,
  type: 'customer' | 'delivery_boy' | 'seller' = 'customer',
): Promise<SendOtpResult> {
  const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
  if (cleanMobile.length !== 10) {
    throw new Error('Invalid mobile number. Must be 10 digits.')
  }

  const config = getTwilioConfig()

  // ── Dev mode: store test OTP in otp_sessions ──
  if (!config) {
    const { db } = await connectToDatabase()
    await db.collection('otp_sessions').updateOne(
      { mobile: cleanMobile, type },
      {
        $set: {
          mobile: cleanMobile,
          type,
          sessionId: 'dev-session',
          otpCode: DEV_TEST_OTP, // stored in dev mode only (production never stores the code)
          verified: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      },
      { upsert: true },
    )
    return { success: true, sid: 'dev-session', status: 'pending' }
  }

  // ── Production: call Twilio Verify ──
  const phone = toE164(cleanMobile)
  const url = `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}/Verifications`
  const authHeader = 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')

  // Fetch the brand name from DB (falls back to "RealCart" if unset)
  let brandName = DEFAULT_BRAND_NAME
  try {
    const { db } = await connectToDatabase()
    const brand = await getBrandSettings(db)
    brandName = brand.platformName || DEFAULT_BRAND_NAME
  } catch {
    // DB unavailable — use default brand name
  }

  // Build the professional branded OTP message with {{otp}} placeholder.
  // Twilio replaces {{otp}} with the actual OTP code at send time.
  const customMessage = buildOtpMessage(brandName, type)

  // ChannelConfiguration must be a JSON-encoded string per Twilio Verify API.
  const channelConfig = JSON.stringify({ customMessage })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: phone,
      Channel: 'sms',
      ChannelConfiguration: channelConfig,
    }),
  })

  const data = await response.json()

  if (!response.ok || data.status === 'failed') {
    const msg = data.message || data.error_message || 'Failed to send OTP via SMS'
    throw new Error(msg)
  }

  // Store the verification SID in otp_sessions (for traceability + rate-limiting)
  const { db } = await connectToDatabase()
  await db.collection('otp_sessions').updateOne(
    { mobile: cleanMobile, type },
    {
      $set: {
        mobile: cleanMobile,
        type,
        sessionId: data.sid, // Twilio verification SID
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    },
    { upsert: true },
  )

  return { success: true, sid: data.sid, status: data.status || 'pending' }
}

/* ------------------------------------------------------------------ */
/*  verifyOtp — verify an OTP via Twilio Verify (or check dev OTP)      */
/* ------------------------------------------------------------------ */

/**
 * Verify an OTP entered by the user.
 *
 * Production (Twilio configured): calls Twilio VerificationCheck.
 * Dev mode (no Twilio): checks the stored test OTP (123456) in otp_sessions.
 *
 * @param mobile - 10-digit Indian mobile number
 * @param otp - 4–6 digit OTP entered by the user
 * @param type - 'customer' | 'delivery_boy' | 'seller' (for otp_sessions scoping)
 * @returns VerifyOtpResult with valid flag + status
 */
export async function verifyOtp(
  mobile: string,
  otp: string,
  type: 'customer' | 'delivery_boy' | 'seller' = 'customer',
): Promise<VerifyOtpResult> {
  const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
  const cleanOtp = otp.replace(/\D/g, '')

  if (cleanMobile.length !== 10) {
    throw new Error('Invalid mobile number. Must be 10 digits.')
  }
  if (!cleanOtp || cleanOtp.length < 4 || cleanOtp.length > 6) {
    throw new Error('Invalid OTP. Must be 4–6 digits.')
  }

  const { db } = await connectToDatabase()

  // Look up the OTP session (must be non-expired)
  const session = await db.collection('otp_sessions').findOne({
    mobile: cleanMobile,
    type,
    expiresAt: { $gt: new Date() },
  })

  if (!session) {
    throw new Error('OTP session expired. Please request a new OTP.')
  }

  const config = getTwilioConfig()

  // ── Dev mode: check stored test OTP ──
  if (!config) {
    const isValid = cleanOtp === DEV_TEST_OTP
    if (isValid) {
      await db.collection('otp_sessions').updateOne(
        { _id: session._id },
        { $set: { verified: true, verifiedAt: new Date() } },
      )
    }
    return { valid: isValid, status: isValid ? 'approved' : 'pending' }
  }

  // ── Production: call Twilio VerificationCheck ──
  const phone = toE164(cleanMobile)
  const url = `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}/VerificationCheck`
  const authHeader = 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: phone,
      Code: cleanOtp,
    }),
  })

  const data = await response.json()

  // Twilio returns status: 'approved' for valid, 'pending' for invalid
  const isValid = data.status === 'approved'

  if (isValid) {
    await db.collection('otp_sessions').updateOne(
      { _id: session._id },
      { $set: { verified: true, verifiedAt: new Date() } },
    )
  }

  // If Twilio returns a specific error, surface it
  if (!response.ok && !isValid) {
    // Common errors: 'invalid param', 'max check attempts reached', etc.
    if (data.code === 60202) {
      throw new Error('Too many incorrect attempts. Please request a new OTP.')
    }
  }

  return { valid: isValid, status: data.status || 'pending' }
}

/* ------------------------------------------------------------------ */
/*  Helper: check if an OTP session is verified (for register routes)   */
/* ------------------------------------------------------------------ */

/**
 * Check if a mobile number has a verified OTP session.
 * Used by register routes as the registration gate.
 */
export async function isOtpVerified(
  mobile: string,
  type: 'customer' | 'delivery_boy' | 'seller',
): Promise<boolean> {
  const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
  const { db } = await connectToDatabase()
  const session = await db.collection('otp_sessions').findOne({
    mobile: cleanMobile,
    type,
    verified: true,
    expiresAt: { $gt: new Date() },
  })
  return !!session
}

/**
 * Delete the OTP session for a mobile number (cleanup after registration).
 */
export async function clearOtpSession(
  mobile: string,
  type: 'customer' | 'delivery_boy' | 'seller',
): Promise<void> {
  const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
  try {
    const { db } = await connectToDatabase()
    await db.collection('otp_sessions').deleteOne({ mobile: cleanMobile, type })
  } catch {
    // Non-fatal
  }
}
