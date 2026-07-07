'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'

interface DeliveryBoyUser {
  id: string
  mobile: string
  name: string
  role: 'delivery_boy'
  isAvailable?: boolean
  status?: string
  profileImage?: string
}

/** Result of handleAuthFailure — callers can react appropriately */
export type AuthFailureResult =
  | 'session_valid'    // Session is still valid — the 401 was transient; caller should retry the request
  | 'session_expired'  // Session is truly expired; user will be de-authenticated and redirected
  | 'network_error'    // Couldn't verify session due to network error; caller should show retry message

interface DeliveryBoyAuthContextType {
  user: DeliveryBoyUser | null
  authenticated: boolean
  loading: boolean
  login: (mobile: string, passcode: string) => Promise<void>
  register: (mobile: string, passcode: string, name?: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  /** Call this when a data API returns 401. Tries to refresh the session first;
   *  if that also fails, de-authenticates the user and redirects to login.
   *  Returns a result so callers know whether to retry or show an error. */
  handleAuthFailure: () => Promise<AuthFailureResult>
}

const NO_AUTH_RESULT: AuthFailureResult = 'network_error'

const DeliveryBoyAuthContext = createContext<DeliveryBoyAuthContextType>({
  user: null,
  authenticated: false,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshSession: async () => {},
  handleAuthFailure: async () => NO_AUTH_RESULT,
})

export function useDeliveryBoyAuth() {
  return useContext(DeliveryBoyAuthContext)
}

/** Maximum time to wait for session check before giving up (10 seconds) */
const SESSION_CHECK_TIMEOUT = 10_000

/** Maximum number of retry attempts for session verification during handleAuthFailure */
const MAX_SESSION_RETRIES = 2

/** Base delay (ms) for exponential backoff between retries */
const RETRY_BASE_DELAY = 1_000

/**
 * Perform a session check with timeout.
 * Returns { authenticated, user } or throws on network error.
 */
async function checkSessionOnce(): Promise<{ authenticated: boolean; user: DeliveryBoyUser | null; errorCode?: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT)

  const res = await fetch('/api/auth/delivery-boy/session', {
    signal: controller.signal,
    credentials: 'include',
  })
  clearTimeout(timeoutId)

  const data = await res.json().catch(() => ({})).catch(() => ({}))
  if (data.authenticated && data.user) {
    return { authenticated: true, user: data.user }
  }
  return { authenticated: false, user: null, errorCode: data.errorCode }
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function DeliveryBoyAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DeliveryBoyUser | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  // Guard to prevent multiple concurrent handleAuthFailure calls
  const authFailureInProgressRef = useRef(false)
  // Track the result of the most recent handleAuthFailure for late callers
  const lastAuthFailureResultRef = useRef<AuthFailureResult | null>(null)

  /* ------------------------------------------------------------------ */
  /*  Initial Session Check (on mount only)                               */
  /*  This sets loading, authenticated, and user state.                   */
  /*  On failure, user is treated as unauthenticated.                     */
  /* ------------------------------------------------------------------ */

  const checkSession = useCallback(async () => {
    try {
      const result = await checkSessionOnce()

      if (result.authenticated && result.user) {
        setUser(result.user)
        setAuthenticated(true)
        return
      }
      // Not authenticated
      setUser(null)
      setAuthenticated(false)
    } catch {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[DeliveryBoyAuth] Session check failed — treating as unauthenticated')
      }
      setUser(null)
      setAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Check session on mount only
  useEffect(() => {
    checkSession()
  }, [checkSession])

  /* ------------------------------------------------------------------ */
  /*  Silent Session Refresh                                              */
  /*  Used after actions like availability toggle, profile update, etc.   */
  /*  Only updates user data on success — NEVER sets loading=true or      */
  /*  authenticated=false. This prevents layout unmount/navbar blink.      */
  /* ------------------------------------------------------------------ */

  const refreshSession = useCallback(async () => {
    try {
      const result = await checkSessionOnce()

      if (result.authenticated && result.user) {
        // Silently update user data (name, isAvailable, profileImage, etc.)
        // Do NOT touch loading or authenticated — those stay as-is
        setUser(result.user)
        return
      }

      // If the session API returned a transient error code, don't de-authenticate
      if (result.errorCode === 'SESSION_CHECK_ERROR') {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[DeliveryBoyAuth] Session refresh got transient error — keeping existing session')
        }
        return
      }

      // Session is no longer valid (e.g., cookie expired, account blocked)
      // Only now do we de-authenticate, but still without touching loading
      setUser(null)
      setAuthenticated(false)
    } catch {
      // Network error during refresh — SILENTLY IGNORE.
      // Do NOT de-authenticate on transient network failures.
      // The user is still logged in; the next action will retry.
      if (process.env.NODE_ENV === 'development') {
        console.warn('[DeliveryBoyAuth] Session refresh failed (network error) — keeping existing session')
      }
    }
  }, [])

  /* ------------------------------------------------------------------ */
  /*  Auth Failure Handler                                                */
  /*  Called when a data API returns 401. Tries to refresh the session     */
  /*  first with exponential backoff; if that also fails, de-authenticates */
  /*  the user. Returns a result so callers know the outcome.              */
  /*                                                                      */
  /*  Key improvements over the previous version:                         */
  /*  - Returns AuthFailureResult so callers can react appropriately       */
  /*  - Retries session check with exponential backoff (up to 2 retries)  */
  /*  - Distinguishes between "session valid" (transient 401) and         */
  /*    "session expired" (confirmed logout) and "network error"           */
  /*  - Handles session API transient errors gracefully                    */
  /* ------------------------------------------------------------------ */

  const handleAuthFailure = useCallback(async (): Promise<AuthFailureResult> => {
    // If another handleAuthFailure is already in progress, wait for it
    // and return its result instead of starting a new check
    if (authFailureInProgressRef.current) {
      // Poll until the in-progress call finishes (with a timeout)
      for (let i = 0; i < 50; i++) {
        await sleep(200)
        if (!authFailureInProgressRef.current && lastAuthFailureResultRef.current) {
          return lastAuthFailureResultRef.current
        }
      }
      // Timed out waiting — assume network error
      return 'network_error'
    }

    authFailureInProgressRef.current = true

    try {
      // Try session verification with exponential backoff
      // The 401 may have been transient (e.g., MongoDB timeout, cold start,
      // brief network glitch). We verify the session up to 3 times total
      // before declaring the session expired.
      for (let attempt = 0; attempt <= MAX_SESSION_RETRIES; attempt++) {
        // Wait before retry (no delay on first attempt)
        if (attempt > 0) {
          const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1)
          if (process.env.NODE_ENV === 'development') {
            console.warn(`[DeliveryBoyAuth] Retrying session check in ${delay}ms (attempt ${attempt + 1}/${MAX_SESSION_RETRIES + 1})`)
          }
          await sleep(delay)
        }

        try {
          const result = await checkSessionOnce()

          if (result.authenticated && result.user) {
            // Session is actually still valid — the 401 was transient!
            // Silently update user data and keep the user logged in
            setUser(result.user)
            lastAuthFailureResultRef.current = 'session_valid'
            return 'session_valid'
          }

          // If the session API itself had a transient error (returned an error code),
          // retry instead of immediately de-authenticating
          if (result.errorCode === 'SESSION_CHECK_ERROR') {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[DeliveryBoyAuth] Session API returned transient error — will retry')
            }
            continue // retry
          }

          // Session API returned authenticated: false with no transient error code
          // This means the JWT is genuinely missing/invalid/expired — no point retrying
          break
        } catch {
          // Network error on this attempt — retry if we have attempts left
          if (attempt < MAX_SESSION_RETRIES) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[DeliveryBoyAuth] Session check network error (attempt ${attempt + 1}) — will retry`)
            }
            continue
          }
        }
      }

      // All retries exhausted or session confirmed invalid — de-authenticate
      try {
        await fetch('/api/auth/delivery-boy/logout', { method: 'POST', credentials: 'include' })
      } catch {
        // Ignore logout API errors
      }
      setUser(null)
      setAuthenticated(false)
      lastAuthFailureResultRef.current = 'session_expired'
      return 'session_expired'
    } catch {
      // Unexpected error during the retry loop — don't de-authenticate
      // The 401 might have been caused by a transient issue
      if (process.env.NODE_ENV === 'development') {
        console.warn('[DeliveryBoyAuth] Auth failure check failed (unexpected error) — keeping existing session')
      }
      lastAuthFailureResultRef.current = 'network_error'
      return 'network_error'
    } finally {
      authFailureInProgressRef.current = false
    }
  }, [])

  /* ------------------------------------------------------------------ */
  /*  Login / Register / Logout                                           */
  /* ------------------------------------------------------------------ */

  const login = useCallback(async (mobile: string, passcode: string) => {
    const res = await fetch('/api/auth/delivery-boy/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mobile, passcode }),
    })
    const data = await res.json().catch(() => ({})).catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Login failed')
    setUser(data.user)
    setAuthenticated(true)
  }, [])

  const register = useCallback(async (mobile: string, passcode: string, name?: string) => {
    const res = await fetch('/api/auth/delivery-boy/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mobile, passcode, name }),
    })
    const data = await res.json().catch(() => ({})).catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Registration failed')
    setUser(data.user)
    setAuthenticated(true)
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/delivery-boy/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Ignore logout API errors — clear local state regardless
    }
    setUser(null)
    setAuthenticated(false)
  }, [])

  return (
    <DeliveryBoyAuthContext.Provider
      value={{ user, authenticated, loading, login, register, logout, refreshSession, handleAuthFailure }}
    >
      {children}
    </DeliveryBoyAuthContext.Provider>
  )
}
