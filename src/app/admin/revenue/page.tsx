'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  ShoppingCart,
  RefreshCw,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Store,
  Calendar,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyBreakdown {
  month: string
  revenue: number
  commission: number
  orders: number
}

interface SellerBreakdown {
  sellerId: string
  sellerName: string
  storeName: string
  orderCount: number
  grossSales: number
  commission: number
  netPayout: number
}

interface RevenueReport {
  period: { start: string; end: string }
  grossOrderValue: number
  totalTaxableValue: number
  totalGst: number
  totalCgst: number
  totalSgst: number
  totalIgst: number
  totalCess: number
  totalCommission: number
  totalGstOnCommission: number
  totalDeliveryFees: number
  totalGstOnDelivery: number
  totalCodFee: number
  totalPlatformFee: number
  totalTds: number
  totalTcs: number
  totalSellerEarnings: number
  totalRefunds: number
  refundCount: number
  platformRevenue: number
  platformExpenses: number
  platformProfit: number
  totalOrders: number
  deliveredOrders: number
  cancelledOrders: number
  returnedOrders: number
  codOrders: number
  codRevenue: number
  onlineOrders: number
  onlineRevenue: number
  monthlyBreakdown: MonthlyBreakdown[]
  sellerWiseBreakdown: SellerBreakdown[]
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

/** Format a Date as yyyy-mm-dd for <input type="date"> */
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

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                 */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function RevenuePage() {
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
        <RevenueContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Revenue Content                                                    */
/* ------------------------------------------------------------------ */

function RevenueContent() {
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [startDate, setStartDate] = useState<string>(
    toDateInputValue(defaultStartDate()),
  )
  const [endDate, setEndDate] = useState<string>(toDateInputValue(new Date()))

  const fetchReport = useCallback(async () => {
    try {
      setRefreshing(true)
      setError(null)
      const params = new URLSearchParams()
      params.set('startDate', new Date(startDate).toISOString())
      // End date inclusive: set to end of day
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      params.set('endDate', end.toISOString())

      const res = await fetch(`/api/admin/finance/revenue?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch revenue report')
      }
      const data = (await res.json()) as RevenueReport
      setReport(data)
    } catch (err) {
      console.error('Revenue fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load revenue report')
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchReport()
  }, [startDate, endDate])

  /* ── Chart data ── */
  const monthlyChartData = useMemo(() => {
    if (!report?.monthlyBreakdown) return []
    return report.monthlyBreakdown.map((item) => ({
      name: item.month,
      revenue: Math.round(item.revenue),
      commission: Math.round(item.commission),
      orders: item.orders,
    }))
  }, [report?.monthlyBreakdown])

  const paymentMethodChartData = useMemo(() => {
    if (!report) return []
    return [
      {
        name: 'COD',
        revenue: Math.round(report.codRevenue || 0),
        orders: report.codOrders || 0,
      },
      {
        name: 'Online',
        revenue: Math.round(report.onlineRevenue || 0),
        orders: report.onlineOrders || 0,
      },
    ]
  }, [report])

  const topSellers = useMemo(() => {
    if (!report?.sellerWiseBreakdown) return []
    return [...report.sellerWiseBreakdown]
      .sort((a, b) => (b.grossSales || 0) - (a.grossSales || 0))
      .slice(0, 10)
  }, [report?.sellerWiseBreakdown])

  /* ── Loading skeleton ── */
  if (loadingData) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-muted/30 rounded-lg animate-pulse" />
          </div>
          <div className="h-9 w-72 bg-muted/30 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-muted/30 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div className="text-center">
          <p className="text-sm font-medium">{error || 'Failed to load revenue report'}</p>
          <p className="text-xs text-muted-foreground mt-1">Please try refreshing</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchReport}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* ── Page Header ── */}
      <motion.div
        variants={fadeInUp}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revenue Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gross sales, platform earnings, GST collected &amp; seller payouts
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label htmlFor="rev-start" className="text-xs text-muted-foreground sr-only">
              Start date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="rev-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-8 h-9 text-xs bg-muted/50 border-0"
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">to</span>
          <div className="flex items-center gap-2">
            <Label htmlFor="rev-end" className="text-xs text-muted-foreground sr-only">
              End date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="rev-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-8 h-9 text-xs bg-muted/50 border-0"
              />
            </div>
          </div>
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
        </div>
      </motion.div>

      {/* ── Summary Stat Cards ── */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
      >
        <StatCard
          title="Gross Revenue"
          value={formatINR(report.grossOrderValue)}
          icon={IndianRupee}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
        />
        <StatCard
          title="Platform Revenue"
          value={formatINR(report.platformRevenue)}
          icon={TrendingUp}
          iconBg="bg-teal-500/10"
          iconColor="text-teal-600 dark:text-teal-400"
          accentBar="bg-teal-500"
          subtitle="Commission + fees"
        />
        <StatCard
          title="GST Collected"
          value={formatINR(report.totalGst)}
          icon={Receipt}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600 dark:text-amber-400"
          accentBar="bg-amber-500"
        />
        <StatCard
          title="Total Refunds"
          value={formatINR(report.totalRefunds)}
          icon={TrendingDown}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-600 dark:text-rose-400"
          accentBar="bg-rose-500"
          subtitle={`${report.refundCount} refunds`}
        />
        <StatCard
          title="Platform Profit"
          value={formatINR(report.platformProfit)}
          icon={Wallet}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
        />
        <StatCard
          title="Total Orders"
          value={(report.totalOrders || 0).toLocaleString('en-IN')}
          icon={ShoppingCart}
          iconBg="bg-sky-500/10"
          iconColor="text-sky-600 dark:text-sky-400"
          accentBar="bg-sky-500"
          subtitle={`${report.deliveredOrders} delivered`}
        />
      </motion.div>

      {/* ── Charts: Monthly Revenue + Payment Method ── */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Monthly Revenue Area Chart */}
        <motion.div variants={fadeInUp} className="lg:col-span-2">
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10">
                  <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Revenue Trend
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Monthly revenue &amp; commission for selected period
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              {monthlyChartData.length > 0 ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={monthlyChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="commGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
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
                          formatCurrency(value, 0),
                          name === 'revenue' ? 'Revenue' : 'Commission',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#revGradient)"
                      />
                      <Area
                        type="monotone"
                        dataKey="commission"
                        stroke="#14b8a6"
                        strokeWidth={2}
                        fill="url(#commGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                  No revenue trend data available for this period
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Payment Method Bar Chart */}
        <motion.div variants={fadeInUp}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-sky-500/10">
                  <CreditCard className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Revenue by Payment Method
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    COD vs Online payments
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={paymentMethodChartData}
                    margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="pmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      opacity={0.3}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
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
                      formatter={(value: number) => [formatCurrency(value, 0), 'Revenue']}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="url(#pmGradient)"
                      radius={[6, 6, 0, 0]}
                      barSize={64}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    COD Orders
                  </p>
                  <p className="text-sm font-semibold mt-0.5">
                    {(report.codOrders || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Online Orders
                  </p>
                  <p className="text-sm font-semibold mt-0.5">
                    {(report.onlineOrders || 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ── Two-Column: Order Status Summary + Seller Breakdown ── */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Order Status Summary */}
        <motion.div variants={fadeInUp}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
                  <ShoppingCart className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Order Status Summary
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Counts for selected period
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <StatusRow
                  label="Total Orders"
                  count={report.totalOrders}
                  color="bg-sky-500"
                  textColor="text-sky-600 dark:text-sky-400"
                />
                <StatusRow
                  label="Delivered"
                  count={report.deliveredOrders}
                  color="bg-emerald-500"
                  textColor="text-emerald-600 dark:text-emerald-400"
                />
                <StatusRow
                  label="Cancelled"
                  count={report.cancelledOrders}
                  color="bg-red-500"
                  textColor="text-red-600 dark:text-red-400"
                />
                <StatusRow
                  label="Returned"
                  count={report.returnedOrders}
                  color="bg-rose-500"
                  textColor="text-rose-600 dark:text-rose-400"
                />
              </div>

              <div className="mt-4 pt-4 border-t border-border/40 space-y-2">
                <MetricRow label="Taxable Value" value={formatCurrency(report.totalTaxableValue, 0)} />
                <MetricRow label="Total GST" value={formatCurrency(report.totalGst, 0)} />
                <MetricRow label="Commission" value={formatCurrency(report.totalCommission, 0)} />
                <MetricRow label="GST on Commission" value={formatCurrency(report.totalGstOnCommission, 0)} />
                <MetricRow label="Delivery Fees" value={formatCurrency(report.totalDeliveryFees, 0)} />
                <MetricRow label="COD Fee" value={formatCurrency(report.totalCodFee, 0)} />
                <MetricRow label="Platform Fee" value={formatCurrency(report.totalPlatformFee, 0)} />
                <MetricRow label="TDS Deducted" value={formatCurrency(report.totalTds, 0)} />
                <MetricRow label="TCS Collected" value={formatCurrency(report.totalTcs, 0)} />
                <MetricRow label="Seller Earnings" value={formatCurrency(report.totalSellerEarnings, 0)} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Seller-wise Breakdown */}
        <motion.div variants={fadeInUp} className="lg:col-span-2">
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-rose-500/10">
                    <Store className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      Top Sellers by Gross Sales
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Top 10 sellers for selected period
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] bg-muted/40 border-0">
                  {topSellers.length} sellers
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {topSellers.length > 0 ? (
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Seller
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          Orders
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          Gross Sales
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          Commission
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">
                          Net Payout
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topSellers.map((seller, idx) => (
                        <TableRow
                          key={`${seller.sellerId}-${idx}`}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <TableCell>
                            <p className="text-sm font-medium truncate max-w-[200px]">
                              {seller.storeName || seller.sellerName || 'Unknown'}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                              {seller.sellerName || '\u2014'}
                            </p>
                          </TableCell>
                          <TableCell className="text-sm font-medium tabular-nums text-right">
                            {seller.orderCount.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-sm font-semibold tabular-nums text-right">
                            {formatCurrency(seller.grossSales, 0)}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-right text-muted-foreground">
                            {formatCurrency(seller.commission, 0)}
                          </TableCell>
                          <TableCell className="text-sm font-semibold tabular-nums text-right pr-6 text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(seller.netPayout, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                  <Store className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No seller data available for this period</p>
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
/*  Stat Card Component                                                */
/* ------------------------------------------------------------------ */

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  iconBg,
  iconColor,
  accentBar,
}: {
  title: string
  value: string
  icon: React.ElementType
  subtitle?: string
  iconBg: string
  iconColor: string
  accentBar: string
}) {
  return (
    <motion.div variants={fadeInUp}>
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden relative">
        <div className={cn('absolute top-0 left-0 right-0 h-0.5', accentBar)} />
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{title}</p>
              <p className="text-lg font-bold tracking-tight mt-1 truncate">
                {value}
              </p>
              {subtitle && (
                <p className="text-[10px] text-muted-foreground mt-1 truncate">
                  {subtitle}
                </p>
              )}
            </div>
            <div
              className={cn(
                'flex items-center justify-center h-9 w-9 rounded-lg shrink-0',
                iconBg,
              )}
            >
              <Icon className={cn('h-4.5 w-4.5', iconColor)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Status Row (for Order Status Summary)                              */
/* ------------------------------------------------------------------ */

function StatusRow({
  label,
  count,
  color,
  textColor,
}: {
  label: string
  count: number
  color: string
  textColor: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', color)} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className={cn('text-sm font-semibold tabular-nums', textColor)}>
        {count.toLocaleString('en-IN')}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Metric Row                                                         */
/* ------------------------------------------------------------------ */

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </div>
  )
}
