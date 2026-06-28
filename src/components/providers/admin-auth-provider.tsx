'use client'

import { useState, useCallback, useEffect, createContext, useContext } from 'react'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
}

interface AuthState {
  user: AdminUser | null
  authenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AuthState>({
  user: null,
  authenticated: false,
  loading: true,
  login: async () => {},
  logout: async () => {},
})

export function useAdminAuth() {
  return useContext(AdminAuthContext)
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    user: AdminUser | null
    authenticated: boolean
    loading: boolean
  }>({
    user: null,
    authenticated: false,
    loading: true,
  })

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()

      if (data.authenticated && data.user) {
        setState({ user: data.user, authenticated: true, loading: false })
      } else {
        setState({ user: null, authenticated: false, loading: false })
      }
    } catch {
      setState({ user: null, authenticated: false, loading: false })
    }
  }, [])

  useEffect(() => {
    void checkSession() // eslint-disable-line react-hooks/set-state-in-effect
  }, [checkSession])

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Login failed')
    }

    setState({ user: data.user, authenticated: true, loading: false })
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setState({ user: null, authenticated: false, loading: false })
  }

  return (
    <AdminAuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}
