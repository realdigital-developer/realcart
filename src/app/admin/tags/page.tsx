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
  Tag as TagIcon,
  RefreshCw,
  Calendar,
  FolderOpen,
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

interface Tag {
  _id: string
  name: string
  category: string
  createdBy: string
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

/* ------------------------------------------------------------------ */
/*  Helper: generate short ID from ObjectId                            */
/* ------------------------------------------------------------------ */

function shortId(id: string): string {
  return `#${id.slice(-5).toUpperCase()}`
}

/* ------------------------------------------------------------------ */
/*  Helper: category badge colors                                      */
/* ------------------------------------------------------------------ */

function getCategoryBadgeClass(category: string): string {
  switch (category.toLowerCase()) {
    case 'cloth':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    case 'fashion':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
    case 'electronics':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
    case 'accessories':
      return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
    case 'food':
      return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
    case 'general':
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
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

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function TagsPage() {
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
        <TagsContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tags Content                                                        */
/* ------------------------------------------------------------------ */

function TagsContent() {
  // Data state
  const [tags, setTags] = useState<Tag[]>([])
  const [totalTags, setTotalTags] = useState(0)
  const [categories, setCategories] = useState<string[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
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
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formStatus, setFormStatus] = useState('Active')
  const [formCreatedBy, setFormCreatedBy] = useState('Admin')
  const [isNewCategory, setIsNewCategory] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')

  const itemsPerPage = 10

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch tags from MongoDB                                          */
  /* ---------------------------------------------------------------- */

  const fetchTags = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (categoryFilter && categoryFilter !== 'all') params.set('category', categoryFilter)
      if (createdByFilter && createdByFilter !== 'all') params.set('createdBy', createdByFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/tags?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch tags')
      const data = await res.json().catch(() => ({}))

      setTags(data.tags || [])
      setTotalTags(data.total || 0)
      if (data.categories) setCategories(data.categories)
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load tags from database' })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, statusFilter, categoryFilter, createdByFilter, currentPage])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, categoryFilter, createdByFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(totalTags / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Selection                                                        */
  /* ---------------------------------------------------------------- */

  const allSelected = tags.length > 0 &&
    tags.every((t) => selectedIds.has(t._id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(tags.map((t) => t._id)))
    }
  }, [allSelected, tags])

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
    setFormCategory('')
    setFormStatus('Active')
    setFormCreatedBy('Admin')
    setIsNewCategory(false)
    setNewCategoryInput('')
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

  const openEdit = useCallback((tag: Tag) => {
    setEditingTag(tag)
    setFormName(tag.name)
    setFormCategory(tag.category)
    setFormStatus(tag.status)
    setFormCreatedBy(tag.createdBy)
    // Check if the tag's category exists in the categories list
    const categoryExists = categories.some(c => c.toLowerCase() === tag.category.toLowerCase())
    if (!categoryExists && tag.category) {
      setIsNewCategory(true)
      setNewCategoryInput(tag.category)
      setFormCategory('__new__')
    } else {
      setIsNewCategory(false)
      setNewCategoryInput('')
    }
    setEditOpen(true)
  }, [categories])

  /* ---------------------------------------------------------------- */
  /*  Open Delete dialog                                               */
  /* ---------------------------------------------------------------- */

  const openDelete = useCallback((tag: Tag) => {
    setDeletingTag(tag)
    setDeleteOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Create tag                                                       */
  /* ---------------------------------------------------------------- */

  const handleCreate = useCallback(async () => {
    if (!formName.trim()) {
      setMessage({ type: 'error', text: 'Tag name is required' })
      return
    }
    const categoryValue = formCategory === '__new__' ? newCategoryInput.trim() : formCategory
    if (!categoryValue) {
      setMessage({ type: 'error', text: 'Category is required' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          category: categoryValue,
          status: formStatus,
          createdBy: formCreatedBy,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create tag')

      setCreateOpen(false)
      resetForm()
      setMessage({ type: 'success', text: `Tag "${formName.trim()}" created successfully!` })
      fetchTags()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create tag' })
    } finally {
      setSubmitting(false)
    }
  }, [formName, formCategory, formStatus, formCreatedBy, newCategoryInput, resetForm, fetchTags])

  /* ---------------------------------------------------------------- */
  /*  Update tag                                                       */
  /* ---------------------------------------------------------------- */

  const handleUpdate = useCallback(async () => {
    if (!editingTag) return
    if (!formName.trim()) {
      setMessage({ type: 'error', text: 'Tag name is required' })
      return
    }
    const categoryValue = formCategory === '__new__' ? newCategoryInput.trim() : formCategory
    if (!categoryValue) {
      setMessage({ type: 'error', text: 'Category is required' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: editingTag._id,
          name: formName.trim(),
          category: categoryValue,
          status: formStatus,
          createdBy: formCreatedBy,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update tag')

      setEditOpen(false)
      setEditingTag(null)
      resetForm()
      setMessage({ type: 'success', text: `Tag "${formName.trim()}" updated successfully!` })
      fetchTags()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update tag' })
    } finally {
      setSubmitting(false)
    }
  }, [editingTag, formName, formCategory, formStatus, formCreatedBy, newCategoryInput, resetForm, fetchTags])

  /* ---------------------------------------------------------------- */
  /*  Delete tag                                                       */
  /* ---------------------------------------------------------------- */

  const handleDelete = useCallback(async () => {
    if (!deletingTag) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/tags?id=${deletingTag._id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete tag')

      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletingTag._id)
        return next
      })
      setDeleteOpen(false)
      setDeletingTag(null)
      setMessage({ type: 'success', text: `Tag "${deletingTag.name}" deleted successfully!` })
      fetchTags()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete tag' })
    } finally {
      setSubmitting(false)
    }
  }, [deletingTag, fetchTags])

  /* ---------------------------------------------------------------- */
  /*  Bulk delete                                                      */
  /* ---------------------------------------------------------------- */

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      const ids = Array.from(selectedIds)
      const results = await Promise.allSettled(
        ids.map(id => fetch(`/api/admin/tags?id=${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter(r => r.status === 'rejected').length
      const count = ids.length - failed
      setSelectedIds(new Set())
      setMessage({
        type: failed > 0 ? 'error' : 'success',
        text: failed > 0
          ? `${count} tag(s) deleted, ${failed} failed`
          : `${count} tag${count === 1 ? '' : 's'} deleted successfully!`,
      })
      fetchTags()
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete tags' })
    } finally {
      setSubmitting(false)
    }
  }, [selectedIds, fetchTags])

  /* ---------------------------------------------------------------- */
  /*  Date filter logic (client-side)                                  */
  /* ---------------------------------------------------------------- */

  const filteredTags = useMemo(() => {
    if (dateFilter === 'all') return tags
    const now = new Date()
    return tags.filter((t) => {
      const created = new Date(t.createdAt)
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
  }, [tags, dateFilter])

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
            <h2 className="text-xl font-semibold tracking-tight">Tags List</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your product tags here.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={fetchTags}
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
          Create Tags
        </Button>
      </motion.div>

      {/* ── Toolbar ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] bg-muted/50 border-0 text-xs">
              <FolderOpen className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Created By Filter */}
          <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
            <SelectTrigger className="w-[130px] bg-muted/50 border-0 text-xs">
              <TagIcon className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
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
            Loading tags...
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
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Create By</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {filteredTags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <TagIcon className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No tags found</p>
                        <p className="text-xs">Try adjusting your search or filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTags.map((tag) => (
                    <TagRow
                      key={tag._id}
                      tag={tag}
                      selected={selectedIds.has(tag._id)}
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
                Showing {totalTags === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
                {Math.min(currentPage * itemsPerPage, totalTags)} of {totalTags} tags
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

      {/* ── Create Tag Modal ── */}
      <AdminModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        type="form"
        size="md"
        title="Create Tag"
        description="Add a new product tag to the system."
        submitting={submitting}
        footer={
          <>
            <ModalCancelButton
              onClick={() => {
                setCreateOpen(false)
                resetForm()
              }}
              disabled={submitting}
            />
            <ModalSubmitButton
              onClick={handleCreate}
              disabled={submitting}
              submitting={submitting}
              icon={Plus}
            >
              Create
            </ModalSubmitButton>
          </>
        }
      >
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="create-name" className="text-sm font-medium">Name</Label>
          <Input
            id="create-name"
            placeholder="Enter tag name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Category</Label>
          {isNewCategory ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Enter new category name"
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => {
                  setIsNewCategory(false)
                  setNewCategoryInput('')
                  setFormCategory('')
                }}
                className="rounded-lg shrink-0 h-9 w-9 p-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={formCategory} onValueChange={(val) => {
                if (val === '__new__') {
                  setIsNewCategory(true)
                } else {
                  setFormCategory(val)
                }
              }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                  <Separator className="my-1" />
                  <SelectItem value="__new__">
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <Plus className="h-3.5 w-3.5" />
                      New Category
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
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

        {/* Created By */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Created By</Label>
          <Select value={formCreatedBy} onValueChange={setFormCreatedBy}>
            <SelectTrigger>
              <SelectValue placeholder="Select creator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="Seller">Seller</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </AdminModal>

      {/* ── Edit Tag Modal ── */}
      <AdminModal
        open={editOpen}
        onOpenChange={setEditOpen}
        type="form"
        size="md"
        title="Edit Tag"
        description="Update tag information."
        submitting={submitting}
        footer={
          <>
            <ModalCancelButton
              onClick={() => {
                setEditOpen(false)
                setEditingTag(null)
                resetForm()
              }}
              disabled={submitting}
            />
            <ModalSubmitButton
              onClick={handleUpdate}
              disabled={submitting}
              submitting={submitting}
              icon={Pencil}
            >
              Update
            </ModalSubmitButton>
          </>
        }
      >
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="edit-name" className="text-sm font-medium">Name</Label>
          <Input
            id="edit-name"
            placeholder="Enter tag name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Category</Label>
          {isNewCategory ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Enter new category name"
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => {
                  setIsNewCategory(false)
                  setNewCategoryInput('')
                  setFormCategory(editingTag?.category || '')
                }}
                className="rounded-lg shrink-0 h-9 w-9 p-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={formCategory} onValueChange={(val) => {
                if (val === '__new__') {
                  setIsNewCategory(true)
                } else {
                  setFormCategory(val)
                }
              }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                  <Separator className="my-1" />
                  <SelectItem value="__new__">
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <Plus className="h-3.5 w-3.5" />
                      New Category
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
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

        {/* Created By */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Created By</Label>
          <Select value={formCreatedBy} onValueChange={setFormCreatedBy}>
            <SelectTrigger>
              <SelectValue placeholder="Select creator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="Seller">Seller</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </AdminModal>

      {/* ── Delete Confirm Modal ── */}
      <AdminDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName="tag"
        name={deletingTag?.name || ''}
        submitting={submitting}
        onDelete={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tag Row Component                                                   */
/* ------------------------------------------------------------------ */

function TagRow({
  tag,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  tag: Tag
  selected: boolean
  onToggleSelect: (id: string) => void
  onEdit: (t: Tag) => void
  onDelete: (t: Tag) => void
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
          onCheckedChange={() => onToggleSelect(tag._id)}
          aria-label={`Select ${tag.name}`}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground font-mono">
        {shortId(tag._id)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
            <TagIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-sm font-medium">{tag.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            'px-2.5 py-0.5 text-xs font-medium rounded-full border',
            getCategoryBadgeClass(tag.category)
          )}
        >
          {tag.category}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          className={cn(
            'px-2.5 py-0.5 text-xs font-medium rounded-full border',
            getCreatedByBadgeClass(tag.createdBy)
          )}
        >
          {tag.createdBy}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(tag.createdAt)}
      </TableCell>
      <TableCell className="text-right pr-6">
        <div className="flex items-center justify-end gap-1">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onEdit(tag)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onDelete(tag)}
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
