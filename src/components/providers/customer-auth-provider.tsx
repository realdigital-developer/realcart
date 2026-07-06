'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react'

interface CustomerUser {
  id: string
  mobile: string
  name: string
  email?: string | null
  role: 'customer'
  profileImage?: string | null
  /** Whether the customer has completed their profile (email set).
   *  New customers (just registered with mobile + passcode) have this as
   *  false, so the UI can redirect them to the profile page. */
  profileComplete?: boolean
}

export interface CustomerAuthContextType {
  user: CustomerUser | null
  authenticated: boolean
  loading: boolean
  /** Whether the logged-in customer is new (profile not yet completed).
   *  True when authenticated AND profileComplete is false. */
  isNewCustomer: boolean
  login: (mobile: string, passcode: string) => Promise<void>
  register: (mobile: string, passcode: string, name?: string) => Promise<void>
  logout: () => Promise<void>
  /** Re-fetch the customer session from the server. Call this after
   *  updating profile data (name, email, image) so the auth context
   *  reflects the latest DB state without requiring a full page reload. */
  refreshUser: () => Promise<void>
}

/* ------------------------------------------------------------------ */
/*  Default context value — loading: false (NOT true)                  */
/*                                                                     */
/*  KEY FIX: Previous default was loading:true, which meant that if    */
/*  the ProviderErrorBoundary caught an error and children lost the    */
/*  CustomerAuthProvider, they'd get loading:true from the default     */
/*  context, causing infinite loading.                                 */
/*                                                                     */
/*  Now the default is loading:false + authenticated:false, which      */
/*  means unauthenticated state — safe fallback that shows auth UI.    */
/* ------------------------------------------------------------------ */

const CustomerAuthContext = createContext<CustomerAuthContextType>({
  user: null,
  authenticated: false,
  loading: false,
  isNewCustomer: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
})

export function useCustomerAuth() {
  return useContext(CustomerAuthContext)
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  // Start with loading=true only when the provider is actually mounted
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(false)

  // Derived flag: a customer is "new" when authenticated but profile not complete.
  const isNewCustomer = authenticated && user != null && user.profileComplete === false

  // Check session on mount — single effect with proper cleanup.
  // The fetch + setState happens inside async .then() callbacks (NOT
  // synchronously in the effect body), which is the correct React
  // pattern for synchronizing with an external system (the session API).
  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    fetch('/api/auth/customer/session', { signal: controller.signal })
      .then(res => {
        if (cancelled) return
        if (res.ok) {
          return res.json().then(data => {
            if (cancelled) return
            if (data.authenticated && data.user) {
              setUser(data.user)
              setAuthenticated(true)
            } else {
              setUser(null)
              setAuthenticated(false)
            }
          })
        } else {
          setUser(null)
          setAuthenticated(false)
        }
      })
      .catch(() => {
        if (cancelled) return
        setUser(null)
        setAuthenticated(false)
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  // refreshUser — re-fetch the session from the server. Used after profile
  // updates so the auth context (and all components consuming useCustomerAuth)
  // immediately reflect the new name/email/image without a page reload.
  const refreshUser = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch('/api/auth/customer/session', { signal: controller.signal })
      clearTimeout(timeoutId)
      if (res.ok) {
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        if (data.authenticated && data.user) {
          setUser(data.user)
          setAuthenticated(true)
          return
        }
      }
      setUser(null)
      setAuthenticated(false)
    } catch {
      setUser(null)
      setAuthenticated(false)
    }
  }, [])

  const login = useCallback(async (mobile: string, passcode: string) => {
    const res = await fetch('/api/auth/customer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, passcode }),
    })
    const data = await res.json().catch(() => ({})).catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Login failed')
    setUser(data.user)
    setAuthenticated(true)
  }, [])

  const register = useCallback(async (mobile: string, passcode: string, name?: string) => {
    const res = await fetch('/api/auth/customer/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, passcode, name }),
    })
    const data = await res.json().catch(() => ({})).catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Registration failed')
    // New customers have NOT completed their profile (no email yet).
    // Set profileComplete: false so the UI redirects them to the profile page.
    setUser({ ...data.user, profileComplete: false })
    setAuthenticated(true)
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/customer/logout', { method: 'POST' })
    } catch {
      // Ignore network errors on logout
    }
    setUser(null)
    setAuthenticated(false)
  }, [])

  return (
    <CustomerAuthContext.Provider
      value={{ user, authenticated, loading, isNewCustomer, login, register, logout, refreshUser }}
    >
      {children}
    </CustomerAuthContext.Provider>
  )
}
