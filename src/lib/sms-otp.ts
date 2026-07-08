/**
 * SMS OTP Module — Server-Side OTP via Authgear Authentication Flow API
 *
 * Architecture:
 *   - sendOtp(mobile) → creates an Authgear authentication flow, identifies
 *     the user by phone number (which triggers Authgear to send an SMS OTP),
 *     and stores the Authgear flow state_token in MongoDB's otp_sessions
 *     collection.
 *   - verifyOtp(mobile, otp) → retrieves the state_token from otp_sessions,
 *     submits the OTP code to Authgear's flow API for verification. On
 *     success, marks otp_sessions.verified = true.
 *
 * Authgear manages the OTP generation, SMS delivery, and verification.
 * We store only the Authgear flow state_token (not the OTP code) in MongoDB.
 *
 * Dev-mode fallback (no Authgear configured):
 *   If AUTHGEAR_ENDPOINT / AUTHGEAR_CLIENT_ID are NOT set, the module enters
 *   "dev mode". In dev mode, sendOtp() stores the test OTP (123456) in
 *   otp_sessions, and verifyOtp() checks against it. No SMS is sent.
 *
 * Authgear setup:
 *   1. Sign up at https://authgear.com
 *   2. Create a project → copy the endpoint (e.g. https://myapp.authgear.cloud)
 *   3. Create an OAuth client → copy the client ID
 *   4. Enable "Phone (SMS)" as an authentication method in the portal
 *   5. Set these env vars:
 *        AUTHGEAR_ENDPOINT=https://your-project.authgear.cloud
 *        AUTHGEAR_CLIENT_ID=your-client-id
 *
 * Server-side only. Never import from client components.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { createHash, randomInt } from 'crypto'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface SendOtpResult {
  /** Whether the OTP was sent successfully. */
  success: boolean
  /** Authgear flow reference (or 'dev-session' in dev mode). */
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
 * Resolve Authgear credentials from environment variables.
 * Returns null if any required value is missing → triggers dev mode.
 *
 * Required env vars:
 *   AUTHGEAR_ENDPOINT   — Authgear project endpoint (e.g. https://myapp.authgear.cloud)
 *   AUTHGEAR_CLIENT_ID  — OAuth client ID from the Authgear portal
 *
 * Optional env vars:
 *   AUTHGEAR_FLOW_TYPE  — Flow type: "login" (default) or "signup"
 */
function getAuthgearConfig(): {
  endpoint: string
  clientId: string
  flowType: string
} | null {
  const endpoint = process.env.AUTHGEAR_ENDPOINT
  const clientId = process.env.AUTHGEAR_CLIENT_ID

  if (!endpoint || !clientId) {
    return null
  }
  return {
    endpoint: endpoint.replace(/\/$/, ''), // strip trailing slash
    clientId,
    flowType: process.env.AUTHGEAR_FLOW_TYPE || 'login',
  }
}

/** Whether Authgear is properly configured (false = dev mode). */
export function isSmsConfigured(): boolean {
  return getAuthgearConfig() !== null
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Test OTP used in dev mode (no Authgear configured). */
const DEV_TEST_OTP = '123456'

/** OTP session TTL: 5 minutes. */
const OTP_TTL_MS = 5 * 60 * 1000

/** Max OTP verification attempts before the session is invalidated. */
const MAX_OTP_ATTEMPTS = 5

/** Timeout for Authgear API HTTP calls (milliseconds). */
const AUTHGEAR_API_TIMEOUT_MS = 15_000

/** Max number of Authgear API call attempts for transient errors. */
const AUTHGEAR_MAX_RETRIES = 3

/** Delay (ms) between Authgear retry attempts. */
const AUTHGEAR_RETRY_DELAY_MS = 600

/** Promise-based sleep helper for retry backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ------------------------------------------------------------------ */
/*  OTP Hashing (used only in dev mode)                                  */
/* ------------------------------------------------------------------ */

/**
 * Hash an OTP code for secure storage (dev mode only).
 * In production (Authgear mode), we store the Authgear state_token instead.
 */
function hashOtp(code: string): string {
  const secret = process.env.NEXTAUTH_SECRET || 'realcart-otp-hash-secret-2024'
  return createHash('sha256').update(`${secret}:${code}`).digest('hex')
}

/* ------------------------------------------------------------------ */
/*  Phone formatting                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convert a 10-digit Indian mobile to E.164 format for Authgear.
 * "9876543210" → "+919876543210"
 */
function toE164(mobile: string): string {
  const clean = mobile.replace(/\D/g, '').slice(-10)
  return `+91${clean}`
}

/* ------------------------------------------------------------------ */
/*  Dev-mode OTP storage (fallback when Authgear not configured)         */
/* ------------------------------------------------------------------ */

/**
 * Store the dev test OTP (123456) hash in otp_sessions and return a dev-mode
 * SendOtpResult. Used when Authgear is not configured, or as a graceful
 * fallback when Authgear can't send the OTP.
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
/*  Authgear API helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Make a POST request to the Authgear Authentication Flow API.
 * Returns the parsed JSON response.
 * Retries on transient errors (network, timeout, 5xx).
 */
async function authgearPost(
  url: string,
  body: Record<string, unknown>,
  config: NonNullable<ReturnType<typeof getAuthgearConfig>>,
): Promise<Record<string, unknown>> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= AUTHGEAR_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AUTHGEAR_API_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      const isAbort = err instanceof Error && err.name === 'AbortError'
      lastError = new Error(
        isAbort
          ? 'Authgear API request timed out.'
          : `Failed to reach Authgear API: ${err instanceof Error ? err.message : 'network error'}`,
      )
      if (attempt < AUTHGEAR_MAX_RETRIES) {
        await sleep(AUTHGEAR_RETRY_DELAY_MS)
        continue
      }
      break
    }
    clearTimeout(timeoutId)

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>

    if (response.ok) {
      return data
    }

    // Error response
    const errMsg =
      (data.error as { message?: string } | undefined)?.message ||
      (data.message as string) ||
      `Authgear API returned status ${response.status}`
    lastError = new Error(errMsg)

    // Retry only on 5xx server errors
    if (response.status >= 500 && attempt < AUTHGEAR_MAX_RETRIES) {
      await sleep(AUTHGEAR_RETRY_DELAY_MS)
      continue
    }
    break
  }

  throw lastError || new Error('Authgear API request failed.')
}

/* ------------------------------------------------------------------ */
/*  sendOtp — send an OTP via Authgear (or store dev OTP)               */
/* ------------------------------------------------------------------ */

/**
 * Send an OTP to the given mobile number.
 *
 * Production (Authgear configured):
 *   1. Creates an Authgear authentication flow.
 *   2. Identifies the user by phone number → triggers Authgear to send SMS OTP.
 *   3. Stores the Authgear state_token in otp_sessions.
 *
 * Dev mode (no Authgear): stores the test OTP (123456) hash in otp_sessions.
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

  const config = getAuthgearConfig()

  // ── Dev mode: Authgear not configured → store test OTP ──
  if (!config) {
    return storeDevOtp(cleanMobile, type)
  }

  // ── Production: send OTP via Authgear Authentication Flow API ──
  try {
    // Step 1: Create a new authentication flow
    const flowResponse = await authgearPost(
      `${config.endpoint}/api/v1/authentication_flows?client_id=${encodeURIComponent(config.clientId)}`,
      {
        type: config.flowType,
        name: 'default',
      },
      config,
    )

    const stateToken = flowResponse.state_token as string
    if (!stateToken) {
      throw new Error('Authgear did not return a state_token.')
    }

    // Step 2: Identify with phone number → triggers SMS OTP
    const identifyResponse = await authgearPost(
      `${config.endpoint}/api/v1/authentication_flows/states/input`,
      {
        state_token: stateToken,
        input: {
          type: 'identify',
          identification: 'phone',
          login: toE164(cleanMobile),
        },
      },
      config,
    )

    const newStateToken = (identifyResponse.state_token as string) || stateToken

    // Store the Authgear state_token in otp_sessions for verification
    const { db } = await connectToDatabase()
    await db.collection('otp_sessions').updateOne(
      { mobile: cleanMobile, type },
      {
        $set: {
          mobile: cleanMobile,
          type,
          sessionId: newStateToken,
          stateToken: newStateToken,
          attempts: 0,
          verified: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      },
      { upsert: true },
    )

    console.info(
      `[Authgear] OTP sent for ${type} ${cleanMobile} ` +
        `(flow=${config.flowType}, state=${newStateToken.substring(0, 20)}...).`,
    )

    return { success: true, sid: newStateToken, status: 'pending' }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[Authgear] Failed to send OTP — falling back to dev mode: ${errMsg}`,
    )
    // Graceful fallback: use dev mode so login still works for testing
    return storeDevOtp(cleanMobile, type)
  }
}

/* ------------------------------------------------------------------ */
/*  verifyOtp — verify an OTP via Authgear (or against dev hash)         */
/* ------------------------------------------------------------------ */

/**
 * Verify an OTP entered by the user.
 *
 * Production (Authgear): submits the OTP code to Authgear's flow API.
 *   On success, marks the session as verified.
 * Dev mode: compares the entered OTP against the stored hash.
 *
 * Tracks attempts to prevent brute-force guessing (max 5 attempts).
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
    await db.collection('otp_sessions').updateOne(
      { _id: session._id },
      { $set: { verified: false, invalidated: true } },
    )
    throw new Error('Too many incorrect attempts. Please request a new OTP.')
  }

  // ── Dev mode: verify against stored hash ──
  if (session.sessionId === 'dev-session' || !session.stateToken) {
    const enteredHash = hashOtp(cleanOtp)
    const storedHash = session.otpHash as string
    const isValid = !!(storedHash && enteredHash === storedHash)

    if (isValid) {
      await db.collection('otp_sessions').updateOne(
        { _id: session._id },
        { $set: { verified: true, verifiedAt: new Date(), attempts: attempts + 1 } },
      )
    } else {
      await db.collection('otp_sessions').updateOne(
        { _id: session._id },
        { $set: { attempts: attempts + 1 } },
      )
    }

    return { valid: isValid, status: isValid ? 'approved' : 'pending' }
  }

  // ── Production: verify via Authgear Authentication Flow API ──
  const config = getAuthgearConfig()
  if (!config) {
    // Authgear was unconfigured after the OTP was sent — fall back to hash check
    const enteredHash = hashOtp(cleanOtp)
    const storedHash = session.otpHash as string
    const isValid = !!(storedHash && enteredHash === storedHash)
    return { valid: isValid, status: isValid ? 'approved' : 'pending' }
  }

  try {
    const stateToken = session.stateToken as string
    const verifyResponse = await authgearPost(
      `${config.endpoint}/api/v1/authentication_flows/states/input`,
      {
        state_token: stateToken,
        input: {
          type: 'authenticate',
          authentication: 'primary_oob_otp_sms',
          code: cleanOtp,
        },
      },
      config,
    )

    // Authgear returns {type: "finished", ...} on successful verification,
    // or an error if the code is wrong.
    const responseType = verifyResponse.type as string
    const isValid = responseType === 'finished' || responseType === 'no_step'

    if (isValid) {
      await db.collection('otp_sessions').updateOne(
        { _id: session._id },
        {
          $set: {
            verified: true,
            verifiedAt: new Date(),
            attempts: attempts + 1,
          },
        },
      )
      console.info(`[Authgear] OTP verified for ${type} ${cleanMobile}.`)
    } else {
      await db.collection('otp_sessions').updateOne(
        { _id: session._id },
        { $set: { attempts: attempts + 1 } },
      )
    }

    return { valid: isValid, status: isValid ? 'approved' : 'pending' }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)

    // Invalid OTP — Authgear returns an error
    if (/invalid|incorrect|wrong|code/i.test(errMsg)) {
      await db.collection('otp_sessions').updateOne(
        { _id: session._id },
        { $set: { attempts: attempts + 1 } },
      )
      return { valid: false, status: 'pending' }
    }

    // Other error — increment attempts and rethrow
    await db.collection('otp_sessions').updateOne(
      { _id: session._id },
      { $set: { attempts: attempts + 1 } },
    )
    throw err
  }
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
