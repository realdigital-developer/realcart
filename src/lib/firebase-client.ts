/**
 * Firebase Client SDK — Browser-side Phone Auth
 *
 * Initializes the Firebase Auth client SDK using NEXT_PUBLIC_FIREBASE_* env vars.
 * The client uses this to:
 *   1. Send OTP via `signInWithPhoneNumber(auth, phone, recaptchaVerifier)`
 *   2. Verify OTP via `confirmationResult.confirm(otp)` → gets a Firebase ID token
 *   3. Sends the ID token to our backend `/verify-otp` endpoint for final verification
 *
 * Dev-mode fallback:
 *   If NEXT_PUBLIC_FIREBASE_* env vars are NOT set, `isFirebaseClientConfigured`
 *   returns false and the `auth` singleton is null. The `use-phone-otp` hook
 *   detects this and enters dev mode (test OTP = 123456), so the app stays
 *   fully functional in the sandbox without real Firebase credentials.
 *
 * Client-side only ('use client'). Never import from server components / API routes.
 */

'use client'

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

/* ------------------------------------------------------------------ */
/*  Configuration resolution                                            */
/* ------------------------------------------------------------------ */

interface FirebaseClientConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  messagingSenderId?: string
  storageBucket?: string
}

/**
 * Resolve Firebase client config from NEXT_PUBLIC_ env vars.
 * Returns null if any required value is missing.
 */
function getConfig(): FirebaseClientConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  }
}

/** Whether Firebase client config env vars are set. */
export const isFirebaseClientConfigured = (): boolean => getConfig() !== null

/* ------------------------------------------------------------------ */
/*  Singleton initialization                                            */
/* ------------------------------------------------------------------ */

let _app: FirebaseApp | null = null
let _auth: Auth | null = null

/**
 * Get the Firebase App singleton (initializes on first call if configured).
 * Returns null if Firebase is not configured (dev mode).
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (_app) return _app

  const config = getConfig()
  if (!config) return null

  // Avoid double-init in React strict mode / HMR
  _app = getApps().length > 0 ? getApp() : initializeApp(config)
  return _app
}

/**
 * Get the Firebase Auth singleton (initializes on first call if configured).
 * Returns null if Firebase is not configured (dev mode).
 */
export function getFirebaseAuth(): Auth | null {
  if (_auth) return _auth

  const app = getFirebaseApp()
  if (!app) return null

  _auth = getAuth(app)
  return _auth
}
