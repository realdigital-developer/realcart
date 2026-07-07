'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Package } from 'lucide-react'
import { CategoryItem } from './types'
import { cn, createTimeoutSignal } from '@/lib/utils'

interface CategorySectionProps {
  onCategoryClick?: (categoryName: string) => void
  /**
   * Cached categories from the parent (HomeContentWrapper). When provided,
   * the section renders them instantly WITHOUT fetching — this is what
   * makes the home tab feel "real-time" on re-visits because the data
   * persists across tab switches at the parent level.
   *
   * When omitted (undefined), the section falls back to its own internal
   * fetch — keeping it backward-compatible for any other usage.
   */
  categories?: CategoryItem[]
  /**
   * Loading flag from the parent. Only meaningful when `categories` is
   * provided. When `categories` is provided AND `loading` is false, the
   * skeleton is hidden and the data is shown immediately.
   */
  loading?: boolean
}

export function CategorySection({ onCategoryClick, categories: propCategories, loading: propLoading }: CategorySectionProps = {}) {
  // Local state — only used when no cached props are provided (fallback mode)
  const [localCategories, setLocalCategories] = useState<CategoryItem[]>([])
  const [localLoading, setLocalLoading] = useState(true)

  // ── Fallback fetch — only runs when the parent does NOT supply cached data ──
  useEffect(() => {
    // If the parent is managing categories, skip the internal fetch entirely
    if (propCategories !== undefined) return

    let cancelled = false
    async function fetchCategories() {
      try {
        const res = await fetch('/api/categories', {
          signal: createTimeoutSignal(10000),
          cache: 'no-store',
        })
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        if (!cancelled && res.ok && data.categories && Array.isArray(data.categories)) {
          setLocalCategories(data.categories)
        }
      } catch (err) {
        console.error('Failed to fetch categories:', err)
      } finally {
        if (!cancelled) setLocalLoading(false)
      }
    }
    fetchCategories()
    return () => { cancelled = true }
  }, [propCategories])

  // Resolve which data + loading state to use:
  //   • Parent-managed mode (propCategories !== undefined) → use props directly
  //   • Fallback mode → use local state
  const useParentCache = propCategories !== undefined
  const categories = useParentCache ? propCategories! : localCategories
  const loading = useParentCache ? (propLoading ?? false) : localLoading

  return (
    <div className="categories-bg w-full relative overflow-hidden">
      {/* Local style block — scoped, only injects when this section renders */}
      <style>{`
        .categories-bg {
          background:
            linear-gradient(180deg, #5fd3d3 0%, #f7f6f4 100%);
        }
        .categories-bg > * { position: relative; z-index: 1; }
      `}</style>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4">
        {/* Loading Skeleton */}
        {loading && (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center flex-shrink-0">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/50 animate-pulse" />
                <div className="mt-1.5 h-2.5 w-10 bg-white/50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Category Items - Horizontal Scroll */}
        {!loading && categories.length > 0 && (
          <div
            className="flex gap-4 sm:gap-5 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {categories.map((category, index) => (
              <motion.button
                key={category._id || `cat-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (onCategoryClick) {
                    onCategoryClick(category.name)
                  }
                }}
                className="flex flex-col items-center flex-shrink-0 group"
              >
                {/* Circular Image */}
                <div className={cn(
                  'w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden',
                  'border-2 border-white group-hover:border-emerald-500',
                  'transition-colors duration-200',
                  'bg-white/60'
                )}>
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt={category.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
                    </div>
                  )}
                </div>
                {/* Category Name */}
                <p className="mt-1 sm:mt-1.5 text-[10px] sm:text-xs font-medium text-gray-700 text-center leading-tight max-w-[56px] sm:max-w-[64px] line-clamp-2 group-hover:text-emerald-700 transition-colors">
                  {category.name}
                </p>
              </motion.button>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && categories.length === 0 && (
          <div className="flex items-center justify-center py-6 text-gray-600">
            <Package className="h-5 w-5 mr-2" />
            <span className="text-sm">No categories available</span>
          </div>
        )}
      </div>
    </div>
  )
}
