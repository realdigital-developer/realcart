'use client'

import { Search, ShoppingCart, ArrowLeft, Heart } from 'lucide-react'
import { useCart } from '@/components/providers/cart-provider'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useLanguage } from '@/components/providers/language-provider'

/**
 * Reusable sticky page header that replicates the exact top navbar
 * used by the customer panel's Categories page.
 *
 * Layout (left → right):
 *   [Back arrow] [Title]                [Search] [Wishlist•badge] [Cart•badge]
 *
 * The three right-side icon buttons navigate via the optional `onNavigate`
 * callback (same contract as CategoriesPage). Badges show live cart &
 * wishlist item counts pulled from the CartProvider / WishlistProvider.
 *
 * Optional `headerExtra` lets a page inject its own right-aligned controls
 * (e.g. a Refresh button) BEFORE the Search/Wishlist/Cart icon row — this
 * keeps the reference look intact while preserving page-specific actions.
 * A page can also append content beneath the title bar via `children`,
 * which renders inside the same sticky header container (e.g. the filter
 * tab row on the Notifications page).
 */
export interface PageHeaderProps {
  /** Page title shown next to the back arrow. */
  title: string
  /** Optional back handler. When provided, the back arrow is rendered. */
  onBack?: () => void
  /** Optional navigation callback (tab, params?) — used by the 3 icon buttons. */
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  /** Optional right-aligned controls rendered before the Search/Wishlist/Cart icons. */
  headerExtra?: React.ReactNode
  /** Optional content rendered beneath the title bar, inside the sticky header. */
  children?: React.ReactNode
}

export function PageHeader({
  title,
  onBack,
  onNavigate,
  headerExtra,
  children,
}: PageHeaderProps) {
  const { totalItems: cartCount } = useCart()
  const { totalItems: wishlistCount } = useWishlist()
  const { t } = useLanguage()

  return (
    <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex-shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={t('common.back')}
            >
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
          )}
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">
            {title}
          </h1>
        </div>

        {/* Right Icons: [page-specific extra] → Search → Wishlist → Cart */}
        <div className="flex items-center gap-0.5">
          {headerExtra}

          {/* Search Icon */}
          <button
            onClick={() => onNavigate?.('search')}
            className="h-9 w-9 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            aria-label={t('common.search')}
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Wishlist Icon with Badge */}
          <button
            onClick={() => onNavigate?.('wishlist')}
            className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            aria-label={t('common.wishlist')}
          >
            <Heart className="h-5 w-5" />
            {wishlistCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                {wishlistCount > 99 ? '99+' : wishlistCount}
              </span>
            )}
          </button>

          {/* Cart Icon with Badge */}
          <button
            onClick={() => onNavigate?.('cart')}
            className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            aria-label={t('common.cart')}
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {children}
    </div>
  )
}
