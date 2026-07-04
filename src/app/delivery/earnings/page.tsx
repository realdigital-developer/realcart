'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  IndianRupee,
  TrendingUp,
  Calendar,
  Package,
  Wallet,
  Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface MonthlyEarning {
  month: string
  year: number
  monthNumber: number
  earnings: number
  deliveries: number
}

interface OrderBreakdown {
  _id: string
  orderNumber: string
  customerName: string
  deliveredAt: string | null
  deliveryFee: number
  totalAmount: number
  paymentMethod: string
  items: { name: string; imageUrl: string }[]
}

interface EarningsData {
  todayEarnings: number
  todayDeliveries: number
  weekEarnings: number
  weekDeliveries: number
  monthEarnings: number
  monthDeliveries: number
  totalEarnings: number
  totalDeliveries: number
  monthlyBreakdown: MonthlyEarning[]
  orderBreakdown: OrderBreakdown[]
  totalPages: number
}

/* ------------------------------------------------------------------ */
/*  Earnings Cache — stale-while-revalidate strategy                    */
/*                                                                     */
/*  Uses in-memory + sessionStorage cache so the earnings page renders  */
/*  INSTANTLY on every visit (no loading spinner). Fresh data is        */
/*  fetched silently in the background and updates the UI seamlessly.   */
/* ------------------------------------------------------------------ */

const CACHE_KEY = 'delivery_earnings_v1'

interface CachedData extends EarningsData {
  cachedAt: number
}

// Module-level in-memory cache (survives React remounts within same page lifecycle)
let memoryCache: CachedData | null = null

function readCache(): CachedData | null {
  // 1. In-memory cache (fastest — survives component remounts)
  if (memoryCache) return memoryCache

  // 2. Session storage (survives page navigations within same tab session)
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as CachedData
        // Only use cache if less than 10 minutes old
        if (Date.now() - parsed.cachedAt < 10 * 60 * 1000) {
          memoryCache = parsed
          return parsed
        }
        // Expired — remove
        sessionStorage.removeItem(CACHE_KEY)
      }
    } catch {
      // Ignore parse/storage errors
    }
  }
  return null
}

function writeCache(data: EarningsData) {
  const cached: CachedData = { ...data, cachedAt: Date.now() }
  memoryCache = cached
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    } catch {
      // Ignore quota errors
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Polling Configuration                                               */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL_VISIBLE = 30_000  // 30s when tab is visible
const POLL_INTERVAL_HIDDEN  = 120_000 // 2min when tab is hidden

/* ------------------------------------------------------------------ */
/*  Default empty data (for first-ever visit before data loads)         */
/* ------------------------------------------------------------------ */

const EMPTY_DATA: EarningsData = {
  todayEarnings: 0,
  todayDeliveries: 0,
  weekEarnings: 0,
  weekDeliveries: 0,
  monthEarnings: 0,
  monthDeliveries: 0,
  totalEarnings: 0,
  totalDeliveries: 0,
  monthlyBreakdown: [],
  orderBreakdown: [],
  totalPages: 1,
}

/* ------------------------------------------------------------------ */
/*  Monthly Earnings Chart (compact CSS bar chart)                      */
/* ------------------------------------------------------------------ */

function MonthlyChart({ data }: { data: MonthlyEarning[] }) {
  const maxEarnings = Math.max(...data.map(d => d.earnings), 1)

  return (
    <div className="flex items-end gap-0.5 h-20 overflow-x-auto scrollbar-none">
      {data.map((d, i) => {
        const height = Math.max((d.earnings / maxEarnings) * 100, 2)
        return (
          <div key={`${d.year}-${d.monthNumber}`} className="flex-1 min-w-[18px] flex flex-col items-center gap-0.5">
            {d.earnings > 0 && (
              <span className="text-[7px] text-muted-foreground font-medium whitespace-nowrap">
                ₹{d.earnings}
              </span>
            )}
            <div className="w-full relative" style={{ height: '52px' }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ duration: 0.4, delay: i * 0.02 }}
                className="absolute bottom-0 w-full rounded-t-sm bg-gradient-to-t from-orange-500 to-amber-400 min-h-[2px]"
              />
            </div>
            <span className="text-[7px] text-muted-foreground whitespace-nowrap">{d.month}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Earnings Page                                                       */
/* ------------------------------------------------------------------ */

export default function DeliveryEarningsPage() {
  const { handleAuthFailure } = useDeliveryBoyAuth()
  // ── Initialize state with EMPTY defaults (SSR-safe — matches server render) ──
  const [data, setData] = useState<EarningsData>(EMPTY_DATA)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // Whether we have ANY data (from cache or fetch) — used to show error state
  const hasData = data.totalDeliveries > 0 || data.orderBreakdown.length > 0

  // Use a ref for hasData to avoid it being a useCallback dependency
  // (changing hasData would recreate fetchEarnings, causing polling loops)
  const hasDataRef = useRef(hasData)
  hasDataRef.current = hasData

  // Refs for polling management
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFetchingRef = useRef(false)
  const mountedRef = useRef(false)

  /* ---------------------------------------------------------------- */
  /*  Fetch earnings — always silent (no loading spinner)              */
  /* ---------------------------------------------------------------- */

  const fetchEarnings = useCallback(async (overridePage?: number) => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      const fetchPage = overridePage ?? page

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(`/api/delivery-boy/earnings?page=${fetchPage}`, {
        signal: controller.signal,
        credentials: 'include',
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        const result = await res.json().catch(() => ({}))
        const newData: EarningsData = {
          todayEarnings: result.todayEarnings,
          todayDeliveries: result.todayDeliveries,
          weekEarnings: result.weekEarnings,
          weekDeliveries: result.weekDeliveries,
          monthEarnings: result.monthEarnings,
          monthDeliveries: result.monthDeliveries,
          totalEarnings: result.totalEarnings,
          totalDeliveries: result.totalDeliveries,
          monthlyBreakdown: result.monthlyBreakdown || [],
          orderBreakdown: result.orderBreakdown || [],
          totalPages: result.pagination?.totalPages || 1,
        }
        setData(newData)
        setError(null)

        // Persist to cache for instant future visits (only cache page 1)
        if (fetchPage === 1) {
          writeCache(newData)
        }
      } else if (res.status === 401) {
        // Ask auth provider to verify the session — may be transient
        const authResult = await handleAuthFailure()
        if (authResult === 'session_valid') {
          // The 401 was transient — retry the request immediately
          isFetchingRef.current = false
          fetchEarnings(fetchPage)
          return
        } else if (authResult === 'session_expired') {
          if (!hasDataRef.current) {
            setError('Session expired. Redirecting to login...')
          }
        } else {
          // network_error — show retry message, not "session expired"
          if (!hasDataRef.current) {
            setError('Connection issue. Retrying...')
          }
        }
      } else if (!hasDataRef.current) {
        setError('Failed to load earnings.')
      }
    } catch (err) {
      if (!hasDataRef.current) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Request timed out. Please check your connection.')
        } else {
          setError('Network error. Please try again.')
        }
      }
      // On background refresh, silently keep existing data
    } finally {
      isFetchingRef.current = false
    }
  }, [page, handleAuthFailure])

  /* ---------------------------------------------------------------- */
  /*  Hydrate from cache AFTER mount (prevents SSR mismatch)           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setData(cached)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Initial fetch on mount                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    mountedRef.current = true
    fetchEarnings()
    return () => {
      mountedRef.current = false
    }
  }, [fetchEarnings])

  /* ---------------------------------------------------------------- */
  /*  Re-fetch when page changes                                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (mountedRef.current && page > 1) {
      fetchEarnings(page)
    }
  }, [page, fetchEarnings])

  /* ---------------------------------------------------------------- */
  /*  Real-time polling with visibility-aware pause/resume             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const startPolling = (intervalMs: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        if (mountedRef.current) fetchEarnings()
      }, intervalMs)
    }

    startPolling(POLL_INTERVAL_VISIBLE)

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible — immediately refresh + resume fast polling
        fetchEarnings()
        startPolling(POLL_INTERVAL_VISIBLE)
      } else {
        // Tab hidden — switch to slow polling
        startPolling(POLL_INTERVAL_HIDDEN)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchEarnings])

  /* ---------------------------------------------------------------- */
  /*  Error (only when no cached data exists at all)                   */
  /* ---------------------------------------------------------------- */

  if (error && !hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-destructive/10 text-destructive">
          <Wallet className="h-7 w-7" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">Auto-retrying in background...</p>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Derived data                                                     */
  /* ---------------------------------------------------------------- */

  const avgPerDelivery = data.totalDeliveries > 0
    ? Math.round((data.totalEarnings / data.totalDeliveries) * 100) / 100
    : 0

  /* ---------------------------------------------------------------- */
  /*  Render — ALWAYS instant, never a loading spinner                 */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-3 max-w-5xl mx-auto">
      {/* ── Hero Earnings Card (compact) ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Card className="bg-gradient-to-br from-orange-500 to-amber-600 border-0 text-white overflow-hidden">
          <CardContent className="p-4 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
            <div className="relative">
              <p className="text-[10px] text-white/70 font-medium uppercase tracking-wider">Total Earnings</p>
              <p className="text-2xl font-extrabold mt-0.5">{formatCurrency(data.totalEarnings, 0)}</p>
              <p className="text-[10px] text-white/60 mt-0.5">{data.totalDeliveries} deliveries</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-white/20">
              <div>
                <p className="text-[9px] text-white/60 uppercase tracking-wider">Today</p>
                <p className="text-sm font-bold">{formatCurrency(data.todayEarnings, 0)}</p>
                <p className="text-[8px] text-white/50">{data.todayDeliveries} deliveries</p>
              </div>
              <div>
                <p className="text-[9px] text-white/60 uppercase tracking-wider">This Week</p>
                <p className="text-sm font-bold">{formatCurrency(data.weekEarnings, 0)}</p>
                <p className="text-[8px] text-white/50">{data.weekDeliveries} deliveries</p>
              </div>
              <div>
                <p className="text-[9px] text-white/60 uppercase tracking-wider">This Month</p>
                <p className="text-sm font-bold">{formatCurrency(data.monthEarnings, 0)}</p>
                <p className="text-[8px] text-white/50">{data.monthDeliveries} deliveries</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Quick Stats (2×2 compact grid) ── */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Today", value: formatCurrency(data.todayEarnings, 0), sub: `${data.todayDeliveries} deliveries`, icon: IndianRupee, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
          { label: "This Week", value: formatCurrency(data.weekEarnings, 0), sub: `${data.weekDeliveries} deliveries`, icon: Calendar, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
          { label: "Avg / Delivery", value: data.totalDeliveries > 0 ? formatCurrency(avgPerDelivery, 0) : '—', sub: `of ${data.totalDeliveries} total`, icon: TrendingUp, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
          { label: "This Month", value: formatCurrency(data.monthEarnings, 0), sub: `${data.monthDeliveries} deliveries`, icon: Package, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          >
            <Card className="border-border/50 hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center gap-2.5">
                  <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg', stat.bg, stat.color)}>
                    <stat.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold leading-tight truncate">{stat.value}</p>
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                      <span className="text-[9px] text-muted-foreground/60">·</span>
                      <p className="text-[9px] text-muted-foreground/70 truncate">{stat.sub}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Monthly Earnings Chart ── */}
      {data.monthlyBreakdown.length > 0 && (
        <Card className="border-border/50">
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-sm font-semibold">Monthly Earnings</span>
          </div>
          <CardContent className="pt-1 pb-3">
            <MonthlyChart data={data.monthlyBreakdown} />
          </CardContent>
        </Card>
      )}

      {/* ── Delivery History ── */}
      <Card className="border-border/50">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-sm font-semibold">Delivery History</span>
          </div>
          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center gap-1">
              {page > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setPage(page - 1)} className="h-6 text-[10px] px-2">
                  ‹ Prev
                </Button>
              )}
              <span className="text-[10px] text-muted-foreground">{page}/{data.totalPages}</span>
              {page < data.totalPages && (
                <Button variant="ghost" size="sm" onClick={() => setPage(page + 1)} className="h-6 text-[10px] px-2">
                  Next ›
                </Button>
              )}
            </div>
          )}
        </div>
        <CardContent className="pt-1 pb-3">
          {data.orderBreakdown.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-muted/50 text-muted-foreground mb-2">
                <Clock className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium">No Delivery History</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Completed deliveries will appear here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {data.orderBreakdown.map((order) => (
                <div
                  key={order._id}
                  className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg hover:bg-accent/20 transition-colors"
                >
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <IndianRupee className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{order.orderNumber}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {order.customerName}
                      {order.deliveredAt && (
                        <> · {new Date(order.deliveredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">+{formatCurrency(order.deliveryFee, 0)}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {order.paymentMethod === 'cod' ? 'COD' : 'Online'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
