'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import {
  Package,
  Star,
  ArrowUpRight,
  Store,
  ShieldCheck,
  TrendingUp,
  Inbox,
  Eye,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  products: { total: number; active: number; draft: number }
  averageRating: number
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
/* ------------------------------------------------------------------ */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loader                                                     */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-40 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="h-8 w-28 bg-muted animate-pulse rounded-lg" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>

    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Empty State Component                                               */
/* ------------------------------------------------------------------ */

function EmptyState({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  actionHref,
}: {
  icon: typeof Inbox
  title: string
  subtitle: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-emerald-500/60 dark:text-emerald-400/60" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">{subtitle}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 text-xs rounded-lg border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          >
            {actionLabel}
            <ArrowUpRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stat Card Component                                                 */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon: Icon,
  bgClass,
  textClass,
  gradientClass,
  sublabel,
  index,
}: {
  label: string
  value: string
  icon: typeof Package
  bgClass: string
  textClass: string
  gradientClass: string
  sublabel?: string
  index: number
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="group relative overflow-hidden bg-card rounded-xl border border-border hover:shadow-lg transition-all duration-300 hover:border-border/80"
    >
      {/* Gradient accent strip */}
      <div className={cn('absolute top-0 left-0 right-0 h-1 rounded-t-xl', gradientClass)} />

      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', bgClass)}>
            <Icon className={cn('h-5 w-5', textClass)} />
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-emerald-500 transition-colors" />
        </div>
        <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{value}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground">{label}</p>
          {sublabel && (
            <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
              {sublabel}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Component                                            */
/* ------------------------------------------------------------------ */

export default function SellerDashboard() {
  const { authenticated, loading, user, logout } = useSellerAuth()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    if (!loading && !authenticated) router.replace('/seller')
  }, [authenticated, loading, router])

  useEffect(() => {
    if (authenticated) {
      fetch('/api/seller/dashboard')
        .then(async res => {
          // Handle 401/403 — session expired or blocked
          if (res.status === 401 || res.status === 403) {
            await logout()
            router.replace('/seller')
            return null
          }
          if (!res.ok) throw new Error('Failed to fetch')
          return res.json()
        })
        .then(data => {
          if (data) {
            setStats(data)
          }
          setLoadingStats(false)
        })
        .catch(() => setLoadingStats(false))
    }
  }, [authenticated, router, logout])

  // Loading states
  if (loading || !authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadingStats || !stats) {
    return <DashboardSkeleton />
  }

  // Computed values
  const firstName = user?.name?.split(' ')[0] || 'Seller'
  const hasProducts = stats.products.total > 0

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ──────────────────────── Welcome Header ──────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Welcome, {firstName}!
            </h1>
            <Badge
              variant="secondary"
              className="gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs"
            >
              <Store className="h-3 w-3" />
              {user?.storeName || 'My Store'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Here&apos;s an overview of your store performance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Verified Seller
            </span>
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </motion.div>

      {/* ──────────────────────── Stats Grid ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Products"
          value={stats.products.total.toString()}
          icon={Package}
          bgClass="bg-blue-50 dark:bg-blue-950/30"
          textClass="text-blue-600 dark:text-blue-400"
          gradientClass="bg-gradient-to-r from-blue-500 to-blue-400"
          sublabel={stats.products.total > 0 ? `${stats.products.active} active` : undefined}
          index={0}
        />
        <StatCard
          label="Active Products"
          value={stats.products.active.toString()}
          icon={Eye}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
          index={1}
        />
        <StatCard
          label="Draft Products"
          value={stats.products.draft.toString()}
          icon={Inbox}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-orange-400"
          index={2}
        />
        <StatCard
          label="Avg. Rating"
          value={stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'}
          icon={Star}
          bgClass="bg-violet-50 dark:bg-violet-950/30"
          textClass="text-violet-600 dark:text-violet-400"
          gradientClass="bg-gradient-to-r from-violet-500 to-purple-400"
          sublabel={stats.averageRating > 0 ? 'out of 5.0' : undefined}
          index={3}
        />
      </div>

      {/* ──────────────────────── Product Overview ──────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Product Overview</CardTitle>
              <Link href="/seller/products">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300">
                  Manage Products
                  <ArrowUpRight className="h-3 w-3 ml-0.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!hasProducts ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                  <Package className="h-5 w-5 text-muted-foreground/40" />
                </div>
                <p className="text-xs text-muted-foreground">No products yet — add your first product to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Product status bar */}
                <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
                  {stats.products.total > 0 && (
                    <>
                      <div
                        className="bg-emerald-500 transition-all duration-700"
                        style={{ width: `${(stats.products.active / stats.products.total) * 100}%` }}
                        title={`Active: ${stats.products.active}`}
                      />
                      <div
                        className="bg-amber-500 transition-all duration-700"
                        style={{ width: `${(stats.products.draft / stats.products.total) * 100}%` }}
                        title={`Draft: ${stats.products.draft}`}
                      />
                    </>
                  )}
                </div>

                {/* Status items */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0 bg-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Active</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{stats.products.active}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0 bg-amber-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Draft</p>
                      <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{stats.products.draft}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
