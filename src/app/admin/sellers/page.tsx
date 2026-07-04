'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
  Store,
  RefreshCw,
  Phone,
  Mail,
  Shield,
  Calendar,
  Clock,
  AlertTriangle,
  MapPin,
  FileCheck,
  BadgeCheck,
  Building2,
  XCircle,
  ExternalLink,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import AdminModal, {
  AdminDeleteModal,
} from '@/components/admin/admin-modal'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Seller {
  _id: string
  name: string
  email: string
  phone: string
  storeName: string
  address: string
  gstNumber: string
  panNumber: string
  role: string
  status: string
  isVerified: boolean
  failedLoginAttempts: number
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  verificationStatus?: string
  documents?: Record<string, any>
  businessType?: string
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                   */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const toastSlide = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/*  Helper: format date                                                */
/* ------------------------------------------------------------------ */

function formatDate(isoString: string | null): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(isoString: string | null): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/* ------------------------------------------------------------------ */
/*  Helper: format phone                                               */
/* ------------------------------------------------------------------ */

function formatPhone(phone: string): string {
  if (!phone) return '\u2014'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  }
  return phone
}

/* ------------------------------------------------------------------ */
/*  Helper: generate short ID from ObjectId                            */
/* ------------------------------------------------------------------ */

function shortId(id: string): string {
  return `#${id.slice(-5).toUpperCase()}`
}

/* ------------------------------------------------------------------ */
/*  Helper: get initials for avatar                                    */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function SellersPage() {
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
        <SellersContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sellers Content                                                     */
/* ------------------------------------------------------------------ */

function SellersContent() {
  // Data state
  const [sellers, setSellers] = useState<Seller[]>([])
  const [totalSellers, setTotalSellers] = useState(0)
  const [loadingData, setLoadingData] = useState(true)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Message state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Dialog states
  const [viewOpen, setViewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [viewingSeller, setViewingSeller] = useState<Seller | null>(null)
  const [deletingSeller, setDeletingSeller] = useState<Seller | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Verification state
  const [rejectingDocType, setRejectingDocType] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [verificationNotes, setVerificationNotes] = useState('')
  const [verifyingDoc, setVerifyingDoc] = useState<string | null>(null)

  const itemsPerPage = 10

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch sellers from MongoDB                                       */
  /* ---------------------------------------------------------------- */

  const fetchSellers = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/sellers?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch sellers')
      const data = await res.json().catch(() => ({}))

      setSellers(data.sellers || [])
      setTotalSellers(data.total || 0)
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load sellers from database' })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, statusFilter, currentPage])

  useEffect(() => {
    fetchSellers()
  }, [fetchSellers])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(totalSellers / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Selection                                                        */
  /* ---------------------------------------------------------------- */

  const allSelected = sellers.length > 0 &&
    sellers.every((s) => selectedIds.has(s._id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sellers.map((s) => s._id)))
    }
  }, [allSelected, sellers])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /*  View seller detail                                               */
  /* ---------------------------------------------------------------- */

  const openView = useCallback((s: Seller) => {
    setViewingSeller(s)
    setViewOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Delete seller                                                    */
  /* ---------------------------------------------------------------- */

  const openDelete = useCallback((s: Seller) => {
    setDeletingSeller(s)
    setDeleteOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deletingSeller) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/sellers?id=${deletingSeller._id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete seller')

      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletingSeller._id)
        return next
      })
      setDeleteOpen(false)
      setDeletingSeller(null)
      setMessage({ type: 'success', text: `Seller "${deletingSeller.name}" deleted successfully!` })
      fetchSellers()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete seller' })
    } finally {
      setSubmitting(false)
    }
  }, [deletingSeller, fetchSellers])

  /* ---------------------------------------------------------------- */
  /*  Bulk delete                                                      */
  /* ---------------------------------------------------------------- */

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      const ids = Array.from(selectedIds)
      const results = await Promise.allSettled(
        ids.map(id => fetch(`/api/admin/sellers?id=${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter(r => r.status === 'rejected').length
      const count = ids.length - failed
      setSelectedIds(new Set())
      setMessage({
        type: failed > 0 ? 'error' : 'success',
        text: failed > 0
          ? `${count} seller(s) deleted, ${failed} failed`
          : `${count} seller${count === 1 ? '' : 's'} deleted successfully!`,
      })
      fetchSellers()
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete sellers' })
    } finally {
      setSubmitting(false)
    }
  }, [selectedIds, fetchSellers])

  /* ---------------------------------------------------------------- */
  /*  Document verification                                            */
  /* ---------------------------------------------------------------- */

  const handleVerifyAction = useCallback(async (
    action: 'approve_all' | 'approve_document' | 'reject_document' | 'request_resubmission' | 'reject_all',
    documentType?: string,
    reason?: string,
    notes?: string,
  ) => {
    if (!viewingSeller) return
    setVerifyingDoc(documentType || action)
    try {
      const body: Record<string, any> = {
        sellerId: viewingSeller._id,
        action,
      }
      if (documentType) body.documentType = documentType
      if (reason) body.rejectionReason = reason
      if (notes) body.notes = notes

      const res = await fetch('/api/admin/sellers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Verification action failed')

      // Update the viewing seller with fresh data
      setViewingSeller((prev) => {
        if (!prev) return prev
        return { ...prev, ...data.seller }
      })

      setMessage({ type: 'success', text: data.message || `Document ${action.replace(/_/g, ' ')} successful` })
      setRejectingDocType(null)
      setRejectionReason('')
      setVerificationNotes('')
      fetchSellers()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Verification action failed' })
    } finally {
      setVerifyingDoc(null)
    }
  }, [viewingSeller, fetchSellers])

  /* ---------------------------------------------------------------- */
  /*  Date filter logic                                                */
  /* ---------------------------------------------------------------- */

  const filteredSellers = useMemo(() => {
    if (dateFilter === 'all') return sellers
    const now = new Date()
    return sellers.filter((s) => {
      const created = new Date(s.createdAt)
      switch (dateFilter) {
        case 'today':
          return created.toDateString() === now.toDateString()
        case '7days':
          return (now.getTime() - created.getTime()) <= 7 * 24 * 60 * 60 * 1000
        case '30days':
          return (now.getTime() - created.getTime()) <= 30 * 24 * 60 * 60 * 1000
        case '90days':
          return (now.getTime() - created.getTime()) <= 90 * 24 * 60 * 60 * 1000
        default:
          return true
      }
    })
  }, [sellers, dateFilter])

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
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-current opacity-50 hover:opacity-100 transition-opacity">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Sellers List</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your registered sellers here.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={fetchSellers}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>
      </motion.div>

      {/* ── Toolbar ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 rounded-lg bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] bg-muted/50 border-0 text-xs">
              <Shield className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[130px] bg-muted/50 border-0 text-xs">
              <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="90days">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>

          {/* Bulk Delete */}
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                disabled={submitting}
                className="h-9 text-xs gap-1.5 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete ({selectedIds.size})
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* ── Table ── */}
      <motion.div variants={fadeInUp} className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        {loadingData ? (
          <div className="flex items-center justify-center py-20 gap-2.5 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading sellers...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[44px] pl-4">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sellers</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone Number</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {filteredSellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Store className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No sellers found</p>
                        <p className="text-xs">Try adjusting your search or filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSellers.map((seller) => (
                    <SellerRow
                      key={seller._id}
                      seller={seller}
                      selected={selectedIds.has(seller._id)}
                      onToggleSelect={toggleSelect}
                      onView={openView}
                      onDelete={openDelete}
                    />
                  ))
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        )}

        {/* ── Pagination ── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            {loadingData ? 'Loading...' : (
              <>
                Showing {totalSellers === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
                {Math.min(currentPage * itemsPerPage, totalSellers)} of {totalSellers} sellers
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
              Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2)
            ).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium transition-colors',
                  currentPage === page
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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

      {/* ── View Seller Modal ── */}
      <AdminModal
        open={viewOpen}
        onOpenChange={setViewOpen}
        type="view"
        size="md"
        title={viewingSeller?.name || 'Seller Details'}
        description={viewingSeller ? `${shortId(viewingSeller._id)} \u00b7 ${viewingSeller.storeName}` : undefined}
      >
        {viewingSeller && (
          <>
            {/* Avatar + Status */}
            <div className="flex items-center gap-4 mb-4">
              <Avatar className="h-14 w-14 bg-blue-100 dark:bg-blue-900/30">
                <AvatarFallback className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-lg font-semibold">
                  {getInitials(viewingSeller.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start gap-1.5">
                <Badge
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full',
                    viewingSeller.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : viewingSeller.status === 'Blocked'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                      : viewingSeller.status === 'Pending'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      : 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
                  )}
                >
                  {viewingSeller.status}
                </Badge>
                {viewingSeller.verificationStatus && (
                  <Badge
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-medium rounded-full gap-1',
                      viewingSeller.verificationStatus === 'verified'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : viewingSeller.verificationStatus === 'rejected'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                        : viewingSeller.verificationStatus === 'resubmission_requested'
                        ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
                        : viewingSeller.verificationStatus === 'in_review'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    )}
                  >
                    {viewingSeller.verificationStatus === 'verified' ? (
                      <><CheckCircle2 className="h-3 w-3" /> Verified</>
                    ) : viewingSeller.verificationStatus === 'rejected' ? (
                      <><XCircle className="h-3 w-3" /> Rejected</>
                    ) : viewingSeller.verificationStatus === 'resubmission_requested' ? (
                      <><RefreshCw className="h-3 w-3" /> Resubmission Requested</>
                    ) : viewingSeller.verificationStatus === 'in_review' ? (
                      <><Eye className="h-3 w-3" /> In Review</>
                    ) : (
                      <><Clock className="h-3 w-3" /> Pending Verification</>
                    )}
                  </Badge>
                )}
                {viewingSeller.isVerified && (
                  <Badge className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 gap-1">
                    <BadgeCheck className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact Information</h4>
              <div className="grid grid-cols-1 gap-2.5">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{viewingSeller.email || 'Not provided'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium">{formatPhone(viewingSeller.phone)}</p>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Store Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store Information</h4>
              <div className="grid grid-cols-1 gap-2.5">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Store Name</p>
                    <p className="text-sm font-medium">{viewingSeller.storeName || 'Not provided'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="text-sm font-medium">{viewingSeller.address || 'Not provided'}</p>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Business Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business Details</h4>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <FileCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">GST Number</p>
                    <p className="text-sm font-medium">{viewingSeller.gstNumber || 'Not provided'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <FileCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">PAN Number</p>
                    <p className="text-sm font-medium">{viewingSeller.panNumber || 'Not provided'}</p>
                  </div>
                </div>
                {viewingSeller.businessType && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Business Type</p>
                      <p className="text-sm font-medium">{viewingSeller.businessType}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator className="my-4" />

            {/* Activity Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity</h4>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Joined</p>
                    <p className="text-sm font-medium">{formatDate(viewingSeller.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last Login</p>
                    <p className="text-sm font-medium">{formatDateTime(viewingSeller.lastLoginAt)}</p>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Document Verification Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Verification</h4>
                {viewingSeller.verificationStatus && viewingSeller.verificationStatus !== 'verified' && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 rounded-lg border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400"
                      disabled={!!verifyingDoc}
                      onClick={() => handleVerifyAction('approve_all')}
                    >
                      {verifyingDoc === 'approve_all' ? (
                        <div className="h-3.5 w-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Approve All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 rounded-lg border-orange-500/30 text-orange-600 hover:bg-orange-500/10 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-400"
                      disabled={!!verifyingDoc}
                      onClick={() => handleVerifyAction('request_resubmission', undefined, undefined, verificationNotes || undefined)}
                    >
                      {verifyingDoc === 'request_resubmission' ? (
                        <div className="h-3.5 w-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Request Resubmission
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 rounded-lg border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
                      disabled={!!verifyingDoc}
                      onClick={() => handleVerifyAction('reject_all', undefined, rejectionReason || 'Documents do not meet requirements', verificationNotes || undefined)}
                    >
                      {verifyingDoc === 'reject_all' ? (
                        <div className="h-3.5 w-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      Reject All
                    </Button>
                  </div>
                )}
              </div>

              {/* Verification Notes */}
              {viewingSeller.verificationStatus && viewingSeller.verificationStatus !== 'verified' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Verification Notes
                  </label>
                  <Textarea
                    placeholder="Add notes for the seller (optional)..."
                    value={verificationNotes}
                    onChange={(e) => setVerificationNotes(e.target.value)}
                    className="text-sm min-h-[60px] resize-none bg-muted/30"
                  />
                </div>
              )}

              {/* Document List */}
              {viewingSeller.documents && Object.keys(viewingSeller.documents).length > 0 ? (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {Object.entries(viewingSeller.documents).map(([docType, doc]: [string, any]) => {
                    const docLabel = docType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                    const isVerified = doc.verified === true
                    const isRejected = doc.rejectionReason && !doc.verified
                    const isPending = !doc.verified && !doc.rejectionReason

                    return (
                      <div
                        key={docType}
                        className={cn(
                          'p-3 rounded-lg border transition-colors',
                          isVerified
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : isRejected
                            ? 'bg-red-500/5 border-red-500/20'
                            : 'bg-amber-500/5 border-amber-500/20'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* Document thumbnail / link */}
                            {doc.url && (
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50 border border-border/50 hover:bg-accent transition-colors shrink-0"
                                title={`View ${docLabel}`}
                              >
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                              </a>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <FileCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <p className="text-sm font-medium truncate">{docLabel}</p>
                                {isVerified ? (
                                  <Badge className="px-2 py-0 text-[10px] font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-0.5 shrink-0">
                                    <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                                  </Badge>
                                ) : isRejected ? (
                                  <Badge className="px-2 py-0 text-[10px] font-medium rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 gap-0.5 shrink-0">
                                    <XCircle className="h-2.5 w-2.5" /> Rejected
                                  </Badge>
                                ) : (
                                  <Badge className="px-2 py-0 text-[10px] font-medium rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-0.5 shrink-0">
                                    <Clock className="h-2.5 w-2.5" /> Pending
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Uploaded: {doc.uploadedAt ? formatDate(doc.uploadedAt) : 'Unknown'}
                                {doc.verifiedAt && ` · Verified: ${formatDate(doc.verifiedAt)}`}
                              </p>
                              {isRejected && doc.rejectionReason && (
                                <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                                  Reason: {doc.rejectionReason}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Per-document actions */}
                          {!isVerified && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] gap-1 rounded-md border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400 px-2"
                                disabled={!!verifyingDoc}
                                onClick={() => handleVerifyAction('approve_document', docType)}
                              >
                                {verifyingDoc === docType ? (
                                  <div className="h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                Approve
                              </Button>
                              {rejectingDocType === docType ? (
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    placeholder="Rejection reason..."
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    className="h-7 text-xs w-32 bg-muted/30"
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] gap-1 rounded-md border-red-500/30 text-red-600 hover:bg-red-500/10 px-2"
                                    disabled={!rejectionReason.trim() || !!verifyingDoc}
                                    onClick={() => handleVerifyAction('reject_document', docType, rejectionReason, verificationNotes || undefined)}
                                  >
                                    Confirm
                                  </Button>
                                  <button
                                    onClick={() => { setRejectingDocType(null); setRejectionReason('') }}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[10px] gap-1 rounded-md border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400 px-2"
                                  disabled={!!verifyingDoc}
                                  onClick={() => setRejectingDocType(docType)}
                                >
                                  <XCircle className="h-3 w-3" />
                                  Reject
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <FileCheck className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No documents uploaded</p>
                  <p className="text-xs">The seller has not uploaded any verification documents yet.</p>
                </div>
              )}
            </div>

            {/* Blocked info if applicable */}
            {viewingSeller.status === 'Blocked' && (
              <>
                <Separator className="my-4" />
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive">Block Information</h4>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-destructive">
                        Account blocked due to suspicious activity
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Failed login attempts: {viewingSeller.failedLoginAttempts}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </AdminModal>

      {/* ── Delete Confirm Modal ── */}
      <AdminDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName="seller"
        name={deletingSeller?.name || ''}
        warningText="This action cannot be undone. All seller data including store information will be permanently removed."
        submitting={submitting}
        onDelete={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Seller Row Component                                                */
/* ------------------------------------------------------------------ */

function SellerRow({
  seller,
  selected,
  onToggleSelect,
  onView,
  onDelete,
}: {
  seller: Seller
  selected: boolean
  onToggleSelect: (id: string) => void
  onView: (s: Seller) => void
  onDelete: (s: Seller) => void
}) {
  return (
    <motion.tr
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      className="group hover:bg-muted/30 transition-colors"
    >
      <TableCell className="pl-4 w-[44px]">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(seller._id)}
          aria-label={`Select ${seller.name}`}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground font-mono">
        {shortId(seller._id)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
              {getInitials(seller.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{seller.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground truncate max-w-[140px]">
            {seller.storeName || '\u2014'}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {seller.email || '\u2014'}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatPhone(seller.phone)}
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            'px-2.5 py-0.5 text-xs font-medium rounded-full',
            seller.status === 'Active'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : seller.status === 'Blocked'
              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
              : seller.status === 'Pending'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              : 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
          )}
        >
          {seller.status === 'Active' ? 'Active' : seller.status === 'Blocked' ? 'Blocked' : seller.status === 'Pending' ? 'Pending' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(seller.createdAt)}
      </TableCell>
      <TableCell className="text-right pr-6">
        <div className="flex items-center justify-end gap-1">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onView(seller)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="View"
          >
            <Eye className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDelete(seller)}
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
