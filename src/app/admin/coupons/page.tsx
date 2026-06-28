'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Ticket,
  Star,
  Calendar,
  Percent,
  IndianRupee,
  Users,
  TrendingUp,
  Clock,
  Store,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
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
import AdminModal, {
  AdminDeleteModal,
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface ClientCoupon {
  _id: string
  code: string
  title: string
  displayText: string
  description: string
  scope: 'platform' | 'seller'
  sellerStoreName: string | null
  discountType: 'percentage' | 'flat'
  discountValue: number
  maxDiscount: number
  minOrderAmount: number
  startDate: string | null
  endDate: string | null
  isActive: boolean
  usageLimit: number
  usedCount: number
  perCustomerLimit: number
  firstOrderOnly: boolean
  applicableCategories: string[]
  applicableProductIds: string[]
  applicableSellerIds: string[]
  featured: boolean
  createdAt: string
  updatedAt: string
}

interface CouponStats {
  total: number
  active: number
  expired: number
  redemptions: number
}

interface CouponFormState {
  code: string
  title: string
  displayText: string
  description: string
  discountType: 'percentage' | 'flat'
  discountValue: string
  maxDiscount: string
  minOrderAmount: string
  startDate: string
  endDate: string
  isActive: boolean
  usageLimit: string
  perCustomerLimit: string
  firstOrderOnly: boolean
  featured: boolean
  applicableCategories: string
  applicableProductIds: string
  applicableSellerIds: string
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
/* ------------------------------------------------------------------ */

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const toastSlide: Variants = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getCouponStatus(c: ClientCoupon): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const now = new Date()
  if (!c.isActive) return { label: 'Inactive', variant: 'secondary' }
  if (c.startDate && new Date(c.startDate) > now) return { label: 'Scheduled', variant: 'outline' }
  if (c.endDate && new Date(c.endDate) < now) return { label: 'Expired', variant: 'destructive' }
  return { label: 'Active', variant: 'default' }
}

function statusBadgeClass(variant: 'default' | 'secondary' | 'destructive' | 'outline'): string {
  switch (variant) {
    case 'default':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    case 'destructive':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
    case 'outline':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    default:
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
  }
}

const emptyForm: CouponFormState = {
  code: '',
  title: '',
  displayText: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  maxDiscount: '',
  minOrderAmount: '',
  startDate: '',
  endDate: '',
  isActive: true,
  usageLimit: '',
  perCustomerLimit: '',
  firstOrderOnly: false,
  featured: false,
  applicableCategories: '',
  applicableProductIds: '',
  applicableSellerIds: '',
}

function couponToForm(c: ClientCoupon): CouponFormState {
  return {
    code: c.code || '',
    title: c.title || '',
    displayText: c.displayText || '',
    description: c.description || '',
    discountType: c.discountType || 'percentage',
    discountValue: c.discountValue ? String(c.discountValue) : '',
    maxDiscount: c.maxDiscount ? String(c.maxDiscount) : '',
    minOrderAmount: c.minOrderAmount ? String(c.minOrderAmount) : '',
    startDate: toDateTimeLocal(c.startDate),
    endDate: toDateTimeLocal(c.endDate),
    isActive: c.isActive,
    usageLimit: c.usageLimit ? String(c.usageLimit) : '',
    perCustomerLimit: c.perCustomerLimit ? String(c.perCustomerLimit) : '',
    firstOrderOnly: c.firstOrderOnly,
    featured: c.featured,
    applicableCategories: (c.applicableCategories || []).join(', '),
    applicableProductIds: (c.applicableProductIds || []).join(', '),
    applicableSellerIds: (c.applicableSellerIds || []).join(', '),
  }
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function AdminCouponsPage() {
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
        <CouponsContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Coupons Content                                                     */
/* ------------------------------------------------------------------ */

function CouponsContent() {
  // Data state
  const [coupons, setCoupons] = useState<ClientCoupon[]>([])
  const [totalCoupons, setTotalCoupons] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [stats, setStats] = useState<CouponStats>({ total: 0, active: 0, expired: 0, redemptions: 0 })

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Message state (toast)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<ClientCoupon | null>(null)
  const [deletingCoupon, setDeletingCoupon] = useState<ClientCoupon | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState<CouponFormState>(emptyForm)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const itemsPerPage = 10

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
  }, [])

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch coupons                                                    */
  /* ---------------------------------------------------------------- */

  const fetchCoupons = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (scopeFilter && scopeFilter !== 'all') params.set('scope', scopeFilter)
      if (statusFilter === 'active') params.set('activeOnly', 'true')
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/coupons?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch coupons')
      const data = await res.json()

      setCoupons(data.coupons || [])
      setTotalCoupons(data.total || 0)
    } catch (err) {
      console.error('Fetch error:', err)
      showToast('error', 'Failed to load coupons')
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, scopeFilter, statusFilter, currentPage, showToast])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/coupons?limit=1000')
      if (!res.ok) return
      const data = await res.json()
      const all: ClientCoupon[] = data.coupons || []
      const now = new Date()
      setStats({
        total: data.total || all.length,
        active: all.filter(
          (c) =>
            c.isActive &&
            (!c.endDate || new Date(c.endDate) >= now) &&
            (!c.startDate || new Date(c.startDate) <= now),
        ).length,
        expired: all.filter((c) => c.endDate && new Date(c.endDate) < now).length,
        redemptions: all.reduce((sum, c) => sum + (c.usedCount || 0), 0),
      })
    } catch {
      // Non-fatal — stats just stay at zero
    }
  }, [])

  useEffect(() => {
    fetchCoupons()
  }, [fetchCoupons])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, scopeFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(totalCoupons / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Form helpers                                                     */
  /* ---------------------------------------------------------------- */

  const updateField = useCallback(<K extends keyof CouponFormState>(key: K, value: CouponFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFormErrors((prev) => {
      if (!prev[key as string]) return prev
      const next = { ...prev }
      delete next[key as string]
      return next
    })
  }, [])

  const resetForm = useCallback(() => {
    setForm(emptyForm)
    setFormErrors({})
  }, [])

  const openCreate = useCallback(() => {
    resetForm()
    setCreateOpen(true)
  }, [resetForm])

  const openEdit = useCallback((coupon: ClientCoupon) => {
    setEditingCoupon(coupon)
    setForm(couponToForm(coupon))
    setFormErrors({})
    setEditOpen(true)
  }, [])

  const openDelete = useCallback((coupon: ClientCoupon) => {
    setDeletingCoupon(coupon)
    setDeleteOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Validation                                                       */
  /* ---------------------------------------------------------------- */

  function validate(f: CouponFormState): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!f.code.trim()) errors.code = 'Coupon code is required'
    const dv = Number(f.discountValue)
    if (!f.discountValue || !Number.isFinite(dv) || dv <= 0) {
      errors.discountValue = 'Discount value must be greater than 0'
    } else if (f.discountType === 'percentage' && dv > 100) {
      errors.discountValue = 'Percentage cannot exceed 100'
    }
    if (f.startDate && f.endDate) {
      const s = new Date(f.startDate)
      const e = new Date(f.endDate)
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && s > e) {
        errors.endDate = 'End date must be after start date'
      }
    }
    return errors
  }

  /* ---------------------------------------------------------------- */
  /*  Build payload                                                    */
  /* ---------------------------------------------------------------- */

  function buildPayload(f: CouponFormState) {
    return {
      code: f.code.trim().toUpperCase(),
      title: f.title.trim(),
      displayText: f.displayText.trim(),
      description: f.description.trim(),
      discountType: f.discountType,
      discountValue: Number(f.discountValue) || 0,
      maxDiscount: Number(f.maxDiscount) || 0,
      minOrderAmount: Number(f.minOrderAmount) || 0,
      startDate: f.startDate ? new Date(f.startDate).toISOString() : null,
      endDate: f.endDate ? new Date(f.endDate).toISOString() : null,
      isActive: f.isActive,
      usageLimit: Number(f.usageLimit) || 0,
      perCustomerLimit: Number(f.perCustomerLimit) || 0,
      firstOrderOnly: f.firstOrderOnly,
      featured: f.featured,
      applicableCategories: splitList(f.applicableCategories),
      applicableProductIds: splitList(f.applicableProductIds),
      applicableSellerIds: splitList(f.applicableSellerIds),
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Create                                                           */
  /* ---------------------------------------------------------------- */

  const handleCreate = useCallback(async () => {
    const errors = validate(form)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      showToast('error', 'Please fix the errors in the form')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(form)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create coupon')

      setCreateOpen(false)
      resetForm()
      showToast('success', `Coupon "${form.code.trim().toUpperCase()}" created successfully!`)
      fetchCoupons()
      fetchStats()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create coupon')
    } finally {
      setSubmitting(false)
    }
  }, [form, resetForm, showToast, fetchCoupons, fetchStats])

  /* ---------------------------------------------------------------- */
  /*  Update                                                           */
  /* ---------------------------------------------------------------- */

  const handleUpdate = useCallback(async () => {
    if (!editingCoupon) return
    const errors = validate(form)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      showToast('error', 'Please fix the errors in the form')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: editingCoupon._id, ...buildPayload(form) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update coupon')

      setEditOpen(false)
      setEditingCoupon(null)
      resetForm()
      showToast('success', `Coupon "${form.code.trim().toUpperCase()}" updated successfully!`)
      fetchCoupons()
      fetchStats()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update coupon')
    } finally {
      setSubmitting(false)
    }
  }, [editingCoupon, form, resetForm, showToast, fetchCoupons, fetchStats])

  /* ---------------------------------------------------------------- */
  /*  Delete                                                           */
  /* ---------------------------------------------------------------- */

  const handleDelete = useCallback(async () => {
    if (!deletingCoupon) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: deletingCoupon._id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete coupon')

      setDeleteOpen(false)
      setDeletingCoupon(null)
      showToast('success', `Coupon "${deletingCoupon.code}" deleted successfully!`)
      fetchCoupons()
      fetchStats()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete coupon')
    } finally {
      setSubmitting(false)
    }
  }, [deletingCoupon, showToast, fetchCoupons, fetchStats])

  /* ---------------------------------------------------------------- */
  /*  Toggle active                                                    */
  /* ---------------------------------------------------------------- */

  const toggleActive = useCallback(async (coupon: ClientCoupon) => {
    const newValue = !coupon.isActive
    // Optimistic update
    setCoupons((prev) =>
      prev.map((c) => (c._id === coupon._id ? { ...c, isActive: newValue } : c)),
    )
    setTogglingId(coupon._id)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: coupon._id, isActive: newValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update coupon')
      fetchStats()
    } catch (err) {
      // Revert
      setCoupons((prev) =>
        prev.map((c) => (c._id === coupon._id ? { ...c, isActive: coupon.isActive } : c)),
      )
      showToast('error', err instanceof Error ? err.message : 'Failed to toggle status')
    } finally {
      setTogglingId(null)
    }
  }, [showToast, fetchStats])

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-5"
    >
      {/* ── Toast ── */}
      <AnimatePresence>
        {message && (
          <motion.div
            variants={toastSlide}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm shadow-lg border',
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border-destructive/20 text-destructive',
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-current opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Coupons</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create and manage discount coupons for your store.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              fetchCoupons()
              fetchStats()
            }}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>
        <Button
          onClick={openCreate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-2 shadow-sm w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Create Coupon
        </Button>
      </motion.div>

      {/* ── Stats ── */}
      <motion.div variants={fadeInUp} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Coupons"
          value={String(stats.total)}
          icon={Ticket}
          bgClass="bg-emerald-500/10"
          textClass="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label="Active"
          value={String(stats.active)}
          icon={CheckCircle2}
          bgClass="bg-teal-500/10"
          textClass="text-teal-600 dark:text-teal-400"
        />
        <StatCard
          label="Expired"
          value={String(stats.expired)}
          icon={Clock}
          bgClass="bg-red-500/10"
          textClass="text-red-600 dark:text-red-400"
        />
        <StatCard
          label="Total Redemptions"
          value={String(stats.redemptions)}
          icon={TrendingUp}
          bgClass="bg-amber-500/10"
          textClass="text-amber-600 dark:text-amber-400"
        />
      </motion.div>

      {/* ── Toolbar ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search coupons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Scope Filter */}
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-[140px] bg-muted/50 border-0 text-xs">
              <Store className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              <SelectItem value="platform">Platform</SelectItem>
              <SelectItem value="seller">Seller</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] bg-muted/50 border-0 text-xs">
              <Sparkles className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* ── Table / Cards ── */}
      <motion.div
        variants={fadeInUp}
        className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        {loadingData ? (
          <div className="flex items-center justify-center py-20 gap-2.5 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading coupons...
          </div>
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
            <Ticket className="h-8 w-8 opacity-40" />
            <p className="text-sm">No coupons found</p>
            <p className="text-xs">Try adjusting your search or filters</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-4">Code</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scope</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offer</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Min Order</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Validity</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Usage</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {coupons.map((coupon) => (
                      <CouponRow
                        key={coupon._id}
                        coupon={coupon}
                        onEdit={openEdit}
                        onDelete={openDelete}
                        onToggle={toggleActive}
                        toggling={togglingId === coupon._id}
                      />
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/40">
              {coupons.map((coupon) => (
                <CouponMobileCard
                  key={coupon._id}
                  coupon={coupon}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onToggle={toggleActive}
                  toggling={togglingId === coupon._id}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Pagination ── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            {loadingData ? (
              'Loading...'
            ) : (
              <>
                Showing {totalCoupons === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
                {Math.min(currentPage * itemsPerPage, totalCoupons)} of {totalCoupons} coupons
              </>
            )}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
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
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Create / Edit Modal ── */}
      <AdminModal
        open={createOpen || editOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditOpen(false)
            setEditingCoupon(null)
            resetForm()
          }
        }}
        type="form"
        size="2xl"
        title={editOpen ? 'Edit Coupon' : 'Create Coupon'}
        description={
          editOpen
            ? 'Update the coupon details below.'
            : 'Fill in the details below to create a new coupon.'
        }
        submitting={submitting}
        footer={
          <>
            <ModalCancelButton
              onClick={() => {
                setCreateOpen(false)
                setEditOpen(false)
                setEditingCoupon(null)
                resetForm()
              }}
              disabled={submitting}
            />
            <ModalSubmitButton
              onClick={editOpen ? handleUpdate : handleCreate}
              disabled={submitting}
              submitting={submitting}
              icon={editOpen ? Pencil : Plus}
            >
              {editOpen ? 'Save' : 'Create'}
            </ModalSubmitButton>
          </>
        }
      >
        <CouponForm
          form={form}
          errors={formErrors}
          updateField={updateField}
          showSellerIds
        />
      </AdminModal>

      {/* ── Delete Confirm Modal ── */}
      <AdminDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName="coupon"
        name={deletingCoupon?.code || ''}
        warningText="This will permanently delete the coupon. Existing orders that used this coupon are unaffected."
        submitting={submitting}
        onDelete={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                           */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon: Icon,
  bgClass,
  textClass,
}: {
  label: string
  value: string
  icon: typeof Ticket
  bgClass: string
  textClass: string
}) {
  return (
    <motion.div
      variants={fadeInUp}
      className="bg-card rounded-xl border border-border/60 p-4 flex items-center gap-3"
    >
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', bgClass)}>
        <Icon className={cn('h-5 w-5', textClass)} />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Coupon Form                                                         */
/* ------------------------------------------------------------------ */

function CouponForm({
  form,
  errors,
  updateField,
  showSellerIds,
}: {
  form: CouponFormState
  errors: Record<string, string>
  updateField: <K extends keyof CouponFormState>(key: K, value: CouponFormState[K]) => void
  showSellerIds: boolean
}) {
  return (
    <div className="space-y-6">
      {/* Section 1: Basic Info */}
      <FormSection title="Basic Info" icon={Ticket}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="coupon-code" className="text-sm font-medium">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="coupon-code"
              placeholder="SUMMER50"
              value={form.code}
              onChange={(e) => updateField('code', e.target.value.toUpperCase())}
              className={cn(errors.code && 'border-destructive focus-visible:ring-destructive/20')}
            />
            {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-title" className="text-sm font-medium">Title</Label>
            <Input
              id="coupon-title"
              placeholder="Flat ₹50 Off"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="coupon-display" className="text-sm font-medium">Display Text</Label>
            <Input
              id="coupon-display"
              placeholder="Get flat ₹50 off on orders above ₹499"
              value={form.displayText}
              onChange={(e) => updateField('displayText', e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="coupon-desc" className="text-sm font-medium">Description</Label>
            <Textarea
              id="coupon-desc"
              placeholder="Internal notes about this coupon..."
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </FormSection>

      <Separator />

      {/* Section 2: Discount */}
      <FormSection title="Discount" icon={Percent}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Discount Type</Label>
            <Select
              value={form.discountType}
              onValueChange={(v) => updateField('discountType', v as 'percentage' | 'flat')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="flat">Flat Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-value" className="text-sm font-medium">
              {form.discountType === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="coupon-value"
              type="number"
              min="0"
              step={form.discountType === 'percentage' ? '1' : '0.01'}
              placeholder={form.discountType === 'percentage' ? '10' : '50'}
              value={form.discountValue}
              onChange={(e) => updateField('discountValue', e.target.value)}
              className={cn(errors.discountValue && 'border-destructive focus-visible:ring-destructive/20')}
            />
            {errors.discountValue && <p className="text-xs text-destructive">{errors.discountValue}</p>}
          </div>
          {form.discountType === 'percentage' && (
            <div className="space-y-2">
              <Label htmlFor="coupon-max" className="text-sm font-medium">Max Discount Cap (₹)</Label>
              <Input
                id="coupon-max"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.maxDiscount}
                onChange={(e) => updateField('maxDiscount', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Cap at ₹ (0 = no cap)</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="coupon-min" className="text-sm font-medium">Min Order Amount (₹)</Label>
            <Input
              id="coupon-min"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={form.minOrderAmount}
              onChange={(e) => updateField('minOrderAmount', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minimum cart subtotal ₹ (0 = no minimum)</p>
          </div>
        </div>
      </FormSection>

      <Separator />

      {/* Section 3: Validity */}
      <FormSection title="Validity" icon={Calendar}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="coupon-start" className="text-sm font-medium">Start Date</Label>
            <Input
              id="coupon-start"
              type="datetime-local"
              value={form.startDate}
              onChange={(e) => updateField('startDate', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">When the coupon becomes active</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-end" className="text-sm font-medium">End Date</Label>
            <Input
              id="coupon-end"
              type="datetime-local"
              value={form.endDate}
              onChange={(e) => updateField('endDate', e.target.value)}
              className={cn(errors.endDate && 'border-destructive focus-visible:ring-destructive/20')}
            />
            {errors.endDate ? (
              <p className="text-xs text-destructive">{errors.endDate}</p>
            ) : (
              <p className="text-xs text-muted-foreground">When the coupon expires (blank = never)</p>
            )}
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Coupon is available for redemption</p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => updateField('isActive', v)}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>
      </FormSection>

      <Separator />

      {/* Section 4: Usage Limits */}
      <FormSection title="Usage Limits" icon={Users}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="coupon-usage" className="text-sm font-medium">Total Usage Limit</Label>
            <Input
              id="coupon-usage"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={form.usageLimit}
              onChange={(e) => updateField('usageLimit', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Max total redemptions (0 = unlimited)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-per" className="text-sm font-medium">Per Customer Limit</Label>
            <Input
              id="coupon-per"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={form.perCustomerLimit}
              onChange={(e) => updateField('perCustomerLimit', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Max uses per customer (0 = unlimited)</p>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <p className="text-sm font-medium">First Order Only</p>
              <p className="text-xs text-muted-foreground">Valid only on a customer&apos;s first order</p>
            </div>
            <Switch
              checked={form.firstOrderOnly}
              onCheckedChange={(v) => updateField('firstOrderOnly', v)}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>
      </FormSection>

      <Separator />

      {/* Section 5: Targeting */}
      <FormSection title="Targeting (Applicability)" icon={Sparkles}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coupon-cats" className="text-sm font-medium">Applicable Categories</Label>
            <Input
              id="coupon-cats"
              placeholder="Electronics, Fashion"
              value={form.applicableCategories}
              onChange={(e) => updateField('applicableCategories', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Comma-separated. Leave empty = all categories</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-prods" className="text-sm font-medium">Applicable Product IDs</Label>
            <Input
              id="coupon-prods"
              placeholder="prod_001, prod_002"
              value={form.applicableProductIds}
              onChange={(e) => updateField('applicableProductIds', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Comma-separated. Leave empty = all products</p>
          </div>
          {showSellerIds && (
            <div className="space-y-2">
              <Label htmlFor="coupon-sellers" className="text-sm font-medium">
                Applicable Seller IDs (optional, comma-separated)
              </Label>
              <Input
                id="coupon-sellers"
                placeholder="seller_001, seller_002"
                value={form.applicableSellerIds}
                onChange={(e) => updateField('applicableSellerIds', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave empty = all sellers</p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <p className="text-sm font-medium">Featured</p>
              <p className="text-xs text-muted-foreground">Highlight this coupon to customers</p>
            </div>
            <Switch
              checked={form.featured}
              onCheckedChange={(v) => updateField('featured', v)}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>
      </FormSection>
    </div>
  )
}

function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Ticket
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Coupon Row (Desktop)                                               */
/* ------------------------------------------------------------------ */

function CouponRow({
  coupon,
  onEdit,
  onDelete,
  onToggle,
  toggling,
}: {
  coupon: ClientCoupon
  onEdit: (c: ClientCoupon) => void
  onDelete: (c: ClientCoupon) => void
  onToggle: (c: ClientCoupon) => void
  toggling: boolean
}) {
  const status = getCouponStatus(coupon)
  return (
    <motion.tr
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      className="group hover:bg-muted/30 transition-colors"
    >
      <TableCell className="pl-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono">{coupon.code}</span>
          {coupon.featured && (
            <Badge className="px-1.5 py-0 text-[10px] font-medium rounded-full border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-0.5">
              <Star className="h-2.5 w-2.5 fill-current" />
              Featured
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {coupon.scope === 'platform' ? (
          <Badge className="px-2.5 py-0.5 text-xs font-medium rounded-full border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            Platform
          </Badge>
        ) : (
          <Badge className="px-2.5 py-0.5 text-xs font-medium rounded-full border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
            Seller: {coupon.sellerStoreName || '—'}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="max-w-[200px]">
          <p className="text-sm font-medium truncate">
            {coupon.title || coupon.displayText || 'Untitled coupon'}
          </p>
          {coupon.displayText && (
            <p className="text-xs text-muted-foreground truncate">{coupon.displayText}</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className="px-2.5 py-0.5 text-xs font-medium rounded-full"
        >
          {coupon.discountType === 'percentage' ? (
            <span className="flex items-center gap-1">
              <Percent className="h-3 w-3" />
              {coupon.discountValue}%
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <IndianRupee className="h-3 w-3" />
              {coupon.discountValue}
            </span>
          )}
        </Badge>
        {coupon.discountType === 'percentage' && coupon.maxDiscount > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">Max ₹{coupon.maxDiscount}</p>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {coupon.minOrderAmount > 0 ? `₹${coupon.minOrderAmount}` : '\u2014'}
      </TableCell>
      <TableCell>
        <div className="text-xs">
          <p className="text-muted-foreground">{formatDate(coupon.startDate)}</p>
          <p className="text-muted-foreground">{formatDate(coupon.endDate)}{!coupon.endDate && ' (No expiry)'}</p>
          <Badge
            className={cn(
              'mt-1 px-1.5 py-0 text-[10px] font-medium rounded-full border',
              statusBadgeClass(status.variant),
            )}
          >
            {status.label}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-xs">
          <p className="text-sm text-foreground">
            {coupon.usedCount} / {coupon.usageLimit === 0 ? '\u221E' : coupon.usageLimit}
          </p>
          <p className="text-muted-foreground">Per customer: {coupon.perCustomerLimit === 0 ? '\u221E' : coupon.perCustomerLimit}</p>
          {coupon.firstOrderOnly && (
            <Badge className="mt-1 px-1.5 py-0 text-[10px] font-medium rounded-full border bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">
              First order only
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Switch
          checked={coupon.isActive}
          disabled={toggling}
          onCheckedChange={() => onToggle(coupon)}
          className="data-[state=checked]:bg-emerald-600"
          aria-label={`Toggle ${coupon.code} active status`}
        />
      </TableCell>
      <TableCell className="text-right pr-6">
        <div className="flex items-center justify-end gap-1">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onEdit(coupon)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDelete(coupon)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </motion.button>
        </div>
      </TableCell>
    </motion.tr>
  )
}

/* ------------------------------------------------------------------ */
/*  Coupon Mobile Card                                                 */
/* ------------------------------------------------------------------ */

function CouponMobileCard({
  coupon,
  onEdit,
  onDelete,
  onToggle,
  toggling,
}: {
  coupon: ClientCoupon
  onEdit: (c: ClientCoupon) => void
  onDelete: (c: ClientCoupon) => void
  onToggle: (c: ClientCoupon) => void
  toggling: boolean
}) {
  const status = getCouponStatus(coupon)
  return (
    <motion.div
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      className="p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold font-mono">{coupon.code}</span>
            {coupon.featured && (
              <Badge className="px-1.5 py-0 text-[10px] font-medium rounded-full border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-0.5">
                <Star className="h-2.5 w-2.5 fill-current" />
                Featured
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium mt-1 truncate">
            {coupon.title || coupon.displayText || 'Untitled coupon'}
          </p>
          {coupon.displayText && (
            <p className="text-xs text-muted-foreground truncate">{coupon.displayText}</p>
          )}
        </div>
        <Badge
          className={cn(
            'px-2 py-0.5 text-[10px] font-medium rounded-full border shrink-0',
            statusBadgeClass(status.variant),
          )}
        >
          {status.label}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Scope</p>
          {coupon.scope === 'platform' ? (
            <Badge className="px-2 py-0 text-[10px] font-medium rounded-full border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              Platform
            </Badge>
          ) : (
            <Badge className="px-2 py-0 text-[10px] font-medium rounded-full border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
              {coupon.sellerStoreName || 'Seller'}
            </Badge>
          )}
        </div>
        <div>
          <p className="text-muted-foreground">Discount</p>
          <p className="font-medium">
            {coupon.discountType === 'percentage'
              ? `${coupon.discountValue}%${coupon.maxDiscount > 0 ? ` (max ₹${coupon.maxDiscount})` : ''}`
              : `₹${coupon.discountValue}`}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Min Order</p>
          <p className="font-medium">{coupon.minOrderAmount > 0 ? `₹${coupon.minOrderAmount}` : '\u2014'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Usage</p>
          <p className="font-medium">
            {coupon.usedCount} / {coupon.usageLimit === 0 ? '\u221E' : coupon.usageLimit}
            <span className="text-muted-foreground"> · Per: {coupon.perCustomerLimit === 0 ? '\u221E' : coupon.perCustomerLimit}</span>
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-muted-foreground">Validity</p>
          <p className="font-medium">
            {formatDate(coupon.startDate)} → {formatDate(coupon.endDate)}
            {!coupon.endDate && ' (No expiry)'}
          </p>
        </div>
      </div>

      {coupon.firstOrderOnly && (
        <Badge className="px-1.5 py-0 text-[10px] font-medium rounded-full border bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">
          First order only
        </Badge>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Switch
            checked={coupon.isActive}
            disabled={toggling}
            onCheckedChange={() => onToggle(coupon)}
            className="data-[state=checked]:bg-emerald-600"
            aria-label={`Toggle ${coupon.code} active status`}
          />
          <span className="text-xs text-muted-foreground">
            {coupon.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(coupon)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(coupon)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
