'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  LayoutDashboard,
  ShoppingCart,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Menu,
  ChevronRight,
  Package,
  LayoutGrid,
  Warehouse,
  SlidersHorizontal,
  Star,
  FileText,
  Truck,
  Users,
  Shield,
  BarChart3,
  TrendingUp,
  Target,
  Sparkles,
  Download,
  IndianRupee,
  Receipt,
  CreditCard,
  Calculator,
  ChevronDown,
  Store,
  Ruler,
  Ticket,
  Settings2,
  Image as ImageIcon,
  Gift,
  type LucideIcon,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { useSiteLogo } from '@/hooks/use-site-logo'

/* ------------------------------------------------------------------ */
/*  Sidebar Context                                                     */
/* ------------------------------------------------------------------ */

interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
})

export function useSidebarState() {
  return useContext(SidebarContext)
}

/* ------------------------------------------------------------------ */
/*  Mounted hook (SSR-safe)                                             */
/* ------------------------------------------------------------------ */

const emptySubscribe = () => () => {}
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

/* ------------------------------------------------------------------ */
/*  Nav Item Types                                                      */
/* ------------------------------------------------------------------ */

interface NavItemSimple {
  type: 'link'
  label: string
  icon: LucideIcon
  href: string
}

interface NavSubItem {
  label: string
  icon: LucideIcon
  href: string
  badge?: string
}

interface NavItemDropdown {
  type: 'dropdown'
  label: string
  icon: LucideIcon
  subItems: NavSubItem[]
}

type NavItem = NavItemSimple | NavItemDropdown

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard', type: 'link' },
  {
    type: 'dropdown',
    label: 'Product Management',
    icon: Package,
    subItems: [
      { label: 'Products', icon: Package, href: '/admin/products' },
      { label: 'Categories', icon: LayoutGrid, href: '/admin/categories' },
      { label: 'Inventory', icon: Warehouse, href: '/admin/inventory' },
      { label: 'Attributes', icon: SlidersHorizontal, href: '/admin/attributes' },
      { label: 'Size Charts', icon: Ruler, href: '/admin/size-charts' },
      { label: 'Tags', icon: Target, href: '/admin/tags' },
      { label: 'Highlights', icon: Sparkles, href: '/admin/highlights' },
    ],
  },
  {
    type: 'dropdown',
    label: 'Orders Management',
    icon: ShoppingCart,
    subItems: [
      { label: 'Orders', icon: ShoppingCart, href: '/admin/orders' },
      { label: 'Reviews', icon: Star, href: '/admin/reviews' },
    ],
  },
  {
    type: 'dropdown',
    label: 'User Management',
    icon: Users,
    subItems: [
      { label: 'Customers', icon: Users, href: '/admin/customers' },
      { label: 'Sellers', icon: Store, href: '/admin/sellers' },
    ],
  },
  {
    type: 'dropdown',
    label: 'Logistics',
    icon: Truck,
    subItems: [
      { label: 'Delivery Boys', icon: Truck, href: '/admin/delivery-boys' },
      { label: 'Delivery Settings', icon: Settings2, href: '/admin/delivery' },
    ],
  },
  {
    type: 'dropdown',
    label: 'Reports & Analytics',
    icon: BarChart3,
    subItems: [
      { label: 'Sales Report', icon: BarChart3, href: '/admin/sales-report' },
      { label: 'Traffic', icon: TrendingUp, href: '/admin/traffic' },
      { label: 'Conversions', icon: Target, href: '/admin/conversions' },
      { label: 'Exports', icon: Download, href: '/admin/exports' },
    ],
  },
  {
    type: 'dropdown',
    label: 'Finance Management',
    icon: IndianRupee,
    subItems: [
      { label: 'Revenue', icon: IndianRupee, href: '/admin/revenue'},
      { label: 'Expenses', icon: Receipt, href: '/admin/expenses' },
      { label: 'Payouts', icon: CreditCard, href: '/admin/payouts' },
      { label: 'Tax', icon: Calculator, href: '/admin/tax' },
    ],
  },
  {
    type: 'dropdown',
    label: 'Marketing',
    icon: Ticket,
    subItems: [
      { label: 'Hero Slides', icon: ImageIcon, href: '/admin/hero-slides' },
      { label: 'Coupons', icon: Ticket, href: '/admin/coupons' },
      { label: 'Referral Program', icon: Gift, href: '/admin/referral' },
    ],
  },
  { label: 'Settings', icon: Settings, href: '/admin/settings', type: 'link' },
]

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                   */
/* ------------------------------------------------------------------ */

const dropdownVariants = {
  hidden: {
    height: 0,
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1],
      when: 'afterChildren',
    },
  },
  visible: {
    height: 'auto',
    opacity: 1,
    transition: {
      duration: 0.25,
      ease: [0.4, 0, 0.2, 1],
      when: 'beforeChildren',
      staggerChildren: 0.03,
    },
  },
}

const subItemVariants = {
  hidden: {
    opacity: 0,
    x: -8,
    transition: { duration: 0.15 },
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  },
}

const chevronVariants = {
  closed: { rotate: 0, transition: { duration: 0.2 } },
  open: { rotate: 180, transition: { duration: 0.2 } },
}

/* ------------------------------------------------------------------ */
/*  Dropdown Nav Group                                                   */
/* ------------------------------------------------------------------ */

function DropdownNavGroup({
  item,
  collapsed,
  onNavClick,
  pathname,
  openDropdowns,
  toggleDropdown,
}: {
  item: NavItemDropdown
  collapsed: boolean
  onNavClick?: () => void
  pathname: string
  openDropdowns: Set<string>
  toggleDropdown: (label: string) => void
}) {
  const isOpen = openDropdowns.has(item.label)
  const Icon = item.icon

  // Check if any sub-item is active
  const hasActiveChild = item.subItems.some(
    (sub) => pathname === sub.href || pathname.startsWith(sub.href + '/')
  )

  const trigger = (
    <button
      onClick={() => toggleDropdown(item.label)}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-200 w-full',
        'h-11 sm:h-10',
        collapsed && 'justify-center px-0',
        hasActiveChild
          ? 'bg-primary/10 text-primary shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', hasActiveChild && 'text-primary')} />
      {!collapsed && (
        <>
          <span className="whitespace-nowrap flex-1 text-left">{item.label}</span>
          <motion.span
            variants={chevronVariants}
            animate={isOpen ? 'open' : 'closed'}
            className="shrink-0"
          >
            <ChevronDown className={cn('h-4 w-4', hasActiveChild && 'text-primary')} />
          </motion.span>
        </>
      )}
    </button>
  )

  // Collapsed: show tooltip with sub-items
  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="p-1.5 font-medium">
          <p className="px-2 py-1 text-xs font-semibold text-foreground mb-1">{item.label}</p>
          <Separator className="mb-1" />
          {item.subItems.map((sub) => (
            <Link
              key={sub.href}
              href={sub.href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
                pathname === sub.href
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <sub.icon className="h-3.5 w-3.5" />
              {sub.label}
            </Link>
          ))}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Expanded: show dropdown with animation
  return (
    <div className="space-y-0.5">
      {trigger}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="overflow-hidden"
          >
            <div className="ml-3 pl-3 border-l border-border/40 space-y-0.5 py-0.5">
              {item.subItems.map((sub) => {
                const isSubActive = pathname === sub.href || pathname.startsWith(sub.href + '/')
                return (
                  <motion.div key={sub.href} variants={subItemVariants}>
                    <Link
                      href={sub.href}
                      onClick={onNavClick}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200',
                        isSubActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground/70 hover:bg-accent/60 hover:text-accent-foreground',
                      )}
                    >
                      <sub.icon className={cn('h-4 w-4 shrink-0', isSubActive && 'text-primary')} />
                      <span className="whitespace-nowrap">{sub.label}</span>
                      {sub.badge && (
                        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {sub.badge}
                        </span>
                      )}
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sidebar Content (shared between desktop + mobile)                   */
/* ------------------------------------------------------------------ */

interface SidebarContentProps {
  collapsed: boolean
  user: { name: string; email: string; role: string }
  onLogout: () => void
  onNavClick?: () => void
}

function SidebarContent({ collapsed, user, onLogout, onNavClick }: SidebarContentProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const { logo } = useSiteLogo()
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set())

  const toggleDropdown = useCallback((label: string) => {
    setOpenDropdowns((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }, [])

  // Auto-open dropdown that contains the active route
  useEffect(() => {
    navItems.forEach((item) => {
      if (item.type === 'dropdown') {
        const hasActive = item.subItems.some(
          (sub) => pathname === sub.href || pathname.startsWith(sub.href + '/')
        )
        if (hasActive) {
          setOpenDropdowns((prev) => {
            if (prev.has(item.label)) return prev
            const next = new Set(prev)
            next.add(item.label)
            return next
          })
        }
      }
    })
  }, [pathname])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Logo area ── */}
      <div className={cn('flex items-center gap-3 px-4 h-16 shrink-0', collapsed && 'justify-center px-2')}>
        {logo ? (
          <div className="flex items-center justify-center w-9 h-9 shrink-0">
            <Image
              src={logo.url}
              alt="Site Logo"
              width={36}
              height={36}
              className="w-full h-full object-contain"
              unoptimized
            />
          </div>
        ) : (
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 text-primary-foreground font-bold text-sm shrink-0">
            RC
          </div>
        )}
        {!collapsed && (
          <div className="overflow-hidden">
            <span className="font-semibold text-base tracking-tight whitespace-nowrap">RealCart</span>
            <span className="text-muted-foreground text-xs ml-1.5">Admin</span>
          </div>
        )}
      </div>

      <Separator className="opacity-50" />

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto overscroll-contain">
        {navItems.map((item) => {
          if (item.type === 'link') {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon

            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-200',
                  'h-11 sm:h-10',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                {isActive && !collapsed && (
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.href} delayDuration={0}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={12} className="font-medium">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return link
          }

          // Dropdown item
          return (
            <DropdownNavGroup
              key={item.label}
              item={item}
              collapsed={collapsed}
              onNavClick={onNavClick}
              pathname={pathname}
              openDropdowns={openDropdowns}
              toggleDropdown={toggleDropdown}
            />
          )
        })}
      </nav>

      <Separator className="opacity-50" />

      {/* ── Bottom section ── */}
      <div className="p-3 space-y-1 shrink-0">
        {/* Theme toggle */}
        {mounted && (
          collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className={cn(
                    'flex items-center justify-center w-full rounded-xl text-sm transition-all duration-200',
                    'h-11 sm:h-10',
                    'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
                  )}
                >
                  {theme === 'dark' ? (
                    <Sun className="h-5 w-5 text-amber-400" />
                  ) : (
                    <Moon className="h-5 w-5 text-primary" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={12} className="font-medium">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 w-full text-sm font-medium transition-all duration-200',
                'h-11 sm:h-10',
                'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
              )}
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5 text-amber-400 shrink-0" />
              ) : (
                <Moon className="h-5 w-5 text-primary shrink-0" />
              )}
              <span className="whitespace-nowrap">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
            </button>
          )
        )}

        {/* Logout */}
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={onLogout}
                className={cn(
                  'flex items-center justify-center w-full rounded-xl text-sm transition-all duration-200',
                  'h-11 sm:h-10',
                  'text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20',
                )}
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="font-medium">
              Logout
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onLogout}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 w-full text-sm font-medium transition-all duration-200',
              'h-11 sm:h-10',
              'text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20',
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap">Logout</span>
          </button>
        )}

        {/* User info */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-xl bg-secondary/40">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
              {user.name?.charAt(0) || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Admin Sidebar Provider (wraps the whole admin layout)               */
/* ------------------------------------------------------------------ */

interface AdminSidebarProviderProps {
  children: React.ReactNode
  user: { name: string; email: string; role: string }
  onLogout: () => void
}

export function AdminSidebarProvider({ children, user, onLogout }: AdminSidebarProviderProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close mobile sidebar on route change
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Get page title from pathname
  const getPageTitle = () => {
    if (pathname === '/admin/dashboard') return 'Dashboard'
    if (pathname === '/admin/orders') return 'Orders'
    if (pathname === '/admin/settings') return 'Settings'
    if (pathname === '/admin') return 'Admin'

    // Check dropdown sub-items
    for (const item of navItems) {
      if (item.type === 'dropdown') {
        for (const sub of item.subItems) {
          if (pathname === sub.href || pathname.startsWith(sub.href + '/')) {
            return sub.label
          }
        }
      }
    }

    return 'Admin'
  }

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      <div className="flex h-dvh overflow-hidden bg-background">
        {/* ── Desktop sidebar ── */}
        <aside
          className={cn(
            'hidden lg:flex flex-col border-r border-border/50 bg-card/50 backdrop-blur-sm shrink-0 transition-all duration-300 ease-in-out',
            collapsed ? 'w-[68px]' : 'w-[260px]',
          )}
        >
          <SidebarContent collapsed={collapsed} user={user} onLogout={onLogout} />

          {/* Collapse toggle */}
          <div className="border-t border-border/50 p-2 shrink-0">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center w-full h-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </aside>

        {/* ── Mobile sidebar (Sheet) ── */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[85vw] max-w-[300px] p-0 bg-card border-border/50 gap-0 overflow-hidden"
          >
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            {/* Sidebar content - not collapsed on mobile */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <SidebarContent
                collapsed={false}
                user={user}
                onLogout={() => {
                  setMobileOpen(false)
                  onLogout()
                }}
                onNavClick={() => setMobileOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Main content area ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar */}
          <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />
            <div className="relative flex items-center justify-between h-14 px-3 sm:px-6 safe-area-x">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {/* Mobile menu button */}
                <button
                  onClick={() => setMobileOpen(true)}
                  className="lg:hidden flex items-center justify-center h-10 w-10 -ml-1 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80 transition-colors"
                >
                  <Menu className="h-5 w-5" />
                </button>

                {/* Page title - visible on all screens */}
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-sm font-semibold truncate">{getPageTitle()}</h1>
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Online badge - compact on mobile, expanded on desktop */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-full bg-secondary/80">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] sm:text-xs text-muted-foreground hidden xs:inline">Online</span>
                </div>

                {/* Mobile quick theme toggle */}
                <MobileThemeToggle />
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto overscroll-y-contain">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  Mobile-only theme toggle in top bar                                 */
/* ------------------------------------------------------------------ */

function MobileThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  if (!mounted) return null

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="flex lg:hidden items-center justify-center h-10 w-10 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80 transition-colors"
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 text-amber-400" />
      ) : (
        <Moon className="h-5 w-5 text-primary" />
      )}
    </button>
  )
}
