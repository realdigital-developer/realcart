'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  UserCircle,
  FolderOpen,
  ImagePlus,
  Upload,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  RefreshCw,
  Package,
  GripVertical,
  ArrowLeft,
  Folder,
  FolderTree,
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
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface SubCategory {
  _id: string
  name: string
  description: string
  parentCategory: string
  status: 'Active' | 'Draft'
  createdBy: 'Admin' | 'Seller'
  imageUrl: string | null
  imagePublicId: string | null
  productCount: number
  highlights: string[]
  displayOrder?: number
  createdAt: string | null
  updatedAt: string | null
}

interface Category {
  _id: string
  name: string
  description: string
  parentCategory: string
  status: 'Active' | 'Draft'
  createdBy: 'Admin' | 'Seller'
  imageUrl: string | null
  imagePublicId: string | null
  productCount: number
  subcategoryData: SubCategory[]
  highlights: string[]
  displayOrder?: number
  createdAt: string | null
  updatedAt: string | null
}

interface CategoryNameItem {
  _id: string
  name: string
  parentCategory: string
}

interface HighlightItem {
  _id: string
  name: string
  status: string
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                   */
/* ------------------------------------------------------------------ */

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const subRowVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, x: -8, transition: { duration: 0.15 } },
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
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function CategoriesPage() {
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
        <CategoriesContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Categories Content                                                  */
/* ------------------------------------------------------------------ */

function CategoriesContent() {
  // Data state
  const [categories, setCategories] = useState<Category[]>([])
  const [allCategoryNames, setAllCategoryNames] = useState<CategoryNameItem[]>([])
  const [totalCategories, setTotalCategories] = useState(0)
  const [loadingData, setLoadingData] = useState(true)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [creatorFilter, setCreatorFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Expanded state for subcategories
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Cloudinary status
  const [cloudinaryReady, setCloudinaryReady] = useState(false)

  // Message state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | SubCategory | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<Category | SubCategory | null>(null)

  // Form states
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formParentCategory, setFormParentCategory] = useState('None')
  const [formStatus, setFormStatus] = useState<'Active' | 'Draft'>('Active')
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null)
  const [formImageFile, setFormImageFile] = useState<File | null>(null)
  const [formImageRemoved, setFormImageRemoved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Highlights state
  const [allHighlights, setAllHighlights] = useState<HighlightItem[]>([])
  const [formHighlights, setFormHighlights] = useState<string[]>([])

  const imageInputRef = useRef<HTMLInputElement>(null)
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
    try {
      const res = await fetch('/api/admin/highlights?limit=100')
      if (!res.ok) return
      const data = await res.json()
      // Only show Active highlights
      setAllHighlights((data.highlights || []).filter((h: HighlightItem) => h.status === 'Active'))
    } catch {
      // Non-critical — highlights are optional
    }
  }, [])

  useEffect(() => { fetchHighlights() }, [fetchHighlights])

  /* ---------------------------------------------------------------- */
  /*  Fetch categories from MongoDB                                    */
  /* ---------------------------------------------------------------- */

  const fetchCategories = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (creatorFilter && creatorFilter !== 'all') params.set('createdBy', creatorFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/categories?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch categories')
      const data = await res.json()

      setCategories(data.categories || [])
      setAllCategoryNames(data.allCategoryNames || [])
      setTotalCategories(data.total || 0)
      setCloudinaryReady(data.cloudinaryConfigured ?? false)

      // Auto-expand all parent categories that have subcategories
      const expandableIds = (data.categories || [])
        .filter((cat: Category) => cat.subcategoryData && cat.subcategoryData.length > 0)
        .map((cat: Category) => cat._id)
      setExpandedIds(new Set(expandableIds))
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load categories from database' })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, creatorFilter, currentPage])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, creatorFilter])

  const totalPages = Math.max(1, Math.ceil(totalCategories / itemsPerPage))

  // Derive parent category options dynamically from DB: top-level categories only (parentCategory === 'None')
  const parentCategoryOptions = useMemo(() => {
    const topLevel = allCategoryNames
      .filter((cat) => cat.parentCategory === 'None')
      .map((cat) => cat.name)
    return ['None', ...topLevel]
  }, [allCategoryNames])

  /* ---------------------------------------------------------------- */
  /*  Selection                                                        */
  /* ---------------------------------------------------------------- */

  // Build all visible IDs (parents + their expanded subcategories)
  const allVisibleIds = useMemo(() => {
    const ids: string[] = []
    for (const cat of categories) {
      ids.push(cat._id)
      if (expandedIds.has(cat._id) && cat.subcategoryData) {
        for (const sub of cat.subcategoryData) {
          ids.push(sub._id)
        }
      }
    }
    return ids
  }, [categories, expandedIds])

  const allSelected = allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds.has(id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allVisibleIds))
    }
  }, [allSelected, allVisibleIds])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Expand / Collapse subcategories                                  */
  /* ---------------------------------------------------------------- */

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Image upload (store File for Cloudinary upload via API)          */
  /* ---------------------------------------------------------------- */

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Only .jpeg, .jpg, .png, .gif, .webp files are allowed' })
      return
    }
    if (file.size > 3.1 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Max file size is 3.1 MB' })
      return
    }
    setFormImageFile(file)
    setFormImageRemoved(false)
    const previewUrl = URL.createObjectURL(file)
    setFormImagePreview(previewUrl)
  }, [])

  const removeImage = useCallback(() => {
    if (formImagePreview && formImagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(formImagePreview)
    }
    setFormImagePreview(null)
    setFormImageFile(null)
    setFormImageRemoved(true)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }, [formImagePreview])

  /* ---------------------------------------------------------------- */
  /*  Create category                                                  */
  /* ---------------------------------------------------------------- */

  const handleCreate = useCallback(async () => {
    if (!formName.trim()) {
      setMessage({ type: 'error', text: 'Category name is required' })
      return
    }
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('name', formName.trim())
      formData.append('description', formDescription.trim())
      formData.append('parentCategory', formParentCategory)
      formData.append('status', formStatus)
      if (formImageFile) {
        formData.append('image', formImageFile)
      }

      if (formParentCategory !== 'None' && formHighlights.length > 0) {
        formData.append('highlights', JSON.stringify(formHighlights))
      }

      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create category')

      setCreateOpen(false)
      resetForm()
      setMessage({ type: 'success', text: `Category "${formName.trim()}" created successfully!` })
      fetchCategories()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create category' })
    } finally {
      setSubmitting(false)
    }
  }, [formName, formDescription, formParentCategory, formStatus, formImageFile, formHighlights, fetchCategories])

  /* ---------------------------------------------------------------- */
  /*  Edit category                                                    */
  /* ---------------------------------------------------------------- */

  const openEdit = useCallback((cat: Category | SubCategory) => {
    setEditingCategory(cat)
    setFormName(cat.name)
    setFormDescription(cat.description)
    setFormParentCategory(cat.parentCategory || 'None')
    setFormStatus(cat.status)
    setFormImagePreview(cat.imageUrl || null)
    setFormImageFile(null)
    setFormImageRemoved(false)
    setFormHighlights(cat.highlights || [])
    setEditOpen(true)
  }, [])

  const handleEdit = useCallback(async () => {
    if (!formName.trim() || !editingCategory) {
      setMessage({ type: 'error', text: 'Category name is required' })
      return
    }
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('_id', editingCategory._id)
      formData.append('name', formName.trim())
      formData.append('description', formDescription.trim())
      formData.append('parentCategory', formParentCategory)
      formData.append('status', formStatus)
      if (formImageFile) {
        formData.append('image', formImageFile)
      }
      if (formImageRemoved) {
        formData.append('removeImage', 'true')
      }

      if (formParentCategory !== 'None' && formHighlights.length > 0) {
        formData.append('highlights', JSON.stringify(formHighlights))
      }
      if (formParentCategory === 'None') {
        formData.append('highlights', JSON.stringify([]))
      }

      const res = await fetch('/api/admin/categories', {
        method: 'PUT',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update category')

      setEditOpen(false)
      setEditingCategory(null)
      resetForm()
      setMessage({ type: 'success', text: 'Category updated successfully!' })
      fetchCategories()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update category' })
    } finally {
      setSubmitting(false)
    }
  }, [formName, formDescription, formParentCategory, formStatus, formImageFile, formImageRemoved, formHighlights, editingCategory, fetchCategories])

  /* ---------------------------------------------------------------- */
  /*  Delete category                                                  */
  /* ---------------------------------------------------------------- */

  const openDelete = useCallback((cat: Category | SubCategory) => {
    setDeletingCategory(cat)
    setDeleteOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deletingCategory) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/categories?id=${deletingCategory._id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete category')

      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletingCategory._id)
        return next
      })
      setDeleteOpen(false)
      setDeletingCategory(null)
      setMessage({ type: 'success', text: `Category "${deletingCategory.name}" deleted successfully!` })
      fetchCategories()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete category' })
    } finally {
      setSubmitting(false)
    }
  }, [deletingCategory, fetchCategories])

  /* ---------------------------------------------------------------- */
  /*  Bulk delete                                                      */
  /* ---------------------------------------------------------------- */

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/categories/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete categories')

      const count = selectedIds.size
      setSelectedIds(new Set())
      setMessage({ type: 'success', text: `${count} categor${count === 1 ? 'y' : 'ies'} deleted successfully!` })
      fetchCategories()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete categories' })
    } finally {
      setSubmitting(false)
    }
  }, [selectedIds, fetchCategories])

  /* ---------------------------------------------------------------- */
  /*  Reset form                                                       */
  /* ---------------------------------------------------------------- */

  const resetForm = useCallback(() => {
    setFormName('')
    setFormDescription('')
    setFormParentCategory('None')
    setFormStatus('Active')
    if (formImagePreview && formImagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(formImagePreview)
    }
    setFormImagePreview(null)
    setFormImageFile(null)
    setFormImageRemoved(false)
    setFormHighlights([])
    if (imageInputRef.current) imageInputRef.current.value = ''
  }, [formImagePreview])

  /* ---------------------------------------------------------------- */
  /*  Shared: render a category image cell                             */
  /* ---------------------------------------------------------------- */

  const renderImageCell = (imageUrl: string | null, name: string, size: number = 10) => (
    <div className={cn('flex items-center justify-center rounded-lg bg-muted/30', size === 10 ? 'w-10 h-10' : 'w-8 h-8')}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className={cn('rounded-lg object-cover', size === 10 ? 'w-10 h-10' : 'w-8 h-8')}
        />
      ) : (
        <ImagePlus className={cn('text-muted-foreground', size === 10 ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
      )}
    </div>
  )

  /* ---------------------------------------------------------------- */
  /*  Shared: render action buttons                                    */
  /* ---------------------------------------------------------------- */

  const renderActions = (cat: Category | SubCategory) => (
    <div className="flex items-center justify-end gap-1">
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => openEdit(cat)}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Edit"
      >
        <Pencil className="h-4 w-4" />
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => openDelete(cat)}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </motion.button>
    </div>
  )

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
            <h2 className="text-xl font-semibold tracking-tight">Categories List</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your product categories here.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={fetchCategories}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>
        <motion.div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => setReorderOpen(true)}
              variant="outline"
              className="gap-2 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              title="Drag and drop to reorder categories and subcategories"
            >
              <GripVertical className="h-4 w-4" />
              Reorder
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => { resetForm(); setCreateOpen(true) }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-lg shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Create Categories
            </Button>
          </motion.div>
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
            className="pl-9 bg-background"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Created By Filter */}
          <Select value={creatorFilter} onValueChange={setCreatorFilter}>
            <SelectTrigger className="w-[130px] text-xs">
              <UserCircle className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Create by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Creators</SelectItem>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="Seller">Seller</SelectItem>
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
            Loading categories...
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
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category Name</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Create by</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FolderOpen className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No categories found</p>
                        <p className="text-xs">Try adjusting your search or create a new category</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((category, index) => {
                    const isExpanded = expandedIds.has(category._id)
                    const hasSubcategories = category.subcategoryData && category.subcategoryData.length > 0

                    return (
                      <CategoryRowGroup
                        key={category._id}
                        category={category}
                        index={index}
                        isExpanded={isExpanded}
                        hasSubcategories={hasSubcategories}
                        selectedIds={selectedIds}
                        expandedIds={expandedIds}
                        onToggleSelect={toggleSelect}
                        onToggleExpand={toggleExpand}
                        onEdit={openEdit}
                        onDelete={openDelete}
                        renderImageCell={renderImageCell}
                        renderActions={renderActions}
                      />
                    )
                  })
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
                Showing {totalCategories === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
                {Math.min(currentPage * itemsPerPage, totalCategories)} of {totalCategories} categories
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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

      {/* ── Create Dialog ── */}
      <AdminModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        type="form"
        size="lg"
        title="Create New Categories"
        headerExtra={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn(
                'gap-1.5 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 dark:border-emerald-800',
                formStatus === 'Active' ? 'text-emerald-600' : 'text-amber-600'
              )}>
                <Upload className="h-3.5 w-3.5" />
                {formStatus === 'Active' ? 'Publish' : 'Draft'}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setFormStatus('Active'); }}>
                Publish
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setFormStatus('Draft'); }}>
                Draft
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        footer={
          <>
            <ModalCancelButton onClick={() => setCreateOpen(false)} disabled={submitting} />
            <ModalSubmitButton onClick={handleCreate} disabled={submitting} submitting={submitting} icon={Plus}>
              Create
            </ModalSubmitButton>
          </>
        }
        submitting={submitting}
      >
        <div className="space-y-5">
              {/* Basic Information Section */}
              <div>
                <h3 className="text-sm font-semibold mb-4">Basic Information</h3>

                {/* Image Upload Area */}
                <div
                  onClick={() => cloudinaryReady && !formImagePreview && imageInputRef.current?.click()}
                  className={cn(
                    'relative flex flex-col items-center justify-center w-full h-36 rounded-lg border-2 border-dashed transition-colors',
                    !cloudinaryReady && !formImagePreview
                      ? 'border-border/30 bg-muted/20 cursor-not-allowed'
                      : formImagePreview
                        ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20 cursor-pointer'
                        : 'border-border/50 hover:border-emerald-400/50 hover:bg-accent/30 cursor-pointer'
                  )
                }>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept=".jpeg,.jpg,.png,.gif,.webp"
                    onChange={handleImageChange}
                    disabled={!cloudinaryReady}
                    className="hidden"
                  />
                  {formImagePreview ? (
                    <div className="relative group flex flex-col items-center gap-2">
                      <img
                        src={formImagePreview}
                        alt="Preview"
                        className="h-20 w-20 rounded-lg object-cover border border-border/30"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage() }}
                        className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <span className="text-[11px] text-muted-foreground">Click to replace</span>
                    </div>
                  ) : !cloudinaryReady ? (
                    <>
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10 mb-2">
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                      </div>
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Cloudinary Required</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">Configure Cloudinary in Settings to upload images</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/60 mb-2">
                        <ImagePlus className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">Upload Image</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">Allowed *.jpeg, *.jpg, *.png, *.gif, *.webp</p>
                      <p className="text-[11px] text-muted-foreground/70">Max size of 3.1 MB · Stored on Cloudinary</p>
                    </>
                  )}
                </div>
              </div>

              {/* Categories Name + Parent Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="create-name" className="text-sm font-medium">Categories Name</Label>
                  <Input
                    id="create-name"
                    placeholder="Categories Name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    size="lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Parent Category</Label>
                  <Select value={formParentCategory} onValueChange={(val) => {
                    setFormParentCategory(val)
                    if (val === 'None') {
                      setFormHighlights([])
                    }
                  }}>
                    <SelectTrigger size="lg" className="w-full">
                      <SelectValue placeholder="Parent Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {parentCategoryOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Short Description */}
              <div className="space-y-1.5">
                <Label htmlFor="create-desc" className="text-sm font-medium">Short Description</Label>
                <Textarea
                  id="create-desc"
                  placeholder="Short Description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="rounded-lg resize-none"
                />
              </div>

              {/* Highlights — Only shown when parent category is NOT "None" */}
              {formParentCategory !== 'None' && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Link Highlights</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Select highlights to group this subcategory under on the customer-facing categories page.
                  </p>
                  {allHighlights.length === 0 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      No highlights available. Create highlights first in the Highlights section.
                    </p>
                  ) : (
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/20">
                      {allHighlights.map((hl) => {
                        const isSelected = formHighlights.includes(hl._id)
                        return (
                          <label
                            key={hl._id}
                            className={cn(
                              'flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors text-sm',
                              isSelected
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                : 'hover:bg-accent/50'
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                setFormHighlights((prev) =>
                                  checked
                                    ? [...prev, hl._id]
                                    : prev.filter((id) => id !== hl._id)
                                )
                              }}
                            />
                            <span className="font-medium">{hl.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {formHighlights.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {formHighlights.map((hlId) => {
                        const hl = allHighlights.find((h) => h._id === hlId)
                        if (!hl) return null
                        return (
                          <Badge
                            key={hlId}
                            variant="outline"
                            className="text-xs gap-1 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                          >
                            {hl.name}
                            <button
                              onClick={() => setFormHighlights((prev) => prev.filter((id) => id !== hlId))}
                              className="ml-0.5 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
      </AdminModal>

      {/* ── Edit Dialog ── */}
      <AdminModal
        open={editOpen}
        onOpenChange={setEditOpen}
        type="form"
        size="lg"
        title="Edit Category"
        headerExtra={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn(
                'gap-1.5 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 dark:border-emerald-800',
                formStatus === 'Active' ? 'text-emerald-600' : 'text-amber-600'
              )}>
                <Upload className="h-3.5 w-3.5" />
                {formStatus === 'Active' ? 'Publish' : 'Draft'}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFormStatus('Active')}>
                Publish
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFormStatus('Draft')}>
                Draft
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        footer={
          <>
            <ModalCancelButton onClick={() => setEditOpen(false)} disabled={submitting} />
            <ModalSubmitButton onClick={handleEdit} disabled={submitting} submitting={submitting} icon={Pencil}>
              Update
            </ModalSubmitButton>
          </>
        }
        submitting={submitting}
      >
        <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold mb-4">Basic Information</h3>
                <div
                  onClick={() => !formImagePreview && imageInputRef.current?.click()}
                  className={cn(
                    'relative flex flex-col items-center justify-center w-full h-36 rounded-lg border-2 border-dashed transition-colors cursor-pointer',
                    formImagePreview
                      ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20'
                      : 'border-border/50 hover:border-emerald-400/50 hover:bg-accent/30'
                  )}
                >
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept=".jpeg,.jpg,.png,.gif,.webp"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  {formImagePreview ? (
                    <div className="relative group flex flex-col items-center gap-2">
                      <img src={formImagePreview} alt="Preview" className="h-20 w-20 rounded-lg object-cover border border-border/30" />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage() }}
                        className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <span className="text-[11px] text-muted-foreground">Click to replace</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/60 mb-2">
                        <ImagePlus className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">Upload Image</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">Allowed *.jpeg, *.jpg, *.png, *.gif, *.webp</p>
                      <p className="text-[11px] text-muted-foreground/70">Max size of 3.1 MB</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-sm font-medium">Categories Name</Label>
                  <Input
                    id="edit-name"
                    placeholder="Categories Name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    size="lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Parent Category</Label>
                  <Select value={formParentCategory} onValueChange={(val) => {
                    setFormParentCategory(val)
                    if (val === 'None') {
                      setFormHighlights([])
                    }
                  }}>
                    <SelectTrigger size="lg" className="w-full">
                      <SelectValue placeholder="Parent Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {parentCategoryOptions
                        .filter((opt) => opt !== editingCategory?.name)
                        .map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-desc" className="text-sm font-medium">Short Description</Label>
                <Textarea
                  id="edit-desc"
                  placeholder="Short Description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="rounded-lg resize-none"
                />
              </div>

              {/* Highlights — Only shown when parent category is NOT "None" */}
              {formParentCategory !== 'None' && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Link Highlights</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Select highlights to group this subcategory under on the customer-facing categories page.
                  </p>
                  {allHighlights.length === 0 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      No highlights available. Create highlights first in the Highlights section.
                    </p>
                  ) : (
                    <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/20">
                      {allHighlights.map((hl) => {
                        const isSelected = formHighlights.includes(hl._id)
                        return (
                          <label
                            key={hl._id}
                            className={cn(
                              'flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors text-sm',
                              isSelected
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                : 'hover:bg-accent/50'
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                setFormHighlights((prev) =>
                                  checked
                                    ? [...prev, hl._id]
                                    : prev.filter((id) => id !== hl._id)
                                )
                              }}
                            />
                            <span className="font-medium">{hl.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {formHighlights.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {formHighlights.map((hlId) => {
                        const hl = allHighlights.find((h) => h._id === hlId)
                        if (!hl) return null
                        return (
                          <Badge
                            key={hlId}
                            variant="outline"
                            className="text-xs gap-1 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                          >
                            {hl.name}
                            <button
                              onClick={() => setFormHighlights((prev) => prev.filter((id) => id !== hlId))}
                              className="ml-0.5 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
      </AdminModal>

      {/* ── Delete Dialog ── */}
      <AdminDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName="category"
        name={deletingCategory?.name || ''}
        submitting={submitting}
        onDelete={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* ── Reorder Modal ── */}
      <ReorderModal
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        categories={categories}
        onMessage={setMessage}
        onSaved={fetchCategories}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Category Row Group (Parent + SubCategories)                        */
/* ------------------------------------------------------------------ */

interface CategoryRowGroupProps {
  category: Category
  index: number
  isExpanded: boolean
  hasSubcategories: boolean
  selectedIds: Set<string>
  expandedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onEdit: (cat: Category | SubCategory) => void
  onDelete: (cat: Category | SubCategory) => void
  renderImageCell: (imageUrl: string | null, name: string, size?: number) => React.ReactNode
  renderActions: (cat: Category | SubCategory) => React.ReactNode
}

function CategoryRowGroup({
  category,
  index,
  isExpanded,
  hasSubcategories,
  selectedIds,
  onToggleSelect,
  onToggleExpand,
  onEdit,
  onDelete,
  renderImageCell,
  renderActions,
}: CategoryRowGroupProps) {
  // Check if this is an orphan subcategory (parentCategory !== 'None' with no subcategoryData)
  const isOrphanSubcategory = category.parentCategory !== 'None' && (!category.subcategoryData || category.subcategoryData.length === 0)

  // ── Orphan SubCategory Row (standalone, parent was deleted) ──
  if (isOrphanSubcategory) {
    return (
      <motion.tr
        variants={rowVariants}
        initial="hidden"
        animate="visible"
        exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
        transition={{ delay: index * 0.03 }}
        className={cn(
          'border-b border-border/40 transition-colors bg-amber-500/[0.03]',
          selectedIds.has(category._id) ? 'bg-primary/5' : 'hover:bg-muted/30',
        )}
      >
        <TableCell className="pl-4">
          <Checkbox
            checked={selectedIds.has(category._id)}
            onCheckedChange={() => onToggleSelect(category._id)}
            aria-label={`Select ${category.name}`}
          />
        </TableCell>
        <TableCell>
          {renderImageCell(category.imageUrl, category.name, 8)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
              Sub
            </Badge>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{category.name}</span>
                {category.status === 'Draft' ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    Draft
                  </Badge>
                ) : null}
              </div>
              <span className="text-[11px] text-amber-600/70 dark:text-amber-400/70 flex items-center gap-1">
                Parent: {category.parentCategory} (deleted)
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant="secondary"
            className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-md',
              category.createdBy === 'Admin'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
            )}
          >
            {category.createdBy}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{formatDate(category.createdAt)}</TableCell>
        <TableCell className="text-right pr-6">
          {renderActions(category)}
        </TableCell>
      </motion.tr>
    )
  }

  // ── Parent Category Row (with optional subcategories) ──
  return (
    <>
      <motion.tr
        variants={rowVariants}
        initial="hidden"
        animate="visible"
        exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
        transition={{ delay: index * 0.03 }}
        className={cn(
          'border-b border-border/40 transition-colors',
          selectedIds.has(category._id) ? 'bg-primary/5' : 'hover:bg-muted/30',
        )}
      >
        <TableCell className="pl-4">
          <Checkbox
            checked={selectedIds.has(category._id)}
            onCheckedChange={() => onToggleSelect(category._id)}
            aria-label={`Select ${category.name}`}
          />
        </TableCell>
        <TableCell>
          {renderImageCell(category.imageUrl, category.name, 10)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {/* Expand/Collapse Toggle */}
            {hasSubcategories ? (
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onToggleExpand(category._id)}
                className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title={isExpanded ? 'Collapse subcategories' : 'Expand subcategories'}
              >
                <motion.div
                  animate={{ rotate: isExpanded ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </motion.div>
              </motion.button>
            ) : (
              <div className="w-6" />
            )}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{category.name}</span>
                {category.status === 'Draft' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    Draft
                  </Badge>
                )}
                {hasSubcategories && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                    {category.subcategoryData.length} sub
                  </Badge>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Package className="h-2.5 w-2.5" />
                {category.productCount} products
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant="secondary"
            className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-md',
              category.createdBy === 'Admin'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
            )}
          >
            {category.createdBy}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{formatDate(category.createdAt)}</TableCell>
        <TableCell className="text-right pr-6">
          {renderActions(category)}
        </TableCell>
      </motion.tr>

      {/* ── SubCategory Rows ── */}
      <AnimatePresence>
        {isExpanded && hasSubcategories && category.subcategoryData.map((sub, subIndex) => (
          <motion.tr
            key={sub._id}
            variants={subRowVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ delay: subIndex * 0.04 }}
            className={cn(
              'border-b border-border/30 transition-colors',
              selectedIds.has(sub._id) ? 'bg-primary/5' : 'hover:bg-muted/20',
            )}
          >
            <TableCell className="pl-4">
              <Checkbox
                checked={selectedIds.has(sub._id)}
                onCheckedChange={() => onToggleSelect(sub._id)}
                aria-label={`Select ${sub.name}`}
              />
            </TableCell>
            <TableCell>
              <div className="pl-6">
                {renderImageCell(sub.imageUrl, sub.name, 8)}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2 pl-6">
                {/* Tree connector line */}
                <div className="flex items-center">
                  <div className="w-4 h-px bg-border/60" />
                  <div className={cn(
                    'w-px bg-border/60',
                    subIndex === category.subcategoryData.length - 1 ? 'h-4 -mb-4' : 'h-8',
                  )} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">{sub.name}</span>
                    {sub.status === 'Draft' ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        Draft
                      </Badge>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                    <Package className="h-2.5 w-2.5" />
                    {sub.productCount} products
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="pl-6">
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[11px] font-medium px-2 py-0.5 rounded-md',
                    sub.createdBy === 'Admin'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                  )}
                >
                  {sub.createdBy}
                </Badge>
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              <div className="pl-6">{formatDate(sub.createdAt)}</div>
            </TableCell>
            <TableCell className="text-right pr-6">
              <div className="pl-6">
                <div className="flex items-center justify-end gap-1">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onEdit(sub)}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onDelete(sub)}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </motion.button>
                </div>
              </div>
            </TableCell>
          </motion.tr>
        ))}
      </AnimatePresence>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Reorder Modal — drag-and-drop ordering for categories & subcats    */
/*  Uses @dnd-kit/sortable for accessible, production-grade DnD.        */
/* ------------------------------------------------------------------ */

interface ReorderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void
  onSaved: () => void
}

function ReorderModal({ open, onOpenChange, categories, onMessage, onSaved }: ReorderModalProps) {
  // View state: 'parents' (list of parent categories) or 'subs' (subcategories of a selected parent)
  const [view, setView] = useState<'parents' | 'subs'>('parents')
  const [selectedParent, setSelectedParent] = useState<Category | null>(null)

  // Local reorder state — initialized from props when modal opens
  const [parentList, setParentList] = useState<Category[]>([])
  const [subList, setSubList] = useState<SubCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [hasParentChanges, setHasParentChanges] = useState(false)
  const [hasSubChanges, setHasSubChanges] = useState(false)

  // DnD sensors — PointerSensor for mouse/touch, KeyboardSensor for accessibility
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }, // prevents accidental drags on click
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Initialize local state when modal opens
  useEffect(() => {
    if (open) {
      // Filter to only parent categories (exclude orphan subcategories shown in the table)
      const parents = categories.filter(
        (c) => c.parentCategory === 'None' || !c.parentCategory,
      )
      setParentList(parents)
      setView('parents')
      setSelectedParent(null)
      setHasParentChanges(false)
      setHasSubChanges(false)
    }
  }, [open, categories])

  // ── Parent category drag end ──
  const handleParentDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setParentList((items) => {
      const oldIndex = items.findIndex((i) => i._id === active.id)
      const newIndex = items.findIndex((i) => i._id === over.id)
      if (oldIndex === -1 || newIndex === -1) return items
      setHasParentChanges(true)
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  // ── Subcategory drag end ──
  const handleSubDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setSubList((items) => {
      const oldIndex = items.findIndex((i) => i._id === active.id)
      const newIndex = items.findIndex((i) => i._id === over.id)
      if (oldIndex === -1 || newIndex === -1) return items
      setHasSubChanges(true)
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  // ── Drill into a parent category's subcategories ──
  const openSubs = (parent: Category) => {
    setSelectedParent(parent)
    setSubList(parent.subcategoryData || [])
    setHasSubChanges(false)
    setView('subs')
  }

  // ── Go back to parent list ──
  const backToParents = () => {
    setView('parents')
    setSelectedParent(null)
  }

  // ── Save parent category order ──
  const saveParentOrder = async () => {
    setSaving(true)
    try {
      const items = parentList.map((cat, idx) => ({
        _id: cat._id,
        displayOrder: idx,
      }))
      const res = await fetch('/api/admin/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save order')
      }
      setHasParentChanges(false)
      onMessage({ type: 'success', text: `Reordered ${items.length} categories` })
      onSaved()
    } catch (err) {
      onMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save order' })
    } finally {
      setSaving(false)
    }
  }

  // ── Save subcategory order ──
  const saveSubOrder = async () => {
    if (!selectedParent) return
    setSaving(true)
    try {
      const items = subList.map((sub, idx) => ({
        _id: sub._id,
        displayOrder: idx,
        parentCategory: selectedParent.name,
      }))
      const res = await fetch('/api/admin/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save order')
      }
      setHasSubChanges(false)
      onMessage({ type: 'success', text: `Reordered ${items.length} subcategories` })
      onSaved()
    } catch (err) {
      onMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save order' })
    } finally {
      setSaving(false)
    }
  }

  // ── Close handler — discard unsaved changes ──
  const handleClose = () => {
    if (saving) return // don't close while saving
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="bg-background rounded-2xl shadow-2xl border border-border/60 w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            {view === 'subs' && (
              <button
                onClick={backToParents}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Back to categories"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {view === 'parents' ? <FolderTree className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold">
                  {view === 'parents' ? 'Reorder Categories' : `Reorder Subcategories`}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {view === 'parents'
                    ? 'Drag to reorder. This affects the home & categories page.'
                    : selectedParent
                      ? `Inside "${selectedParent.name}" — drag to reorder`
                      : ''}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Modal Body — DnD area ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === 'parents' ? (
            parentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderTree className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No categories to reorder</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Create some categories first.</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleParentDragEnd}
              >
                <SortableContext
                  items={parentList.map((c) => c._id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {parentList.map((cat, idx) => (
                      <SortableCategoryRow
                        key={cat._id}
                        category={cat}
                        index={idx}
                        onOpenSubs={() => openSubs(cat)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )
          ) : (
            subList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Folder className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No subcategories in this category</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Add subcategories first to reorder them.</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSubDragEnd}
              >
                <SortableContext
                  items={subList.map((s) => s._id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {subList.map((sub, idx) => (
                      <SortableSubcategoryRow
                        key={sub._id}
                        subcategory={sub}
                        index={idx}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/40 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            {view === 'parents'
              ? hasParentChanges
                ? '⚠ Unsaved changes — click Save to apply'
                : `${parentList.length} categor${parentList.length === 1 ? 'y' : 'ies'}`
              : hasSubChanges
                ? '⚠ Unsaved changes — click Save to apply'
                : `${subList.length} subcategor${subList.length === 1 ? 'y' : 'ies'}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={saving}
              className="rounded-lg"
            >
              Close
            </Button>
            {view === 'parents' ? (
              <Button
                size="sm"
                onClick={saveParentOrder}
                disabled={saving || !hasParentChanges}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {saving ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Save Order
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={saveSubOrder}
                disabled={saving || !hasSubChanges}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {saving ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Save Order
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sortable Category Row (parent category in reorder modal)           */
/* ------------------------------------------------------------------ */

function SortableCategoryRow({
  category,
  index,
  onOpenSubs,
}: {
  category: Category
  index: number
  onOpenSubs: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  }

  const hasSubs = category.subcategoryData && category.subcategoryData.length > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border bg-card transition-all',
        isDragging
          ? 'border-emerald-400 shadow-lg shadow-emerald-500/10'
          : 'border-border/60 hover:border-border',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Drag ${category.name} to reorder`}
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Position number */}
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-[11px] font-bold text-muted-foreground flex-shrink-0">
        {index + 1}
      </div>

      {/* Category image */}
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted/30 flex-shrink-0 flex items-center justify-center">
        {category.imageUrl ? (
          <img src={category.imageUrl} alt={category.name} className="w-full h-full object-cover" />
        ) : (
          <Package className="h-4 w-4 text-muted-foreground/50" />
        )}
      </div>

      {/* Category info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{category.name}</span>
          {category.status === 'Draft' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">
              Draft
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Package className="h-2.5 w-2.5" />
            {category.productCount} products
          </span>
          {hasSubs && (
            <span className="flex items-center gap-0.5">
              · {category.subcategoryData.length} subcategor{category.subcategoryData.length === 1 ? 'y' : 'ies'}
            </span>
          )}
        </div>
      </div>

      {/* Open subcategories button */}
      {hasSubs && (
        <button
          onClick={onOpenSubs}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors flex-shrink-0"
          title={`Reorder subcategories in ${category.name}`}
        >
          <Folder className="h-3.5 w-3.5" />
          Subcategories
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sortable Subcategory Row (subcategory in reorder modal)            */
/* ------------------------------------------------------------------ */

function SortableSubcategoryRow({
  subcategory,
  index,
}: {
  subcategory: SubCategory
  index: number
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subcategory._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border bg-card transition-all',
        isDragging
          ? 'border-blue-400 shadow-lg shadow-blue-500/10'
          : 'border-border/60 hover:border-border',
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Drag ${subcategory.name} to reorder`}
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Position number */}
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-[11px] font-bold text-muted-foreground flex-shrink-0">
        {index + 1}
      </div>

      {/* Subcategory image */}
      <div className="w-9 h-9 rounded-lg overflow-hidden bg-muted/30 flex-shrink-0 flex items-center justify-center">
        {subcategory.imageUrl ? (
          <img src={subcategory.imageUrl} alt={subcategory.name} className="w-full h-full object-cover" />
        ) : (
          <Package className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </div>

      {/* Subcategory info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium flex-shrink-0">
            Sub
          </Badge>
          <span className="text-sm font-medium truncate">{subcategory.name}</span>
          {subcategory.status === 'Draft' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">
              Draft
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Package className="h-2.5 w-2.5" />
          {subcategory.productCount} products
        </div>
      </div>
    </div>
  )
}
