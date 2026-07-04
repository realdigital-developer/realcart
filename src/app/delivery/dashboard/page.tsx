'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Package,
  IndianRupee,
  Star,
  CheckCircle2,
  ArrowRight,
  Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  assignedOrders: number
  todayDeliveries: number
  pendingPickups: number
  inTransitOrders: number
  totalDelivered: number
  totalAssigned: number
  todayEarnings: number
  totalEarnings: number
  rating: number
  totalRatings: number
}

interface WeeklyEarning {
  day: string
  date: string
  earnings: number
  deliveries: number
}

/* ------------------------------------------------------------------ */
/*  Dashboard Cache — stale-while-revalidate strategy                   */
/*                                                                     */
/*  Uses in-memory + sessionStorage cache so the dashboard renders     */
/*  INSTANTLY on every visit (no loading spinner). Fresh data is       */
/*  fetched silently in the background and updates the UI seamlessly.  */
/* ------------------------------------------------------------------ */

const CACHE_KEY = 'delivery_dashboard_v2'

interface CachedData {
  stats: DashboardStats | null
  weeklyEarnings: WeeklyEarning[]
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

function writeCache(data: { stats: DashboardStats | null; weeklyEarnings: WeeklyEarning[] }) {
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
/*  Default empty stats (for first-ever visit before data loads)        */
/* ------------------------------------------------------------------ */

const EMPTY_STATS: DashboardStats = {
  assignedOrders: 0,
  todayDeliveries: 0,
  pendingPickups: 0,
  inTransitOrders: 0,
  totalDelivered: 0,
  totalAssigned: 0,
  todayEarnings: 0,
  totalEarnings: 0,
  rating: 0,
  totalRatings: 0,
}

/* ------------------------------------------------------------------ */
/*  Earnings Bar Chart (compact CSS)                                    */
/* ------------------------------------------------------------------ */

function MiniEarningsChart({ data }: { data: WeeklyEarning[] }) {
  const maxEarnings = Math.max(...data.map(d => d.earnings), 1)

  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
          {d.earnings > 0 && (
            <span className="text-[8px] text-muted-foreground font-medium">
              ₹{d.earnings}
            </span>
          )}
          <div className="w-full relative" style={{ height: '56px' }}>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max((d.earnings / maxEarnings) * 100, 2)}%` }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className="absolute bottom-0 w-full rounded-t-sm bg-gradient-to-t from-orange-500 to-amber-400 min-h-[2px]"
            />
          </div>
          <span className="text-[8px] text-muted-foreground">{d.day}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                      */
/* ------------------------------------------------------------------ */

export default function DeliveryDashboardPage() {
  const { user, handleAuthFailure } = useDeliveryBoyAuth()

  // ── Initialize state with EMPTY defaults (SSR-safe — matches server render) ──
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [weeklyEarnings, setWeeklyEarnings] = useState<WeeklyEarning[]>([])
  const [error, setError] = useState<string | null>(null)

  // Whether we have ANY data (from cache or fetch) — used to show error state
  const hasData = stats !== null

  // Use a ref for hasData to avoid it being a useCallback dependency
  // (changing hasData would recreate fetchDashboard, causing polling loops)
  const hasDataRef = useRef(hasData)
  hasDataRef.current = hasData

  // Refs for polling management
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFetchingRef = useRef(false)
  const mountedRef = useRef(false)

  /* ---------------------------------------------------------------- */
  /*  Fetch dashboard data — always silent (no loading state)          */
  /* ---------------------------------------------------------------- */

  const fetchDashboard = useCallback(async () => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const res = await fetch('/api/delivery-boy/dashboard', {
        signal: controller.signal,
        credentials: 'include',
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const newStats = data.stats
        const newWeekly = data.weeklyEarnings || []

        setStats(newStats)
        setWeeklyEarnings(newWeekly)
        setError(null)

        // Persist to cache for instant future visits
        writeCache({ stats: newStats, weeklyEarnings: newWeekly })
      } else if (res.status === 401) {
        // Ask auth provider to verify the session — may be transient
        const authResult = await handleAuthFailure()
        if (authResult === 'session_valid') {
          // The 401 was transient — retry the request immediately
          isFetchingRef.current = false
          fetchDashboard()
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
        // Only set error if we have no data at all
        setError('Failed to load dashboard data.')
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
  }, [handleAuthFailure])

  /* ---------------------------------------------------------------- */
  /*  Hydrate from cache AFTER mount (prevents SSR mismatch)           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setStats(cached.stats)
      setWeeklyEarnings(cached.weeklyEarnings)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Initial fetch on mount                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    mountedRef.current = true
    fetchDashboard()
    return () => {
      mountedRef.current = false
    }
  }, [fetchDashboard])

  /* ---------------------------------------------------------------- */
  /*  Real-time polling with visibility-aware pause/resume             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const startPolling = (intervalMs: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        if (mountedRef.current) fetchDashboard()
      }, intervalMs)
    }

    startPolling(POLL_INTERVAL_VISIBLE)

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible — immediately refresh + resume fast polling
        fetchDashboard()
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
  }, [fetchDashboard])

  /* ---------------------------------------------------------------- */
  /*  Error (only when no cached data exists at all)                   */
  /* ---------------------------------------------------------------- */

  if (error && !hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-destructive/10 text-destructive">
          <Package className="h-7 w-7" />
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

  const profileImage = user?.profileImage
  const firstName = (user?.name || 'Partner').split(' ')[0]
  // Use cached stats or empty defaults (never null in the UI)
  const displayStats = stats ?? EMPTY_STATS

  /* ---------------------------------------------------------------- */
  /*  Render — ALWAYS instant, never a loading spinner                 */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* ── Greeting Row ── */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-sm font-bold shadow-md overflow-hidden shrink-0">
          {profileImage ? (
            <img src={profileImage} alt={firstName} className="h-full w-full object-cover" />
          ) : (
            firstName.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <h1 className="text-base font-bold leading-tight">Hi, {firstName} 👋</h1>
          <p className="text-xs text-muted-foreground">
            {displayStats.todayDeliveries} deliveries today · {formatCurrency(displayStats.todayEarnings, 0)} earned
          </p>
        </div>
      </div>

      {/* ── Compact Stats Grid (2×2) ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            icon: IndianRupee,
            label: "Today's Earnings",
            value: formatCurrency(displayStats.todayEarnings, 0),
            sub: `${displayStats.todayDeliveries} deliveries`,
            color: 'text-emerald-600 dark:text-emerald-400',
            bg: 'bg-emerald-100 dark:bg-emerald-900/30',
          },
          {
            icon: Star,
            label: 'Rating',
            value: displayStats.rating ? `${displayStats.rating}` : '-',
            sub: `${displayStats.totalRatings} ratings`,
            color: 'text-yellow-600 dark:text-yellow-400',
            bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          },
          {
            icon: CheckCircle2,
            label: 'Total Delivered',
            value: displayStats.totalDelivered,
            sub: formatCurrency(displayStats.totalEarnings, 0),
            color: 'text-orange-600 dark:text-orange-400',
            bg: 'bg-orange-100 dark:bg-orange-900/30',
          },
          {
            icon: Package,
            label: 'Total Assigned',
            value: displayStats.totalAssigned,
            sub: `${displayStats.inTransitOrders} in transit`,
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-100 dark:bg-blue-900/30',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.06 }}
          >
            <Card className="border-border/60 hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center gap-2.5">
                  <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg', stat.bg, stat.color)}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold leading-tight truncate">{stat.value}</p>
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

      {/* ── Weekly Earnings Chart ── */}
      <Card className="border-border/60">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <IndianRupee className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-sm font-semibold">Weekly Earnings</span>
          </div>
          <Link href="/delivery/earnings">
            <Button variant="ghost" size="sm" className="text-[11px] h-6 gap-0.5 text-emerald-600 hover:text-emerald-700 px-2">
              Details <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <CardContent className="pt-1 pb-3">
          {weeklyEarnings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-muted/50 text-muted-foreground mb-2">
                <IndianRupee className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium">No Earnings Data</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px]">
                Earnings will appear here once you complete deliveries.
              </p>
            </div>
          ) : (
            <MiniEarningsChart data={weeklyEarnings} />
          )}
        </CardContent>
      </Card>

      {/* ── Availability Status ── */}
      <Card className="border-border/60">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-sm font-semibold">Availability</span>
        </div>
        <CardContent className="pt-1 pb-3">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className={cn(
                'h-2.5 w-2.5 rounded-full',
                user?.isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
              )} />
              <span className="text-xs text-muted-foreground">
                {user?.isAvailable ? 'Currently available for deliveries' : 'Currently unavailable'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
