'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart,
  Package,
  Users,
  Store,
  Truck,
  TrendingUp,
  DollarSign,
  Clock,
  RefreshCw,
  Star,
  Flag,
  AlertTriangle,
  BarChart3,
  Activity,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface MonthlyRevenue {
  month: number
  year: number
  revenue: number
  orderCount: number
}

interface RecentOrder {
  orderId: string
  customerName: string
  totalAmount: number
  status: string
  createdAt: string
}

interface CategoryProduct {
  _id: string
  count: number
}

interface DashboardStats {
  totalProducts: number
  totalCategories: number
  totalCustomers: number
  totalSellers: number
  totalDeliveryBoys: number
  totalReviews: number
  averageRating: number
  flaggedReviews: number
  activeProducts: number
  productsByCategory: CategoryProduct[]
  totalOrders: number
  orderStatusCounts: Record<string, number>
  totalRevenue: number
  totalCommission: number
  totalDeliveryFees: number
  pendingOrders: number
  monthlyRevenue: MonthlyRevenue[]
  recentOrders: RecentOrder[]
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                   */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getMonthLabel(m: number): string {
  return MONTH_LABELS[m - 1] || String(m)
}

function formatDate(isoString: string | null): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  Pending:     { bg: 'bg-amber-500/10',  text: 'text-amber-600 dark:text-amber-400',  bar: 'bg-amber-500' },
  Processing:  { bg: 'bg-sky-500/10',    text: 'text-sky-600 dark:text-sky-400',      bar: 'bg-sky-500' },
  Shipped:     { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-500' },
  Out_for_Delivery: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500' },
  Delivered:   { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  Cancelled:   { bg: 'bg-red-500/10',    text: 'text-red-600 dark:text-red-400',      bar: 'bg-red-500' },
  Returned:    { bg: 'bg-rose-500/10',   text: 'text-rose-600 dark:text-rose-400',    bar: 'bg-rose-500' },
  Refunded:    { bg: 'bg-pink-500/10',   text: 'text-pink-600 dark:text-pink-400',    bar: 'bg-pink-500' },
}

function getStatusStyle(status: string) {
  const normalized = status.replace(/\s+/g, '_')
  return STATUS_COLORS[normalized] || STATUS_COLORS[status] || { bg: 'bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400', bar: 'bg-gray-500' }
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { authenticated, loading } = useAdminAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/admin')
    }
  }, [authenticated, loading, router])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <DashboardContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dashboard Content                                                   */
/* ------------------------------------------------------------------ */

function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/admin/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json().catch(() => ({}))
      setStats(data)
      setError(null)
    } catch (err) {
      console.error('Stats fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard stats')
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  /* ── Chart data ── */
  const revenueChartData = useMemo(() => {
    if (!stats?.monthlyRevenue) return []
    return stats.monthlyRevenue.map((item) => ({
      name: getMonthLabel(item.month),
      revenue: item.revenue,
      orders: item.orderCount,
    }))
  }, [stats?.monthlyRevenue])

  const categoryChartData = useMemo(() => {
    if (!stats?.productsByCategory) return []
    return stats.productsByCategory.slice(0, 8).map((item) => ({
      name: item._id?.length > 12 ? item._id.slice(0, 12) + '\u2026' : item._id || 'Unknown',
      count: item.count,
    }))
  }, [stats?.productsByCategory])

  /* ── Loading skeleton ── */
  if (loadingData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-muted/30 rounded-lg animate-pulse" />
          </div>
          <div className="h-9 w-9 bg-muted/30 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-muted/30 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div className="text-center">
          <p className="text-sm font-medium">{error || 'Failed to load dashboard'}</p>
          <p className="text-xs text-muted-foreground mt-1">Please try refreshing</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    )
  }

  const activePercent = stats.totalProducts > 0
    ? Math.round((stats.activeProducts / stats.totalProducts) * 100)
    : 0

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* ── Page Header ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview of your marketplace performance and metrics
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={fetchStats}
          disabled={refreshing}
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            refreshing && 'animate-spin'
          )}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </motion.button>
      </motion.div>

      {/* ── Primary Stat Cards ── */}
      <motion.div variants={staggerContainer} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={DollarSign}
          subtitle="From delivered orders"
          gradient="from-emerald-500/15 via-emerald-500/5 to-transparent"
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
        />
        <StatCard
          title="Total Orders"
          value={stats.totalOrders.toLocaleString('en-IN')}
          icon={ShoppingCart}
          subtitle={`${stats.pendingOrders} pending`}
          gradient="from-sky-500/15 via-sky-500/5 to-transparent"
          iconBg="bg-sky-500/10"
          iconColor="text-sky-600 dark:text-sky-400"
          accentBar="bg-sky-500"
        />
        <StatCard
          title="Total Commission"
          value={formatCurrency(stats.totalCommission)}
          icon={TrendingUp}
          subtitle="Platform earnings"
          gradient="from-teal-500/15 via-teal-500/5 to-transparent"
          iconBg="bg-teal-500/10"
          iconColor="text-teal-600 dark:text-teal-400"
          accentBar="bg-teal-500"
        />
        <StatCard
          title="Pending Orders"
          value={stats.pendingOrders.toLocaleString('en-IN')}
          icon={Clock}
          subtitle="Needs attention"
          gradient="from-amber-500/15 via-amber-500/5 to-transparent"
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600 dark:text-amber-400"
          accentBar="bg-amber-500"
        />
      </motion.div>

      {/* ── Secondary Stat Cards ── */}
      <motion.div variants={staggerContainer} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Products"
          value={stats.totalProducts.toLocaleString('en-IN')}
          icon={Package}
          subtitle={`${stats.activeProducts} active \u00b7 ${stats.totalProducts - stats.activeProducts} inactive`}
          gradient="from-orange-500/15 via-orange-500/5 to-transparent"
          iconBg="bg-orange-500/10"
          iconColor="text-orange-600 dark:text-orange-400"
          accentBar="bg-orange-500"
          extra={
            stats.totalProducts > 0 ? (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Active</span>
                  <span>{activePercent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all duration-700"
                    style={{ width: `${activePercent}%` }}
                  />
                </div>
              </div>
            ) : null
          }
        />
        <StatCard
          title="Total Customers"
          value={stats.totalCustomers.toLocaleString('en-IN')}
          icon={Users}
          subtitle="Registered users"
          gradient="from-cyan-500/15 via-cyan-500/5 to-transparent"
          iconBg="bg-cyan-500/10"
          iconColor="text-cyan-600 dark:text-cyan-400"
          accentBar="bg-cyan-500"
        />
        <StatCard
          title="Total Sellers"
          value={stats.totalSellers.toLocaleString('en-IN')}
          icon={Store}
          subtitle="Registered vendors"
          gradient="from-rose-500/15 via-rose-500/5 to-transparent"
          iconBg="bg-rose-500/10"
          iconColor="text-rose-600 dark:text-rose-400"
          accentBar="bg-rose-500"
        />
        <StatCard
          title="Delivery Boys"
          value={stats.totalDeliveryBoys.toLocaleString('en-IN')}
          icon={Truck}
          subtitle="Active fleet"
          gradient="from-violet-500/15 via-violet-500/5 to-transparent"
          iconBg="bg-violet-500/10"
          iconColor="text-violet-600 dark:text-violet-400"
          accentBar="bg-violet-500"
        />
      </motion.div>

      {/* ── Revenue Chart ── */}
      <motion.div variants={fadeInUp}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10">
                  <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Revenue Overview</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Monthly revenue for the last 12 months</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Revenue
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  Orders
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            {revenueChartData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value: number, name: string) => [
                        name === 'revenue' ? formatCurrency(value) : value.toLocaleString('en-IN'),
                        name === 'revenue' ? 'Revenue' : 'Orders',
                      ]}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#revenueGradient)"
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="orders"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fill="url(#ordersGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                No revenue data available
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Two-Column: Order Status + Recent Orders ── */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Order Status Breakdown */}
        <motion.div variants={cardVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-sky-500/10">
                  <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Order Status Breakdown</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Current distribution of orders</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {Object.keys(stats.orderStatusCounts).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(stats.orderStatusCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => {
                      const style = getStatusStyle(status)
                      const percentage = stats.totalOrders > 0
                        ? Math.round((count / stats.totalOrders) * 100)
                        : 0
                      return (
                        <div key={status} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={cn('h-2.5 w-2.5 rounded-full', style.bar)} />
                              <span className="text-sm font-medium">{formatStatusLabel(status)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold tabular-nums">{count.toLocaleString('en-IN')}</span>
                              <Badge
                                className={cn(
                                  'px-1.5 py-0 text-[10px] font-medium rounded-full border-0',
                                  style.bg,
                                  style.text
                                )}
                              >
                                {percentage}%
                              </Badge>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                              className={cn('h-full rounded-full', style.bar)}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No order data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Orders */}
        <motion.div variants={cardVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
                  <ShoppingCart className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Recent Orders</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Latest 5 orders placed</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4">
              {stats.recentOrders.length > 0 ? (
                <div className="space-y-0">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <span>Order</span>
                    <span className="text-right">Amount</span>
                    <span className="text-right">Status</span>
                  </div>
                  {/* Table rows */}
                  <AnimatePresence>
                    {stats.recentOrders.map((order, index) => {
                      const style = getStatusStyle(order.status)
                      return (
                        <motion.div
                          key={order.orderId || index}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 py-2.5 items-center border-b border-border/20 last:border-b-0 hover:bg-muted/20 transition-colors rounded-sm"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium font-mono truncate">{order.orderId || '\u2014'}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{order.customerName}</p>
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-right">{formatCurrency(order.totalAmount, 0)}</span>
                          <Badge
                            className={cn(
                              'px-2 py-0 text-[10px] font-medium rounded-full border-0 whitespace-nowrap',
                              style.bg,
                              style.text
                            )}
                          >
                            {formatStatusLabel(order.status)}
                          </Badge>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No recent orders</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ── Two-Column: Products by Category + Quick Stats ── */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Products by Category */}
        <motion.div variants={cardVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-orange-500/10">
                  <Package className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Products by Category</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Active products grouped by category</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {categoryChartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryChartData}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.8} />
                          <stop offset="100%" stopColor="#fb923c" stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        width={80}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                        formatter={(value: number) => [`${value} products`, 'Count']}
                      />
                      <Bar
                        dataKey="count"
                        fill="url(#barGradient)"
                        radius={[0, 4, 4, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  No category data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Stats */}
        <motion.div variants={cardVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-teal-500/10">
                  <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Quick Stats</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Key performance indicators</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {/* Average Rating */}
                <QuickStatItem
                  icon={<Star className="h-4 w-4 text-amber-500" />}
                  label="Avg Rating"
                  value={stats.averageRating > 0 ? `${stats.averageRating}/5` : '—'}
                  detail={`${stats.totalReviews} total reviews`}
                  bgColor="bg-amber-500/10"
                />
                {/* Flagged Reviews */}
                <QuickStatItem
                  icon={<Flag className="h-4 w-4 text-red-500" />}
                  label="Flagged Reviews"
                  value={String(stats.flaggedReviews)}
                  detail={stats.flaggedReviews > 0 ? 'Needs attention' : 'All clear'}
                  bgColor="bg-red-500/10"
                  valueColor={stats.flaggedReviews > 0 ? 'text-red-600 dark:text-red-400' : undefined}
                />
                {/* Active Products % */}
                <QuickStatItem
                  icon={<Package className="h-4 w-4 text-emerald-500" />}
                  label="Active Products"
                  value={`${activePercent}%`}
                  detail={`${stats.activeProducts} of ${stats.totalProducts}`}
                  bgColor="bg-emerald-500/10"
                />
                {/* Delivery Fees */}
                <QuickStatItem
                  icon={<Truck className="h-4 w-4 text-teal-500" />}
                  label="Delivery Fees"
                  value={formatCurrency(stats.totalDeliveryFees, 0)}
                  detail="From delivered orders"
                  bgColor="bg-teal-500/10"
                />
              </div>

              {/* Additional Metrics */}
              <div className="mt-4 pt-4 border-t border-border/40">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">More Metrics</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <MetricRow label="Categories" value={String(stats.totalCategories)} />
                  <MetricRow label="Total Reviews" value={String(stats.totalReviews)} />
                  <MetricRow label="Revenue/Order" value={stats.totalOrders > 0 ? formatCurrency(stats.totalRevenue / stats.totalOrders, 0) : '\u2014'} />
                  <MetricRow label="Commission Rate" value={stats.totalRevenue > 0 ? `${((stats.totalCommission / stats.totalRevenue) * 100).toFixed(1)}%` : '\u2014'} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stat Card Component                                                 */
/* ------------------------------------------------------------------ */

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  gradient,
  iconBg,
  iconColor,
  accentBar,
  extra,
}: {
  title: string
  value: string
  icon: React.ElementType
  subtitle?: string
  gradient: string
  iconBg: string
  iconColor: string
  accentBar: string
  extra?: React.ReactNode
}) {
  return (
    <motion.div variants={cardVariants}>
      <Card className={cn('border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden relative', `bg-gradient-to-br ${gradient}`)}>
        {/* Top accent bar */}
        <div className={cn('absolute top-0 left-0 right-0 h-0.5', accentBar)} />
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{title}</p>
              <p className="text-xl font-bold tracking-tight mt-1 truncate">{value}</p>
              {subtitle && (
                <p className="text-[10px] text-muted-foreground mt-1 truncate">{subtitle}</p>
              )}
            </div>
            <div className={cn('flex items-center justify-center h-9 w-9 rounded-lg shrink-0', iconBg)}>
              <Icon className={cn('h-4.5 w-4.5', iconColor)} />
            </div>
          </div>
          {extra}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Quick Stat Item                                                     */
/* ------------------------------------------------------------------ */

function QuickStatItem({
  icon,
  label,
  value,
  detail,
  bgColor,
  valueColor,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  bgColor: string
  valueColor?: string
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
      <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg shrink-0', bgColor)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn('text-sm font-bold mt-0.5', valueColor)}>{value}</p>
        <p className="text-[10px] text-muted-foreground truncate">{detail}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Metric Row                                                          */
/* ------------------------------------------------------------------ */

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </div>
  )
}
