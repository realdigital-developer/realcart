'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react'

interface SellerUser {
  id: string
  email: string
  name: string
  storeName: string
  role: 'seller'
  status?: string
  isVerified?: boolean
  businessType?: string
}

interface PickupAddress {
  fullName: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  pincode: string
}

interface DocumentUpload {
  url: string
  publicId: string
}

interface SellerDocuments {
  gst_certificate?: DocumentUpload
  pan_card?: DocumentUpload
  cancel_cheque?: DocumentUpload
  business_registration?: DocumentUpload
  address_proof?: DocumentUpload
}

interface SellerRegisterData {
  name: string
  email: string
  password: string
  storeName: string
  phone: string
  businessType: string
  gstNumber?: string
  panNumber?: string
  bankAccountName: string
  bankAccountNumber: string
  bankIfsc: string
  bankName: string
  documents?: SellerDocuments
  pickupAddress: PickupAddress
  address?: string
}

interface SellerAuthContextType {
  user: SellerUser | null
  authenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: SellerRegisterData) => Promise<void>
  logout: () => Promise<void>
  handleSessionExpired: () => void
}

const SellerAuthContext = createContext<SellerAuthContextType>({
  user: null,
  authenticated: false,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  handleSessionExpired: () => {},
})

export function useSellerAuth() {
  return useContext(SellerAuthContext)
}

export function SellerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SellerUser | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Check session
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/seller/session')
      if (res.ok) {
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        if (data.authenticated && data.user) {
          setUser(data.user)
          setAuthenticated(true)
        } else {
          setUser(null)
          setAuthenticated(false)
        }
      }
    } catch {
      setUser(null)
      setAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Check session on mount
  useEffect(() => {
    checkSession()
  }, [checkSession])

  // Periodic session check every 5 minutes
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      checkSession()
    }, 5 * 60 * 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [checkSession])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/seller/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({})).catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Login failed')
    setUser(data.user)
    setAuthenticated(true)
  }, [])

  const register = useCallback(async (registerData: SellerRegisterData) => {
    const res = await fetch('/api/auth/seller/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerData),
    })
    const data = await res.json().catch(() => ({})).catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Registration failed')
    setUser(data.user)
    setAuthenticated(true)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/seller/logout', { method: 'POST' })
    setUser(null)
    setAuthenticated(false)
  }, [])

  // Handle session expiry — called by child components when they detect 401/403
  const handleSessionExpired = useCallback(() => {
    setUser(null)
    setAuthenticated(false)
    // Also call logout to clear the cookie server-side
    fetch('/api/auth/seller/logout', { method: 'POST' }).catch(() => {})
  }, [])

  return (
    <SellerAuthContext.Provider
      value={{ user, authenticated, loading, login, register, logout, handleSessionExpired }}
    >
      {children}
    </SellerAuthContext.Provider>
  )
}
