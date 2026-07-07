'use client'

import { motion } from 'framer-motion'
import { Home, LayoutGrid, User, ShoppingCart, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCart } from '@/components/providers/cart-provider'
import { useLanguage } from '@/components/providers/language-provider'

export type BottomTab = 'home' | 'categories' | 'cart' | 'orders' | 'account'

interface BottomNavbarProps {
  activeTab: BottomTab
  onTabChange: (tab: BottomTab) => void
  /** When false the bar slides off-screen and becomes non-interactive (never unmounted) */
  visible?: boolean
}

export function BottomNavbar({ activeTab, onTabChange, visible = true }: BottomNavbarProps) {
  const { totalItems: cartCount } = useCart()
  const { t } = useLanguage()

  const tabs: { id: BottomTab; label: string; icon: React.ReactNode; activeIcon: React.ReactNode; badge?: number }[] = [
    {
      id: 'home',
      label: t('nav.home'),
      icon: <Home className="h-[22px] w-[22px]" />,
      activeIcon: <Home className="h-[22px] w-[22px]" strokeWidth={2.5} />,
    },
    {
      id: 'categories',
      label: t('nav.categories'),
      icon: <LayoutGrid className="h-[22px] w-[22px]" />,
      activeIcon: <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={2.5} />,
    },
    {
      id: 'cart',
      label: t('nav.cart'),
      icon: <ShoppingCart className="h-[22px] w-[22px]" />,
      activeIcon: <ShoppingCart className="h-[22px] w-[22px]" strokeWidth={2.5} />,
      badge: cartCount,
    },
    {
      id: 'orders',
      label: t('nav.orders'),
      icon: <ClipboardList className="h-[22px] w-[22px]" />,
      activeIcon: <ClipboardList className="h-[22px] w-[22px]" strokeWidth={2.5} />,
    },
    {
      id: 'account',
      label: t('nav.account'),
      icon: <User className="h-[22px] w-[22px]" />,
      activeIcon: <User className="h-[22px] w-[22px]" strokeWidth={2.5} />,
    },
  ]

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'transition-transform duration-300 ease-in-out',
        // When hidden, slide below viewport and disable pointer events
        visible ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'
      )}
      style={{ display: visible ? 'block' : 'none' }}
      aria-hidden={!visible}
    >
      <div className="bg-white dark:bg-gray-950 border-t border-gray-200/80 dark:border-gray-800 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-around h-16 px-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative group"
              >
                {/* Active indicator — filled emerald pill behind icon */}
                {isActive && (
                  <motion.div
                    layoutId="bottomNavBg"
                    className="absolute top-1.5 left-1/2 -translate-x-1/2 w-12 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}

                {/* Icon with badge */}
                <div className="relative z-10">
                  <motion.div
                    animate={{
                      scale: isActive ? 1.15 : 1,
                      y: isActive ? -2 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={cn(
                      'transition-colors duration-200',
                      isActive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 group-active:scale-95'
                    )}
                  >
                    {isActive ? tab.activeIcon : tab.icon}
                  </motion.div>

                  {/* Badge */}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
                    >
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </motion.span>
                  )}
                </div>

                {/* Label */}
                <motion.span
                  animate={{
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#059669' : undefined,
                  }}
                  className={cn(
                    'text-[10px] leading-tight transition-colors duration-200',
                    isActive
                      ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                  )}
                >
                  {tab.label}
                </motion.span>

                {/* Bottom active dot */}
                {isActive && (
                  <motion.div
                    layoutId="bottomNavDot"
                    className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full bg-emerald-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </div>
        {/* Safe area spacer for iOS */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </nav>
  )
}
