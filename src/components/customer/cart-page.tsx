'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Package,
  Tag,
  Truck,
  ShieldCheck,
  ShoppingBag,
  Search,
  Heart,
  Sparkles,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCart } from '@/components/providers/cart-provider'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { CartItem, Address } from './types'

function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/* ------------------------------------------------------------------ */
/*  Cart Item Card                                                      */
/* ------------------------------------------------------------------ */

function CartItemCard({ item, onRemove, onUpdateQuantity, onWishlist }: {
  item: CartItem
  onRemove: () => void
  onUpdateQuantity: (qty: number) => void
  onWishlist: () => void
}) {
  const [removing, setRemoving] = useState(false)

  const handleRemove = () => {
    setRemoving(true)
    setTimeout(() => onRemove(), 200)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: removing ? 0 : 1, y: 0, scale: removing ? 0.95 : 1 }}
      exit={{ opacity: 0, x: -100, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
    >
      <div className="flex gap-3 p-3">
        {/* Product Image */}
        <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Brand */}
          {item.brand && (
            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{item.brand}</p>
          )}
          {/* Name */}
          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-tight mt-0.5">{item.name}</h3>

          {/* Selected Variant */}
          {item.selectedVariant && Object.keys(item.selectedVariant).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(item.selectedVariant).map(([key, value]) => (
                <span key={key} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">
                  {key}: {value}
                </span>
              ))}
            </div>
          )}

          {/* Seller */}
          {item.seller && (
            <p className="text-[10px] text-gray-400 mt-1">Seller: {item.seller}</p>
          )}

          {/* Price */}
          <div className="flex items-baseline gap-2 mt-auto pt-1.5">
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">{formatPrice(item.effectivePrice)}</span>
            {item.hasDiscount && (
              <>
                <span className="text-xs text-gray-400 line-through">{formatPrice(item.price)}</span>
                <span className="text-xs font-semibold text-green-600 dark:text-green-400">{item.discountPercent}% off</span>
              </>
            )}
          </div>

          {/* Quantity Controls */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => onUpdateQuantity(item.quantity - 1)}
                disabled={item.quantity <= 1}
                className={cn(
                  'w-8 h-8 flex items-center justify-center transition-colors',
                  item.quantity <= 1
                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-9 h-8 flex items-center justify-center text-sm font-semibold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/50">
                {item.quantity}
              </span>
              <button
                onClick={() => onUpdateQuantity(item.quantity + 1)}
                disabled={item.quantity >= (item.stock || 99)}
                className={cn(
                  'w-8 h-8 flex items-center justify-center transition-colors',
                  item.quantity >= (item.stock || 99)
                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Action buttons */}
            <button
              onClick={onWishlist}
              className="text-[11px] font-semibold text-blue-500 hover:text-blue-600 px-2 py-1.5 transition-colors"
            >
              SAVE FOR LATER
            </button>
            <button
              onClick={handleRemove}
              className="text-[11px] font-semibold text-red-500 hover:text-red-600 px-2 py-1.5 transition-colors"
            >
              REMOVE
            </button>
          </div>
        </div>
      </div>

      {/* Delivery info */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <Truck className="h-3.5 w-3.5 text-green-600" />
        <span className="text-[11px] text-gray-500">Free Delivery by <span className="font-semibold text-gray-700 dark:text-gray-300">2-5 business days</span></span>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Price Details Card (Flipkart-style)                                 */
/* ------------------------------------------------------------------ */

function PriceDetailsCard({ items, totalPrice, totalSavings, deliveryCharge, deliveryLoading, deliveryChargeSource, onCheckout }: {
  items: CartItem[]
  totalPrice: number
  totalSavings: number
  /**
   * Real delivery charge for the cart, computed the same way as the checkout
   * page (platform rule + product/seller overrides). `0` means FREE.
   * Falls back to the platform default rule when no estimate is available yet.
   */
  deliveryCharge: number
  /** True while the address-based estimate is being fetched. */
  deliveryLoading: boolean
  /**
   * Hint about how the charge was computed, so the customer understands
   * whether the charge reflects their saved address or just the platform
   * default. Rendered as a tiny sub-line under the Delivery Charges row.
   */
  deliveryChargeSource?: 'address' | 'default'
  onCheckout: () => void
}) {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const priceWithoutDiscount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  // Split the product discount into a regular markdown ("Product Discount")
  // and a distinct "Special Offer" line when a limited-time specialPrice is
  // active — matching Flipkart / Amazon / Meesho UX. Backward compatible: if a
  // legacy cart item has no sellingPrice, the entire discount is "Product Discount".
  const { totalProductDiscount, totalSpecialOffer } = items.reduce((acc, item) => {
    const qty = item.quantity
    if (item.sellingPrice != null && item.sellingPrice !== item.effectivePrice) {
      return {
        totalProductDiscount: acc.totalProductDiscount + Math.max(0, (item.price - item.sellingPrice) * qty),
        totalSpecialOffer: acc.totalSpecialOffer + Math.max(0, (item.sellingPrice - item.effectivePrice) * qty),
      }
    }
    return {
      totalProductDiscount: acc.totalProductDiscount + Math.max(0, (item.price - item.effectivePrice) * qty),
      totalSpecialOffer: acc.totalSpecialOffer,
    }
  }, { totalProductDiscount: 0, totalSpecialOffer: 0 })

  // === Total Amount reconciliation ===
  // The cart-provider's `totalPrice` is the ITEMS total (= Σ effectivePrice × qty,
  // i.e. MRP − all product/special discounts). The cart page Total Amount must
  // ALSO include the delivery charge so the customer sees what they will
  // actually pay. While the delivery estimate is loading we use `totalPrice`
  // alone (no charge yet); once loaded we add it. A FREE delivery (charge === 0)
  // leaves the total unchanged. Matches the checkout-page pattern where
  // Total Payable = items + delivery (+ cod/platform/coupon at checkout).
  // Note: taxes are inclusive (already inside effectivePrice + deliveryCharge),
  // mirroring the server-side order-helpers.ts computation.
  const finalTotal = deliveryLoading
    ? totalPrice
    : totalPrice + deliveryCharge

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">Price Details</h3>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Price ({totalItems} item{totalItems !== 1 ? 's' : ''})</span>
          <span className="text-gray-800 dark:text-gray-200 font-medium">{formatPrice(priceWithoutDiscount)}</span>
        </div>

        {totalProductDiscount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Product Discount</span>
            <span className="text-green-600 font-medium">- {formatPrice(totalProductDiscount)}</span>
          </div>
        )}

        {totalSpecialOffer > 0 && (
          <div className="flex justify-between text-sm bg-amber-50 dark:bg-amber-900/20 -mx-1 px-2 py-1 rounded">
            <span className="text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Special Offer
            </span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">- {formatPrice(totalSpecialOffer)}</span>
          </div>
        )}

        {/* Delivery Charges — computed the same way as the checkout page.
            When the customer has a saved default address we hit the delivery
            engine API for the actual charge (incl. product/seller overrides).
            When the customer is a guest or has no address yet, we fall back
            to the platform default rule (free above ₹499, else ₹49) so the
            cart page never shows a misleading "FREE" for low-value carts. */}
        <div className="flex justify-between text-sm items-center">
          <span className="text-gray-500 flex items-center gap-1">
            Delivery Charges
            {deliveryLoading && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          </span>
          {deliveryLoading ? (
            <span className="text-gray-400 text-xs">Calculating…</span>
          ) : deliveryCharge === 0 ? (
            <span className="text-green-600 font-medium">FREE</span>
          ) : (
            <span className="text-gray-800 dark:text-gray-200 font-medium">{formatPrice(deliveryCharge)}</span>
          )}
        </div>
        {/* Source hint — tells the customer whether the charge is based on
            their saved address (definitive) or the platform default
            (will be re-confirmed at checkout after they pick an address). */}
        {!deliveryLoading && deliveryChargeSource && (
          <p className="text-[10px] text-gray-400 -mt-1.5">
            {deliveryChargeSource === 'address'
              ? 'Based on your saved delivery address'
              : 'Final charge confirmed at checkout based on delivery address'}
          </p>
        )}

        <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-2.5 flex justify-between">
          <span className="text-base font-bold text-gray-800 dark:text-gray-200">Total Amount</span>
          <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatPrice(finalTotal)}</span>
        </div>
      </div>

      {totalSavings > 0 && (
        <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-t border-green-100 dark:border-green-900/30">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
            You will save {formatPrice(totalSavings)} on this order
          </p>
        </div>
      )}

      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={onCheckout}
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          PLACE ORDER
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Safe payment badges */}
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/30 flex items-center gap-3">
        <ShieldCheck className="h-4 w-4 text-gray-400" />
        <span className="text-[11px] text-gray-400">Safe and Secure Payments. Easy returns.</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Cart Page                                                      */
/* ------------------------------------------------------------------ */

export function CartPage({ onNavigate, onCheckout, onBack }: { onNavigate?: (tab: string) => void; onCheckout?: () => void; onBack?: () => void }) {
  const router = useRouter()
  const { items, totalItems, totalPrice, totalSavings, updateQuantity, removeFromCart, loading } = useCart()
  const { toggleWishlist, isInWishlist, totalItems: wishlistCount } = useWishlist()

  // Available coupons for this cart — shown in a "Coupons & Offers" card so
  // customers can see what they can use before checkout (Flipkart/Meesho UX).
  // Clicking "Apply" stores the code in sessionStorage and proceeds to
  // checkout, where the checkout page auto-applies it.
  const [availableCoupons, setAvailableCoupons] = useState<Array<{
    coupon: { _id: string; code: string; title?: string; displayText?: string; description?: string; discountType: string; discountValue: number; maxDiscount: number; minOrderAmount: number; scope: string; sellerStoreName?: string | null; featured?: boolean; firstOrderOnly?: boolean; endDate?: string | null }
    applicable: boolean
    reason?: string
    discount: number
  }>>([])
  const [couponsExpanded, setCouponsExpanded] = useState(false)

  useEffect(() => {
    if (!items.length) return
    let cancelled = false
    fetch('/api/customer/coupons/available', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cartTotal: totalPrice,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.effectivePrice,
          category: i.category,
          sellerId: i.sellerId,
        })),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.coupons) setAvailableCoupons(data.coupons)
      })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [items, totalPrice])

  const handleApplyCouponFromCart = (code: string) => {
    try {
      sessionStorage.setItem('pendingCouponCode', code.toUpperCase())
    } catch {
      // sessionStorage unavailable — non-fatal, checkout input still works
    }
    handleCheckout()
  }

  const handleWishlist = (item: CartItem) => {
    if (!isInWishlist(item.productId)) {
      toggleWishlist({
        productId: item.productId,
        name: item.name,
        price: item.price,
        effectivePrice: item.effectivePrice,
        hasDiscount: item.hasDiscount,
        discountPercent: item.discountPercent,
        imageUrl: item.imageUrl,
        stock: item.stock,
        seller: item.seller,
        brand: item.brand,
      })
    }
    removeFromCart(item.productId, item.selectedVariant)
  }

  const handleCheckout = () => {
    if (onCheckout) {
      onCheckout()
    } else {
      router.push('/customer/checkout')
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Real delivery charge for the cart (mirrors checkout-page logic)  */
  /*                                                                   */
  /*  Two layers:                                                      */
  /*    1. Synchronous local fallback using the platform default rule  */
  /*       (FREE above ₹499, else ₹49) — instant, never misleading.    */
  /*    2. Address-based estimate from /api/customer/delivery/check    */
  /*       when the customer is authenticated AND has a saved default  */
  /*       address. This honors product-level overrides (freeDelivery, */
  /*       deliveryCharge, freeDeliveryAbove) and seller settings.     */
  /*                                                                   */
  /*  The cart page never has a "selected address" (that's chosen at   */
  /*  checkout), so we use the customer's DEFAULT saved address for    */
  /*  the estimate. If they have no default, the local fallback stays. */
  /* ---------------------------------------------------------------- */
  const { authenticated } = useCustomerAuth()

  // Platform default rule (mirrors DEFAULT_DELIVERY_SETTINGS in delivery-engine.ts)
  const localFallbackCharge = useMemo(() => {
    if (totalPrice >= 499) return 0
    return 49
  }, [totalPrice])

  const [addressDeliveryCharge, setAddressDeliveryCharge] = useState<number | null>(null)
  const [deliveryChargeLoading, setDeliveryChargeLoading] = useState(false)

  useEffect(() => {
    if (!authenticated || items.length === 0) {
      setAddressDeliveryCharge(null)
      setDeliveryChargeLoading(false)
      return
    }

    let cancelled = false
    setDeliveryChargeLoading(true)

    // Step 1: fetch the customer's saved addresses to find their default.
    fetch('/api/customer/addresses')
      .then((res) => (res.ok ? res.json() : { addresses: [] }))
      .then(async (data) => {
        if (cancelled) return
        const addrs: Address[] = Array.isArray(data.addresses) ? data.addresses : []
        // Prefer the default address; otherwise the first one. The cart
        // page has no UI for picking an address — that happens at checkout.
        const addr = addrs.find((a) => a.isDefault) || addrs[0]
        if (!addr || !/^\d{6}$/.test(addr.pincode || '')) {
          // No usable address — keep the local fallback
          setAddressDeliveryCharge(null)
          return
        }
        // Step 2: hit the delivery engine for the actual charge. The engine
        // applies platform settings + product overrides + seller settings,
        // exactly the same computation as the checkout page does.
        const resp = await fetch('/api/customer/delivery/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pincode: addr.pincode,
            state: addr.state,
            items: items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              effectivePrice: it.effectivePrice,
            })),
          }),
        })
        if (cancelled) return
        if (!resp.ok) return
        const est = await resp.json()
        if (cancelled) return
        if (est?.estimate && typeof est.estimate.deliveryCharge === 'number') {
          setAddressDeliveryCharge(est.estimate.deliveryCharge as number)
        }
      })
      .catch(() => {
        /* non-fatal — local fallback stays in place */
      })
      .finally(() => {
        if (!cancelled) setDeliveryChargeLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [authenticated, items, totalPrice])

  // Resolve which charge + source to show. Address-based estimate wins
  // when available; otherwise the local platform-default fallback.
  const deliveryCharge = addressDeliveryCharge != null ? addressDeliveryCharge : localFallbackCharge
  const deliveryChargeSource: 'address' | 'default' =
    addressDeliveryCharge != null ? 'address' : 'default'

  if (loading) {
    return (
      <div className="flex flex-col h-full p-4 space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-36 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-[calc(100dvh)]">
        {/* ── Sticky Header Bar: Back arrow + "My Cart" + Search/Wishlist icons ── */}
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
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">My Cart</h1>
                <span className="text-xs text-gray-400">(0 items)</span>
              </div>
            </div>

            {/* Right Icons: Search → Wishlist */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onNavigate?.('search')}
                className="h-9 w-9 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Wishlist Icon with Badge */}
              <button
                onClick={() => onNavigate?.('wishlist')}
                className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
              >
                <Heart className="h-5 w-5" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                    {wishlistCount > 99 ? '99+' : wishlistCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <ShoppingCart className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">Your cart is empty</h2>
              <p className="text-sm text-gray-400">Add items to get started</p>
            </div>
            <button
              onClick={() => onNavigate?.('products')}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors"
            >
              <ShoppingBag className="h-4 w-4" />
              Start Shopping
            </button>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-[calc(100dvh)]">
      {/* ── Sticky Header Bar: Back arrow + "My Cart (X items)" + Search/Wishlist icons ── */}
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
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">My Cart</h1>
              <span className="text-xs text-gray-400">({totalItems} item{totalItems !== 1 ? 's' : ''})</span>
            </div>
          </div>

          {/* Right Icons: Search → Wishlist */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onNavigate?.('search')}
              className="h-9 w-9 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Wishlist Icon with Badge */}
            <button
              onClick={() => onNavigate?.('wishlist')}
              className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Heart className="h-5 w-5" />
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {wishlistCount > 99 ? '99+' : wishlistCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Cart Items */}
            <div className="flex-1 space-y-3">
              {/* Delivery charge banner — reflects the same charge shown in
                  the Price Details card. Says "Free Delivery" only when the
                  charge is actually ₹0; otherwise shows the amount so the
                  customer is not misled before they reach checkout. */}
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                <Truck className="h-4 w-4 text-blue-500 flex-shrink-0" />
                <p className="text-[11px] text-blue-700 dark:text-blue-300">
                  {deliveryChargeLoading ? (
                    <>Calculating delivery charge…</>
                  ) : deliveryCharge === 0 ? (
                    <><span className="font-semibold">Free Delivery</span> on this order</>
                  ) : (
                    <>Delivery charge: <span className="font-semibold">{formatPrice(deliveryCharge)}</span> · Free above ₹499</>
                  )}
                </p>
              </div>

              <AnimatePresence>
                {items.map((item) => (
                  <CartItemCard
                    key={`${item.productId}-${JSON.stringify(item.selectedVariant)}`}
                    item={item}
                    onRemove={() => removeFromCart(item.productId, item.selectedVariant)}
                    onUpdateQuantity={(qty) => updateQuantity(item.productId, qty, item.selectedVariant)}
                    onWishlist={() => handleWishlist(item)}
                  />
                ))}
              </AnimatePresence>

              {/* Coupons & Offers — available coupons for this cart.
                  Matches Flipkart/Meesho UX where the cart page shows
                  applicable coupons the customer can apply. */}
              {availableCoupons.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <button
                    onClick={() => setCouponsExpanded((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <span className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Coupons &amp; Offers</span>
                      {availableCoupons.filter((c) => c.applicable).length > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                          {availableCoupons.filter((c) => c.applicable).length} applicable
                        </span>
                      )}
                    </span>
                    <ChevronRight className={cn('h-4 w-4 text-gray-400 transition-transform', couponsExpanded && 'rotate-90')} />
                  </button>
                  {couponsExpanded && (
                    <div className="px-4 pb-3 space-y-2 max-h-80 overflow-y-auto">
                      {availableCoupons.map((ac) => {
                        const c = ac.coupon
                        const offerText = c.discountType === 'percentage'
                          ? (c.maxDiscount > 0 ? `${c.discountValue}% OFF up to ₹${c.maxDiscount}` : `${c.discountValue}% OFF`)
                          : `₹${c.discountValue} OFF`
                        return (
                          <div
                            key={c._id}
                            className={cn(
                              'p-3 rounded-lg border transition-colors',
                              ac.applicable
                                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                                : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 opacity-70',
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{c.code}</span>
                                  {c.featured && <Sparkles className="h-3 w-3 text-amber-500" />}
                                  {c.scope === 'seller' && c.sellerStoreName && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                      {c.sellerStoreName}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mt-0.5">{offerText}</p>
                                {(c.displayText || c.description) && (
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                    {c.displayText || c.description}
                                  </p>
                                )}
                                {c.minOrderAmount > 0 && (
                                  <p className="text-[10px] text-gray-400 mt-1">
                                    Min order ₹{c.minOrderAmount.toLocaleString('en-IN')}
                                  </p>
                                )}
                                {!ac.applicable && ac.reason && (
                                  <p className="text-[10px] text-red-400 mt-1">{ac.reason}</p>
                                )}
                              </div>
                              {ac.applicable && (
                                <button
                                  onClick={() => handleApplyCouponFromCart(c.code)}
                                  className="shrink-0 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold transition-colors"
                                >
                                  APPLY
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Price Details Sidebar */}
            <div className="lg:w-80 flex-shrink-0">
              <div className="lg:sticky lg:top-4">
                <PriceDetailsCard
                  items={items}
                  totalPrice={totalPrice}
                  totalSavings={totalSavings}
                  deliveryCharge={deliveryCharge}
                  deliveryLoading={deliveryChargeLoading}
                  deliveryChargeSource={deliveryChargeSource}
                  onCheckout={handleCheckout}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
