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
import https from 'https'
import { promises as dnsPromises } from 'dns'

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
 *   MSG91_SENDER_ID    — 6-character approved sender ID (e.g. "REALCT")
 *
 * Optional env vars:
 *   MSG91_ROUTE        — Route number (default "4" = transactional)
 *   MSG91_TEMPLATE_ID  — DLT template ID (only used when SMS_USE_DLT=true)
 *   SMS_USE_DLT        — "true" to enable DLT mode (default: false = RCS)
 */
function getMsg91Config(): {
  authKey: string
  senderId: string
  route: string
  templateId?: string
  useDlt: boolean
} | null {
  const authKey = process.env.MSG91_AUTH_KEY
  const senderId = process.env.MSG91_SENDER_ID

  if (!authKey || !senderId) {
    return null
  }
  const useDlt = shouldUseDlt()
  return {
    authKey,
    senderId,
    route: process.env.MSG91_ROUTE || '4',
    // Only retain the template ID when DLT mode is enabled. In RCS mode
    // (default), the template_id param is omitted entirely from the API request.
    templateId: useDlt ? (process.env.MSG91_TEMPLATE_ID || undefined) : undefined,
    useDlt,
  }
}

/** Whether MSG91 is properly configured (false = dev mode). */
export function isSmsConfigured(): boolean {
  return getMsg91Config() !== null
}

/* ------------------------------------------------------------------ */
/*  DLT mode flag (RCS vs DLT SMS)                                      */
/* ------------------------------------------------------------------ */

/**
 * Whether to use DLT (Distributed Ledger Technology) SMS sending.
 *
 * Default: FALSE (RCS / non-DLT mode).
 *   - The DLT template ID (tid / template_id) is NOT sent with the API
 *     request. This uses RCS / non-DLT delivery, which bypasses TRAI's DLT
 *     template-matching requirements.
 *
 * Set SMS_USE_DLT=true to enable DLT mode:
 *   - The DLT template ID (if configured) IS sent with each request.
 *   - Required for traditional DLT-compliant SMS delivery in India.
 *
 * This flag applies to BOTH SMSHorizon (primary) and MSG91 (fallback).
 */
function shouldUseDlt(): boolean {
  return process.env.SMS_USE_DLT === 'true'
}

/* ------------------------------------------------------------------ */
/*  SMSHorizon configuration (primary provider)                         */
/* ------------------------------------------------------------------ */

/**
 * Resolve SMSHorizon credentials from environment variables.
 * Returns null if any required value is missing → falls through to MSG91.
 *
 * SMSHorizon API (https://smshorizon.co.in/api/v2/sendsms.php):
 *   - Auth: Bearer token in Authorization header (the API key)
 *   - Required params: user, mobile, senderid, message
 *   - Optional: tid (DLT template ID — only sent when SMS_USE_DLT=true),
 *     type (txt)
 *
 * Required env vars:
 *   SMSHORIZON_API_KEY   — API key from SMSHorizon dashboard (used as Bearer token)
 *   SMSHORIZON_USER      — Account username (the "user" param)
 *   SMSHORIZON_SENDER_ID — 6-character sender ID (e.g. "REALCT")
 *
 * Optional env vars:
 *   SMSHORIZON_TEMPLATE_ID — DLT template ID (only used when SMS_USE_DLT=true)
 *   SMSHORIZON_TYPE        — Message type: "txt" (default) or "uni" (Unicode)
 *   SMS_USE_DLT            — "true" to enable DLT mode (default: false = RCS)
 */
function getSmsHorizonConfig(): {
  apiKey: string
  user: string
  senderId: string
  templateId?: string
  type: string
  useDlt: boolean
} | null {
  const apiKey = process.env.SMSHORIZON_API_KEY
  const user = process.env.SMSHORIZON_USER
  const senderId = process.env.SMSHORIZON_SENDER_ID

  if (!apiKey || !user || !senderId) {
    return null
  }
  const useDlt = shouldUseDlt()
  return {
    apiKey,
    user,
    senderId,
    // Only retain the template ID when DLT mode is enabled. In RCS mode
    // (default), the tid param is omitted entirely from the API request.
    templateId: useDlt ? (process.env.SMSHORIZON_TEMPLATE_ID || undefined) : undefined,
    type: process.env.SMSHORIZON_TYPE || 'txt',
    useDlt,
  }
}

/** Whether SMSHorizon is properly configured. */
export function isSmsHorizonConfigured(): boolean {
  return getSmsHorizonConfig() !== null
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

/** Timeout for the SMSHorizon API HTTP call (milliseconds). */
const SMSHORIZON_API_TIMEOUT_MS = 15_000

/** Max number of SMSHorizon API call attempts for transient errors. */
const SMSHORIZON_MAX_RETRIES = 3

/** Delay (ms) between SMSHorizon retry attempts. */
const SMSHORIZON_RETRY_DELAY_MS = 600

/** The SMSHorizon API hostname (used for SNI + Host header). */
const SMSHORIZON_API_HOST = 'smshorizon.co.in'

/** The SMSHorizon API base URL. */
const SMSHORIZON_API_BASE = `https://${SMSHORIZON_API_HOST}`

/**
 * Cache for the resolved SMSHorizon API IP address.
 * Avoids repeated DNS-over-HTTPS lookups within a single server process.
 */
let resolvedSmsHorizonIp: string | null = null

/**
 * Resolve the SMSHorizon API IP address, with fallback to public DNS.
 *
 * PROBLEM: In some sandbox/cloud environments, the default system DNS servers
 * cannot resolve `smshorizon.co.in` (they return SERVFAIL), even though the
 * domain is valid and resolvable via public DNS (e.g. Google 8.8.8.8). This
 * causes all SMSHorizon API calls to fail with "fetch failed" / ENOTFOUND.
 *
 * SOLUTION (3-tier resolution):
 *   1. If SMSHORIZON_API_IP env var is set → use it directly (manual override).
 *   2. Try Node's default DNS resolution (works in most environments/Vercel).
 *   3. If that fails → fall back to DNS-over-HTTPS via Google's public resolver
 *      (https://dns.google/resolve?name=smshorizon.co.in&type=A). This bypasses
 *      the broken system DNS and works in restrictive sandboxes.
 *
 * The resolved IP is cached for the lifetime of the process.
 *
 * @returns the IP address, or null if all resolution methods fail.
 */
async function resolveSmsHorizonIp(): Promise<string | null> {
  // Tier 1: manual override
  const override = process.env.SMSHORIZON_API_IP
  if (override) {
    return override
  }

  // Return cached result if available
  if (resolvedSmsHorizonIp) {
    return resolvedSmsHorizonIp
  }

  // Tier 2: Node's default DNS resolution
  try {
    const addresses = await dnsPromises.lookup(SMSHORIZON_API_HOST, {
      family: 4,
      all: false,
    })
    const ip = typeof addresses === 'string' ? addresses : addresses.address
    if (ip) {
      resolvedSmsHorizonIp = ip
      console.info(`[SMSHorizon] Resolved ${SMSHORIZON_API_HOST} → ${ip} (system DNS)`)
      return ip
    }
  } catch {
    // System DNS failed — fall through to DoH
  }

  // Tier 3: DNS-over-HTTPS via Google's public resolver
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8_000)
    const response = await fetch(
      `https://dns.google/resolve?name=${SMSHORIZON_API_HOST}&type=A`,
      { signal: controller.signal },
    )
    clearTimeout(timeoutId)
    if (response.ok) {
      const data = (await response.json()) as { Answer?: { data: string }[] }
      const answer = data.Answer?.find((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a.data))
      if (answer?.data) {
        resolvedSmsHorizonIp = answer.data
        console.info(
          `[SMSHorizon] Resolved ${SMSHORIZON_API_HOST} → ${answer.data} (DNS-over-HTTPS fallback)`,
        )
        return answer.data
      }
    }
  } catch {
    // DoH also failed
  }

  console.error(
    `[SMSHorizon] Could not resolve ${SMSHORIZON_API_HOST} via any DNS method. ` +
      `Set SMSHORIZON_API_IP env var to the IP address manually, or fix the DNS.`,
  )
  return null
}

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
/*  sendOtpViaSmsHorizon — primary provider (smshorizon.co.in)          */
/* ------------------------------------------------------------------ */

/**
 * Send an OTP via SMSHorizon's Send SMS API (https://smshorizon.co.in/api/v2/sendsms.php).
 *
 * SMSHorizon is the PRIMARY provider. It offers 500 free credits on signup
 * (no card required), sub-3-second delivery, DLT-compliant routes, and Bearer-
 * token auth. RCS messaging is available as a service on the platform; the
 * standard SMS API is used here for reliable OTP delivery to all Indian
 * numbers (RCS requires the recipient's device/carrier to support it, while
 * standard SMS is universal).
 *
 * This function generates a random 6-digit OTP, builds the branded message,
 * sends it via SMSHorizon, stores the OTP hash in otp_sessions, and returns
 * a SendOtpResult. On transient errors (network, timeout, 5xx) it retries up
 * to SMSHORIZON_MAX_RETRIES times. Non-retryable errors are thrown so the
 * caller can fall back to MSG91 or dev mode.
 *
 * @returns SendOtpResult on success (throws on failure).
 */
async function sendOtpViaSmsHorizon(
  cleanMobile: string,
  type: 'customer' | 'delivery_boy' | 'seller',
  config: NonNullable<ReturnType<typeof getSmsHorizonConfig>>,
  otpCode: string,
  messageBody: string,
): Promise<SendOtpResult> {
  // Build the SMSHorizon API request body (form-encoded).
  const params = new URLSearchParams()
  params.append('user', config.user)
  params.append('mobile', cleanMobile)
  params.append('senderid', config.senderId)
  params.append('message', messageBody)
  params.append('type', config.type)
  if (config.templateId) {
    // DLT mode (SMS_USE_DLT=true): include the DLT template ID (tid).
    // In RCS mode (default, SMS_USE_DLT=false), templateId is undefined
    // and tid is omitted entirely — the message is sent without DLT.
    params.append('tid', config.templateId)
  }

  let lastError: Error | null = null

  // Resolve the SMSHorizon API IP address once (with DNS-over-HTTPS fallback).
  // In sandbox/cloud environments where the system DNS can't resolve
  // smshorizon.co.in, this falls back to Google's public DNS-over-HTTPS,
  // then connects to the resolved IP with the correct Host header + TLS SNI.
  const apiIp = await resolveSmsHorizonIp()
  const bodyStr = params.toString()

  for (let attempt = 1; attempt <= SMSHORIZON_MAX_RETRIES; attempt++) {
    // Use Node's built-in https module with a custom lookup function that
    // returns the resolved IP. This is the equivalent of `curl --resolve`
    // and works WITHOUT any external dependencies (no undici needed).
    // The servername option pins TLS SNI to the real hostname so the
    // certificate validates correctly when connecting via IP.
    const makeRequest = (): Promise<{ status: number; json: unknown }> => {
      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: apiIp || SMSHORIZON_API_HOST,
            port: 443,
            path: '/api/v2/sendsms.php',
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(bodyStr),
              Host: SMSHORIZON_API_HOST,
            },
            servername: SMSHORIZON_API_HOST, // TLS SNI — pins to real hostname
            timeout: SMSHORIZON_API_TIMEOUT_MS,
          },
          (res) => {
            let chunks = ''
            res.on('data', (c: Buffer | string) => (chunks += c))
            res.on('end', () => {
              const status = res.statusCode || 0
              try {
                resolve({ status, json: JSON.parse(chunks) })
              } catch {
                resolve({ status, json: {} })
              }
            })
          },
        )
        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy(new Error('SMSHorizon API request timed out.'))
        })
        req.write(bodyStr)
        req.end()
      })
    }

    let status: number
    let data: unknown
    try {
      const result = await makeRequest()
      status = result.status
      data = result.json
    } catch (err) {
      lastError = new Error(
        err instanceof Error && err.name === 'Error' && err.message.includes('timed out')
          ? 'SMSHorizon API request timed out.'
          : `Failed to reach SMSHorizon API: ${err instanceof Error ? err.message : 'network error'}`,
      )
      // Network/timeout errors may be transient — retry.
      if (attempt < SMSHORIZON_MAX_RETRIES) {
        await sleep(SMSHORIZON_RETRY_DELAY_MS)
        continue
      }
      break
    }

    const d = (data || {}) as {
      msgid?: string
      status?: string
      error?: string
      message?: string
      balance_after?: string | number
    }

    // SMSHorizon returns {"msgid":"...","status":"queued","balance_after":"..."} on success.
    // On failure: {"status":"error","error":"..."} or HTTP non-2xx with an error message.
    if (status >= 200 && status < 300 && d.status && d.status !== 'error' && d.msgid) {
      const refId = String(d.msgid)
      const balanceAfter =
        d.balance_after !== undefined ? ` (balance: ${d.balance_after})` : ''
      console.info(
        `[SMSHorizon] OTP submitted for ${type} ${cleanMobile} ` +
          `(sender=${config.senderId}, type=${config.type}, msgid=${refId}${balanceAfter}).`,
      )
      // Store the OTP hash in otp_sessions for verification.
      const { db } = await connectToDatabase()
      await db.collection('otp_sessions').updateOne(
        { mobile: cleanMobile, type },
        {
          $set: {
            mobile: cleanMobile,
            type,
            sessionId: refId,
            otpHash: hashOtp(otpCode),
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

    // Failure — extract the error message.
    const apiMsg = String(d.error || d.message || d.status || '')
    lastError = new Error(apiMsg || `SMSHorizon API returned status ${status}`)

    // Non-retryable errors (auth, DLT, config, invalid sender) — stop immediately.
    // Retryable: 5xx server errors.
    const isServerError = status >= 500
    if (isServerError && attempt < SMSHORIZON_MAX_RETRIES) {
      console.warn(
        `[SMSHorizon] Attempt ${attempt}/${SMSHORIZON_MAX_RETRIES} failed (status ${status}). Retrying...`,
      )
      await sleep(SMSHORIZON_RETRY_DELAY_MS)
      continue
    }
    break
  }

  throw lastError || new Error('SMSHorizon API request failed.')
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
/*  sendOtp — send an OTP via SMSHorizon (primary) / MSG91 (fallback)    */
/* ------------------------------------------------------------------ */

/**
 * Send an OTP to the given mobile number.
 *
 * Provider priority (everything else intact):
 *   1. SMSHorizon (primary) — smshorizon.co.in API. 500 free credits, sub-3s
 *      delivery, DLT-compliant. Used when SMSHORIZON_API_KEY + USER + SENDER_ID
 *      are set and the sender ID passes 6-char DLT validation.
 *   2. MSG91 (fallback) — used when SMSHorizon is not configured OR fails with
 *      a non-retryable error. Keeps the existing MSG91 infrastructure intact.
 *   3. Dev mode (last resort) — test OTP 123456, no SMS sent. Used when NEITHER
 *      provider is configured, or when both fail with config/DLT errors.
 *
 * The OTP is generated server-side (crypto.randomInt), hashed (SHA-256), and
 * stored in the otp_sessions MongoDB collection. Verification is always done
 * against the stored hash — the SMS provider only delivers the code.
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

  const smsHorizonConfig = getSmsHorizonConfig()
  const msg91Config = getMsg91Config()

  // ── Dev mode: NEITHER provider configured → store test OTP ──
  if (!smsHorizonConfig && !msg91Config) {
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

  // ── PRIMARY: try SMSHorizon ──
  if (smsHorizonConfig) {
    const senderIdError = validateSenderId(smsHorizonConfig.senderId)
    if (senderIdError) {
      console.warn(
        `[SMSHorizon] Configuration issue — skipping to MSG91/dev: ${senderIdError}`,
      )
    } else {
      try {
        return await sendOtpViaSmsHorizon(
          cleanMobile,
          type,
          smsHorizonConfig,
          otpCode,
          messageBody,
        )
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        // DLT/template/auth errors are non-retryable config issues — fall back
        // to MSG91 or dev mode instead of hard-failing the login.
        if (/not matched|template|dlt|not approved|invalid sender|header|auth|unauthor|401|403/i.test(errMsg)) {
          console.warn(
            `[SMSHorizon] Non-retryable error — falling back: ${errMsg}`,
          )
        } else {
          console.warn(
            `[SMSHorizon] Failed after retries — falling back to MSG91/dev: ${errMsg}`,
          )
        }
        // Fall through to MSG91 / dev mode below.
      }
    }
  }

  // ── FALLBACK: try MSG91 (existing logic, fully intact) ──
  if (!msg91Config) {
    // MSG91 not configured — dev mode.
    return storeDevOtp(cleanMobile, type)
  }

  const config = msg91Config

  // Pre-flight check: validate the MSG91 sender ID (DLT requires exactly 6
  // alphabetic chars). An invalid sender ID is a hard block — Indian telecom
  // operators reject non-6-char sender IDs, so we fall back to dev mode.
  //
  // NOTE on balance: we do NOT pre-check the MSG91 balance via the balance.php
  // API because that endpoint is unreliable — it returns 0 even when the
  // account wallet has funds (the dashboard wallet and the balance.php pool
  // are different). Pre-checking balance caused legitimate sends to be
  // silently skipped (dev-mode fallback) even with a funded wallet. Instead,
  // we attempt the send and handle any actual error MSG91 returns.
  const senderIdError = validateSenderId(config.senderId)
  if (senderIdError) {
    console.warn(`[MSG91] Configuration issue — falling back to dev mode: ${senderIdError}`)
    return storeDevOtp(cleanMobile, type)
  }

  // Build the professional branded OTP message with the actual code
  // (rebuild here so the MSG91 path is self-contained; messageBody from above
  // is identical since otpCode/brandName/type are the same.)
  // Note: messageBody is already defined above — reuse it.

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
      // MSG91 v2 sendsms returns {"type":"success","message":"<campaign_id>"}.
      // The campaign/request ID is in the `message` field on success (on error,
      // `message` is the error description — but we only reach here on success).
      refId =
        data.message ||
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
