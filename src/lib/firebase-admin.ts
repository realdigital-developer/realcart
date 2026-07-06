/**
 * Firebase Admin SDK — Server-Side Phone Auth Token Verification
 *
 * This module initializes the Firebase Admin SDK using service-account credentials
 * from environment variables and exposes a single function to verify Firebase
 * ID tokens returned by the client-side Firebase Phone Auth flow.
 *
 * Architecture change from 2Factor:
 *   - 2Factor: server sends OTP + server verifies OTP (opaque sessionId)
 *   - Firebase: CLIENT sends OTP via Firebase SDK + CLIENT verifies OTP → gets
 *     a Firebase ID token → sends ID token to our server → THIS module verifies
 *     the ID token with Firebase Admin and returns the verified phone number.
 *
 * Dev-mode fallback (robustness):
 *   If Firebase Admin credentials are NOT configured (e.g. local dev / sandbox),
 *   the module enters "dev mode". In dev mode, `verifyIdToken` accepts a special
 *   dev token of the form `dev-otp-<mobile>-123456` and returns the phone number
 *   extracted from it — mirroring the old 2Factor dev-mode test OTP (123456).
 *   This keeps the app fully functional in the sandbox without real Firebase creds.
 *
 * Server-side only. Never import from client components.
 */

// Modular imports (firebase-admin v14 in Next.js/ESM requires named imports
// from specific submodules — the default `import admin from 'firebase-admin'`
// pattern does NOT resolve correctly under webpack/turbopack).
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

/** Local ServiceAccount type (matches the firebase-admin interface). */
interface ServiceAccount {
  projectId: string
  clientEmail: string
  privateKey: string
}

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface VerifiedPhoneUser {
  /** Phone number in E.164 format (e.g. "+919876543210") */
  phoneNumber: string
  /** Firebase UID (empty string in dev mode) */
  uid: string
  /** The 10-digit mobile (no country code) extracted from phoneNumber */
  mobile: string
}

/* ------------------------------------------------------------------ */
/*  Configuration resolution                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolve the Firebase service account credentials from environment variables.
 * Supports two formats:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON — a complete JSON string (recommended)
 *   2. Individual vars: FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL
 *      + FIREBASE_ADMIN_PRIVATE_KEY
 */
function getServiceAccount(): ServiceAccount | null {
  // Option 1: Full JSON blob
  const jsonStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (jsonStr && jsonStr.trim().length > 0) {
    try {
      const parsed = JSON.parse(jsonStr)
      // Firebase service-account JSON files use SNAKE_CASE keys
      // (project_id, client_email, private_key), but our internal type uses
      // camelCase (projectId, clientEmail, privateKey).
      // Accept EITHER format for maximum compatibility.
      const projectId = parsed.projectId || parsed.project_id
      const clientEmail = parsed.clientEmail || parsed.client_email
      const privateKey = parsed.privateKey || parsed.private_key
      if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey }
      }
    } catch {
      // Invalid JSON — fall through to individual vars
    }
  }

  // Option 2: Individual env vars
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (projectId && clientEmail && privateKey) {
    // Handle escaped newlines (\n → actual newline) — common when stored in .env
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n')
    }
    return { projectId, clientEmail, privateKey }
  }

  return null
}

/** Whether Firebase Admin SDK has been initialized with real credentials. */
export const isFirebaseAdminConfigured = (): boolean => getServiceAccount() !== null

/* ------------------------------------------------------------------ */
/*  Initialization (lazy singleton)                                     */
/* ------------------------------------------------------------------ */

let _app: App | null = null

/**
 * Initialize the Firebase Admin SDK (once, lazily).
 * Returns the app instance, or null if not configured.
 */
function getAdminApp(): App | null {
  if (_app) return _app

  const serviceAccount = getServiceAccount()
  if (!serviceAccount) return null

  try {
    // HMR safety: check if a named app already exists before initializing
    const existing = getApps().find(a => a.name === 'realcart-auth')
    if (existing) {
      _app = existing
    } else {
      _app = initializeApp(
        {
          credential: cert(serviceAccount),
          projectId: serviceAccount.projectId,
        },
        'realcart-auth', // named app to avoid conflicts
      )
    }
    console.log('[Firebase Admin] Initialized — project:', serviceAccount.projectId)
    return _app
  } catch (err) {
    console.error('[Firebase Admin] Initialization failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Dev-mode test OTP (matches the old 2Factor dev OTP)                 */
/* ------------------------------------------------------------------ */

/** Test OTP used in dev mode — same as the old 2Factor dev OTP. */
const DEV_TEST_OTP = '123456'

/** Prefix for dev-mode tokens (so we can distinguish them from real Firebase tokens). */
const DEV_TOKEN_PREFIX = 'dev-otp-'

/* ------------------------------------------------------------------ */
/*  ID Token Verification                                               */
/* ------------------------------------------------------------------ */

/**
 * Whether dev mode is FORCED via env var — even when Firebase Admin credentials
 * are configured. This mirrors the client-side NEXT_PUBLIC_FIREBASE_DEV_MODE
 * but is a SEPARATE server-side env var (FIREBASE_DEV_MODE) so the server
 * can independently accept dev tokens without needing the client var.
 *
 * Set FIREBASE_DEV_MODE=true in .env to force the server into dev mode.
 * The server then accepts synthetic dev tokens (dev-otp-<mobile>-123456)
 * instead of verifying real Firebase ID tokens.
 *
 * This is essential for the Firebase Spark (free) plan, which does NOT
 * support Phone Auth SMS (requires Blaze plan). When the client is in
 * dev mode (NEXT_PUBLIC_FIREBASE_DEV_MODE=true), it sends dev tokens,
 * and the server MUST also be in dev mode to accept them.
 */
function isServerDevModeForced(): boolean {
  const val = process.env.FIREBASE_DEV_MODE
  return val === 'true' || val === '1' || val === 'yes'
}

/**
 * Verify a Firebase ID token and return the verified phone number.
 *
 * In production (Firebase Admin configured AND dev mode NOT forced):
 * verifies the real Firebase ID token using the Admin SDK, extracts
 * `phone_number` from the decoded token.
 *
 * In dev mode (Firebase Admin NOT configured OR FIREBASE_DEV_MODE=true):
 * accepts a synthetic dev token of the form `dev-otp-<mobile>-<otp>`.
 * If the OTP is '123456', returns the mobile. This mirrors the old 2Factor
 * dev-mode test OTP so the sandbox stays working on the Spark plan.
 *
 * @param idToken - Firebase ID token (real) or dev token (dev-otp-<mobile>-<otp>)
 * @returns VerifiedPhoneUser with phoneNumber, uid, and 10-digit mobile
 * @throws Error if verification fails (invalid token, expired, phone mismatch, etc.)
 */
export async function verifyIdToken(idToken: string): Promise<VerifiedPhoneUser> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('No ID token provided')
  }

  // ── Dev mode: accept synthetic dev tokens ──
  // Active when Firebase Admin is not configured OR dev mode is forced via env var.
  if (isServerDevModeForced()) {
    return verifyDevToken(idToken)
  }

  const app = getAdminApp()
  if (!app) {
    return verifyDevToken(idToken)
  }

  // ── Production mode: verify real Firebase ID token ──
  try {
    const auth = getAuth(app)
    const decoded = await auth.verifyIdToken(idToken)
    const phoneNumber = decoded.phone_number || decoded.firebase?.identities?.phone?.[0]

    if (!phoneNumber) {
      throw new Error('ID token does not contain a phone number')
    }

    const mobile = extractMobileFromE164(phoneNumber)
    if (!mobile) {
      throw new Error('Invalid phone number format in ID token')
    }

    return {
      phoneNumber,
      uid: decoded.uid,
      mobile,
    }
  } catch (err) {
    if (err instanceof Error) {
      // Re-throw with a clearer message for common errors
      if (err.message.includes('expired')) {
        throw new Error('ID token has expired. Please request a new OTP.')
      }
      if (err.message.includes('invalid') || err.message.includes('Decoding')) {
        throw new Error('Invalid ID token. Please try again.')
      }
      throw err
    }
    throw new Error('Failed to verify ID token')
  }
}

/**
 * Verify a synthetic dev-mode token: `dev-otp-<mobile>-<otp>`.
 * Accepts only if the OTP is '123456' (the test OTP).
 */
function verifyDevToken(idToken: string): VerifiedPhoneUser {
  if (!idToken.startsWith(DEV_TOKEN_PREFIX)) {
    throw new Error(
      'Firebase Admin is not configured and the token is not a valid dev token. ' +
      'Set FIREBASE_SERVICE_ACCOUNT_JSON (or individual FIREBASE_ADMIN_* vars) for production, ' +
      'or use the dev-mode test OTP 123456.',
    )
  }

  // Format: dev-otp-<mobile>-<otp>
  const rest = idToken.slice(DEV_TOKEN_PREFIX.length) // e.g. "9876543210-123456"
  const lastDash = rest.lastIndexOf('-')
  if (lastDash === -1) {
    throw new Error('Malformed dev token')
  }

  const mobile = rest.slice(0, lastDash)
  const otp = rest.slice(lastDash + 1)

  if (otp !== DEV_TEST_OTP) {
    throw new Error('Invalid dev OTP. The test OTP is 123456.')
  }

  const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
  if (cleanMobile.length !== 10) {
    throw new Error('Invalid mobile number in dev token')
  }

  return {
    phoneNumber: `+91${cleanMobile}`,
    uid: '',
    mobile: cleanMobile,
  }
}

/**
 * Extract the 10-digit mobile number from an E.164 phone number.
 * E.164 format for India: "+919876543210" → "9876543210"
 */
function extractMobileFromE164(phoneNumber: string): string | null {
  if (!phoneNumber) return null
  const digits = phoneNumber.replace(/\D/g, '')
  // Indian numbers: +91 followed by 10 digits = 12 digits total
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2)
  }
  // If it's already 10 digits (no country code)
  if (digits.length === 10) {
    return digits
  }
  // Fallback: last 10 digits
  if (digits.length > 10) {
    return digits.slice(-10)
  }
  return null
}

/**
 * Build a dev-mode token for the client to send.
 * (Used by the client-side hook in dev mode to construct a synthetic ID token.)
 */
export function buildDevToken(mobile: string, otp: string): string {
  const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
  return `${DEV_TOKEN_PREFIX}${cleanMobile}-${otp}`
}
