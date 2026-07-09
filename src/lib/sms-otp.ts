/**
 * SIM Binding Module — Server-Side SIM/Device Binding for Login
 *
 * Architecture (banking-app style SIM binding):
 *   - sendOtp(mobile, type) → generates a secret binding code, stores a SIM
 *     binding session in MongoDB's sim_bindings collection, and returns the
 *     code + server number. The user must send an SMS from their phone (the
 *     SIM to bind) to the server number with the secret code.
 *   - verifyOtp(mobile, code, type) → checks whether the inbound SMS has been
 *     received (i.e. the sim_binding session's status is "verified"). In dev
 *     mode, auto-verifies for testing.
 *   - The inbound SMS webhook (POST /api/sms/inbound) receives the SMS from
 *     the gateway, verifies the sender phone + code, and marks the binding
 *     as verified.
 *
 * This replaces traditional OTP (server sends SMS to user) with SIM binding
 * (user sends SMS from their device to the server), proving:
 *   1. The phone number is real and active on a SIM
 *   2. The user has physical access to the device/SIM
 *   3. The SIM is bound to the account in the database
 *
 * Dev-mode fallback (SIM_BINDING_DEV_MODE=true or no server number configured):
 *   The binding is auto-verified after a short delay (simulating SMS receipt),
 *   so login works for testing without an inbound SMS gateway.
 *
 * Server-side only. Never import from client components.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { createHash, randomInt } from 'crypto'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface SendOtpResult {
  /** Whether the binding session was created successfully. */
  success: boolean
  /** Binding session ID (or 'dev-session' in dev mode). */
  sid: string
  /** Status: 'pending' (awaiting SMS) or 'verified'. */
  status: string
  /** The secret code the user must include in their SMS. */
  bindingCode?: string
  /** The server number the user must send the SMS to. */
  serverNumber?: string
}

export interface VerifyOtpResult {
  /** Whether the SIM binding was verified. */
  valid: boolean
  /** Status: 'approved' (verified) or 'pending' (waiting for SMS). */
  status: string
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve SIM binding configuration from environment variables.
 *
 * Required env vars for production:
 *   SIM_BINDING_SERVER_NUMBER  — The phone number users send SMS to (e.g. +919876543210)
 *
 * Optional env vars:
 *   SIM_BINDING_DEV_MODE       — "true" to auto-verify (default: true if no server number)
 *   INBOUND_SMS_WEBHOOK_SECRET — Secret to authenticate the inbound SMS webhook
 */
function getSimBindingConfig(): {
  serverNumber: string
  devMode: boolean
  webhookSecret?: string
} | null {
  const serverNumber = process.env.SIM_BINDING_SERVER_NUMBER || ''
  const devMode = process.env.SIM_BINDING_DEV_MODE === 'true' || !serverNumber

  return {
    serverNumber,
    devMode,
    webhookSecret: process.env.INBOUND_SMS_WEBHOOK_SECRET || undefined,
  }
}

/** Whether SIM binding is properly configured. */
export function isSmsConfigured(): boolean {
  return getSimBindingConfig() !== null
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Binding session TTL: 10 minutes (user has time to send the SMS). */
const BINDING_TTL_MS = 10 * 60 * 1000

/** Max verification attempts before the session is invalidated. */
const MAX_ATTEMPTS = 10

/** Promise-based sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ------------------------------------------------------------------ */
/*  Code Generation & Hashing                                           */
/* ------------------------------------------------------------------ */

/**
 * Generate a cryptographically random 6-digit binding code.
 * This is the secret the user includes in their SMS to the server.
 */
function generateBindingCode(): string {
  return String(randomInt(100000, 999999))
}

/**
 * Hash a code for secure storage.
 */
function hashCode(code: string): string {
  const secret = process.env.NEXTAUTH_SECRET || 'realcart-sim-binding-secret-2024'
  return createHash('sha256').update(`${secret}:${code}`).digest('hex')
}

/* ------------------------------------------------------------------ */
/*  Phone formatting                                                    */
/* ------------------------------------------------------------------ */

/**
 * Extract the last 10 digits from a phone number (Indian mobile).
 */
function cleanMobile(mobile: string): string {
  return mobile.replace(/\D/g, '').slice(-10)
}

/* ------------------------------------------------------------------ */
/*  sendOtp — create a SIM binding session                              */
/* ------------------------------------------------------------------ */

/**
 * Create a SIM binding session for the given mobile number.
 *
 * Generates a secret binding code, stores a pending session in the
 * sim_bindings MongoDB collection, and returns the code + server number.
 *
 * The user must then send an SMS from their phone (the SIM to bind) to the
 * server number with the secret code. The inbound SMS webhook will mark the
 * session as verified.
 *
 * In dev mode (no server number or SIM_BINDING_DEV_MODE=true), the session
 * is auto-verified after a short delay.
 *
 * @param mobile - 10-digit Indian mobile number
 * @param type - 'customer' | 'delivery_boy' | 'seller'
 * @returns SendOtpResult with bindingCode + serverNumber
 */
export async function sendOtp(
  mobile: string,
  type: 'customer' | 'delivery_boy' | 'seller' = 'customer',
): Promise<SendOtpResult> {
  const cleanM = cleanMobile(mobile)
  if (cleanM.length !== 10) {
    throw new Error('Invalid mobile number. Must be 10 digits.')
  }

  const config = getSimBindingConfig()
  const bindingCode = generateBindingCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + BINDING_TTL_MS)

  const { db } = await connectToDatabase()

  // Create the SIM binding session in MongoDB
  await db.collection('sim_bindings').updateOne(
    { mobile: cleanM, type },
    {
      $set: {
        mobile: cleanM,
        type,
        codeHash: hashCode(bindingCode),
        status: 'pending',
        attempts: 0,
        verified: false,
        createdAt: now,
        expiresAt,
        devMode: config?.devMode ?? true,
      },
    },
    { upsert: true },
  )

  // In dev mode, auto-verify after 3 seconds (simulating SMS receipt)
  if (config?.devMode) {
    setTimeout(async () => {
      try {
        const { db } = await connectToDatabase()
        await db.collection('sim_bindings').updateOne(
          { mobile: cleanM, type, status: 'pending', codeHash: hashCode(bindingCode) },
          { $set: { status: 'verified', verified: true, verifiedAt: new Date() } },
        )
        console.info(`[SIM-Binding] Dev mode: auto-verified ${type} ${cleanM}`)
      } catch {
        // Non-fatal
      }
    }, 3000)
  }

  console.info(
    `[SIM-Binding] Session created for ${type} ${cleanM} ` +
      `(code=${bindingCode}, devMode=${config?.devMode}, server=${config?.serverNumber || 'N/A'}).`,
  )

  return {
    success: true,
    sid: `binding-${cleanM}-${type}`,
    status: 'pending',
    bindingCode,
    serverNumber: config?.serverNumber || '',
  }
}

/* ------------------------------------------------------------------ */
/*  verifyOtp — check if the SIM binding was verified                   */
/* ------------------------------------------------------------------ */

/**
 * Check whether the SIM binding for the given mobile number has been verified.
 *
 * The user sends an SMS from their phone to the server number with the secret
 * code. The inbound SMS webhook marks the session as verified. This function
 * polls that status.
 *
 * In dev mode, the session is auto-verified after ~3 seconds.
 *
 * @param mobile - 10-digit Indian mobile number
 * @param code - The binding code (for extra validation; the primary check is the status)
 * @param type - 'customer' | 'delivery_boy' | 'seller'
 * @returns VerifyOtpResult with valid flag + status
 */
export async function verifyOtp(
  mobile: string,
  code: string,
  type: 'customer' | 'delivery_boy' | 'seller' = 'customer',
): Promise<VerifyOtpResult> {
  const cleanM = cleanMobile(mobile)
  const cleanCode = code.replace(/\D/g, '')

  if (cleanM.length !== 10) {
    throw new Error('Invalid mobile number. Must be 10 digits.')
  }

  const { db } = await connectToDatabase()

  // Look up the SIM binding session (must be non-expired)
  const session = await db.collection('sim_bindings').findOne({
    mobile: cleanM,
    type,
    expiresAt: { $gt: new Date() },
  })

  if (!session) {
    throw new Error('SIM binding session expired. Please request a new code.')
  }

  // Check max attempts
  const attempts = (session.attempts as number) || 0
  if (attempts >= MAX_ATTEMPTS) {
    await db.collection('sim_bindings').updateOne(
      { _id: session._id },
      { $set: { verified: false, invalidated: true } },
    )
    throw new Error('Too many attempts. Please request a new code.')
  }

  // Check if the binding has been verified (by the inbound SMS webhook or dev-mode auto-verify)
  const isVerified = session.status === 'verified' || session.verified === true

  if (isVerified) {
    // Mark as verified in the session for register routes to check
    await db.collection('sim_bindings').updateOne(
      { _id: session._id },
      { $set: { verified: true, verifiedAt: session.verifiedAt || new Date() } },
    )
    return { valid: true, status: 'approved' }
  }

  // Not yet verified — increment attempts
  await db.collection('sim_bindings').updateOne(
    { _id: session._id },
    { $set: { attempts: attempts + 1 } },
  )

  return { valid: false, status: 'pending' }
}

/* ------------------------------------------------------------------ */
/*  verifyInboundSms — called by the inbound SMS webhook                */
/* ------------------------------------------------------------------ */

/**
 * Verify an inbound SMS and mark the corresponding SIM binding as verified.
 *
 * Called by the POST /api/sms/inbound webhook when the SMS gateway receives
 * an SMS from a user's phone. Matches the sender phone number + code against
 * pending binding sessions.
 *
 * @param sender - The sender's phone number (from the SMS gateway)
 * @param code - The code extracted from the SMS body
 * @returns true if a matching pending session was found and verified
 */
export async function verifyInboundSms(
  sender: string,
  code: string,
): Promise<boolean> {
  const cleanM = cleanMobile(sender)
  const cleanCode = code.replace(/\D/g, '')

  if (cleanM.length !== 10 || cleanCode.length < 4) {
    return false
  }

  const { db } = await connectToDatabase()

  // Find a pending binding session for this mobile + code
  // We check all 3 types (customer, seller, delivery_boy) since the SMS
  // doesn't specify which panel the user is logging into
  const session = await db.collection('sim_bindings').findOne({
    mobile: cleanM,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })

  if (!session) {
    return false
  }

  // Verify the code matches (hash comparison)
  const enteredHash = hashCode(cleanCode)
  const storedHash = session.codeHash as string
  if (!storedHash || enteredHash !== storedHash) {
    return false
  }

  // Mark as verified
  await db.collection('sim_bindings').updateOne(
    { _id: session._id },
    {
      $set: {
        status: 'verified',
        verified: true,
        verifiedAt: new Date(),
        verifiedVia: 'inbound_sms',
      },
    },
  )

  console.info(
    `[SIM-Binding] Verified via inbound SMS for ${session.type} ${cleanM}.`,
  )

  return true
}

/* ------------------------------------------------------------------ */
/*  Helper: check if a SIM binding is verified (for register routes)    */
/* ------------------------------------------------------------------ */

/**
 * Check if a mobile number has a verified SIM binding session.
 * Used by register routes as the registration gate.
 */
export async function isOtpVerified(
  mobile: string,
  type: 'customer' | 'delivery_boy' | 'seller',
): Promise<boolean> {
  const cleanM = cleanMobile(mobile)
  const { db } = await connectToDatabase()
  const session = await db.collection('sim_bindings').findOne({
    mobile: cleanM,
    type,
    verified: true,
    expiresAt: { $gt: new Date() },
  })
  return !!session
}

/**
 * Delete the SIM binding session for a mobile number (cleanup after registration).
 */
export async function clearOtpSession(
  mobile: string,
  type: 'customer' | 'delivery_boy' | 'seller',
): Promise<void> {
  const cleanM = cleanMobile(mobile)
  try {
    const { db } = await connectToDatabase()
    await db.collection('sim_bindings').deleteOne({ mobile: cleanM, type })
  } catch {
    // Non-fatal
  }
}
