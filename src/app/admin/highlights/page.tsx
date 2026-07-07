'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Calendar,

} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import AdminModal, {
  AdminDeleteModal,
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Highlight {
  _id: string
  name: string
  status: string
  createdBy: string
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

/* modalVariants removed — now provided by AdminModal */

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(isoString: string | null): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function shortId(id: string): string {
  return `#${id.slice(-5).toUpperCase()}`
}

function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    case 'draft':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    default:
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
  }
}

function getCreatedByBadgeClass(createdBy: string): string {
  switch (createdBy.toLowerCase()) {
    case 'admin':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    case 'seller':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    default:
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
  }
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function HighlightsPage() {
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
        <HighlightsContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Highlights Content                                                  */
/* ------------------------------------------------------------------ */

function HighlightsContent() {
  // Data state
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [totalHighlights, setTotalHighlights] = useState(0)
  const [loadingData, setLoadingData] = useState(true)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [createdByFilter, setCreatedByFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Message state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null)
  const [deletingHighlight, setDeletingHighlight] = useState<Highlight | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state (only name field)
  const [formName, setFormName] = useState('')
  const [formStatus, setFormStatus] = useState('Active')

  const itemsPerPage = 10

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch highlights from MongoDB                                    */
  /* ---------------------------------------------------------------- */

  const fetchHighlights = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (createdByFilter && createdByFilter !== 'all') params.set('createdBy', createdByFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/highlights?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch highlights')
      const data = await res.json().catch(() => ({}))

      setHighlights(data.highlights || [])
      setTotalHighlights(data.total || 0)
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load highlights from database' })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, statusFilter, createdByFilter, currentPage])

  useEffect(() => {
    fetchHighlights()
  }, [fetchHighlights])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, createdByFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(totalHighlights / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Selection                                                        */
  /* ---------------------------------------------------------------- */

  const allSelected = highlights.length > 0 &&
    highlights.every((h) => selectedIds.has(h._id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(highlights.map((h) => h._id)))
    }
  }, [allSelected, highlights])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Reset form                                                       */
  /* ---------------------------------------------------------------- */

  const resetForm = useCallback(() => {
    setFormName('')
    setFormStatus('Active')
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Open Create dialog                                               */
  /* ---------------------------------------------------------------- */

  const openCreate = useCallback(() => {
    resetForm()
    setCreateOpen(true)
  }, [resetForm])

  /* ---------------------------------------------------------------- */
  /*  Open Edit dialog                                                 */
  /* ---------------------------------------------------------------- */

  const openEdit = useCallback((highlight: Highlight) => {
    setEditingHighlight(highlight)
    setFormName(highlight.name)
    setFormStatus(highlight.status)
    setEditOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Open Delete dialog                                               */
  /* ---------------------------------------------------------------- */

  const openDelete = useCallback((highlight: Highlight) => {
    setDeletingHighlight(highlight)
    setDeleteOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Create highlight                                                 */
  /* ---------------------------------------------------------------- */

  const handleCreate = useCallback(async () => {
    if (!formName.trim()) {
      setMessage({ type: 'error', text: 'Highlight name is required' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create highlight')

      setCreateOpen(false)
      resetForm()
      setMessage({ type: 'success', text: `Highlight "${formName.trim()}" created successfully!` })
      fetchHighlights()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create highlight' })
    } finally {
      setSubmitting(false)
    }
  }, [formName, resetForm, fetchHighlights])

  /* ---------------------------------------------------------------- */
  /*  Update highlight                                                 */
  /* ---------------------------------------------------------------- */

  const handleUpdate = useCallback(async () => {
    if (!editingHighlight) return
    if (!formName.trim()) {
      setMessage({ type: 'error', text: 'Highlight name is required' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/highlights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: editingHighlight._id,
          name: formName.trim(),
          status: formStatus,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update highlight')

      setEditOpen(false)
      setEditingHighlight(null)
      resetForm()
      setMessage({ type: 'success', text: `Highlight "${formName.trim()}" updated successfully!` })
      fetchHighlights()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update highlight' })
    } finally {
      setSubmitting(false)
    }
  }, [editingHighlight, formName, formStatus, resetForm, fetchHighlights])

  /* ---------------------------------------------------------------- */
  /*  Delete highlight                                                 */
  /* ---------------------------------------------------------------- */

  const handleDelete = useCallback(async () => {
    if (!deletingHighlight) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/highlights?id=${deletingHighlight._id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete highlight')

      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletingHighlight._id)
        return next
      })
      setDeleteOpen(false)
      setDeletingHighlight(null)
      setMessage({ type: 'success', text: `Highlight "${deletingHighlight.name}" deleted successfully!` })
      fetchHighlights()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete highlight' })
    } finally {
      setSubmitting(false)
    }
  }, [deletingHighlight, fetchHighlights])

  /* ---------------------------------------------------------------- */
  /*  Bulk delete                                                      */
  /* ---------------------------------------------------------------- */

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/highlights/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete highlights')

      const count = data.deletedCount || selectedIds.size
      setSelectedIds(new Set())
      setMessage({ type: 'success', text: `${count} highlight${count === 1 ? '' : 's'} deleted successfully!` })
      fetchHighlights()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete highlights' })
    } finally {
      setSubmitting(false)
    }
  }, [selectedIds, fetchHighlights])

  /* ---------------------------------------------------------------- */
  /*  Date filter logic (client-side)                                  */
  /* ---------------------------------------------------------------- */

  const filteredHighlights = useMemo(() => {
    if (dateFilter === 'all') return highlights
    const now = new Date()
    return highlights.filter((h) => {
      const created = new Date(h.createdAt)
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
  }, [highlights, dateFilter])

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
            <h2 className="text-xl font-semibold tracking-tight">Highlights List</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your product highlights here.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={fetchHighlights}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>
        <Button
          onClick={openCreate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-2 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create Highlights
        </Button>
      </motion.div>

      {/* ── Toolbar ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search highlights..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 rounded-lg bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Created By Filter */}
          <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
            <SelectTrigger className="w-[130px] bg-muted/50 border-0 text-xs">
              <SelectValue placeholder="Created By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Creators</SelectItem>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="Seller">Seller</SelectItem>
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
            Loading highlights...
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
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Highlight Name</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created By</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {filteredHighlights.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Sparkles className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No highlights found</p>
                        <p className="text-xs">Try adjusting your search or create a new highlight</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHighlights.map((highlight) => (
                    <HighlightRow
                      key={highlight._id}
                      highlight={highlight}
                      selected={selectedIds.has(highlight._id)}
                      onToggleSelect={toggleSelect}
                      onEdit={openEdit}
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
                Showing {totalHighlights === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
                {Math.min(currentPage * itemsPerPage, totalHighlights)} of {totalHighlights} highlights
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

      {/* ── Create Highlight Modal ── */}
      <AdminModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        type="form"
        size="sm"
        title="Create Highlight"
        description="Add a new product highlight to the system."
        footer={
          <>
            <ModalCancelButton
              onClick={() => { setCreateOpen(false); resetForm() }}
              disabled={submitting}
            />
            <ModalSubmitButton
              onClick={handleCreate}
              submitting={submitting}
              icon={Plus}
            >
              Create
            </ModalSubmitButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-name" className="text-sm font-medium">Highlight Name</Label>
            <Input
              id="create-name"
              placeholder="Enter highlight name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="rounded-lg"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) {
                  handleCreate()
                }
              }}
            />
          </div>
        </div>
      </AdminModal>

      {/* ── Edit Highlight Modal ── */}
      <AdminModal
        open={editOpen}
        onOpenChange={setEditOpen}
        type="form"
        size="sm"
        title="Edit Highlight"
        description="Update highlight information."
        footer={
          <>
            <ModalCancelButton
              onClick={() => { setEditOpen(false); setEditingHighlight(null); resetForm() }}
              disabled={submitting}
            />
            <ModalSubmitButton
              onClick={handleUpdate}
              submitting={submitting}
              icon={Pencil}
            >
              Update
            </ModalSubmitButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-sm font-medium">Highlight Name</Label>
            <Input
              id="edit-name"
              placeholder="Enter highlight name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="rounded-lg"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) {
                  handleUpdate()
                }
              }}
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Status</Label>
            <Select value={formStatus} onValueChange={setFormStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </AdminModal>

      {/* ── Delete Confirm Modal ── */}
      <AdminDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName="highlight"
        name={deletingHighlight?.name || ''}
        submitting={submitting}
        onDelete={handleDelete}
        onCancel={() => { setDeleteOpen(false); setDeletingHighlight(null) }}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Highlight Row Component                                            */
/* ------------------------------------------------------------------ */

function HighlightRow({
  highlight,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  highlight: Highlight
  selected: boolean
  onToggleSelect: (id: string) => void
  onEdit: (highlight: Highlight) => void
  onDelete: (highlight: Highlight) => void
}) {
  return (
    <motion.tr
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      className={cn(
        'border-b border-border/30 transition-colors',
        selected ? 'bg-primary/5' : 'hover:bg-muted/30',
      )}
    >
      <TableCell className="pl-4 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(highlight._id)}
          aria-label={`Select ${highlight.name}`}
        />
      </TableCell>
      <TableCell className="py-3">
        <span className="text-xs font-mono text-muted-foreground">{shortId(highlight._id)}</span>
      </TableCell>
      <TableCell className="py-3">
        <span className="text-sm font-medium">{highlight.name}</span>
      </TableCell>
      <TableCell className="py-3">
        <Badge variant="outline" className={cn('text-[11px] font-medium rounded-full px-2.5 py-0.5', getStatusBadgeClass(highlight.status))}>
          {highlight.status}
        </Badge>
      </TableCell>
      <TableCell className="py-3">
        <Badge variant="outline" className={cn('text-[11px] font-medium rounded-full px-2.5 py-0.5', getCreatedByBadgeClass(highlight.createdBy))}>
          {highlight.createdBy}
        </Badge>
      </TableCell>
      <TableCell className="py-3">
        <span className="text-xs text-muted-foreground">{formatDate(highlight.createdAt)}</span>
      </TableCell>
      <TableCell className="py-3 text-right pr-4">
        <div className="flex items-center justify-end gap-1">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onEdit(highlight)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDelete(highlight)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </TableCell>
    </motion.tr>
  )
}
