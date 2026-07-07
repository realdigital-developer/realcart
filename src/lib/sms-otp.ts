/**
 * SMS OTP Module — Server-Side OTP via Twilio Programmable SMS API
 *
 * Architecture:
 *   - sendOtp(mobile) → generates a 6-digit OTP, builds a fully custom branded
 *     SMS message, sends it via Twilio's Messages API, stores the OTP hash in
 *     MongoDB's otp_sessions collection.
 *   - verifyOtp(mobile, otp) → compares the entered OTP against the stored
 *     hashed OTP. On success, marks otp_sessions.verified = true.
 *
 * Why Programmable SMS (not Twilio Verify)?
 *   Twilio Verify uses its own OTP template ("Your <code> verification code is:
 *   <otp>") and the customMessage parameter only works with specific service
 *   configurations. With Programmable SMS, we have 100% control over the
 *   message body — the OTP code is embedded directly in our custom template.
 *
 * Dev-mode fallback (free tier / no Twilio creds):
 *   If Twilio credentials are NOT configured, the module enters "dev mode".
 *   In dev mode, sendOtp() stores the test OTP (123456) in MongoDB's otp_sessions
 *   collection, and verifyOtp() checks against it. No SMS is sent.
 *
 * Free tier: Twilio offers a free trial with $15 credit (≈ hundreds of OTP SMS).
 *   Sign up at https://www.twilio.com/ — no credit card needed for trial.
 *   After the trial, pay-as-you-go (~$0.05–$0.10 per SMS).
 *
 * Server-side only. Never import from client components.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { getBrandSettings, DEFAULT_BRAND_NAME } from '@/lib/brand-settings'
import { createHash, randomInt } from 'crypto'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface SendOtpResult {
  /** Whether the OTP was sent successfully. */
  success: boolean
  /** Twilio message SID (or 'dev-session' in dev mode). */
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
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID      — Account SID (starts with AC)
 *   TWILIO_AUTH_TOKEN       — Auth token
 *   TWILIO_PHONE_NUMBER     — The Twilio phone number to send FROM (E.164, e.g. +1234567890)
 *                             OR a Messaging Service SID (starts with MG)
 */
function getTwilioConfig(): {
  accountSid: string
  authToken: string
  fromNumber: string
} | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER // phone number OR messaging service SID

  if (!accountSid || !authToken || !fromNumber) {
    return null
  }
  return { accountSid, authToken, fromNumber }
}

/** Whether Twilio is properly configured (false = dev mode). */
export function isSmsConfigured(): boolean {
  return getTwilioConfig() !== null
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Test OTP used in dev mode (no Twilio configured). */
const DEV_TEST_OTP = '123456'

/** OTP session TTL: 5 minutes. */
const OTP_TTL_MS = 5 * 60 * 1000

/** Max OTP verification attempts before the session is invalidated. */
const MAX_OTP_ATTEMPTS = 5

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
/*  OTP Generation & Hashing                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate a cryptographically random 6-digit OTP code.
 * Uses Node's crypto.randomInt for security (not Math.random).
 */
function generateOtpCode(): string {
  return String(randomInt(100000, 999999))
}

/**
 * Hash an OTP code for secure storage.
 * We store the hash (not the plain code) so that even if the database is
 * compromised, the OTP codes cannot be reused. Uses SHA-256 with the
 * NEXTAUTH_SECRET as a salt.
 */
function hashOtp(code: string): string {
  const secret = process.env.NEXTAUTH_SECRET || 'realcart-otp-hash-secret-2024'
  return createHash('sha256').update(`${secret}:${code}`).digest('hex')
}

/* ------------------------------------------------------------------ */
/*  Professional OTP Message Template                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a professional, branded OTP SMS message with the actual code embedded.
 *
 * Message formats (exactly as specified):
 *
 *   Customer:
 *     "Welcome! 317229 is your login OTP for RealCart Account.
 *      Valid for 5 minutes. Please do not share this code with anyone."
 *
 *   Seller:
 *     "Welcome! 482915 is your login OTP for RealCart Seller Account.
 *      Valid for 5 minutes. Please do not share this code with anyone."
 *
 *   Delivery Partner:
 *     "Welcome! 730618 is your login OTP for RealCart Delivery Partner account.
 *      Valid for 5 minutes. Please do not share this code with anyone."
 *
 * @param brandName - The platform brand name (e.g. "RealCart")
 * @param code - The actual 6-digit OTP code (e.g. "317229")
 * @param type - The user type (customer / delivery_boy / seller)
 * @returns The complete SMS message string
 */
function buildOtpMessage(
  brandName: string,
  code: string,
  type: 'customer' | 'delivery_boy' | 'seller',
): string {
  // Account label per user type — matches the exact formats requested.
  const accountLabel =
    type === 'customer'
      ? 'Account'
      : type === 'delivery_boy'
        ? 'Delivery Partner account'
        : 'Seller Account'

  return (
    `Welcome! ${code} is your login OTP for ${brandName} ${accountLabel}. ` +
    `Valid for 5 minutes. Please do not share this code with anyone.`
  )
}

/* ------------------------------------------------------------------ */
/*  sendOtp — send an OTP via Twilio Programmable SMS (or store dev OTP) */
/* ------------------------------------------------------------------ */

/**
 * Send an OTP to the given mobile number.
 *
 * Production (Twilio configured): generates a 6-digit OTP, builds a custom
 * branded SMS message, sends it via Twilio's Messages API, stores the OTP
 * hash in otp_sessions.
 *
 * Dev mode (no Twilio): stores the test OTP (123456) hash in otp_sessions.
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
          otpHash: hashOtp(DEV_TEST_OTP), // hashed test OTP for dev mode
          attempts: 0,
          verified: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      },
      { upsert: true },
    )
    return { success: true, sid: 'dev-session', status: 'pending' }
  }

  // ── Production: generate OTP, send via Twilio Messages API ──
  const otpCode = generateOtpCode()

  // Fetch the brand name from DB (falls back to "RealCart" if unset)
  let brandName = DEFAULT_BRAND_NAME
  try {
    const { db } = await connectToDatabase()
    const brand = await getBrandSettings(db)
    brandName = brand.platformName || DEFAULT_BRAND_NAME
  } catch {
    // DB unavailable — use default brand name
  }

  // Build the professional branded OTP message with the actual code
  const messageBody = buildOtpMessage(brandName, otpCode, type)

  // Send via Twilio Messages API (Programmable SMS)
  const phone = toE164(cleanMobile)
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`
  const authHeader = 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: phone,
      From: config.fromNumber,
      Body: messageBody,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    const msg = data.message || data.error_message || 'Failed to send OTP via SMS'
    throw new Error(msg)
  }

  // Store the OTP HASH (not the plain code) in otp_sessions for verification
  const { db } = await connectToDatabase()
  await db.collection('otp_sessions').updateOne(
    { mobile: cleanMobile, type },
    {
      $set: {
        mobile: cleanMobile,
        type,
        sessionId: data.sid, // Twilio message SID
        otpHash: hashOtp(otpCode), // store the HASH, not the plain code
        attempts: 0,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    },
    { upsert: true },
  )

  return { success: true, sid: data.sid, status: 'pending' }
}

/* ------------------------------------------------------------------ */
/*  verifyOtp — verify an OTP against the stored hash                   */
/* ------------------------------------------------------------------ */

/**
 * Verify an OTP entered by the user.
 *
 * Compares the entered OTP against the stored hash in otp_sessions.
 * On success, marks the session as verified. Tracks attempts to prevent
 * brute-force guessing (max 5 attempts, then the session is invalidated).
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

  // Check max attempts (prevent brute-force)
  const attempts = (session.attempts as number) || 0
  if (attempts >= MAX_OTP_ATTEMPTS) {
    // Invalidate the session
    await db.collection('otp_sessions').updateOne(
      { _id: session._id },
      { $set: { verified: false, invalidated: true } },
    )
    throw new Error('Too many incorrect attempts. Please request a new OTP.')
  }

  // Compare the entered OTP against the stored hash
  const enteredHash = hashOtp(cleanOtp)
  const storedHash = session.otpHash as string
  const isValid = !!(storedHash && enteredHash === storedHash)

  if (isValid) {
    // Mark as verified + reset attempts
    await db.collection('otp_sessions').updateOne(
      { _id: session._id },
      { $set: { verified: true, verifiedAt: new Date(), attempts: attempts + 1 } },
    )
  } else {
    // Increment attempts
    await db.collection('otp_sessions').updateOne(
      { _id: session._id },
      { $set: { attempts: attempts + 1 } },
    )
  }

  return { valid: isValid, status: isValid ? 'approved' : 'pending' }
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
