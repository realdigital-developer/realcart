'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Target,
  RefreshCw,
  AlertTriangle,
  Calendar,
  ShoppingCart,
  CreditCard,
  CheckCircle2,
  TrendingDown,
  ArrowRight,
  BarChart3,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types (mirrors ConversionReport from analytics-engine.ts)          */
/* ------------------------------------------------------------------ */

interface FunnelStage {
  stage: string
  label: string
  count: number
  /** Conversion rate from the previous stage (0-100) */
  stepRate: number
  /** Conversion rate from the first stage (0-100) */
  overallRate: number
}

interface CheckoutAbandonment {
  cartStarted: number
  checkoutStarted: number
  paymentInitiated: number
  orderCompleted: number
  cartAbandonmentRate: number
  checkoutAbandonmentRate: number
  paymentAbandonmentRate: number
}

interface TimeSeriesPoint {
  date: string
  label: string
  value: number
  secondaryValue?: number
}

interface ConversionBySource {
  source: string
  visits: number
  orders: number
  conversionRate: number
}

interface ConversionReport {
  range: { startDate: string; endDate: string }
  funnel: FunnelStage[]
  checkoutAbandonment: CheckoutAbandonment
  conversionByDay: TimeSeriesPoint[]
  conversionBySource: ConversionBySource[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format a Date as yyyy-mm-dd for <input type="date"> */
function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultStartDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
}

const formatNumber = (v: number): string =>
  (v || 0).toLocaleString('en-IN')

const formatPercent = (v: number, digits = 2): string =>
  `${(v || 0).toFixed(digits)}%`

/** Descending palette for the 6 funnel stages */
const FUNNEL_COLORS = [
  { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', soft: 'bg-emerald-500/10' },
  { bar: 'bg-teal-500', text: 'text-teal-600 dark:text-teal-400', soft: 'bg-teal-500/10' },
  { bar: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', soft: 'bg-blue-500/10' },
  { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', soft: 'bg-amber-500/10' },
  { bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', soft: 'bg-orange-500/10' },
  { bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', soft: 'bg-rose-500/10' },
]

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

export default function ConversionsPage() {
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
        <ConversionsContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Conversions Content                                                */
/* ------------------------------------------------------------------ */

function ConversionsContent() {
  const [report, setReport] = useState<ConversionReport | null>(null)
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
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      params.set('endDate', end.toISOString())

      const res = await fetch(
        `/api/admin/analytics/conversions?${params.toString()}`,
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch conversion report')
      }
      const data = (await res.json().catch(() => ({}))) as ConversionReport
      setReport(data)
    } catch (err) {
      console.error('Conversions fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load conversion report')
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  /* ── Chart data ── */
  const trendChartData = useMemo(() => {
    if (!report?.conversionByDay) return []
    return report.conversionByDay.map((p) => ({
      label: p.label,
      value: p.value,
      secondaryValue: p.secondaryValue ?? 0,
      date: p.date,
    }))
  }, [report?.conversionByDay])

  const isEmpty = useMemo(() => {
    if (!report?.funnel || report.funnel.length === 0) return true
    return (report.funnel[0]?.count || 0) === 0
  }, [report?.funnel])

  /* ── Loading skeleton ── */
  if (loadingData) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-4 w-72 bg-muted/30 rounded-lg animate-pulse" />
          </div>
          <div className="h-9 w-72 bg-muted/30 rounded-lg animate-pulse" />
        </div>
        <div className="h-80 bg-muted/30 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
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
          <p className="text-sm font-medium">
            {error || 'Failed to load conversion report'}
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Conversion Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track how visitors move through your funnel from visit to purchase
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label
              htmlFor="conv-start"
              className="text-xs text-muted-foreground sr-only"
            >
              Start date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="conv-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-8 h-9 text-xs bg-muted/50 border-0"
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">to</span>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="conv-end"
              className="text-xs text-muted-foreground sr-only"
            >
              End date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="conv-end"
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

      {isEmpty ? (
        <motion.div variants={fadeInUp}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardContent className="py-20 flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/10">
                <Target className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold">
                  No conversion data yet
                </p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Install tracking to see how visitors move through your funnel.
                  Page views, product views, cart additions and checkout events
                  will appear here once analytics events are recorded.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* ── Conversion Funnel ── */}
          <motion.div variants={fadeInUp}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10">
                    <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      Conversion Funnel
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Visitor journey from site visit to order placement
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.funnel.map((stage, idx) => {
                  const palette = FUNNEL_COLORS[idx] || FUNNEL_COLORS[0]
                  const widthPct = Math.max(0, Math.min(100, stage.overallRate))
                  return (
                    <div
                      key={stage.stage}
                      className="rounded-xl border border-border/40 bg-background/40 p-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              'flex items-center justify-center h-7 w-7 rounded-lg text-xs font-bold shrink-0',
                              palette.soft,
                              palette.text,
                            )}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {stage.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatNumber(stage.count)} users
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4 text-right">
                          {idx > 0 ? (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Step Rate
                              </p>
                              <p
                                className={cn(
                                  'text-sm font-semibold tabular-nums',
                                  stage.stepRate >= 50
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : stage.stepRate >= 20
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-rose-600 dark:text-rose-400',
                                )}
                              >
                                {formatPercent(stage.stepRate)}
                              </p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Step Rate
                              </p>
                              <p className="text-sm font-semibold tabular-nums text-muted-foreground">
                                &mdash;
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Overall
                            </p>
                            <p
                              className={cn(
                                'text-sm font-semibold tabular-nums',
                                palette.text,
                              )}
                            >
                              {formatPercent(stage.overallRate)}
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Progress bar — width = overallRate% */}
                      <div className="relative h-2.5 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className={cn(
                            'absolute top-0 left-0 h-full rounded-full transition-all',
                            palette.bar,
                          )}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}

                {/* Overall summary footer */}
                <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium">
                      Overall Visit-to-Order Conversion
                    </span>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatPercent(report.funnel[report.funnel.length - 1]?.overallRate || 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Abandonment KPI Cards ── */}
          <motion.div
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <AbandonmentCard
              title="Cart Abandonment Rate"
              value={report.checkoutAbandonment.cartAbandonmentRate}
              started={report.checkoutAbandonment.cartStarted}
              completed={report.checkoutAbandonment.checkoutStarted}
              icon={ShoppingCart}
              description="Visitors who added items to cart but did not start checkout"
              accent="bg-rose-500"
              iconBg="bg-rose-500/10"
              iconColor="text-rose-600 dark:text-rose-400"
            />
            <AbandonmentCard
              title="Checkout Abandonment Rate"
              value={report.checkoutAbandonment.checkoutAbandonmentRate}
              started={report.checkoutAbandonment.checkoutStarted}
              completed={report.checkoutAbandonment.paymentInitiated}
              icon={CreditCard}
              description="Visitors who started checkout but did not initiate payment"
              accent="bg-orange-500"
              iconBg="bg-orange-500/10"
              iconColor="text-orange-600 dark:text-orange-400"
            />
            <AbandonmentCard
              title="Payment Abandonment Rate"
              value={report.checkoutAbandonment.paymentAbandonmentRate}
              started={report.checkoutAbandonment.paymentInitiated}
              completed={report.checkoutAbandonment.orderCompleted}
              icon={CheckCircle2}
              description="Visitors who initiated payment but did not complete the order"
              accent="bg-amber-500"
              iconBg="bg-amber-500/10"
              iconColor="text-amber-600 dark:text-amber-400"
            />
          </motion.div>

          {/* ── Conversion Rate Trend ── */}
          <motion.div variants={fadeInUp}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10">
                    <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      Conversion Rate Trend
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Daily visit-to-order conversion percentage
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                {trendChartData.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trendChartData}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="convGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#10b981"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="#10b981"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border))"
                          opacity={0.3}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{
                            fontSize: 11,
                            fill: 'hsl(var(--muted-foreground))',
                          }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{
                            fontSize: 11,
                            fill: 'hsl(var(--muted-foreground))',
                          }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => `${v}%`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          }}
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) {
                              return null
                            }
                            const p = payload[0].payload as {
                              date: string
                              label: string
                              value: number
                              secondaryValue: number
                            }
                            return (
                              <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs space-y-1">
                                <p className="font-medium">{p.label}</p>
                                <p className="text-emerald-600 dark:text-emerald-400">
                                  Conversion rate:{' '}
                                  <span className="font-semibold tabular-nums">
                                    {formatPercent(p.value)}
                                  </span>
                                </p>
                                <p className="text-muted-foreground">
                                  Orders:{' '}
                                  <span className="font-semibold tabular-nums">
                                    {formatNumber(p.secondaryValue)}
                                  </span>
                                </p>
                              </div>
                            )
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#10b981"
                          strokeWidth={2}
                          fill="url(#convGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                    No conversion trend data available for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Conversion by Source ── */}
          <motion.div variants={fadeInUp}>
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-teal-500/10">
                    <ArrowRight className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      Conversion by Traffic Source
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Top referrers ranked by visits and orders
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                {report.conversionBySource && report.conversionBySource.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Source
                          </TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                            Visits
                          </TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                            Orders
                          </TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">
                            Conversion Rate
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.conversionBySource.map((src, idx) => {
                          const rate = src.conversionRate || 0
                          const rateColor =
                            rate > 2
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : rate >= 1
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                          return (
                            <TableRow
                              key={`${src.source}-${idx}`}
                              className="hover:bg-muted/20 transition-colors"
                            >
                              <TableCell>
                                <p className="text-sm font-medium truncate max-w-[260px]">
                                  {src.source || 'Direct / Unknown'}
                                </p>
                              </TableCell>
                              <TableCell className="text-sm font-medium tabular-nums text-right">
                                {formatNumber(src.visits)}
                              </TableCell>
                              <TableCell className="text-sm font-semibold tabular-nums text-right">
                                {formatNumber(src.orders)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'text-sm font-semibold tabular-nums text-right pr-6',
                                  rateColor,
                                )}
                              >
                                {formatPercent(rate)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                    <ArrowRight className="h-8 w-8 opacity-40" />
                    <p className="text-sm">
                      No traffic source data available for this period
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Abandonment KPI Card                                               */
/* ------------------------------------------------------------------ */

function AbandonmentCard({
  title,
  value,
  started,
  completed,
  description,
  icon: Icon,
  accent,
  iconBg,
  iconColor,
}: {
  title: string
  value: number
  started: number
  completed: number
  description: string
  icon: React.ElementType
  accent: string
  iconBg: string
  iconColor: string
}) {
  return (
    <motion.div variants={fadeInUp}>
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden relative">
        <div className={cn('absolute top-0 left-0 right-0 h-0.5', accent)} />
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {title}
              </p>
              <p className="text-2xl font-bold tracking-tight mt-1 tabular-nums text-rose-600 dark:text-rose-400">
                {formatPercent(value)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                {description}
              </p>
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
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Started</span>
            <span className="font-semibold tabular-nums">
              {formatNumber(started)}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Completed</span>
            <span className="font-semibold tabular-nums">
              {formatNumber(completed)}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
