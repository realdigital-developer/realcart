'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard,
  Wallet,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Plus,
  Loader2,
  Store,
  AlertCircle,
  CheckCircle,
  Banknote,
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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Payout {
  _id: string
  payoutId: string
  sellerId: string
  sellerName: string
  sellerStoreName: string
  periodStart: string
  periodEnd: string
  grossOrderValue: number
  commission: number
  gstOnCommission: number
  deliveryCollected: number
  tdsDeducted: number
  tcsCollected: number
  netPayout: number
  status: 'pending' | 'processed' | 'paid' | 'failed'
  orderIds?: string[]
  processedAt?: string
  paidAt?: string
  transactionRef?: string
  createdAt: string
}

interface SellerOption {
  _id: string
  name?: string
  storeName?: string
  email?: string
  status?: string
}

interface PayoutsResponse {
  payouts: Payout[]
  total: number
  page: number
  limit: number
}

interface ToastMessage {
  type: 'success' | 'error'
  text: string
}

/* ------------------------------------------------------------------ */
/*  Constants & Helpers                                                */
/* ------------------------------------------------------------------ */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const formatINR = (v: number): string => inrFormatter.format(v || 0)

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

const PAYOUT_STATUS_STYLES: Record<
  Payout['status'],
  { bg: string; text: string; label: string; icon: React.ElementType }
> = {
  pending: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Pending',
    icon: Clock,
  },
  processed: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-600 dark:text-sky-400',
    label: 'Processed',
    icon: Loader2,
  },
  paid: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: 'Paid',
    icon: CheckCircle2,
  },
  failed: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    label: 'Failed',
    icon: XCircle,
  },
}

const ITEMS_PER_PAGE = 10

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

export default function PayoutsPage() {
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
        <PayoutsContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Payouts Content                                                    */
/* ------------------------------------------------------------------ */

function PayoutsContent() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [total, setTotal] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [message, setMessage] = useState<ToastMessage | null>(null)

  // Create-settlement dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [sellers, setSellers] = useState<SellerOption[]>([])
  const [loadingSellers, setLoadingSellers] = useState(false)
  const [selectedSellerId, setSelectedSellerId] = useState<string>('')
  const [creating, setCreating] = useState(false)

  // Update-payout dialog state
  const [actionPayout, setActionPayout] = useState<Payout | null>(null)
  const [actionType, setActionType] = useState<'process' | 'complete' | null>(null)
  const [txnRef, setTxnRef] = useState('')
  const [updating, setUpdating] = useState(false)

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [message])

  const fetchPayouts = useCallback(async () => {
    try {
      setRefreshing(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', currentPage.toString())
      params.set('limit', ITEMS_PER_PAGE.toString())

      const res = await fetch(`/api/admin/finance/payouts?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch payouts')
      }
      const data = (await res.json().catch(() => ({}))) as PayoutsResponse
      setPayouts(data.payouts || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Payouts fetch error:', err)
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load payouts',
      })
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [statusFilter, currentPage])

  useEffect(() => {
    fetchPayouts()
  }, [fetchPayouts])

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter])

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))

  /* ── Summary amounts (computed across all current payouts shown — but
        we need totals across all statuses for accuracy. Fetching on filter
        change would lose info; we compute from all-payouts fetch by
        loading the unfiltered counts once on mount. ── */
  const [summary, setSummary] = useState<{
    pendingAmount: number
    pendingCount: number
    processedAmount: number
    processedCount: number
    paidAmount: number
    paidCount: number
  }>({ pendingAmount: 0, pendingCount: 0, processedAmount: 0, processedCount: 0, paidAmount: 0, paidCount: 0 })

  const fetchSummary = useCallback(async () => {
    try {
      // Fetch unfiltered payouts (up to 100) to compute summary
      const res = await fetch('/api/admin/finance/payouts?limit=100&page=1')
      if (!res.ok) return
      const data = (await res.json().catch(() => ({}))) as PayoutsResponse
      const items = data.payouts || []
      const s = {
        pendingAmount: 0,
        pendingCount: 0,
        processedAmount: 0,
        processedCount: 0,
        paidAmount: 0,
        paidCount: 0,
      }
      for (const p of items) {
        if (p.status === 'pending') {
          s.pendingAmount += p.netPayout || 0
          s.pendingCount += 1
        } else if (p.status === 'processed') {
          s.processedAmount += p.netPayout || 0
          s.processedCount += 1
        } else if (p.status === 'paid') {
          s.paidAmount += p.netPayout || 0
          s.paidCount += 1
        }
      }
      setSummary(s)
    } catch (err) {
      console.error('Summary fetch error:', err)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  /* ── Open create-settlement dialog ── */
  const openCreateDialog = useCallback(async () => {
    setCreateOpen(true)
    setSelectedSellerId('')
    if (sellers.length === 0) {
      setLoadingSellers(true)
      try {
        const res = await fetch('/api/admin/sellers?limit=100')
        if (!res.ok) throw new Error('Failed to load sellers')
        const data = await res.json().catch(() => ({}))
        setSellers((data.sellers || []) as SellerOption[])
      } catch (err) {
        console.error('Sellers fetch error:', err)
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to load sellers',
        })
      } finally {
        setLoadingSellers(false)
      }
    }
  }, [sellers.length])

  /* ── Create settlement ── */
  const handleCreateSettlement = useCallback(async () => {
    if (!selectedSellerId) {
      setMessage({ type: 'error', text: 'Please select a seller' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/finance/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: selectedSellerId }),
      })
      const data = await res.json().catch(() => ({})).catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create settlement')
      }
      setMessage({
        type: 'success',
        text: data.payoutId
          ? `Settlement ${data.payoutId} created`
          : 'Settlement created successfully',
      })
      setCreateOpen(false)
      setSelectedSellerId('')
      fetchPayouts()
      fetchSummary()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create settlement',
      })
    } finally {
      setCreating(false)
    }
  }, [selectedSellerId, fetchPayouts, fetchSummary])

  /* ── Open action dialog (process / complete) ── */
  const openActionDialog = useCallback(
    (payout: Payout, action: 'process' | 'complete') => {
      setActionPayout(payout)
      setActionType(action)
      setTxnRef(payout.transactionRef || '')
    },
    [],
  )

  const closeActionDialog = useCallback(() => {
    setActionPayout(null)
    setActionType(null)
    setTxnRef('')
    setUpdating(false)
  }, [])

  /* ── Submit action ── */
  const handleActionSubmit = useCallback(async () => {
    if (!actionPayout || !actionType) return
    setUpdating(true)
    try {
      const res = await fetch(
        `/api/admin/finance/payouts/${encodeURIComponent(actionPayout.payoutId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: actionType,
            transactionRef: txnRef.trim() || undefined,
          }),
        },
      )
      const data = await res.json().catch(() => ({})).catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update payout')
      }
      setMessage({
        type: 'success',
        text:
          actionType === 'process'
            ? `Payout ${actionPayout.payoutId} marked as processed`
            : `Payout ${actionPayout.payoutId} marked as paid`,
      })
      closeActionDialog()
      fetchPayouts()
      fetchSummary()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update payout',
      })
    } finally {
      setUpdating(false)
    }
  }, [actionPayout, actionType, txnRef, closeActionDialog, fetchPayouts, fetchSummary])

  /* ── Loading state ── */
  if (loadingData) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-muted/30 rounded-lg animate-pulse" />
          </div>
          <div className="h-9 w-40 bg-muted/30 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-muted/30 rounded-xl animate-pulse" />
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
      {/* ── Toast ── */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            className={cn(
              'fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm shadow-lg border',
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border-destructive/20 text-destructive',
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-current opacity-50 hover:opacity-100 transition-opacity"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page Header ── */}
      <motion.div
        variants={fadeInUp}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Seller Payouts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage seller settlements, process payments &amp; track transaction
            references
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={openCreateDialog}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Settlement
          </Button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchPayouts}
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
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <SummaryCard
          title="Pending Payouts"
          amount={summary.pendingAmount}
          count={summary.pendingCount}
          icon={Clock}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600 dark:text-amber-400"
          accentBar="bg-amber-500"
        />
        <SummaryCard
          title="Processed"
          amount={summary.processedAmount}
          count={summary.processedCount}
          icon={Loader2}
          iconBg="bg-sky-500/10"
          iconColor="text-sky-600 dark:text-sky-400"
          accentBar="bg-sky-500"
        />
        <SummaryCard
          title="Paid"
          amount={summary.paidAmount}
          count={summary.paidCount}
          icon={CheckCircle2}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
        />
      </motion.div>

      {/* ── Status Filter Tabs ── */}
      <motion.div variants={fadeInUp}>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="bg-muted/40 h-9">
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">
              Pending
            </TabsTrigger>
            <TabsTrigger value="processed" className="text-xs">
              Processed
            </TabsTrigger>
            <TabsTrigger value="paid" className="text-xs">
              Paid
            </TabsTrigger>
            <TabsTrigger value="failed" className="text-xs">
              Failed
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* ── Payouts Table ── */}
      <motion.div
        variants={fadeInUp}
        className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        {refreshing && payouts.length === 0 ? (
          <div className="flex items-center justify-center py-20 gap-2.5 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading payouts...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payout ID
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Seller
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Period
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Gross
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Commission
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    TDS
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    TCS
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Net Payout
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="h-40 text-center"
                    >
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Wallet className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No payouts found</p>
                        <p className="text-xs">
                          Try adjusting filters or create a new settlement
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  payouts.map((payout) => {
                    const style = PAYOUT_STATUS_STYLES[payout.status] || PAYOUT_STATUS_STYLES.pending
                    const StatusIcon = style.icon
                    return (
                      <TableRow
                        key={payout._id}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <TableCell>
                          <p className="text-xs font-mono font-medium truncate max-w-[140px]">
                            {payout.payoutId}
                          </p>
                          {payout.transactionRef && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                              Ref: {payout.transactionRef}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium truncate max-w-[160px]">
                            {payout.sellerStoreName || payout.sellerName || 'Unknown'}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                            {payout.sellerName || '\u2014'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs">{formatDate(payout.periodStart)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            to {formatDate(payout.periodEnd)}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-right">
                          {formatCurrency(payout.grossOrderValue, 0)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-right text-muted-foreground">
                          {formatCurrency(payout.commission, 0)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-right text-muted-foreground">
                          {formatCurrency(payout.tdsDeducted, 0)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-right text-muted-foreground">
                          {formatCurrency(payout.tcsCollected, 0)}
                        </TableCell>
                        <TableCell className="text-sm font-semibold tabular-nums text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(payout.netPayout, 0)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              'px-2.5 py-0.5 text-[11px] font-medium rounded-full border-0',
                              style.bg,
                              style.text,
                            )}
                          >
                            <StatusIcon
                              className={cn(
                                'h-3 w-3 mr-1',
                                payout.status === 'processed' && 'animate-spin',
                              )}
                            />
                            {style.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-1.5">
                            {payout.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openActionDialog(payout, 'process')}
                                className="h-7 px-2 text-xs gap-1"
                              >
                                <Banknote className="h-3 w-3" />
                                Process
                              </Button>
                            )}
                            {payout.status === 'processed' && (
                              <Button
                                size="sm"
                                onClick={() => openActionDialog(payout, 'complete')}
                                className="h-7 px-2 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Mark Paid
                              </Button>
                            )}
                            {(payout.status === 'paid' ||
                              payout.status === 'failed') && (
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(payout.paidAt || payout.processedAt)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── Pagination ── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            {refreshing ? (
              'Loading...'
            ) : (
              <>
                Showing{' '}
                {total === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}
                &#8211;
                {Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total}{' '}
                payouts
              </>
            )}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
              aria-label="Previous page"
            >
              <span aria-hidden>‹</span>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))
              .map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium transition-colors',
                    currentPage === page
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {page}
                </button>
              ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
              aria-label="Next page"
            >
              <span aria-hidden>›</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Create Settlement Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Create Seller Settlement
            </DialogTitle>
            <DialogDescription>
              Generate a payout for a seller by settling their delivered order
              items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="seller-select" className="text-sm font-medium">
                Select Seller
              </Label>
              {loadingSellers ? (
                <div className="flex items-center gap-2 h-9 px-3 text-xs text-muted-foreground bg-muted/30 rounded-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading sellers...
                </div>
              ) : sellers.length === 0 ? (
                <div className="flex items-center gap-2 h-9 px-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  No sellers available
                </div>
              ) : (
                <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                  <SelectTrigger id="seller-select" className="w-full">
                    <SelectValue placeholder="Choose a seller..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        <span className="flex items-center gap-2">
                          <Store className="h-3 w-3 text-muted-foreground" />
                          <span>{s.storeName || s.name || 'Unknown'}</span>
                          {s.email && (
                            <span className="text-[10px] text-muted-foreground">
                              ({s.email})
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-muted-foreground">
                Only delivered, unsettled order items will be included in this
                settlement.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSettlement}
              disabled={creating || !selectedSellerId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Create Settlement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Action Dialog (Process / Mark Paid) ── */}
      <Dialog
        open={!!actionPayout}
        onOpenChange={(open) => {
          if (!open) closeActionDialog()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'process' ? (
                <Banknote className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              )}
              {actionType === 'process' ? 'Process Payout' : 'Mark Payout as Paid'}
            </DialogTitle>
            <DialogDescription>
              {actionPayout && (
                <>
                  Payout{' '}
                  <span className="font-mono font-medium">
                    {actionPayout.payoutId}
                  </span>{' '}
                  for{' '}
                  <span className="font-medium">
                    {actionPayout.sellerStoreName || actionPayout.sellerName}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Net Payout
                </p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {actionPayout && formatCurrency(actionPayout.netPayout, 0)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Period
                </p>
                <p className="text-xs font-medium mt-0.5">
                  {actionPayout && formatDate(actionPayout.periodStart)} &rarr;{' '}
                  {actionPayout && formatDate(actionPayout.periodEnd)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="txn-ref" className="text-sm font-medium">
                Transaction Reference{' '}
                <span className="text-[10px] text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="txn-ref"
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                placeholder="UTR / NEFT / IMPS reference number"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                {actionType === 'process'
                  ? 'Marks the payout as processed (bank transfer initiated).'
                  : 'Marks the payout as paid (bank transfer completed).'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeActionDialog} disabled={updating}>
              Cancel
            </Button>
            <Button
              onClick={handleActionSubmit}
              disabled={updating}
              className={cn(
                'gap-2 text-white',
                actionType === 'process'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : 'bg-emerald-600 hover:bg-emerald-700',
              )}
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : actionType === 'process' ? (
                <Banknote className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {actionType === 'process' ? 'Mark Processed' : 'Mark Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Summary Card Component                                             */
/* ------------------------------------------------------------------ */

function SummaryCard({
  title,
  amount,
  count,
  icon: Icon,
  iconBg,
  iconColor,
  accentBar,
}: {
  title: string
  amount: number
  count: number
  icon: React.ElementType
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
              <p className="text-2xl font-bold tracking-tight mt-1 truncate">
                {formatINR(amount)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {count} payout{count !== 1 ? 's' : ''}
              </p>
            </div>
            <div
              className={cn(
                'flex items-center justify-center h-10 w-10 rounded-lg shrink-0',
                iconBg,
              )}
            >
              <Icon className={cn('h-5 w-5', iconColor)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
