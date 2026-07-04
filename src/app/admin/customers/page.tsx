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
  Users,
  RefreshCw,
  Phone,
  Mail,
  Shield,
  Calendar,
  Clock,
  AlertTriangle,
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
import { cn } from '@/lib/utils'
import AdminModal, {
  AdminDeleteModal,
} from '@/components/admin/admin-modal'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Customer {
  _id: string
  name: string
  email: string
  mobile: string
  role: string
  status: string
  failedLoginAttempts: number
  lastLoginAt: string | null
  lastFailedAttempt: string | null
  blockedAt: string | null
  blockedReason: string | null
  createdAt: string
  updatedAt: string
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

function formatPhone(mobile: string): string {
  if (!mobile) return '\u2014'
  const digits = mobile.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  }
  return mobile
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

export default function CustomersPage() {
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
        <CustomersContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Customers Content                                                   */
/* ------------------------------------------------------------------ */

function CustomersContent() {
  // Data state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [totalCustomers, setTotalCustomers] = useState(0)
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
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null)
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const itemsPerPage = 10

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch customers from MongoDB                                     */
  /* ---------------------------------------------------------------- */

  const fetchCustomers = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/customers?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch customers')
      const data = await res.json().catch(() => ({}))

      setCustomers(data.customers || [])
      setTotalCustomers(data.total || 0)
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load customers from database' })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, statusFilter, currentPage])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(totalCustomers / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Selection                                                        */
  /* ---------------------------------------------------------------- */

  const allSelected = customers.length > 0 &&
    customers.every((c) => selectedIds.has(c._id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(customers.map((c) => c._id)))
    }
  }, [allSelected, customers])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /*  View customer detail                                             */
  /* ---------------------------------------------------------------- */

  const openView = useCallback((c: Customer) => {
    setViewingCustomer(c)
    setViewOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Delete customer                                                  */
  /* ---------------------------------------------------------------- */

  const openDelete = useCallback((c: Customer) => {
    setDeletingCustomer(c)
    setDeleteOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deletingCustomer) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/customers?id=${deletingCustomer._id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete customer')

      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletingCustomer._id)
        return next
      })
      setDeleteOpen(false)
      setDeletingCustomer(null)
      setMessage({ type: 'success', text: `Customer "${deletingCustomer.name}" deleted successfully!` })
      fetchCustomers()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete customer' })
    } finally {
      setSubmitting(false)
    }
  }, [deletingCustomer, fetchCustomers])

  /* ---------------------------------------------------------------- */
  /*  Bulk delete                                                      */
  /* ---------------------------------------------------------------- */

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      const ids = Array.from(selectedIds)
      const results = await Promise.allSettled(
        ids.map(id => fetch(`/api/admin/customers?id=${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter(r => r.status === 'rejected').length
      const count = ids.length - failed
      setSelectedIds(new Set())
      setMessage({
        type: failed > 0 ? 'error' : 'success',
        text: failed > 0
          ? `${count} customer(s) deleted, ${failed} failed`
          : `${count} customer${count === 1 ? '' : 's'} deleted successfully!`,
      })
      fetchCustomers()
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete customers' })
    } finally {
      setSubmitting(false)
    }
  }, [selectedIds, fetchCustomers])

  /* ---------------------------------------------------------------- */
  /*  Date filter logic                                                */
  /* ---------------------------------------------------------------- */

  const filteredCustomers = useMemo(() => {
    if (dateFilter === 'all') return customers
    const now = new Date()
    return customers.filter((c) => {
      const created = new Date(c.createdAt)
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
  }, [customers, dateFilter])

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
            <h2 className="text-xl font-semibold tracking-tight">Customers List</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your registered customers here.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={fetchCustomers}
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
            Loading customers...
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
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Users</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone Number</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Users className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No customers found</p>
                        <p className="text-xs">Try adjusting your search or filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <CustomerRow
                      key={customer._id}
                      customer={customer}
                      selected={selectedIds.has(customer._id)}
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
                Showing {totalCustomers === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
                {Math.min(currentPage * itemsPerPage, totalCustomers)} of {totalCustomers} customers
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

      {/* ── View Customer Modal ── */}
      <AdminModal
        open={viewOpen}
        onOpenChange={setViewOpen}
        type="view"
        size="md"
        title={viewingCustomer?.name || 'Customer Details'}
        description={viewingCustomer ? `${shortId(viewingCustomer._id)} \u00b7 ${viewingCustomer.role}` : undefined}
      >
        {viewingCustomer && (
          <>
            {/* Avatar + Status */}
            <div className="flex items-center gap-4 mb-4">
              <Avatar className="h-14 w-14 bg-emerald-100 dark:bg-emerald-900/30">
                <AvatarFallback className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-lg font-semibold">
                  {getInitials(viewingCustomer.name)}
                </AvatarFallback>
              </Avatar>
              <Badge
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full',
                  viewingCustomer.status === 'Active'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                )}
              >
                {viewingCustomer.status}
              </Badge>
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact Information</h4>
              <div className="grid grid-cols-1 gap-2.5">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{viewingCustomer.email || 'Not provided'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Mobile</p>
                    <p className="text-sm font-medium">{formatPhone(viewingCustomer.mobile)}</p>
                  </div>
                </div>
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
                    <p className="text-sm font-medium">{formatDate(viewingCustomer.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last Login</p>
                    <p className="text-sm font-medium">{formatDateTime(viewingCustomer.lastLoginAt)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Blocked info if applicable */}
            {viewingCustomer.status === 'Blocked' && (
              <>
                <Separator className="my-4" />
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive">Block Information</h4>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-destructive">
                        {viewingCustomer.blockedReason || 'Account blocked'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Blocked on {formatDateTime(viewingCustomer.blockedAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Failed login attempts: {viewingCustomer.failedLoginAttempts}
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
        itemName="customer"
        name={deletingCustomer?.name || ''}
        warningText="This action cannot be undone. All customer data will be permanently removed."
        submitting={submitting}
        onDelete={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Customer Row Component                                              */
/* ------------------------------------------------------------------ */

function CustomerRow({
  customer,
  selected,
  onToggleSelect,
  onView,
  onDelete,
}: {
  customer: Customer
  selected: boolean
  onToggleSelect: (id: string) => void
  onView: (c: Customer) => void
  onDelete: (c: Customer) => void
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
          onCheckedChange={() => onToggleSelect(customer._id)}
          aria-label={`Select ${customer.name}`}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground font-mono">
        {shortId(customer._id)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              {getInitials(customer.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{customer.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {customer.email || '\u2014'}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatPhone(customer.mobile)}
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            'px-2.5 py-0.5 text-xs font-medium rounded-full',
            customer.status === 'Active'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : customer.status === 'Blocked'
              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
              : 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
          )}
        >
          {customer.status === 'Active' ? 'Active' : customer.status === 'Blocked' ? 'Blocked' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(customer.createdAt)}
      </TableCell>
      <TableCell className="text-right pr-6">
        <div className="flex items-center justify-end gap-1">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onView(customer)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="View"
          >
            <Eye className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDelete(customer)}
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
