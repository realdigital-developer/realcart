'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { AdminAuthProvider } from '@/components/providers/admin-auth-provider'
import { AdminSidebarProvider } from '@/components/admin/admin-sidebar'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { authenticated, loading, user, logout } = useAdminAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Redirect authenticated users from /admin root to /admin/dashboard
  useEffect(() => {
    if (!loading && authenticated && pathname === '/admin') {
      router.replace('/admin/dashboard')
    }
  }, [authenticated, loading, pathname, router])

  if (loading) {
    return <>{children}</>
  }

  // Not authenticated — show login page without sidebar
  if (!authenticated) {
    return <>{children}</>
  }

  // Authenticated — wrap with sidebar layout
  return (
    <AdminSidebarProvider
      user={user ? { name: user.name, email: user.email, role: user.role } : { name: 'Admin', email: '', role: 'admin' }}
      onLogout={logout}
    >
      {children}
    </AdminSidebarProvider>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminAuthProvider>
  )
}
