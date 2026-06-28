'use client'

import { useState, useRef, useEffect } from 'react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { motion } from 'framer-motion'
import {
  User,
  Heart,
  Bell,
  ArrowRight,
  ArrowLeft,
  Lock,
  MapPin,
  HelpCircle,
  CreditCard,
  Wallet,
  Globe,
  Share2,
  Store,
  Gift,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'

interface AccountPageProps {
  onNavigate?: (tab: string) => void
  onBack?: () => void
}

export function AccountPage({ onNavigate, onBack }: AccountPageProps) {
  const { user, logout } = useCustomerAuth()
  const { totalItems: wishlistCount } = useWishlist()
  const { unreadCount: notificationCount } = useUnreadNotifications()

  // ── Modern scroll approach ──
  // Instead of morphing a single header element (which causes jank due to
  // simultaneous layout transitions), we use TWO separate layers:
  //
  // 1. A FIXED compact header (always at top, opacity-controlled)
  //    — Only opacity changes (GPU-accelerated, zero layout work)
  //    — Fades in when user scrolls past the profile section
  //
  // 2. A NORMAL scrollable profile section (scrolls away with content)
  //    — No sticky element, no state changes, no transitions
  //    — Just normal document flow — scrolls naturally
  //
  // This is the approach used by Meesho, Amazon, Flipkart — zero jank
  // because there are NO layout changes during scroll.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showCompactHeader, setShowCompactHeader] = useState(false)
  const compactRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        // Show compact header when profile section has scrolled away
        // 140px ≈ avatar (80) + padding + back button + margin
        const shouldShow = el.scrollTop > 120
        if (shouldShow !== compactRef.current) {
          compactRef.current = shouldShow
          setShowCompactHeader(shouldShow)
        }
      })
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const displayName = user?.name || 'Customer'
  const displayMobile = user?.mobile ? `+91 ${user.mobile}` : 'Tap to view profile'
  const profileImageUrl = user?.profileImage || null

  const menuItems = [
    { icon: <MapPin className="h-5 w-5" />, label: 'Addresses', desc: 'Manage delivery addresses', tab: 'addresses', badge: undefined },
    { icon: <Bell className="h-5 w-5" />, label: 'Notifications', desc: notificationCount > 0 ? `${notificationCount} unread notification${notificationCount !== 1 ? 's' : ''}` : 'Manage your alerts', tab: 'notifications', badge: notificationCount > 0 ? notificationCount : undefined },
    { icon: <CreditCard className="h-5 w-5" />, label: 'Payment & Refund', desc: 'Manage payments and refunds', tab: 'payment-refund', badge: undefined },
    { icon: <Wallet className="h-5 w-5" />, label: 'Bank & UPI Details', desc: 'Manage your bank and UPI info', tab: 'bank-upi', badge: undefined },
    { icon: <Globe className="h-5 w-5" />, label: 'Change Language', desc: 'Select your preferred language', tab: 'language', badge: undefined },
    { icon: <Share2 className="h-5 w-5" />, label: 'Shared Products', desc: 'Products you have shared', tab: 'shared-products', badge: undefined },
    { icon: <Wallet className="h-5 w-5" />, label: 'RealCart Balance', desc: 'View balance and transactions', tab: 'wallet', badge: undefined },
    { icon: <Gift className="h-5 w-5" />, label: 'Referral', desc: 'Invite friends and earn rewards', tab: 'referral', badge: undefined },
    { icon: <HelpCircle className="h-5 w-5" />, label: 'Help & Support', desc: 'Get help and assistance', tab: 'help', badge: undefined },
  ]

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-[calc(100dvh)] relative">
      {/* ── FIXED COMPACT HEADER (layer 1) ──
          Always positioned at the top. Fades in via opacity when the user
          scrolls past the expanded profile. Only opacity changes — zero
          layout work, GPU-accelerated, perfectly smooth.
          Uses pointer-events to toggle interactivity with the opacity. */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 z-40 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600',
          'transition-opacity duration-200 ease-out',
          showCompactHeader ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center gap-2 px-3 h-12">
          {onBack && (
            <button
              onClick={onBack}
              className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          )}
          {/* Small avatar */}
          <div
            className="rounded-full bg-white/20 flex items-center justify-center text-white overflow-hidden flex-shrink-0"
            style={{ width: 32, height: 32, borderWidth: 1.5, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.3)' }}
            onClick={() => onNavigate?.('profile')}
          >
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white truncate">{displayName}</h2>
            <p className="text-[10px] text-white/70 truncate">{displayMobile}</p>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT (layer 2) ──
          The profile section is in NORMAL document flow — it scrolls away
          naturally with the rest of the content. No sticky element,
          no morphing, no state-driven layout changes. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">

        {/* ── Expanded Profile Section (scrolls away naturally) ── */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600">
          {/* Back button row */}
          <div className="flex items-center h-9 px-3 pt-2">
            {onBack && (
              <button
                onClick={onBack}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-white" />
              </button>
            )}
          </div>

          {/* Profile content — always expanded, never morphs */}
          <div className="flex flex-col items-center pt-2 pb-5 px-4">
            {/* Avatar — large, centered */}
            <div
              className="rounded-full bg-white/20 flex items-center justify-center text-white cursor-pointer hover:bg-white/30 overflow-hidden shadow-lg"
              style={{
                width: 80, height: 80,
                borderWidth: 2, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.3)',
                boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
              }}
              onClick={() => onNavigate?.('profile')}
            >
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="h-10 w-10" />
              )}
            </div>

            {/* Name + mobile — centered below avatar */}
            <div className="flex flex-col items-center mt-3">
              <h2 className="font-bold text-white text-lg text-center">{displayName}</h2>
              <p className="text-white/70 text-xs text-center mt-0.5">{displayMobile}</p>
            </div>
          </div>
        </div>

        {/* ── Quick Actions — Compact card view (Wishlist + Followed Sellers) ──
            Meesho-style 2-column grid with compact cards. Each card has
            an icon, label, and count/description. Replaces the old
            single full-width wishlist card. */}
        <div className="px-4 pt-4 pb-1">
          <div className="grid grid-cols-2 gap-3">
            {/* Wishlist Card */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              onClick={() => onNavigate?.('wishlist')}
              className="relative flex flex-col items-center justify-center bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 hover:border-red-200 dark:hover:border-red-800 hover:shadow-md transition-all group"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-400 to-pink-500 flex items-center justify-center shadow-sm mb-2 group-hover:scale-105 transition-transform">
                <Heart className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Wishlist</span>
              {wishlistCount > 0 ? (
                <span className="text-[11px] text-gray-400 mt-0.5">{wishlistCount} item{wishlistCount !== 1 ? 's' : ''}</span>
              ) : (
                <span className="text-[11px] text-gray-400 mt-0.5">Your saved items</span>
              )}
            </motion.button>

            {/* Followed Sellers Card */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              onClick={() => onNavigate?.('followed-shop')}
              className="relative flex flex-col items-center justify-center bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-md transition-all group"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm mb-2 group-hover:scale-105 transition-transform">
                <Store className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Followed Sellers</span>
              <span className="text-[11px] text-gray-400 mt-0.5">Sellers you follow</span>
            </motion.button>
          </div>
        </div>

        {/* Menu Items */}
        <div className="p-4 space-y-2">
          {menuItems.map((item, i) => (
            <motion.button
              key={item.tab}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              onClick={() => {
                if (onNavigate) {
                  onNavigate(item.tab)
                }
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.label}</p>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="text-[10px] bg-red-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">{item.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            </motion.button>
          ))}

          {/* Logout Button */}
          <Button
            onClick={logout}
            variant="outline"
            className="w-full mt-4 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl h-11"
          >
            <Lock className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  )
}
