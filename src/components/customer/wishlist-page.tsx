'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heart,
  ShoppingCart,
  Package,
  ShoppingBag,
  Trash2,
  BadgeCheck,
  Truck,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useCart } from '@/components/providers/cart-provider'
import { WishlistItem } from './types'
import { useLanguage } from '@/components/providers/language-provider'

function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const getProductGradient = (name: string) => {
  const gradients = [
    'from-rose-200 to-pink-200 dark:from-rose-900/40 dark:to-pink-900/40',
    'from-violet-200 to-purple-200 dark:from-violet-900/40 dark:to-purple-900/40',
    'from-blue-200 to-indigo-200 dark:from-blue-900/40 dark:to-indigo-900/40',
    'from-cyan-200 to-teal-200 dark:from-cyan-900/40 dark:to-teal-900/40',
    'from-emerald-200 to-green-200 dark:from-emerald-900/40 dark:to-green-200',
    'from-amber-200 to-yellow-200 dark:from-amber-900/40 dark:to-yellow-900/40',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}

/* ------------------------------------------------------------------ */
/*  Wishlist Item Card                                                  */
/* ------------------------------------------------------------------ */

function WishlistItemCard({ item, onRemove, onAddToCart, inCart }: {
  item: WishlistItem
  onRemove: () => void
  onAddToCart: () => void
  inCart: boolean
}) {
  const router = useRouter()
  const isInStock = item.stock > 0
  const { t } = useLanguage()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden group hover:shadow-md transition-shadow"
    >
      <div className="flex gap-3 p-3">
        {/* Image */}
        <button
          onClick={() => {
            router.push(`/customer/product/${item.productId}`)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 relative"
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className={cn('w-full h-full bg-gradient-to-br flex items-center justify-center', getProductGradient(item.name))}>
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          )}
          {/* Stock Status Indicator */}
          <div className={cn(
            'absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold',
            isInStock
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
          )}>
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              isInStock ? 'bg-emerald-500' : 'bg-red-500'
            )} />
            {isInStock ? t('common.inStock') : t('common.outOfStock')}
          </div>
        </button>

        {/* Details */}
        <div className="flex-1 min-w-0 flex flex-col">
          {item.brand && (
            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <BadgeCheck className="h-3 w-3" />
              {item.brand}
            </p>
          )}
          <button
            onClick={() => {
              router.push(`/customer/product/${item.productId}`)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-tight mt-0.5 hover:text-emerald-600 transition-colors text-left"
          >
            {item.name}
          </button>

          {item.seller && (
            <p className="text-[10px] text-gray-400 mt-1">Seller: {item.seller}</p>
          )}

          {/* Price */}
          <div className="flex items-baseline gap-2 mt-auto pt-1.5">
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">{formatPrice(item.effectivePrice)}</span>
            {item.hasDiscount && (
              <>
                <span className="text-xs text-gray-400 line-through">{formatPrice(item.price)}</span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{item.discountPercent}% off</span>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={onAddToCart}
              disabled={!isInStock || inCart}
              className={cn(
                'flex-1 h-9 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors',
                inCart
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  : isInStock
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              )}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {inCart ? t('wishlist.inCart') : isInStock ? t('wishlist.addToCart') : t('wishlist.outOfStockShort')}
            </button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onRemove}
              className="h-9 w-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Wishlist Page                                                  */
/* ------------------------------------------------------------------ */

interface WishlistPageProps {
  onNavigate?: (tab: string) => void
  onBack?: () => void
}

export function WishlistPage({ onNavigate, onBack }: WishlistPageProps = {}) {
  const router = useRouter()
  const { items, totalItems, removeFromWishlist, loading } = useWishlist()
  const { addToCart, isInCart, totalItems: cartCount } = useCart()
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // Toast notification for add-to-cart feedback (success / failure / redirect)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show a toast message for a few seconds, then auto-dismiss.
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // Auto-focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showSearch])

  const handleCloseSearch = () => {
    setShowSearch(false)
    setSearchQuery('')
  }

  // Filter wishlist items by search
  const filteredItems = searchQuery
    ? items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.brand && item.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.seller && item.seller.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : items

  const handleAddToCart = async (item: WishlistItem) => {
    // If already in cart, take the user to the cart so they can see it.
    if (isInCart(item.productId)) {
      onNavigate?.('cart')
      return
    }
    try {
      // addToCart returns true ONLY when the item was actually added to the
      // cart (server confirmed for authenticated users, or localStorage
      // updated for guests). It returns false when the server rejects the
      // add — most commonly because the product has variant attributes
      // (Color / Size / etc.) that require selection, but also when the
      // product is unavailable, out of stock, or the server errors.
      const success = await addToCart({
        productId: item.productId,
        name: item.name,
        price: item.price,
        sellingPrice: item.sellingPrice,
        effectivePrice: item.effectivePrice,
        hasDiscount: item.hasDiscount,
        discountPercent: item.discountPercent,
        imageUrl: item.imageUrl,
        stock: item.stock,
        seller: item.seller,
        brand: item.brand,
      })

      if (!success) {
        // Add to cart failed — do NOT remove from wishlist (prevents data
        // loss where the item would otherwise disappear from both wishlist
        // and cart). Redirect to the product detail page so the user can
        // select the required variant or see why it couldn't be added.
        // This matches the production behavior of Flipkart / Amazon / Meesho.
        showToast('info', 'Please select product options')
        // Small delay so the toast is visible before navigation
        setTimeout(() => {
          router.push(`/customer/product/${item.productId}`)
        }, 600)
        return
      }

      // Successfully added to cart — now safe to remove from wishlist.
      await removeFromWishlist(item.productId)
      showToast('success', 'Moved to cart')
    } catch (err) {
      console.error('Failed to add to cart:', err)
      showToast('error', 'Could not add to cart. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shimmer" />
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 bg-gray-100 dark:bg-gray-800 rounded-xl shimmer" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100dvh)]">
      {/* ── Toast notification (add-to-cart feedback) ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium max-w-[90vw]"
            style={{
              background: toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#dc2626' : '#1f2937',
              color: 'white',
            }}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ShoppingCart className="h-4 w-4 flex-shrink-0" />
            )}
            <span className="truncate">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky Header Bar: Same style as Categories page ── */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            )}
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">
              {t('wishlist.title')}
            </h1>
            <span className="text-xs text-gray-400">{t('wishlist.itemCount', { count: totalItems })}</span>
          </div>

          {/* Right Icons: Search → Cart */}
          <div className="flex items-center gap-0.5">
            {/* Search Icon */}
            <button
              onClick={() => onNavigate?.('search')}
              className="h-9 w-9 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Cart Icon with Badge */}
            <button
              onClick={() => onNavigate?.('cart')}
              className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
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

        {/* Expandable Search Input */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="flex items-center h-9 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 gap-2 mt-2">
                <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('wishlist.searchPlaceholder')}
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={handleCloseSearch} className="text-gray-400 hover:text-gray-600 ml-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[400px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center gap-5"
            >
              {/* Animated empty heart illustration */}
              <div className="relative">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Heart className="h-12 w-12 text-red-300 dark:text-red-600" />
                  </motion.div>
                </div>
                {/* Decorative circles */}
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-pink-200 dark:bg-pink-800/50" />
                <div className="absolute -bottom-1 -left-3 w-3 h-3 rounded-full bg-red-200 dark:bg-red-800/50" />
              </div>

              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">{t('wishlist.empty')}</h2>
                <p className="text-sm text-gray-400 max-w-[250px]">{t('wishlist.emptyDesc')}</p>
              </div>
              <button
                onClick={() => onNavigate?.('products')}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors shadow-sm"
              >
                <ShoppingBag className="h-4 w-4" />
                {t('common.browseProducts')}
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Search no results */
          <div className="flex flex-col items-center justify-center p-6 min-h-[300px]">
            <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-muted-foreground">{t('wishlist.noMatch', { query: searchQuery })}</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {t('common.clearSearch')}
            </button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-4 space-y-3">
            <AnimatePresence>
              {filteredItems.map((item) => (
                <WishlistItemCard
                  key={item.productId}
                  item={item}
                  onRemove={() => removeFromWishlist(item.productId)}
                  onAddToCart={() => handleAddToCart(item)}
                  inCart={isInCart(item.productId)}
                />
              ))}
            </AnimatePresence>

            {/* Trust Badges */}
            <div className="flex items-center justify-center gap-6 py-6 mt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>{t('common.secure')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Truck className="h-4 w-4 text-emerald-500" />
                <span>{t('common.freeDelivery')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <ShoppingBag className="h-4 w-4 text-emerald-500" />
                <span>{t('common.easyReturns')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
