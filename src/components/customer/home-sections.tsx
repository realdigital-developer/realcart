'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Zap, Clock, Package, ChevronRight, Star, TrendingUp, Timer, Truck, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Product, CategoryItem } from './types'
import { ProductCard } from './product-card'

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
    'from-cyan-200 to-teal-200 dark:from-cyan-900/40 dark:to-teal-900/40',
    'from-emerald-200 to-green-200 dark:from-emerald-900/40 dark:to-green-200',
    'from-amber-200 to-yellow-200 dark:from-amber-900/40 dark:to-yellow-900/40',
    'from-orange-200 to-red-200 dark:from-orange-900/40 dark:to-red-900/40',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}

/* ------------------------------------------------------------------ */
/*  Rating Stars Mini                                                   */
/* ------------------------------------------------------------------ */

function MiniRatingStars({ rating }: { rating: number }) {
  if (!rating || rating <= 0) return null
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <span className={cn(
        'text-[9px] font-bold px-1 py-px rounded text-white',
        rating >= 4 ? 'bg-emerald-600' : rating >= 3 ? 'bg-amber-500' : 'bg-red-500'
      )}>
        {rating.toFixed(1)}
      </span>
      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared data context — ONE fetch shared across all sections         */
/* ------------------------------------------------------------------ */

interface HomeProductsData {
  dealProducts: Product[]      // sorted by discount %
  newestProducts: Product[]    // sorted by newest
  topRatedProducts: Product[]  // sorted by rating
  trendingProducts: Product[]  // sorted by popularity (totalSold)
  loading: boolean
  error: boolean
  onNavigateToProducts?: (params?: { sort?: string; category?: string }) => void
}

const HomeProductsContext = createContext<HomeProductsData>({
  dealProducts: [],
  newestProducts: [],
  topRatedProducts: [],
  trendingProducts: [],
  loading: true,
  error: false,
  onNavigateToProducts: undefined,
})

/** Single data-fetching provider — runs ONCE, shares results with all children. */
function HomeProductsProvider({ children, onNavigateToProducts }: { children: React.ReactNode; onNavigateToProducts?: (params?: { sort?: string; category?: string }) => void }) {
  const [data, setData] = useState<HomeProductsData>({
    dealProducts: [],
    newestProducts: [],
    topRatedProducts: [],
    trendingProducts: [],
    loading: true,
    error: false,
    onNavigateToProducts,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      try {
        // Parallel fetches — 4 independent product lists
        const [dealsRes, newestRes, topRatedRes, trendingRes] = await Promise.allSettled([
          fetch('/api/products?sort=discount&limit=20&filters=false', { signal: AbortSignal.timeout(15000) }),
          fetch('/api/products?sort=newest&limit=20&filters=false', { signal: AbortSignal.timeout(15000) }),
          fetch('/api/products?sort=rating&limit=20&filters=false', { signal: AbortSignal.timeout(15000) }),
          fetch('/api/products?sort=popularity&limit=20&filters=false', { signal: AbortSignal.timeout(15000) }),
        ])

        if (cancelled) return

        const parseResult = async (res: PromiseSettledResult<Response>) => {
          if (res.status !== 'fulfilled' || !res.value.ok) return []
          try {
            const data = await res.value.json()
            return Array.isArray(data.products) ? data.products : []
          } catch { return [] }
        }

        const dealProducts = await parseResult(dealsRes)
        const newestProducts = await parseResult(newestRes)
        const topRatedProducts = await parseResult(topRatedRes)
        const trendingProducts = await parseResult(trendingRes)

        if (cancelled) return
        setData({ dealProducts, newestProducts, topRatedProducts, trendingProducts, loading: false, error: false })
      } catch {
        if (!cancelled) {
          setData({ dealProducts: [], newestProducts: [], topRatedProducts: [], trendingProducts: [], loading: false, error: true })
        }
      }
    }

    fetchAll()
    return () => { cancelled = true }
  }, [])

  return (
    <HomeProductsContext.Provider value={{ ...data, onNavigateToProducts }}>
      {children}
    </HomeProductsContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  Countdown Timer Component                                          */
/* ------------------------------------------------------------------ */

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const now = new Date()
    const endTime = new Date(now)
    endTime.setHours(23, 59, 59, 999)

    const tick = () => {
      const now = new Date()
      const diff = endTime.getTime() - now.getTime()
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 })
        return
      }
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeLeft({ hours, minutes, seconds })
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  const pad = (n: number) => n.toString().padStart(2, '0')

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-1.5 py-0.5 rounded-md min-w-[26px] text-center">
          {pad(timeLeft.hours)}
        </span>
        <span className="text-white/70 text-xs font-bold">:</span>
        <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-1.5 py-0.5 rounded-md min-w-[26px] text-center">
          {pad(timeLeft.minutes)}
        </span>
        <span className="text-white/70 text-xs font-bold">:</span>
        <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-1.5 py-0.5 rounded-md min-w-[26px] text-center animate-pulse">
          {pad(timeLeft.seconds)}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Product Card (Horizontal scroll) — uses shared ProductCard          */
/* ------------------------------------------------------------------ */

function HorizontalProductCard({ product }: { product: Product }) {
  return <ProductCard product={product} size="compact" />
}

/* ------------------------------------------------------------------ */
/*  Section Wrapper with Gradient Header                               */
/* ------------------------------------------------------------------ */

function SectionWrapper({ title, icon, children, onSeeAll, gradient, countdown }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  onSeeAll?: () => void
  gradient?: string
  countdown?: boolean
}) {
  return (
    <div className="py-3 sm:py-4">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        {/* Gradient Section Header */}
        <div className={cn(
          'flex items-center justify-between mb-3 px-4 py-2.5 rounded-xl',
          gradient || 'bg-gradient-to-r from-emerald-600 to-teal-600'
        )}>
          <div className="flex items-center gap-2">
            <span className="text-white/80">{icon}</span>
            <h2 className="text-sm sm:text-base font-bold text-white">{title}</h2>
            {countdown && <CountdownTimer />}
          </div>
          {onSeeAll && (
            <button
              onClick={onSeeAll}
              className="flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white bg-white/15 hover:bg-white/25 px-3 py-1 rounded-full transition-colors"
            >
              View All
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Horizontal Scroll Content */}
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                    */
/* ------------------------------------------------------------------ */

function SectionSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px]">
          <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-xl shimmer" />
          <div className="mt-2 space-y-1.5 p-2.5">
            <div className="h-2.5 w-16 bg-gray-100 dark:bg-gray-800 rounded shimmer" />
            <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded shimmer" />
            <div className="h-3 w-12 bg-gray-100 dark:bg-gray-800 rounded shimmer" />
          </div>
        </div>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Deal of the Day Section — reads from shared context                */
/* ------------------------------------------------------------------ */

function DealOfDaySection() {
  const { dealProducts, loading, onNavigateToProducts } = useContext(HomeProductsContext)
  const router = useRouter()

  if (loading) {
    return (
      <SectionWrapper
        title="Deals of the Day"
        icon={<Zap className="h-5 w-5 text-yellow-300" />}
        gradient="bg-gradient-to-r from-orange-500 to-red-500"
        countdown
      >
        <SectionSkeleton />
      </SectionWrapper>
    )
  }

  if (dealProducts.length === 0) return null

  return (
    <SectionWrapper
      title="Deals of the Day"
      icon={<Zap className="h-5 w-5 text-yellow-300" />}
      gradient="bg-gradient-to-r from-orange-500 to-red-500"
      countdown
      onSeeAll={() => onNavigateToProducts?.({ sort: 'discount' })}
    >
      {dealProducts.map((product, pIdx) => (
        <HorizontalProductCard key={product._id || `deal-${pIdx}`} product={product} />
      ))}
    </SectionWrapper>
  )
}

/* ------------------------------------------------------------------ */
/*  Top Rated Section — reads from shared context (sort=rating)        */
/* ------------------------------------------------------------------ */

function TopRatedSection() {
  const { topRatedProducts, loading, onNavigateToProducts } = useContext(HomeProductsContext)
  const router = useRouter()

  if (loading) {
    return (
      <SectionWrapper
        title="Top Rated"
        icon={<Star className="h-5 w-5 text-yellow-300" />}
        gradient="bg-gradient-to-r from-amber-500 to-orange-500"
      >
        <SectionSkeleton />
      </SectionWrapper>
    )
  }

  if (topRatedProducts.length === 0) return null

  return (
    <SectionWrapper
      title="Top Rated"
      icon={<Star className="h-5 w-5 text-yellow-300" />}
      gradient="bg-gradient-to-r from-amber-500 to-orange-500"
      onSeeAll={() => onNavigateToProducts?.({ sort: 'rating' })}
    >
      {topRatedProducts.map((product, pIdx) => (
        <HorizontalProductCard key={product._id || `rated-${pIdx}`} product={product} />
      ))}
    </SectionWrapper>
  )
}

/* ------------------------------------------------------------------ */
/*  Trending Now Section — reads from shared context (sort=popularity) */
/* ------------------------------------------------------------------ */

function TrendingSection() {
  const { trendingProducts, loading, onNavigateToProducts } = useContext(HomeProductsContext)
  const router = useRouter()

  if (loading) {
    return (
      <SectionWrapper
        title="Trending Now"
        icon={<TrendingUp className="h-5 w-5 text-emerald-200" />}
        gradient="bg-gradient-to-r from-emerald-600 to-cyan-600"
      >
        <SectionSkeleton />
      </SectionWrapper>
    )
  }

  if (trendingProducts.length === 0) return null

  return (
    <SectionWrapper
      title="Trending Now"
      icon={<TrendingUp className="h-5 w-5 text-emerald-200" />}
      gradient="bg-gradient-to-r from-emerald-600 to-cyan-600"
      onSeeAll={() => onNavigateToProducts?.({ sort: 'popularity' })}
    >
      {trendingProducts.map((product, pIdx) => (
        <HorizontalProductCard key={product._id || `trending-${pIdx}`} product={product} />
      ))}
    </SectionWrapper>
  )
}

/* ------------------------------------------------------------------ */
/*  New Arrivals Section — reads from shared context (sort=newest)     */
/* ------------------------------------------------------------------ */

function NewArrivalsSection() {
  const { newestProducts, loading, onNavigateToProducts } = useContext(HomeProductsContext)
  const router = useRouter()

  if (loading) {
    return (
      <SectionWrapper
        title="New Arrivals"
        icon={<Flame className="h-5 w-5 text-rose-300" />}
        gradient="bg-gradient-to-r from-rose-500 to-pink-500"
      >
        <SectionSkeleton />
      </SectionWrapper>
    )
  }

  if (newestProducts.length === 0) return null

  return (
    <SectionWrapper
      title="New Arrivals"
      icon={<Flame className="h-5 w-5 text-rose-300" />}
      gradient="bg-gradient-to-r from-rose-500 to-pink-500"
      onSeeAll={() => onNavigateToProducts?.({ sort: 'newest' })}
    >
      {newestProducts.map((product, pIdx) => (
        <HorizontalProductCard key={product._id || `newest-${pIdx}`} product={product} />
      ))}
    </SectionWrapper>
  )
}

/* ------------------------------------------------------------------ */
/*  Shop by Category Section — products grouped by category            */
/* ------------------------------------------------------------------ */

function ShopByCategorySection({ onNavigateToProducts }: { onNavigateToProducts?: (params?: { sort?: string; category?: string }) => void }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [categoryProducts, setCategoryProducts] = useState<Record<string, Product[]>>({})
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    async function fetchCategoryProducts() {
      try {
        // Fetch categories first
        // cache: 'no-store' ensures the browser never serves a stale cached
        // response — the admin's reorder is always reflected immediately.
        const catRes = await fetch('/api/categories', { signal: AbortSignal.timeout(10000), cache: 'no-store' })
        if (!catRes.ok || cancelled) return
        const catData = await catRes.json()
        const cats: CategoryItem[] = Array.isArray(catData.categories) ? catData.categories : []
        if (cats.length === 0 || cancelled) {
          setLoading(false)
          return
        }
        setCategories(cats)

        // Fetch products for top categories (limit to 6 categories, 10 products each)
        const topCats = cats.slice(0, 6)
        const results = await Promise.allSettled(
          topCats.map(cat =>
            fetch(`/api/products?category=${encodeURIComponent(cat.name)}&sort=popularity&limit=10&filters=false`, {
              signal: AbortSignal.timeout(15000),
            }).then(r => r.ok ? r.json() : { products: [] })
          )
        )

        if (cancelled) return

        const productsMap: Record<string, Product[]> = {}
        topCats.forEach((cat, idx) => {
          const res = results[idx]
          if (res.status === 'fulfilled' && Array.isArray(res.value.products)) {
            productsMap[cat.name] = res.value.products
          }
        })

        setCategoryProducts(productsMap)
      } catch {
        // Non-critical — just don't show this section
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchCategoryProducts()
    return () => { cancelled = true }
  }, [])

  // Filter out categories with no products
  const activeCategories = categories.filter(cat => {
    const prods = categoryProducts[cat.name]
    return prods && prods.length > 0
  })

  if (loading) {
    return (
      <div className="py-3 sm:py-4">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500">
            <span className="text-white/80"><Package className="h-5 w-5 text-purple-200" /></span>
            <h2 className="text-sm sm:text-base font-bold text-white">Shop by Category</h2>
          </div>
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="flex gap-3 overflow-hidden">
                <SectionSkeleton count={4} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (activeCategories.length === 0) return null

  return (
    <div className="py-3 sm:py-4">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 space-y-4">
        {activeCategories.map((cat) => (
          <div key={cat._id || `shop-${cat.name}`}>
            <SectionWrapper
              title={cat.name}
              icon={
                <div className="w-6 h-6 rounded-full overflow-hidden bg-white/20 flex items-center justify-center flex-shrink-0">
                  {cat.imageUrl ? (
                    <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-3 w-3 text-white/80" />
                  )}
                </div>
              }
              gradient="bg-gradient-to-r from-teal-600 to-emerald-600"
              onSeeAll={() => {
                onNavigateToProducts?.({ category: cat.name })
              }}
            >
              {(categoryProducts[cat.name] || []).map((product, pIdx) => (
                <HorizontalProductCard key={product._id || `catprod-${pIdx}`} product={product} />
              ))}
            </SectionWrapper>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Recently Viewed Section                                             */
/* ------------------------------------------------------------------ */

interface RecentProduct {
  _id: string
  name: string
  mrp: number
  sellingPrice: number
  effectivePrice: number
  hasDiscount: boolean
  discountPercent: number
  imageUrl: string
  category: string
  brand: string
}

function RecentlyViewedSection() {
  const [items] = useState<RecentProduct[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem('realcart_recently_viewed')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          // Migrate old format
          return parsed.map((item: Record<string, unknown>) => ({
            _id: item._id as string,
            name: item.name as string,
            mrp: (item.mrp as number) ?? (item.price as number) ?? 0,
            sellingPrice: (item.sellingPrice as number) ?? (item.effectivePrice as number) ?? 0,
            effectivePrice: (item.effectivePrice as number) ?? 0,
            hasDiscount: (item.hasDiscount as boolean) ?? false,
            discountPercent: (item.discountPercent as number) ?? 0,
            imageUrl: (item.imageUrl as string) ?? '',
            category: (item.category as string) ?? '',
            brand: (item.brand as string) ?? '',
          }))
        }
      }
    } catch {}
    return []
  })
  const router = useRouter()

  if (items.length === 0) return null

  return (
    <SectionWrapper
      title="Recently Viewed"
      icon={<Clock className="h-5 w-5 text-teal-200" />}
      gradient="bg-gradient-to-r from-teal-600 to-emerald-600"
    >
      {items.map((product, pIdx) => (
        <HorizontalProductCard
          key={product._id || `recent-${pIdx}`}
          product={{
            ...product,
            stock: 99,
            tags: [],
            seller: '',
            inStock: true,
            slug: '',
            description: '',
          }}
        />
      ))}
    </SectionWrapper>
  )
}

/* ------------------------------------------------------------------ */
/*  Combined Home Sections — wraps everything in shared data provider  */
/* ------------------------------------------------------------------ */

export default function HomeSections({ onNavigateToProducts }: { onNavigateToProducts?: (params?: { sort?: string; category?: string }) => void }) {
  return (
    <HomeProductsProvider onNavigateToProducts={onNavigateToProducts}>
      <div className="bg-gray-50 dark:bg-gray-900/30 space-y-1">
        <DealOfDaySection />
        <TrendingSection />
        <TopRatedSection />
        <NewArrivalsSection />
        <ShopByCategorySection onNavigateToProducts={onNavigateToProducts} />
        <RecentlyViewedSection />
      </div>
    </HomeProductsProvider>
  )
}
