'use client'

import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShoppingCart, Heart, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSiteLogo } from '@/hooks/use-site-logo'
import { useCart } from '@/components/providers/cart-provider'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import { useLanguage } from '@/components/providers/language-provider'

export function Navbar() {
  const { authenticated } = useCustomerAuth()
  const router = useRouter()
  const { logo } = useSiteLogo()
  const { totalItems: cartCount } = useCart()
  const { totalItems: wishlistCount } = useWishlist()
  const { unreadCount: notificationCount } = useUnreadNotifications()
  const { t } = useLanguage()

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full bg-gradient-to-b from-[#00a885] to-[#5fd3d3]"
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => router.push('/customer')}
          >
            {logo?.url ? (
              <img src={logo.url} alt={t('brand')} className="h-7 w-7 rounded-lg object-cover bg-white/20 p-0.5" />
            ) : (
              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/20 text-white font-bold text-xs">
                RC
              </div>
            )}
            <span className="text-base font-bold tracking-tight text-white">
              {t('brand')}
            </span>
          </motion.div>

          {/* Actions - White icons on colored background (Meesho style) */}
          <div className="flex items-center gap-1">
            {authenticated && (
              <>
                <Button variant="ghost" size="icon" className="hidden sm:flex h-9 w-9 text-white hover:bg-white/10" onClick={() => router.push('/customer?tab=notifications')}>
                  <Bell className="h-[22px] w-[22px]" />
                  {notificationCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-white text-emerald-600 text-[10px] font-bold">
                      {notificationCount > 99 ? '99' : notificationCount}
                    </span>
                  )}
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 relative text-white hover:bg-white/10" onClick={() => router.push('/customer?tab=wishlist')}>
                  <Heart className="h-[22px] w-[22px]" />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-white text-emerald-600 text-[10px] font-bold">
                      {wishlistCount > 99 ? '99' : wishlistCount}
                    </span>
                  )}
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 relative text-white hover:bg-white/10" onClick={() => router.push('/customer?tab=cart')}>
                  <ShoppingCart className="h-[22px] w-[22px]" />
                  {cartCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-white text-emerald-600 text-[10px] font-bold">
                      {cartCount > 99 ? '99' : cartCount}
                    </span>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  )
}
