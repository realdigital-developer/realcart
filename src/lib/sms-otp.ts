/**
 * SMS OTP Module — Server-Side OTP via MSG91 Send SMS API
 *
 * Architecture:
 *   - sendOtp(mobile) → generates a 6-digit OTP, builds a fully custom branded
 *     SMS message, sends it via MSG91's Send SMS API, stores the OTP hash in
 *     MongoDB's otp_sessions collection.
 *   - verifyOtp(mobile, otp) → compares the entered OTP against the stored
 *     hashed OTP. On success, marks otp_sessions.verified = true.
 *
 * Why MSG91 Send SMS API (not MSG91's OTP API)?
 *   We generate and verify the OTP ourselves (stored as a SHA-256 hash in
 *   MongoDB) so we never trust an external gateway with verification state.
 *   The Send SMS API gives us 100% control over the message body — the OTP
 *   code is embedded directly in our custom branded template. This keeps the
 *   existing otp_sessions collection and verifyOtp() logic fully intact.
 *
 * Dev-mode fallback (free tier / no MSG91 creds):
 *   If MSG91 credentials are NOT configured, the module enters "dev mode".
 *   In dev mode, sendOtp() stores the test OTP (123456) in MongoDB's otp_sessions
 *   collection, and verifyOtp() checks against it. No SMS is sent.
 *
 * MSG91 free account setup:
 *   1. Sign up at https://msg91.com (free tier includes trial credits)
 *   2. Copy your AUTH_KEY from the dashboard (top-right → API)
 *   3. Register a 6-character Sender ID (e.g. "REALCRT") — needs approval
 *   4. For Indian numbers (DLT/TRAI compliance): register an SMS template
 *      and set MSG91_TEMPLATE_ID. The template variable for the OTP must
 *      match the position of the code in buildOtpMessage() below.
 *   5. Set these env vars in .env:
 *        MSG91_AUTH_KEY=your-auth-key
 *        MSG91_SENDER_ID=REALCRT
 *        MSG91_TEMPLATE_ID=your-dlt-template-id   (optional but recommended)
 *        MSG91_ROUTE=4                            (optional, default 4 = transactional)
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
  /** MSG91 campaign/message reference (or 'dev-session' in dev mode). */
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
 * Resolve MSG91 credentials from environment variables.
 * Returns null if any required value is missing → triggers dev mode.
 *
 * Required env vars:
 *   MSG91_AUTH_KEY     — Authentication key from MSG91 dashboard
 *   MSG91_SENDER_ID    — 6-character approved sender ID (e.g. "REALCRT")
 *
 * Optional env vars:
 *   MSG91_ROUTE        — Route number (default "4" = transactional)
 *   MSG91_TEMPLATE_ID  — DLT template ID (required for Indian DLT compliance)
 */
function getMsg91Config(): {
  authKey: string
  senderId: string
  route: string
  templateId?: string
} | null {
  const authKey = process.env.MSG91_AUTH_KEY
  const senderId = process.env.MSG91_SENDER_ID

  if (!authKey || !senderId) {
    return null
  }
  return {
    authKey,
    senderId,
    route: process.env.MSG91_ROUTE || '4',
    templateId: process.env.MSG91_TEMPLATE_ID || undefined,
  }
}

/** Whether MSG91 is properly configured (false = dev mode). */
export function isSmsConfigured(): boolean {
  return getMsg91Config() !== null
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Test OTP used in dev mode (no MSG91 configured). */
const DEV_TEST_OTP = '123456'

/** OTP session TTL: 5 minutes. */
const OTP_TTL_MS = 5 * 60 * 1000

/** Max OTP verification attempts before the session is invalidated. */
const MAX_OTP_ATTEMPTS = 5

/** Timeout for the MSG91 API HTTP call (milliseconds). */
const MSG91_API_TIMEOUT_MS = 15_000

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
/*  sendOtp — send an OTP via MSG91 Send SMS API (or store dev OTP)      */
/* ------------------------------------------------------------------ */

/**
 * Send an OTP to the given mobile number.
 *
 * Production (MSG91 configured): generates a 6-digit OTP, builds a custom
 * branded SMS message, sends it via MSG91's Send SMS API, stores the OTP
 * hash in otp_sessions.
 *
 * Dev mode (no MSG91): stores the test OTP (123456) hash in otp_sessions.
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

  const config = getMsg91Config()

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

  // ── Production: generate OTP, send via MSG91 Send SMS API ──
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

  // Send via MSG91 Send SMS API (v2)
  // MSG91 expects: country="91" + to=["<10-digit mobile>"]
  const smsEntry: { message: string; to: string[]; template_id?: string } = {
    message: messageBody,
    to: [cleanMobile],
  }
  if (config.templateId) {
    smsEntry.template_id = config.templateId
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MSG91_API_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: {
        authkey: config.authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: config.senderId,
        route: config.route,
        country: '91',
        sms: [smsEntry],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('MSG91 API request timed out. Please try again.')
    }
    throw new Error(
      `Failed to reach MSG91 API: ${err instanceof Error ? err.message : 'network error'}`,
    )
  }
  clearTimeout(timeoutId)

  const data = await response.json().catch(() => ({}))

  // MSG91 returns { type: "success", message: "..." } on success
  // and { type: "error", message: "..." } on failure
  if (!response.ok || data.type === 'error') {
    const msg =
      data.message ||
      data.error ||
      `MSG91 API returned status ${response.status}` ||
      'Failed to send OTP via SMS'
    throw new Error(msg)
  }

  // Derive a reference id for the session (MSG91 may return a campaign id)
  const refId =
    data.data?.[0]?._id ||
    data.campaign_id ||
    data._id ||
    `msg91-${Date.now()}`

  // Store the OTP HASH (not the plain code) in otp_sessions for verification
  const { db } = await connectToDatabase()
  await db.collection('otp_sessions').updateOne(
    { mobile: cleanMobile, type },
    {
      $set: {
        mobile: cleanMobile,
        type,
        sessionId: refId, // MSG91 campaign/message reference
        otpHash: hashOtp(otpCode), // store the HASH, not the plain code
        attempts: 0,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    },
    { upsert: true },
  )

  return { success: true, sid: refId, status: 'pending' }
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
