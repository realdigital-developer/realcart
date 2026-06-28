'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Package,
  RefreshCw,
  Ruler,
  Clock,
  Tag,
  ImagePlus,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  ThumbsUp,
  ThumbsDown,
  Send,
  Zap,
  Ban,
  ToggleLeft,
  Copy,
  ExternalLink,
  Shield,
  Store,
  Info,
  ImageIcon,
  TableProperties,
  Star,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import AdminModal, {
  AdminDeleteModal,
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

/* ====================================================================== */
/*  Types                                                                  */
/* ====================================================================== */

interface ProductImage {
  url: string
  alt: string
  publicId: string
  isPrimary: boolean
}

interface ProductVariant {
  sku: string
  attributes: Record<string, string>
  mrp: number
  sellingPrice: number
  stock: number
  images: string[]
  isActive: boolean
}

interface SpecificationItem {
  key: string
  value: string
}

interface SpecificationGroup {
  group: string
  specs: SpecificationItem[]
}

interface ProductShipping {
  weight: number
  length: number
  width: number
  height: number
  hsnCode: string
  gstRate: number
  deliveryCharge: number
  freeDeliveryAbove: number
}

interface ProductSEO {
  metaTitle: string
  metaDescription: string
  searchKeywords: string[]
  canonicalUrl: string
}

interface Product {
  _id: string
  name: string
  slug?: string
  description: string
  category: string
  subcategory?: string
  brand?: string
  images?: ProductImage[]
  imageUrl?: string
  videoUrl?: string
  mrp: number
  sellingPrice: number
  specialPrice?: number
  specialPriceStartDate?: string | null
  specialPriceEndDate?: string | null
  variantAttributes?: string[]
  variants?: ProductVariant[]
  stock: number
  lowStockThreshold?: number
  trackInventory?: boolean
  specifications?: SpecificationGroup[]
  highlights?: string[]
  shipping?: ProductShipping
  returnPolicy?: string
  warranty?: string
  seo?: ProductSEO
  sizeChart?: {
    headers: string[]
    rows: Record<string, string>[]
    imageUrl?: string
    unit?: 'metric' | 'imperial' | 'both'
    howToMeasure?: string[]
  } | null
  tags?: string[]
  seller: string
  sellerId?: string
  storeName?: string
  status: string
  approvalNotes?: string
  active: boolean
  totalSold?: number
  viewCount?: number
  createdAt: string
  updatedAt: string
  approvedAt?: string | null
  publishedAt?: string | null
  // Legacy compat
  price?: number
  discounts?: unknown[]
}

interface StatusCounts {
  total: number
  draft: number
  pending: number
  approved: number
  published: number
  rejected: number
  suspended: number
}

type SortField = 'newest' | 'name' | 'price' | 'stock'
type SortDirection = 'asc' | 'desc'

/* ====================================================================== */
/*  Size Chart Template Interface                                          */
/* ====================================================================== */

interface SizeChartTemplate {
  _id: string
  name: string
  description: string
  headers: string[]
  rows: Record<string, string>[]
  unit: 'metric' | 'imperial' | 'both'
  conversionFactor?: number
  sizeHeader: string
  howToMeasure?: string[]
  isSystem?: boolean
  status: string
}

/* ====================================================================== */
/*  Animation Variants                                                     */
/* ====================================================================== */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const } },
}

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortId(id: string): string {
  return `#${id.slice(-5).toUpperCase()}`
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getProductImage(product: Product): string | null {
  if (product.images && product.images.length > 0) {
    const primary = product.images.find(img => img.isPrimary && img.url?.trim())
    if (primary) return primary.url.trim()
    const first = product.images.find(img => img.url?.trim())
    if (first) return first.url.trim()
  }
  if (product.imageUrl && product.imageUrl.trim()) return product.imageUrl.trim()
  return null
}

/* ====================================================================== */
/*  Status Badge Component                                                 */
/* ====================================================================== */

const STATUS_CONFIG: Record<string, { label: string; bgClass: string; textClass: string; dotClass: string; icon: React.ElementType }> = {
  Draft: { label: 'Draft', bgClass: 'bg-gray-100 dark:bg-gray-800', textClass: 'text-gray-700 dark:text-gray-300', dotClass: 'bg-gray-400', icon: Package },
  Pending: { label: 'Pending Review', bgClass: 'bg-amber-50 dark:bg-amber-950/30', textClass: 'text-amber-700 dark:text-amber-300', dotClass: 'bg-amber-500', icon: Clock },
  Approved: { label: 'Approved', bgClass: 'bg-sky-50 dark:bg-sky-950/30', textClass: 'text-sky-700 dark:text-sky-300', dotClass: 'bg-sky-500', icon: CheckCircle2 },
  Published: { label: 'Published', bgClass: 'bg-emerald-50 dark:bg-emerald-950/30', textClass: 'text-emerald-700 dark:text-emerald-300', dotClass: 'bg-emerald-500', icon: Zap },
  Rejected: { label: 'Rejected', bgClass: 'bg-red-50 dark:bg-red-950/30', textClass: 'text-red-700 dark:text-red-300', dotClass: 'bg-red-500', icon: AlertCircle },
  Suspended: { label: 'Suspended', bgClass: 'bg-orange-50 dark:bg-orange-950/30', textClass: 'text-orange-700 dark:text-orange-300', dotClass: 'bg-orange-500', icon: Ban },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.Draft
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
      config.bgClass,
      config.textClass,
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dotClass)} />
      {config.label}
    </span>
  )
}

/* ====================================================================== */
/*  Status Card Component                                                  */
/* ====================================================================== */

interface StatusCardProps {
  label: string
  count: number
  icon: React.ElementType
  colorClass: string
  bgClass: string
  isActive: boolean
  onClick: () => void
}

function StatusCard({ label, count, icon: Icon, colorClass, bgClass, isActive, onClick }: StatusCardProps) {
  return (
    <motion.button
      variants={fadeInUp}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 w-full',
        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1',
        isActive
          ? cn(bgClass, 'border-current/30 shadow-sm ring-1 ring-current/20')
          : 'bg-card border-border hover:border-border/80',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg shrink-0',
          isActive ? cn(bgClass, colorClass) : 'bg-muted text-muted-foreground',
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className={cn(
            'text-2xl font-bold leading-none',
            isActive ? colorClass : 'text-foreground',
          )}>
            {count}
          </p>
          <p className={cn(
            'text-xs mt-1 truncate',
            isActive ? colorClass : 'text-muted-foreground',
          )}>
            {label}
          </p>
        </div>
      </div>
      {isActive && (
        <motion.div
          layoutId="statusCardIndicator"
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: 'currentColor' }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
    </motion.button>
  )
}

/* ====================================================================== */
/*  Table Skeleton                                                         */
/* ====================================================================== */

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-4" /></TableCell>
          <TableCell><Skeleton className="h-10 w-10 rounded-lg" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8 rounded" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

/* ====================================================================== */
/*  Common Rejection Reasons                                               */
/* ====================================================================== */

const REJECTION_REASONS = [
  'Incorrect pricing',
  'Low quality images',
  'Missing specifications',
  'Duplicate product',
  'Misleading product information',
  'Incomplete product details',
  'Prohibited/restricted item',
  'Incorrect category',
]

/* ====================================================================== */
/*  Main Component                                                         */
/* ====================================================================== */

export default function AdminProductsPage() {
  const { authenticated, loading: authLoading } = useAdminAuth()
  const router = useRouter()

  // ── Core data state ──
  const [products, setProducts] = useState<Product[]>([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [counts, setCounts] = useState<StatusCounts>({
    total: 0, draft: 0, pending: 0, approved: 0,
    published: 0, rejected: 0, suspended: 0,
  })
  const [filterCategories, setFilterCategories] = useState<string[]>([])
  const [filterSubcategories, setFilterSubcategories] = useState<string[]>([])
  const [filterBrands, setFilterBrands] = useState<string[]>([])
  const [filterSellers, setFilterSellers] = useState<string[]>([])

  // ── UI state ──
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sellerFilter, setSellerFilter] = useState('all')
  const [brandFilter, setBrandFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [sortField, setSortField] = useState<SortField>('newest')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  // ── Selection state ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  // ── Modal states ──
  const [viewProduct, setViewProduct] = useState<Product | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [rejectProduct, setRejectProduct] = useState<Product | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [bulkAction, setBulkAction] = useState<string>('')
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false)
  const [bulkRejectReason, setBulkRejectReason] = useState('')

  // ── Submitting states ──
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ── Edit/Create form state ──
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formSubcategory, setFormSubcategory] = useState('')
  const [formBrand, setFormBrand] = useState('')
  const [formMrp, setFormMrp] = useState('')
  const [formSellingPrice, setFormSellingPrice] = useState('')
  const [formSpecialPrice, setFormSpecialPrice] = useState('')
  const [formStock, setFormStock] = useState('')
  const [formSeller, setFormSeller] = useState('')
  const [formStatus, setFormStatus] = useState('Draft')
  const [formActive, setFormActive] = useState(true)
  const [formImageUrl, setFormImageUrl] = useState('')
  const [formHighlights, setFormHighlights] = useState('')
  const [formTags, setFormTags] = useState('')
  const [formReturnPolicy, setFormReturnPolicy] = useState('')
  const [formWarranty, setFormWarranty] = useState('')

  // ── Size Chart form state ──
  const [formSizeChart, setFormSizeChart] = useState<{
    headers: string[]
    rows: Record<string, string>[]
    imageUrl?: string
    unit?: 'metric' | 'imperial' | 'both'
    howToMeasure?: string[]
  } | null>(null)
  const [sizeChartTemplates, setSizeChartTemplates] = useState<SizeChartTemplate[]>([])
  const [sizeChartTemplatesLoading, setSizeChartTemplatesLoading] = useState(false)
  const [selectedSizeChartTemplateId, setSelectedSizeChartTemplateId] = useState<string>('')

  // ── Debounced search ──
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearchDebounced(searchQuery)
      setPage(1)
    }, 350)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery])

  // ── Auth check ──
  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.push('/admin/login')
    }
  }, [authLoading, authenticated, router])

  // ── Fetch products ──
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (searchDebounced) params.set('search', searchDebounced)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (categoryFilter && categoryFilter !== 'all') params.set('category', categoryFilter)
      if (sellerFilter && sellerFilter !== 'all') params.set('seller', sellerFilter)
      if (brandFilter && brandFilter !== 'all') params.set('brand', brandFilter)

      const res = await fetch(`/api/admin/products?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()

      setProducts(data.products || [])
      setTotalProducts(data.total || 0)
      setTotalPages(data.totalPages || 1)
      if (data.counts) setCounts(data.counts)
      if (data.categories) setFilterCategories(data.categories)
      if (data.subcategories) setFilterSubcategories(data.subcategories)
      if (data.brands) setFilterBrands(data.brands)
      if (data.sellers) setFilterSellers(data.sellers)
    } catch (err) {
      console.error('Fetch error:', err)
      toast({ title: 'Error', description: 'Failed to load products', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [page, limit, searchDebounced, statusFilter, categoryFilter, sellerFilter, brandFilter])

  // ── Fetch size chart templates ──
  const fetchSizeChartTemplates = useCallback(async () => {
    try {
      setSizeChartTemplatesLoading(true)
      const res = await fetch('/api/size-chart-templates?status=Active')
      if (res.ok) {
        const data = await res.json()
        setSizeChartTemplates(data.templates || [])
      }
    } catch {
      // Non-critical
    } finally {
      setSizeChartTemplatesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) {
      fetchProducts()
      fetchSizeChartTemplates()
    }
  }, [authenticated, fetchProducts, fetchSizeChartTemplates])

  // ── Select a size chart template from database ──
  function selectSizeChartTemplate(templateId: string) {
    if (!templateId) {
      setSelectedSizeChartTemplateId('')
      setFormSizeChart(null)
      return
    }
    const template = sizeChartTemplates.find(t => t._id === templateId)
    if (!template) return
    setSelectedSizeChartTemplateId(templateId)
    setFormSizeChart({
      headers: [...template.headers],
      rows: template.rows.map(r => ({ ...r })),
      unit: template.unit === 'both' ? 'imperial' : template.unit,
      howToMeasure: template.howToMeasure || [],
    })
  }

  // ── Reset selection when data changes ──
  useEffect(() => {
    setSelectedIds(new Set())
    setSelectAll(false)
  }, [page, statusFilter, categoryFilter, sellerFilter, brandFilter, searchDebounced])

  // ── Client-side sort ──
  const sortedProducts = useMemo(() => {
    const sorted = [...products]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'price': cmp = (a.sellingPrice || a.mrp) - (b.sellingPrice || b.mrp); break
        case 'stock': cmp = (a.stock || 0) - (b.stock || 0); break
        case 'newest':
        default:
          cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [products, sortField, sortDir])

  // ── Toggle sort ──
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'newest' ? 'desc' : 'asc')
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
    return sortDir === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5" />
      : <ArrowDown className="h-3.5 w-3.5" />
  }

  // ── Status filter from tab/card clicks ──
  function handleStatusFilter(status: string) {
    setStatusFilter(prev => prev === status ? 'all' : status)
    setPage(1)
  }

  function handleTabChange(value: string) {
    setActiveTab(value)
    if (value === 'pending') {
      setStatusFilter('Pending')
    } else {
      setStatusFilter('all')
    }
    setPage(1)
  }

  // ── Selection handlers ──
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setSelectAll(next.size === sortedProducts.length && sortedProducts.length > 0)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectAll) {
      setSelectedIds(new Set())
      setSelectAll(false)
    } else {
      setSelectedIds(new Set(sortedProducts.map(p => p._id)))
      setSelectAll(true)
    }
  }

  // ── Quick actions ──
  async function handleQuickAction(product: Product, action: string) {
    setActionLoading(product._id)
    try {
      if (action === 'approve') {
        const res = await fetch('/api/admin/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _id: product._id, status: 'Approved' }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
        toast({ title: 'Approved', description: `${product.name} has been approved` })
      } else if (action === 'reject') {
        setRejectProduct(product)
        setRejectReason('')
        setRejectOpen(true)
        setActionLoading(null)
        return
      } else if (action === 'publish') {
        const res = await fetch('/api/admin/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _id: product._id, status: 'Published' }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
        toast({ title: 'Published', description: `${product.name} is now live` })
      } else if (action === 'suspend') {
        const res = await fetch('/api/admin/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _id: product._id, status: 'Suspended' }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
        toast({ title: 'Suspended', description: `${product.name} has been suspended` })
      }
      fetchProducts()
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Action failed', variant: 'destructive' })
    } finally {
      setActionLoading(null)
    }
  }

  // ── Submit rejection ──
  async function handleRejectSubmit() {
    if (!rejectProduct) return
    if (!rejectReason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a rejection reason', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: rejectProduct._id, status: 'Rejected', approvalNotes: rejectReason.trim() }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      toast({ title: 'Rejected', description: `${rejectProduct.name} has been rejected` })
      setRejectOpen(false)
      setRejectProduct(null)
      setRejectReason('')
      fetchProducts()
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to reject', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete product ──
  async function handleDelete() {
    if (!deleteProduct) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/products?id=${deleteProduct._id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      toast({ title: 'Deleted', description: `${deleteProduct.name} has been deleted` })
      setDeleteOpen(false)
      setDeleteProduct(null)
      fetchProducts()
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Bulk actions ──
  function handleBulkAction(action: string) {
    if (selectedIds.size === 0) {
      toast({ title: 'No selection', description: 'Select products first', variant: 'destructive' })
      return
    }
    if (action === 'reject') {
      setBulkRejectReason('')
      setBulkRejectOpen(true)
      return
    }
    if (action === 'delete') {
      setBulkAction('delete')
      setBulkConfirmOpen(true)
      return
    }
    executeBulkAction(action)
  }

  async function executeBulkAction(action: string, reason?: string) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { action, ids: Array.from(selectedIds) }
      if (reason) body.reason = reason

      const res = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      const data = await res.json()
      toast({
        title: 'Bulk action completed',
        description: `${data.processed || 0} product(s) ${action}d`,
      })
      setSelectedIds(new Set())
      setSelectAll(false)
      setBulkConfirmOpen(false)
      setBulkRejectOpen(false)
      fetchProducts()
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Bulk action failed', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Edit form helpers ──
  function openEditModal(product: Product) {
    setEditProduct(product)
    setFormName(product.name || '')
    setFormSlug(product.slug || '')
    setFormDescription(product.description || '')
    setFormCategory(product.category || '')
    setFormSubcategory(product.subcategory || '')
    setFormBrand(product.brand || '')
    setFormMrp(String(product.mrp || ''))
    setFormSellingPrice(String(product.sellingPrice || ''))
    setFormSpecialPrice(String(product.specialPrice || ''))
    setFormStock(String(product.stock || ''))
    setFormSeller(product.seller || '')
    setFormStatus(product.status || 'Draft')
    setFormActive(product.active !== false)
    setFormImageUrl(getProductImage(product) || '')
    setFormHighlights((product.highlights || []).join(', '))
    setFormTags((product.tags || []).join(', '))
    setFormReturnPolicy(product.returnPolicy || '')
    setFormWarranty(product.warranty || '')
    setFormSizeChart(product.sizeChart ? { ...product.sizeChart, rows: product.sizeChart.rows.map(r => ({ ...r })) } : null)
    setSelectedSizeChartTemplateId('')
    setEditOpen(true)
  }

  function openCreateModal() {
    setFormName('')
    setFormSlug('')
    setFormDescription('')
    setFormCategory('')
    setFormSubcategory('')
    setFormBrand('')
    setFormMrp('')
    setFormSellingPrice('')
    setFormSpecialPrice('')
    setFormStock('')
    setFormSeller('')
    setFormStatus('Draft')
    setFormActive(true)
    setFormImageUrl('')
    setFormHighlights('')
    setFormTags('')
    setFormReturnPolicy('')
    setFormWarranty('')
    setFormSizeChart(null)
    setSelectedSizeChartTemplateId('')
    setCreateOpen(true)
  }

  async function handleFormSubmit(mode: 'create' | 'edit') {
    if (!formName.trim()) {
      toast({ title: 'Validation Error', description: 'Product name is required', variant: 'destructive' })
      return
    }
    if (!formMrp || Number(formMrp) <= 0) {
      toast({ title: 'Validation Error', description: 'Valid MRP is required', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        slug: formSlug.trim() || generateSlug(formName),
        description: formDescription.trim(),
        category: formCategory.trim(),
        subcategory: formSubcategory.trim(),
        brand: formBrand.trim(),
        mrp: Number(formMrp),
        sellingPrice: Number(formSellingPrice) || Number(formMrp),
        specialPrice: Number(formSpecialPrice) || 0,
        stock: Number(formStock) || 0,
        seller: formSeller.trim() || 'Admin',
        status: formStatus,
        active: formActive,
        highlights: formHighlights ? formHighlights.split(',').map(h => h.trim()).filter(Boolean) : [],
        tags: formTags ? formTags.split(',').map(t => t.trim()).filter(Boolean) : [],
        returnPolicy: formReturnPolicy.trim(),
        warranty: formWarranty.trim(),
        images: formImageUrl.trim() ? [{ url: formImageUrl.trim(), alt: formName.trim(), publicId: '', isPrimary: true }] : [],
        sizeChart: formSizeChart,
      }

      if (mode === 'edit' && editProduct) {
        body._id = editProduct._id
      }

      const res = await fetch('/api/admin/products', {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || d.details?.join(', ') || 'Failed')
      }

      toast({
        title: mode === 'create' ? 'Product created' : 'Product updated',
        description: `${formName} has been ${mode === 'create' ? 'created' : 'updated'} successfully`,
      })

      if (mode === 'create') setCreateOpen(false)
      else setEditOpen(false)
      fetchProducts()
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── View modal ──
  function openViewModal(product: Product) {
    setViewProduct(product)
    setViewOpen(true)
  }

  // ── Available actions for a product based on status ──
  function getAvailableActions(status: string) {
    switch (status) {
      case 'Pending': return ['approve', 'reject']
      case 'Approved': return ['publish', 'reject']
      case 'Published': return ['suspend']
      case 'Rejected': return ['approve']
      case 'Suspended': return ['publish', 'approve']
      case 'Draft': return ['approve']
      default: return []
    }
  }

  // ── Page numbers for pagination ──
  const pageNumbers = useMemo(() => {
    const pages: number[] = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }, [page, totalPages])

  // ── Loading guard ──
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!authenticated) return null

  /* ==================================================================== */
  /*  Render                                                               */
  /* ==================================================================== */

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6 p-4 sm:p-6 max-w-[1400px] mx-auto"
      >
        {/* ── Header ── */}
        <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Products</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage product catalog and approval workflow
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchProducts()}
              disabled={loading}
              className="rounded-lg"
            >
              <RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              onClick={openCreateModal}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Product
            </Button>
          </div>
        </motion.div>

        {/* ── Status Overview Cards ── */}
        <motion.div variants={fadeInUp} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatusCard
            label="Pending Review"
            count={counts.pending}
            icon={Clock}
            colorClass="text-amber-600 dark:text-amber-400"
            bgClass="bg-amber-50 dark:bg-amber-950/30"
            isActive={statusFilter === 'Pending'}
            onClick={() => handleStatusFilter('Pending')}
          />
          <StatusCard
            label="Published"
            count={counts.published}
            icon={Zap}
            colorClass="text-emerald-600 dark:text-emerald-400"
            bgClass="bg-emerald-50 dark:bg-emerald-950/30"
            isActive={statusFilter === 'Published'}
            onClick={() => handleStatusFilter('Published')}
          />
          <StatusCard
            label="Approved"
            count={counts.approved}
            icon={CheckCircle2}
            colorClass="text-sky-600 dark:text-sky-400"
            bgClass="bg-sky-50 dark:bg-sky-950/30"
            isActive={statusFilter === 'Approved'}
            onClick={() => handleStatusFilter('Approved')}
          />
          <StatusCard
            label="Rejected"
            count={counts.rejected}
            icon={AlertCircle}
            colorClass="text-red-600 dark:text-red-400"
            bgClass="bg-red-50 dark:bg-red-950/30"
            isActive={statusFilter === 'Rejected'}
            onClick={() => handleStatusFilter('Rejected')}
          />
          <StatusCard
            label="Draft"
            count={counts.draft}
            icon={Package}
            colorClass="text-gray-600 dark:text-gray-400"
            bgClass="bg-gray-50 dark:bg-gray-800/50"
            isActive={statusFilter === 'Draft'}
            onClick={() => handleStatusFilter('Draft')}
          />
          <StatusCard
            label="Suspended"
            count={counts.suspended}
            icon={Ban}
            colorClass="text-orange-600 dark:text-orange-400"
            bgClass="bg-orange-50 dark:bg-orange-950/30"
            isActive={statusFilter === 'Suspended'}
            onClick={() => handleStatusFilter('Suspended')}
          />
        </motion.div>

        {/* ── Main Content: Tabs ── */}
        <motion.div variants={fadeInUp}>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="mb-4">
              <TabsTrigger value="all" className="gap-1.5">
                <Package className="h-3.5 w-3.5" />
                All Products
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                  {counts.total}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Approval Queue
                {counts.pending > 0 && (
                  <Badge className="ml-1 text-[10px] px-1.5 py-0 bg-amber-500 text-white">
                    {counts.pending}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── All Products Tab ── */}
            <TabsContent value="all">
              <Card className="border shadow-sm rounded-xl">
                <CardContent className="p-0">
                  {/* ── Filters Bar ── */}
                  <div className="p-4 border-b space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      {/* Search */}
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search products, brands, sellers..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="pl-9 rounded-lg"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => { setSearchQuery(''); setSearchDebounced('') }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Filter dropdowns */}
                      <div className="flex flex-wrap gap-2">
                        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
                          <SelectTrigger className="w-[130px] rounded-lg text-xs">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="Draft">Draft</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Published">Published</SelectItem>
                            <SelectItem value="Rejected">Rejected</SelectItem>
                            <SelectItem value="Suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1) }}>
                          <SelectTrigger className="w-[140px] rounded-lg text-xs">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {filterCategories.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={brandFilter} onValueChange={v => { setBrandFilter(v); setPage(1) }}>
                          <SelectTrigger className="w-[130px] rounded-lg text-xs">
                            <SelectValue placeholder="Brand" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Brands</SelectItem>
                            {filterBrands.filter(Boolean).map(b => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={sellerFilter} onValueChange={v => { setSellerFilter(v); setPage(1) }}>
                          <SelectTrigger className="w-[130px] rounded-lg text-xs">
                            <SelectValue placeholder="Seller" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Sellers</SelectItem>
                            {filterSellers.filter(Boolean).map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Active filters indicators */}
                    {(statusFilter !== 'all' || categoryFilter !== 'all' || brandFilter !== 'all' || sellerFilter !== 'all' || searchDebounced) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Filters:</span>
                        {statusFilter !== 'all' && (
                          <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                            Status: {statusFilter}
                            <button onClick={() => { setStatusFilter('all'); setPage(1) }}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {categoryFilter !== 'all' && (
                          <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                            Category: {categoryFilter}
                            <button onClick={() => { setCategoryFilter('all'); setPage(1) }}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {brandFilter !== 'all' && (
                          <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                            Brand: {brandFilter}
                            <button onClick={() => { setBrandFilter('all'); setPage(1) }}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {sellerFilter !== 'all' && (
                          <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                            Seller: {sellerFilter}
                            <button onClick={() => { setSellerFilter('all'); setPage(1) }}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        {searchDebounced && (
                          <Badge variant="secondary" className="text-[10px] gap-1 pr-1">
                            Search: &ldquo;{searchDebounced}&rdquo;
                            <button onClick={() => { setSearchQuery(''); setSearchDebounced('') }}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        )}
                        <button
                          onClick={() => {
                            setStatusFilter('all')
                            setCategoryFilter('all')
                            setBrandFilter('all')
                            setSellerFilter('all')
                            setSearchQuery('')
                            setSearchDebounced('')
                            setPage(1)
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Bulk Actions Bar ── */}
                  <AnimatePresence>
                    {selectedIds.size > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 border-b flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                            {selectedIds.size} selected
                          </span>
                          <Separator orientation="vertical" className="h-5" />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-lg"
                            onClick={() => handleBulkAction('approve')}
                            disabled={submitting}
                          >
                            <ThumbsUp className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-lg"
                            onClick={() => handleBulkAction('reject')}
                            disabled={submitting}
                          >
                            <ThumbsDown className="h-3 w-3 mr-1" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-lg"
                            onClick={() => handleBulkAction('publish')}
                            disabled={submitting}
                          >
                            <Send className="h-3 w-3 mr-1" /> Publish
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs rounded-lg"
                            onClick={() => handleBulkAction('suspend')}
                            disabled={submitting}
                          >
                            <Ban className="h-3 w-3 mr-1" /> Suspend
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs rounded-lg"
                            onClick={() => handleBulkAction('delete')}
                            disabled={submitting}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── Products Table ── */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectAll}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Select all"
                            />
                          </TableHead>
                          <TableHead className="w-12">Image</TableHead>
                          <TableHead>
                            <button
                              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                              onClick={() => handleSort('name')}
                            >
                              Name <SortIcon field="name" />
                            </button>
                          </TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Seller</TableHead>
                          <TableHead>
                            <button
                              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                              onClick={() => handleSort('price')}
                            >
                              Price <SortIcon field="price" />
                            </button>
                          </TableHead>
                          <TableHead>
                            <button
                              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                              onClick={() => handleSort('stock')}
                            >
                              Stock <SortIcon field="stock" />
                            </button>
                          </TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>
                            <button
                              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                              onClick={() => handleSort('newest')}
                            >
                              Created <SortIcon field="newest" />
                            </button>
                          </TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableSkeleton rows={limit} />
                        ) : sortedProducts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="h-32 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Package className="h-10 w-10" />
                                <p className="text-sm font-medium">No products found</p>
                                <p className="text-xs">
                                  {searchDebounced || statusFilter !== 'all'
                                    ? 'Try adjusting your filters'
                                    : 'Create your first product to get started'}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          <AnimatePresence mode="popLayout">
                            {sortedProducts.map((product) => {
                              const imgUrl = getProductImage(product)
                              const isActionLoading = actionLoading === product._id
                              const availableActions = getAvailableActions(product.status)
                              const isSelected = selectedIds.has(product._id)
                              const discount = product.mrp > 0 && product.sellingPrice > 0 && product.sellingPrice < product.mrp
                                ? Math.round(((product.mrp - product.sellingPrice) / product.mrp) * 100)
                                : 0

                              return (
                                <motion.tr
                                  key={product._id}
                                  variants={rowVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="hidden"
                                  className={cn(
                                    'group border-b transition-colors',
                                    isSelected && 'bg-emerald-50/50 dark:bg-emerald-950/10',
                                    'hover:bg-muted/30',
                                  )}
                                >
                                  {/* Checkbox */}
                                  <td className="px-4 py-3">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleSelect(product._id)}
                                      aria-label={`Select ${product.name}`}
                                    />
                                  </td>

                                  {/* Image */}
                                  <td className="px-4 py-3">
                                    {imgUrl ? (
                                      <div className="relative h-10 w-10">
                                        <img
                                          src={imgUrl}
                                          alt={product.name}
                                          className="h-10 w-10 rounded-lg object-cover border bg-muted"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none'
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      <div className="relative h-10 w-10">
                                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* Name */}
                                  <td className="px-4 py-3 max-w-[250px]">
                                    <div className="min-w-0">
                                      <button
                                        onClick={() => openViewModal(product)}
                                        className="text-sm font-medium truncate hover:underline text-left w-full"
                                      >
                                        {product.name}
                                      </button>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                          {shortId(product._id)}
                                        </span>
                                        {product.brand && (
                                          <>
                                            <span className="text-muted-foreground/30">·</span>
                                            <span className="text-[10px] text-muted-foreground truncate">
                                              {product.brand}
                                            </span>
                                          </>
                                        )}
                                        {product.sizeChart && product.sizeChart.headers && product.sizeChart.headers.length > 0 && (
                                          <Badge variant="outline" className="text-[10px] gap-1 h-4 px-1">
                                            <Ruler className="h-2.5 w-2.5" />
                                            Size Chart
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Category */}
                                  <td className="px-4 py-3">
                                    <span className="text-xs text-muted-foreground">
                                      {product.category || '\u2014'}
                                    </span>
                                  </td>

                                  {/* Seller */}
                                  <td className="px-4 py-3">
                                    <span className="text-xs text-muted-foreground">
                                      {product.storeName || product.seller || '\u2014'}
                                    </span>
                                  </td>

                                  {/* Price */}
                                  <td className="px-4 py-3">
                                    <div>
                                      <p className="text-sm font-medium">
                                        {formatPrice(product.sellingPrice || product.mrp)}
                                      </p>
                                      {discount > 0 && (
                                        <div className="flex items-center gap-1 mt-0.5">
                                          <span className="text-[10px] text-muted-foreground line-through">
                                            {formatPrice(product.mrp)}
                                          </span>
                                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                            -{discount}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </td>

                                  {/* Stock */}
                                  <td className="px-4 py-3">
                                    <span className={cn(
                                      'text-sm font-medium',
                                      product.stock <= 0 && 'text-red-500',
                                      product.stock > 0 && product.stock <= 5 && 'text-amber-500',
                                    )}>
                                      {product.stock}
                                    </span>
                                  </td>

                                  {/* Status */}
                                  <td className="px-4 py-3">
                                    <StatusBadge status={product.status} />
                                  </td>

                                  {/* Created */}
                                  <td className="px-4 py-3">
                                    <span className="text-xs text-muted-foreground">
                                      {formatDate(product.createdAt)}
                                    </span>
                                  </td>

                                  {/* Actions */}
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {/* Quick approve for pending */}
                                      {product.status === 'Pending' && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                              onClick={() => handleQuickAction(product, 'approve')}
                                              disabled={isActionLoading}
                                            >
                                              {isActionLoading ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              ) : (
                                                <ThumbsUp className="h-3.5 w-3.5" />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Approve</TooltipContent>
                                        </Tooltip>
                                      )}

                                      {/* Quick reject for pending */}
                                      {product.status === 'Pending' && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                              onClick={() => handleQuickAction(product, 'reject')}
                                              disabled={isActionLoading}
                                            >
                                              <ThumbsDown className="h-3.5 w-3.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Reject</TooltipContent>
                                        </Tooltip>
                                      )}

                                      {/* Quick publish for approved */}
                                      {product.status === 'Approved' && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-7 w-7 p-0 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                                              onClick={() => handleQuickAction(product, 'publish')}
                                              disabled={isActionLoading}
                                            >
                                              {isActionLoading ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              ) : (
                                                <Send className="h-3.5 w-3.5" />
                                              )}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Publish</TooltipContent>
                                        </Tooltip>
                                      )}

                                      {/* More actions dropdown */}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                          >
                                            <MoreHorizontal className="h-3.5 w-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-44">
                                          <DropdownMenuItem onClick={() => openViewModal(product)}>
                                            <Eye className="h-4 w-4 mr-2" /> View Details
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => openEditModal(product)}>
                                            <Pencil className="h-4 w-4 mr-2" /> Edit
                                          </DropdownMenuItem>
                                          {availableActions.includes('approve') && product.status !== 'Pending' && (
                                            <DropdownMenuItem onClick={() => handleQuickAction(product, 'approve')}>
                                              <ThumbsUp className="h-4 w-4 mr-2" /> Approve
                                            </DropdownMenuItem>
                                          )}
                                          {availableActions.includes('publish') && product.status !== 'Approved' && (
                                            <DropdownMenuItem onClick={() => handleQuickAction(product, 'publish')}>
                                              <Send className="h-4 w-4 mr-2" /> Publish
                                            </DropdownMenuItem>
                                          )}
                                          {availableActions.includes('suspend') && (
                                            <DropdownMenuItem onClick={() => handleQuickAction(product, 'suspend')}>
                                              <Ban className="h-4 w-4 mr-2" /> Suspend
                                            </DropdownMenuItem>
                                          )}
                                          {availableActions.includes('reject') && product.status !== 'Pending' && (
                                            <DropdownMenuItem onClick={() => handleQuickAction(product, 'reject')}>
                                              <ThumbsDown className="h-4 w-4 mr-2" /> Reject
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={() => { setDeleteProduct(product); setDeleteOpen(true) }}
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </td>
                                </motion.tr>
                              )
                            })}
                          </AnimatePresence>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* ── Pagination ── */}
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
                      <p className="text-xs text-muted-foreground">
                        Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, totalProducts)} of {totalProducts}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-lg"
                          onClick={() => setPage(1)}
                          disabled={page === 1}
                        >
                          <span className="text-xs">⟨⟨</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-lg"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {pageNumbers.map(p => (
                          <Button
                            key={p}
                            variant={p === page ? 'default' : 'outline'}
                            size="sm"
                            className={cn(
                              'h-8 w-8 p-0 rounded-lg text-xs',
                              p === page && 'bg-emerald-600 hover:bg-emerald-700 text-white',
                            )}
                            onClick={() => setPage(p)}
                          >
                            {p}
                          </Button>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-lg"
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-lg"
                          onClick={() => setPage(totalPages)}
                          disabled={page === totalPages}
                        >
                          <span className="text-xs">⟩⟩</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Approval Queue Tab ── */}
            <TabsContent value="pending">
              <Card className="border shadow-sm rounded-xl">
                <CardContent className="p-0">
                  <div className="p-4 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      <h3 className="text-sm font-semibold">Products Pending Review</h3>
                      <Badge className="bg-amber-500 text-white text-[10px]">
                        {counts.pending}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => fetchProducts()}
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} />
                      Refresh
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-12">Image</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Seller</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>MRP</TableHead>
                          <TableHead>Selling Price</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableSkeleton rows={5} />
                        ) : sortedProducts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="h-32 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                                <p className="text-sm font-medium">All caught up!</p>
                                <p className="text-xs">No products pending review</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedProducts.map(product => {
                            const imgUrl = getProductImage(product)
                            const isActionLoading = actionLoading === product._id

                            return (
                              <motion.tr
                                key={product._id}
                                variants={rowVariants}
                                initial="hidden"
                                animate="visible"
                                className="group border-b hover:bg-muted/30 transition-colors"
                              >
                                <td className="px-4 py-3">
                                  {imgUrl ? (
                                    <div className="relative h-10 w-10">
                                      <img
                                        src={imgUrl}
                                        alt={product.name}
                                        className="h-10 w-10 rounded-lg object-cover border bg-muted"
                                      />
                                    </div>
                                  ) : (
                                    <div className="relative h-10 w-10">
                                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 max-w-[200px]">
                                  <button
                                    onClick={() => openViewModal(product)}
                                    className="text-sm font-medium truncate hover:underline text-left"
                                  >
                                    {product.name}
                                  </button>
                                  {product.brand && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{product.brand}</p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs text-muted-foreground">
                                    {product.storeName || product.seller || '\u2014'}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs text-muted-foreground">
                                    {product.category || '\u2014'}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs">
                                    {formatPrice(product.mrp)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    {formatPrice(product.sellingPrice)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(product.createdAt)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5"
                                      onClick={() => handleQuickAction(product, 'approve')}
                                      disabled={isActionLoading}
                                    >
                                      {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ThumbsUp className="h-3 w-3 mr-1" />}
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg px-2.5"
                                      onClick={() => handleQuickAction(product, 'reject')}
                                    >
                                      <ThumbsDown className="h-3 w-3 mr-1" />
                                      Reject
                                    </Button>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onClick={() => openViewModal(product)}
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Review</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </td>
                              </motion.tr>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Approval Queue Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <p className="text-xs text-muted-foreground">
                        Page {page} of {totalPages}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-lg"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-lg"
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* ── MODALS ── */}

        {/* ── Product Detail / Review Modal ── */}
        {viewProduct && (
          <AdminModal
            open={viewOpen}
            onOpenChange={setViewOpen}
            type="view"
            size="2xl"
            title="Product Details"
            description={viewProduct.name}
            showCloseButton
            footer={
              <div className="flex items-center gap-2 w-full">
                {getAvailableActions(viewProduct.status).includes('approve') && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                    onClick={() => {
                      handleQuickAction(viewProduct, 'approve')
                      setViewOpen(false)
                    }}
                    disabled={!!actionLoading}
                  >
                    <ThumbsUp className="h-4 w-4 mr-1.5" /> Approve
                  </Button>
                )}
                {getAvailableActions(viewProduct.status).includes('reject') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                    onClick={() => {
                      setViewOpen(false)
                      setRejectProduct(viewProduct)
                      setRejectReason('')
                      setRejectOpen(true)
                    }}
                  >
                    <ThumbsDown className="h-4 w-4 mr-1.5" /> Reject
                  </Button>
                )}
                {getAvailableActions(viewProduct.status).includes('publish') && (
                  <Button
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700 text-white rounded-lg"
                    onClick={() => {
                      handleQuickAction(viewProduct, 'publish')
                      setViewOpen(false)
                    }}
                    disabled={!!actionLoading}
                  >
                    <Send className="h-4 w-4 mr-1.5" /> Publish
                  </Button>
                )}
                {getAvailableActions(viewProduct.status).includes('suspend') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded-lg"
                    onClick={() => {
                      handleQuickAction(viewProduct, 'suspend')
                      setViewOpen(false)
                    }}
                    disabled={!!actionLoading}
                  >
                    <Ban className="h-4 w-4 mr-1.5" /> Suspend
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => {
                    setViewOpen(false)
                    openEditModal(viewProduct)
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1.5" /> Edit
                </Button>
              </div>
            }
          >
            <div className="space-y-6">
              {/* Images */}
              {viewProduct.images && viewProduct.images.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Images</h4>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {viewProduct.images.map((img, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={img.url}
                          alt={img.alt || `Image ${i + 1}`}
                          className="w-full aspect-square rounded-lg object-cover border bg-muted"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                        {img.isPrimary && (
                          <Badge className="absolute top-1 left-1 text-[8px] px-1 py-0 bg-emerald-500 text-white">
                            Primary
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Product Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoField label="Name" value={viewProduct.name} />
                  <InfoField label="Slug" value={viewProduct.slug} />
                  <InfoField label="Category" value={viewProduct.category} />
                  <InfoField label="Subcategory" value={viewProduct.subcategory} />
                  <InfoField label="Brand" value={viewProduct.brand} />
                  <InfoField label="Status" value={<StatusBadge status={viewProduct.status} />} />
                </div>
              </div>

              {/* Description */}
              {viewProduct.description && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Description</h4>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">{viewProduct.description}</p>
                </div>
              )}

              {/* Highlights */}
              {viewProduct.highlights && viewProduct.highlights.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Highlights</h4>
                  <ul className="space-y-1">
                    {viewProduct.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pricing */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pricing</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <InfoField label="MRP" value={formatPrice(viewProduct.mrp)} />
                  <InfoField label="Selling Price" value={formatPrice(viewProduct.sellingPrice)} highlight />
                  {(viewProduct.specialPrice ?? 0) > 0 && (
                    <InfoField label="Special Price" value={formatPrice(viewProduct.specialPrice ?? 0)} />
                  )}
                  {viewProduct.mrp > 0 && viewProduct.sellingPrice < viewProduct.mrp && (
                    <InfoField
                      label="Discount"
                      value={`${Math.round(((viewProduct.mrp - viewProduct.sellingPrice) / viewProduct.mrp) * 100)}%`}
                      highlight
                    />
                  )}
                  <InfoField label="Stock" value={String(viewProduct.stock)} />
                  <InfoField label="Active" value={viewProduct.active ? 'Yes' : 'No'} />
                </div>
              </div>

              {/* Variants */}
              {viewProduct.variants && viewProduct.variants.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Variants ({viewProduct.variants.length})
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">SKU</TableHead>
                          <TableHead className="text-xs">Attributes</TableHead>
                          <TableHead className="text-xs">MRP</TableHead>
                          <TableHead className="text-xs">Selling Price</TableHead>
                          <TableHead className="text-xs">Stock</TableHead>
                          <TableHead className="text-xs">Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewProduct.variants.map((v, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{v.sku}</TableCell>
                            <TableCell className="text-xs">
                              {Object.entries(v.attributes).map(([k, val]) => (
                                <span key={k} className="inline-flex items-center gap-0.5 mr-2">
                                  <span className="text-muted-foreground">{k}:</span> {val}
                                </span>
                              ))}
                            </TableCell>
                            <TableCell className="text-xs">{formatPrice(v.mrp)}</TableCell>
                            <TableCell className="text-xs font-medium">{formatPrice(v.sellingPrice)}</TableCell>
                            <TableCell className="text-xs">{v.stock}</TableCell>
                            <TableCell className="text-xs">
                              {v.isActive ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <X className="h-3.5 w-3.5 text-red-500" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Specifications */}
              {viewProduct.specifications && viewProduct.specifications.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Specifications</h4>
                  <div className="space-y-3">
                    {viewProduct.specifications.map((group, i) => (
                      <div key={i} className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 px-3 py-2">
                          <span className="text-xs font-semibold">{group.group}</span>
                        </div>
                        <div className="divide-y">
                          {group.specs.map((spec, j) => (
                            <div key={j} className="flex px-3 py-2">
                              <span className="text-xs text-muted-foreground w-1/3">{spec.key}</span>
                              <span className="text-xs w-2/3">{spec.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Size Chart */}
              {viewProduct.sizeChart && viewProduct.sizeChart.headers && viewProduct.sizeChart.headers.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Size Chart</h4>
                  <div className="border rounded-lg overflow-hidden">
                    {viewProduct.sizeChart.imageUrl && (
                      <div className="p-2 border-b">
                        <img
                          src={viewProduct.sizeChart.imageUrl}
                          alt="Size Chart"
                          className="max-h-48 w-auto mx-auto object-contain rounded"
                        />
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50">
                            {viewProduct.sizeChart.headers.map((header, i) => (
                              <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {viewProduct.sizeChart.rows.map((row, i) => (
                            <tr key={i} className={cn(i % 2 === 0 ? '' : 'bg-muted/20')}>
                              {viewProduct.sizeChart!.headers.map((header, j) => (
                                <td key={j} className={cn(
                                  'px-3 py-2 whitespace-nowrap',
                                  j === 0 && 'font-medium'
                                )}>
                                  {row[header] || '\u2014'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {viewProduct.sizeChart.unit && (
                      <div className="px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground">
                        Unit: {viewProduct.sizeChart.unit === 'imperial' ? 'Inches' : viewProduct.sizeChart.unit === 'metric' ? 'Centimeters' : 'Both'}
                      </div>
                    )}
                    {viewProduct.sizeChart.howToMeasure && viewProduct.sizeChart.howToMeasure.length > 0 && (
                      <div className="px-3 py-2 border-t">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">How to Measure</p>
                        {viewProduct.sizeChart.howToMeasure.map((tip, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                            <span className="text-muted-foreground/50 mt-0.5">•</span>
                            {tip}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Shipping */}
              {viewProduct.shipping && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Shipping & Tax</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <InfoField label="Weight" value={`${viewProduct.shipping.weight}g`} />
                    <InfoField label="Dimensions" value={`${viewProduct.shipping.length}×${viewProduct.shipping.width}×${viewProduct.shipping.height} cm`} />
                    <InfoField label="HSN Code" value={viewProduct.shipping.hsnCode || '\u2014'} />
                    <InfoField label="GST Rate" value={`${viewProduct.shipping.gstRate}%`} />
                    <InfoField label="Delivery Charge" value={viewProduct.shipping.deliveryCharge > 0 ? formatPrice(viewProduct.shipping.deliveryCharge) : 'Free'} />
                    <InfoField label="Free Delivery Above" value={viewProduct.shipping.freeDeliveryAbove > 0 ? formatPrice(viewProduct.shipping.freeDeliveryAbove) : '\u2014'} />
                  </div>
                </div>
              )}

              {/* SEO */}
              {viewProduct.seo && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">SEO</h4>
                  <div className="space-y-2">
                    <InfoField label="Meta Title" value={viewProduct.seo.metaTitle} />
                    <InfoField label="Meta Description" value={viewProduct.seo.metaDescription} />
                    {viewProduct.seo.searchKeywords && viewProduct.seo.searchKeywords.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">Search Keywords</p>
                        <div className="flex flex-wrap gap-1">
                          {viewProduct.seo.searchKeywords.map((kw, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tags */}
              {viewProduct.tags && viewProduct.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {viewProduct.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Seller Info */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Seller Information</h4>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                    <Store className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{viewProduct.storeName || viewProduct.seller}</p>
                    <p className="text-xs text-muted-foreground">
                      Seller ID: {viewProduct.sellerId || '\u2014'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status & History */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Status & History</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <InfoField label="Current Status" value={<StatusBadge status={viewProduct.status} />} />
                  <InfoField label="Created" value={formatDateTime(viewProduct.createdAt)} />
                  <InfoField label="Updated" value={formatDateTime(viewProduct.updatedAt)} />
                  {viewProduct.approvedAt && <InfoField label="Approved" value={formatDateTime(viewProduct.approvedAt)} />}
                  {viewProduct.publishedAt && <InfoField label="Published" value={formatDateTime(viewProduct.publishedAt)} />}
                </div>
                {viewProduct.approvalNotes && (
                  <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Rejection/Notes:</p>
                    <p className="text-xs text-red-600 dark:text-red-300">{viewProduct.approvalNotes}</p>
                  </div>
                )}
              </div>

              {/* Return & Warranty */}
              {(viewProduct.returnPolicy || viewProduct.warranty) && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Return & Warranty</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField label="Return Policy" value={viewProduct.returnPolicy || '\u2014'} />
                    <InfoField label="Warranty" value={viewProduct.warranty || '\u2014'} />
                  </div>
                </div>
              )}
            </div>
          </AdminModal>
        )}

        {/* ── Rejection Modal ── */}
        <AdminModal
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          type="form"
          size="md"
          title="Reject Product"
          description={rejectProduct ? `Reject "${rejectProduct.name}"` : ''}
          footer={
            <>
              <ModalCancelButton onClick={() => { setRejectOpen(false); setRejectProduct(null) }} disabled={submitting} />
              <ModalSubmitButton
                onClick={handleRejectSubmit}
                submitting={submitting}
                disabled={!rejectReason.trim()}
                icon={ThumbsDown}
              >
                Reject Product
              </ModalSubmitButton>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  Rejection requires a reason
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  The seller will be notified with your reason.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Rejection Reason</Label>
              <Textarea
                placeholder="Explain why this product is being rejected..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="rounded-lg min-h-[80px] resize-none"
                rows={3}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick reasons:</p>
              <div className="flex flex-wrap gap-1.5">
                {REJECTION_REASONS.map(reason => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setRejectReason(reason)}
                    className={cn(
                      'text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                      rejectReason === reason
                        ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                        : 'bg-muted/30 border-border hover:border-red-300 dark:hover:border-red-800 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </AdminModal>

        {/* ── Delete Confirmation Modal ── */}
        <AdminDeleteModal
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          itemName="product"
          name={deleteProduct?.name || ''}
          warningText="This action cannot be undone. The product and its images will be permanently removed."
          submitting={submitting}
          onDelete={handleDelete}
          onCancel={() => { setDeleteOpen(false); setDeleteProduct(null) }}
        />

        {/* ── Create Product Modal ── */}
        <AdminModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          type="form"
          size="2xl"
          title="Add New Product"
          description="Create a new product in the catalog"
          footer={
            <>
              <ModalCancelButton onClick={() => setCreateOpen(false)} disabled={submitting} />
              <ModalSubmitButton onClick={() => handleFormSubmit('create')} submitting={submitting} icon={Plus}>
                Create Product
              </ModalSubmitButton>
            </>
          }
        >
          <ProductFormFields
            formName={formName}
            formSlug={formSlug}
            formDescription={formDescription}
            formCategory={formCategory}
            formSubcategory={formSubcategory}
            formBrand={formBrand}
            formMrp={formMrp}
            formSellingPrice={formSellingPrice}
            formSpecialPrice={formSpecialPrice}
            formStock={formStock}
            formSeller={formSeller}
            formStatus={formStatus}
            formActive={formActive}
            formImageUrl={formImageUrl}
            formHighlights={formHighlights}
            formTags={formTags}
            formReturnPolicy={formReturnPolicy}
            formWarranty={formWarranty}
            formSizeChart={formSizeChart}
            selectedSizeChartTemplateId={selectedSizeChartTemplateId}
            sizeChartTemplates={sizeChartTemplates}
            sizeChartTemplatesLoading={sizeChartTemplatesLoading}
            filterCategories={filterCategories}
            filterSubcategories={filterSubcategories}
            filterBrands={filterBrands}
            filterSellers={filterSellers}
            onNameChange={v => { setFormName(v); if (!formSlug) setFormSlug(generateSlug(v)) }}
            onSlugChange={setFormSlug}
            onDescriptionChange={setFormDescription}
            onCategoryChange={setFormCategory}
            onSubcategoryChange={setFormSubcategory}
            onBrandChange={setFormBrand}
            onMrpChange={setFormMrp}
            onSellingPriceChange={setFormSellingPrice}
            onSpecialPriceChange={setFormSpecialPrice}
            onStockChange={setFormStock}
            onSellerChange={setFormSeller}
            onStatusChange={setFormStatus}
            onActiveChange={setFormActive}
            onImageUrlChange={setFormImageUrl}
            onHighlightsChange={setFormHighlights}
            onTagsChange={setFormTags}
            onReturnPolicyChange={setFormReturnPolicy}
            onWarrantyChange={setFormWarranty}
            onSelectSizeChartTemplate={selectSizeChartTemplate}
          />
        </AdminModal>

        {/* ── Edit Product Modal ── */}
        <AdminModal
          open={editOpen}
          onOpenChange={setEditOpen}
          type="form"
          size="2xl"
          title="Edit Product"
          description={editProduct?.name || ''}
          footer={
            <>
              <ModalCancelButton onClick={() => setEditOpen(false)} disabled={submitting} />
              <ModalSubmitButton onClick={() => handleFormSubmit('edit')} submitting={submitting} icon={Pencil}>
                Update Product
              </ModalSubmitButton>
            </>
          }
        >
          <ProductFormFields
            formName={formName}
            formSlug={formSlug}
            formDescription={formDescription}
            formCategory={formCategory}
            formSubcategory={formSubcategory}
            formBrand={formBrand}
            formMrp={formMrp}
            formSellingPrice={formSellingPrice}
            formSpecialPrice={formSpecialPrice}
            formStock={formStock}
            formSeller={formSeller}
            formStatus={formStatus}
            formActive={formActive}
            formImageUrl={formImageUrl}
            formHighlights={formHighlights}
            formTags={formTags}
            formReturnPolicy={formReturnPolicy}
            formWarranty={formWarranty}
            formSizeChart={formSizeChart}
            selectedSizeChartTemplateId={selectedSizeChartTemplateId}
            sizeChartTemplates={sizeChartTemplates}
            sizeChartTemplatesLoading={sizeChartTemplatesLoading}
            filterCategories={filterCategories}
            filterSubcategories={filterSubcategories}
            filterBrands={filterBrands}
            filterSellers={filterSellers}
            onNameChange={v => { setFormName(v); setFormSlug(generateSlug(v)) }}
            onSlugChange={setFormSlug}
            onDescriptionChange={setFormDescription}
            onCategoryChange={setFormCategory}
            onSubcategoryChange={setFormSubcategory}
            onBrandChange={setFormBrand}
            onMrpChange={setFormMrp}
            onSellingPriceChange={setFormSellingPrice}
            onSpecialPriceChange={setFormSpecialPrice}
            onStockChange={setFormStock}
            onSellerChange={setFormSeller}
            onStatusChange={setFormStatus}
            onActiveChange={setFormActive}
            onImageUrlChange={setFormImageUrl}
            onHighlightsChange={setFormHighlights}
            onTagsChange={setFormTags}
            onReturnPolicyChange={setFormReturnPolicy}
            onWarrantyChange={setFormWarranty}
            onSelectSizeChartTemplate={selectSizeChartTemplate}
          />
        </AdminModal>

        {/* ── Bulk Delete Confirm Modal ── */}
        <AdminDeleteModal
          open={bulkConfirmOpen}
          onOpenChange={setBulkConfirmOpen}
          title="Bulk Delete Products"
          itemName="products"
          name={`${selectedIds.size} products`}
          warningText="This action cannot be undone. All selected products and their images will be permanently deleted."
          submitting={submitting}
          onDelete={() => executeBulkAction(bulkAction)}
          onCancel={() => setBulkConfirmOpen(false)}
        />

        {/* ── Bulk Reject Modal ── */}
        <AdminModal
          open={bulkRejectOpen}
          onOpenChange={setBulkRejectOpen}
          type="form"
          size="md"
          title="Bulk Reject Products"
          description={`Reject ${selectedIds.size} selected products`}
          footer={
            <>
              <ModalCancelButton onClick={() => setBulkRejectOpen(false)} disabled={submitting} />
              <ModalSubmitButton
                onClick={() => executeBulkAction('reject', bulkRejectReason)}
                submitting={submitting}
                disabled={!bulkRejectReason.trim()}
                icon={ThumbsDown}
              >
                Reject All
              </ModalSubmitButton>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">
                A reason is required for rejecting {selectedIds.size} products.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Rejection Reason</Label>
              <Textarea
                placeholder="Explain why these products are being rejected..."
                value={bulkRejectReason}
                onChange={e => setBulkRejectReason(e.target.value)}
                className="rounded-lg min-h-[80px] resize-none"
                rows={3}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick reasons:</p>
              <div className="flex flex-wrap gap-1.5">
                {REJECTION_REASONS.map(reason => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setBulkRejectReason(reason)}
                    className={cn(
                      'text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                      bulkRejectReason === reason
                        ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                        : 'bg-muted/30 border-border hover:border-red-300 dark:hover:border-red-800 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </AdminModal>
      </motion.div>
    </TooltipProvider>
  )
}

/* ====================================================================== */
/*  Info Field Sub-component                                               */
/* ====================================================================== */

function InfoField({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {typeof value === 'string' ? (
        <p className={cn('text-sm', highlight && 'font-semibold text-emerald-600 dark:text-emerald-400')}>
          {value || '\u2014'}
        </p>
      ) : (
        <div>{value}</div>
      )}
    </div>
  )
}

/* ====================================================================== */
/*  Product Form Fields Sub-component                                      */
/* ====================================================================== */

interface ProductFormFieldsProps {
  formName: string
  formSlug: string
  formDescription: string
  formCategory: string
  formSubcategory: string
  formBrand: string
  formMrp: string
  formSellingPrice: string
  formSpecialPrice: string
  formStock: string
  formSeller: string
  formStatus: string
  formActive: boolean
  formImageUrl: string
  formHighlights: string
  formTags: string
  formReturnPolicy: string
  formWarranty: string
  formSizeChart: {
    headers: string[]
    rows: Record<string, string>[]
    imageUrl?: string
    unit?: 'metric' | 'imperial' | 'both'
    howToMeasure?: string[]
  } | null
  selectedSizeChartTemplateId: string
  sizeChartTemplates: SizeChartTemplate[]
  sizeChartTemplatesLoading: boolean
  filterCategories: string[]
  filterSubcategories: string[]
  filterBrands: string[]
  filterSellers: string[]
  onNameChange: (v: string) => void
  onSlugChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onSubcategoryChange: (v: string) => void
  onBrandChange: (v: string) => void
  onMrpChange: (v: string) => void
  onSellingPriceChange: (v: string) => void
  onSpecialPriceChange: (v: string) => void
  onStockChange: (v: string) => void
  onSellerChange: (v: string) => void
  onStatusChange: (v: string) => void
  onActiveChange: (v: boolean) => void
  onImageUrlChange: (v: string) => void
  onHighlightsChange: (v: string) => void
  onTagsChange: (v: string) => void
  onReturnPolicyChange: (v: string) => void
  onWarrantyChange: (v: string) => void
  onSelectSizeChartTemplate: (templateId: string) => void
}

function ProductFormFields({
  formName, formSlug, formDescription, formCategory, formSubcategory, formBrand,
  formMrp, formSellingPrice, formSpecialPrice, formStock, formSeller, formStatus,
  formActive, formImageUrl, formHighlights, formTags, formReturnPolicy, formWarranty,
  formSizeChart, selectedSizeChartTemplateId, sizeChartTemplates, sizeChartTemplatesLoading,
  filterCategories, filterSubcategories, filterBrands, filterSellers,
  onNameChange, onSlugChange, onDescriptionChange, onCategoryChange, onSubcategoryChange,
  onBrandChange, onMrpChange, onSellingPriceChange, onSpecialPriceChange, onStockChange,
  onSellerChange, onStatusChange, onActiveChange, onImageUrlChange, onHighlightsChange,
  onTagsChange, onReturnPolicyChange, onWarrantyChange, onSelectSizeChartTemplate,
}: ProductFormFieldsProps) {

  /* ── AI Suggested Highlights State ── */
  const [aiHighlights, setAiHighlights] = useState<string[]>([])
  const [aiHighlightsLoading, setAiHighlightsLoading] = useState(false)
  const [aiHighlightsError, setAiHighlightsError] = useState('')

  const fetchAiHighlights = async () => {
    if (!formName || formName.trim().length < 2) {
      toast({ title: 'Product Name Required', description: 'Enter a product name first to get AI suggestions', variant: 'destructive' })
      return
    }
    setAiHighlightsLoading(true)
    setAiHighlightsError('')
    setAiHighlights([])
    try {
      const res = await fetch('/api/admin/products/suggest-highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          subcategory: formSubcategory,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get suggestions')
      }
      setAiHighlights(data.highlights || [])
    } catch (err) {
      setAiHighlightsError(err instanceof Error ? err.message : 'Failed to get AI suggestions')
    } finally {
      setAiHighlightsLoading(false)
    }
  }

  const addAiHighlightToForm = (suggestion: string) => {
    const currentHighlights = formHighlights ? formHighlights.split(',').map(h => h.trim()).filter(Boolean) : []
    if (currentHighlights.includes(suggestion)) return
    if (currentHighlights.length >= 10) return
    const newHighlights = [...currentHighlights, suggestion].join(', ')
    onHighlightsChange(newHighlights)
  }

  const currentHighlightList = formHighlights ? formHighlights.split(',').map(h => h.trim()).filter(Boolean) : []

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Basic Information</h3>
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Product Name *</Label>
              <Input
                placeholder="Enter product name"
                value={formName}
                onChange={e => onNameChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Slug</Label>
              <Input
                placeholder="auto-generated-slug"
                value={formSlug}
                onChange={e => onSlugChange(e.target.value)}
                className="bg-muted/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Category</Label>
              <Select value={formCategory} onValueChange={onCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {filterCategories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  {filterCategories.length === 0 && (
                    <SelectItem value="__none" disabled>No categories found</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Subcategory</Label>
              <Select value={formSubcategory} onValueChange={onSubcategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subcategory" />
                </SelectTrigger>
                <SelectContent>
                  {filterSubcategories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  {filterSubcategories.length === 0 && (
                    <SelectItem value="__none" disabled>No subcategories found</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Brand</Label>
              <Select value={formBrand} onValueChange={onBrandChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select or type brand" />
                </SelectTrigger>
                <SelectContent>
                  {filterBrands.filter(Boolean).map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                  <SelectItem value="__custom" disabled>Or type a new brand below</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              placeholder="Enter product description..."
              value={formDescription}
              onChange={e => onDescriptionChange(e.target.value)}
              className="rounded-lg min-h-[80px] resize-none"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Highlights</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAiHighlights}
                disabled={aiHighlightsLoading || !formName || formName.trim().length < 2}
                className="gap-1.5 h-7 text-xs border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              >
                {aiHighlightsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                AI Suggest
              </Button>
            </div>
            <Input
              placeholder="Comma-separated: e.g. 5000mAh Battery, 6.7&quot; Display"
              value={formHighlights}
              onChange={e => onHighlightsChange(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Separate with commas</p>

            {/* AI Suggested Highlights */}
            {aiHighlightsLoading && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">AI is generating suggestions...</span>
              </div>
            )}
            {aiHighlightsError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                <span className="text-[11px] text-red-600 dark:text-red-400">{aiHighlightsError}</span>
              </div>
            )}
            {aiHighlights.length > 0 && !aiHighlightsLoading && (
              <div className="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Star className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">AI Suggested — click to add</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {aiHighlights.map((suggestion, i) => {
                    const alreadyAdded = currentHighlightList.includes(suggestion)
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={alreadyAdded || currentHighlightList.length >= 10}
                        onClick={() => addAiHighlightToForm(suggestion)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border',
                          alreadyAdded
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 cursor-default'
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-emerald-300 hover:text-emerald-600 dark:hover:border-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer'
                        )}
                      >
                        {alreadyAdded && <CheckCircle2 className="h-2.5 w-2.5" />}
                        {suggestion}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Media */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Media</h3>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Image URL</Label>
            <Input
              placeholder="https://example.com/product-image.jpg"
              value={formImageUrl}
              onChange={e => onImageUrlChange(e.target.value)}
            />
            {formImageUrl && (
              <div className="mt-1.5">
                <img
                  src={formImageUrl}
                  alt="Preview"
                  className="h-14 w-14 rounded-lg object-cover border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Pricing */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Pricing & Inventory</h3>
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">MRP *</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={formMrp}
                onChange={e => onMrpChange(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Selling Price</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={formSellingPrice}
                onChange={e => onSellingPriceChange(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Special Price</Label>
              <Input
                type="number"
                placeholder="0.00 (optional)"
                value={formSpecialPrice}
                onChange={e => onSpecialPriceChange(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Stock</Label>
              <Input
                type="number"
                placeholder="0"
                value={formStock}
                onChange={e => onStockChange(e.target.value)}
                min="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Seller</Label>
              <Select value={formSeller} onValueChange={onSellerChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select seller" />
                </SelectTrigger>
                <SelectContent>
                  {filterSellers.filter(Boolean).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Tags */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Tags</h3>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tags</Label>
            <Input
              placeholder="Comma-separated: e.g. electronics, phone, smartphone"
              value={formTags}
              onChange={e => onTagsChange(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Separate with commas</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Shipping & Policy */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Return & Warranty</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Return Policy</Label>
            <Input
              placeholder="e.g. 7 Days Replacement"
              value={formReturnPolicy}
              onChange={e => onReturnPolicyChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Warranty</Label>
            <Input
              placeholder="e.g. 1 Year Manufacturer Warranty"
              value={formWarranty}
              onChange={e => onWarrantyChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Size Chart */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Size Chart</h3>
          {formSizeChart && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectSizeChartTemplate('')}
              className="text-destructive gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>

        {/* Size Chart Template Selector */}
        <div className="space-y-2 mb-3">
          {sizeChartTemplatesLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading templates...
            </div>
          ) : (
            <Select value={selectedSizeChartTemplateId} onValueChange={onSelectSizeChartTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select a size chart template from database..." />
              </SelectTrigger>
              <SelectContent>
                {sizeChartTemplates.length > 0 ? (
                  sizeChartTemplates.map(t => (
                    <SelectItem key={t._id} value={t._id}>
                      <div className="flex items-center gap-2">
                        <span>{t.name}</span>
                        {t.isSystem && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">System</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                    No size chart templates available
                  </div>
                )}
              </SelectContent>
            </Select>
          )}

          {sizeChartTemplates.length === 0 && !sizeChartTemplatesLoading && (
            <p className="text-xs text-muted-foreground">
              No size chart templates found in the database. Create templates in the Size Charts page first.
            </p>
          )}
        </div>

        {/* Size Chart Preview (read-only) */}
        {formSizeChart && (
          <div className="space-y-3">
            {/* Selected template info */}
            {selectedSizeChartTemplateId && (() => {
              const selectedTemplate = sizeChartTemplates.find(t => t._id === selectedSizeChartTemplateId)
              return selectedTemplate ? (
                <div className="flex items-center gap-2 text-xs">
                  <TableProperties className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-medium">{selectedTemplate.name}</span>
                </div>
              ) : null
            })()}

            {/* Size Chart Table (read-only preview) */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    {formSizeChart.headers.map((h, hi) => (
                      <th key={hi} className={cn(
                        "px-3 py-2 text-left font-semibold whitespace-nowrap",
                        hi === 0 && "font-bold"
                      )}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {formSizeChart.rows.length === 0 ? (
                    <tr>
                      <td colSpan={formSizeChart.headers.length} className="px-3 py-4 text-center text-muted-foreground text-xs">
                        No size data in this template
                      </td>
                    </tr>
                  ) : (
                    formSizeChart.rows.map((row, ri) => (
                      <tr key={ri} className={cn(ri % 2 === 0 ? '' : 'bg-muted/20')}>
                        {formSizeChart!.headers.map((h, hi) => (
                          <td key={h} className={cn(
                            "px-3 py-1.5 whitespace-nowrap",
                            hi === 0 && "font-medium"
                          )}>
                            {row[h] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Chart metadata */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{formSizeChart.rows.length} size{formSizeChart.rows.length !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{formSizeChart.headers.length} measurement{formSizeChart.headers.length !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>Unit: {formSizeChart.unit === 'metric' ? 'Centimeters' : formSizeChart.unit === 'imperial' ? 'Inches' : 'Both'}</span>
            </div>

            {/* How to Measure (read-only) */}
            {formSizeChart.howToMeasure && formSizeChart.howToMeasure.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1.5">How to Measure</p>
                <div className="space-y-1">
                  {formSizeChart.howToMeasure.map((tip, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[10px] text-muted-foreground mt-0.5">•</span>
                      <span className="text-[10px] text-muted-foreground">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Status */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Status</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Product Status</Label>
            <Select value={formStatus} onValueChange={onStatusChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Pending">Pending Review</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Published">Published</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Admin can set any status directly</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Active</Label>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={formActive}
                onCheckedChange={onActiveChange}
              />
              <span className="text-sm text-muted-foreground">
                {formActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
