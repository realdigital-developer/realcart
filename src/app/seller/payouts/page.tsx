'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import {
  Wallet,
  CreditCard,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  Receipt,
  FileText,
  Store,
  Building2,
  Hash,
  Inbox,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type PayoutStatus = 'pending' | 'processed' | 'paid' | 'failed'

interface Payout {
  payoutId: string
  periodStart: string
  periodEnd: string
  grossOrderValue: number
  commission: number
  gstOnCommission: number
  tdsDeducted: number
  tcsCollected: number
  netPayout: number
  status: PayoutStatus
  orderIds: string[] | null
  processedAt: string | null
  paidAt: string | null
  transactionRef: string | null
  createdAt: string
}

interface PayoutsResponse {
  payouts: Payout[]
  total: number
  page: number
  limit: number
  summary: {
    totalEarnings: number
    pendingPayouts: number
    paidOut: number
    pendingCount: number
  }
}

interface Transaction {
  _id: string
  transactionId: string
  type: string
  subType: string | null
  orderId: string | null
  payoutId: string | null
  refundId: string | null
  amount: number
  description: string
  paymentMethod: string | null
  gatewayRef: string | null
  status: string
  date: string
  createdAt: string
}

interface TransactionsResponse {
  transactions: Transaction[]
  total: number
  page: number
  limit: number
  summary: {
    totalInflow: number
    totalOutflow: number
    netBalance: number
  }
}

interface TaxSeller {
  name: string
  storeName: string
  gstNumber: string
  panNumber: string
}

interface TaxSummary {
  totalTaxableValue: number
  totalGst: number
  totalCgst: number
  totalSgst: number
  totalIgst: number
  totalTds: number
  totalTcs: number
  totalCommission: number
  totalGstOnCommission: number
}

interface MonthlyTaxRow {
  month: string
  year: number
  taxableValue: number
  gst: number
  tds: number
  tcs: number
  commission: number
}

interface TaxStatementResponse {
  seller: TaxSeller
  period: { start: string; end: string }
  summary: TaxSummary
  monthlyBreakdown: MonthlyTaxRow[]
  orderCount: number
}

/* ------------------------------------------------------------------ */
/*  Status Configuration                                                */
/* ------------------------------------------------------------------ */

const payoutStatusConfig: Record<
  PayoutStatus,
  { bg: string; text: string; dot: string; label: string; icon: typeof Clock }
> = {
  pending: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
    label: 'Pending',
    icon: Clock,
  },
  processed: {
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    text: 'text-sky-700 dark:text-sky-400',
    dot: 'bg-sky-500',
    label: 'Processed',
    icon: CheckCircle2,
  },
  paid: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    label: 'Paid',
    icon: CheckCircle2,
  },
  failed: {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-400',
    dot: 'bg-rose-500',
    label: 'Failed',
    icon: AlertCircle,
  },
}

function getPayoutStatusConfig(status: PayoutStatus) {
  return payoutStatusConfig[status] || {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    label: status.charAt(0).toUpperCase() + status.slice(1),
    icon: Clock,
  }
}

/* ------------------------------------------------------------------ */
/*  Transaction Type Configuration                                      */
/* ------------------------------------------------------------------ */

const transactionTypeConfig: Record<string, { label: string; inflow: boolean }> = {
  order_payment: { label: 'Order Payment', inflow: true },
  commission_earned: { label: 'Commission Earned', inflow: false },
  gst_collected: { label: 'GST Collected', inflow: true },
  tds_deducted: { label: 'TDS Deducted', inflow: false },
  tcs_collected: { label: 'TCS Collected', inflow: true },
  delivery_earned: { label: 'Delivery Earned', inflow: true },
  cod_fee: { label: 'COD Fee', inflow: false },
  platform_fee: { label: 'Platform Fee', inflow: false },
  seller_payout: { label: 'Seller Payout', inflow: false },
  refund_issued: { label: 'Refund Issued', inflow: false },
  expense: { label: 'Expense', inflow: false },
  adjustment: { label: 'Adjustment', inflow: true },
}

function getTransactionTypeLabel(type: string): string {
  return (
    transactionTypeConfig[type]?.label ||
    type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  )
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
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/**
 * Returns the [start, end] of the Indian financial year that contains `date`.
 * FY runs April 1 → March 31.
 */
function getFinancialYearRange(date = new Date()): { start: Date; end: Date; label: string } {
  const year = date.getFullYear()
  const month = date.getMonth() // 0 = January
  const fyStartYear = month < 3 ? year - 1 : year
  const start = new Date(fyStartYear, 3, 1, 0, 0, 0, 0)
  const end = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999)
  const label = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`
  return { start, end, label }
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
      <div className={cn('absolute top-0 left-0 right-0 h-1 rounded-t-xl', gradientClass)} />
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', bgClass)}>
            <Icon className={cn('h-5 w-5', textClass)} />
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-emerald-500 transition-colors" />
        </div>
        <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight truncate">{value}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sublabel && (
            <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded whitespace-nowrap">
              {sublabel}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
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
/*  Error State Component                                               */
/* ------------------------------------------------------------------ */

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-2xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center mb-4">
        <AlertCircle className="h-7 w-7 text-rose-500/60 dark:text-rose-400/60" />
      </div>
      <p className="text-sm font-semibold text-foreground">Something went wrong</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 text-xs rounded-lg"
          onClick={onRetry}
        >
          <RotateCcw className="h-3 w-3 mr-1.5" />
          Try again
        </Button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Pagination Component                                                */
/* ------------------------------------------------------------------ */

function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-4 border-t border-border">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
        <span className="hidden sm:inline"> &middot; {total} total</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="h-8 px-2.5 gap-1 text-xs"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="h-8 px-2.5 gap-1 text-xs"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  TAB 1: PAYOUTS                                                      */
/* ================================================================== */

function PayoutsTab() {
  const { logout } = useSellerAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [data, setData] = useState<PayoutsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [expandedPayout, setExpandedPayout] = useState<string | null>(null)

  const limit = 20

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/seller/payouts?${params.toString()}`)
      if (res.status === 401 || res.status === 403) {
        await logout()
        router.replace('/seller')
        return
      }
      if (!res.ok) throw new Error('Failed to fetch payouts')
      const json = await res.json()
      setData(json)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load payouts'
      setError(msg)
      toast({
        title: 'Error',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, logout, router, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  const toggleExpand = useCallback((payoutId: string) => {
    setExpandedPayout(prev => (prev === payoutId ? null : payoutId))
  }, [])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const summary = data?.summary

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          label="Total Earnings"
          value={fmtPrice(summary?.totalEarnings ?? 0, 0)}
          icon={Wallet}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
          sublabel="All-time"
        />
        <SummaryCard
          label="Pending Payouts"
          value={fmtPrice(summary?.pendingPayouts ?? 0, 0)}
          icon={Clock}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-orange-400"
          sublabel="In process"
        />
        <SummaryCard
          label="Paid Out"
          value={fmtPrice(summary?.paidOut ?? 0, 0)}
          icon={CheckCircle2}
          bgClass="bg-teal-50 dark:bg-teal-950/30"
          textClass="text-teal-600 dark:text-teal-400"
          gradientClass="bg-gradient-to-r from-teal-500 to-cyan-400"
          sublabel="Settled"
        />
        <SummaryCard
          label="Pending Count"
          value={String(summary?.pendingCount ?? 0)}
          icon={Receipt}
          bgClass="bg-violet-50 dark:bg-violet-950/30"
          textClass="text-violet-600 dark:text-violet-400"
          gradientClass="bg-gradient-to-r from-violet-500 to-purple-400"
          sublabel="Payouts"
        />
      </div>

      {/* Payouts table card */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">Settlement Payouts</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your payout cycles and settlement details
                </p>
              </div>
              {/* Status filter */}
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger size="sm" className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processed">Processed</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                {data && (
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded whitespace-nowrap">
                    {data.total} payout{data.total !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={fetchData} />
            ) : !data || data.payouts.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No payouts yet"
                subtitle="Your settlement payouts will appear here once orders are processed"
              />
            ) : (
              <div className="space-y-3">
                {/* Scrollable table for long lists */}
                <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold w-8" />
                        <TableHead className="text-xs font-semibold">Payout ID</TableHead>
                        <TableHead className="text-xs font-semibold">Period</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Gross</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden md:table-cell">Commission</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden lg:table-cell">TDS</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden lg:table-cell">TCS</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Net Payout</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold hidden sm:table-cell">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.payouts.map((payout, idx) => {
                        const config = getPayoutStatusConfig(payout.status)
                        const StatusIcon = config.icon
                        const isExpanded = expandedPayout === payout.payoutId
                        const orderCount = Array.isArray(payout.orderIds) ? payout.orderIds.length : 0

                        return (
                          <Fragment key={payout.payoutId}>
                            <TableRow
                              className={cn(
                                'cursor-pointer hover:bg-muted/30 transition-colors',
                                idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                              )}
                              onClick={() => toggleExpand(payout.payoutId)}
                            >
                              <TableCell className="p-2">
                                <div className={cn(
                                  'h-6 w-6 rounded-md flex items-center justify-center transition-colors',
                                  isExpanded
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-muted/50 text-muted-foreground'
                                )}>
                                  {isExpanded
                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                    : <ChevronRight className="h-3.5 w-3.5" />
                                  }
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-mono font-medium text-foreground whitespace-nowrap">
                                {payout.payoutId}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(payout.periodStart)} — {formatDate(payout.periodEnd)}
                              </TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap">
                                {fmtPrice(payout.grossOrderValue, 0)}
                              </TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap hidden md:table-cell">
                                {fmtPrice(payout.commission, 0)}
                              </TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                                {fmtPrice(payout.tdsDeducted, 0)}
                              </TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                                {fmtPrice(payout.tcsCollected, 0)}
                              </TableCell>
                              <TableCell className="text-xs text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                {fmtPrice(payout.netPayout, 0)}
                              </TableCell>
                              <TableCell>
                                <span className={cn(
                                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap',
                                  config.bg,
                                  config.text
                                )}>
                                  <StatusIcon className="h-3 w-3" />
                                  {config.label}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                                {formatDate(payout.createdAt)}
                              </TableCell>
                            </TableRow>
                            {/* Expanded: order IDs */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.tr
                                  key={`${payout.payoutId}-exp`}
                                  variants={cardExpandVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  className="bg-muted/20"
                                >
                                  <td colSpan={10} className="p-0">
                                    <div className="px-4 sm:px-6 py-4 border-t border-border">
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Order IDs */}
                                        <div className="md:col-span-2">
                                          <div className="flex items-center gap-2 mb-2">
                                            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="text-xs font-medium text-muted-foreground">
                                              Orders in this payout ({orderCount})
                                            </span>
                                          </div>
                                          {orderCount > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                              {payout.orderIds!.map((oid, i) => (
                                                <span
                                                  key={`${oid}-${i}`}
                                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card border border-border text-[10px] font-mono text-muted-foreground"
                                                >
                                                  <Hash className="h-2.5 w-2.5" />
                                                  {oid}
                                                </span>
                                              ))}
                                            </div>
                                          ) : (
                                            <p className="text-xs text-muted-foreground/60 italic">
                                              No order details available
                                            </p>
                                          )}
                                        </div>
                                        {/* Payout metadata */}
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">GST on Commission</span>
                                            <span className="font-medium text-foreground">{fmtPrice(payout.gstOnCommission, 0)}</span>
                                          </div>
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Processed At</span>
                                            <span className="font-medium text-foreground">{formatDate(payout.processedAt)}</span>
                                          </div>
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Paid At</span>
                                            <span className="font-medium text-foreground">{formatDate(payout.paidAt)}</span>
                                          </div>
                                          {payout.transactionRef && (
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">Transaction Ref</span>
                                              <span className="font-mono text-[10px] text-foreground truncate max-w-[120px]">
                                                {payout.transactionRef}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={data.total}
                  onPageChange={setPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/* ================================================================== */
/*  TAB 2: TRANSACTIONS                                                 */
/* ================================================================== */

function TransactionsTab() {
  const { logout } = useSellerAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [data, setData] = useState<TransactionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const limit = 20

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const res = await fetch(`/api/seller/transactions?${params.toString()}`)
      if (res.status === 401 || res.status === 403) {
        await logout()
        router.replace('/seller')
        return
      }
      if (!res.ok) throw new Error('Failed to fetch transactions')
      const json = await res.json()
      setData(json)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load transactions'
      setError(msg)
      toast({
        title: 'Error',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter, logout, router, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setPage(1)
  }, [typeFilter])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const summary = data?.summary

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <SummaryCard
          label="Total Inflow"
          value={fmtPrice(summary?.totalInflow ?? 0, 0)}
          icon={TrendingUp}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
          sublabel="Credits"
        />
        <SummaryCard
          label="Total Outflow"
          value={fmtPrice(Math.abs(summary?.totalOutflow ?? 0), 0)}
          icon={TrendingDown}
          bgClass="bg-rose-50 dark:bg-rose-950/30"
          textClass="text-rose-600 dark:text-rose-400"
          gradientClass="bg-gradient-to-r from-rose-500 to-red-400"
          sublabel="Debits"
        />
        <SummaryCard
          label="Net Balance"
          value={fmtPrice(summary?.netBalance ?? 0, 0)}
          icon={Wallet}
          bgClass={(summary?.netBalance ?? 0) >= 0
            ? 'bg-emerald-50 dark:bg-emerald-950/30'
            : 'bg-amber-50 dark:bg-amber-950/30'}
          textClass={(summary?.netBalance ?? 0) >= 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-amber-600 dark:text-amber-400'}
          gradientClass={(summary?.netBalance ?? 0) >= 0
            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
            : 'bg-gradient-to-r from-amber-500 to-orange-400'}
          sublabel="Inflow + Outflow"
        />
      </div>

      {/* Transactions table card */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">Transaction Ledger</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Detailed record of all your financial transactions
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger size="sm" className="w-[170px] h-8 text-xs">
                    <SelectValue placeholder="Filter type" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">All Types</SelectItem>
                    {Object.entries(transactionTypeConfig).map(([value, conf]) => (
                      <SelectItem key={value} value={value}>
                        {conf.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {data && (
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded whitespace-nowrap">
                    {data.total} txn{data.total !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={fetchData} />
            ) : !data || data.transactions.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No transactions yet"
                subtitle="Your financial transactions will appear here as you receive payouts and process orders"
              />
            ) : (
              <div className="space-y-3">
                <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold">Transaction ID</TableHead>
                        <TableHead className="text-xs font-semibold hidden sm:table-cell">Date</TableHead>
                        <TableHead className="text-xs font-semibold">Type</TableHead>
                        <TableHead className="text-xs font-semibold">Description</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Amount</TableHead>
                        <TableHead className="text-xs font-semibold hidden md:table-cell">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.transactions.map((txn, idx) => {
                        const isInflow = txn.amount >= 0
                        return (
                          <TableRow
                            key={txn._id}
                            className={cn(
                              'hover:bg-muted/30 transition-colors',
                              idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                            )}
                          >
                            <TableCell className="text-xs font-mono font-medium text-foreground whitespace-nowrap">
                              {txn.transactionId || `#${txn._id.slice(-8).toUpperCase()}`}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                              {formatDateTime(txn.date)}
                            </TableCell>
                            <TableCell>
                              <span className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap',
                                isInflow
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                              )}>
                                {isInflow
                                  ? <ArrowUpRight className="h-2.5 w-2.5" />
                                  : <ArrowDownRight className="h-2.5 w-2.5" />
                                }
                                {getTransactionTypeLabel(txn.type)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[240px]">
                              <span className="line-clamp-2">{txn.description || '—'}</span>
                            </TableCell>
                            <TableCell className={cn(
                              'text-xs text-right font-bold whitespace-nowrap',
                              isInflow
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            )}>
                              {isInflow ? '+' : ''}{fmtPrice(txn.amount, 0)}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap',
                                txn.status === 'completed' || txn.status === 'success'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                                  : txn.status === 'pending'
                                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
                                    : txn.status === 'failed'
                                      ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'
                                      : 'bg-muted text-muted-foreground'
                              )}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {txn.status ? txn.status.charAt(0).toUpperCase() + txn.status.slice(1) : '—'}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={data.total}
                  onPageChange={setPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/* ================================================================== */
/*  TAB 3: TAX STATEMENT                                                */
/* ================================================================== */

type TaxPreset = 'current-fy' | 'previous-fy' | 'last-6-months' | 'this-year' | 'custom'

function TaxStatementTab() {
  const { logout } = useSellerAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [preset, setPreset] = useState<TaxPreset>('current-fy')
  const fy = useMemo(() => getFinancialYearRange(), [])
  const [startDate, setStartDate] = useState<string>(toDateInputValue(fy.start))
  const [endDate, setEndDate] = useState<string>(toDateInputValue(fy.end))

  const [data, setData] = useState<TaxStatementResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const applyPreset = useCallback((p: TaxPreset) => {
    setPreset(p)
    const now = new Date()
    if (p === 'current-fy') {
      const r = getFinancialYearRange(now)
      setStartDate(toDateInputValue(r.start))
      setEndDate(toDateInputValue(r.end))
    } else if (p === 'previous-fy') {
      const r = getFinancialYearRange(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()))
      setStartDate(toDateInputValue(r.start))
      setEndDate(toDateInputValue(r.end))
    } else if (p === 'last-6-months') {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 5)
      start.setDate(1)
      setStartDate(toDateInputValue(start))
      setEndDate(toDateInputValue(end))
    } else if (p === 'this-year') {
      setStartDate(toDateInputValue(new Date(now.getFullYear(), 0, 1)))
      setEndDate(toDateInputValue(new Date(now.getFullYear(), 11, 31)))
    }
    // 'custom' — leave dates as-is so user can edit
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      })
      const res = await fetch(`/api/seller/tax-statement?${params.toString()}`)
      if (res.status === 401 || res.status === 403) {
        await logout()
        router.replace('/seller')
        return
      }
      if (!res.ok) throw new Error('Failed to fetch tax statement')
      const json = await res.json()
      setData(json)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tax statement'
      setError(msg)
      toast({
        title: 'Error',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, logout, router, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const monthlyData = useMemo(() => {
    if (!data?.monthlyBreakdown) return []
    return data.monthlyBreakdown.filter(
      m => m.taxableValue > 0 || m.gst > 0 || m.tds > 0 || m.tcs > 0 || m.commission > 0
    )
  }, [data])

  const s = data?.summary

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Date range selector */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Tax Period
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select a date range to generate your tax statement
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={preset} onValueChange={(v) => applyPreset(v as TaxPreset)}>
                  <SelectTrigger size="sm" className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="Select preset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current-fy">Current Financial Year</SelectItem>
                    <SelectItem value="previous-fy">Previous Financial Year</SelectItem>
                    <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                    <SelectItem value="this-year">This Calendar Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      setPreset('custom')
                    }}
                    className="h-8 w-[140px] text-xs"
                  />
                  <span className="text-xs text-muted-foreground">—</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value)
                      setPreset('custom')
                    }}
                    className="h-8 w-[140px] text-xs"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <ErrorState message={error} onRetry={fetchData} />
          </CardContent>
        </Card>
      ) : !data ? null : (
        <>
          {/* Seller info card */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Seller Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
                      <Store className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Seller Name</p>
                      <p className="text-sm font-medium text-foreground truncate">{data.seller.name || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center flex-shrink-0">
                      <Store className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Store Name</p>
                      <p className="text-sm font-medium text-foreground truncate">{data.seller.storeName || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">GSTIN</p>
                      <p className="text-sm font-mono font-medium text-foreground truncate">{data.seller.gstNumber || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">PAN</p>
                      <p className="text-sm font-mono font-medium text-foreground truncate">{data.seller.panNumber || '—'}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(data.period.start)} — {formatDate(data.period.end)}
                  </span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    {data.orderCount} order{data.orderCount !== 1 ? 's' : ''} in period
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <SummaryCard
              label="Total Taxable Value"
              value={fmtPrice(s?.totalTaxableValue ?? 0, 0)}
              icon={IndianRupee}
              bgClass="bg-emerald-50 dark:bg-emerald-950/30"
              textClass="text-emerald-600 dark:text-emerald-400"
              gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
            />
            <SummaryCard
              label="Total GST"
              value={fmtPrice(s?.totalGst ?? 0, 0)}
              icon={TrendingUp}
              bgClass="bg-violet-50 dark:bg-violet-950/30"
              textClass="text-violet-600 dark:text-violet-400"
              gradientClass="bg-gradient-to-r from-violet-500 to-purple-400"
              sublabel="CGST+SGST+IGST"
            />
            <SummaryCard
              label="Total TDS"
              value={fmtPrice(s?.totalTds ?? 0, 0)}
              icon={TrendingDown}
              bgClass="bg-amber-50 dark:bg-amber-950/30"
              textClass="text-amber-600 dark:text-amber-400"
              gradientClass="bg-gradient-to-r from-amber-500 to-orange-400"
            />
            <SummaryCard
              label="Total TCS"
              value={fmtPrice(s?.totalTcs ?? 0, 0)}
              icon={TrendingDown}
              bgClass="bg-rose-50 dark:bg-rose-950/30"
              textClass="text-rose-600 dark:text-rose-400"
              gradientClass="bg-gradient-to-r from-rose-500 to-red-400"
            />
            <SummaryCard
              label="Total Commission"
              value={fmtPrice(s?.totalCommission ?? 0, 0)}
              icon={CreditCard}
              bgClass="bg-teal-50 dark:bg-teal-950/30"
              textClass="text-teal-600 dark:text-teal-400"
              gradientClass="bg-gradient-to-r from-teal-500 to-cyan-400"
            />
            <SummaryCard
              label="GST on Commission"
              value={fmtPrice(s?.totalGstOnCommission ?? 0, 0)}
              icon={IndianRupee}
              bgClass="bg-sky-50 dark:bg-sky-950/30"
              textClass="text-sky-600 dark:text-sky-400"
              gradientClass="bg-gradient-to-r from-sky-500 to-blue-400"
            />
          </div>

          {/* Monthly breakdown table */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">Monthly Breakdown</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tax components by month for the selected period
                    </p>
                  </div>
                  {monthlyData.length > 0 && (
                    <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                      {monthlyData.length} month{monthlyData.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {monthlyData.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No tax data for this period"
                    subtitle="Tax data will appear here once you have orders in the selected date range"
                  />
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-border [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-semibold">Month</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Taxable Value</TableHead>
                          <TableHead className="text-xs font-semibold text-right">GST</TableHead>
                          <TableHead className="text-xs font-semibold text-right hidden sm:table-cell">TDS</TableHead>
                          <TableHead className="text-xs font-semibold text-right hidden sm:table-cell">TCS</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Commission</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyData.map((row, i) => (
                          <TableRow
                            key={`${row.month}-${row.year}`}
                            className={cn(
                              'hover:bg-muted/30',
                              i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                            )}
                          >
                            <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">
                              {row.month} {row.year}
                            </TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap">
                              {fmtPrice(row.taxableValue, 0)}
                            </TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap">
                              {fmtPrice(row.gst, 0)}
                            </TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                              {fmtPrice(row.tds, 0)}
                            </TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                              {fmtPrice(row.tcs, 0)}
                            </TableCell>
                            <TableCell className="text-xs text-right font-medium text-foreground whitespace-nowrap">
                              {fmtPrice(row.commission, 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals row */}
                        <TableRow className="bg-muted/30 hover:bg-muted/40 border-t-2 border-border">
                          <TableCell className="text-sm font-bold text-foreground">Total</TableCell>
                          <TableCell className="text-xs text-right font-bold text-foreground whitespace-nowrap">
                            {fmtPrice(monthlyData.reduce((sum, r) => sum + r.taxableValue, 0), 0)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-foreground whitespace-nowrap">
                            {fmtPrice(monthlyData.reduce((sum, r) => sum + r.gst, 0), 0)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-foreground whitespace-nowrap hidden sm:table-cell">
                            {fmtPrice(monthlyData.reduce((sum, r) => sum + r.tds, 0), 0)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-foreground whitespace-nowrap hidden sm:table-cell">
                            {fmtPrice(monthlyData.reduce((sum, r) => sum + r.tcs, 0), 0)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-foreground whitespace-nowrap">
                            {fmtPrice(monthlyData.reduce((sum, r) => sum + r.commission, 0), 0)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
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

/* ================================================================== */
/*  MAIN PAGE COMPONENT                                                 */
/* ================================================================== */

export default function SellerPayoutsPage() {
  const { authenticated, loading } = useSellerAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<string>('payouts')

  useEffect(() => {
    if (!loading && !authenticated) router.replace('/seller')
  }, [authenticated, loading, router])

  if (loading || !authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
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
      {/* ──────────────────────── Header ──────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Payouts &amp; Finance
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Manage your settlements, transactions and tax statements
          </p>
        </div>
      </motion.div>

      {/* ──────────────────────── Tabs ──────────────────────── */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex h-9">
            <TabsTrigger value="payouts" className="gap-1.5 text-xs sm:text-sm">
              <CreditCard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Payouts</span>
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5 text-xs sm:text-sm">
              <Receipt className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Transactions</span>
            </TabsTrigger>
            <TabsTrigger value="tax" className="gap-1.5 text-xs sm:text-sm">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tax Statement</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="payouts" className="mt-6">
            <PayoutsTab />
          </TabsContent>
          <TabsContent value="transactions" className="mt-6">
            <TransactionsTab />
          </TabsContent>
          <TabsContent value="tax" className="mt-6">
            <TaxStatementTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  )
}
