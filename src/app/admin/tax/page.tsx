'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Calculator,
  Receipt,
  Download,
  RefreshCw,
  AlertTriangle,
  Building2,
  Coins,
  FileText,
  Calendar,
  MapPin,
  Hash,
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
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HsnSummary {
  hsn: string
  description: string
  quantity: number
  taxableValue: number
  gstRate: number
  cgst: number
  sgst: number
  igst: number
  totalGst: number
}

interface StateSummary {
  state: string
  intraState: boolean
  taxableValue: number
  cgst: number
  sgst: number
  igst: number
}

interface GstReport {
  period: { start: string; end: string }
  platformGstin: string
  totalTaxableValue: number
  totalInvoiceValue: number
  cgst: number
  sgst: number
  igst: number
  cess: number
  totalGst: number
  gstOnCommission: number
  gstOnDelivery: number
  hsnSummary: HsnSummary[]
  stateWiseSummary: StateSummary[]
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

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
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

export default function TaxPage() {
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
        <TaxContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tax Content                                                        */
/* ------------------------------------------------------------------ */

function TaxContent() {
  const [report, setReport] = useState<GstReport | null>(null)
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

      const res = await fetch(`/api/admin/finance/tax?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch GST report')
      }
      const data = (await res.json()) as GstReport
      setReport(data)
    } catch (err) {
      console.error('Tax report fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load GST report')
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchReport()
  }, [startDate, endDate])

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted/30 rounded-xl animate-pulse" />
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
          <p className="text-sm font-medium">{error || 'Failed to load GST report'}</p>
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
          <h1 className="text-2xl font-semibold tracking-tight">
            GST &amp; Tax Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            GSTR-1 style summary with HSN-wise &amp; state-wise breakup
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label htmlFor="tax-start" className="text-xs text-muted-foreground sr-only">
              Start date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="tax-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-8 h-9 text-xs bg-muted/50 border-0"
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">to</span>
          <div className="flex items-center gap-2">
            <Label htmlFor="tax-end" className="text-xs text-muted-foreground sr-only">
              End date
            </Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="tax-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-8 h-9 text-xs bg-muted/50 border-0"
              />
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Download Report
          </Button>
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

      {/* ── Platform GSTIN Display ── */}
      <motion.div variants={fadeInUp}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-teal-500/10">
                  <Building2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Platform GSTIN
                  </p>
                  <p className="text-sm font-mono font-semibold tracking-tight">
                    {report.platformGstin || 'Not configured'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Period
                  </p>
                  <p className="font-medium mt-0.5">
                    {formatDate(report.period?.start)} &rarr;{' '}
                    {formatDate(report.period?.end)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Total Invoice Value
                  </p>
                  <p className="font-semibold mt-0.5 text-teal-600 dark:text-teal-400">
                    {formatINR(report.totalInvoiceValue)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Summary Stat Cards ── */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <StatCard
          title="Total Taxable Value"
          value={formatINR(report.totalTaxableValue)}
          icon={Coins}
          iconBg="bg-teal-500/10"
          iconColor="text-teal-600 dark:text-teal-400"
          accentBar="bg-teal-500"
          subtitle="Before GST"
        />
        <StatCard
          title="Total GST"
          value={formatINR(report.totalGst)}
          icon={Receipt}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600 dark:text-amber-400"
          accentBar="bg-amber-500"
          subtitle="CGST + SGST + IGST + Cess"
        />
        <StatCard
          title="GST on Commission"
          value={formatINR(report.gstOnCommission)}
          icon={Calculator}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
          subtitle="Platform @ 18%"
        />
        <StatCard
          title="GST on Delivery"
          value={formatINR(report.gstOnDelivery)}
          icon={Receipt}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-600 dark:text-rose-400"
          accentBar="bg-rose-500"
          subtitle="Delivery @ 18%"
        />
      </motion.div>

      {/* ── GST Breakup Cards ── */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <GstBreakupCard
          label="CGST"
          sublabel="Central GST"
          amount={report.cgst}
          color="bg-emerald-500"
          textColor="text-emerald-600 dark:text-emerald-400"
          bgTint="bg-emerald-500/5"
        />
        <GstBreakupCard
          label="SGST"
          sublabel="State GST"
          amount={report.sgst}
          color="bg-teal-500"
          textColor="text-teal-600 dark:text-teal-400"
          bgTint="bg-teal-500/5"
        />
        <GstBreakupCard
          label="IGST"
          sublabel="Integrated GST"
          amount={report.igst}
          color="bg-amber-500"
          textColor="text-amber-600 dark:text-amber-400"
          bgTint="bg-amber-500/5"
        />
        <GstBreakupCard
          label="Cess"
          sublabel="Compensation Cess"
          amount={report.cess}
          color="bg-rose-500"
          textColor="text-rose-600 dark:text-rose-400"
          bgTint="bg-rose-500/5"
        />
      </motion.div>

      {/* ── Two-Column: HSN-wise + State-wise ── */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        {/* HSN-wise Summary */}
        <motion.div variants={fadeInUp}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-teal-500/10">
                    <Hash className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      HSN-wise Summary
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tax breakup by HSN code
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] bg-muted/40 border-0">
                  {report.hsnSummary?.length || 0} HSNs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {report.hsnSummary && report.hsnSummary.length > 0 ? (
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40 sticky top-0">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          HSN
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Description
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          Qty
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          Taxable
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          Rate
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">
                          GST
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.hsnSummary.map((hsn, idx) => (
                        <TableRow
                          key={`${hsn.hsn}-${idx}`}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <TableCell className="text-xs font-mono font-medium">
                            {hsn.hsn}
                          </TableCell>
                          <TableCell className="text-xs">
                            <p className="truncate max-w-[160px]">
                              {hsn.description || '\u2014'}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-right">
                            {(hsn.quantity || 0).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-right">
                            {formatCurrency(hsn.taxableValue, 0)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-right text-muted-foreground">
                            {hsn.gstRate}%
                          </TableCell>
                          <TableCell className="text-xs font-semibold tabular-nums text-right pr-6 text-amber-600 dark:text-amber-400">
                            {formatCurrency(hsn.totalGst, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                  <Hash className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No HSN data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* State-wise Summary */}
        <motion.div variants={fadeInUp}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
                    <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      State-wise Summary
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Place of supply breakdown
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] bg-muted/40 border-0">
                  {report.stateWiseSummary?.length || 0} states
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {report.stateWiseSummary && report.stateWiseSummary.length > 0 ? (
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40 sticky top-0">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          State
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Type
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          Taxable
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          CGST
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                          SGST
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">
                          IGST
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.stateWiseSummary.map((s, idx) => (
                        <TableRow
                          key={`${s.state}-${idx}`}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <TableCell className="text-xs font-medium">
                            {s.state || '\u2014'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] border-0',
                                s.intraState
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                              )}
                            >
                              {s.intraState ? 'Intra' : 'Inter'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-right">
                            {formatCurrency(s.taxableValue, 0)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-right text-muted-foreground">
                            {formatCurrency(s.cgst, 0)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-right text-muted-foreground">
                            {formatCurrency(s.sgst, 0)}
                          </TableCell>
                          <TableCell className="text-xs font-semibold tabular-nums text-right pr-6">
                            {formatCurrency(s.igst, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                  <MapPin className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No state-wise data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ── Filing Note ── */}
      <motion.div variants={fadeInUp}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-teal-500/10 shrink-0">
                <FileText className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Filing Note</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  This report aggregates GST data for the selected period and is
                  suitable for GSTR-1 filing. CGST &amp; SGST apply to intra-state
                  supplies, while IGST applies to inter-state supplies. The
                  platform&apos;s GST on commission and delivery is reported
                  separately under the platform&apos;s GSTR-1 as outward supplies of
                  services.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
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
/*  GST Breakup Card                                                   */
/* ------------------------------------------------------------------ */

function GstBreakupCard({
  label,
  sublabel,
  amount,
  color,
  textColor,
  bgTint,
}: {
  label: string
  sublabel: string
  amount: number
  color: string
  textColor: string
  bgTint: string
}) {
  return (
    <motion.div variants={fadeInUp}>
      <Card
        className={cn(
          'border-border/60 backdrop-blur-sm overflow-hidden relative',
          bgTint,
        )}
      >
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('h-2 w-2 rounded-full', color)} />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
          </div>
          <p className={cn('text-2xl font-bold tracking-tight truncate', textColor)}>
            {formatINR(amount)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">{sublabel}</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
