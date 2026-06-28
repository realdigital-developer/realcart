'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt,
  Clock,
  CheckCircle2,
  Banknote,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle,
  Wallet,
  Calendar,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

type ExpenseCategory =
  | 'operations'
  | 'marketing'
  | 'logistics'
  | 'technology'
  | 'salaries'
  | 'refunds'
  | 'payment_gateway'
  | 'cloud_infra'
  | 'legal'
  | 'office'
  | 'other'

type ExpenseStatus = 'pending' | 'approved' | 'paid' | 'rejected'

type PaymentMethod = 'bank_transfer' | 'upi' | 'card' | 'cash' | 'cheque'

interface Expense {
  _id: string
  expenseId: string
  category: ExpenseCategory
  description: string
  amount: number
  gstAmount?: number
  vendor?: string
  invoiceNumber?: string
  date: string | Date
  paymentMethod?: PaymentMethod
  status: ExpenseStatus
  createdBy?: string
  notes?: string
  approvedAt?: string
  paidAt?: string
  createdAt: string
  updatedAt: string
}

interface ExpensesResponse {
  expenses: Expense[]
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

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  operations: 'Operations',
  marketing: 'Marketing',
  logistics: 'Logistics',
  technology: 'Technology',
  salaries: 'Salaries',
  refunds: 'Refunds',
  payment_gateway: 'Payment Gateway',
  cloud_infra: 'Cloud Infra',
  legal: 'Legal',
  office: 'Office',
  other: 'Other',
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank Transfer',
  upi: 'UPI',
  card: 'Card',
  cash: 'Cash',
  cheque: 'Cheque',
}

const EXPENSE_STATUS_STYLES: Record<
  ExpenseStatus,
  { bg: string; text: string; label: string; icon: React.ElementType }
> = {
  pending: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Pending',
    icon: Clock,
  },
  approved: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-600 dark:text-sky-400',
    label: 'Approved',
    icon: CheckCircle2,
  },
  paid: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: 'Paid',
    icon: Banknote,
  },
  rejected: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    label: 'Rejected',
    icon: XCircle,
  },
}

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

function formatDate(isoString: string | Date | null | undefined): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const ITEMS_PER_PAGE = 10

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as ExpenseCategory[]

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

export default function ExpensesPage() {
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
        <ExpensesContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Expenses Content                                                   */
/* ------------------------------------------------------------------ */

function ExpensesContent() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [message, setMessage] = useState<ToastMessage | null>(null)

  // Add-expense dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    category: '' as ExpenseCategory | '',
    description: '',
    amount: '',
    gstAmount: '',
    vendor: '',
    invoiceNumber: '',
    date: toDateInputValue(new Date()),
    paymentMethod: '' as PaymentMethod | '',
    notes: '',
  })

  // Update-expense state (no separate dialog; inline action buttons)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Summary state
  const [summary, setSummary] = useState<{
    total: number
    pending: number
    approved: number
    paid: number
  }>({ total: 0, pending: 0, approved: 0, paid: 0 })

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [message])

  const fetchExpenses = useCallback(async () => {
    try {
      setRefreshing(true)
      const params = new URLSearchParams()
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', currentPage.toString())
      params.set('limit', ITEMS_PER_PAGE.toString())

      const res = await fetch(`/api/admin/finance/expenses?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch expenses')
      }
      const data = (await res.json()) as ExpensesResponse
      setExpenses(data.expenses || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Expenses fetch error:', err)
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load expenses',
      })
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [categoryFilter, statusFilter, currentPage])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [categoryFilter, statusFilter])

  /* ── Summary: fetch unfiltered up to 100 to compute totals ── */
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/finance/expenses?limit=100&page=1')
      if (!res.ok) return
      const data = (await res.json()) as ExpensesResponse
      const items = data.expenses || []
      const s = { total: 0, pending: 0, approved: 0, paid: 0 }
      for (const e of items) {
        // Only count non-rejected amounts toward the total
        if (e.status !== 'rejected') {
          s.total += e.amount || 0
        }
        if (e.status === 'pending') s.pending += e.amount || 0
        if (e.status === 'approved') s.approved += e.amount || 0
        if (e.status === 'paid') s.paid += e.amount || 0
      }
      setSummary(s)
    } catch (err) {
      console.error('Summary fetch error:', err)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))

  /* ── Add expense ── */
  const handleAddExpense = useCallback(async () => {
    if (!form.category) {
      setMessage({ type: 'error', text: 'Please select a category' })
      return
    }
    if (!form.description.trim()) {
      setMessage({ type: 'error', text: 'Description is required' })
      return
    }
    const amountNum = parseFloat(form.amount)
    if (!isFinite(amountNum) || amountNum <= 0) {
      setMessage({ type: 'error', text: 'Amount must be a positive number' })
      return
    }
    const gstNum = form.gstAmount ? parseFloat(form.gstAmount) : undefined
    if (gstNum !== undefined && (!isFinite(gstNum) || gstNum < 0)) {
      setMessage({ type: 'error', text: 'GST amount must be non-negative' })
      return
    }

    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        category: form.category,
        description: form.description.trim(),
        amount: amountNum,
      }
      if (gstNum !== undefined && !isNaN(gstNum)) body.gstAmount = gstNum
      if (form.vendor.trim()) body.vendor = form.vendor.trim()
      if (form.invoiceNumber.trim()) body.invoiceNumber = form.invoiceNumber.trim()
      if (form.date) body.date = new Date(form.date).toISOString()
      if (form.paymentMethod) body.paymentMethod = form.paymentMethod
      if (form.notes.trim()) body.notes = form.notes.trim()

      const res = await fetch('/api/admin/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create expense')
      }
      setMessage({
        type: 'success',
        text: data.expense?.expenseId
          ? `Expense ${data.expense.expenseId} created`
          : 'Expense created successfully',
      })
      setAddOpen(false)
      setForm({
        category: '',
        description: '',
        amount: '',
        gstAmount: '',
        vendor: '',
        invoiceNumber: '',
        date: toDateInputValue(new Date()),
        paymentMethod: '',
        notes: '',
      })
      fetchExpenses()
      fetchSummary()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create expense',
      })
    } finally {
      setCreating(false)
    }
  }, [form, fetchExpenses, fetchSummary])

  /* ── Update expense status ── */
  const handleUpdateStatus = useCallback(
    async (expense: Expense, status: 'approved' | 'paid' | 'rejected') => {
      setUpdatingId(expense._id)
      try {
        const res = await fetch(
          `/api/admin/finance/expenses/${encodeURIComponent(expense._id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          },
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update expense')
        }
        setMessage({
          type: 'success',
          text: `Expense ${expense.expenseId} marked as ${status}`,
        })
        fetchExpenses()
        fetchSummary()
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to update expense',
        })
      } finally {
        setUpdatingId(null)
      }
    },
    [fetchExpenses, fetchSummary],
  )

  /* ── Loading skeleton ── */
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
            Expense Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track, approve &amp; pay platform operational expenses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchExpenses}
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
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <SummaryCard
          title="Total Expenses"
          amount={summary.total}
          icon={Wallet}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-600 dark:text-rose-400"
          accentBar="bg-rose-500"
          subtitle="All non-rejected"
        />
        <SummaryCard
          title="Pending Approval"
          amount={summary.pending}
          icon={Clock}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600 dark:text-amber-400"
          accentBar="bg-amber-500"
        />
        <SummaryCard
          title="Approved"
          amount={summary.approved}
          icon={CheckCircle2}
          iconBg="bg-sky-500/10"
          iconColor="text-sky-600 dark:text-sky-400"
          accentBar="bg-sky-500"
        />
        <SummaryCard
          title="Paid"
          amount={summary.paid}
          icon={Banknote}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          accentBar="bg-emerald-500"
        />
      </motion.div>

      {/* ── Filters ── */}
      <motion.div
        variants={fadeInUp}
        className="flex items-center gap-2 flex-wrap"
      >
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] h-9 bg-muted/50 border-0 text-xs">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9 bg-muted/50 border-0 text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* ── Expenses Table ── */}
      <motion.div
        variants={fadeInUp}
        className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        {refreshing && expenses.length === 0 ? (
          <div className="flex items-center justify-center py-20 gap-2.5 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading expenses...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Expense ID
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Category
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Description
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    GST
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Vendor
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Date
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
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Receipt className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No expenses found</p>
                        <p className="text-xs">
                          Try adjusting filters or add a new expense
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => {
                    const style =
                      EXPENSE_STATUS_STYLES[expense.status] ||
                      EXPENSE_STATUS_STYLES.pending
                    const StatusIcon = style.icon
                    const isUpdating = updatingId === expense._id
                    return (
                      <TableRow
                        key={expense._id}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <TableCell>
                          <p className="text-xs font-mono font-medium truncate max-w-[140px]">
                            {expense.expenseId}
                          </p>
                          {expense.invoiceNumber && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                              Inv: {expense.invoiceNumber}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-muted/40 border-0 font-medium"
                          >
                            {CATEGORY_LABELS[expense.category] || expense.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium truncate max-w-[220px]">
                            {expense.description}
                          </p>
                          {expense.paymentMethod && (
                            <p className="text-[10px] text-muted-foreground">
                              {PAYMENT_METHOD_LABELS[expense.paymentMethod] ||
                                expense.paymentMethod}
                              {expense.notes ? ` · ${expense.notes}` : ''}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-semibold tabular-nums text-right">
                          {formatCurrency(expense.amount, 0)}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-right text-muted-foreground">
                          {expense.gstAmount
                            ? formatCurrency(expense.gstAmount, 0)
                            : '\u2014'}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs truncate max-w-[140px]">
                            {expense.vendor || '\u2014'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs">{formatDate(expense.date)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              'px-2.5 py-0.5 text-[11px] font-medium rounded-full border-0',
                              style.bg,
                              style.text,
                            )}
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {style.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-1.5">
                            {isUpdating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : expense.status === 'pending' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleUpdateStatus(expense, 'approved')
                                  }
                                  className="h-7 px-2 text-xs gap-1"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleUpdateStatus(expense, 'rejected')
                                  }
                                  className="h-7 px-2 text-xs gap-1 text-red-600 dark:text-red-400 hover:text-red-700"
                                >
                                  <XCircle className="h-3 w-3" />
                                  Reject
                                </Button>
                              </>
                            ) : expense.status === 'approved' ? (
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleUpdateStatus(expense, 'paid')
                                }
                                className="h-7 px-2 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <Banknote className="h-3 w-3" />
                                Mark Paid
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(expense.paidAt || expense.approvedAt)}
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
                expenses
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

      {/* ── Add Expense Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Add New Expense
            </DialogTitle>
            <DialogDescription>
              Record a new platform expense. New expenses start in
              &ldquo;Pending&rdquo; status awaiting approval.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="exp-category" className="text-xs font-medium">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as ExpenseCategory }))
                }
              >
                <SelectTrigger id="exp-category" className="h-9">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="exp-desc" className="text-xs font-medium">
                Description <span className="text-destructive">*</span>
              </Label>
              <Input
                id="exp-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="e.g. AWS cloud hosting - November"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount" className="text-xs font-medium">
                Amount (₹) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="exp-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-gst" className="text-xs font-medium">
                GST Amount (₹)
              </Label>
              <Input
                id="exp-gst"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.gstAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gstAmount: e.target.value }))
                }
                placeholder="0.00 (optional)"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-vendor" className="text-xs font-medium">
                Vendor
              </Label>
              <Input
                id="exp-vendor"
                value={form.vendor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vendor: e.target.value }))
                }
                placeholder="e.g. Amazon Web Services"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-invoice" className="text-xs font-medium">
                Invoice Number
              </Label>
              <Input
                id="exp-invoice"
                value={form.invoiceNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceNumber: e.target.value }))
                }
                placeholder="e.g. INV-2026-001"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-date" className="text-xs font-medium">
                Date
              </Label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  id="exp-date"
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-pm" className="text-xs font-medium">
                Payment Method
              </Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, paymentMethod: v as PaymentMethod }))
                }
              >
                <SelectTrigger id="exp-pm" className="h-9">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                    (m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="exp-notes" className="text-xs font-medium">
                Notes
              </Label>
              <Textarea
                id="exp-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Additional notes or remarks..."
                className="min-h-[60px] resize-none text-sm"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddExpense}
              disabled={creating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add Expense
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
  icon: Icon,
  iconBg,
  iconColor,
  accentBar,
  subtitle,
}: {
  title: string
  amount: number
  icon: React.ElementType
  iconBg: string
  iconColor: string
  accentBar: string
  subtitle?: string
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
              {subtitle && (
                <p className="text-[10px] text-muted-foreground mt-1 truncate">
                  {subtitle}
                </p>
              )}
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
