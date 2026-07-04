'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import {
  Wallet,
  Clock,
  TrendingUp,
  IndianRupee,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Package,
  CheckCircle2,
  Truck,
  Image as ImageIcon,
  ArrowUpRight,
  CalendarDays,
  Receipt,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useToast } from '@/hooks/use-toast'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface MonthlyBreakdown {
  month: string
  year: number
  monthNumber: number
  earnings: number
  itemsSold: number
  orderCount: number
}

interface OrderItem {
  name: string
  price: number
  effectivePrice: number
  quantity: number
  imageUrl: string
  brand: string
}

interface OrderBreakdown {
  _id: string
  orderNumber: string
  customerName: string
  status: string
  orderDate: string
  deliveredAt: string | null
  sellerEarnings: number
  items: OrderItem[]
}

interface EarningsData {
  totalEarnings: number
  pendingPayments: number
  monthlyBreakdown: MonthlyBreakdown[]
  orderBreakdown: OrderBreakdown[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

/* ------------------------------------------------------------------ */
/*  Status Configuration                                                */
/* ------------------------------------------------------------------ */

const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string; icon: typeof Clock }> = {
  delivered: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    label: 'Delivered',
    icon: CheckCircle2,
  },
  completed: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    label: 'Completed',
    icon: CheckCircle2,
  },
  shipped: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-400',
    dot: 'bg-purple-500',
    label: 'Shipped',
    icon: Truck,
  },
}

function getStatusConfig(status: string) {
  return statusConfig[status] || {
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    text: 'text-gray-700 dark:text-gray-400',
    dot: 'bg-gray-500',
    label: status.charAt(0).toUpperCase() + status.slice(1),
    icon: Clock,
  }
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
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
}

const cardExpandVariants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: 'auto', opacity: 1, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const } },
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loader                                                     */
/* ------------------------------------------------------------------ */

function EarningsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded-md" />
        </div>
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="h-80 bg-muted animate-pulse rounded-xl" />

      {/* Table skeleton */}
      <div className="h-64 bg-muted animate-pulse rounded-xl" />

      {/* Orders skeleton */}
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Summary Card Component                                              */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  icon: Icon,
  bgClass,
  textClass,
  gradientClass,
  sublabel,
}: {
  label: string
  value: string
  icon: typeof Wallet
  bgClass: string
  textClass: string
  gradientClass: string
  sublabel?: string
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
/*  Custom Chart Tooltip                                                */
/* ------------------------------------------------------------------ */

function EarningsTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
          {fmtPrice(payload[0].value, 0)}
        </p>
      </div>
    )
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Empty State Component                                               */
/* ------------------------------------------------------------------ */

function EmptyState({
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

/* ------------------------------------------------------------------ */
/*  Date formatting helpers                                              */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

/* ------------------------------------------------------------------ */
/*  Main Earnings Page Component                                        */
/* ------------------------------------------------------------------ */

export default function SellerEarnings() {
  const { authenticated, loading, logout } = useSellerAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [earningsData, setEarningsData] = useState<EarningsData | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  const itemsPerPage = 10

  /* ---------------------------------------------------------------- */
  /*  Auth guard                                                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!loading && !authenticated) router.replace('/seller')
  }, [authenticated, loading, router])

  /* ---------------------------------------------------------------- */
  /*  Fetch earnings data                                              */
  /* ---------------------------------------------------------------- */

  const fetchEarnings = useCallback(async () => {
    try {
      const res = await fetch(`/api/seller/earnings?page=${currentPage}&limit=${itemsPerPage}`)

      // Handle 401/403 — session expired or blocked
      if (res.status === 401 || res.status === 403) {
        await logout()
        router.replace('/seller')
        return
      }

      if (!res.ok) throw new Error('Failed to fetch earnings')
      const data = await res.json().catch(() => ({}))
      setEarningsData(data)
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load earnings data. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setPageLoading(false)
    }
  }, [currentPage, logout, router, toast])

  useEffect(() => {
    if (authenticated) {
      fetchEarnings()
    }
  }, [authenticated, fetchEarnings])

  /* ---------------------------------------------------------------- */
  /*  Toggle expand order                                              */
  /* ---------------------------------------------------------------- */

  const toggleExpand = useCallback((orderId: string) => {
    setExpandedOrder(prev => (prev === orderId ? null : orderId))
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Computed values                                                  */
  /* ---------------------------------------------------------------- */

  // Current month's revenue
  const currentMonthRevenue = useMemo(() => {
    if (!earningsData?.monthlyBreakdown) return 0
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const currentMonthData = earningsData.monthlyBreakdown.find(
      m => m.monthNumber === currentMonth && m.year === currentYear
    )
    return currentMonthData?.earnings ?? 0
  }, [earningsData])

  // Chart data for area chart
  const chartData = useMemo(() => {
    if (!earningsData?.monthlyBreakdown) return []
    return earningsData.monthlyBreakdown.map(m => ({
      month: m.month,
      earnings: m.earnings,
      label: `${m.month} ${m.year}`,
    }))
  }, [earningsData])

  const allEarningsZero = chartData.every(d => d.earnings === 0)

  // Monthly table data (only months with data, most recent first)
  const monthlyTableData = useMemo(() => {
    if (!earningsData?.monthlyBreakdown) return []
    return earningsData.monthlyBreakdown
      .filter(m => m.earnings > 0 || m.orderCount > 0 || m.itemsSold > 0)
      .reverse()
  }, [earningsData])

  /* ---------------------------------------------------------------- */
  /*  Loading states                                                   */
  /* ---------------------------------------------------------------- */

  if (loading || !authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (pageLoading) {
    return <EarningsSkeleton />
  }

  const totalEarnings = earningsData?.totalEarnings ?? 0
  const pendingPayments = earningsData?.pendingPayments ?? 0

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ──────────────────────── Header ──────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Earnings
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Track your revenue and payment history
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Last 12 months
          </span>
        </div>
      </motion.div>

      {/* ──────────────────────── Summary Cards ──────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <SummaryCard
          label="Total Earnings"
          value={fmtPrice(totalEarnings, 0)}
          icon={Wallet}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
          sublabel="From delivered orders"
        />
        <SummaryCard
          label="Pending Payments"
          value={fmtPrice(pendingPayments, 0)}
          icon={Clock}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-orange-400"
          sublabel="From shipped orders"
        />
        <SummaryCard
          label="This Month"
          value={fmtPrice(currentMonthRevenue, 0)}
          icon={TrendingUp}
          bgClass="bg-sky-50 dark:bg-sky-950/30"
          textClass="text-sky-600 dark:text-sky-400"
          gradientClass="bg-gradient-to-r from-sky-500 to-blue-400"
          sublabel={new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
        />
      </div>

      {/* ──────────────────────── Earnings Trend Chart ──────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Earnings Trend</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Monthly revenue from delivered orders
                </p>
              </div>
              {totalEarnings > 0 && (
                <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-3 w-3" />
                  <span>{fmtPrice(totalEarnings, 0)} total</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {allEarningsZero ? (
              <EmptyState
                icon={TrendingUp}
                title="No earnings data yet"
                subtitle="Revenue from delivered orders will appear here as your products sell"
              />
            ) : (
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="earningsAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="currentColor"
                      className="text-border"
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()}
                      className="text-muted-foreground"
                    />
                    <Tooltip content={<EarningsTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="earnings"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fill="url(#earningsAreaGradient)"
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

      {/* ──────────────────────── Monthly Earnings Table ──────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Monthly Earnings</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Revenue, orders & items sold by month
                </p>
              </div>
              {monthlyTableData.length > 0 && (
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                  {monthlyTableData.length} month{monthlyTableData.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {monthlyTableData.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No monthly data yet"
                subtitle="Monthly earnings data will appear here once orders are delivered"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold">Month</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Orders</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Items Sold</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyTableData.map((row, i) => (
                      <TableRow
                        key={`${row.month}-${row.year}`}
                        className={cn(
                          'hover:bg-muted/30',
                          i % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'
                        )}
                      >
                        <TableCell className="text-sm font-medium text-foreground">
                          {row.month} {row.year}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {row.orderCount}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {row.itemsSold}
                        </TableCell>
                        <TableCell className="text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {fmtPrice(row.earnings, 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="bg-muted/30 hover:bg-muted/40 border-t-2 border-border">
                      <TableCell className="text-sm font-bold text-foreground">Total</TableCell>
                      <TableCell className="text-sm text-right font-bold text-foreground">
                        {monthlyTableData.reduce((sum, r) => sum + r.orderCount, 0)}
                      </TableCell>
                      <TableCell className="text-sm text-right font-bold text-foreground">
                        {monthlyTableData.reduce((sum, r) => sum + r.itemsSold, 0)}
                      </TableCell>
                      <TableCell className="text-sm text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtPrice(monthlyTableData.reduce((sum, r) => sum + r.earnings, 0), 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ──────────────────────── Order-wise Breakdown ──────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Order-wise Breakdown</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Individual orders contributing to your earnings
                </p>
              </div>
              {earningsData?.pagination && (
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                  {earningsData.pagination.total} order{earningsData.pagination.total !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!earningsData?.orderBreakdown || earningsData.orderBreakdown.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No earnings from orders yet"
                subtitle="Orders that contribute to your earnings will appear here once delivered"
              />
            ) : (
              <div className="space-y-3">
                {earningsData.orderBreakdown.map((order) => {
                  const config = getStatusConfig(order.status)
                  const StatusIcon = config.icon
                  const isExpanded = expandedOrder === order._id

                  return (
                    <div
                      key={order._id}
                      className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow duration-200"
                    >
                      {/* Order Header Row */}
                      <div
                        className="px-4 sm:px-5 py-3.5 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => toggleExpand(order._id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          {/* Left: Order info */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={cn(
                              'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
                              config.bg
                            )}>
                              <StatusIcon className={cn('h-4 w-4', config.text)} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-foreground tracking-tight">
                                  {order.orderNumber || `#${order._id.slice(-8).toUpperCase()}`}
                                </span>
                                <span className={cn(
                                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                                  config.bg,
                                  config.text,
                                  order.status === 'delivered' || order.status === 'completed'
                                    ? 'border-emerald-200 dark:border-emerald-800'
                                    : 'border-purple-200 dark:border-purple-800'
                                )}>
                                  <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
                                  {config.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground truncate">
                                  {order.customerName}
                                </span>
                                <span className="text-muted-foreground/30 hidden sm:inline">·</span>
                                <span className="text-xs text-muted-foreground hidden sm:inline">
                                  {formatDate(order.orderDate)}
                                </span>
                                <span className="text-muted-foreground/30 hidden sm:inline">·</span>
                                <span className="text-xs text-muted-foreground hidden sm:inline">
                                  {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Right: Earnings + expand toggle */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right hidden sm:block">
                              <p className="text-sm font-bold text-foreground">
                                {fmtPrice(order.sellerEarnings, 0)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">Your earnings</p>
                            </div>
                            <div className={cn(
                              'h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                              isExpanded
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                                : 'bg-muted/50 text-muted-foreground'
                            )}>
                              {isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />
                              }
                            </div>
                          </div>
                        </div>

                        {/* Mobile earnings display */}
                        <div className="flex items-center justify-between mt-2 sm:hidden">
                          <span className="text-xs text-muted-foreground">
                            {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {formatDate(order.orderDate)}
                          </span>
                          <p className="text-sm font-bold text-foreground">
                            {fmtPrice(order.sellerEarnings, 0)}
                          </p>
                        </div>
                      </div>

                      {/* Expanded: Item breakdown */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            variants={cardExpandVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border" />
                            <div className="px-4 sm:px-5 py-4 bg-muted/20 space-y-3">
                              <div className="flex items-center gap-2">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground">
                                  Item breakdown
                                </span>
                              </div>

                              <div className="space-y-2">
                                {order.items.map((item, idx) => {
                                  const itemTotal = (item.effectivePrice || item.price) * item.quantity
                                  return (
                                    <div
                                      key={`${item.name}-${idx}`}
                                      className="flex items-center gap-3 bg-card rounded-lg border border-border p-3"
                                    >
                                      {/* Item image */}
                                      <div className="h-12 w-12 rounded-md overflow-hidden flex-shrink-0 bg-muted/50 border border-border">
                                        {item.imageUrl ? (
                                          <img
                                            src={item.imageUrl}
                                            alt={item.name}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="h-full w-full flex items-center justify-center">
                                            <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                                          </div>
                                        )}
                                      </div>

                                      {/* Item details */}
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-foreground line-clamp-1">
                                          {item.name}
                                        </p>
                                        {item.brand && (
                                          <p className="text-[10px] text-muted-foreground truncate">
                                            {item.brand}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-xs font-semibold text-foreground">
                                            {fmtPrice(item.effectivePrice || item.price)}
                                          </span>
                                          {item.effectivePrice && item.effectivePrice < item.price && (
                                            <span className="text-[10px] text-muted-foreground line-through">
                                              {fmtPrice(item.price)}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-muted-foreground">
                                            × {item.quantity}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Item total */}
                                      <div className="text-right flex-shrink-0">
                                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                          {fmtPrice(itemTotal, 0)}
                                        </p>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>

                              {/* Order total footer */}
                              <div className="flex items-center justify-between pt-2 border-t border-border">
                                <span className="text-xs font-medium text-muted-foreground">
                                  Order total ({order.items.length} item{order.items.length !== 1 ? 's' : ''})
                                </span>
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                  {fmtPrice(order.sellerEarnings, 0)}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}

                {/* ──────────────────────── Pagination ──────────────────────── */}
                {earningsData.pagination && earningsData.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Page {currentPage} of {earningsData.pagination.totalPages}
                      <span className="hidden sm:inline">
                        {' '}&middot; {earningsData.pagination.total} total orders
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className="h-8 px-2.5 gap-1 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Previous</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= earningsData.pagination.totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(earningsData.pagination.totalPages, prev + 1))}
                        className="h-8 px-2.5 gap-1 text-xs"
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
