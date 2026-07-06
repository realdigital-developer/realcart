/**
 * usePhoneOtp — Shared Firebase Phone Auth OTP Hook
 *
 * Encapsulates the entire Firebase Phone Auth flow (send OTP, verify OTP, resend)
 * with a clean interface that the customer and delivery-boy auth-gate components
 * can drop in without duplicating logic.
 *
 * Architecture:
 *   - If Firebase client SDK is configured → real Firebase Phone Auth
 *     (signInWithPhoneNumber + confirmationResult.confirm → ID token)
 *   - If NOT configured → dev mode (test OTP = 123456, synthetic dev token)
 *
 * The hook returns a `sendOtp(mobile)` and `verifyOtp(otp)` function.
 * `verifyOtp` returns the Firebase ID token (or dev token) that the caller
 * POSTs to the backend `/verify-otp` endpoint for final server-side verification.
 *
 * 'use client' — this hook uses Firebase client SDK + DOM (reCAPTCHA).
 */

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// Firebase client SDK (dynamic imports to avoid loading in dev mode if unconfigured)
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth'
import {
  isFirebaseClientConfigured,
  isDevModeForced,
  getFirebaseAuth,
} from '@/lib/firebase-client'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface PhoneOtpResult {
  /** The ID token to send to the backend for verification. */
  idToken: string
}

export interface UsePhoneOtpReturn {
  /** Whether an OTP has been sent and we're waiting for verification. */
  otpSent: boolean
  /** Whether an async operation (send/verify) is in progress. */
  loading: boolean
  /** Error message from the last operation (empty string if none). */
  error: string
  /** Whether we're in dev mode (Firebase not configured, test OTP = 123456). */
  isDevMode: boolean

  /**
   * Send an OTP to the given mobile number.
   * @param mobile - 10-digit Indian mobile number (country code +91 is added automatically)
   */
  sendOtp: (mobile: string) => Promise<void>

  /**
   * Verify the OTP entered by the user.
   * @param otp - 6-digit OTP entered by the user
   * @returns { idToken } — the Firebase ID token (or dev token) to POST to the backend
   */
  verifyOtp: (otp: string) => Promise<PhoneOtpResult>

  /** Reset the hook state (clear OTP, error, confirmation result). */
  reset: () => void
}

/* ------------------------------------------------------------------ */
/*  Dev-mode constants                                                  */
/* ------------------------------------------------------------------ */

/** Test OTP in dev mode — matches the old 2Factor dev OTP. */
const DEV_TEST_OTP = '123456'

/** Prefix for dev-mode tokens (must match the backend firebase-admin.ts). */
const DEV_TOKEN_PREFIX = 'dev-otp-'

/* ------------------------------------------------------------------ */
/*  Hook implementation                                                 */
/* ------------------------------------------------------------------ */

export function usePhoneOtp(): UsePhoneOtpReturn {
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Firebase ConfirmationResult (production mode) — stored in a ref so it
  // survives re-renders without triggering them.
  const confirmationResultRef = useRef<ConfirmationResult | null>(null)

  // reCAPTCHA verifier ref — created once, reused for resends.
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  // Track the mobile number we sent the OTP to (for dev-mode token construction).
  const mobileRef = useRef<string>('')

  const configured = isFirebaseClientConfigured()
  // Dev mode is active when EITHER Firebase is not configured OR the user
  // explicitly forced dev mode via NEXT_PUBLIC_FIREBASE_DEV_MODE=true.
  // The override is essential for the Firebase Spark (free) plan, which
  // does NOT support Phone Auth SMS (requires Blaze plan).
  const devModeForced = isDevModeForced()
  const isDevMode = !configured || devModeForced

  // Re-check config on mount (handles HMR / env changes in dev)
  useEffect(() => {
    // no-op — isFirebaseClientConfigured() is called on every render.
    // This effect exists to satisfy the exhaustive-deps lint rule for refs.
  }, [])

  /**
   * Create or reuse an invisible reCAPTCHA verifier.
   * The container div with id="recaptcha-container" must exist in the DOM.
   */
  const getRecaptchaVerifier = useCallback((): RecaptchaVerifier => {
    if (recaptchaVerifierRef.current) {
      return recaptchaVerifierRef.current
    }

    const auth = getFirebaseAuth()
    if (!auth) {
      throw new Error('Firebase Auth is not initialized')
    }

    // Create a NEW RecaptchaVerifier each time the ref is empty.
    // Use 'invisible' size so it doesn't take up UI space.
    recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved — allow signInWithPhoneNumber to proceed
      },
      'expired-callback': () => {
        // reCAPTCHA expired — clear it so a new one is created on next send
        recaptchaVerifierRef.current = null
      },
    })

    return recaptchaVerifierRef.current
  }, [])

  /**
   * Send OTP to the given mobile number.
   * - Production: calls Firebase signInWithPhoneNumber
   * - Dev mode: simulates the send (OTP is always 123456)
   */
  const sendOtp = useCallback(
    async (mobile: string) => {
      setLoading(true)
      setError('')

      const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
      if (cleanMobile.length !== 10) {
        setError('Invalid mobile number. Must be 10 digits.')
        setLoading(false)
        throw new Error('Invalid mobile number')
      }

      mobileRef.current = cleanMobile

      try {
        if (!isDevMode) {
          // ── Production: real Firebase Phone Auth ──
          const auth = getFirebaseAuth()
          if (!auth) {
            throw new Error('Firebase Auth is not initialized')
          }

          const verifier = getRecaptchaVerifier()
          const phone = `+91${cleanMobile}`

          try {
            confirmationResultRef.current = await signInWithPhoneNumber(auth, phone, verifier)
          } catch (err) {
            // If reCAPTCHA is stale/invalid, clear it and retry once
            if (
              err instanceof Error &&
              (err.message.includes('reCAPTCHA') || err.message.includes('NETWORK'))
            ) {
              recaptchaVerifierRef.current?.clear()
              recaptchaVerifierRef.current = null
              const freshVerifier = getRecaptchaVerifier()
              confirmationResultRef.current = await signInWithPhoneNumber(auth, phone, freshVerifier)
            } else {
              throw err
            }
          }
        }
        // ── Dev mode: no-op (OTP is 123456, verified on the backend) ──

        setOtpSent(true)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send OTP'
        setError(extractFriendlyError(msg))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [isDevMode, getRecaptchaVerifier],
  )

  /**
   * Verify the OTP entered by the user.
   * - Production: calls confirmationResult.confirm(otp) → gets Firebase ID token
   * - Dev mode: constructs a synthetic dev token if otp === '123456'
   * @returns { idToken } to POST to the backend
   */
  const verifyOtp = useCallback(
    async (otp: string): Promise<PhoneOtpResult> => {
      setLoading(true)
      setError('')

      const cleanOtp = otp.replace(/\D/g, '')
      if (cleanOtp.length < 4 || cleanOtp.length > 6) {
        setError('Invalid OTP. Please enter the 6-digit code.')
        setLoading(false)
        throw new Error('Invalid OTP length')
      }

      try {
        if (!isDevMode) {
          // ── Production: verify via Firebase ──
          if (!confirmationResultRef.current) {
            throw new Error('No OTP was sent. Please request a new OTP.')
          }

          const result = await confirmationResultRef.current.confirm(cleanOtp)
          const idToken = await result.user.getIdToken()
          return { idToken }
        }

        // ── Dev mode: construct synthetic dev token ──
        if (cleanOtp !== DEV_TEST_OTP) {
          throw new Error(
            `Dev mode: the test OTP is ${DEV_TEST_OTP}. Configure Firebase to send real OTPs.`,
          )
        }

        const idToken = `${DEV_TOKEN_PREFIX}${mobileRef.current}-${cleanOtp}`
        return { idToken }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to verify OTP'
        setError(extractFriendlyError(msg))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [isDevMode],
  )

  /**
   * Reset the hook state. Clears the confirmation result, error, and otpSent flag.
   * Does NOT clear the reCAPTCHA verifier (reused for efficiency).
   */
  const reset = useCallback(() => {
    setOtpSent(false)
    setError('')
    confirmationResultRef.current = null
    mobileRef.current = ''
  }, [])

  // Cleanup reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      try {
        recaptchaVerifierRef.current?.clear()
      } catch {
        // ignore
      }
      recaptchaVerifierRef.current = null
    }
  }, [])

  return {
    otpSent,
    loading,
    error,
    isDevMode,
    sendOtp,
    verifyOtp,
    reset,
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: friendly error messages                                     */
/* ------------------------------------------------------------------ */

/**
 * Convert raw Firebase error messages into user-friendly messages.
 */
function extractFriendlyError(message: string): string {
  const lower = message.toLowerCase()

  // Firebase billing error — the Spark (free) plan doesn't support Phone Auth SMS.
  // This is the most common error for users on the free plan.
  if (lower.includes('billing-not-enabled') || lower.includes('billing')) {
    return 'Firebase billing is not enabled. Phone Auth SMS requires the Blaze (pay-as-you-go) plan. For development on the free Spark plan, set NEXT_PUBLIC_FIREBASE_DEV_MODE=true in your .env file to use the test OTP 123456.'
  }
  if (lower.includes('invalid-verification-code') || lower.includes('invalid otp')) {
    return 'Invalid OTP. Please try again.'
  }
  if (lower.includes('code-expired') || lower.includes('session expired')) {
    return 'OTP has expired. Please request a new OTP.'
  }
  if (lower.includes('too-many-requests') || lower.includes('quota')) {
    return 'Too many requests. Please try again later.'
  }
  if (lower.includes('network')) {
    return 'Network error. Please check your connection and try again.'
  }
  if (lower.includes('recaptcha')) {
    return 'Verification failed. Please refresh the page and try again.'
  }
  if (lower.includes('phone-number')) {
    return 'Invalid phone number. Please check and try again.'
  }
  if (lower.includes('test otp') || lower.includes('dev otp')) {
    return message // dev-mode message is already friendly
  }

  return message || 'An error occurred. Please try again.'
}
