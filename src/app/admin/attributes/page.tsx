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
  CheckCircle2,
  AlertCircle,
  SlidersHorizontal,
  RefreshCw,
  Palette,
  Type,
  List,
  Calendar,
  Shield,
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
import AdminModal, {
  AdminDeleteModal,
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Attribute {
  _id: string
  name: string
  description: string
  type: string
  values: string[]
  status: string
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
/*  Helper: get badge color classes for attribute type                 */
/* ------------------------------------------------------------------ */

function getTypeBadgeClasses(type: string): string {
  switch (type) {
    case 'color':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
    case 'select':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
    case 'text':
    default:
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'color':
      return 'Color'
    case 'select':
      return 'Select'
    case 'text':
      return 'Text'
    default:
      return type.charAt(0).toUpperCase() + type.slice(1)
  }
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function AttributesPage() {
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
        <AttributesContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Attributes Content                                                  */
/* ------------------------------------------------------------------ */

function AttributesContent() {
  // Data state
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [totalAttributes, setTotalAttributes] = useState(0)
  const [loadingData, setLoadingData] = useState(true)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Message state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Dialog states
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deletingAttr, setDeletingAttr] = useState<Attribute | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form states
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formType, setFormType] = useState('text')
  const [formStatus, setFormStatus] = useState('Active')
  const [formValues, setFormValues] = useState('')
  const [editingAttr, setEditingAttr] = useState<Attribute | null>(null)

  const itemsPerPage = 10

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch attributes from MongoDB                                    */
  /* ---------------------------------------------------------------- */

  const fetchAttributes = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/attributes?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch attributes')
      const data = await res.json()

      setAttributes(data.attributes || [])
      setTotalAttributes(data.total || 0)
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load attributes from database' })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, statusFilter, typeFilter, currentPage])

  useEffect(() => {
    fetchAttributes()
  }, [fetchAttributes])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, typeFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(totalAttributes / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Selection                                                        */
  /* ---------------------------------------------------------------- */

  const allSelected = attributes.length > 0 &&
    attributes.every((a) => selectedIds.has(a._id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(attributes.map((a) => a._id)))
    }
  }, [allSelected, attributes])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Delete attribute                                                 */
  /* ---------------------------------------------------------------- */

  const openDelete = useCallback((a: Attribute) => {
    setDeletingAttr(a)
    setDeleteOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deletingAttr) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/attributes?id=${deletingAttr._id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete attribute')

      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletingAttr._id)
        return next
      })
      setDeleteOpen(false)
      setDeletingAttr(null)
      setMessage({ type: 'success', text: `Attribute "${deletingAttr.name}" deleted successfully!` })
      fetchAttributes()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete attribute' })
    } finally {
      setSubmitting(false)
    }
  }, [deletingAttr, fetchAttributes])

  /* ---------------------------------------------------------------- */
  /*  Bulk delete                                                      */
  /* ---------------------------------------------------------------- */

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      const ids = Array.from(selectedIds)
      const results = await Promise.allSettled(
        ids.map(id => fetch(`/api/admin/attributes?id=${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter(r => r.status === 'rejected').length
      const count = ids.length - failed
      setSelectedIds(new Set())
      setMessage({
        type: failed > 0 ? 'error' : 'success',
        text: failed > 0
          ? `${count} attribute(s) deleted, ${failed} failed`
          : `${count} attribute${count === 1 ? '' : 's'} deleted successfully!`,
      })
      fetchAttributes()
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete attributes' })
    } finally {
      setSubmitting(false)
    }
  }, [selectedIds, fetchAttributes])

  /* ---------------------------------------------------------------- */
  /*  Create attribute                                                 */
  /* ---------------------------------------------------------------- */

  const resetForm = useCallback(() => {
    setFormName('')
    setFormDescription('')
    setFormType('text')
    setFormStatus('Active')
    setFormValues('')
  }, [])

  const handleCreate = useCallback(async () => {
    if (!formName.trim()) {
      setMessage({ type: 'error', text: 'Attribute name is required' })
      return
    }
    const valuesList = formValues.split(',').map(v => v.trim()).filter(Boolean)
    if (valuesList.length === 0) {
      setMessage({ type: 'error', text: 'At least one value is required' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim(),
          type: formType,
          status: formStatus,
          values: valuesList,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create attribute')

      setCreateOpen(false)
      resetForm()
      setMessage({ type: 'success', text: `Attribute "${formName.trim()}" created successfully!` })
      fetchAttributes()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create attribute' })
    } finally {
      setSubmitting(false)
    }
  }, [formName, formDescription, formType, formStatus, formValues, fetchAttributes, resetForm])

  /* ---------------------------------------------------------------- */
  /*  Edit attribute                                                   */
  /* ---------------------------------------------------------------- */

  const openEdit = useCallback((a: Attribute) => {
    setEditingAttr(a)
    setFormName(a.name)
    setFormDescription(a.description || '')
    setFormType(a.type || 'text')
    setFormStatus(a.status)
    setFormValues(a.values?.join(', ') || '')
    setEditOpen(true)
  }, [])

  const handleEdit = useCallback(async () => {
    if (!formName.trim() || !editingAttr) {
      setMessage({ type: 'error', text: 'Attribute name is required' })
      return
    }
    const valuesList = formValues.split(',').map(v => v.trim()).filter(Boolean)
    if (valuesList.length === 0) {
      setMessage({ type: 'error', text: 'At least one value is required' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/attributes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: editingAttr._id,
          name: formName.trim(),
          description: formDescription.trim(),
          type: formType,
          status: formStatus,
          values: valuesList,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update attribute')

      setEditOpen(false)
      setEditingAttr(null)
      resetForm()
      setMessage({ type: 'success', text: `Attribute "${formName.trim()}" updated successfully!` })
      fetchAttributes()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update attribute' })
    } finally {
      setSubmitting(false)
    }
  }, [formName, formDescription, formType, formStatus, formValues, editingAttr, fetchAttributes, resetForm])

  /* ---------------------------------------------------------------- */
  /*  Date filter logic                                                */
  /* ---------------------------------------------------------------- */

  const filteredAttributes = useMemo(() => {
    if (dateFilter === 'all') return attributes
    const now = new Date()
    return attributes.filter((a) => {
      const created = new Date(a.createdAt)
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
  }, [attributes, dateFilter])

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
            <h2 className="text-xl font-semibold tracking-tight">Attributes List</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your product attributes here.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={fetchAttributes}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={() => { resetForm(); setCreateOpen(true) }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-lg shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Create Attributes
          </Button>
        </motion.div>
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
            className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
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
              <SelectItem value="Draft">Draft</SelectItem>
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px] bg-muted/50 border-0 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="color">Color</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="select">Select</SelectItem>
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
            Loading attributes...
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
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attribute Name</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Values</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {filteredAttributes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <SlidersHorizontal className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No attributes found</p>
                        <p className="text-xs">Try adjusting your search or filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAttributes.map((attr) => (
                    <AttributeRow
                      key={attr._id}
                      attr={attr}
                      selected={selectedIds.has(attr._id)}
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
                Showing {totalAttributes === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
                {Math.min(currentPage * itemsPerPage, totalAttributes)} of {totalAttributes} attributes
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

      {/* ── Create Attribute Modal ── */}
      <AdminModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        type="form"
        size="md"
        title="Create New Attribute"
        description="Add a new product attribute with values."
        submitting={submitting}
        footer={
          <>
            <ModalCancelButton onClick={() => setCreateOpen(false)} disabled={submitting} />
            <ModalSubmitButton onClick={handleCreate} submitting={submitting} icon={Plus}>
              Create
            </ModalSubmitButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Attribute Name</Label>
              <Input
                placeholder="e.g. Color, Size"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                size="lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger size="lg" className="w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="color">Color</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              placeholder="Short description of this attribute"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
              className="rounded-lg resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger size="lg" className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Values (comma-separated)</Label>
            <Input
              placeholder="e.g. Red, Blue, Green, Black"
              value={formValues}
              onChange={(e) => setFormValues(e.target.value)}
              size="lg"
            />
            <p className="text-[11px] text-muted-foreground">Separate each value with a comma</p>
          </div>
        </div>
      </AdminModal>

      {/* ── Edit Attribute Modal ── */}
      <AdminModal
        open={editOpen}
        onOpenChange={setEditOpen}
        type="form"
        size="md"
        title="Edit Attribute"
        description="Update attribute details and values."
        submitting={submitting}
        footer={
          <>
            <ModalCancelButton onClick={() => setEditOpen(false)} disabled={submitting} />
            <ModalSubmitButton onClick={handleEdit} submitting={submitting} icon={Pencil}>
              Save
            </ModalSubmitButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Attribute Name</Label>
              <Input
                placeholder="e.g. Color, Size"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                size="lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger size="lg" className="w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="color">Color</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              placeholder="Short description of this attribute"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
              className="rounded-lg resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger size="lg" className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Values (comma-separated)</Label>
            <Input
              placeholder="e.g. Red, Blue, Green, Black"
              value={formValues}
              onChange={(e) => setFormValues(e.target.value)}
              size="lg"
            />
            <p className="text-[11px] text-muted-foreground">Separate each value with a comma</p>
          </div>
        </div>
      </AdminModal>

      {/* ── Delete Confirm Modal ── */}
      <AdminDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName="attribute"
        name={deletingAttr?.name || ''}
        warningText="This action cannot be undone. The attribute and all its values will be permanently removed."
        submitting={submitting}
        onDelete={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Attribute Row Component                                            */
/* ------------------------------------------------------------------ */

function AttributeRow({
  attr,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  attr: Attribute
  selected: boolean
  onToggleSelect: (id: string) => void
  onEdit: (a: Attribute) => void
  onDelete: (a: Attribute) => void
}) {
  // Show max 3 values in the table, then "+N more"
  const visibleValues = attr.values?.slice(0, 3) || []
  const extraCount = (attr.values?.length || 0) - 3

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
          onCheckedChange={() => onToggleSelect(attr._id)}
          aria-label={`Select ${attr.name}`}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground font-mono">
        {shortId(attr._id)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className={cn(
              'text-xs font-semibold',
              attr.type === 'color'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : attr.type === 'select'
                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            )}>
              {getInitials(attr.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <span className="text-sm font-medium">{attr.name}</span>
            {attr.description && (
              <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{attr.description}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            'px-2.5 py-0.5 text-xs font-medium rounded-full gap-1',
            getTypeBadgeClasses(attr.type)
          )}
        >
          {attr.type === 'color' ? <Palette className="h-3 w-3" /> : attr.type === 'select' ? <List className="h-3 w-3" /> : <Type className="h-3 w-3" />}
          {getTypeLabel(attr.type)}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 flex-wrap max-w-[220px]">
          {attr.type === 'color' ? (
            visibleValues.map((val) => (
              <div
                key={val}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/40 text-[11px]"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full border border-border/50 shrink-0"
                  style={{ backgroundColor: val.toLowerCase() }}
                />
                {val}
              </div>
            ))
          ) : (
            visibleValues.map((val) => (
              <span key={val} className="px-1.5 py-0.5 rounded-md bg-muted/40 text-[11px]">
                {val}
              </span>
            ))
          )}
          {extraCount > 0 && (
            <span className="text-[11px] text-muted-foreground font-medium">+{extraCount} more</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            'px-2.5 py-0.5 text-xs font-medium rounded-full',
            attr.status === 'Active'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : attr.status === 'Draft'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              : 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
          )}
        >
          {attr.status}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(attr.createdAt)}
      </TableCell>
      <TableCell className="text-right pr-6">
        <div className="flex items-center justify-end gap-1">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onEdit(attr)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDelete(attr)}
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


