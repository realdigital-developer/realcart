'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Store,
  Bell,
  Wallet,
  Star,
  Clock,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  UserCircle,
  CreditCard,
  Boxes,
  Ticket,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSiteLogo } from '@/hooks/use-site-logo'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useSellerAuth } from '@/hooks/use-seller-auth'
import { SellerAuthProvider } from '@/components/providers/seller-auth-provider'

/* ------------------------------------------------------------------ */
/*  Seller Sidebar Layout                                                */
/* ------------------------------------------------------------------ */

interface SellerSidebarLayoutProps {
  user: { name: string; email: string; storeName: string; role: string }
  onLogout: () => Promise<void>
  children: React.ReactNode
}

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/seller/dashboard' },
  { label: 'Orders', icon: ShoppingCart, href: '/seller/orders' },
  { label: 'Products', icon: Package, href: '/seller/products' },
  { label: 'Inventory', icon: Boxes, href: '/seller/inventory' },
  { label: 'Coupons', icon: Ticket, href: '/seller/coupons' },
  { label: 'Delivery', icon: Truck, href: '/seller/delivery' },
  { label: 'Reviews', icon: Star, href: '/seller/reviews' },
  { label: 'Earnings', icon: Wallet, href: '/seller/earnings' },
  { label: 'Payouts', icon: CreditCard, href: '/seller/payouts' },
  { label: 'Analytics', icon: BarChart3, href: '/seller/analytics' },
  { label: 'Profile', icon: UserCircle, href: '/seller/profile' },
  { label: 'Settings', icon: Settings, href: '/seller/settings' },
]

function SellerSidebarContent({
  user,
  onLogout,
  pathname,
  onNavClick,
}: {
  user: { name: string; storeName: string }
  onLogout: () => void
  pathname: string
  onNavClick: () => void
}) {
  const { logo } = useSiteLogo()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-sidebar-border">
        {logo?.url ? (
          <img src={logo.url} alt="RealCart" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
            RC
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-sm font-bold text-sidebar-foreground tracking-tight">RealCart</span>
          <span className="text-[10px] text-sidebar-foreground/50">Seller Center</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-sidebar-primary/10 text-sidebar-primary text-xs font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user.name}</p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">{user.storeName}</p>
          </div>
        </div>
        <Button
          onClick={onLogout}
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent mt-1"
        >
          <LogOut className="h-4 w-4 mr-2" />
          <span className="text-xs">Logout</span>
        </Button>
      </div>
    </div>
  )
}

function SellerSidebarLayout({ user, onLogout, children }: SellerSidebarLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="min-h-dvh flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0">
        <SellerSidebarContent
          user={user}
          onLogout={onLogout}
          pathname={pathname}
          onNavClick={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              key="sidebar-panel"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-sidebar lg:hidden"
            >
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 right-4 text-sidebar-foreground/60 hover:text-sidebar-foreground"
              >
                <X className="h-5 w-5" />
              </button>
              <SellerSidebarContent
                user={user}
                onLogout={onLogout}
                pathname={pathname}
                onNavClick={() => setSidebarOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-foreground">{user.storeName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />
            </Button>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">{user.name}</span>
                <span className="text-[10px] text-muted-foreground">{user.email}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Seller Layout Inner                                                  */
/* ------------------------------------------------------------------ */

function SellerLayoutInner({ children }: { children: React.ReactNode }) {
  const { authenticated, loading, user, logout } = useSellerAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Redirect authenticated users from /seller root to /seller/dashboard
  useEffect(() => {
    if (!loading && authenticated && pathname === '/seller') {
      router.replace('/seller/dashboard')
    }
  }, [authenticated, loading, pathname, router])

  if (loading) {
    return <>{children}</>
  }

  // Not authenticated — show login/register page
  if (!authenticated) {
    return <>{children}</>
  }

  // Authenticated — show sidebar layout
  return (
    <SellerSidebarLayout
      user={user ? { name: user.name, email: user.email, storeName: user.storeName, role: user.role } : { name: 'Seller', email: '', storeName: '', role: 'seller' as const }}
      onLogout={logout}
    >
      {/* Verification status banner */}
      {user?.status === 'Pending' && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Account Verification Pending
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Your seller account and documents are under review. You&apos;ll get full access once verified (usually 24-48 hours).
            </p>
          </div>
        </div>
      )}
      {user?.status === 'Rejected' && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Application Rejected
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">
              Your seller application was not approved. Please check the verification notes in your Settings and re-submit required documents.
            </p>
          </div>
        </div>
      )}
      {children}
    </SellerSidebarLayout>
  )
}

/* ------------------------------------------------------------------ */
/*  Exported Layout                                                      */
/* ------------------------------------------------------------------ */

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SellerAuthProvider>
      <SellerLayoutInner>{children}</SellerLayoutInner>
    </SellerAuthProvider>
  )
}
