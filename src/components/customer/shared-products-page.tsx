'use client'

/**
 * Shared Products Page — Customer Panel
 * ------------------------------------------------------------------
 * Shows all products the customer has shared (via the share button on
 * the product detail page). Each product card shows the product image,
 * name, price, brand, and share count.
 *
 * Data is fetched from GET /api/customer/shared-products.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Share2, Package, RefreshCw } from 'lucide-react'
import { PageHeader } from './page-header'
import { useLanguage } from '@/components/providers/language-provider'

interface SharedProduct {
  _id: string
  productId: string
  name: string
  imageUrl: string
  effectivePrice: number
  mrp: number
  brand: string
  category: string
  shareCount: number
  lastSharedAt: string
}

interface SharedProductsPageProps {
  onBack?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function SharedProductsPage({ onBack, onNavigate }: SharedProductsPageProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [products, setProducts] = useState<SharedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/customer/shared-products')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json().catch(() => ({}))
        if (!cancelled) {
          setProducts(data.sharedProducts || [])
          setError(null)
        }
      } catch {
        if (!cancelled) setError('Failed to load shared products')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const formatPrice = (price: number) =>
    `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso)
      const now = new Date()
      const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60))
      if (diffH < 1) return t('common.justNow')
      if (diffH < 24) return t('sharedProducts.hAgo', { count: diffH })
      const diffD = Math.floor(diffH / 24)
      if (diffD === 1) return t('common.yesterday')
      if (diffD < 7) return `${diffD}d ago`
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    } catch {
      return ''
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader
        title={t('sharedProducts.title')}
        onBack={onBack}
        onNavigate={onNavigate}
        headerExtra={
          products.length > 0 ? (
            <span className="text-xs text-gray-400 mr-1">{t('sharedProducts.itemCount', { count: products.length })}</span>
          ) : undefined
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          // Skeleton loading
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 animate-pulse">
                <div className="h-16 w-16 rounded-xl bg-gray-200 dark:bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
                  <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          // Error state
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{error === 'Failed to load shared products' ? t('sharedProducts.loadFailed') : error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              {t('common.retry')}
            </button>
          </div>
        ) : products.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-3xl blur-2xl opacity-60" />
              <div className="relative h-20 w-20 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/40 dark:to-teal-900/40 flex items-center justify-center">
                <Share2 className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">{t('sharedProducts.empty')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              {t('sharedProducts.emptyDesc')}
            </p>
          </div>
        ) : (
          // Product list
          <div className="space-y-3">
            {products.map((product, i) => (
              <motion.div
                key={product._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                onClick={() => router.push(`/customer/product/${product.productId}`)}
                className="flex gap-3 bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-sm transition-all cursor-pointer"
              >
                {/* Product image */}
                <div className="h-16 w-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-6 w-6 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2">{product.name}</p>
                  {product.brand && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{product.brand}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatPrice(product.effectivePrice)}</span>
                    {product.mrp > product.effectivePrice && (
                      <span className="text-xs text-gray-400 line-through">{formatPrice(product.mrp)}</span>
                    )}
                  </div>
                </div>

                {/* Share count + time */}
                <div className="flex flex-col items-end justify-center flex-shrink-0">
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Share2 className="h-3 w-3" />
                    <span>{product.shareCount}x</span>
                  </div>
                  <span className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">
                    {formatTime(product.lastSharedAt)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
