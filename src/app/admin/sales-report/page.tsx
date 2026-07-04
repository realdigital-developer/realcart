'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  RefreshCw,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Calendar,
  Download,
  Wallet,
  Tag,
  Truck,
  Clock,
  Minus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GrowthMetric {
  current: number
  previous: number
  change: number
  growthRate: number
}

interface TrendPoint {
  date: string
  label: string
  revenue: number
  orders: number
  itemsSold: number
  avgOrderValue: number
  refundAmount: number
}

interface PaymentBreakdown {
  method: string
  revenue: number
  orders: number
  percentage: number
}

interface StatusBreakdown {
  status: string
  revenue: number
  orders: number
  percentage: number
}

interface HourlyPoint {
  hour: number
  orders: number
  revenue: number
}

interface WeekdayPoint {
  day: string
  orders: number
  revenue: number
}

interface SalesReport {
  range: { startDate: string; endDate: string }
  groupBy: 'day' | 'week' | 'month'
  summary: {
    grossRevenue: GrowthMetric
    netRevenue: GrowthMetric
    totalOrders: GrowthMetric
    itemsSold: GrowthMetric
    avgOrderValue: GrowthMetric
    refundAmount: GrowthMetric
    discountAmount: GrowthMetric
    deliveryFeeCollected: GrowthMetric
  }
  trend: TrendPoint[]
  breakdownByPayment: PaymentBreakdown[]
  breakdownByStatus: StatusBreakdown[]
  hourlyDistribution: HourlyPoint[]
  weekdayDistribution: WeekdayPoint[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const formatINR = (v: number): string => inrFormatter.format(v || 0)

function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultStartDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/** Map an arbitrary order-status string to a tailwind color tuple. */
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Pending: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  Processing: { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-500' },
  Shipped: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
  'Out for Delivery': { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  Out_for_Delivery: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  Delivered: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  Cancelled: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  'Not Delivered': { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  'Return Requested': { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-500' },
  'Return Approved': { bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', dot: 'bg-teal-500' },
  'Out for Pickup': { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
  'Return Completed': { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  Returned: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  Refunded: { bg: 'bg-pink-500/10', text: 'text-pink-600 dark:text-pink-400', dot: 'bg-pink-500' },
}

function getStatusStyle(status: string) {
  const normalized = status.replace(/\s+/g, '_')
  return (
    STATUS_COLORS[normalized] ||
    STATUS_COLORS[status] || {
      bg: 'bg-gray-500/10',
      text: 'text-gray-600 dark:text-gray-400',
      dot: 'bg-gray-500',
    }
  )
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

function formatGrowthBadge(rate: number): {
  color: string
  Icon: typeof TrendingUp
  label: string
} {
  if (rate > 0) {
    return {
      color: 'text-emerald-600 dark:text-emerald-400',
      Icon: TrendingUp,
      label: `+${rate.toFixed(1)}%`,
    }
  }
  if (rate < 0) {
    return {
      color: 'text-red-600 dark:text-red-400',
      Icon: TrendingDown,
      label: `${rate.toFixed(1)}%`,
    }
  }
  return {
    color: 'text-muted-foreground',
    Icon: Minus,
    label: '0.0%',
  }
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                 */
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
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' },
  },
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function SalesReportPage() {
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
        <SalesReportContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sales Report Content                                               */
/* ------------------------------------------------------------------ */

function SalesReportContent() {
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [startDate, setStartDate] = useState<string>(
    toDateInputValue(defaultStartDate()),
  )
  const [endDate, setEndDate] = useState<string>(toDateInputValue(new Date()))
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  const fetchReport = useCallback(async () => {
    try {
      setRefreshing(true)
      setError(null)
      const params = new URLSearchParams()
      params.set('startDate', new Date(startDate).toISOString())
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      params.set('endDate', end.toISOString())
      params.set('groupBy', groupBy)

      const res = await fetch(`/api/admin/analytics/sales?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch sales report')
      }
      const data = (await res.json().catch(() => ({}))) as SalesReport
      setReport(data)
    } catch (err) {
      console.error('Sales report fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load sales report')
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [startDate, endDate, groupBy])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  /* ── Chart data ── */
  const trendChartData = useMemo(() => {
    if (!report?.trend) return []
    return report.trend.map((p) => ({
      label: p.label,
      date: p.date,
      revenue: Math.round(p.revenue || 0),
      orders: p.orders || 0,
      itemsSold: p.itemsSold || 0,
      avgOrderValue: Math.round(p.avgOrderValue || 0),
      refundAmount: Math.round(p.refundAmount || 0),
    }))
  }, [report?.trend])

  const hourlyChartData = useMemo(() => {
    if (!report?.hourlyDistribution) return []
    return report.hourlyDistribution.map((p) => ({
      hour: p.hour,
      label: `${p.hour}:00`,
      orders: p.orders || 0,
      revenue: Math.round(p.revenue || 0),
    }))
  }, [report?.hourlyDistribution])

  const weekdayChartData = useMemo(() => {
    if (!report?.weekdayDistribution) return []
    return report.weekdayDistribution.map((p) => ({
      day: p.day,
      orders: p.orders || 0,
      revenue: Math.round(p.revenue || 0),
    }))
  }, [report?.weekdayDistribution])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams()
    params.set('type', 'sales')
    params.set('startDate', new Date(startDate).toISOString())
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    params.set('endDate', end.toISOString())
    params.set('groupBy', groupBy)
    return `/api/admin/analytics/export?${params.toString()}`
  }, [startDate, endDate, groupBy])

  /* ── Loading skeleton ── */
  if (loadingData) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-muted/30 rounded-lg animate-pulse" />
          </div>
          <div className="h-9 w-80 bg-muted/30 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-muted/30 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 bg-muted/30 rounded-xl animate-pulse" />
          <div className="h-72 bg-muted/30 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 bg-muted/30 rounded-xl animate-pulse" />
          <div className="h-72 bg-muted/30 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div className="text-center">
          <p className="text-sm font-medium">
            {error || 'Failed to load sales report'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Please try refreshing
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchReport}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    )
  }

  const s = report.summary

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-6"
    >
      {/* ── Page Header ── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Revenue trends, AOV, refunds &amp; payment breakdown for the selected period
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label htmlFor="sr-start" className="text-xs text-muted-foreground sr-only">
              Start date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="sr-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-8 h-9 text-xs bg-muted/50 border-0"
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">to</span>
          <div className="flex items-center gap-2">
            <Label htmlFor="sr-end" className="text-xs text-muted-foreground sr-only">
              End date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="sr-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-8 h-9 text-xs bg-muted/50 border-0"
              />
            </div>
          </div>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'week' | 'month')}>
            <SelectTrigger className="h-9 w-28 text-xs bg-muted/50 border-0">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchReport}
            disabled={refreshing}
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
              refreshing && 'animate-spin',
            )}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
          <Button asChild variant="outline" size="sm" className="h-9">
            <a href={exportHref}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </a>
          </Button>
        </div>
      </motion.div>

      {/* ── Summary KPI Cards ── */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <KpiCard
          title="Gross Revenue"
          metric={s.grossRevenue}
          formatValue={formatINR}
          icon={IndianRupee}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
        />
        <KpiCard
          title="Net Revenue"
          metric={s.netRevenue}
          formatValue={formatINR}
          icon={Wallet}
          iconBg="bg-teal-500/10"
          iconColor="text-teal-600 dark:text-teal-400"
          accentBar="bg-teal-500"
        />
        <KpiCard
          title="Total Orders"
          metric={s.totalOrders}
          formatValue={(v) => (v || 0).toLocaleString('en-IN')}
          icon={ShoppingCart}
          iconBg="bg-sky-500/10"
          iconColor="text-sky-600 dark:text-sky-400"
          accentBar="bg-sky-500"
        />
        <KpiCard
          title="Items Sold"
          metric={s.itemsSold}
          formatValue={(v) => (v || 0).toLocaleString('en-IN')}
          icon={Package}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-600 dark:text-blue-400"
          accentBar="bg-blue-500"
        />
        <KpiCard
          title="Avg Order Value"
          metric={s.avgOrderValue}
          formatValue={formatINR}
          icon={TrendingUp}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
        />
        <KpiCard
          title="Refund Amount"
          metric={s.refundAmount}
          formatValue={formatINR}
          icon={TrendingDown}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600 dark:text-amber-400"
          accentBar="bg-amber-500"
          invertGrowth
        />
        <KpiCard
          title="Discount"
          metric={s.discountAmount}
          formatValue={formatINR}
          icon={Tag}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-600 dark:text-rose-400"
          accentBar="bg-rose-500"
          invertGrowth
        />
        <KpiCard
          title="Delivery Fee Collected"
          metric={s.deliveryFeeCollected}
          formatValue={formatINR}
          icon={Truck}
          iconBg="bg-cyan-500/10"
          iconColor="text-cyan-600 dark:text-cyan-400"
          accentBar="bg-cyan-500"
        />
      </motion.div>

      {/* ── Revenue & Orders Trend (dual Y-axis AreaChart) ── */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10">
                <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">
                  Revenue &amp; Orders Trend
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Grouped by {groupBy} · Left axis = revenue, right axis = orders
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            {trendChartData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trendChartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="srRevGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="srOrdGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      opacity={0.3}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<TrendTooltip />} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#srRevGradient)"
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="orders"
                      name="Orders"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#srOrdGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
                No trend data available for this period
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Hourly & Weekday Distribution ── */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        {/* Hourly Distribution */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-sky-500/10">
                  <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Orders by Hour of Day
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hourly order volume across the selected period
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {hourlyChartData.length > 0 ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={hourlyChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="srHourGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        opacity={0.3}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis
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
                          name === 'revenue'
                            ? formatINR(value)
                            : (value || 0).toLocaleString('en-IN'),
                          name === 'revenue' ? 'Revenue' : 'Orders',
                        ]}
                        labelFormatter={(label: string) => `Hour ${label}`}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="url(#srHourGradient)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                  No hourly distribution data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Weekday Distribution */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10">
                  <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Revenue by Day of Week
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Revenue performance across each weekday
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {weekdayChartData.length > 0 ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weekdayChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="srWeekGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        opacity={0.3}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                        }
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
                          name === 'revenue'
                            ? formatINR(value)
                            : (value || 0).toLocaleString('en-IN'),
                          name === 'revenue' ? 'Revenue' : 'Orders',
                        ]}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="url(#srWeekGradient)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                  No weekday distribution data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ── Payment Method & Order Status Breakdowns ── */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        {/* Payment Method Breakdown */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-sky-500/10">
                  <CreditCard className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Payment Method Breakdown
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Revenue, orders &amp; share by payment method
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {report.breakdownByPayment.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-6">
                        Method
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Orders
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Revenue
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">
                        Share
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.breakdownByPayment.map((p, idx) => (
                      <TableRow
                        key={`${p.method}-${idx}`}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <TableCell className="pl-6">
                          <Badge
                            variant="outline"
                            className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-0 font-medium"
                          >
                            {p.method || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-right">
                          {(p.orders || 0).toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-sm font-semibold tabular-nums text-right text-emerald-600 dark:text-emerald-400">
                          {formatINR(p.revenue)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-right pr-6 text-muted-foreground">
                          {(p.percentage || 0).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                  <CreditCard className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No payment method data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Order Status Breakdown */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
                  <ShoppingCart className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Order Status Breakdown
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Revenue, orders &amp; share by order status
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {report.breakdownByStatus.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-6">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Orders
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Revenue
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">
                        Share
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.breakdownByStatus.map((p, idx) => {
                      const style = getStatusStyle(p.status)
                      return (
                        <TableRow
                          key={`${p.status}-${idx}`}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <TableCell className="pl-6">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
                                style.bg,
                                style.text,
                              )}
                            >
                              <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
                              {formatStatusLabel(p.status)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-right">
                            {(p.orders || 0).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-sm font-semibold tabular-nums text-right">
                            {formatINR(p.revenue)}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-right pr-6 text-muted-foreground">
                            {(p.percentage || 0).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No order status data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  KPI Card with Growth Badge                                         */
/* ------------------------------------------------------------------ */

function KpiCard({
  title,
  metric,
  formatValue,
  icon: Icon,
  iconBg,
  iconColor,
  accentBar,
  invertGrowth = false,
}: {
  title: string
  metric: GrowthMetric
  formatValue: (v: number) => string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  accentBar: string
  /** When true, growth is "good" if rate < 0 (e.g. refunds, discounts). */
  invertGrowth?: boolean
}) {
  const rate = metric?.growthRate || 0
  const effectiveRate = invertGrowth ? -rate : rate
  const { color, Icon: TrendIcon, label } = formatGrowthBadge(effectiveRate)

  return (
    <motion.div variants={itemVariants}>
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden relative">
        <div className={cn('absolute top-0 left-0 right-0 h-0.5', accentBar)} />
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{title}</p>
              <p className="text-lg font-bold tracking-tight mt-1 truncate">
                {formatValue(metric?.current || 0)}
              </p>
              <div className={cn('flex items-center gap-1 mt-1.5 text-[11px] font-medium', color)}>
                <TrendIcon className="h-3 w-3" />
                <span>{label}</span>
                <span className="text-muted-foreground font-normal">vs prev</span>
              </div>
            </div>
            <div
              className={cn(
                'flex items-center justify-center h-9 w-9 rounded-lg shrink-0',
                iconBg,
              )}
            >
              <Icon className={cn('h-4 w-4', iconColor)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Custom Trend Tooltip                                               */
/* ------------------------------------------------------------------ */

interface TrendTooltipPayloadEntry {
  payload: {
    label: string
    date: string
    revenue: number
    orders: number
    itemsSold: number
    avgOrderValue: number
    refundAmount: number
  }
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TrendTooltipPayloadEntry[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-xs space-y-1">
      <p className="font-semibold text-foreground">{data.label}</p>
      <p className="text-muted-foreground">{data.date}</p>
      <div className="pt-1 space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Revenue
          </span>
          <span className="font-semibold tabular-nums">{formatINR(data.revenue)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Orders
          </span>
          <span className="font-semibold tabular-nums">
            {(data.orders || 0).toLocaleString('en-IN')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">AOV</span>
          <span className="font-semibold tabular-nums">{formatINR(data.avgOrderValue)}</span>
        </div>
        {data.refundAmount > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Refunds</span>
            <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {formatINR(data.refundAmount)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
