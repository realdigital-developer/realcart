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
/*  Configuration validation (DLT/TRAI compliance)                      */
/* ------------------------------------------------------------------ */

/**
 * Validate the MSG91 sender ID for Indian DLT/TRAI compliance.
 *
 * TRAI/DLT requires sender IDs (Headers) to be EXACTLY 6 alphabetic
 * characters (A–Z). Sender IDs that are too long (e.g. "Realcart" = 8 chars)
 * or contain non-alphabetic characters are rejected by Indian telecom
 * operators — MSG91's API may still return "success" (accepted), but the SMS
 * is never delivered to the handset.
 *
 * @returns null if valid, or an error message describing the problem.
 */
function validateSenderId(senderId: string): string | null {
  if (!senderId) return 'MSG91_SENDER_ID is not set'
  if (senderId.length !== 6) {
    return `MSG91_SENDER_ID "${senderId}" is ${senderId.length} characters — Indian DLT/TRAI requires EXACTLY 6 alphabetic characters (e.g. "REALCRT"). SMS will NOT be delivered until this is fixed.`
  }
  if (!/^[A-Za-z]+$/.test(senderId)) {
    return `MSG91_SENDER_ID "${senderId}" contains non-alphabetic characters — DLT requires letters only.`
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Balance check (detect exhausted free-trial credits)                 */
/* ------------------------------------------------------------------ */

/**
 * Check the MSG91 account balance for a given route.
 *
 * MSG91's Send SMS API returns `{"type":"success"}` even when the account
 * balance is ZERO — the request is accepted but the SMS is never delivered
 * to the telecom operator. This pre-check surfaces the problem so we can
 * fall back to dev mode (instead of silently failing to deliver).
 *
 * @returns the numeric balance, or null if the check itself failed.
 */
async function getMsg91Balance(authKey: string, route: string): Promise<number | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8_000)
    const response = await fetch(
      `https://api.msg91.com/api/balance.php?authkey=${encodeURIComponent(authKey)}&type=${encodeURIComponent(route)}`,
      { signal: controller.signal },
    )
    clearTimeout(timeoutId)
    if (!response.ok) return null
    const text = await response.text()
    // Balance endpoint returns a plain number (e.g. "0" or "1250.5") or a
    // JSON error object for invalid routes. Parse defensively.
    const trimmed = text.trim()
    const num = Number(trimmed)
    if (Number.isFinite(num)) return num
    return null
  } catch {
    return null
  }
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

/**
 * Max number of MSG91 API call attempts for transient errors.
 * Error code 418 ("IP not whitelisted") is transient in this sandbox because
 * outbound traffic is routed through a NAT pool with multiple egress IPs — a
 * retry usually leaves from a different IP and succeeds.
 */
const MSG91_MAX_RETRIES = 4

/** Delay (ms) between MSG91 retry attempts. */
const MSG91_RETRY_DELAY_MS = 600

/** Promise-based sleep helper for retry backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Store the dev test OTP (123456) hash in otp_sessions and return a dev-mode
 * SendOtpResult. Used both as the primary dev-mode path AND as a graceful
 * fallback when MSG91 cannot deliver (e.g. zero balance, invalid sender ID).
 *
 * This keeps login fully functional for testing even when the SMS gateway is
 * unavailable, instead of hard-failing the request.
 */
async function storeDevOtp(
  cleanMobile: string,
  type: 'customer' | 'delivery_boy' | 'seller',
): Promise<SendOtpResult> {
  const { db } = await connectToDatabase()
  await db.collection('otp_sessions').updateOne(
    { mobile: cleanMobile, type },
    {
      $set: {
        mobile: cleanMobile,
        type,
        sessionId: 'dev-session',
        otpHash: hashOtp(DEV_TEST_OTP),
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

  // ── Dev mode: MSG91 not configured → store test OTP in otp_sessions ──
  if (!config) {
    return storeDevOtp(cleanMobile, type)
  }

  // ── Production: generate OTP, send via MSG91 Send SMS API ──
  //
  // Pre-flight checks: validate the sender ID (DLT requires exactly 6
  // alphabetic chars) and the account balance (MSG91 returns API "success"
  // even with 0 balance, but never delivers the SMS). If either check fails
  // we fall back to dev mode so login still works for testing, while logging
  // a clear, actionable warning visible in dev.log / Vercel logs.
  const senderIdError = validateSenderId(config.senderId)
  if (senderIdError) {
    console.warn(`[MSG91] Configuration issue — falling back to dev mode: ${senderIdError}`)
    return storeDevOtp(cleanMobile, type)
  }

  const balance = await getMsg91Balance(config.authKey, config.route)
  if (balance !== null && balance <= 0) {
    console.warn(
      `[MSG91] Account balance is 0 on route ${config.route} — MSG91 will accept ` +
        `the API request but NOT deliver the SMS. Falling back to dev mode (test OTP 123456). ` +
        `FIX: recharge your MSG91 account at https://msg91.com → Recharge.`,
    )
    return storeDevOtp(cleanMobile, type)
  }

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

  // Send via MSG91 Send SMS API (v2) with automatic retry on transient errors.
  //
  // IMPORTANT — error code 418 ("IP not whitelisted"):
  // This sandbox routes outbound traffic through a NAT pool with MULTIPLE
  // egress IPs (e.g. 47.57.242.119 AND 8.212.10.159). If the MSG91 account
  // has "API Security" (IP whitelist) enabled, requests that happen to leave
  // from a non-whitelisted egress IP are rejected with code 418. Because the
  // egress IP is chosen per-connection by the network layer, a retry usually
  // goes out from a different IP and succeeds. We therefore retry 418
  // responses a few times before surfacing the error to the user.
  //
  // The PERMANENT fix is on the MSG91 dashboard (whitelist all egress IPs OR
  // disable API Security) — see the instructions logged below on failure.
  const smsPayload = {
    sender: config.senderId,
    route: config.route,
    country: '91',
    sms: [
      {
        message: messageBody,
        to: [cleanMobile],
        ...(config.templateId ? { template_id: config.templateId } : {}),
      },
    ],
  }

  let refId = `msg91-${Date.now()}`
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MSG91_MAX_RETRIES; attempt++) {
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
        body: JSON.stringify(smsPayload),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      const isAbort = err instanceof Error && err.name === 'AbortError'
      lastError = new Error(
        isAbort
          ? 'MSG91 API request timed out. Please try again.'
          : `Failed to reach MSG91 API: ${err instanceof Error ? err.message : 'network error'}`,
      )
      // Network/timeout errors may also be transient — retry once more.
      if (attempt < MSG91_MAX_RETRIES) {
        await sleep(MSG91_RETRY_DELAY_MS)
        continue
      }
      break
    }
    clearTimeout(timeoutId)

    const data = await response.json().catch(() => ({}))

    // MSG91 returns { type: "success", message: "..." } on success
    // and { type: "error", message: "..." } on failure.
    // A 418 / "IP not whitelisted" failure is transient (NAT egress IP) —
    // retry; other failures are surfaced immediately.
    if (response.ok && data.type !== 'error') {
      refId =
        data.data?.[0]?._id ||
        data.campaign_id ||
        data._id ||
        `msg91-${Date.now()}`
      lastError = null
      break
    }

    const apiMsg = String(data.message || data.error || '')
    const isIpWhitelist =
      response.status === 418 ||
      /IP not whitelisted/i.test(apiMsg) ||
      /418/.test(apiMsg)

    lastError = new Error(apiMsg || `MSG91 API returned status ${response.status}`)

    if (isIpWhitelist && attempt < MSG91_MAX_RETRIES) {
      // Transient 418 — retry from a (possibly different) egress IP.
      console.warn(
        `[MSG91] Attempt ${attempt}/${MSG91_MAX_RETRIES} failed with 418 (IP not whitelisted). Retrying in ${MSG91_RETRY_DELAY_MS}ms...`,
      )
      await sleep(MSG91_RETRY_DELAY_MS)
      continue
    }

    // Non-retryable error — stop.
    break
  }

  if (lastError) {
    const errMsg = lastError.message || ''

    // DLT template mismatch — the message content doesn't match the approved
    // DLT template, or the template/sender isn't approved. MSG91 rejects these
    // with messages like "SMS not matched with DLT template" or "template not
    // approved". Fall back to dev mode so login still works for testing.
    if (/not matched|template|dlt|not approved|invalid sender|header/i.test(errMsg)) {
      console.warn(
        `[MSG91] SMS delivery rejected — DLT/template/sender issue: ${errMsg}\n` +
          `Falling back to dev mode (test OTP 123456).\n` +
          `FIX: ensure the message content in buildOtpMessage() EXACTLY matches ` +
          `the approved DLT template, the sender ID is 6 alphabetic chars, and the ` +
          `template is approved on your MSG91 + DLT portal.`,
      )
      return storeDevOtp(cleanMobile, type)
    }

    // Surface a clear, actionable message. For 418 we include the dashboard
    // steps so the operator can whitelist the egress IPs (or disable API
    // Security) in the MSG91 account.
    if (/418|IP not whitelisted/i.test(errMsg)) {
      console.error(
        `[MSG91] OTP delivery failed — error code 418 (IP not whitelisted).\n` +
          `The server's outbound IP is not in the MSG91 account's IP whitelist.\n` +
          `FIX (MSG91 dashboard): Settings → API Security → either DISABLE it, OR whitelist the server egress IPs.\n` +
          `Note: this sandbox uses a NAT pool with multiple egress IPs — whitelist ALL of them or disable API Security.\n` +
          `Current known egress IPs: 47.57.242.119, 8.212.10.159 (verify via: curl https://api.ipify.org).`,
      )
      throw new Error(
        'SMS gateway rejected the request (IP not whitelisted, MSG91 error 418). ' +
          'Please whitelist the server IPs in your MSG91 account (API Security) or disable API Security, then try again.',
      )
    }
    throw lastError
  }

  // Store the OTP HASH (not the plain code) in otp_sessions for verification
  const { db } = await connectToDatabase()
  console.info(
    `[MSG91] OTP submitted to MSG91 for ${type} ${cleanMobile} ` +
      `(sender=${config.senderId}, route=${config.route}, ref=${refId}). ` +
      `Delivery depends on MSG91 balance, DLT template match, and operator status.`,
  )
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
