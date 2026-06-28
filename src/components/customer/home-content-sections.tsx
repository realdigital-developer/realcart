'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Truck, RotateCcw, ShieldCheck, Headphones, Star, Clock, Zap } from 'lucide-react'
import { Product } from './types'
import { ProductCard } from './product-card'

/* ------------------------------------------------------------------ */
/*  Home Content Sections                                               */
/*  Matches the reference design:                                       */
/*  1. Why Shop With Us (4 benefit cards, 2x2 grid)                    */
/*  2. Flash Deals (green banner + product cards)                      */
/*  3. New Arrivals (product cards, horizontal scroll)                  */
/*  4. Featured Products (product cards, 2-col grid)                    */
/*  5. Most Loved (product cards, 2-col grid)                           */
/*  6. Trending Now (product cards, 2-col grid)                         */
/*  7. Top Vendors (vendor cards)                                       */
/*  8. What Customers Say (review cards)                                */
/*  All product sections use the existing reusable ProductCard.         */
/*  Multi-device responsive throughout.                                  */
/* ------------------------------------------------------------------ */

interface HomeContentSectionsProps {
  onNavigateToProducts?: (params?: { sort?: string; category?: string }) => void
}

// Benefit cards data
const BENEFITS = [
  { icon: Truck, title: 'Free Shipping', description: 'Free delivery on orders above ₹499' },
  { icon: RotateCcw, title: 'Easy Returns', description: '7-day return policy' },
  { icon: ShieldCheck, title: 'Secure Pay', description: '100% safe payments' },
  { icon: Headphones, title: '24/7 Support', description: 'Always here to help' },
]

// Vendor interface (fetched from database)
interface Vendor {
  id: string
  name: string
  sellerName: string
  category: string
  rating: number
  totalRatings: number
  followers: number
  productCount: number
  totalSold: number
  image: string
  isVerified: boolean
}

// Mock reviews
const REVIEWS = [
  { name: 'Priya M.', product: 'Knitted Sweater', rating: 5, text: 'Absolutely love the quality! Fits perfectly and the delivery was super fast.' },
  { name: 'Rahul K.', product: 'Palazzo Set', rating: 5, text: 'Great product at an amazing price. The fabric is so comfortable!' },
  { name: 'Sneha R.', product: 'Floral Kurti', rating: 4, text: 'Beautiful design and good quality. Would definitely recommend to friends.' },
]

// Flash deals countdown
function FlashDealsTimer() {
  const [time, setTime] = useState({ h: 2, m: 45, s: 30 })
  useEffect(() => {
    const id = setInterval(() => {
      setTime(prev => {
        let { h, m, s } = prev
        s--
        if (s < 0) { s = 59; m-- }
        if (m < 0) { m = 59; h-- }
        if (h < 0) { h = 2; m = 45; s = 30 }
        return { h, m, s }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    <div className="flex items-center gap-2 flash-deals-timer" style={{ fontFamily: 'Inter, sans-serif' }}>
      <span style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 700, color: '#ffffff' }}>
        {pad(time.h)} : {pad(time.m)} : {pad(time.s)}
      </span>
    </div>
  )
}

// Section header component
function SectionHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '16px 0px 4px' }}>
      <span style={{ fontSize: 'clamp(15px, 4vw, 17px)', fontWeight: 700, color: '#111111', fontFamily: 'Inter, sans-serif' }}>
        {title}
      </span>
      {onViewAll && (
        <button onClick={onViewAll} className="flex items-center gap-1 transition-opacity hover:opacity-70" style={{ fontSize: 'clamp(11px, 3vw, 13px)', fontWeight: 500, color: '#2e8b57', fontFamily: 'Inter, sans-serif' }}>
          See All <ChevronRight style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  )
}

export function HomeContentSections({ onNavigateToProducts }: HomeContentSectionsProps = {}) {
  const router = useRouter()
  const [flashDeals, setFlashDeals] = useState<Product[]>([])
  const [newArrivals, setNewArrivals] = useState<Product[]>([])
  const [featured, setFeatured] = useState<Product[]>([])
  const [mostLoved, setMostLoved] = useState<Product[]>([])
  const [trending, setTrending] = useState<Product[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchAll() {
      try {
        const [deals, newest, rated, discount, popular, vendorsRes] = await Promise.allSettled([
          fetch('/api/products?sort=discount&limit=4&filters=false').then(r => r.ok ? r.json() : { products: [] }),
          fetch('/api/products?sort=newest&limit=8&filters=false').then(r => r.ok ? r.json() : { products: [] }),
          fetch('/api/products?sort=rating&limit=4&filters=false').then(r => r.ok ? r.json() : { products: [] }),
          fetch('/api/products?sort=discount&limit=4&filters=false').then(r => r.ok ? r.json() : { products: [] }),
          fetch('/api/products?sort=popularity&limit=8&filters=false').then(r => r.ok ? r.json() : { products: [] }),
          fetch('/api/customer/top-vendors').then(r => r.ok ? r.json() : { vendors: [] }),
        ])
        if (cancelled) return
        const get = (r: PromiseSettledResult<{ products: Product[] }>) => r.status === 'fulfilled' ? r.value.products || [] : []
        const getVendors = (r: PromiseSettledResult<{ vendors: Vendor[] }>) => r.status === 'fulfilled' ? r.value.vendors || [] : []
        setFlashDeals(get(deals))
        setNewArrivals(get(newest))
        setFeatured(get(rated))
        setMostLoved(get(discount))
        setTrending(get(popular))
        setVendors(getVendors(vendorsRes))
      } catch { /* non-fatal */ }
      finally { if (!cancelled) setLoading(false) }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [])

  const navigate = (product: Product) => {
    router.push(`/customer/product/${product._id}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const viewAll = (sort?: string) => {
    if (onNavigateToProducts) {
      onNavigateToProducts({ sort })
    } else {
      router.push('/customer?tab=products')
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ backgroundColor: '#f7f6f4', minHeight: 400, fontFamily: 'Inter, sans-serif' }}>
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="grid grid-cols-2 gap-3 mb-6">
              {[1, 2].map(j => (
                <div key={j} className="animate-pulse" style={{ backgroundColor: '#f0eeec', borderRadius: 20, aspectRatio: '1 / 1.3' }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: '#f7f6f4', fontFamily: 'Inter, sans-serif', paddingBottom: 32 }}>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6" style={{ paddingTop: 20 }}>

        {/* ════════ 1. FLASH DEALS BANNER ════════ */}
        {flashDeals.length > 0 && (
          <>
          {/* Modern gradient wrapper around the entire Flash Deals section */}
          <div
            className="flash-deals-bg"
            style={{
              marginTop: 24,
              marginBottom: 0,
              borderRadius: 24,
              padding: '20px 16px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Local style block — scoped, only injects once per render */}
            <style>{`
              .flash-deals-bg {
                background:
                  radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%),
                  radial-gradient(100% 80% at 100% 100%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 50%),
                  linear-gradient(135deg, #1f6f43 0%, #2e8b57 45%, #34a86a 100%);
                box-shadow: 0 8px 24px -8px rgba(46,139,87,0.35);
              }
              /* Subtle dotted texture overlay */
              .flash-deals-bg::before {
                content: "";
                position: absolute;
                inset: 0;
                background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
                background-size: 18px 18px;
                pointer-events: none;
                z-index: 0;
              }
              .flash-deals-bg > * { position: relative; z-index: 1; }

              /* ═══ Mobile-only compactness for Flash Deals ═══ */
              /* Targets screens narrower than Tailwind's "sm" breakpoint (640px). */
              /* Desktop layout is fully untouched. */
              @media (max-width: 639px) {
                /* Tighter wrapper padding + smaller corner radius */
                .flash-deals-bg {
                  padding: 12px 10px !important;
                  border-radius: 16px !important;
                  margin-top: 16px !important;
                }
                /* Tighter eyebrow label */
                .flash-deals-eyebrow {
                  margin-bottom: 6px !important;
                }
                .flash-deals-eyebrow span {
                  font-size: 10px !important;
                  letter-spacing: 1px !important;
                }
                /* Compact frosted banner */
                .flash-deals-banner {
                  padding: 8px 10px !important;
                  border-radius: 10px !important;
                  gap: 6px !important;
                }
                /* Smaller banner titles */
                .flash-deals-banner .fd-title {
                  font-size: 14px !important;
                  line-height: 1.15 !important;
                }
                /* Hide subtitle on mobile to save vertical space */
                .flash-deals-banner .fd-subtitle {
                  display: none !important;
                }
                /* Smaller Shop Now button */
                .flash-deals-banner .fd-btn {
                  padding: 5px 9px !important;
                  font-size: 10px !important;
                  border-radius: 999px !important;
                }
                .flash-deals-banner .fd-btn svg {
                  width: 10px !important;
                  height: 10px !important;
                }
                /* Tighter right-side cluster (timer + button) */
                .flash-deals-banner .fd-actions {
                  gap: 6px !important;
                }
                /* Compact countdown timer digits on mobile */
                .flash-deals-timer {
                  font-size: 16px !important;
                  letter-spacing: 0.3px !important;
                }
                /* Tighter horizontal scroll row: smaller gap, less bottom padding */
                .flash-deals-row {
                  gap: 8px !important;
                  margin-top: 8px !important;
                  padding-bottom: 4px !important;
                }
                /* Shrink the compact product cards on mobile only.
                   The shared ProductCard uses inline width:180px, so we override
                   via CSS. min-width keeps card readable; max-width clamps it. */
                .flash-deals-row > * {
                  width: 140px !important;
                  min-width: 140px !important;
                  max-width: 140px !important;
                }
                /* Scale down text inside the card on mobile for a tighter look */
                .flash-deals-row > * .fd-card-name,
                .flash-deals-row > * .fd-card-price,
                .flash-deals-row > * .fd-card-mrp,
                .flash-deals-row > * .fd-card-disc,
                .flash-deals-row > * .fd-card-rating {
                  font-size: 11px !important;
                }
                .flash-deals-row > * .fd-card-price {
                  font-size: 15px !important;
                }
                .flash-deals-row > * .fd-card-mrp {
                  font-size: 10px !important;
                }
              }
            `}</style>

            {/* Section title above the banner removed (was: "Today's") */}

            {/* Compact banner for mobile, full for desktop */}
            <div className="flash-deals-banner flex items-center justify-between" style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: '10px 14px', backdropFilter: 'blur(6px)' }}>
              <div className="min-w-0">
                <div className="fd-title" style={{ fontSize: 'clamp(13px, 3.5vw, 18px)', fontWeight: 700, color: '#ffffff' }}>Flash Deals</div>
                <div className="fd-subtitle" style={{ fontSize: 'clamp(9px, 2.5vw, 12px)', color: '#ffffffcc', marginTop: 1 }}>Hurry up! Limited stock left</div>
              </div>
              <div className="fd-actions flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <FlashDealsTimer />
                <button onClick={() => viewAll('discount')} className="fd-btn flex items-center gap-1 transition-opacity hover:opacity-80" style={{ backgroundColor: 'transparent', color: '#ffffff', fontSize: 'clamp(10px, 2.5vw, 12px)', fontWeight: 600, borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap' }}>
                  Shop Now <ChevronRight style={{ width: 12, height: 12 }} />
                </button>
              </div>
            </div>

            {/* Flash Deals Products — horizontal scroll on all devices */}
            <div className="flash-deals-row flex gap-3 overflow-x-auto mt-3 pb-2" style={{ scrollbarWidth: 'none' }}>
              {flashDeals.map((p, i) => <ProductCard key={p._id || `fd-${i}`} product={p} size="compact" onClick={() => navigate(p)} />)}
            </div>
          </div>
          </>
        )}

        {/* ════════ 3. NEW ARRIVALS ════════ */}
        {newArrivals.length > 0 && (
          <div
            className="new-arrivals-bg"
            style={{
              marginTop: 24,
              marginBottom: 0,
              borderRadius: 24,
              padding: '20px 16px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Local style block — scoped, only injects when New Arrivals renders */}
            <style>{`
              .new-arrivals-bg {
                background:
                  radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%),
                  radial-gradient(100% 80% at 0% 100%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 50%),
                  linear-gradient(135deg, #4338ca 0%, #7c3aed 45%, #a855f7 100%);
                box-shadow: 0 8px 24px -8px rgba(124,58,237,0.35);
              }
              /* Subtle dotted texture overlay — same pattern as Flash Deals for visual cohesion */
              .new-arrivals-bg::before {
                content: "";
                position: absolute;
                inset: 0;
                background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
                background-size: 18px 18px;
                pointer-events: none;
                z-index: 0;
              }
              .new-arrivals-bg > * { position: relative; z-index: 1; }

              /* ═══ Mobile-only compactness for New Arrivals ═══ */
              /* Mirrors the Flash Deals mobile pattern for visual consistency. */
              /* Desktop layout (>=640px) is fully untouched. */
              @media (max-width: 639px) {
                .new-arrivals-bg {
                  padding: 12px 10px !important;
                  border-radius: 16px !important;
                  margin-top: 16px !important;
                }
                .new-arrivals-bg .na-eyebrow {
                  font-size: 10px !important;
                  letter-spacing: 1px !important;
                  margin-bottom: 4px !important;
                }
                .new-arrivals-bg .na-header {
                  padding: 4px 0 2px !important;
                }
                .new-arrivals-bg .na-title {
                  font-size: 14px !important;
                  line-height: 1.15 !important;
                }
                .new-arrivals-bg .na-viewall {
                  padding: 5px 9px !important;
                  font-size: 10px !important;
                  border-radius: 999px !important;
                }
                .new-arrivals-bg .na-viewall svg {
                  width: 10px !important;
                  height: 10px !important;
                }
                /* Tighter mobile grid */
                .new-arrivals-bg .na-mobile-grid {
                  gap: 8px !important;
                  margin-top: 8px !important;
                }
                /* Tighter desktop-row (hidden on mobile, but rules ready for >=640px) */
                .new-arrivals-bg .na-desktop-row {
                  gap: 8px !important;
                  margin-top: 8px !important;
                  padding-bottom: 4px !important;
                }
              }
            `}</style>

            {/* Eyebrow label removed (was: "Just Landed") */}

            {/* Custom header (white title + transparent See All button with white text) */}
            <div className="na-header flex items-center justify-between" style={{ padding: '14px 0px 4px' }}>
              <span className="na-title" style={{ fontSize: 'clamp(15px, 4vw, 17px)', fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' }}>
                New Arrivals
              </span>
              <button
                onClick={() => viewAll('newest')}
                className="na-viewall flex items-center gap-1 transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  fontSize: 'clamp(10px, 2.5vw, 12px)',
                  fontWeight: 600,
                  borderRadius: 999,
                  padding: '6px 12px',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                See All <ChevronRight style={{ width: 12, height: 12 }} />
              </button>
            </div>

            {/* Mobile: 2-column grid (sm:hidden) */}
            <div className="na-mobile-grid grid grid-cols-2 gap-3 mt-3 sm:hidden">
              {newArrivals.slice(0, 4).map((p, i) => <ProductCard key={p._id || `na-m-${i}`} product={p} size="full" onClick={() => navigate(p)} />)}
            </div>

            {/* Desktop: horizontal scroll (hidden sm:flex) */}
            <div className="na-desktop-row hidden sm:flex gap-3 overflow-x-auto mt-3 pb-2" style={{ scrollbarWidth: 'none' }}>
              {newArrivals.map((p, i) => <ProductCard key={p._id || `na-${i}`} product={p} size="compact" onClick={() => navigate(p)} />)}
            </div>
          </div>
        )}

        {/* ════════ 4. FEATURED PRODUCTS ════════ */}
        {featured.length > 0 && (
          <div
            className="featured-bg"
            style={{
              marginTop: 24,
              marginBottom: 0,
              borderRadius: 24,
              padding: '20px 16px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <style>{`
              .featured-bg {
                background:
                  radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%),
                  radial-gradient(100% 80% at 100% 100%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 50%),
                  linear-gradient(135deg, #ea580c 0%, #f59e0b 45%, #fbbf24 100%);
                box-shadow: 0 8px 24px -8px rgba(245,158,11,0.35);
              }
              .featured-bg::before {
                content: "";
                position: absolute;
                inset: 0;
                background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
                background-size: 18px 18px;
                pointer-events: none;
                z-index: 0;
              }
              .featured-bg > * { position: relative; z-index: 1; }
              @media (max-width: 639px) {
                .featured-bg {
                  padding: 12px 10px !important;
                  border-radius: 16px !important;
                  margin-top: 16px !important;
                }
                .featured-bg .sec-eyebrow {
                  font-size: 10px !important;
                  letter-spacing: 1px !important;
                  margin-bottom: 4px !important;
                }
                .featured-bg .sec-header { padding: 4px 0px 2px !important; }
                .featured-bg .sec-title {
                  font-size: 14px !important;
                  line-height: 1.15 !important;
                }
                .featured-bg .sec-viewall {
                  padding: 5px 9px !important;
                  font-size: 10px !important;
                  border-radius: 999px !important;
                }
                .featured-bg .sec-viewall svg {
                  width: 10px !important;
                  height: 10px !important;
                }
                .featured-bg .sec-grid {
                  gap: 8px !important;
                  margin-top: 8px !important;
                }
              }
            `}</style>

            {/* Eyebrow label removed (was: "Editor's Pick") */}
            <div className="sec-header flex items-center justify-between" style={{ padding: '14px 0px 4px' }}>
              <span className="sec-title" style={{ fontSize: 'clamp(15px, 4vw, 17px)', fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' }}>
                Featured Products
              </span>
              <button
                onClick={() => viewAll('rating')}
                className="sec-viewall flex items-center gap-1 transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  fontSize: 'clamp(10px, 2.5vw, 12px)',
                  fontWeight: 600,
                  borderRadius: 999,
                  padding: '6px 12px',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                See All <ChevronRight style={{ width: 12, height: 12 }} />
              </button>
            </div>
            <div className="sec-grid grid grid-cols-2 gap-3 mt-3 sm:grid-cols-3 lg:grid-cols-4">
              {featured.map((p, i) => <ProductCard key={p._id || `fp-${i}`} product={p} size="full" onClick={() => navigate(p)} />)}
            </div>
          </div>
        )}

        {/* ════════ 5. MOST LOVED ════════ */}
        {mostLoved.length > 0 && (
          <div
            className="most-loved-bg"
            style={{
              marginTop: 24,
              marginBottom: 0,
              borderRadius: 24,
              padding: '20px 16px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <style>{`
              .most-loved-bg {
                background:
                  radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%),
                  radial-gradient(100% 80% at 0% 100%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 50%),
                  linear-gradient(135deg, #be185d 0%, #ec4899 45%, #f472b6 100%);
                box-shadow: 0 8px 24px -8px rgba(236,72,153,0.35);
              }
              .most-loved-bg::before {
                content: "";
                position: absolute;
                inset: 0;
                background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
                background-size: 18px 18px;
                pointer-events: none;
                z-index: 0;
              }
              .most-loved-bg > * { position: relative; z-index: 1; }
              @media (max-width: 639px) {
                .most-loved-bg {
                  padding: 12px 10px !important;
                  border-radius: 16px !important;
                  margin-top: 16px !important;
                }
                .most-loved-bg .sec-eyebrow {
                  font-size: 10px !important;
                  letter-spacing: 1px !important;
                  margin-bottom: 4px !important;
                }
                .most-loved-bg .sec-header { padding: 4px 0px 2px !important; }
                .most-loved-bg .sec-title {
                  font-size: 14px !important;
                  line-height: 1.15 !important;
                }
                .most-loved-bg .sec-viewall {
                  padding: 5px 9px !important;
                  font-size: 10px !important;
                  border-radius: 999px !important;
                }
                .most-loved-bg .sec-viewall svg {
                  width: 10px !important;
                  height: 10px !important;
                }
                .most-loved-bg .sec-grid {
                  gap: 8px !important;
                  margin-top: 8px !important;
                }
              }
            `}</style>

            {/* Eyebrow label removed (was: "Customer Favorites") */}
            <div className="sec-header flex items-center justify-between" style={{ padding: '14px 0px 4px' }}>
              <span className="sec-title" style={{ fontSize: 'clamp(15px, 4vw, 17px)', fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' }}>
                Most Loved
              </span>
              <button
                onClick={() => viewAll('discount')}
                className="sec-viewall flex items-center gap-1 transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  fontSize: 'clamp(10px, 2.5vw, 12px)',
                  fontWeight: 600,
                  borderRadius: 999,
                  padding: '6px 12px',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                See All <ChevronRight style={{ width: 12, height: 12 }} />
              </button>
            </div>
            <div className="sec-grid grid grid-cols-2 gap-3 mt-3 sm:grid-cols-3 lg:grid-cols-4">
              {mostLoved.map((p, i) => <ProductCard key={p._id || `ml-${i}`} product={p} size="full" onClick={() => navigate(p)} />)}
            </div>
          </div>
        )}

        {/* ════════ 6. TRENDING NOW ════════ */}
        {trending.length > 0 && (
          <div
            className="trending-bg"
            style={{
              marginTop: 24,
              marginBottom: 0,
              borderRadius: 24,
              padding: '20px 16px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <style>{`
              .trending-bg {
                background:
                  radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%),
                  radial-gradient(100% 80% at 100% 100%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 50%),
                  linear-gradient(135deg, #0e7490 0%, #0891b2 45%, #06b6d4 100%);
                box-shadow: 0 8px 24px -8px rgba(8,145,178,0.35);
              }
              .trending-bg::before {
                content: "";
                position: absolute;
                inset: 0;
                background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
                background-size: 18px 18px;
                pointer-events: none;
                z-index: 0;
              }
              .trending-bg > * { position: relative; z-index: 1; }
              @media (max-width: 639px) {
                .trending-bg {
                  padding: 12px 10px !important;
                  border-radius: 16px !important;
                  margin-top: 16px !important;
                }
                .trending-bg .sec-eyebrow {
                  font-size: 10px !important;
                  letter-spacing: 1px !important;
                  margin-bottom: 4px !important;
                }
                .trending-bg .sec-header { padding: 4px 0px 2px !important; }
                .trending-bg .sec-title {
                  font-size: 14px !important;
                  line-height: 1.15 !important;
                }
                .trending-bg .sec-viewall {
                  padding: 5px 9px !important;
                  font-size: 10px !important;
                  border-radius: 999px !important;
                }
                .trending-bg .sec-viewall svg {
                  width: 10px !important;
                  height: 10px !important;
                }
                .trending-bg .sec-row {
                  gap: 8px !important;
                  margin-top: 8px !important;
                  padding-bottom: 4px !important;
                }
              }
            `}</style>

            {/* Eyebrow label removed (was: "Hot Right Now") */}
            <div className="sec-header flex items-center justify-between" style={{ padding: '14px 0px 4px' }}>
              <span className="sec-title" style={{ fontSize: 'clamp(15px, 4vw, 17px)', fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' }}>
                Trending Now
              </span>
              <button
                onClick={() => viewAll('popularity')}
                className="sec-viewall flex items-center gap-1 transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  fontSize: 'clamp(10px, 2.5vw, 12px)',
                  fontWeight: 600,
                  borderRadius: 999,
                  padding: '6px 12px',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                See All <ChevronRight style={{ width: 12, height: 12 }} />
              </button>
            </div>
            <div className="sec-row flex gap-3 overflow-x-auto mt-3 pb-2" style={{ scrollbarWidth: 'none' }}>
              {trending.map((p, i) => <ProductCard key={p._id || `tn-${i}`} product={p} size="compact" onClick={() => navigate(p)} />)}
            </div>
          </div>
        )}

        {/* ════════ 7. WHY SHOP WITH US (soft light gradient background, compact cards) ════════ */}
        <div
          className="why-shop-bg"
          style={{
            marginTop: 24,
            borderRadius: 16,
            padding: '16px 12px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <style>{`
            .why-shop-bg {
              background:
                radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 45%),
                radial-gradient(100% 80% at 100% 100%, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0) 50%),
                linear-gradient(135deg, #fff7ed 0%, #fdf2f8 40%, #f5f3ff 100%);
              box-shadow: 0 8px 24px -10px rgba(139,92,246,0.18);
            }
            .why-shop-bg::before {
              content: "";
              position: absolute;
              inset: 0;
              background-image: radial-gradient(rgba(139,92,246,0.06) 1px, transparent 1px);
              background-size: 18px 18px;
              pointer-events: none;
              z-index: 0;
            }
            .why-shop-bg > * { position: relative; z-index: 1; }
            /* Modern glassmorphism cards on the soft gradient */
            .why-shop-bg .wsu-card {
              background-color: rgba(255, 255, 255, 0.72);
              backdrop-filter: blur(8px);
              -webkit-backdrop-filter: blur(8px);
              border: 1px solid rgba(255, 255, 255, 0.65);
              box-shadow: 0 2px 8px -2px rgba(139,92,246,0.10);
            }
            @media (min-width: 640px) { .wsu-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; } }
            @media (max-width: 639px) {
              .why-shop-bg {
                padding: 12px 10px !important;
                border-radius: 16px !important;
                margin-top: 16px !important;
              }
              .why-shop-bg .wsu-grid { gap: 8px !important; margin-top: 0 !important; }
            }
          `}</style>
          {/* Mobile: 2x2 compact grid / Desktop: 4x1 row */}
          <div className="wsu-grid grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {BENEFITS.map((b, i) => {
              const Icon = b.icon
              return (
                <div key={i} className="wsu-card flex items-center gap-2.5" style={{ borderRadius: 14, padding: '10px 12px' }}>
                  {/* Compact icon circle */}
                  <div className="flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#ffffff' }}>
                    <Icon style={{ width: 16, height: 16, color: '#2e8b57' }} />
                  </div>
                  {/* Title + description stacked, compact */}
                  <div className="flex flex-col min-w-0">
                    <span style={{ fontSize: 'clamp(10px, 2.5vw, 13px)', fontWeight: 600, color: '#111111', lineHeight: 1.2 }}>{b.title}</span>
                    <span style={{ fontSize: 'clamp(8px, 2vw, 11px)', fontWeight: 400, color: '#949494', lineHeight: 1.3, marginTop: 1 }}>{b.description}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ════════ 8. TOP VENDORS (header + cards inside one gradient background, like Trending Now) ════════ */}
        {vendors.length > 0 && (
          <div
            className="top-vendors-bg"
            style={{
              marginTop: 24,
              borderRadius: 16,
              padding: '16px 12px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <style>{`
              .top-vendors-bg {
                background:
                  radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%),
                  radial-gradient(100% 80% at 100% 100%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 50%),
                  linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
                box-shadow: 0 8px 24px -8px rgba(118,75,162,0.35);
              }
              .top-vendors-bg::before {
                content: "";
                position: absolute;
                inset: 0;
                background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
                background-size: 18px 18px;
                pointer-events: none;
                z-index: 0;
              }
              .top-vendors-bg > * { position: relative; z-index: 1; }
              .top-vendors-bg .sec-row::-webkit-scrollbar { display: none; }
              .top-vendors-bg .sec-row { -ms-overflow-style: none; scrollbar-width: none; }
              @media (max-width: 639px) {
                .top-vendors-bg {
                  padding: 12px 10px !important;
                  border-radius: 16px !important;
                  margin-top: 16px !important;
                }
                .top-vendors-bg .sec-header { padding: 2px 0px 2px !important; }
                .top-vendors-bg .sec-title {
                  font-size: 14px !important;
                  line-height: 1.15 !important;
                }
                .top-vendors-bg .sec-viewall {
                  padding: 5px 9px !important;
                  font-size: 10px !important;
                  border-radius: 999px !important;
                }
                .top-vendors-bg .sec-viewall svg {
                  width: 10px !important;
                  height: 10px !important;
                }
                .top-vendors-bg .sec-row {
                  gap: 8px !important;
                  margin-top: 8px !important;
                  padding-bottom: 4px !important;
                }
              }
            `}</style>

            {/* Header INSIDE gradient — white text (matches Trending Now pattern) */}
            <div className="sec-header flex items-center justify-between" style={{ padding: '4px 4px 8px' }}>
              <span className="sec-title" style={{ fontSize: 'clamp(15px, 4vw, 17px)', fontWeight: 700, color: '#ffffff', fontFamily: 'Inter, sans-serif' }}>
                Top Vendors
              </span>
              <button
                onClick={() => router.push('/customer?tab=categories')}
                className="sec-viewall flex items-center gap-1 transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  fontSize: 'clamp(10px, 2.5vw, 12px)',
                  fontWeight: 600,
                  borderRadius: 999,
                  padding: '6px 12px',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                See All <ChevronRight style={{ width: 12, height: 12 }} />
              </button>
            </div>

            {/* Cards row INSIDE gradient */}
            <div className="sec-row flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {vendors.map((v, i) => (
                <div
                  key={v.id || i}
                  onClick={() => router.push(`/customer/seller?storeName=${encodeURIComponent(v.name)}`)}
                  className="flex-shrink-0 cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.98]"
                  style={{
                    width: 160,
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                >
                  {/* Store image / avatar */}
                  <div style={{ height: 100, overflow: 'hidden', position: 'relative' }}>
                    {v.image ? (
                      <img src={v.image} alt={v.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                        <span className="text-3xl font-bold text-white">{v.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  {/* Store info */}
                  <div style={{ padding: '10px 10px 12px' }}>
                    <div className="flex items-center gap-1">
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{v.name}</span>
                      {v.isVerified && (
                        <svg className="flex-shrink-0" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#10b981">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{v.productCount} products</div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Star style={{ width: 12, height: 12, fill: '#f0a500', color: '#f0a500' }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#333' }}>{v.rating > 0 ? v.rating.toFixed(1) : 'New'}</span>
                      <span style={{ fontSize: 10, color: '#aaa' }}>•</span>
                      <span style={{ fontSize: 10, color: '#888' }}>{v.followers > 0 ? `${v.followers}+` : 'Follow'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
