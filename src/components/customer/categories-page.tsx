'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Package, ChevronDown, ShoppingCart, ArrowLeft, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryItem } from './types'
import { useCart } from '@/components/providers/cart-provider'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useLanguage } from '@/components/providers/language-provider'

/**
 * A highlight section groups subcategories under a headline,
 * e.g. "Men's Clothing" → Bottomwear, Topwear, Ethnic Wear, etc.
 */
interface HighlightSection {
  name: string
  subcategories: {
    _id: string
    name: string
    imageUrl: string | null
  }[]
}

interface CategoriesPageProps {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  onBack?: () => void
  /**
   * Cached categories from the parent (HomeContentWrapper). When provided,
   * the page renders them instantly WITHOUT fetching — making the
   * Categories tab feel "real-time" on re-visits because the data
   * persists across tab switches at the parent level.
   *
   * When omitted (undefined), the page falls back to its own internal
   * fetch — keeping it backward-compatible for any other usage.
   */
  categories?: CategoryItem[]
  loading?: boolean
}

export function CategoriesPage({ onNavigate, onBack, categories: propCategories, loading: propLoading }: CategoriesPageProps = {}) {
  // Local state — only used when no cached props are provided (fallback mode)
  const [localCategories, setLocalCategories] = useState<CategoryItem[]>([])
  const [localLoading, setLocalLoading] = useState(true)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { totalItems: cartCount } = useCart()
  const { totalItems: wishlistCount } = useWishlist()
  const { t } = useLanguage()

  // Helper: update URL with or without categoryId
  const updateUrlCategoryId = useCallback((categoryId: string | null) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (categoryId) {
      url.searchParams.set('categoryId', categoryId)
    } else {
      url.searchParams.delete('categoryId')
    }
    window.history.replaceState({}, '', url.toString())
  }, [])

  // ── Resolve which data + loading state to use ──
  //   • Parent-managed mode (propCategories !== undefined) → use props directly
  //   • Fallback mode → use local state (fetched internally)
  const useParentCache = propCategories !== undefined
  const categories = useParentCache ? propCategories! : localCategories
  const loading = useParentCache ? (propLoading ?? false) : localLoading

  // ── Initialize activeCategoryId from URL when data is available ──
  // This runs both in parent-managed mode (when cached categories arrive)
  // AND in fallback mode (after the internal fetch completes). It ensures
  // the URL's categoryId param is respected and synced.
  useEffect(() => {
    if (loading || categories.length === 0) return

    // Read categoryId from URL first; fall back to first category
    let initialCategoryId: string | null = null
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      initialCategoryId = params.get('categoryId')
    }
    // Validate that the URL categoryId exists in the fetched categories
    const validId = initialCategoryId && categories.some((c: CategoryItem) => c._id === initialCategoryId)
      ? initialCategoryId
      : categories[0]._id
    setActiveCategoryId(validId)
    // Sync URL with the resolved categoryId
    updateUrlCategoryId(validId)
  }, [categories, loading, updateUrlCategoryId])

  // ── Fallback fetch — only runs when the parent does NOT supply cached data ──
  useEffect(() => {
    if (useParentCache) return

    let cancelled = false
    async function fetchCategories() {
      try {
        // cache: 'no-store' ensures the browser never serves a stale cached
        // response — the admin's reorder is always reflected immediately.
        const res = await fetch('/api/categories', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && res.ok && data.categories) {
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
  }, [useParentCache])

  // Auto-focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showSearch])

  const activeCategory = categories.find((c) => c._id === activeCategoryId)

  // Derive highlight sections from the active category's subcategories.
  // Each unique highlight name becomes a section headline.
  // Subcategories without highlights go into an "Other" section.
  //
  // ORDERING: Sections are NOT sorted alphabetically — they appear in the
  // order their first subcategory appears in the API response (which is the
  // admin-defined displayOrder). The "Other" section is always moved to the
  // end so named highlight sections appear first. This respects the admin's
  // saved ordering for both categories and subcategories.
  const highlightSections: HighlightSection[] = useMemo(() => {
    if (!activeCategory) return []

    // Use a Map to group subcategories by highlight name.
    // JS Maps preserve insertion order, so sections appear in the order
    // their first subcategory was encountered (i.e., API displayOrder).
    const map = new Map<string, { _id: string; name: string; imageUrl: string | null }[]>()

    for (const sub of activeCategory.subcategories) {
      if (sub.highlights && sub.highlights.length > 0) {
        for (const hlName of sub.highlights) {
          if (!hlName) continue
          if (!map.has(hlName)) {
            map.set(hlName, [])
          }
          map.get(hlName)!.push({
            _id: sub._id,
            name: sub.name,
            imageUrl: sub.imageUrl,
          })
        }
      } else {
        // Subcategories without highlights go into "Other"
        const otherKey = 'Other'
        if (!map.has(otherKey)) {
          map.set(otherKey, [])
        }
        map.get(otherKey)!.push({
          _id: sub._id,
          name: sub.name,
          imageUrl: sub.imageUrl,
        })
      }
    }

    // Convert to array, preserving insertion order — EXCEPT move "Other"
    // to the end so named highlight sections appear first.
    const entries = Array.from(map.entries())
    const otherIndex = entries.findIndex(([name]) => name === 'Other')
    if (otherIndex !== -1) {
      const [otherEntry] = entries.splice(otherIndex, 1)
      entries.push(otherEntry)
    }

    return entries.map(([name, subs]) => ({ name, subcategories: subs }))
  }, [activeCategory])

  // Filter categories by search
  const filteredCategories = searchQuery
    ? categories.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.subcategories.some((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : categories

  // Generate a consistent color from category name for placeholder
  const getCategoryColor = (name: string) => {
    const colors = [
      'from-rose-400 to-pink-500',
      'from-violet-400 to-purple-500',
      'from-blue-400 to-indigo-500',
      'from-cyan-400 to-teal-500',
      'from-emerald-400 to-green-500',
      'from-amber-400 to-yellow-500',
      'from-orange-400 to-red-400',
      'from-fuchsia-400 to-pink-500',
      'from-sky-400 to-blue-500',
      'from-lime-400 to-emerald-500',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  // Lighter subcategory placeholder color
  const getSubColor = (name: string) => {
    const colors = [
      'from-rose-100 to-pink-100 dark:from-rose-900/30 dark:to-pink-900/30',
      'from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30',
      'from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30',
      'from-cyan-100 to-teal-100 dark:from-cyan-900/30 dark:to-teal-900/30',
      'from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30',
      'from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/30',
      'from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30',
      'from-fuchsia-100 to-pink-100 dark:from-fuchsia-900/30 dark:to-pink-900/30',
      'from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30',
      'from-lime-100 to-emerald-100 dark:from-lime-900/30 dark:to-emerald-900/30',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const handleCloseSearch = () => {
    setShowSearch(false)
    setSearchQuery('')
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-[calc(100dvh)]">
      {/* ── Sticky Header Bar: Back arrow + "All Categories" + Search/Wishlist/Cart icons ── */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                aria-label={t('common.back')}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            )}
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">
              {t('categories.title')}
            </h1>
          </div>

          {/* Right Icons: Search → Wishlist → Cart */}
          <div className="flex items-center gap-0.5">
            {/* Search Icon */}
            <button
              onClick={() => onNavigate?.('search')}
              aria-label={t('common.search')}
              className="h-9 w-9 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Wishlist Icon with Badge */}
            <button
              onClick={() => onNavigate?.('wishlist')}
              aria-label={t('common.wishlist')}
              className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
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
              aria-label={t('common.cart')}
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
                  placeholder={t('categories.searchPlaceholder')}
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

      {/* ── Two-Panel Layout: Sidebar + Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar: Category List (circular icons with text below) ── */}
        <div
          className="w-[25%] bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-y-auto flex-shrink-0"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {loading ? (
            <div className="space-y-3 py-3 px-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
                  <div className="h-2.5 w-10 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-1">
              {filteredCategories.map((category, catIdx) => {
                const isActive = activeCategoryId === category._id
                return (
                  <button
                    key={category._id || `cat-${catIdx}`}
                    onClick={() => {
                      setActiveCategoryId(category._id)
                      updateUrlCategoryId(category._id)
                      if (showSearch) handleCloseSearch()
                    }}
                    className={cn(
                      'w-full flex flex-col items-center py-2.5 px-1.5 transition-colors duration-150 relative',
                      isActive
                        ? 'bg-white dark:bg-gray-950'
                        : 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50'
                    )}
                  >
                    {/* Active left accent bar */}
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-blue-500 dark:bg-blue-400" />
                    )}

                    {/* Circular Category Icon */}
                    <div className={cn(
                      'w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 transition-colors duration-150',
                      isActive
                        ? 'border-blue-400 dark:border-blue-500'
                        : 'border-gray-200 dark:border-gray-700'
                    )}>
                      {category.imageUrl ? (
                        <img
                          src={category.imageUrl}
                          alt={category.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${getCategoryColor(category.name)} flex items-center justify-center`}>
                          <Package className="h-5 w-5 text-white/80" />
                        </div>
                      )}
                    </div>

                    {/* Category Label */}
                    <span className={cn(
                      'text-[10px] leading-tight text-center mt-1 line-clamp-2 font-medium transition-colors',
                      isActive
                        ? 'text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-gray-500 dark:text-gray-400'
                    )}>
                      {category.name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right Content Area: Highlight Sections ── */}
        <div
          className="flex-1 bg-white dark:bg-gray-950 overflow-y-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {loading ? (
            <div className="p-4 space-y-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="h-4 w-28 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <div key={j} className="flex flex-col items-center">
                        <div className="w-full aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
                        <div className="mt-1.5 h-2.5 w-14 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : activeCategory && highlightSections.length > 0 ? (
            <div className="p-3 sm:p-4 space-y-5">
              {/* Highlight Sections */}
              {highlightSections.map((section) => (
                <div key={section.name}>
                  {/* Section Headline */}
                  <div className="flex items-center gap-1 mb-2.5">
                    <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-200">
                      {section.name === 'Other' ? t('common.other') : section.name}
                    </h3>
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  </div>

                  {/* 3-Column Subcategory Grid */}
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                    {section.subcategories.map((sub, subIdx) => (
                      <button
                        key={sub._id || `sub-${subIdx}`}
                        onClick={() => onNavigate?.('products', { subcategory: sub.name })}
                        className="flex flex-col items-center group"
                      >
                        {/* Subcategory Image */}
                        <div className="w-full aspect-square rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 group-hover:border-blue-300 dark:group-hover:border-blue-700 transition-colors duration-200 bg-gray-50 dark:bg-gray-900">
                          {sub.imageUrl ? (
                            <img
                              src={sub.imageUrl}
                              alt={sub.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                            />
                          ) : (
                            <div className={`w-full h-full bg-gradient-to-br ${getSubColor(sub.name)} flex items-center justify-center`}>
                              <Package className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                            </div>
                          )}
                        </div>
                        {/* Subcategory Label */}
                        <span className="mt-1 text-[10px] sm:text-[11px] font-medium text-gray-600 dark:text-gray-400 text-center leading-tight line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {sub.name}
                        </span>
                      </button>
                    ))}

                    {/* View All */}
                    <button className="flex flex-col items-center group">
                      <div className="w-full aspect-square rounded-lg overflow-hidden border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-center group-hover:border-blue-400 dark:group-hover:border-blue-600 transition-colors">
                        <ChevronDown className="h-5 w-5 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                      </div>
                      <span className="mt-1 text-[10px] sm:text-[11px] font-medium text-gray-400 dark:text-gray-500 text-center leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {t('common.viewAll')}
                      </span>
                    </button>
                  </div>
                </div>
              ))}

              {/* If the active category has no highlights at all, show flat grid */}
              {activeCategory.subcategories.length > 0 && highlightSections.length === 0 && (
                <div>
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                    {activeCategory.subcategories.map((sub, subIdx) => (
                      <button
                        key={sub._id || `sub-${subIdx}`}
                        onClick={() => onNavigate?.('products', { subcategory: sub.name })}
                        className="flex flex-col items-center group"
                      >
                        <div className="w-full aspect-square rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 group-hover:border-blue-300 dark:group-hover:border-blue-700 transition-colors duration-200 bg-gray-50 dark:bg-gray-900">
                          {sub.imageUrl ? (
                            <img
                              src={sub.imageUrl}
                              alt={sub.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                            />
                          ) : (
                            <div className={`w-full h-full bg-gradient-to-br ${getSubColor(sub.name)} flex items-center justify-center`}>
                              <Package className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                            </div>
                          )}
                        </div>
                        <span className="mt-1 text-[10px] sm:text-[11px] font-medium text-gray-600 dark:text-gray-400 text-center leading-tight line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {sub.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600">
              <Package className="h-10 w-10 mb-2" />
              <p className="text-sm">{t('categories.noCategories')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
