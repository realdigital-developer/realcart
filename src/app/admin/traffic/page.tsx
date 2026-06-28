'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Eye,
  Users,
  MonitorSmartphone,
  Clock,
  MousePointerClick,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  BarChart3,
  Calendar,
  Smartphone,
  Tablet,
  Monitor,
  Globe,
  FileText,
  Activity,
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

interface TimeSeriesPoint {
  date: string
  label: string
  value: number
  secondaryValue?: number
}

interface TopPage {
  path: string
  title: string
  views: number
  uniqueVisitors: number
  avgTimeOnPage: number
}

interface TrafficSource {
  source: string
  sessions: number
  percentage: number
}

interface DeviceBreakdown {
  device: string
  sessions: number
  percentage: number
}

interface TrafficReport {
  range: { startDate: string; endDate: string }
  summary: {
    totalPageViews: GrowthMetric
    uniqueVisitors: GrowthMetric
    totalSessions: GrowthMetric
    avgSessionDuration: number
    bounceRate: number
    pagesPerSession: number
  }
  viewsByDay: TimeSeriesPoint[]
  visitorsByDay: TimeSeriesPoint[]
  topPages: TopPage[]
  trafficSources: TrafficSource[]
  deviceBreakdown: DeviceBreakdown[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultStartDate(): Date {
  const now = new Date()
  // last 30 days
  return new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
}

/** Format seconds into a human-readable duration string. */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return `${m}m ${rem}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function formatNumber(v: number): string {
  return (v || 0).toLocaleString('en-IN')
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

/** Pick a colour for a given device type. */
const DEVICE_COLORS: Record<string, string> = {
  desktop: '#10b981',
  Desktop: '#10b981',
  mobile: '#3b82f6',
  Mobile: '#3b82f6',
  tablet: '#f59e0b',
  Tablet: '#f59e0b',
}

function getDeviceColor(device: string): string {
  return DEVICE_COLORS[device] || '#94a3b8'
}

function getDeviceIcon(device: string): typeof Monitor {
  const d = device.toLowerCase()
  if (d === 'mobile') return Smartphone
  if (d === 'tablet') return Tablet
  if (d === 'desktop') return Monitor
  return MonitorSmartphone
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

export default function TrafficPage() {
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
        <TrafficContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Traffic Content                                                    */
/* ------------------------------------------------------------------ */

function TrafficContent() {
  const [report, setReport] = useState<TrafficReport | null>(null)
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

      const res = await fetch(`/api/admin/analytics/traffic?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch traffic report')
      }
      const data = (await res.json()) as TrafficReport
      setReport(data)
    } catch (err) {
      console.error('Traffic report fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load traffic report')
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  /* ── Chart data ── */
  const viewsChartData = useMemo(() => {
    if (!report?.viewsByDay) return []
    return report.viewsByDay.map((p) => ({
      label: p.label,
      date: p.date,
      pageViews: p.value || 0,
      visitors: p.secondaryValue ?? 0,
    }))
  }, [report?.viewsByDay])

  const sourceChartData = useMemo(() => {
    if (!report?.trafficSources) return []
    return report.trafficSources.map((s) => ({
      source: s.source,
      sessions: s.sessions || 0,
      percentage: s.percentage || 0,
    }))
  }, [report?.trafficSources])

  const deviceChartData = useMemo(() => {
    if (!report?.deviceBreakdown) return []
    return report.deviceBreakdown.map((d) => ({
      name: d.device,
      value: d.sessions || 0,
      percentage: d.percentage || 0,
      color: getDeviceColor(d.device),
    }))
  }, [report?.deviceBreakdown])

  const hasData = useMemo(() => {
    if (!report) return false
    const totalViews = report.summary?.totalPageViews?.current || 0
    const totalSessions = report.summary?.totalSessions?.current || 0
    return totalViews > 0 || totalSessions > 0
  }, [report])

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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-muted/30 rounded-xl animate-pulse" />
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
            {error || 'Failed to load traffic report'}
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

  /* ── Empty state: no traffic events yet ── */
  if (!hasData) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="space-y-6"
      >
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Traffic Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Page views, sessions, unique visitors &amp; top pages
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor="tr-start" className="text-xs text-muted-foreground sr-only">
                Start date
              </Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  id="tr-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-8 h-9 text-xs bg-muted/50 border-0"
                />
              </div>
            </div>
            <span className="text-xs text-muted-foreground">to</span>
            <div className="flex items-center gap-2">
              <Label htmlFor="tr-end" className="text-xs text-muted-foreground sr-only">
                End date
              </Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  id="tr-end"
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

        <motion.div variants={itemVariants}>
          <Card className="border-dashed border-2 border-border/60 bg-card/30">
            <CardContent className="py-16 px-6 flex flex-col items-center text-center gap-3">
              <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/10">
                <Activity className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold">No traffic data yet</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Tracking starts collecting data as customers browse the store.
                  Once visitors interact with the storefront, page views,
                  sessions and unique visitors will appear here automatically.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchReport}
                className="mt-2"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Traffic Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Page views, sessions, unique visitors &amp; top pages
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label htmlFor="tr-start" className="text-xs text-muted-foreground sr-only">
              Start date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="tr-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-8 h-9 text-xs bg-muted/50 border-0"
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">to</span>
          <div className="flex items-center gap-2">
            <Label htmlFor="tr-end" className="text-xs text-muted-foreground sr-only">
              End date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="tr-end"
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

      {/* ── Summary KPI Cards ── */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
      >
        <GrowthKpiCard
          title="Page Views"
          metric={s.totalPageViews}
          formatValue={formatNumber}
          icon={Eye}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
        />
        <GrowthKpiCard
          title="Unique Visitors"
          metric={s.uniqueVisitors}
          formatValue={formatNumber}
          icon={Users}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-600 dark:text-blue-400"
          accentBar="bg-blue-500"
        />
        <GrowthKpiCard
          title="Total Sessions"
          metric={s.totalSessions}
          formatValue={formatNumber}
          icon={Layers}
          iconBg="bg-sky-500/10"
          iconColor="text-sky-600 dark:text-sky-400"
          accentBar="bg-sky-500"
        />
        <PlainKpiCard
          title="Avg Session Duration"
          value={formatDuration(s.avgSessionDuration)}
          icon={Clock}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600 dark:text-amber-400"
          accentBar="bg-amber-500"
        />
        <PlainKpiCard
          title="Bounce Rate"
          value={`${(s.bounceRate || 0).toFixed(1)}%`}
          icon={TrendingDown}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-600 dark:text-rose-400"
          accentBar="bg-rose-500"
        />
        <PlainKpiCard
          title="Pages / Session"
          value={(s.pagesPerSession || 0).toFixed(2)}
          icon={MousePointerClick}
          iconBg="bg-teal-500/10"
          iconColor="text-teal-600 dark:text-teal-400"
          accentBar="bg-teal-500"
        />
      </motion.div>

      {/* ── Page Views & Visitors Trend ── */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10">
                <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">
                  Page Views &amp; Visitors Trend
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Daily page views vs unique visitors for the selected period
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            {viewsChartData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={viewsChartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="trViewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="trVisitorsGradient" x1="0" y1="0" x2="0" y2="1">
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
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <Tooltip content={<ViewsTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="pageViews"
                      name="Page Views"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#trViewsGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      name="Unique Visitors"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#trVisitorsGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
                No traffic trend data available for this period
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Traffic Sources + Device Breakdown ── */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        {/* Traffic Sources */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-sky-500/10">
                  <Globe className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Traffic Sources
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sessions grouped by acquisition source
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sourceChartData.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {sourceChartData.map((src, idx) => (
                    <div
                      key={`${src.source}-${idx}`}
                      className="space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{src.source || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground tabular-nums">
                            {formatNumber(src.sessions)} sessions
                          </span>
                          <span className="font-semibold tabular-nums w-12 text-right">
                            {src.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, src.percentage)}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No traffic source data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Device Breakdown */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10">
                  <MonitorSmartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Device Breakdown
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sessions grouped by visitor device type
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {deviceChartData.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                  <div className="h-48 w-48 shrink-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deviceChartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {deviceChartData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          }}
                          formatter={(value: number, name: string) => [
                            `${formatNumber(value)} sessions`,
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Total
                      </span>
                      <span className="text-base font-bold tabular-nums">
                        {formatNumber(
                          deviceChartData.reduce((acc, d) => acc + (d.value || 0), 0),
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 w-full space-y-2">
                    {deviceChartData.map((d, idx) => {
                      const Icon = getDeviceIcon(d.name)
                      return (
                        <div
                          key={`device-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="flex items-center justify-center h-7 w-7 rounded-md"
                              style={{ backgroundColor: `${d.color}1a` }}
                            >
                              <Icon
                                className="h-3.5 w-3.5"
                                style={{ color: d.color }}
                              />
                            </span>
                            <span className="text-sm font-medium capitalize">
                              {d.name || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatNumber(d.value)}
                            </span>
                            <span
                              className="text-xs font-semibold tabular-nums w-12 text-right"
                              style={{ color: d.color }}
                            >
                              {d.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No device breakdown data available
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ── Top Pages Table ── */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
                  <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Top Pages
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Most viewed pages with unique visitors &amp; avg time on page
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {report.topPages.length > 0 ? (
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 sticky top-0">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-6">
                        Page Path
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Title
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                        Views
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">
                        Unique Visitors
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.topPages.map((page, idx) => (
                      <TableRow
                        key={`${page.path}-${idx}`}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <TableCell className="pl-6">
                          <code className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            {page.path || '/'}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate max-w-[260px]">
                          {page.title || '—'}
                        </TableCell>
                        <TableCell className="text-sm font-semibold tabular-nums text-right">
                          {formatNumber(page.views)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-right pr-6">
                          {formatNumber(page.uniqueVisitors)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                <FileText className="h-8 w-8 opacity-40" />
                <p className="text-sm">No page view data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  KPI Cards                                                          */
/* ------------------------------------------------------------------ */

function GrowthKpiCard({
  title,
  metric,
  formatValue,
  icon: Icon,
  iconBg,
  iconColor,
  accentBar,
}: {
  title: string
  metric: GrowthMetric
  formatValue: (v: number) => string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  accentBar: string
}) {
  const rate = metric?.growthRate || 0
  const { color, Icon: TrendIcon, label } = formatGrowthBadge(rate)

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
              <div
                className={cn(
                  'flex items-center gap-1 mt-1.5 text-[11px] font-medium',
                  color,
                )}
              >
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

function PlainKpiCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  accentBar,
}: {
  title: string
  value: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  accentBar: string
}) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden relative">
        <div className={cn('absolute top-0 left-0 right-0 h-0.5', accentBar)} />
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{title}</p>
              <p className="text-lg font-bold tracking-tight mt-1 truncate">
                {value}
              </p>
              <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
                <span className="h-3 w-3" />
                <span>current period</span>
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
/*  Custom Views Tooltip                                               */
/* ------------------------------------------------------------------ */

interface ViewsTooltipPayloadEntry {
  payload: {
    label: string
    date: string
    pageViews: number
    visitors: number
  }
}

function ViewsTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ViewsTooltipPayloadEntry[]
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
            Page Views
          </span>
          <span className="font-semibold tabular-nums">
            {formatNumber(data.pageViews)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Unique Visitors
          </span>
          <span className="font-semibold tabular-nums">
            {formatNumber(data.visitors)}
          </span>
        </div>
      </div>
    </div>
  )
}
