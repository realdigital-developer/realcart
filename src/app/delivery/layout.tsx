'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Package,
  Wallet,
  User,
  Truck,
  Bell,
  Power,
  PowerOff,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSiteLogo } from '@/hooks/use-site-logo'
import { useDeliveryBoyNotifications } from '@/hooks/use-delivery-boy-notifications'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'
import { DeliveryBoyAuthProvider } from '@/components/providers/delivery-boy-auth-provider'

/* ------------------------------------------------------------------ */
/*  Navigation Items                                                    */
/* ------------------------------------------------------------------ */

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/delivery/dashboard' },
  { label: 'Orders', icon: Package, href: '/delivery/orders' },
  { label: 'Earnings', icon: Wallet, href: '/delivery/earnings' },
  { label: 'Profile', icon: User, href: '/delivery/profile' },
]

/* ------------------------------------------------------------------ */
/*  Bottom Navbar Component                                             */
/* ------------------------------------------------------------------ */

function BottomNavbar({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1.5 px-2 rounded-xl transition-all duration-200 relative',
                isActive
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
              )}
            >
              {/* Active indicator dot */}
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-orange-500"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <div className={cn(
                'flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-orange-100 dark:bg-orange-950/40 scale-110'
                  : ''
              )}>
                <item.icon className={cn(
                  'transition-all duration-200',
                  isActive ? 'h-[18px] w-[18px]' : 'h-4 w-4'
                )} />
              </div>
              <span className={cn(
                'transition-all duration-200 leading-none',
                isActive ? 'text-[10px] font-semibold' : 'text-[10px] font-medium'
              )}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/*  Availability Toggle Button (for top bar)                            */
/* ------------------------------------------------------------------ */

function AvailabilityToggle({
  isAvailable,
  toggling,
  onToggle,
}: {
  isAvailable: boolean
  toggling: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={toggling}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 active:scale-95',
        isAvailable
          ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30'
          : 'border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:hover:bg-red-950/30',
        toggling && 'opacity-60 pointer-events-none'
      )}
      aria-label={isAvailable ? 'Go offline' : 'Go online'}
    >
      {isAvailable ? (
        <Power className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <PowerOff className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
      )}
      <div className={cn(
        'h-1.5 w-1.5 rounded-full',
        isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
      )} />
      <span className={cn(
        'text-[11px] font-semibold',
        isAvailable ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
      )}>
        {isAvailable ? 'Online' : 'Offline'}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Notification Bell with Unread Badge                                 */
/* ------------------------------------------------------------------ */

function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link href="/delivery/notifications" className="relative">
      <Button variant="ghost" size="icon" className="h-9 w-9 relative">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <motion.span
            key="bell-badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center px-1"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </Button>
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/*  Delivery Bottom Nav Layout                                          */
/* ------------------------------------------------------------------ */

interface DeliveryBottomNavLayoutProps {
  user: { name: string; mobile: string; isAvailable: boolean }
  onLogout: () => Promise<void>
  onRefreshSession: () => Promise<void>
  children: React.ReactNode
}

function DeliveryBottomNavLayout({ user, onLogout, onRefreshSession, isLoading, children }: DeliveryBottomNavLayoutProps & { isLoading?: boolean }) {
  const [isAvailable, setIsAvailable] = useState(user.isAvailable ?? true)
  const [togglingAvailability, setTogglingAvailability] = useState(false)
  const pathname = usePathname()
  const { logo } = useSiteLogo()
  const { unreadCount } = useDeliveryBoyNotifications()

  // Sync availability from user prop changes (e.g. after refreshSession)
  useEffect(() => {
    setIsAvailable(user.isAvailable ?? true)
  }, [user.isAvailable])

  const toggleAvailability = async () => {
    if (togglingAvailability) return
    setTogglingAvailability(true)
    try {
      const res = await fetch('/api/delivery-boy/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isAvailable: !isAvailable }),
      })
      if (res.ok) {
        setIsAvailable(!isAvailable)
        // Refresh auth session so other components (e.g. profile page) get updated availability
        onRefreshSession()
      }
    } catch (err) {
      console.error('Failed to toggle availability', err)
    } finally {
      setTogglingAvailability(false)
    }
  }

  // Find the current page label — include notifications route
  const currentPage = navItems.find(item => pathname === item.href || pathname.startsWith(item.href + '/'))
  const isNotificationsPage = pathname === '/delivery/notifications' || pathname.startsWith('/delivery/notifications/')
  const currentPageLabel = isNotificationsPage ? 'Notifications' : (currentPage?.label || 'Dashboard')

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Left: Logo + Page title */}
          <div className="flex items-center gap-3">
            {logo?.url ? (
              <img src={logo.url} alt="RealCart" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white font-bold text-sm">
                RC
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight leading-none">{currentPageLabel}</span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">RealCart Delivery</span>
            </div>
          </div>

          {/* Right: Availability Toggle + Bell */}
          <div className="flex items-center gap-2">
            {isLoading ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-muted bg-muted/50">
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                <span className="text-[11px] font-medium text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <AvailabilityToggle
                isAvailable={isAvailable}
                toggling={togglingAvailability}
                onToggle={toggleAvailability}
              />
            )}

            <NotificationBell unreadCount={unreadCount} />
          </div>
        </div>
      </header>

      {/* Main Content with bottom padding for navbar */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="relative">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Truck className="h-5 w-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 border-2 border-background border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Loading RealCart Delivery</p>
              <p className="text-xs text-muted-foreground mt-1">Please wait a moment...</p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Bottom Navbar */}
      <BottomNavbar pathname={pathname} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Delivery Layout Inner                                               */
/* ------------------------------------------------------------------ */

function DeliveryLayoutInner({ children }: { children: React.ReactNode }) {
  const { authenticated, loading, user, logout, refreshSession } = useDeliveryBoyAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Redirect authenticated users from /delivery root to /delivery/dashboard
  useEffect(() => {
    if (!loading && authenticated && pathname === '/delivery') {
      router.replace('/delivery/dashboard')
    }
  }, [authenticated, loading, pathname, router])

  // Not authenticated AND not loading — show children without layout (page.tsx shows auth gate)
  if (!loading && !authenticated) {
    return <>{children}</>
  }

  // Loading or authenticated — ALWAYS show full layout with navbars from the start
  return (
    <DeliveryBottomNavLayout
      user={user ? { name: user.name, mobile: user.mobile, isAvailable: user.isAvailable ?? true } : { name: 'Delivery Partner', mobile: '', isAvailable: false }}
      onLogout={logout}
      onRefreshSession={refreshSession}
      isLoading={loading}
    >
      {children}
    </DeliveryBottomNavLayout>
  )
}

/* ------------------------------------------------------------------ */
/*  Exported Layout                                                     */
/* ------------------------------------------------------------------ */

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <DeliveryBoyAuthProvider>
      <DeliveryLayoutInner>{children}</DeliveryLayoutInner>
    </DeliveryBoyAuthProvider>
  )
}
