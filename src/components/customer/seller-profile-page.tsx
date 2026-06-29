'use client'

/**
 * Customer Seller Profile Page — Meesho-style
 * ------------------------------------------------------------------
 * Opened when the customer taps the "Sold by" section on a product
 * detail page. Shows:
 *   - Seller hero card (avatar, store name, verified badge, follow button)
 *   - Stats row (products, rating, sold, reviews)
 *   - Price range
 *   - Product grid (paginated, sorted by popularity)
 *   - Seller details (business type, location, joined date)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Store,
  Star,
  Package,
  TrendingUp,
  MessageSquare,
  BadgeCheck,
  UserCheck,
  UserPlus,
  Loader2,
  RefreshCw,
  AlertCircle,
  MapPin,
  Calendar,
  IndianRupee,
  ShoppingBag,
  Truck,
  Heart,
  X,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCustomerAuth } from '@/hooks/use-customer-auth'

interface SellerProfile {
  sellerId: string
  storeName: string
  sellerName: string
  isVerified: boolean
  verificationStatus: string
  businessType: string
  address: string
  pickupAddress: {
    fullName: string
    phone: string
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    pincode: string
  } | null
  createdAt: string | null
  totalProducts: number
  avgRating: number
  totalReviews: number
  totalSold: number
  priceRange: { min: number; max: number }
  ratingDistribution?: Record<string, number>
}

interface SellerProduct {
  _id: string
  name: string
  slug: string
  mrp: number
  sellingPrice: number
  effectivePrice: number
  hasDiscount: boolean
  discountPercent: number
  imageUrl: string
  images: Array<{ url: string }>
  category: string
  subcategory?: string
  brand: string
  stock: number
  inStock: boolean
  avgRating: number
  totalReviews: number
  totalSold: number
  freeDelivery: boolean
  seller: string
  sellerId?: string
}

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '₹0'
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function SellerProfilePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const storeName = searchParams.get('storeName')
  const sellerId = searchParams.get('sellerId')

  const { authenticated } = useCustomerAuth()
  const [seller, setSeller] = useState<SellerProfile | null>(null)
  const [products, setProducts] = useState<SellerProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  // Seller rating state (Meesho/Flipkart-style)
  const [hasRated, setHasRated] = useState(false)
  const [myRating, setMyRating] = useState(0)
  const [rateModalOpen, setRateModalOpen] = useState(false)
  const [selectedRating, setSelectedRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [rateSubmitting, setRateSubmitting] = useState(false)
  const [rateError, setRateError] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const fetchSeller = useCallback(async (pageNum: number, append: boolean) => {
    try {
      if (!append) setLoading(true)
      else setLoadingMore(true)

      const params = new URLSearchParams()
      if (sellerId) params.set('sellerId', sellerId)
      if (storeName) params.set('storeName', storeName)
      params.set('page', pageNum.toString())
      params.set('limit', '20')

      const res = await fetch(`/api/customer/seller-profile?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()

      setSeller(data.seller)
      if (append) {
        setProducts((prev) => [...prev, ...data.products])
      } else {
        setProducts(data.products)
      }
      setHasMore(data.pagination.hasMore)
      setError(null)
    } catch {
      setError('Failed to load seller profile')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [sellerId, storeName])

  useEffect(() => {
    if (!storeName && !sellerId) {
      setError('Seller not specified')
      setLoading(false)
      return
    }
    fetchSeller(1, false)
  }, [fetchSeller, storeName, sellerId])

  // Check follow status
  useEffect(() => {
    if (!authenticated || !storeName) return
    let cancelled = false
    fetch('/api/customer/followed-sellers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName }),
    })
      .then((res) => (res.ok ? res.json() : { following: false }))
      .then((data) => {
        if (!cancelled) setIsFollowing(!!data.following)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [authenticated, storeName])

  // Check if customer has already rated this seller
  useEffect(() => {
    if (!authenticated || !storeName) return
    let cancelled = false
    fetch('/api/customer/seller-ratings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName }),
    })
      .then((res) => (res.ok ? res.json() : { hasRated: false }))
      .then((data) => {
        if (!cancelled) {
          setHasRated(!!data.hasRated)
          setMyRating(data.myRating || 0)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [authenticated, storeName])

  // Submit seller rating
  const handleSubmitRating = async () => {
    if (!authenticated || !storeName || selectedRating < 1) {
      setRateError('Please select a rating (1-5 stars)')
      return
    }
    setRateSubmitting(true)
    setRateError(null)
    try {
      const res = await fetch('/api/customer/seller-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName, rating: selectedRating, review: reviewText.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRateError(data.error || 'Failed to submit rating')
        return
      }
      setHasRated(true)
      setMyRating(selectedRating)
      setRateModalOpen(false)
      setSelectedRating(0)
      setReviewText('')
      // Refetch seller to update the aggregate rating
      fetchSeller(1, false)
    } catch {
      setRateError('Network error. Please try again.')
    } finally {
      setRateSubmitting(false)
    }
  }

  const openRateModal = () => {
    setSelectedRating(hasRated ? myRating : 0)
    setReviewText('')
    setRateError(null)
    setRateModalOpen(true)
  }

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading) return
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          const nextPage = page + 1
          setPage(nextPage)
          fetchSeller(nextPage, true)
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [hasMore, loading, loadingMore, page, fetchSeller])

  const handleToggleFollow = async () => {
    if (!authenticated || !storeName || followLoading) return
    setFollowLoading(true)
    try {
      if (isFollowing) {
        const res = await fetch(`/api/customer/followed-sellers?storeName=${encodeURIComponent(storeName)}`, {
          method: 'DELETE',
        })
        if (res.ok) setIsFollowing(false)
      } else {
        const res = await fetch('/api/customer/followed-sellers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeName, sellerName: seller?.sellerName || storeName }),
        })
        if (res.ok) setIsFollowing(true)
      }
    } catch {
      // ignore
    } finally {
      setFollowLoading(false)
    }
  }

  const handleProductClick = (productId: string) => {
    router.push(`/customer/product/${productId}`)
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 h-12">
            <button onClick={() => router.back()} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="h-40 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-white dark:bg-gray-900 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !seller) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 h-12">
            <button onClick={() => router.back()} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
            <h1 className="text-base font-bold text-gray-800 dark:text-gray-200">Seller Profile</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4">
          <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{error || 'Seller not found'}</p>
          <button onClick={() => router.back()} className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-500 hover:bg-emerald-600">Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-3 h-12">
          <button onClick={() => router.back()} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Go back">
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-200 truncate">Seller Profile</h1>
        </div>
      </div>

      <div className="pb-8">
        {/* ── Seller Hero Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-white dark:bg-gray-900 mx-4 mt-4 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm"
        >
          {/* Gradient header strip */}
          <div className="h-20 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 relative overflow-hidden">
            <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10" />
            <div className="absolute -bottom-12 -left-4 h-24 w-24 rounded-full bg-white/10" />
          </div>

          {/* Seller info */}
          <div className="px-5 pb-5 -mt-10 relative">
            <div className="flex items-end justify-between">
              {/* Avatar */}
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-3xl font-black border-4 border-white dark:border-gray-900 shadow-lg">
                {seller.storeName.charAt(0).toUpperCase()}
              </div>
              {/* Follow button */}
              {authenticated && (
                <button
                  onClick={handleToggleFollow}
                  disabled={followLoading}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all',
                    isFollowing
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 shadow-sm'
                  )}
                >
                  {followLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isFollowing ? (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      Follow
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Store name + verified badge — always show (badge or spacer for consistency) */}
            <div className="mt-3 flex items-center gap-1.5">
              <h2 className="text-lg font-black text-gray-800 dark:text-gray-200">{seller.storeName}</h2>
              {seller.isVerified ? (
                <BadgeCheck className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              ) : (
                <span className="h-5 w-5 flex-shrink-0" />
              )}
            </div>

            {/* Seller name — always show (fallback to store name for consistency) */}
            <p className="text-xs text-gray-400 mt-0.5">{seller.sellerName || seller.storeName}</p>

            {/* Status badge — always show (Verified or Pending) */}
            <div className={cn(
              'inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold',
              seller.verificationStatus === 'verified'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
            )}>
              {seller.verificationStatus === 'verified' ? (
                <>
                  <BadgeCheck className="h-3 w-3" />
                  Verified Seller
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" />
                  Pending Verification
                </>
              )}
            </div>

            {/* Location + joined — always show with fallbacks */}
            <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {seller.pickupAddress?.city
                  ? `${seller.pickupAddress.city}, ${seller.pickupAddress.state || ''}`
                  : 'Location N/A'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {seller.createdAt ? `Joined ${formatDate(seller.createdAt)}` : 'Recently joined'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-4 gap-2 px-4 mt-4">
          <StatCard icon={<Package className="h-3.5 w-3.5" />} value={seller.totalProducts.toString()} label="Products" color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
          <StatCard icon={<Star className="h-3.5 w-3.5" />} value={seller.avgRating ? seller.avgRating.toString() : '—'} label="Rating" color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/20" />
          <StatCard icon={<TrendingUp className="h-3.5 w-3.5" />} value={seller.totalSold > 999 ? `${(seller.totalSold / 1000).toFixed(1)}k` : seller.totalSold.toString()} label="Sold" color="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-900/20" />
          <StatCard icon={<MessageSquare className="h-3.5 w-3.5" />} value={seller.totalReviews.toString()} label="Reviews" color="text-violet-600 dark:text-violet-400" bg="bg-violet-50 dark:bg-violet-900/20" />
        </div>

        {/* ── Price Range + Free Delivery ── */}
        {(seller.priceRange.min > 0 || seller.priceRange.max > 0) && (
          <div className="px-4 mt-3">
            <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
              <IndianRupee className="h-4 w-4 text-emerald-500" />
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Price Range</p>
                <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  {formatPrice(seller.priceRange.min)} - {formatPrice(seller.priceRange.max)}
                </p>
              </div>
              <Truck className="h-4 w-4 text-blue-400" />
              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Delivery Available</span>
            </div>
          </div>
        )}

        {/* ── Seller Rating Section (Meesho/Flipkart-style) ── */}
        <div className="px-4 mt-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <Star className="h-4 w-4 text-amber-500" />
                Seller Rating
              </h3>
              {authenticated && (
                <button
                  onClick={openRateModal}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                >
                  <Star className="h-3 w-3" />
                  {hasRated ? 'Edit Rating' : 'Rate Seller'}
                </button>
              )}
            </div>

            {/* Rating display: big number + stars + distribution */}
            {seller.totalReviews > 0 ? (
              <div className="flex items-start gap-4">
                {/* Left: big rating number + stars */}
                <div className="text-center flex-shrink-0">
                  <p className="text-3xl font-black text-gray-800 dark:text-gray-200 leading-none">{seller.avgRating}</p>
                  <div className="flex items-center justify-center gap-0.5 mt-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={cn(
                          'h-3 w-3',
                          s <= Math.round(seller.avgRating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-700'
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{seller.totalReviews} rating{seller.totalReviews !== 1 ? 's' : ''}</p>
                </div>

                {/* Right: distribution bars */}
                <div className="flex-1 space-y-1">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = seller.ratingDistribution?.[star.toString()] || 0
                    const pct = seller.totalReviews > 0 ? (count / seller.totalReviews) * 100 : 0
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-3">{star}</span>
                        <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 w-6 text-right">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-3">
                <div className="flex items-center justify-center gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="h-4 w-4 text-gray-200 dark:text-gray-700" />
                  ))}
                </div>
                <p className="text-xs text-gray-400">No ratings yet</p>
                {authenticated && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Be the first to rate this seller!</p>
                )}
              </div>
            )}

            {/* My rating indicator */}
            {hasRated && (
              <div className="mt-3 pt-3 border-t border-gray-50 dark:border-gray-800 flex items-center gap-2">
                <span className="text-[10px] text-gray-400">Your rating:</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        'h-3 w-3',
                        s <= myRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-700'
                      )}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{myRating}/5</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Products Section ── */}
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <ShoppingBag className="h-4 w-4 text-emerald-500" />
              Products
              <span className="text-xs text-gray-400 font-normal">({seller.totalProducts})</span>
            </h3>
          </div>

          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm font-medium text-gray-500">No products available</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {products.map((product, idx) => (
                  <ProductCard key={product._id} product={product} onClick={() => handleProductClick(product._id)} index={idx} />
                ))}
              </div>

              {/* Load more trigger */}
              {hasMore && (
                <div ref={loadMoreRef} className="flex items-center justify-center py-6">
                  {loadingMore ? (
                    <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" />
                  ) : (
                    <p className="text-xs text-gray-400">Scroll to load more</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Rate Seller Modal (Meesho/Flipkart-style) ── */}
      {rateModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !rateSubmitting && setRateModalOpen(false)}
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md mx-4 p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">
                  {hasRated ? 'Edit Your Rating' : 'Rate This Seller'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{seller.storeName}</p>
              </div>
              <button
                onClick={() => !rateSubmitting && setRateModalOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {/* Error */}
            {rateError && (
              <div className="mb-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
                <p className="text-[11px] text-red-600 dark:text-red-400">{rateError}</p>
              </div>
            )}

            {/* Star picker */}
            <div className="text-center py-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSelectedRating(s); setRateError(null) }}
                    className="transition-transform active:scale-90 hover:scale-110"
                    aria-label={`Rate ${s} stars`}
                  >
                    <Star
                      className={cn(
                        'h-9 w-9 transition-colors',
                        s <= selectedRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-700 hover:text-amber-200'
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                {selectedRating === 0 && 'Tap to rate'}
                {selectedRating === 1 && 'Poor'}
                {selectedRating === 2 && 'Fair'}
                {selectedRating === 3 && 'Good'}
                {selectedRating === 4 && 'Very Good'}
                {selectedRating === 5 && 'Excellent'}
              </p>
            </div>

            {/* Review text (optional) */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">
                Review (optional)
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
                placeholder="Share your experience with this seller..."
                className="w-full h-20 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:border-amber-400 resize-none"
                rows={3}
              />
              <p className="text-[10px] text-gray-400 mt-1 text-right">{reviewText.length}/500</p>
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmitRating}
              disabled={rateSubmitting || selectedRating < 1}
              className={cn(
                'w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                rateSubmitting || selectedRating < 1
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 text-white active:scale-95'
              )}
            >
              {rateSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : hasRated ? (
                'Update Rating'
              ) : (
                'Submit Rating'
              )}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  )
}

// ── Stat Card ──
function StatCard({ icon, value, label, color, bg }: { icon: React.ReactNode; value: string; label: string; color: string; bg: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-2.5 border border-gray-100 dark:border-gray-800 text-center">
      <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center mx-auto mb-1.5', bg, color)}>
        {icon}
      </div>
      <p className="text-sm font-bold text-gray-800 dark:text-gray-200 leading-none">{value}</p>
      <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

// ── Product Card ──
function ProductCard({ product, onClick, index }: { product: SellerProduct; onClick: () => void; index: number }) {
  const img = product.imageUrl || product.images?.[0]?.url || ''
  // Fall back to sellingPrice then mrp if effectivePrice is missing
  const displayPrice = product.effectivePrice || product.sellingPrice || product.mrp || 0
  const originalPrice = product.mrp || product.sellingPrice || 0
  const discount = displayPrice > 0 && originalPrice > displayPrice
    ? Math.round(((originalPrice - displayPrice) / originalPrice) * 100)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      onClick={onClick}
      className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-8 w-8 text-gray-300" />
          </div>
        )}
        {discount > 0 && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[9px] font-bold">
            {discount}% OFF
          </span>
        )}
        {product.freeDelivery && (
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[8px] font-bold">
            FREE DELIVERY
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-tight h-8">{product.name}</p>
        <div className="flex items-center gap-1 mt-1">
          <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
          <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">{product.avgRating ? product.avgRating.toFixed(1) : '—'}</span>
          <span className="text-[9px] text-gray-400">({product.totalReviews})</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatPrice(displayPrice)}</span>
          {discount > 0 && (
            <span className="text-[10px] text-gray-400 line-through">{formatPrice(originalPrice)}</span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
