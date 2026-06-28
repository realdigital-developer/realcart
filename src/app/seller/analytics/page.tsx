'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ShoppingCart,
  Package,
  ArrowUpRight,
  Inbox,
  CalendarDays,
  Eye,
  RefreshCw,
  Download,
  Star,
  Users,
  Repeat,
  Wallet,
  Receipt,
  Percent,
  AlertTriangle,
  Boxes,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { format, subDays } from 'date-fns'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface GrowthMetric {
  current: number
  previous: number
  change: number
  growthRate: number
}

interface SellerOverviewReport {
  range: { startDate: string; endDate: string }
  sellerId: string
  kpis: {
    totalRevenue: GrowthMetric
    totalOrders: GrowthMetric
    itemsSold: GrowthMetric
    avgOrderValue: GrowthMetric
    totalProducts: number
    activeProducts: number
    avgRating: number
    conversionRate: GrowthMetric
    productViews: GrowthMetric
  }
  orderStatusBreakdown: Array<{ status: string; count: number; revenue: number }>
  revenueByDay: Array<{ date: string; label: string; value: number }>
  ordersByDay: Array<{ date: string; label: string; value: number }>
  topProducts: Array<{
    productId: string
    name: string
    image: string
    unitsSold: number
    revenue: number
  }>
  topCategories: Array<{
    category: string
    revenue: number
    orders: number
    unitsSold: number
  }>
}

interface SellerSalesReport {
  range: { startDate: string; endDate: string }
  groupBy: 'day' | 'week' | 'month'
  sellerId: string
  summary: {
    grossRevenue: GrowthMetric
    netRevenue: GrowthMetric
    totalOrders: GrowthMetric
    itemsSold: GrowthMetric
    avgOrderValue: GrowthMetric
    refundAmount: GrowthMetric
    sellerEarnings: GrowthMetric
    commissionPaid: GrowthMetric
  }
  trend: Array<{
    date: string
    label: string
    revenue: number
    orders: number
    itemsSold: number
    sellerEarnings: number
    avgOrderValue: number
  }>
  breakdownByPayment: Array<{ method: string; revenue: number; orders: number; percentage: number }>
  breakdownByStatus: Array<{ status: string; revenue: number; orders: number; percentage: number }>
  weekdayDistribution: Array<{ day: string; orders: number; revenue: number }>
}

interface SellerProductReport {
  range: { startDate: string; endDate: string }
  sellerId: string
  summary: {
    totalProducts: number
    activeProducts: number
    outOfStock: number
    lowStock: number
    avgRating: number
    totalViews: number
  }
  topProducts: Array<{
    productId: string
    name: string
    image: string
    category: string
    unitsSold: number
    revenue: number
    views: number
    conversionRate: number
    avgRating: number
    stock: number
  }>
  slowMovingProducts: Array<{
    productId: string
    name: string
    image: string
    category: string
    stock: number
    lastSoldDate: string | null
    unitsSold: number
  }>
  categoryPerformance: Array<{
    category: string
    products: number
    unitsSold: number
    revenue: number
  }>
  inventoryStatus: Array<{
    status: string
    count: number
    value: number
    percentage: number
  }>
}

interface SellerCustomerReport {
  range: { startDate: string; endDate: string }
  sellerId: string
  summary: {
    totalCustomers: number
    newCustomers: GrowthMetric
    returningCustomers: GrowthMetric
    repeatPurchaseRate: GrowthMetric
    avgCustomerValue: GrowthMetric
  }
  newVsReturning: Array<{ type: string; count: number; revenue: number; percentage: number }>
  topCustomers: Array<{
    customerId: string
    name: string
    mobile: string
    totalOrders: number
    totalSpent: number
    avgOrderValue: number
    lastOrderDate: string
  }>
  geographicDistribution: Array<{
    state: string
    customers: number
    orders: number
    revenue: number
  }>
}

type TabKey = 'overview' | 'sales' | 'products' | 'customers'

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  processing: '#3b82f6',
  shipped: '#8b5cf6',
  delivered: '#10b981',
  cancelled: '#ef4444',
  returned: '#ec4899',
  refunded: '#64748b',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  refunded: 'Refunded',
}

const PAYMENT_LABELS: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net Banking',
  wallet: 'Wallet',
  cod: 'Cash on Delivery',
  razorpay: 'Razorpay',
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
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function fmtPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_00_00_000) return `${(v / 1_00_00_000).toFixed(1)}Cr`
  if (Math.abs(v) >= 1_00_000) return `${(v / 1_00_000).toFixed(1)}L`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return v.toString()
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loader                                                     */
/* ------------------------------------------------------------------ */

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-36 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="h-10 w-72 bg-muted animate-pulse rounded-lg" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="h-80 bg-muted animate-pulse rounded-xl" />
        <div className="h-80 bg-muted animate-pulse rounded-xl" />
      </div>
      <div className="h-72 bg-muted animate-pulse rounded-xl" />
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
  growth,
}: {
  label: string
  value: string
  icon: typeof Package
  bgClass: string
  textClass: string
  gradientClass: string
  sublabel?: string
  growth?: GrowthMetric | null
}) {
  const rate = growth?.growthRate ?? 0
  const showGrowth = growth != null
  const isPositive = rate > 0
  const isNegative = rate < 0
  return (
    <motion.div
      variants={itemVariants}
      className="group relative overflow-hidden bg-card rounded-xl border border-border hover:shadow-lg transition-all duration-300 hover:border-border/80"
    >
      <div className={cn('absolute top-0 left-0 right-0 h-1 rounded-t-xl', gradientClass)} />
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', bgClass)}>
            <Icon className={cn('h-5 w-5', textClass)} />
          </div>
          {showGrowth ? (
            <div
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                isPositive && 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
                isNegative && 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
                !isPositive && !isNegative && 'bg-muted text-muted-foreground',
              )}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : isNegative ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              <span>{rate > 0 ? '+' : ''}{fmtPct(rate, 1)}</span>
            </div>
          ) : (
            <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-emerald-500 transition-colors" />
          )}
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
/*  Custom Tooltips                                                     */
/* ------------------------------------------------------------------ */

function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name?: string; dataKey?: string }>
  label?: string
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-foreground">{label}</p>
        {payload.map((p, i) => (
          <p
            key={i}
            className={cn(
              'text-sm font-bold',
              p.dataKey === 'sellerEarnings'
                ? 'text-teal-600 dark:text-teal-400'
                : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {(p.name ?? 'Revenue')}: {fmtPrice(p.value, 0)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

function BarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-foreground max-w-[180px] truncate">{label}</p>
        <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
          {fmtPrice(payload[0].value, 0)}
        </p>
      </div>
    )
  }
  return null
}

function CountBarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-foreground max-w-[180px] truncate">{label}</p>
        <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
          {payload[0].value.toLocaleString('en-IN')}
        </p>
      </div>
    )
  }
  return null
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-foreground">{payload[0].name}</p>
        <p className="text-sm font-bold" style={{ color: payload[0].payload.fill }}>
          {payload[0].value.toLocaleString('en-IN')}
        </p>
      </div>
    )
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Empty / Error / Loading States                                      */
/* ------------------------------------------------------------------ */

function EmptyChartState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Inbox
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-emerald-500/60 dark:text-emerald-400/60" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">{subtitle}</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-2xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center mb-4">
        <AlertTriangle className="h-7 w-7 text-rose-500/70 dark:text-rose-400/70" />
      </div>
      <p className="text-sm font-semibold text-foreground">Failed to load analytics</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">{message}</p>
      <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
        Retry
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Date Range Picker                                                   */
/* ------------------------------------------------------------------ */

function DateRangePicker({
  startDate,
  endDate,
  onChange,
  onRefresh,
  loading,
  extra,
}: {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  onRefresh: () => void
  loading: boolean
  extra?: React.ReactNode
}) {
  const maxDate = toISODate(new Date())
  return (
    <motion.div
      variants={itemVariants}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">Start date</label>
        <Input
          type="date"
          value={startDate}
          max={endDate}
          onChange={(e) => onChange(e.target.value || startDate, endDate)}
          className="w-[150px] h-9 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">End date</label>
        <Input
          type="date"
          value={endDate}
          min={startDate}
          max={maxDate}
          onChange={(e) => onChange(startDate, e.target.value || endDate)}
          className="w-[150px] h-9 text-sm"
        />
      </div>
      {extra}
      <Button
        onClick={onRefresh}
        variant="outline"
        size="sm"
        className="h-9"
        disabled={loading}
      >
        <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
        Refresh
      </Button>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#64748b'
  const label = STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="text-sm font-medium text-foreground">
        {rating > 0 ? rating.toFixed(1) : '—'}
      </span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Scrollable table wrapper                                            */
/* ------------------------------------------------------------------ */

const SCROLLABLE_TABLE_WRAP =
  'max-h-96 overflow-y-auto rounded-lg border border-border [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full'

/* ------------------------------------------------------------------ */
/*  Tab: Overview                                                       */
/* ------------------------------------------------------------------ */

function OverviewTab({
  sellerFetch,
}: {
  sellerFetch: <T>(url: string) => Promise<T | null>
}) {
  const [data, setData] = useState<SellerOverviewReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(toISODate(subDays(new Date(), 29)))
  const [endDate, setEndDate] = useState(toISODate(new Date()))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await sellerFetch<SellerOverviewReport>(
        `/api/seller/analytics/overview?startDate=${startDate}&endDate=${endDate}`,
      )
      if (res) setData(res)
      else setError('No data received from server.')
    } catch (e) {
      setError((e as Error).message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [sellerFetch, startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const revenueData = useMemo(
    () => (data?.revenueByDay ?? []).map(d => ({ label: d.label, value: d.value })),
    [data],
  )
  const ordersData = useMemo(
    () => (data?.ordersByDay ?? []).map(d => ({ label: d.label, value: d.value })),
    [data],
  )
  const allRevenueZero = revenueData.length === 0 || revenueData.every(d => d.value === 0)
  const allOrdersZero = ordersData.length === 0 || ordersData.every(d => d.value === 0)

  if (loading && !data) return <AnalyticsSkeleton />
  if (error && !data)
    return (
      <Card>
        <CardContent>
          <ErrorState message={error} onRetry={fetchData} />
        </CardContent>
      </Card>
    )
  if (!data) return null

  const k = data.kpis

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(s, e) => {
          setStartDate(s)
          setEndDate(e)
        }}
        onRefresh={fetchData}
        loading={loading}
      />

      {/* Primary KPIs (with growth badges) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Revenue"
          value={fmtPrice(k.totalRevenue.current, 0)}
          icon={IndianRupee}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
          growth={k.totalRevenue}
        />
        <StatCard
          label="Total Orders"
          value={k.totalOrders.current.toLocaleString('en-IN')}
          icon={ShoppingCart}
          bgClass="bg-blue-50 dark:bg-blue-950/30"
          textClass="text-blue-600 dark:text-blue-400"
          gradientClass="bg-gradient-to-r from-blue-500 to-cyan-400"
          growth={k.totalOrders}
        />
        <StatCard
          label="Items Sold"
          value={k.itemsSold.current.toLocaleString('en-IN')}
          icon={Package}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-orange-400"
          growth={k.itemsSold}
        />
        <StatCard
          label="Avg Order Value"
          value={fmtPrice(k.avgOrderValue.current, 0)}
          icon={TrendingUp}
          bgClass="bg-teal-50 dark:bg-teal-950/30"
          textClass="text-teal-600 dark:text-teal-400"
          gradientClass="bg-gradient-to-r from-teal-500 to-emerald-400"
          growth={k.avgOrderValue}
        />
      </div>

      {/* Secondary KPIs (no growth) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Products"
          value={k.totalProducts.toLocaleString('en-IN')}
          icon={Boxes}
          bgClass="bg-violet-50 dark:bg-violet-950/30"
          textClass="text-violet-600 dark:text-violet-400"
          gradientClass="bg-gradient-to-r from-violet-500 to-purple-400"
        />
        <StatCard
          label="Active Products"
          value={k.activeProducts.toLocaleString('en-IN')}
          icon={Package}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-green-400"
        />
        <StatCard
          label="Avg Rating"
          value={k.avgRating > 0 ? k.avgRating.toFixed(1) : '—'}
          icon={Star}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-yellow-400"
        />
        <StatCard
          label="Conversion Rate"
          value={fmtPct(k.conversionRate.current, 2)}
          icon={Percent}
          bgClass="bg-rose-50 dark:bg-rose-950/30"
          textClass="text-rose-600 dark:text-rose-400"
          gradientClass="bg-gradient-to-r from-rose-500 to-pink-400"
          growth={k.conversionRate}
        />
      </div>

      {/* Revenue Trend + Orders Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Revenue Trend</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Daily revenue for selected period
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              {allRevenueZero ? (
                <EmptyChartState
                  icon={TrendingUp}
                  title="No revenue data yet"
                  subtitle="Revenue from your orders will appear here as customers buy your products"
                />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="overviewRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => fmtCompact(v)}
                      />
                      <Tooltip content={<RevenueTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name="Revenue"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fill="url(#overviewRevenueGrad)"
                        dot={false}
                        activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Orders Trend</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Daily order count</p>
            </CardHeader>
            <CardContent className="pt-0">
              {allOrdersZero ? (
                <EmptyChartState
                  icon={ShoppingCart}
                  title="No order data yet"
                  subtitle="Orders will appear here once customers start placing orders"
                />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ordersData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<CountBarTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }} />
                      <Bar dataKey="value" name="Orders" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Top Products + Top Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Products</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">By units sold & revenue</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.topProducts.length === 0 ? (
                <EmptyChartState
                  icon={Package}
                  title="No product sales yet"
                  subtitle="Top selling products will appear here once orders come in"
                />
              ) : (
                <div className={SCROLLABLE_TABLE_WRAP}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Product</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Units</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topProducts.map((p, i) => (
                        <TableRow key={p.productId ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              {p.image ? (
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="h-8 w-8 rounded-md object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <span className="font-medium text-foreground truncate max-w-[180px]">
                                {p.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">
                            {p.unitsSold.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {fmtPrice(p.revenue, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Categories</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue contribution by category</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.topCategories.length === 0 ? (
                <EmptyChartState
                  icon={BarChart3}
                  title="No category data"
                  subtitle="Category breakdown will appear here once you have sales"
                />
              ) : (
                <div className={SCROLLABLE_TABLE_WRAP}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Category</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Orders</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Units</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topCategories.map((c, i) => (
                        <TableRow key={c.category ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell className="text-sm font-medium text-foreground">{c.category}</TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{c.orders}</TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{c.unitsSold}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {fmtPrice(c.revenue, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Order Status Breakdown */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Order Status Breakdown</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Count & revenue by current status
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {data.orderStatusBreakdown.length === 0 ? (
              <EmptyChartState
                icon={ShoppingCart}
                title="No order status data"
                subtitle="Order status distribution will appear here once orders exist"
              />
            ) : (
              <div className={SCROLLABLE_TABLE_WRAP}>
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Orders</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                      <TableHead className="text-xs font-semibold text-right w-1/3">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orderStatusBreakdown.map((s, i) => {
                      const total = data.orderStatusBreakdown.reduce((a, b) => a + b.count, 0) || 1
                      const pct = (s.count / total) * 100
                      return (
                        <TableRow key={s.status ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell>
                            <StatusBadge status={s.status} />
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{s.count}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-foreground">
                            {fmtPrice(s.revenue, 0)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: STATUS_COLORS[s.status] ?? '#64748b',
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-10 text-right">
                                {fmtPct(pct, 0)}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab: Sales Report                                                   */
/* ------------------------------------------------------------------ */

function SalesTab({
  sellerFetch,
}: {
  sellerFetch: <T>(url: string) => Promise<T | null>
}) {
  const [data, setData] = useState<SellerSalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(toISODate(subDays(new Date(), 29)))
  const [endDate, setEndDate] = useState(toISODate(new Date()))
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await sellerFetch<SellerSalesReport>(
        `/api/seller/analytics/sales?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}`,
      )
      if (res) setData(res)
      else setError('No data received from server.')
    } catch (e) {
      setError((e as Error).message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [sellerFetch, startDate, endDate, groupBy])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const trendData = useMemo(
    () =>
      (data?.trend ?? []).map(t => ({
        label: t.label,
        revenue: t.revenue,
        sellerEarnings: t.sellerEarnings,
      })),
    [data],
  )
  const weekdayData = useMemo(
    () => (data?.weekdayDistribution ?? []).map(d => ({ day: d.day, revenue: d.revenue, orders: d.orders })),
    [data],
  )
  const allTrendZero = trendData.length === 0 || trendData.every(d => d.revenue === 0 && d.sellerEarnings === 0)

  const exportUrl = `/api/seller/analytics/export?type=sales&startDate=${startDate}&endDate=${endDate}`

  if (loading && !data) return <AnalyticsSkeleton />
  if (error && !data)
    return (
      <Card>
        <CardContent>
          <ErrorState message={error} onRetry={fetchData} />
        </CardContent>
      </Card>
    )
  if (!data) return null

  const s = data.summary

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(s, e) => {
          setStartDate(s)
          setEndDate(e)
        }}
        onRefresh={fetchData}
        loading={loading}
        extra={
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Group by</label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'week' | 'month')}>
                <SelectTrigger className="w-[130px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button asChild variant="outline" size="sm" className="h-9">
              <a href={exportUrl} download>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </a>
            </Button>
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Gross Revenue"
          value={fmtPrice(s.grossRevenue.current, 0)}
          icon={IndianRupee}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
          growth={s.grossRevenue}
        />
        <StatCard
          label="Net Revenue"
          value={fmtPrice(s.netRevenue.current, 0)}
          icon={Wallet}
          bgClass="bg-teal-50 dark:bg-teal-950/30"
          textClass="text-teal-600 dark:text-teal-400"
          gradientClass="bg-gradient-to-r from-teal-500 to-emerald-400"
          growth={s.netRevenue}
        />
        <StatCard
          label="Total Orders"
          value={s.totalOrders.current.toLocaleString('en-IN')}
          icon={ShoppingCart}
          bgClass="bg-blue-50 dark:bg-blue-950/30"
          textClass="text-blue-600 dark:text-blue-400"
          gradientClass="bg-gradient-to-r from-blue-500 to-cyan-400"
          growth={s.totalOrders}
        />
        <StatCard
          label="Items Sold"
          value={s.itemsSold.current.toLocaleString('en-IN')}
          icon={Package}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-orange-400"
          growth={s.itemsSold}
        />
        <StatCard
          label="Avg Order Value"
          value={fmtPrice(s.avgOrderValue.current, 0)}
          icon={TrendingUp}
          bgClass="bg-violet-50 dark:bg-violet-950/30"
          textClass="text-violet-600 dark:text-violet-400"
          gradientClass="bg-gradient-to-r from-violet-500 to-purple-400"
          growth={s.avgOrderValue}
        />
        <StatCard
          label="Refund Amount"
          value={fmtPrice(s.refundAmount.current, 0)}
          icon={Receipt}
          bgClass="bg-rose-50 dark:bg-rose-950/30"
          textClass="text-rose-600 dark:text-rose-400"
          gradientClass="bg-gradient-to-r from-rose-500 to-pink-400"
          growth={s.refundAmount}
        />
        <StatCard
          label="Seller Earnings"
          value={fmtPrice(s.sellerEarnings.current, 0)}
          icon={Wallet}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-green-400"
          growth={s.sellerEarnings}
        />
        <StatCard
          label="Commission Paid"
          value={fmtPrice(s.commissionPaid.current, 0)}
          icon={Percent}
          bgClass="bg-orange-50 dark:bg-orange-950/30"
          textClass="text-orange-600 dark:text-orange-400"
          gradientClass="bg-gradient-to-r from-orange-500 to-amber-400"
          growth={s.commissionPaid}
        />
      </div>

      {/* Revenue & Earnings Trend (dual-area) */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Revenue & Earnings Trend</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Grouped by {groupBy}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Revenue</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                  <span className="text-muted-foreground">Earnings</span>
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {allTrendZero ? (
              <EmptyChartState
                icon={TrendingUp}
                title="No trend data"
                subtitle="Revenue & earnings trend will appear here for the selected period"
              />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="salesEarningsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => fmtCompact(v)}
                    />
                    <Tooltip content={<RevenueTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fill="url(#salesRevenueGrad)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sellerEarnings"
                      name="Earnings"
                      stroke="#14b8a6"
                      strokeWidth={2.5}
                      fill="url(#salesEarningsGrad)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#14b8a6', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Weekday Distribution */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Weekday Distribution</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Revenue by day of week
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {weekdayData.length === 0 || weekdayData.every(d => d.revenue === 0) ? (
              <EmptyChartState
                icon={CalendarDays}
                title="No weekday data"
                subtitle="Revenue by weekday will appear here once orders exist"
              />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => fmtCompact(v)}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Payment + Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Payment Method Breakdown</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue & orders by payment method</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.breakdownByPayment.length === 0 ? (
                <EmptyChartState
                  icon={Receipt}
                  title="No payment data"
                  subtitle="Payment method breakdown will appear here once orders are paid"
                />
              ) : (
                <div className={SCROLLABLE_TABLE_WRAP}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Method</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Orders</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.breakdownByPayment.map((p, i) => (
                        <TableRow key={p.method ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell className="text-sm font-medium text-foreground">
                            {PAYMENT_LABELS[p.method] ?? p.method}
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{p.orders}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-foreground">
                            {fmtPrice(p.revenue, 0)}
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">
                            {fmtPct(p.percentage, 1)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Order Status Breakdown</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue & orders by status</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.breakdownByStatus.length === 0 ? (
                <EmptyChartState
                  icon={ShoppingCart}
                  title="No status data"
                  subtitle="Order status breakdown will appear here once orders exist"
                />
              ) : (
                <div className={SCROLLABLE_TABLE_WRAP}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Orders</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.breakdownByStatus.map((s, i) => (
                        <TableRow key={s.status ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell>
                            <StatusBadge status={s.status} />
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{s.orders}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-foreground">
                            {fmtPrice(s.revenue, 0)}
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">
                            {fmtPct(s.percentage, 1)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab: Products                                                       */
/* ------------------------------------------------------------------ */

function ProductsTab({
  sellerFetch,
}: {
  sellerFetch: <T>(url: string) => Promise<T | null>
}) {
  const [data, setData] = useState<SellerProductReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(toISODate(subDays(new Date(), 29)))
  const [endDate, setEndDate] = useState(toISODate(new Date()))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await sellerFetch<SellerProductReport>(
        `/api/seller/analytics/products?startDate=${startDate}&endDate=${endDate}`,
      )
      if (res) setData(res)
      else setError('No data received from server.')
    } catch (e) {
      setError((e as Error).message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [sellerFetch, startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const exportUrl = `/api/seller/analytics/export?type=products&startDate=${startDate}&endDate=${endDate}`

  if (loading && !data) return <AnalyticsSkeleton />
  if (error && !data)
    return (
      <Card>
        <CardContent>
          <ErrorState message={error} onRetry={fetchData} />
        </CardContent>
      </Card>
    )
  if (!data) return null

  const s = data.summary
  const inventoryPie = data.inventoryStatus
    .filter(i => i.count > 0)
    .map(i => ({
      name: i.status.charAt(0).toUpperCase() + i.status.slice(1),
      value: i.count,
      percentage: i.percentage,
      fill:
        i.status === 'in_stock'
          ? '#10b981'
          : i.status === 'low_stock'
            ? '#f59e0b'
            : i.status === 'out_of_stock'
              ? '#ef4444'
              : '#64748b',
    }))

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(s, e) => {
          setStartDate(s)
          setEndDate(e)
        }}
        onRefresh={fetchData}
        loading={loading}
        extra={
          <Button asChild variant="outline" size="sm" className="h-9">
            <a href={exportUrl} download>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </a>
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="Total Products"
          value={s.totalProducts.toLocaleString('en-IN')}
          icon={Boxes}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
        />
        <StatCard
          label="Active Products"
          value={s.activeProducts.toLocaleString('en-IN')}
          icon={Package}
          bgClass="bg-blue-50 dark:bg-blue-950/30"
          textClass="text-blue-600 dark:text-blue-400"
          gradientClass="bg-gradient-to-r from-blue-500 to-cyan-400"
        />
        <StatCard
          label="Out of Stock"
          value={s.outOfStock.toLocaleString('en-IN')}
          icon={AlertTriangle}
          bgClass="bg-rose-50 dark:bg-rose-950/30"
          textClass="text-rose-600 dark:text-rose-400"
          gradientClass="bg-gradient-to-r from-rose-500 to-pink-400"
        />
        <StatCard
          label="Low Stock"
          value={s.lowStock.toLocaleString('en-IN')}
          icon={AlertTriangle}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-orange-400"
        />
        <StatCard
          label="Avg Rating"
          value={s.avgRating > 0 ? s.avgRating.toFixed(1) : '—'}
          icon={Star}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-yellow-400"
        />
        <StatCard
          label="Total Views"
          value={s.totalViews.toLocaleString('en-IN')}
          icon={Eye}
          bgClass="bg-violet-50 dark:bg-violet-950/30"
          textClass="text-violet-600 dark:text-violet-400"
          gradientClass="bg-gradient-to-r from-violet-500 to-purple-400"
        />
      </div>

      {/* Inventory Status Donut */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Inventory Status</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Distribution of products by stock level
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {inventoryPie.length === 0 ? (
              <EmptyChartState
                icon={Boxes}
                title="No inventory data"
                subtitle="Inventory distribution will appear here once products are added"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={inventoryPie}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {inventoryPie.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        height={32}
                        iconType="circle"
                        formatter={(value: string) => (
                          <span className="text-xs text-muted-foreground">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {inventoryPie.map((i) => (
                    <div key={i.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.fill }} />
                        <span className="text-sm font-medium text-foreground">{i.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{i.value.toLocaleString('en-IN')}</p>
                        <p className="text-xs text-muted-foreground">{fmtPct(i.percentage, 1)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Products Table */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Products</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              By units sold, revenue, views & conversion
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {data.topProducts.length === 0 ? (
              <EmptyChartState
                icon={Package}
                title="No top products yet"
                subtitle="Top performing products will appear here once sales occur"
              />
            ) : (
              <div className={SCROLLABLE_TABLE_WRAP}>
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold">Product</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Units</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                      <TableHead className="text-xs font-semibold text-right hidden md:table-cell">Views</TableHead>
                      <TableHead className="text-xs font-semibold text-right hidden lg:table-cell">Conv Rate</TableHead>
                      <TableHead className="text-xs font-semibold text-right hidden lg:table-cell">Rating</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topProducts.map((p, i) => (
                      <TableRow key={p.productId ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="h-8 w-8 rounded-md object-cover flex-shrink-0" />
                            ) : (
                              <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate max-w-[180px]">{p.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{p.category}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {p.unitsSold.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {fmtPrice(p.revenue, 0)}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground hidden md:table-cell">
                          {p.views.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground hidden lg:table-cell">
                          {fmtPct(p.conversionRate, 2)}
                        </TableCell>
                        <TableCell className="text-sm text-right hidden lg:table-cell">
                          <RatingStars rating={p.avgRating} />
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          <span
                            className={cn(
                              'font-medium',
                              p.stock === 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : p.stock <= 5
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {p.stock}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Slow Moving Products + Category Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Slow-Moving Products</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Low sales velocity items</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.slowMovingProducts.length === 0 ? (
                <EmptyChartState
                  icon={Clock}
                  title="No slow-moving products"
                  subtitle="Products with low sales velocity will appear here"
                />
              ) : (
                <div className={SCROLLABLE_TABLE_WRAP}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Product</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Stock</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden sm:table-cell">Last Sold</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Units</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.slowMovingProducts.map((p, i) => (
                        <TableRow key={p.productId ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              {p.image ? (
                                <img src={p.image} alt={p.name} className="h-8 w-8 rounded-md object-cover flex-shrink-0" />
                              ) : (
                                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate max-w-[140px]">{p.name}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{p.category}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{p.stock}</TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground hidden sm:table-cell">
                            {p.lastSoldDate ? format(new Date(p.lastSoldDate), 'dd MMM yyyy') : '—'}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-sm text-right font-semibold',
                              p.unitsSold <= 5
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-muted-foreground',
                            )}
                          >
                            {p.unitsSold}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Category Performance</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Products, units sold & revenue by category</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.categoryPerformance.length === 0 ? (
                <EmptyChartState
                  icon={BarChart3}
                  title="No category performance data"
                  subtitle="Category performance will appear here once sales occur"
                />
              ) : (
                <div className={SCROLLABLE_TABLE_WRAP}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Category</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Products</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Units</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.categoryPerformance.map((c, i) => (
                        <TableRow key={c.category ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell className="text-sm font-medium text-foreground">{c.category}</TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{c.products}</TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{c.unitsSold}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {fmtPrice(c.revenue, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab: Customers                                                      */
/* ------------------------------------------------------------------ */

function CustomersTab({
  sellerFetch,
}: {
  sellerFetch: <T>(url: string) => Promise<T | null>
}) {
  const [data, setData] = useState<SellerCustomerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(toISODate(subDays(new Date(), 29)))
  const [endDate, setEndDate] = useState(toISODate(new Date()))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await sellerFetch<SellerCustomerReport>(
        `/api/seller/analytics/customers?startDate=${startDate}&endDate=${endDate}`,
      )
      if (res) setData(res)
      else setError('No data received from server.')
    } catch (e) {
      setError((e as Error).message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [sellerFetch, startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const exportUrl = `/api/seller/analytics/export?type=customers&startDate=${startDate}&endDate=${endDate}`

  if (loading && !data) return <AnalyticsSkeleton />
  if (error && !data)
    return (
      <Card>
        <CardContent>
          <ErrorState message={error} onRetry={fetchData} />
        </CardContent>
      </Card>
    )
  if (!data) return null

  const s = data.summary

  const pieData = (data.newVsReturning ?? [])
    .filter(d => d.count > 0)
    .map(d => ({
      name: d.type === 'new' ? 'New Customers' : 'Returning Customers',
      value: d.count,
      percentage: d.percentage,
      fill: d.type === 'new' ? '#10b981' : '#3b82f6',
    }))

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(s, e) => {
          setStartDate(s)
          setEndDate(e)
        }}
        onRefresh={fetchData}
        loading={loading}
        extra={
          <Button asChild variant="outline" size="sm" className="h-9">
            <a href={exportUrl} download>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </a>
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard
          label="Total Customers"
          value={s.totalCustomers.toLocaleString('en-IN')}
          icon={Users}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
        />
        <StatCard
          label="New Customers"
          value={s.newCustomers.current.toLocaleString('en-IN')}
          icon={Users}
          bgClass="bg-blue-50 dark:bg-blue-950/30"
          textClass="text-blue-600 dark:text-blue-400"
          gradientClass="bg-gradient-to-r from-blue-500 to-cyan-400"
          growth={s.newCustomers}
        />
        <StatCard
          label="Returning"
          value={s.returningCustomers.current.toLocaleString('en-IN')}
          icon={Repeat}
          bgClass="bg-teal-50 dark:bg-teal-950/30"
          textClass="text-teal-600 dark:text-teal-400"
          gradientClass="bg-gradient-to-r from-teal-500 to-emerald-400"
          growth={s.returningCustomers}
        />
        <StatCard
          label="Repeat Purchase Rate"
          value={fmtPct(s.repeatPurchaseRate.current, 1)}
          icon={Percent}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-orange-400"
          growth={s.repeatPurchaseRate}
        />
        <StatCard
          label="Avg Customer Value"
          value={fmtPrice(s.avgCustomerValue.current, 0)}
          icon={Wallet}
          bgClass="bg-violet-50 dark:bg-violet-950/30"
          textClass="text-violet-600 dark:text-violet-400"
          gradientClass="bg-gradient-to-r from-violet-500 to-purple-400"
          growth={s.avgCustomerValue}
        />
      </div>

      {/* New vs Returning Donut */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">New vs Returning Customers</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Distribution & revenue contribution
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {pieData.length === 0 ? (
              <EmptyChartState
                icon={Users}
                title="No customer data"
                subtitle="New vs returning breakdown will appear here once orders exist"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        height={32}
                        iconType="circle"
                        formatter={(value: string) => (
                          <span className="text-xs text-muted-foreground">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {(data.newVsReturning ?? []).map((d) => {
                    const fill = d.type === 'new' ? '#10b981' : '#3b82f6'
                    const label = d.type === 'new' ? 'New Customers' : 'Returning Customers'
                    return (
                      <div key={d.type} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: fill }} />
                          <span className="text-sm font-medium text-foreground">{label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">
                            {d.count.toLocaleString('en-IN')}
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              ({fmtPct(d.percentage, 1)})
                            </span>
                          </p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {fmtPrice(d.revenue, 0)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Customers + Geographic */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Customers</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">By total spent & order count</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.topCustomers.length === 0 ? (
                <EmptyChartState
                  icon={Users}
                  title="No customer data yet"
                  subtitle="Top customers will appear here once orders come in"
                />
              ) : (
                <div className={SCROLLABLE_TABLE_WRAP}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Customer</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Orders</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Total Spent</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden md:table-cell">AOV</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden lg:table-cell">Last Order</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topCustomers.map((c, i) => (
                        <TableRow key={c.customerId ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell className="text-sm">
                            <p className="font-medium text-foreground truncate max-w-[160px]">{c.name}</p>
                            <p className="text-[11px] text-muted-foreground">{c.mobile}</p>
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{c.totalOrders}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {fmtPrice(c.totalSpent, 0)}
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground hidden md:table-cell">
                            {fmtPrice(c.avgOrderValue, 0)}
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground hidden lg:table-cell">
                            {c.lastOrderDate ? format(new Date(c.lastOrderDate), 'dd MMM yyyy') : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Geographic Distribution</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Customers, orders & revenue by state</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.geographicDistribution.length === 0 ? (
                <EmptyChartState
                  icon={BarChart3}
                  title="No geographic data"
                  subtitle="State-wise distribution will appear here once orders are placed"
                />
              ) : (
                <div className={SCROLLABLE_TABLE_WRAP}>
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">State</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Customers</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Orders</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.geographicDistribution.map((g, i) => (
                        <TableRow key={g.state ?? i} className={cn('hover:bg-muted/30', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                          <TableCell className="text-sm font-medium text-foreground">{g.state}</TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{g.customers}</TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{g.orders}</TableCell>
                          <TableCell className="text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {fmtPrice(g.revenue, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Analytics Component                                            */
/* ------------------------------------------------------------------ */

export default function SellerAnalytics() {
  const { authenticated, loading, logout } = useSellerAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/seller')
    }
  }, [authenticated, loading, router])

  // Authenticated fetch wrapper that handles 401/403 by logging out
  const sellerFetch = useCallback(
    async <T,>(url: string): Promise<T | null> => {
      try {
        const res = await fetch(url, { credentials: 'include' })
        if (res.status === 401 || res.status === 403) {
          await logout()
          router.replace('/seller')
          return null
        }
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`)
        }
        return (await res.json()) as T
      } catch (e) {
        // Re-throw so the per-tab handler can show an error UI
        throw e
      }
    },
    [logout, router],
  )

  if (loading || !authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Analytics
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Track your store performance and business insights
          </p>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="w-full">
          <div className="w-full overflow-x-auto pb-1">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="overview" className="flex-1 sm:flex-initial">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="sales" className="flex-1 sm:flex-initial">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Sales Report</span>
                <span className="sm:hidden">Sales</span>
              </TabsTrigger>
              <TabsTrigger value="products" className="flex-1 sm:flex-initial">
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Products</span>
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex-1 sm:flex-initial">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Customers</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab sellerFetch={sellerFetch} />
          </TabsContent>
          <TabsContent value="sales" className="mt-6">
            <SalesTab sellerFetch={sellerFetch} />
          </TabsContent>
          <TabsContent value="products" className="mt-6">
            <ProductsTab sellerFetch={sellerFetch} />
          </TabsContent>
          <TabsContent value="customers" className="mt-6">
            <CustomersTab sellerFetch={sellerFetch} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  )
}
