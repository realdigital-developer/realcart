'use client'

/**
 * Customer Followed Sellers Page — Meesho-style
 * ------------------------------------------------------------------
 * Shows all sellers the customer follows with:
 *   - Store name + verified badge
 *   - Product count, avg rating, total sold
 *   - Followed date
 *   - Unfollow button
 *   - "Visit Store" action (navigates to seller's products)
 *
 * Sellers are followed from the product detail page (follow button next
 * to "Sold by" in the seller info row).
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Store,
  Star,
  Package,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  BadgeCheck,
  Heart,
  HeartOff,
  ShoppingBag,
  Users,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import AdminModal from '@/components/admin/admin-modal'
import { Button } from '@/components/ui/button'

interface FollowedSeller {
  id: string
  sellerId: string
  storeName: string
  sellerName: string
  isVerified: boolean
  verificationStatus: string
  productCount: number
  avgRating: number
  totalReviews: number
  totalSold: number
  followedAt: string
}

interface FollowedSellersPageProps {
  onBack?: () => void
  onNavigateToProducts?: (sellerId?: string, storeName?: string) => void
}

export function FollowedSellersPage({ onBack }: FollowedSellersPageProps) {
  const router = useRouter()
  const [sellers, setSellers] = useState<FollowedSeller[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unfollowTarget, setUnfollowTarget] = useState<FollowedSeller | null>(null)
  const [unfollowing, setUnfollowing] = useState(false)

  const fetchSellers = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/customer/followed-sellers')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSellers(data.followedSellers || [])
      setError(null)
    } catch {
      setError('Failed to load followed sellers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSellers()
  }, [fetchSellers])

  const handleUnfollow = async () => {
    if (!unfollowTarget) return
    setUnfollowing(true)
    try {
      const res = await fetch(`/api/customer/followed-sellers?id=${unfollowTarget.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setSellers((prev) => prev.filter((s) => s.id !== unfollowTarget.id))
        setUnfollowTarget(null)
      }
    } catch {
      // ignore
    } finally {
      setUnfollowing(false)
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return ''
    }
  }

  const handleVisitStore = (seller: FollowedSeller) => {
    // Navigate to the seller profile page (Meesho-style) — shows seller info,
    // stats, and all their products. Uses storeName for the query param.
    router.push(`/customer/seller?storeName=${encodeURIComponent(seller.storeName)}`)
  }

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-3 h-12">
          {onBack && (
            <button onClick={onBack} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Go back">
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
          )}
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-200">Followed Sellers</h1>
          <button onClick={fetchSellers} className="ml-auto h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4 text-gray-500', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 bg-white dark:bg-gray-900 rounded-2xl animate-pulse border border-gray-100 dark:border-gray-800" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{error}</p>
            <button onClick={fetchSellers} className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-500 hover:bg-emerald-600">Retry</button>
          </div>
        ) : sellers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center mb-4">
              <Store className="h-10 w-10 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No followed sellers yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Follow sellers you love to keep track of their latest products. Tap the heart icon next to a seller's name on any product page.
            </p>
          </div>
        ) : (
          <>
            {/* Summary banner */}
            <div className="mb-4 flex items-center gap-2 p-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
              <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                You are following {sellers.length} seller{sellers.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Seller cards */}
            <div className="space-y-3">
              <AnimatePresence>
                {sellers.map((seller, idx) => (
                  <motion.div
                    key={seller.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: Math.min(idx * 0.05, 0.3) }}
                    className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800"
                  >
                    {/* Seller header */}
                    <div className="flex items-start gap-3">
                      {/* Store avatar */}
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {seller.storeName.charAt(0).toUpperCase()}
                      </div>

                      {/* Store info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{seller.storeName}</p>
                          {seller.isVerified && (
                            <BadgeCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                        {seller.sellerName && (
                          <p className="text-[11px] text-gray-400 truncate">{seller.sellerName}</p>
                        )}
                        <div className="flex items-center gap-1 mt-0.5">
                          <Calendar className="h-2.5 w-2.5 text-gray-300" />
                          <p className="text-[10px] text-gray-400">Following since {formatDate(seller.followedAt)}</p>
                        </div>
                      </div>

                      {/* Unfollow button */}
                      <button
                        onClick={() => setUnfollowTarget(seller)}
                        className="h-8 w-8 flex items-center justify-center rounded-full text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex-shrink-0"
                        aria-label="Unfollow seller"
                        title="Unfollow"
                      >
                        <Heart className="h-4 w-4 fill-rose-400" />
                      </button>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Package className="h-3 w-3 text-blue-400" />
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{seller.productCount}</p>
                        </div>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Products</p>
                      </div>
                      <div className="text-center border-x border-gray-50 dark:border-gray-800">
                        <div className="flex items-center justify-center gap-1">
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{seller.avgRating || '—'}</p>
                        </div>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Rating</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <TrendingUp className="h-3 w-3 text-emerald-400" />
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{seller.totalSold}</p>
                        </div>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Sold</p>
                      </div>
                    </div>

                    {/* Visit store button */}
                    <button
                      onClick={() => handleVisitStore(seller)}
                      className="w-full mt-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      Visit Store
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* ── Unfollow Confirmation Modal ── */}
      <AdminModal
        open={!!unfollowTarget}
        onOpenChange={(o) => { if (!o) setUnfollowTarget(null) }}
        type="delete"
        size="sm"
        title="Unfollow Seller"
        description={`Stop following ${unfollowTarget?.storeName}? You can always follow them again later.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setUnfollowTarget(null)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleUnfollow} disabled={unfollowing} className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white">
              {unfollowing ? 'Unfollowing...' : 'Unfollow'}
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 p-3 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-100 dark:border-rose-800/20">
          <HeartOff className="h-5 w-5 text-rose-500 flex-shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-400">
            You will no longer see updates from this seller in your followed list.
          </p>
        </div>
      </AdminModal>
    </div>
  )
}
