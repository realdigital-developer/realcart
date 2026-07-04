'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  X,
  SlidersHorizontal,
  Grid3X3,
  List,
  Heart,
  ShoppingCart,
  Package,
  Filter,
  ChevronRight,
  ChevronDown,
  Check,
  ArrowLeft,
  Minus,
  Plus,
  Star,
  Truck,
  ArrowUp,
  Camera,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Product, Filters } from './types'
import { useCart } from '@/components/providers/cart-provider'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { ProductCard } from './product-card'

type SortOption = 'relevance' | 'newest' | 'price-low' | 'price-high' | 'rating' | 'discount' | 'popularity' | 'name'
type ViewMode = 'grid' | 'list'
type FilterCategory = 'price' | 'brand' | 'category' | 'subcategory' | 'tags' | 'rating' | 'inStock'

interface ActiveFilter {
  type: 'category' | 'subcategory' | 'brand' | 'tag' | 'price' | 'rating' | 'inStock'
  value: string
  label: string
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                   */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const cardFadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const } },
}

/* ------------------------------------------------------------------ */
/*  Scroll to Top Button                                                */
/* ------------------------------------------------------------------ */

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 400)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!visible) return null

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-24 right-4 z-40 h-10 w-10 rounded-full bg-emerald-500 text-white shadow-lg flex items-center justify-center hover:bg-emerald-600 transition-colors lg:bottom-8"
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-5 w-5" />
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/*  Helper: format price                                               */
/* ------------------------------------------------------------------ */

function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/* ------------------------------------------------------------------ */
/*  Placeholder gradient generator                                     */
/* ------------------------------------------------------------------ */

const getProductGradient = (name: string) => {
  const gradients = [
    'from-rose-200 to-pink-200 dark:from-rose-900/40 dark:to-pink-900/40',
    'from-violet-200 to-purple-200 dark:from-violet-900/40 dark:to-purple-900/40',
    'from-blue-200 to-indigo-200 dark:from-blue-900/40 dark:to-indigo-900/40',
    'from-cyan-200 to-teal-200 dark:from-cyan-900/40 dark:to-teal-900/40',
    'from-emerald-200 to-green-200 dark:from-emerald-900/40 dark:to-green-900/40',
    'from-amber-200 to-yellow-200 dark:from-amber-900/40 dark:to-yellow-900/40',
    'from-orange-200 to-red-200 dark:from-orange-900/40 dark:to-red-900/40',
    'from-sky-200 to-blue-200 dark:from-sky-900/40 dark:to-blue-900/40',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}

/* ------------------------------------------------------------------ */
/*  Product Card (Grid View) — uses shared ProductCard                  */
/* ------------------------------------------------------------------ */

function ProductGridCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return <ProductCard product={product} onClick={onClick} size="full" />
}

/* ------------------------------------------------------------------ */
/*  Product Card (List View) — uses shared ProductCard (compact)       */
/* ------------------------------------------------------------------ */

function ProductListCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return <ProductCard product={product} onClick={onClick} size="compact" />
}

/* ------------------------------------------------------------------ */
/*  Price Range Slider Component (Dual Thumb)                           */
/* ------------------------------------------------------------------ */

function PriceRangeSlider({
  min,
  max,
  currentMin,
  currentMax,
  onChange,
}: {
  min: number
  max: number
  currentMin: number
  currentMax: number
  onChange: (min: number, max: number) => void
}) {
  const rangeRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null)

  const range = max - min || 1

  const minPercent = ((currentMin - min) / range) * 100
  const maxPercent = ((currentMax - min) / range) * 100

  const handlePointerDown = (thumb: 'min' | 'max', e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(thumb)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !rangeRef.current) return
      const rect = rangeRef.current.getBoundingClientRect()
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const value = Math.round(min + percent * range)

      if (dragging === 'min') {
        onChange(Math.min(value, currentMax - 1), currentMax)
      } else {
        onChange(currentMin, Math.max(value, currentMin + 1))
      }
    },
    [dragging, min, range, currentMin, currentMax, onChange]
  )

  const handlePointerUp = useCallback(() => {
    setDragging(null)
  }, [])

  // Quick price range presets
  const presets = [
    { label: `Under ${formatPrice(500)}`, minVal: min, maxVal: 500 },
    { label: `${formatPrice(500)} – ${formatPrice(2000)}`, minVal: 500, maxVal: 2000 },
    { label: `${formatPrice(2000)} – ${formatPrice(5000)}`, minVal: 2000, maxVal: 5000 },
    { label: `${formatPrice(5000)} – ${formatPrice(10000)}`, minVal: 5000, maxVal: 10000 },
    { label: `Over ${formatPrice(10000)}`, minVal: 10000, maxVal: max },
  ].filter(p => p.minVal >= min && p.maxVal <= max && p.minVal < p.maxVal)

  return (
    <div className="space-y-4">
      {/* Current values display */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Min</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{formatPrice(currentMin)}</p>
        </div>
        <div className="text-gray-300 dark:text-gray-600 font-light text-lg">—</div>
        <div className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Max</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{formatPrice(currentMax)}</p>
        </div>
      </div>

      {/* Dual thumb slider */}
      <div
        ref={rangeRef}
        className="relative h-6 flex items-center"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Track background */}
        <div className="absolute left-0 right-0 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
        {/* Active track */}
        <div
          className="absolute h-1.5 bg-blue-500 rounded-full"
          style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }}
        />
        {/* Min thumb */}
        <div
          onPointerDown={(e) => handlePointerDown('min', e)}
          className={cn(
            'absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-full shadow-md cursor-pointer z-10 -translate-x-1/2 transition-transform',
            dragging === 'min' ? 'scale-125 border-blue-600' : 'hover:scale-110'
          )}
          style={{ left: `${minPercent}%` }}
        />
        {/* Max thumb */}
        <div
          onPointerDown={(e) => handlePointerDown('max', e)}
          className={cn(
            'absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-full shadow-md cursor-pointer z-10 -translate-x-1/2 transition-transform',
            dragging === 'max' ? 'scale-125 border-blue-600' : 'hover:scale-110'
          )}
          style={{ left: `${maxPercent}%` }}
        />
      </div>

      {/* Quick presets */}
      {presets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Quick Select</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => onChange(preset.minVal, preset.maxVal)}
                className={cn(
                  'text-[11px] px-2.5 py-1.5 rounded-full border transition-colors font-medium',
                  currentMin === preset.minVal && currentMax === preset.maxVal
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Checkbox List Component                                             */
/* ------------------------------------------------------------------ */

function CheckboxList({
  items,
  selected,
  onToggle,
  maxVisible = 6,
}: {
  items: string[]
  selected: string[]
  onToggle: (item: string) => void
  maxVisible?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const visibleItems = showAll ? items : items.slice(0, maxVisible)

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
        No options available
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {visibleItems.map((item) => {
        const isSelected = selected.includes(item)
        return (
          <button
            key={item}
            onClick={() => onToggle(item)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
          >
            {/* Checkbox */}
            <div
              className={cn(
                'w-[18px] h-[18px] rounded-[4px] border-2 flex items-center justify-center flex-shrink-0 transition-all',
                isSelected
                  ? 'bg-blue-500 border-blue-500'
                  : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'
              )}
            >
              {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </div>
            {/* Label */}
            <span
              className={cn(
                'text-[13px] font-medium transition-colors',
                isSelected
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              {item}
            </span>
          </button>
        )
      })}
      {items.length > maxVisible && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[12px] font-semibold text-blue-500 hover:text-blue-600 px-3 py-1.5 transition-colors"
        >
          {showAll ? 'Show Less' : `+${items.length - maxVisible} More`}
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Filter Bottom Sheet (Flipkart-style)                                */
/* ------------------------------------------------------------------ */

function FilterBottomSheet({
  isOpen,
  onClose,
  onApply,
  filters,
  selectedCategories,
  selectedSubcategories,
  selectedBrands,
  selectedTags,
  priceMin,
  priceMax,
  minRating,
  inStockOnly,
  appliedCategories,
  appliedSubcategories,
  appliedBrands,
  appliedTags,
  appliedPriceMin,
  appliedPriceMax,
  appliedMinRating,
  appliedInStockOnly,
}: {
  isOpen: boolean
  onClose: () => void
  onApply: (data: {
    categories: string[]
    subcategories: string[]
    brands: string[]
    tags: string[]
    priceMin: number
    priceMax: number
    minRating: number
    inStockOnly: boolean
  }) => void
  filters: Filters
  selectedCategories: string[]
  selectedSubcategories: string[]
  selectedBrands: string[]
  selectedTags: string[]
  priceMin: number
  priceMax: number
  minRating: number
  inStockOnly: boolean
  appliedCategories: string[]
  appliedSubcategories: string[]
  appliedBrands: string[]
  appliedTags: string[]
  appliedPriceMin: number
  appliedPriceMax: number
  appliedMinRating: number
  appliedInStockOnly: boolean
}) {
  const [activeFilterTab, setActiveFilterTab] = useState<FilterCategory>('price')

  // Local state for filter selections (only applied on "Apply" click)
  const [localCategories, setLocalCategories] = useState<string[]>(selectedCategories)
  const [localSubcategories, setLocalSubcategories] = useState<string[]>(selectedSubcategories)
  const [localBrands, setLocalBrands] = useState<string[]>(selectedBrands)
  const [localTags, setLocalTags] = useState<string[]>(selectedTags)
  const [localPriceMin, setLocalPriceMin] = useState(priceMin)
  const [localPriceMax, setLocalPriceMax] = useState(priceMax)
  const [localMinRating, setLocalMinRating] = useState(minRating)
  const [localInStockOnly, setLocalInStockOnly] = useState(inStockOnly)

  // Sync local state when the sheet opens or applied filters change
  useEffect(() => {
    if (isOpen) {
      setLocalCategories(appliedCategories) // eslint-disable-line react-hooks/set-state-in-effect
      setLocalSubcategories(appliedSubcategories)
      setLocalBrands(appliedBrands)
      setLocalTags(appliedTags)
      setLocalPriceMin(appliedPriceMin)
      setLocalPriceMax(appliedPriceMax)
      setLocalMinRating(appliedMinRating)
      setLocalInStockOnly(appliedInStockOnly)
      setActiveFilterTab('price')
    }
  }, [isOpen, appliedCategories, appliedSubcategories, appliedBrands, appliedTags, appliedPriceMin, appliedPriceMax, appliedMinRating, appliedInStockOnly])

  const toggleItem = (list: string[], item: string) => {
    return list.includes(item) ? list.filter(i => i !== item) : [...list, item]
  }

  const totalActiveCount = useMemo(() => {
    let count = 0
    if (localPriceMin > filters.priceRange.min || localPriceMax < filters.priceRange.max) count++
    count += localCategories.length
    count += localSubcategories.length
    count += localBrands.length
    count += localTags.length
    if (localMinRating > 0) count++
    if (localInStockOnly) count++
    return count
  }, [localCategories, localSubcategories, localBrands, localTags, localPriceMin, localPriceMax, localMinRating, localInStockOnly, filters.priceRange])

  const handleClearAll = () => {
    setLocalCategories([])
    setLocalSubcategories([])
    setLocalBrands([])
    setLocalTags([])
    setLocalPriceMin(filters.priceRange.min)
    setLocalPriceMax(filters.priceRange.max)
    setLocalMinRating(0)
    setLocalInStockOnly(false)
  }

  const handleApply = () => {
    onApply({
      categories: localCategories,
      subcategories: localSubcategories,
      brands: localBrands,
      tags: localTags,
      priceMin: localPriceMin,
      priceMax: localPriceMax,
      minRating: localMinRating,
      inStockOnly: localInStockOnly,
    })
    onClose()
  }

  // Filter category tabs config
  const filterTabs = [
    {
      id: 'price' as FilterCategory,
      label: 'Price',
      count: (localPriceMin > filters.priceRange.min || localPriceMax < filters.priceRange.max) ? 1 : 0,
    },
    {
      id: 'brand' as FilterCategory,
      label: 'Brand',
      count: localBrands.length,
    },
    {
      id: 'category' as FilterCategory,
      label: 'Category',
      count: localCategories.length,
    },
    {
      id: 'subcategory' as FilterCategory,
      label: 'Sub',
      count: localSubcategories.length,
    },
    {
      id: 'tags' as FilterCategory,
      label: 'Tags',
      count: localTags.length,
    },
    {
      id: 'rating' as FilterCategory,
      label: 'Rating',
      count: localMinRating > 0 ? 1 : 0,
    },
    {
      id: 'inStock' as FilterCategory,
      label: 'Stock',
      count: localInStockOnly ? 1 : 0,
    },
  ] as const

  const visibleFilterTabs = (filterTabs as unknown as { id: FilterCategory; label: string; count: number }[]).filter(tab => {
    // Only show subcategory tab if there are subcategories
    if (tab.id === 'subcategory' && !(filters.subcategories?.length)) return false
    return true
  })

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="filter-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[100]"
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            key="filter-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed bottom-0 left-0 right-0 z-[101] bg-white dark:bg-gray-950 flex flex-col rounded-t-2xl"
            style={{ maxHeight: '75dvh' }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Filters</h2>
              </div>
              {totalActiveCount > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[13px] font-semibold text-blue-500 hover:text-blue-600 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* ── Two-Panel Layout ── */}
            <div className="flex flex-1 min-h-0">
              {/* Left Sidebar - Filter Category Tabs */}
              <div className="w-[110px] flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
                {visibleFilterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilterTab(tab.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-3.5 text-[13px] font-medium transition-colors text-left',
                      activeFilterTab === tab.id
                        ? 'bg-white dark:bg-gray-950 text-blue-600 dark:text-blue-400 border-l-[3px] border-blue-500 font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span className="text-[10px] bg-blue-500 text-white rounded-full w-[18px] h-[18px] flex items-center justify-center font-bold flex-shrink-0">
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Right Content - Filter Options */}
              <div className="flex-1 overflow-y-auto p-4">
                <AnimatePresence mode="wait">
                  {activeFilterTab === 'price' && (
                    <motion.div
                      key="price"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">Select Price Range</h3>
                      {filters.priceRange.min < filters.priceRange.max ? (
                        <PriceRangeSlider
                          min={filters.priceRange.min}
                          max={filters.priceRange.max}
                          currentMin={localPriceMin}
                          currentMax={localPriceMax}
                          onChange={(min, max) => {
                            setLocalPriceMin(min)
                            setLocalPriceMax(max)
                          }}
                        />
                      ) : (
                        <p className="text-sm text-gray-400 py-4 text-center">No price data available</p>
                      )}
                    </motion.div>
                  )}

                  {activeFilterTab === 'brand' && (
                    <motion.div
                      key="brand"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Select Brands</h3>
                      <CheckboxList
                        items={filters.brands}
                        selected={localBrands}
                        onToggle={(brand) => setLocalBrands(toggleItem(localBrands, brand))}
                      />
                    </motion.div>
                  )}

                  {activeFilterTab === 'category' && (
                    <motion.div
                      key="category"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Select Categories</h3>
                      <CheckboxList
                        items={filters.categories}
                        selected={localCategories}
                        onToggle={(cat) => setLocalCategories(toggleItem(localCategories, cat))}
                      />
                    </motion.div>
                  )}

                  {activeFilterTab === 'subcategory' && (
                    <motion.div
                      key="subcategory"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Select Subcategories</h3>
                      <CheckboxList
                        items={filters.subcategories || []}
                        selected={localSubcategories}
                        onToggle={(sub) => setLocalSubcategories(toggleItem(localSubcategories, sub))}
                      />
                    </motion.div>
                  )}

                  {activeFilterTab === 'tags' && (
                    <motion.div
                      key="tags"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Select Tags</h3>
                      <CheckboxList
                        items={filters.tags}
                        selected={localTags}
                        onToggle={(tag) => setLocalTags(toggleItem(localTags, tag))}
                      />
                    </motion.div>
                  )}

                  {activeFilterTab === 'rating' && (
                    <motion.div
                      key="rating"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Minimum Rating</h3>
                      <div className="space-y-2">
                        {[4, 3, 2, 1].map((rating) => (
                          <button
                            key={rating}
                            onClick={() => setLocalMinRating(localMinRating === rating ? 0 : rating)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                              localMinRating === rating
                                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'
                            )}
                          >
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={cn(
                                    'h-4 w-4',
                                    i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'
                                  )}
                                />
                              ))}
                            </div>
                            <span className={cn(
                              'text-[13px] font-medium',
                              localMinRating === rating ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                            )}>
                              {rating} & up
                            </span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {activeFilterTab === 'inStock' && (
                    <motion.div
                      key="inStock"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Availability</h3>
                      <button
                        onClick={() => setLocalInStockOnly(!localInStockOnly)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                          localInStockOnly
                            ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'
                        )}
                      >
                        <div className={cn(
                          'w-[18px] h-[18px] rounded-[4px] border-2 flex items-center justify-center flex-shrink-0 transition-all',
                          localInStockOnly
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-gray-300 dark:border-gray-600'
                        )}>
                          {localInStockOnly && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </div>
                        <span className={cn(
                          'text-[13px] font-medium',
                          localInStockOnly ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                        )}>
                          In Stock Only
                        </span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── Footer with Apply Button ── */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3 flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 h-11 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleApply}
                className="flex-[2] h-11 rounded-lg text-white text-sm font-bold transition-all shadow-sm"
                style={{ background: 'linear-gradient(135deg, #9C27B0, #BA68C8)' }}
              >
                Apply{totalActiveCount > 0 ? ` (${totalActiveCount})` : ''}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Products Page Component                                       */
/* ------------------------------------------------------------------ */

export function ProductsPage({ initialSearch, initialCategory, initialSubcategory, onNavigateToSearch, onBack, initialImageProducts, imageSearchInfo }: {
  initialSearch?: string
  initialCategory?: string
  initialSubcategory?: string
  onNavigateToSearch?: () => void
  onBack?: () => void
  /** Pre-computed image-search results — when provided, the page renders these
   *  directly (no /api/products fetch) and shows a dismissible banner.
   *  The user can still apply filters/sort which will then query /api/products
   *  normally, exiting the image-search view. */
  initialImageProducts?: Product[]
  /** Metadata about the image search (attributes, providers used) — shown in
   *  the banner. Optional. */
  imageSearchInfo?: {
    attributes?: {
      category?: string | null
      color?: string | null
      gender?: string | null
    }
    durationMs?: number
    previewUrl?: string
  }
} = {}) {
  const router = useRouter()
  const { totalItems: cartCount } = useCart()
  const { totalItems: wishlistCount } = useWishlist()

  // Data state
  const [products, setProducts] = useState<Product[]>(initialImageProducts || [])
  const [total, setTotal] = useState(initialImageProducts?.length || 0)
  const [loading, setLoading] = useState(!initialImageProducts) // skip loading if image results provided
  const [filters, setFilters] = useState<Filters>({
    categories: [],
    subcategories: [],
    priceRange: { min: 0, max: 0 },
    tags: [],
    brands: [],
    ratingOptions: [1, 2, 3, 4],
  })

  // Applied filter state (actually used in API calls)
  const [searchQuery, setSearchQuery] = useState(initialSearch || '')
  const [searchInitialized, setSearchInitialized] = useState(false)
  const [appliedCategories, setAppliedCategories] = useState<string[]>(initialCategory ? [initialCategory] : [])
  const [appliedSubcategories, setAppliedSubcategories] = useState<string[]>(initialSubcategory ? [initialSubcategory] : [])
  const [appliedBrands, setAppliedBrands] = useState<string[]>([])
  const [appliedTags, setAppliedTags] = useState<string[]>([])
  const [appliedPriceMin, setAppliedPriceMin] = useState(0)
  const [appliedPriceMax, setAppliedPriceMax] = useState(0)
  const [appliedMinRating, setAppliedMinRating] = useState(0)
  const [appliedInStockOnly, setAppliedInStockOnly] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>(initialImageProducts ? 'relevance' : 'newest')
  const [currentPage, setCurrentPage] = useState(1)

  // Image-search banner visibility — shown when image results are displayed,
  // hidden when the user dismisses it OR when they apply a filter (which
  // switches to the normal product listing flow).
  const [showImageBanner, setShowImageBanner] = useState(!!initialImageProducts)

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showSearch, setShowSearch] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showRatingDropdown, setShowRatingDropdown] = useState(false)
  // Single state for which filter modal is open: 'sort' | 'category' | 'rating' | 'filters' | null
  const [activeModal, setActiveModal] = useState<'sort' | 'category' | 'rating' | 'filters' | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const itemsPerPage = 20

  // Auto-focus search
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showSearch])

  // When searching, default sort to relevance
  useEffect(() => {
    if (searchQuery && sortBy !== 'relevance' && !searchInitialized) {
      setSortBy('relevance')
      setSearchInitialized(true)
    }
  }, [searchQuery, sortBy, searchInitialized])

  // ── Sync initialImageProducts when the prop changes ──
  // The useState initializer only runs ONCE on mount. If the ProductsPage
  // was already mounted (e.g., user visited products tab before searching),
  // a new image search won't update the products because useState ignores
  // new initial values. This useEffect syncs the prop → state whenever
  // initialImageProducts changes (new image search results arrive).
  useEffect(() => {
    if (initialImageProducts && initialImageProducts.length > 0) {
      setProducts(initialImageProducts)
      setTotal(initialImageProducts.length)
      setLoading(false)
      setShowImageBanner(true)
      setCurrentPage(1)
      setSortBy('relevance')
      // Enter image-search mode — prevents fetchProducts from overwriting
      // these results with ALL products from the API.
      inImageSearchModeRef.current = true
    } else if (initialImageProducts !== undefined && initialImageProducts.length === 0) {
      // initialImageProducts is explicitly empty (no results found)
      setProducts([])
      setTotal(0)
      setLoading(false)
      setShowImageBanner(true)
      inImageSearchModeRef.current = true
    }
  }, [initialImageProducts])

  /* ---------------------------------------------------------------- */
  /*  Fetch products                                                   */
  /* ---------------------------------------------------------------- */

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    // Exit image-search mode — once the user applies filters/sort/page
    // changes, we fetch from /api/products normally, so the visual-search
    // navbar (image avatar + "Visual Search Results" text) is hidden and
    // the normal title is shown instead.
    setShowImageBanner(false)
    // Clear the image-search mode flag so future fetchProducts calls
    // (triggered by the useEffect) are NOT skipped.
    inImageSearchModeRef.current = false
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (appliedCategories.length > 0) params.set('category', appliedCategories.join(','))
      if (appliedSubcategories.length > 0) params.set('subcategory', appliedSubcategories.join(','))
      if (appliedBrands.length > 0) params.set('brands', appliedBrands.join(','))
      if (appliedTags.length > 0) params.set('tags', appliedTags.join(','))
      if (appliedPriceMin > 0) params.set('minPrice', appliedPriceMin.toString())
      if (appliedPriceMax > 0 && appliedPriceMax < (filters.priceRange.max || Infinity)) {
        params.set('maxPrice', appliedPriceMax.toString())
      }
      if (appliedMinRating > 0) params.set('minRating', appliedMinRating.toString())
      if (appliedInStockOnly) params.set('inStock', 'true')
      params.set('sort', sortBy)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/products?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch products')
      const data = await res.json().catch(() => ({})).catch(() => ({}))

      setProducts(data.products || [])
      setTotal(data.total || 0)
      if (data.filters) {
        setFilters(prev => ({
          ...data.filters,
          // Preserve the initial price range as the absolute bounds
          priceRange: data.filters.priceRange?.min !== undefined ? data.filters.priceRange : prev.priceRange,
        }))
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, appliedCategories, appliedSubcategories, appliedBrands, appliedTags, appliedPriceMin, appliedPriceMax, appliedMinRating, appliedInStockOnly, sortBy, currentPage, filters.priceRange.max])

  // Track whether we've consumed the initial image-search results.
  // When image results are provided, we skip fetchProducts() calls until the
  // user actually applies a filter/sort/page change.
  //
  // CRITICAL: We can't just skip ONE call — the fetchProducts callback has
  // searchQuery in its dependency array, so when the parent clears searchQuery
  // (which happens in the onSuccess handler), the callback reference changes,
  // causing the useEffect to fire AGAIN. This would immediately overwrite the
  // image search results with ALL products.
  //
  // Solution: use a flag that stays true while we're in image-search mode.
  // It's only set to false when the user explicitly applies a filter/sort
  // (which calls fetchProducts directly from the apply handler, not via useEffect).
  const inImageSearchModeRef = useRef(!!initialImageProducts)

  useEffect(() => {
    // Skip ALL automatic fetchProducts calls while in image-search mode.
    // The image results are already set via useState/useEffect — we don't
    // need to fetch from the API until the user applies a filter.
    if (inImageSearchModeRef.current) {
      return
    }
    fetchProducts()
  }, [fetchProducts])

  // ── Fetch filter metadata for image-search results ──
  // When image search results are displayed (initialImageProducts provided),
  // fetchProducts() is skipped on mount, so the filters state stays empty.
  // This useEffect fetches ONLY the filter metadata (categories, subcategories,
  // brands, tags, price range) so the filter UI is populated and the user can
  // refine results.
  //
  // We fetch from two sources:
  //   1. /api/products?limit=1&filters=true → global filter metadata (all products)
  //   2. Derive subcategories from the image search results themselves — this
  //      ensures the subcategory tab shows subcategories RELEVANT to the
  //      image search results, not just all subcategories in the catalog.
  useEffect(() => {
    if (!initialImageProducts || initialImageProducts.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        // ── Source 1: Global filter metadata from the API ──
        const res = await fetch('/api/products?limit=1&filters=true')
        if (!res.ok) return
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        if (cancelled || !data.filters) return

        // ── Source 2: Derive subcategories from the image search results ──
        // This shows subcategories that are actually present in the search
        // results, making the filter UI more relevant to what the user sees.
        const resultSubcategories = new Set<string>()
        const resultCategories = new Set<string>()
        const resultBrands = new Set<string>()
        const resultTags = new Set<string>()
        let resultMinPrice = Infinity
        let resultMaxPrice = 0
        for (const p of initialImageProducts) {
          if (p.subcategory) resultSubcategories.add(p.subcategory)
          if (p.category) resultCategories.add(p.category)
          if (p.brand) resultBrands.add(p.brand)
          if (p.tags) p.tags.forEach((t) => resultTags.add(t))
          if (p.effectivePrice > 0) {
            if (p.effectivePrice < resultMinPrice) resultMinPrice = p.effectivePrice
            if (p.effectivePrice > resultMaxPrice) resultMaxPrice = p.effectivePrice
          }
        }

        // Merge: use global filters as the base, but ENSURE subcategories
        // from the search results are included (even if the global API
        // didn't return them for some reason).
        const globalSubcats = data.filters.subcategories || []
        const mergedSubcats = [...new Set([...globalSubcats, ...resultSubcategories])].sort()
        const globalCats = data.filters.categories || []
        const mergedCats = [...new Set([...globalCats, ...resultCategories])].sort()
        const globalBrands = data.filters.brands || []
        const mergedBrands = [...new Set([...globalBrands, ...resultBrands])].sort()
        const globalTags = data.filters.tags || []
        const mergedTags = [...new Set([...globalTags, ...resultTags])].sort()

        // Use the global price range (broader) if available, otherwise
        // fall back to the search results' price range.
        const priceRange = data.filters.priceRange?.min !== undefined && data.filters.priceRange.max > 0
          ? data.filters.priceRange
          : (resultMinPrice !== Infinity
              ? { min: Math.floor(resultMinPrice), max: Math.ceil(resultMaxPrice) }
              : { min: 0, max: 0 })

        setFilters({
          categories: mergedCats,
          subcategories: mergedSubcats,
          brands: mergedBrands,
          tags: mergedTags,
          priceRange,
          ratingOptions: data.filters.ratingOptions || [4, 3, 2, 1],
        })

        // Set the local price range bounds for the slider
        if (priceRange.max > 0) {
          setAppliedPriceMin(0)
          setAppliedPriceMax(0) // 0 means "no filter" — slider starts at full range
        }
      } catch {
        // Non-critical — filters just stay empty, user can still see products
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageProducts])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, appliedCategories, appliedSubcategories, appliedBrands, appliedTags, appliedPriceMin, appliedPriceMax, appliedMinRating, appliedInStockOnly, sortBy])

  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Sort options (Flipkart-style row)                                */
  /* ---------------------------------------------------------------- */

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'newest', label: 'Newest' },
    { value: 'price-low', label: 'Price — Low to High' },
    { value: 'price-high', label: 'Price — High to Low' },
    { value: 'rating', label: 'Rating' },
    { value: 'discount', label: 'Discount' },
    { value: 'popularity', label: 'Popularity' },
    { value: 'name', label: 'Name A-Z' },
  ]

  /* ---------------------------------------------------------------- */
  /*  Active filter chips computation                                  */
  /* ---------------------------------------------------------------- */

  const activeFilters: ActiveFilter[] = useMemo(() => {
    const result: ActiveFilter[] = []
    if (appliedPriceMin > (filters.priceRange.min || 0) || appliedPriceMax < (filters.priceRange.max || 0) && appliedPriceMax > 0) {
      result.push({
        type: 'price',
        value: 'price',
        label: `${formatPrice(appliedPriceMin)} – ${formatPrice(appliedPriceMax)}`,
      })
    }
    appliedCategories.forEach(cat => result.push({ type: 'category', value: cat, label: cat }))
    appliedSubcategories.forEach(sub => result.push({ type: 'subcategory', value: sub, label: sub }))
    appliedBrands.forEach(brand => result.push({ type: 'brand', value: brand, label: brand }))
    appliedTags.forEach(tag => result.push({ type: 'tag', value: tag, label: tag }))
    if (appliedMinRating > 0) {
      result.push({ type: 'rating', value: String(appliedMinRating), label: `${appliedMinRating}★ & up` })
    }
    if (appliedInStockOnly) {
      result.push({ type: 'inStock', value: 'inStock', label: 'In Stock' })
    }
    return result
  }, [appliedCategories, appliedSubcategories, appliedBrands, appliedTags, appliedPriceMin, appliedPriceMax, appliedMinRating, appliedInStockOnly, filters.priceRange])

  const removeFilter = (filter: ActiveFilter) => {
    switch (filter.type) {
      case 'price':
        setAppliedPriceMin(filters.priceRange.min || 0)
        setAppliedPriceMax(filters.priceRange.max || 0)
        break
      case 'category':
        setAppliedCategories(prev => prev.filter(c => c !== filter.value))
        break
      case 'subcategory':
        setAppliedSubcategories(prev => prev.filter(s => s !== filter.value))
        break
      case 'brand':
        setAppliedBrands(prev => prev.filter(b => b !== filter.value))
        break
      case 'tag':
        setAppliedTags(prev => prev.filter(t => t !== filter.value))
        break
      case 'rating':
        setAppliedMinRating(0)
        break
      case 'inStock':
        setAppliedInStockOnly(false)
        break
    }
  }

  const clearAllFilters = () => {
    setSearchQuery('')
    setAppliedCategories([])
    setAppliedSubcategories([])
    setAppliedBrands([])
    setAppliedTags([])
    setAppliedPriceMin(filters.priceRange.min || 0)
    setAppliedPriceMax(filters.priceRange.max || 0)
    setAppliedMinRating(0)
    setAppliedInStockOnly(false)
    setSortBy('newest')
  }

  const totalActiveFilterCount = activeFilters.length + (searchQuery ? 1 : 0)

  /* ---------------------------------------------------------------- */
  /*  Handle filter apply from bottom sheet                           */
  /* ---------------------------------------------------------------- */

  const handleFilterApply = (data: {
    categories: string[]
    subcategories: string[]
    brands: string[]
    tags: string[]
    priceMin: number
    priceMax: number
    minRating: number
    inStockOnly: boolean
  }) => {
    setAppliedCategories(data.categories)
    setAppliedSubcategories(data.subcategories)
    setAppliedBrands(data.brands)
    setAppliedTags(data.tags)
    setAppliedPriceMin(data.priceMin)
    setAppliedPriceMax(data.priceMax)
    setAppliedMinRating(data.minRating)
    setAppliedInStockOnly(data.inStockOnly)
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div
      className="flex flex-col h-[calc(100dvh)]"
      style={{ background: '#FFFFFF' }}
    >
      {/* ── Sticky Header Bar: Back arrow + Title + Search/Wishlist/Cart icons ──
          Same style as the categories page navbar for visual consistency.
          When showing image-search results, the title area is replaced
          with an attractive square avatar of the search image + the
          "Visual Search Results" label beside it. */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 px-3 py-2 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Back button — navigates to the previous in-app page
                (categories/search/home) via the parent's navHistory stack.
                Falls back to router.back() when used standalone (no onBack). */}
            <button
              onClick={() => {
                if (onBack) {
                  onBack()
                } else if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back()
                } else {
                  router.push('/customer?tab=home')
                }
              }}
              className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            {/* Title area — shows image avatar + "Visual Search Results"
                when image-search results are displayed, otherwise the
                normal search/category/subcategory title. */}
            {showImageBanner && imageSearchInfo ? (
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* Square avatar of the search image — attractive rounded
                    square with a subtle emerald ring to match the visual
                    search theme. Falls back to a Camera icon gradient
                    tile when no preview URL is available. */}
                {imageSearchInfo.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageSearchInfo.previewUrl}
                    alt="Visual search"
                    className="h-9 w-9 rounded-lg object-cover ring-2 ring-emerald-400/60 flex-shrink-0 shadow-sm"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center ring-2 ring-emerald-400/40 flex-shrink-0 shadow-sm">
                    <Camera className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <h1 className="text-[15px] font-bold text-gray-800 dark:text-gray-100 truncate leading-tight">
                    Visual Search Results
                  </h1>
                </div>
              </div>
            ) : (
              <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 truncate">
                {searchQuery ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-400 dark:text-gray-500 text-sm font-normal">Results for</span>
                    <span className="text-gray-900 dark:text-white">"{searchQuery}"</span>
                  </span>
                ) : initialSubcategory ? (
                  <span>{initialSubcategory}</span>
                ) : initialCategory ? (
                  <span>{initialCategory}</span>
                ) : (
                  <span>All Products</span>
                )}
              </h1>
            )}
          </div>

          {/* Right Icons: Search → Wishlist → Cart */}
          <div className="flex items-center gap-0.5">
            {/* Search Icon */}
            <button
              onClick={() => onNavigateToSearch ? onNavigateToSearch() : router.push('/customer?tab=search')}
              className="h-9 w-9 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Wishlist Icon with Badge */}
            <button
              onClick={() => router.push('/customer?tab=wishlist')}
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
              onClick={() => router.push('/customer?tab=cart')}
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
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const }}
              className="overflow-hidden"
            >
              <div className="flex items-center h-9 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 gap-2 mt-2">
                <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setShowSearch(false) }}
                  placeholder="Search products, brands, categories..."
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Meesho-style Filter Bar (below navbar) ──
          4 equal-width compact tabs filling the full screen width.
          No scroll, no extra space, no Clear All tab. */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-950 shadow-sm">
        <div className="flex items-stretch">
          {/* Sort */}
          <button
            onClick={() => { setActiveModal('sort'); setShowSortDropdown(false); setShowCategoryDropdown(false); setShowRatingDropdown(false) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2.5 text-[13px] font-semibold transition-colors border-r border-gray-100 dark:border-gray-800',
              sortBy !== 'newest' || activeModal === 'sort'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400'
            )}
          >
            <span>Sort</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', activeModal === 'sort' && 'rotate-180')} />
          </button>

          {/* Category */}
          <button
            onClick={() => { setActiveModal('category'); setShowSortDropdown(false); setShowCategoryDropdown(false); setShowRatingDropdown(false) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2.5 text-[13px] font-semibold transition-colors border-r border-gray-100 dark:border-gray-800',
              appliedCategories.length > 0 || activeModal === 'category'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400'
            )}
          >
            <span>Category</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', activeModal === 'category' && 'rotate-180')} />
          </button>

          {/* Ratings */}
          <button
            onClick={() => { setActiveModal('rating'); setShowSortDropdown(false); setShowCategoryDropdown(false); setShowRatingDropdown(false) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2.5 text-[13px] font-semibold transition-colors border-r border-gray-100 dark:border-gray-800',
              appliedMinRating > 0 || activeModal === 'rating'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400'
            )}
          >
            <span>Ratings</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', activeModal === 'rating' && 'rotate-180')} />
          </button>

          {/* Filters */}
          <button
            onClick={() => setActiveModal('filters')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2.5 text-[13px] font-semibold transition-colors',
              totalActiveFilterCount > 0 || activeModal === 'filters'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400'
            )}
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Filters</span>
            {totalActiveFilterCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
          </button>
        </div>
      </div>

      {/* ── Reusable Bottom Sheet Modal for all 4 filter tabs ── */}
      <AnimatePresence>
        {activeModal && activeModal !== 'filters' && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[100]"
              onClick={() => setActiveModal(null)}
            />
            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className="fixed bottom-0 left-0 right-0 z-[101] bg-white dark:bg-gray-950 flex flex-col rounded-t-2xl"
              style={{ maxHeight: '75dvh' }}
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {activeModal === 'sort' ? 'Sort By' : activeModal === 'category' ? 'Select Category' : 'Minimum Rating'}
                </h2>
                <button
                  onClick={() => setActiveModal(null)}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {/* Content — scrollable */}
              <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {/* Sort options */}
                {activeModal === 'sort' && sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSortBy(opt.value); setActiveModal(null) }}
                    className={cn(
                      'w-full text-left px-3 py-3 text-sm font-medium transition-colors rounded-xl flex items-center justify-between',
                      sortBy === opt.value
                        ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    )}
                  >
                    <span>{opt.label}</span>
                    {sortBy === opt.value && <Check className="h-4 w-4 text-gray-900 dark:text-white" />}
                  </button>
                ))}

                {/* Category options */}
                {activeModal === 'category' && (
                  filters.categories.length === 0 ? (
                    <p className="px-4 py-8 text-sm text-gray-400 text-center">No categories available</p>
                  ) : (
                    filters.categories.map((cat) => {
                      const isSelected = appliedCategories.includes(cat)
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            if (isSelected) {
                              setAppliedCategories(prev => prev.filter(c => c !== cat))
                            } else {
                              setAppliedCategories(prev => [...prev, cat])
                            }
                          }}
                          className={cn(
                            'w-full text-left px-3 py-3 text-sm font-medium transition-colors rounded-xl flex items-center gap-3',
                            isSelected
                              ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          )}
                        >
                          <div className={cn(
                            'w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center flex-shrink-0',
                            isSelected ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600'
                          )}>
                            {isSelected && <Check className="h-3 w-3 text-white dark:text-gray-900" strokeWidth={3} />}
                          </div>
                          <span>{cat}</span>
                        </button>
                      )
                    })
                  )
                )}

                {/* Rating options */}
                {activeModal === 'rating' && [4, 3, 2, 1].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => {
                      setAppliedMinRating(appliedMinRating === rating ? 0 : rating)
                      setActiveModal(null)
                    }}
                    className={cn(
                      'w-full text-left px-3 py-3 text-sm font-medium transition-colors rounded-xl flex items-center justify-between',
                      appliedMinRating === rating
                        ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              'h-4 w-4',
                              i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'
                            )}
                          />
                        ))}
                      </span>
                      <span>{rating} & up</span>
                    </span>
                    {appliedMinRating === rating && <Check className="h-4 w-4 text-gray-900 dark:text-white" />}
                  </button>
                ))}
              </div>

              {/* Footer — Apply/Close */}
              <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => setActiveModal(null)}
                  className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Close
                </button>
                {activeModal === 'category' && appliedCategories.length > 0 && (
                  <button
                    onClick={() => setAppliedCategories([])}
                    className="flex-1 h-11 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors border border-red-200 dark:border-red-800"
                  >
                    Clear ({appliedCategories.length})
                  </button>
                )}
                <button
                  onClick={() => setActiveModal(null)}
                  className="flex-[2] h-11 rounded-xl text-white text-sm font-bold transition-all shadow-sm"
                  style={{ background: 'linear-gradient(135deg, #9C27B0, #BA68C8)' }}
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Content area — Product Grid ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: '#FFFFFF', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {loading ? (
          /* Shimmer Skeleton Loading */
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-[28px] overflow-hidden" style={{ background: '#f0eeec' }}>
                <div className="aspect-[3/4] shimmer rounded-[28px]" style={{ background: '#e0ddd8' }} />
                <div className="p-3 space-y-2">
                  <div className="h-3 w-10 shimmer rounded-full" style={{ background: '#e0ddd8' }} />
                  <div className="h-4 w-full shimmer rounded-full" style={{ background: '#e0ddd8' }} />
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-16 shimmer rounded-full" style={{ background: '#e0ddd8' }} />
                    <div className="h-3 w-8 shimmer rounded-full" style={{ background: '#e0ddd8' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
          >
            {products.map((product, pIdx) => (
              <ProductGridCard key={product._id || `product-${pIdx}`} product={product} onClick={() => router.push(`/customer/product/${product._id}`)} />
            ))}
          </motion.div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-200 to-pink-200 dark:from-purple-900/30 dark:to-pink-900/30 rounded-3xl blur-2xl opacity-60" />
              <div className="relative h-20 w-20 rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 flex items-center justify-center">
                {showImageBanner && imageSearchInfo ? (
                  <Camera className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <Package className="h-10 w-10 text-purple-500 dark:text-purple-400" />
                )}
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">
              {showImageBanner && imageSearchInfo
                ? 'No matching products found'
                : 'No products found'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              {showImageBanner && imageSearchInfo
                ? `We couldn't find any ${imageSearchInfo.attributes?.gender || ''} ${imageSearchInfo.attributes?.category || 'products'} matching your image. Try searching with a different photo.`
                : searchQuery || activeFilters.length > 0
                  ? "Try adjusting your search or filters to find what you're looking for."
                  : 'Check back later for new products.'}
            </p>
            {showImageBanner && imageSearchInfo ? (
              <button
                onClick={() => {
                  if (onBack) onBack()
                  else if (typeof window !== 'undefined') window.history.back()
                }}
                className="mt-5 px-6 py-2.5 text-sm font-semibold text-white rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #10b981, #14b8a6)', boxShadow: '0 8px 20px rgba(16,185,129,0.25)' }}
              >
                Try another image
              </button>
            ) : (searchQuery || activeFilters.length > 0) ? (
              <button
                onClick={clearAllFilters}
                className="mt-5 px-6 py-2.5 text-sm font-semibold text-white rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #9C27B0, #BA68C8)', boxShadow: '0 8px 20px rgba(156,39,176,0.25)' }}
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-6 px-3">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-9 px-4 text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-purple-400 hover:text-purple-600 dark:hover:border-purple-600 dark:hover:text-purple-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 rounded-lg">
                {currentPage}
              </span>
              <span className="text-xs text-gray-400">/</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1.5">
                {totalPages}
              </span>
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-9 px-4 text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-purple-400 hover:text-purple-600 dark:hover:border-purple-600 dark:hover:text-purple-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        )}

        {/* Bottom padding for mobile bottom navbar */}
        <div className="h-20 lg:h-4" />
      </div>

      {/* ── Filters Modal (reusable Sheet component) ──
          Opens when the Filters tab is clicked. Uses the shared
          Sheet UI component for a clean, consistent modal experience. */}
      <FilterBottomSheet
        isOpen={activeModal === 'filters'}
        onClose={() => setActiveModal(null)}
        onApply={handleFilterApply}
        filters={filters}
        selectedCategories={appliedCategories}
        selectedSubcategories={appliedSubcategories}
        selectedBrands={appliedBrands}
        selectedTags={appliedTags}
        priceMin={appliedPriceMin}
        priceMax={appliedPriceMax}
        minRating={appliedMinRating}
        inStockOnly={appliedInStockOnly}
        appliedCategories={appliedCategories}
        appliedSubcategories={appliedSubcategories}
        appliedBrands={appliedBrands}
        appliedTags={appliedTags}
        appliedPriceMin={appliedPriceMin}
        appliedPriceMax={appliedPriceMax}
        appliedMinRating={appliedMinRating}
        appliedInStockOnly={appliedInStockOnly}
      />
    </div>
  )
}
