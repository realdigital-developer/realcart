'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useIsMobile } from '@/hooks/use-mobile'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ShoppingBag,
  Heart,
  Package,
  MapPin,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  User,
  Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}

/* ------------------------------------------------------------------ */
/*  Context                                                             */
/* ------------------------------------------------------------------ */

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
})

export function useCustomerSidebar() {
  return useContext(SidebarContext)
}

/* ------------------------------------------------------------------ */
/*  Nav Items                                                           */
/* ------------------------------------------------------------------ */

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/customer/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'My Orders', href: '/customer/orders', icon: <ShoppingBag className="h-4 w-4" /> },
  { label: 'Wishlist', href: '/customer/wishlist', icon: <Heart className="h-4 w-4" /> },
  { label: 'My Products', href: '/customer/products', icon: <Package className="h-4 w-4" /> },
  { label: 'Addresses', href: '/customer/addresses', icon: <MapPin className="h-4 w-4" /> },
  { label: 'Settings', href: '/customer/settings', icon: <Settings className="h-4 w-4" /> },
]

/* ------------------------------------------------------------------ */
/*  Sidebar Content (shared desktop + mobile)                           */
/* ------------------------------------------------------------------ */

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { collapsed } = useCustomerSidebar()
  const { user, logout } = useCustomerAuth()
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = useCallback(async () => {
    await logout()
    router.replace('/customer')
  }, [logout, router])

  const handleNav = useCallback((href: string) => {
    router.push(href)
    onNavigate?.()
  }, [router, onNavigate])

  return (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-5 border-b border-border/40',
        collapsed && 'justify-center px-2'
      )}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-sm shrink-0 shadow-lg shadow-emerald-500/20">
          RC
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold tracking-tight">RealCart</span>
            <span className="text-[10px] text-muted-foreground">Customer Panel</span>
          </div>
        )}
      </div>

      {/* Nav Links */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <motion.button
                key={item.href}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleNav(item.href)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
                title={collapsed ? item.label : undefined}
              >
                <span className={cn('shrink-0', isActive && 'text-emerald-600 dark:text-emerald-400')}>
                  {item.icon}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </motion.button>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Bottom Section */}
      <div className="border-t border-border/40 px-2 py-3 space-y-1">
        {/* Theme toggle removed — customer panel is always light mode */}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-500 hover:bg-red-500/10 transition-all',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>

        {/* User Info */}
        {!collapsed && user && (
          <>
            <Separator className="my-2" />
            <div className="flex items-center gap-2.5 px-3 py-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600">
                <User className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate">{user.name}</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Phone className="h-2.5 w-2.5" />
                  +91 {user.mobile}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page Title Mapping                                                  */
/* ------------------------------------------------------------------ */

function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/customer/dashboard': 'Dashboard',
    '/customer/orders': 'My Orders',
    '/customer/wishlist': 'Wishlist',
    '/customer/products': 'My Products',
    '/customer/addresses': 'Addresses',
    '/customer/settings': 'Settings',
  }
  return map[pathname] || 'Customer Panel'
}

/* ------------------------------------------------------------------ */
/*  CustomerSidebarProvider (Main Wrapper)                              */
/* ------------------------------------------------------------------ */

export function CustomerSidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isMobile = useIsMobile()
  const pathname = usePathname()

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      <div className="flex h-dvh overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        {!isMobile && (
          <motion.aside
            animate={{ width: collapsed ? 68 : 260 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="shrink-0 border-r border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden"
          >
            <SidebarContent />
          </motion.aside>
        )}

        {/* Mobile Sidebar */}
        {isMobile && (
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="w-[280px] p-0">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border/40 bg-background/80 backdrop-blur-lg">
            <div className="flex items-center gap-3">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(true)}
                  className="h-9 w-9"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              <h1 className="text-lg font-semibold tracking-tight">{getPageTitle(pathname)}</h1>
            </div>
            <div className="flex items-center gap-2">
              {!collapsed && !isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCollapsed(true)}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              {collapsed && !isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCollapsed(false)}
                  className="h-8 w-8"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto overscroll-y-contain">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
