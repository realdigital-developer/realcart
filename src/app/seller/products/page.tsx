'use client'

/* ------------------------------------------------------------------ */
/*  Seller Product Management Page                                     */
/*  Production-level multi-step product listing & form                 */
/*  Following Flipkart/Meesho/Amazon seller panel patterns             */
/* ------------------------------------------------------------------ */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import {
  Package,
  Plus,
  Search,
  Pencil,
  Trash2,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Copy,
  FileText,
  Tags,
  Truck,
  BarChart3,
  ImagePlus,
  DollarSign,
  Settings2,
  AlertTriangle,
  Info,
  Star,
  GripVertical,
  PlusCircle,
  MinusCircle,
  ChevronDown,
  ExternalLink,
  ArrowRight,
  Ruler,
  TableProperties,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useIsMobile } from '@/hooks/use-mobile'

/* ================================================================== */
/*  TYPE DEFINITIONS                                                   */
/* ================================================================== */

interface ProductImage {
  url: string
  alt: string
  publicId: string
  isPrimary: boolean
}

interface ProductVariant {
  _id?: string
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

interface SizeChart {
  headers: string[]
  rows: Record<string, string>[]
  imageUrl?: string
  unit?: 'metric' | 'imperial' | 'both'
  howToMeasure?: string[]
}

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

type ProductStatus = 'Draft' | 'Pending' | 'Approved' | 'Published' | 'Rejected' | 'Suspended'

interface Product {
  _id: string
  name: string
  slug?: string
  description: string
  category: string
  subcategory?: string
  brand?: string
  images: ProductImage[]
  videoUrl?: string
  mrp: number
  sellingPrice: number
  specialPrice?: number
  specialPriceStartDate?: string | null
  specialPriceEndDate?: string | null
  variantAttributes: string[]
  variants: ProductVariant[]
  stock: number
  lowStockThreshold?: number
  trackInventory?: boolean
  specifications: SpecificationGroup[]
  highlights: string[]
  sizeChart?: SizeChart | null
  shipping: ProductShipping
  returnPolicy?: string
  warranty?: string
  seo: ProductSEO
  seller: string
  sellerId?: string
  storeName?: string
  status: ProductStatus
  approvalNotes?: string
  active: boolean
  tags: string[]
  totalSold?: number
  viewCount?: number
  createdAt: string
  updatedAt?: string
  approvedAt?: string | null
  publishedAt?: string | null
  imageUrl?: string
  price?: number
  discounts?: unknown[]
}

interface ProductCounts {
  total: number
  draft: number
  pending: number
  approved: number
  published: number
  rejected: number
}

interface CategoryItem {
  _id: string
  name: string
  subcategories?: { _id: string; name: string }[]
}

interface AttributeItem {
  _id: string
  name: string
  values: string[]
  type?: string
}

interface TagItem {
  _id: string
  name: string
  category?: string
}

/* ================================================================== */
/*  FORM DEFAULT VALUES                                                */
/* ================================================================== */

const EMPTY_FORM: ProductFormData = {
  name: '',
  category: '',
  subcategory: '',
  brand: '',
  description: '',
  highlights: [],
  images: [],
  videoUrl: '',
  mrp: 0,
  sellingPrice: 0,
  specialPrice: 0,
  specialPriceStartDate: '',
  specialPriceEndDate: '',
  stock: 0,
  lowStockThreshold: 5,
  trackInventory: true,
  variantAttributes: [],
  variants: [],
  specifications: [],
  sizeChart: null,
  shipping: {
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
    hsnCode: '',
    gstRate: 18,
    deliveryCharge: 0,
    freeDeliveryAbove: 0,
  },
  returnPolicy: '7 Days Replacement',
  warranty: '',
  seo: {
    metaTitle: '',
    metaDescription: '',
    searchKeywords: [],
    canonicalUrl: '',
  },
  tags: [],
}

interface ProductFormData {
  name: string
  category: string
  subcategory: string
  brand: string
  description: string
  highlights: string[]
  images: ProductImage[]
  videoUrl: string
  mrp: number
  sellingPrice: number
  specialPrice: number
  specialPriceStartDate: string
  specialPriceEndDate: string
  stock: number
  lowStockThreshold: number
  trackInventory: boolean
  variantAttributes: string[]
  variants: ProductVariant[]
  specifications: SpecificationGroup[]
  sizeChart: SizeChart | null
  shipping: ProductShipping
  returnPolicy: string
  warranty: string
  seo: ProductSEO
  tags: string[]
}

/* ================================================================== */
/*  STATUS CONFIG                                                      */
/* ================================================================== */

const STATUS_CONFIG: Record<ProductStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  Draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200', icon: FileText },
  Pending: { label: 'Pending Review', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertCircle },
  Approved: { label: 'Approved', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: CheckCircle2 },
  Published: { label: 'Published', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  Rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle },
  Suspended: { label: 'Suspended', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: AlertTriangle },
}

const RETURN_POLICIES = [
  'No Return',
  '7 Days Replacement',
  '7 Days Refund',
  '15 Days Replacement',
  '15 Days Refund',
  '30 Days Replacement',
]

const FORM_STEPS = [
  { id: 1, title: 'Basic Info', icon: FileText },
  { id: 2, title: 'Images & Video', icon: ImageIcon },
  { id: 3, title: 'Pricing & Stock', icon: DollarSign },
  { id: 4, title: 'Variants', icon: Settings2 },
  { id: 5, title: 'Specifications', icon: BarChart3 },
  { id: 6, title: 'Shipping & Returns', icon: Truck },
  { id: 7, title: 'SEO & Tags', icon: Tags },
]

/* ================================================================== */
/*  HELPER FUNCTIONS                                                   */


function getPrimaryImage(product: Product): string {
  if (product.images && product.images.length > 0) {
    const primary = product.images.find(img => img.isPrimary)
    return primary?.url || product.images[0].url
  }
  return product.imageUrl || '/placeholder.png'
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function SellerProductsPage() {
  const { user, authenticated, loading: authLoading, handleSessionExpired } = useSellerAuth()
  const router = useRouter()
  const { toast } = useToast()
  const isMobile = useIsMobile()

  /* ── Listing State ── */
  const [products, setProducts] = useState<Product[]>([])
  const [counts, setCounts] = useState<ProductCounts>({ total: 0, draft: 0, pending: 0, approved: 0, published: 0, rejected: 0 })
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [sellerCategories, setSellerCategories] = useState<string[]>([])
  const [sellerSubcategories, setSellerSubcategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  // Grid view is always used — no list/table view toggle

  /* ── Form State ── */
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formStep, setFormStep] = useState(1)
  const [formData, setFormData] = useState<ProductFormData>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [attributes, setAttributes] = useState<AttributeItem[]>([])
  const [tags, setTags] = useState<TagItem[]>([])

  /* ── Image Upload State ── */
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Delete Dialog State ── */
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null })
  const [deleting, setDeleting] = useState(false)

  /* ── Re-edit Warning Dialog ── */
  const [reeditDialog, setReeditDialog] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null })

  /* ── Validation Highlights ── */
  const [highlightErrors, setHighlightErrors] = useState<Record<number, string>>({})

  /* ── AI Suggested Highlights ── */
  const [aiHighlights, setAiHighlights] = useState<string[]>([])
  const [aiHighlightsLoading, setAiHighlightsLoading] = useState(false)
  const [aiHighlightsError, setAiHighlightsError] = useState('')

  /* ── Size Chart Templates State ── */
  const [sizeChartTemplates, setSizeChartTemplates] = useState<SizeChartTemplate[]>([])
  const [selectedSizeChartTemplateId, setSelectedSizeChartTemplateId] = useState<string>('')
  const [sizeChartUnit, setSizeChartUnit] = useState<'imperial' | 'metric'>('imperial')

  /* ================================================================ */
  /*  DATA FETCHING                                                    */
  /* ================================================================ */

  const fetchProducts = useCallback(async (p = page, s = search, st = statusFilter, c = categoryFilter) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ page: String(p), limit: '12' })
      if (s) params.set('search', s)
      if (st && st !== 'all') params.set('status', st)
      if (c && c !== 'all') params.set('category', c)

      const res = await fetch(`/api/seller/products?${params}`)
      if (res.status === 401 || res.status === 403) {
        handleSessionExpired()
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch products')
      }

      const data = await res.json()
      setProducts(data.products || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
      if (data.counts) setCounts(data.counts)
      if (data.categories) setSellerCategories(data.categories)
      if (data.subcategories) setSellerSubcategories(data.subcategories)
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load products', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, categoryFilter, handleSessionExpired, toast])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories')
      if (res.ok) {
        const data = await res.json()
        setCategories(data.categories || [])
      }
    } catch {
      // Non-critical, silently fail
    }
  }, [])

  const fetchAttributes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/attributes?limit=100')
      if (res.ok) {
        const data = await res.json()
        setAttributes(data.attributes || [])
      }
    } catch {
      // Non-critical
    }
  }, [])

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tags?limit=100')
      if (res.ok) {
        const data = await res.json()
        setTags(data.tags || [])
      }
    } catch {
      // Non-critical
    }
  }, [])

  const fetchSizeChartTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/size-chart-templates?status=Active')
      if (res.ok) {
        const data = await res.json()
        setSizeChartTemplates(data.templates || [])
      }
    } catch {
      // Non-critical
    }
  }, [])



  /* ── Initial Load ── */
  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.push('/seller')
      return
    }
    if (authenticated) {
      fetchProducts()
      fetchCategories()
      fetchSizeChartTemplates()
    }
  }, [authenticated, authLoading, router, fetchProducts, fetchCategories])

  /* ── Refetch when filters change ── */
  useEffect(() => {
    if (authenticated) fetchProducts()
  }, [page, statusFilter, categoryFilter, authenticated, fetchProducts])

  /* ── Debounced search ── */
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!authenticated) return
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setPage(1)
      fetchProducts(1, search, statusFilter, categoryFilter)
    }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [search, authenticated, fetchProducts, statusFilter, categoryFilter])

  /* ================================================================ */
  /*  FORM HANDLERS                                                    */
  /* ================================================================ */

  const openAddForm = () => {
    setEditingProduct(null)
    setFormData({ ...EMPTY_FORM })
    setFormStep(1)
    setFormErrors({})
    setHighlightErrors({})
    setAiHighlights([])
    setAiHighlightsError('')
    setSizeChartUnit('imperial')
    setShowForm(true)
    fetchAttributes()
    fetchTags()
  }

  const openEditForm = (product: Product) => {
    // Warn for Published products
    if (product.status === 'Published') {
      setReeditDialog({ open: true, product })
      return
    }
    startEditForm(product)
  }

  const startEditForm = (product: Product) => {
    setReeditDialog({ open: false, product: null })
    setEditingProduct(product)
    setFormData({
      name: product.name || '',
      category: product.category || '',
      subcategory: product.subcategory || '',
      brand: product.brand || '',
      description: product.description || '',
      highlights: product.highlights || [],
      images: product.images || [],
      videoUrl: product.videoUrl || '',
      mrp: product.mrp || 0,
      sellingPrice: product.sellingPrice || 0,
      specialPrice: product.specialPrice || 0,
      specialPriceStartDate: product.specialPriceStartDate ? product.specialPriceStartDate.split('T')[0] : '',
      specialPriceEndDate: product.specialPriceEndDate ? product.specialPriceEndDate.split('T')[0] : '',
      stock: product.stock || 0,
      lowStockThreshold: product.lowStockThreshold || 5,
      trackInventory: product.trackInventory !== false,
      variantAttributes: product.variantAttributes || [],
      variants: product.variants || [],
      specifications: product.specifications || [],
      sizeChart: product.sizeChart || null,
      shipping: product.shipping || { ...EMPTY_FORM.shipping },
      returnPolicy: product.returnPolicy || '7 Days Replacement',
      warranty: product.warranty || '',
      seo: product.seo || { ...EMPTY_FORM.seo },
      tags: product.tags || [],
    })
    setSelectedSizeChartTemplateId('')
    setFormStep(1)
    setFormErrors({})
    setHighlightErrors({})
    setAiHighlights([])
    setAiHighlightsError('')
    setShowForm(true)
    fetchAttributes()
    fetchTags()
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingProduct(null)
    setFormData({ ...EMPTY_FORM })
    setFormStep(1)
    setFormErrors({})
    setAiHighlights([])
    setAiHighlightsError('')
    setSelectedSizeChartTemplateId('')
    setSizeChartTemplates([])
  }

  /* ── Form Field Updater ── */
  const updateForm = useCallback(<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    // Clear error for this field
    setFormErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  /* ── Image Upload ── */
  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const remaining = 8 - formData.images.length
    if (remaining <= 0) {
      toast({ title: 'Limit Reached', description: 'Maximum 8 images allowed', variant: 'destructive' })
      return
    }
    const filesToUpload = Array.from(files).slice(0, remaining)
    setUploadingImage(true)

    for (const file of filesToUpload) {
      try {
        const formDataObj = new FormData()
        formDataObj.append('file', file)
        const res = await fetch('/api/seller/products/upload', {
          method: 'POST',
          body: formDataObj,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Upload failed')
        }
        const data = await res.json()
        const newImage: ProductImage = {
          url: data.url,
          alt: formData.name || file.name,
          publicId: data.publicId,
          isPrimary: formData.images.length === 0,
        }
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, newImage],
        }))
      } catch (err) {
        toast({ title: 'Upload Error', description: err instanceof Error ? err.message : 'Failed to upload image', variant: 'destructive' })
      }
    }
    setUploadingImage(false)
  }

  const removeImage = (index: number) => {
    setFormData(prev => {
      const images = [...prev.images]
      const wasPrimary = images[index]?.isPrimary
      images.splice(index, 1)
      if (wasPrimary && images.length > 0) {
        images[0].isPrimary = true
      }
      return { ...prev, images }
    })
  }

  const setPrimaryImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.map((img, i) => ({ ...img, isPrimary: i === index })),
    }))
  }

  /* ── Highlights Management ── */
  const addHighlight = () => {
    if (formData.highlights.length >= 10) {
      toast({ title: 'Limit Reached', description: 'Maximum 10 highlights allowed', variant: 'destructive' })
      return
    }
    setFormData(prev => ({ ...prev, highlights: [...prev.highlights, ''] }))
  }

  const addHighlightValue = (value: string) => {
    if (formData.highlights.length >= 10) {
      toast({ title: 'Limit Reached', description: 'Maximum 10 highlights allowed', variant: 'destructive' })
      return
    }
    if (formData.highlights.includes(value)) return
    setFormData(prev => ({ ...prev, highlights: [...prev.highlights, value] }))
  }

  const updateHighlight = (index: number, value: string) => {
    setFormData(prev => {
      const highlights = [...prev.highlights]
      highlights[index] = value
      return { ...prev, highlights }
    })
    setHighlightErrors(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const removeHighlight = (index: number) => {
    setFormData(prev => {
      const highlights = [...prev.highlights]
      highlights.splice(index, 1)
      return { ...prev, highlights }
    })
  }

  /* ── AI Suggest Highlights ── */
  const fetchAiHighlights = async () => {
    if (!formData.name || formData.name.trim().length < 2) {
      toast({ title: 'Product Name Required', description: 'Enter a product name first to get AI suggestions', variant: 'destructive' })
      return
    }
    setAiHighlightsLoading(true)
    setAiHighlightsError('')
    setAiHighlights([])
    try {
      const res = await fetch('/api/seller/products/suggest-highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          subcategory: formData.subcategory,
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

  /* ── Variants Management ── */
  const addVariantAttribute = (attrName: string) => {
    if (formData.variantAttributes.includes(attrName)) return
    setFormData(prev => ({
      ...prev,
      variantAttributes: [...prev.variantAttributes, attrName],
    }))
  }

  const removeVariantAttribute = (attrName: string) => {
    setFormData(prev => ({
      ...prev,
      variantAttributes: prev.variantAttributes.filter(a => a !== attrName),
      variants: prev.variants.map(v => {
        const attrs = { ...v.attributes }
        delete attrs[attrName]
        return { ...v, attributes: attrs }
      }),
    }))
  }

  const addVariant = () => {
    const newVariant: ProductVariant = {
      sku: `SKU-${Date.now().toString(36).toUpperCase()}`,
      attributes: {},
      mrp: formData.mrp,
      sellingPrice: formData.sellingPrice,
      stock: 0,
      images: [],
      isActive: true,
    }
    // Pre-fill attributes from selected variant attributes
    for (const attr of formData.variantAttributes) {
      const attrData = attributes.find(a => a.name === attr)
      newVariant.attributes[attr] = attrData?.values?.[0] || ''
    }
    setFormData(prev => ({ ...prev, variants: [...prev.variants, newVariant] }))
  }

  const updateVariant = (index: number, field: string, value: unknown) => {
    setFormData(prev => {
      const variants = [...prev.variants]
      variants[index] = { ...variants[index], [field]: value }
      return { ...prev, variants }
    })
  }

  const updateVariantAttribute = (variantIndex: number, attrName: string, value: string) => {
    setFormData(prev => {
      const variants = [...prev.variants]
      variants[variantIndex] = {
        ...variants[variantIndex],
        attributes: { ...variants[variantIndex].attributes, [attrName]: value },
      }
      return { ...prev, variants }
    })
  }

  const removeVariant = (index: number) => {
    setFormData(prev => {
      const variants = [...prev.variants]
      variants.splice(index, 1)
      return { ...prev, variants }
    })
  }

  /* ── Specifications Management ── */
  const addSpecGroup = () => {
    setFormData(prev => ({
      ...prev,
      specifications: [...prev.specifications, { group: '', specs: [{ key: '', value: '' }] }],
    }))
  }

  const updateSpecGroup = (groupIndex: number, field: 'group', value: string) => {
    setFormData(prev => {
      const specifications = [...prev.specifications]
      specifications[groupIndex] = { ...specifications[groupIndex], [field]: value }
      return { ...prev, specifications }
    })
  }

  const addSpecToGroup = (groupIndex: number) => {
    setFormData(prev => {
      const specifications = [...prev.specifications]
      specifications[groupIndex] = {
        ...specifications[groupIndex],
        specs: [...specifications[groupIndex].specs, { key: '', value: '' }],
      }
      return { ...prev, specifications }
    })
  }

  const updateSpecInGroup = (groupIndex: number, specIndex: number, field: 'key' | 'value', value: string) => {
    setFormData(prev => {
      const specifications = [...prev.specifications]
      const specs = [...specifications[groupIndex].specs]
      specs[specIndex] = { ...specs[specIndex], [field]: value }
      specifications[groupIndex] = { ...specifications[groupIndex], specs }
      return { ...prev, specifications }
    })
  }

  const removeSpecFromGroup = (groupIndex: number, specIndex: number) => {
    setFormData(prev => {
      const specifications = [...prev.specifications]
      const specs = [...specifications[groupIndex].specs]
      specs.splice(specIndex, 1)
      specifications[groupIndex] = { ...specifications[groupIndex], specs }
      return { ...prev, specifications }
    })
  }

  const removeSpecGroup = (groupIndex: number) => {
    setFormData(prev => {
      const specifications = [...prev.specifications]
      specifications.splice(groupIndex, 1)
      return { ...prev, specifications }
    })
  }

  /* ── Size Chart: Select from Database ── */
  const selectSizeChartTemplate = (templateId: string) => {
    if (!templateId) {
      setSelectedSizeChartTemplateId('')
      updateForm('sizeChart', null)
      return
    }
    const template = sizeChartTemplates.find(t => t._id === templateId)
    if (!template) return
    setSelectedSizeChartTemplateId(templateId)
    updateForm('sizeChart', {
      headers: [...template.headers],
      rows: template.rows.map(r => ({ ...r })),
      unit: template.unit === 'both' ? 'imperial' : template.unit,
      howToMeasure: template.howToMeasure || [],
    })
  }

  /* ── SEO Keywords Management ── */
  const addSearchKeyword = () => {
    setFormData(prev => ({
      ...prev,
      seo: { ...prev.seo, searchKeywords: [...prev.seo.searchKeywords, ''] },
    }))
  }

  const updateSearchKeyword = (index: number, value: string) => {
    setFormData(prev => {
      const keywords = [...prev.seo.searchKeywords]
      keywords[index] = value
      return { ...prev, seo: { ...prev.seo, searchKeywords: keywords } }
    })
  }

  const removeSearchKeyword = (index: number) => {
    setFormData(prev => {
      const keywords = [...prev.seo.searchKeywords]
      keywords.splice(index, 1)
      return { ...prev, seo: { ...prev.seo, searchKeywords: keywords } }
    })
  }

  /* ── Form Validation ── */
  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {}
    const hlErrors: Record<number, string> = {}

    switch (step) {
      case 1:
        if (!formData.name.trim()) errors.name = 'Product name is required'
        if (!formData.category) errors.category = 'Category is required'
        if (!formData.description.trim()) errors.description = 'Description is required'
        else if (formData.description.trim().length < 20) errors.description = 'Description must be at least 20 characters'
        formData.highlights.forEach((h, i) => {
          if (h.trim() === '' && formData.highlights.some((hh, ii) => ii !== i && hh.trim() !== '')) {
            hlErrors[i] = 'Please fill or remove empty highlights'
          }
        })
        break
      case 2:
        if (formData.images.length === 0) errors.images = 'At least one product image is required'
        break
      case 3:
        if (!formData.mrp || formData.mrp <= 0) errors.mrp = 'MRP must be greater than 0'
        if (!formData.sellingPrice || formData.sellingPrice <= 0) errors.sellingPrice = 'Selling price must be greater than 0'
        if (formData.sellingPrice > formData.mrp) errors.sellingPrice = 'Selling price cannot exceed MRP'
        if (formData.specialPrice > 0 && formData.specialPrice > formData.sellingPrice) errors.specialPrice = 'Special price cannot exceed selling price'
        if (formData.specialPrice > 0 && (!formData.specialPriceStartDate || !formData.specialPriceEndDate)) errors.specialPriceEndDate = 'Start and end dates required for special price'
        if (formData.variants.length === 0 && (!formData.stock || formData.stock < 0)) errors.stock = 'Stock quantity is required'
        break
      case 4:
        // Variants are optional, validate if they exist
        formData.variants.forEach((v, i) => {
          if (!v.sku.trim()) errors[`variant_sku_${i}`] = `Variant ${i + 1}: SKU is required`
          if (v.mrp <= 0) errors[`variant_mrp_${i}`] = `Variant ${i + 1}: MRP must be > 0`
          if (v.sellingPrice <= 0) errors[`variant_sp_${i}`] = `Variant ${i + 1}: Selling price must be > 0`
        })
        break
      case 5:
      case 6:
      case 7:
        // Optional steps, no hard validation
        break
    }

    setFormErrors(errors)
    setHighlightErrors(hlErrors)
    return Object.keys(errors).length === 0 && Object.keys(hlErrors).length === 0
  }

  /* ── Save Product ── */
  const saveProduct = async (submitForReview = false) => {
    // Validate all required steps before submit
    if (submitForReview) {
      const step1Valid = validateStep(1)
      const step2Valid = validateStep(2)
      const step3Valid = validateStep(3)
      if (!step1Valid || !step2Valid || !step3Valid) {
        toast({ title: 'Validation Error', description: 'Please complete all required fields before submitting', variant: 'destructive' })
        return
      }
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        ...formData,
        highlights: formData.highlights.filter(h => h.trim()),
        seo: {
          ...formData.seo,
          searchKeywords: formData.seo.searchKeywords.filter(k => k.trim()),
        },
        status: submitForReview ? 'Pending' : (editingProduct?.status === 'Published' ? 'Pending' : (formData as unknown as Record<string, unknown>).status || 'Draft'),
      }

      // If editing a published product and submitting, change to Pending
      if (editingProduct && editingProduct.status === 'Published' && submitForReview) {
        payload.status = 'Pending'
      }

      let res: Response
      if (editingProduct) {
        payload._id = editingProduct._id
        res = await fetch('/api/seller/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/seller/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (res.status === 401 || res.status === 403) {
        handleSessionExpired()
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.details?.join(', ') || data.detail || 'Failed to save product')
      }

      toast({
        title: submitForReview ? 'Submitted for Review' : 'Saved as Draft',
        description: submitForReview ? 'Your product has been submitted for admin review.' : 'Your product has been saved as a draft.',
      })

      closeForm()
      fetchProducts()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save product', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  /* ── Delete Product ── */
  const deleteProduct = async () => {
    if (!deleteDialog.product) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/seller/products?id=${deleteDialog.product._id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete product')
      }
      toast({ title: 'Deleted', description: 'Product has been deleted.' })
      setDeleteDialog({ open: false, product: null })
      fetchProducts()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete product', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  /* ── Duplicate Product ── */
  const duplicateProduct = async (product: Product) => {
    try {
      const payload = {
        ...product,
        _id: undefined,
        name: `${product.name} (Copy)`,
        status: 'Draft',
        active: false,
        totalSold: 0,
        viewCount: 0,
      }
      delete (payload as Record<string, unknown>)._id
      delete (payload as Record<string, unknown>).slug
      delete (payload as Record<string, unknown>).approvedAt
      delete (payload as Record<string, unknown>).publishedAt
      delete (payload as Record<string, unknown>).approvalNotes

      const res = await fetch('/api/seller/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to duplicate product')
      }
      toast({ title: 'Duplicated', description: 'Product has been duplicated as a Draft.' })
      fetchProducts()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to duplicate product', variant: 'destructive' })
    }
  }

  /* ── Toggle Active Status ── */
  const toggleActive = async (product: Product) => {
    try {
      const res = await fetch('/api/seller/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: product._id, active: !product.active }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update product')
      }
      toast({ title: 'Updated', description: `Product ${!product.active ? 'activated' : 'deactivated'}.` })
      fetchProducts()
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update product', variant: 'destructive' })
    }
  }

  /* ── Step Navigation ── */
  const goToStep = (step: number) => {
    if (step < formStep || validateStep(formStep)) {
      setFormStep(step)
    }
  }

  const nextStep = () => {
    if (validateStep(formStep) && formStep < 7) {
      setFormStep(formStep + 1)
    }
  }

  const prevStep = () => {
    if (formStep > 1) setFormStep(formStep - 1)
  }

  /* ── Get subcategories for selected category ── */
  const selectedCategoryData = categories.find(c => c.name === formData.category)
  const subcategoriesForCategory = selectedCategoryData?.subcategories || []

  /* ================================================================ */
  /*  RENDER: AUTH GUARD                                               */
  /* ================================================================ */

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!authenticated) return null

  /* ================================================================ */
  /*  RENDER: STAT CARDS                                               */
  /* ================================================================ */

  const statCards = [
    { label: 'Total', count: counts.total, icon: Package, color: 'text-gray-700', bg: 'bg-gray-100' },
    { label: 'Draft', count: counts.draft, icon: FileText, color: 'text-gray-500', bg: 'bg-gray-50' },
    { label: 'Pending', count: counts.pending, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Published', count: counts.published, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Rejected', count: counts.rejected, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  ]

  /* ================================================================ */
  /*  RENDER: PRODUCT CARD (Grid View)                                 */
  /* ================================================================ */

  const renderProductCard = (product: Product) => {
    const statusCfg = STATUS_CONFIG[product.status] || STATUS_CONFIG.Draft
    const StatusIcon = statusCfg.icon
    const primaryImg = getPrimaryImage(product)

    return (
      <motion.div
        key={product._id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        <Card className="overflow-hidden hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-all duration-200 group py-0 gap-0 h-full flex flex-col">
          <div className="relative w-full bg-muted flex-shrink-0" style={{ aspectRatio: '1 / 1' }}>
            <img src={primaryImg} alt={product.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <Badge variant="outline" className={cn(statusCfg.color, statusCfg.bg, statusCfg.border, 'gap-1 absolute top-2 left-2 text-[9px] backdrop-blur-sm')}>
              <StatusIcon className="h-2.5 w-2.5" />
              {statusCfg.label}
            </Badge>
            {!product.active && (
              <Badge variant="outline" className="absolute top-2 right-2 text-[9px] bg-gray-100/90 text-gray-500 border-gray-200 backdrop-blur-sm">
                Inactive
              </Badge>
            )}
          </div>
          <CardContent className="p-2.5 flex flex-col flex-1 min-h-0">
            <h3 className="font-medium text-xs sm:text-sm truncate" title={product.name}>{product.name}</h3>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">{product.category}{product.subcategory ? ` › ${product.subcategory}` : ''}</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-semibold text-xs sm:text-sm text-foreground">{fmtPrice(product.sellingPrice)}</span>
              {product.mrp > product.sellingPrice && (
                <span className="text-[10px] text-muted-foreground line-through">{fmtPrice(product.mrp)}</span>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className={cn('text-[10px] sm:text-[11px] font-medium', product.stock <= 5 && product.stock > 0 && 'text-amber-600', product.stock === 0 && 'text-red-600', product.stock > 5 && 'text-muted-foreground')}>
                Stock: {product.stock}
              </span>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground">{formatRelativeDate(product.createdAt)}</span>
            </div>
            {product.status === 'Rejected' && product.approvalNotes && (
              <div className="mt-1.5 p-1.5 bg-red-50 dark:bg-red-950/20 rounded text-[9px] text-red-600 dark:text-red-400 line-clamp-2">
                <AlertTriangle className="h-2.5 w-2.5 inline mr-1" />{product.approvalNotes}
              </div>
            )}
            {/* Always-visible action buttons row — pushed to bottom for equal card heights */}
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
              <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2 text-foreground hover:bg-muted" onClick={() => openEditForm(product)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => duplicateProduct(product)} title="Duplicate">
                  <Copy className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => toggleActive(product)} title={product.active ? 'Deactivate' : 'Activate'}>
                  {product.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeleteDialog({ open: true, product })} title="Delete">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  /* ================================================================ */
  /*  RENDER: FORM STEP CONTENT                                        */
  /* ================================================================ */

  const renderStepContent = () => {
    switch (formStep) {
      /* ── Step 1: Basic Information ── */
      case 1:
        return (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Premium Cotton T-Shirt"
                value={formData.name}
                onChange={e => updateForm('name', e.target.value)}
                className={cn(formErrors.name && 'border-destructive')}
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={formData.category} onValueChange={val => {
                  updateForm('category', val)
                  updateForm('subcategory', '')
                }}>
                  <SelectTrigger className={cn(formErrors.category && 'border-destructive')}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat._id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.category && <p className="text-xs text-destructive">{formErrors.category}</p>}
              </div>

              <div className="space-y-2">
                <Label>Subcategory</Label>
                <Select value={formData.subcategory} onValueChange={val => updateForm('subcategory', val)} disabled={!formData.category}>
                  <SelectTrigger>
                    <SelectValue placeholder={formData.category ? 'Select subcategory' : 'Select category first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {subcategoriesForCategory.map(sub => (
                      <SelectItem key={sub._id} value={sub.name}>{sub.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                placeholder="e.g., Nike, Samsung"
                value={formData.brand}
                onChange={e => updateForm('brand', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description * <span className="text-muted-foreground font-normal">(min 20 characters)</span></Label>
              <Textarea
                id="description"
                placeholder="Describe your product in detail..."
                rows={5}
                value={formData.description}
                onChange={e => updateForm('description', e.target.value)}
                className={cn(formErrors.description && 'border-destructive')}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formErrors.description || ''}</span>
                <span className={cn(formData.description.length < 20 && 'text-amber-600')}>{formData.description.length} chars</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Highlights / Key Features <span className="text-muted-foreground font-normal">(max 10)</span></Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchAiHighlights}
                    disabled={aiHighlightsLoading || !formData.name || formData.name.trim().length < 2}
                    className="gap-1.5 border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  >
                    {aiHighlightsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                    AI Suggest
                  </Button>
                  <Button variant="outline" size="sm" onClick={addHighlight} disabled={formData.highlights.length >= 10} className="gap-1">
                    <PlusCircle className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              </div>

              {/* AI Suggested Highlights */}
              {aiHighlightsLoading && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">AI is generating suggestions based on your product details...</span>
                </div>
              )}
              {aiHighlightsError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-600 dark:text-red-400">{aiHighlightsError}</span>
                </div>
              )}
              {aiHighlights.length > 0 && !aiHighlightsLoading && (
                <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Star className="h-3 w-3 text-emerald-500" />
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">AI Suggested Highlights — click to add</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {aiHighlights.map((suggestion, i) => {
                      const alreadyAdded = formData.highlights.includes(suggestion)
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={alreadyAdded || formData.highlights.length >= 10}
                          onClick={() => addHighlightValue(suggestion)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border',
                            alreadyAdded
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 cursor-default'
                              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-emerald-300 hover:text-emerald-600 dark:hover:border-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer'
                          )}
                        >
                          {alreadyAdded && <CheckCircle2 className="h-3 w-3" />}
                          {suggestion}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {formData.highlights.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder={`Highlight ${i + 1}`}
                      value={h}
                      onChange={e => updateHighlight(i, e.target.value)}
                      className={cn(highlightErrors[i] && 'border-destructive')}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-destructive" onClick={() => removeHighlight(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      /* ── Step 2: Images & Video ── */
      case 2:
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <Label>Product Images * <span className="text-muted-foreground font-normal">(max 8)</span></Label>
              {formErrors.images && <p className="text-xs text-destructive">{formErrors.images}</p>}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {formData.images.map((img, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border bg-muted">
                    <img src={img.url} alt={img.alt} className="h-32 w-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      {img.isPrimary ? (
                        <Badge className="text-[10px] bg-emerald-500 text-white">Primary</Badge>
                      ) : (
                        <Button variant="secondary" size="sm" className="h-6 text-[10px]" onClick={() => setPrimaryImage(i)}>
                          Set Primary
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" className="h-6 text-[10px] text-destructive" onClick={() => removeImage(i)}>
                        Remove
                      </Button>
                    </div>
                    <div className="p-1.5">
                      <Input
                        placeholder="Alt text"
                        value={img.alt}
                        onChange={e => {
                          const images = [...formData.images]
                          images[i] = { ...images[i], alt: e.target.value }
                          updateForm('images', images)
                        }}
                        className="h-6 text-[10px]"
                      />
                    </div>
                  </div>
                ))}

                {formData.images.length < 8 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="h-32 w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    {uploadingImage ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <ImagePlus className="h-6 w-6" />
                        <span className="text-xs">Upload Image</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={e => handleImageUpload(e.target.files)}
              />

              <p className="text-xs text-muted-foreground">
                Accepted formats: JPEG, PNG, WebP, GIF. Max size: 5MB per image. First image will be set as primary by default.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="videoUrl">Video URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="videoUrl"
                placeholder="https://youtube.com/watch?v=..."
                value={formData.videoUrl}
                onChange={e => updateForm('videoUrl', e.target.value)}
              />
            </div>
          </div>
        )

      /* ── Step 3: Pricing & Inventory ── */
      case 3:
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mrp">MRP (Maximum Retail Price) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <Input
                    id="mrp"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.mrp || ''}
                    onChange={e => updateForm('mrp', parseFloat(e.target.value) || 0)}
                    className={cn('pl-7', formErrors.mrp && 'border-destructive')}
                  />
                </div>
                {formErrors.mrp && <p className="text-xs text-destructive">{formErrors.mrp}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sellingPrice">Selling Price *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <Input
                    id="sellingPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.sellingPrice || ''}
                    onChange={e => updateForm('sellingPrice', parseFloat(e.target.value) || 0)}
                    className={cn('pl-7', formErrors.sellingPrice && 'border-destructive')}
                  />
                </div>
                {formErrors.sellingPrice && <p className="text-xs text-destructive">{formErrors.sellingPrice}</p>}
                {formData.mrp > 0 && formData.sellingPrice > 0 && formData.sellingPrice < formData.mrp && (
                  <p className="text-xs text-emerald-600">
                    {Math.round(((formData.mrp - formData.sellingPrice) / formData.mrp) * 100)}% off
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Special / Sale Price <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.specialPrice || ''}
                      onChange={e => updateForm('specialPrice', parseFloat(e.target.value) || 0)}
                      className={cn('pl-7', formErrors.specialPrice && 'border-destructive')}
                    />
                  </div>
                  {formErrors.specialPrice && <p className="text-xs text-destructive">{formErrors.specialPrice}</p>}
                </div>
                <div className="space-y-1">
                  <Input
                    type="date"
                    value={formData.specialPriceStartDate}
                    onChange={e => updateForm('specialPriceStartDate', e.target.value)}
                    className={cn(formErrors.specialPriceEndDate && 'border-destructive')}
                  />
                  <p className="text-[10px] text-muted-foreground">Start date</p>
                </div>
                <div className="space-y-1">
                  <Input
                    type="date"
                    value={formData.specialPriceEndDate}
                    onChange={e => updateForm('specialPriceEndDate', e.target.value)}
                    className={cn(formErrors.specialPriceEndDate && 'border-destructive')}
                  />
                  <p className="text-[10px] text-muted-foreground">End date</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="stock">Stock Quantity * {formData.variants.length > 0 && <span className="text-muted-foreground font-normal">(auto from variants)</span>}</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.variants.length > 0 ? formData.variants.reduce((sum, v) => sum + (v.stock || 0), 0) : formData.stock}
                  onChange={e => updateForm('stock', parseInt(e.target.value) || 0)}
                  disabled={formData.variants.length > 0}
                  className={cn(formErrors.stock && 'border-destructive')}
                />
                {formErrors.stock && <p className="text-xs text-destructive">{formErrors.stock}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  min="0"
                  placeholder="5"
                  value={formData.lowStockThreshold}
                  onChange={e => updateForm('lowStockThreshold', parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="trackInventory">Track Inventory</Label>
                  <Switch
                    id="trackInventory"
                    checked={formData.trackInventory}
                    onCheckedChange={val => updateForm('trackInventory', val)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Automatically reduce stock when orders are placed</p>
              </div>
            </div>
          </div>
        )

      /* ── Step 4: Variants ── */
      case 4:
        return (
          <div className="space-y-5">
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Variants allow you to offer different versions of your product (e.g., different colors or sizes). 
                  This is optional — if your product has only one version, skip this step.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Variant Attributes</Label>
              <div className="flex flex-wrap gap-2">
                {formData.variantAttributes.map(attr => (
                  <Badge key={attr} variant="secondary" className="gap-1 py-1 px-2.5">
                    {attr}
                    <button onClick={() => removeVariantAttribute(attr)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Select onValueChange={addVariantAttribute}>
                  <SelectTrigger className="w-auto h-7 text-xs border-dashed">
                    <SelectValue placeholder="+ Add attribute" />
                  </SelectTrigger>
                  <SelectContent>
                    {attributes
                      .filter(a => a.name && a.values?.length > 0 && !formData.variantAttributes.includes(a.name))
                      .map(a => (
                        <SelectItem key={a._id} value={a.name}>{a.name} ({a.values.length} values)</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Variant Combinations</Label>
                <Button variant="outline" size="sm" onClick={addVariant} className="gap-1">
                  <PlusCircle className="h-3.5 w-3.5" /> Add Variant
                </Button>
              </div>

              {formData.variants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No variants added yet</p>
                  <p className="text-xs mt-1">Add variant attributes above, then click &quot;Add Variant&quot; to create combinations</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {formData.variants.map((variant, vi) => (
                    <Card key={vi} className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">Variant {vi + 1}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeVariant(vi)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">SKU</Label>
                          <Input
                            value={variant.sku}
                            onChange={e => updateVariant(vi, 'sku', e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        {formData.variantAttributes.map(attr => (
                          <div key={attr} className="space-y-1">
                            <Label className="text-xs">{attr}</Label>
                            <Select value={variant.attributes[attr] || ''} onValueChange={val => updateVariantAttribute(vi, attr, val)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder={`Select ${attr}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {(attributes.find(a => a.name === attr)?.values || []).map(v => (
                                  <SelectItem key={v} value={v}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                        <div className="space-y-1">
                          <Label className="text-xs">MRP (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={variant.mrp || ''}
                            onChange={e => updateVariant(vi, 'mrp', parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Selling Price (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={variant.sellingPrice || ''}
                            onChange={e => updateVariant(vi, 'sellingPrice', parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Stock</Label>
                          <Input
                            type="number"
                            min="0"
                            value={variant.stock}
                            onChange={e => updateVariant(vi, 'stock', parseInt(e.target.value) || 0)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1 flex items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={variant.isActive}
                              onCheckedChange={val => updateVariant(vi, 'isActive', val)}
                            />
                            <Label className="text-xs">Active</Label>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )

      /* ── Step 5: Specifications & Size Chart ── */
      case 5:
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Specification Groups</Label>
                <Button variant="outline" size="sm" onClick={addSpecGroup} className="gap-1">
                  <PlusCircle className="h-3.5 w-3.5" /> Add Group
                </Button>
              </div>

              {formData.specifications.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                  <BarChart3 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No specifications added</p>
                  <p className="text-xs mt-1">Add specification groups like &quot;General&quot;, &quot;Display&quot;, etc.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.specifications.map((group, gi) => (
                    <Card key={gi} className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <Input
                          placeholder="Group name (e.g., General, Display)"
                          value={group.group}
                          onChange={e => updateSpecGroup(gi, 'group', e.target.value)}
                          className="h-8 text-sm font-medium max-w-[250px]"
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeSpecGroup(gi)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {group.specs.map((spec, si) => (
                          <div key={si} className="flex items-center gap-2">
                            <Input
                              placeholder="Key (e.g., Material)"
                              value={spec.key}
                              onChange={e => updateSpecInGroup(gi, si, 'key', e.target.value)}
                              className="h-7 text-xs flex-1"
                            />
                            <Input
                              placeholder="Value (e.g., Cotton)"
                              value={spec.value}
                              onChange={e => updateSpecInGroup(gi, si, 'value', e.target.value)}
                              className="h-7 text-xs flex-1"
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive flex-shrink-0" onClick={() => removeSpecFromGroup(gi, si)}>
                              <MinusCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => addSpecToGroup(gi)} className="gap-1 text-xs">
                          <PlusCircle className="h-3 w-3" /> Add Spec
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  <Label>Size Chart <span className="text-muted-foreground font-normal">(optional)</span></Label>
                </div>
                {formData.sizeChart && (
                  <Button variant="ghost" size="sm" onClick={() => selectSizeChartTemplate('')} className="text-destructive gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>

              {/* Size Chart Template Selector */}
              <div className="space-y-2">
                <Select value={selectedSizeChartTemplateId} onValueChange={selectSizeChartTemplate}>
                  <SelectTrigger className="h-9 text-sm">
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

                {sizeChartTemplates.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No size chart templates found in the database. Create templates in the admin panel first.
                  </p>
                )}
              </div>

              {/* Size Chart Preview (read-only) */}
              {formData.sizeChart && (
                <Card className="p-3 space-y-3">
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
                          {formData.sizeChart.headers.map((h, hi) => (
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
                        {formData.sizeChart.rows.length === 0 ? (
                          <tr>
                            <td colSpan={formData.sizeChart.headers.length} className="px-3 py-4 text-center text-muted-foreground text-xs">
                              No size data in this template
                            </td>
                          </tr>
                        ) : (
                          formData.sizeChart.rows.map((row, ri) => (
                            <tr key={ri} className={cn(ri % 2 === 0 ? '' : 'bg-muted/20')}>
                              {formData.sizeChart!.headers.map((h, hi) => (
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
                    <span>{formData.sizeChart.rows.length} size{formData.sizeChart.rows.length !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{formData.sizeChart.headers.length} measurement{formData.sizeChart.headers.length !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>Unit: {formData.sizeChart.unit === 'metric' ? 'Centimeters' : formData.sizeChart.unit === 'imperial' ? 'Inches' : 'Both'}</span>
                  </div>

                  {/* How to Measure (read-only) */}
                  {formData.sizeChart.howToMeasure && formData.sizeChart.howToMeasure.length > 0 && (
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">How to Measure</p>
                      {formData.sizeChart.howToMeasure.map((tip, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-muted-foreground/50 mt-0.5 text-[10px] flex-shrink-0">•</span>
                          <span className="text-[11px] text-muted-foreground">{tip}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        )

      /* ── Step 6: Shipping & Returns ── */
      case 6:
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <Label className="text-base">Shipping Details</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Weight (grams)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.shipping.weight || ''}
                    onChange={e => updateForm('shipping', { ...formData.shipping, weight: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Length (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.shipping.length || ''}
                    onChange={e => updateForm('shipping', { ...formData.shipping, length: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Width (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.shipping.width || ''}
                    onChange={e => updateForm('shipping', { ...formData.shipping, width: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Height (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.shipping.height || ''}
                    onChange={e => updateForm('shipping', { ...formData.shipping, height: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">HSN Code</Label>
                  <Input
                    placeholder="e.g., 6109"
                    value={formData.shipping.hsnCode}
                    onChange={e => updateForm('shipping', { ...formData.shipping, hsnCode: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">GST Rate (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.shipping.gstRate}
                    onChange={e => updateForm('shipping', { ...formData.shipping, gstRate: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Delivery Charge (₹)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
                    <Input
                      type="number"
                      min="0"
                      value={formData.shipping.deliveryCharge || ''}
                      onChange={e => updateForm('shipping', { ...formData.shipping, deliveryCharge: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm pl-6"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Free Delivery Above (₹)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
                    <Input
                      type="number"
                      min="0"
                      value={formData.shipping.freeDeliveryAbove || ''}
                      onChange={e => updateForm('shipping', { ...formData.shipping, freeDeliveryAbove: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm pl-6"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base">Return & Warranty</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Return Policy</Label>
                  <Select value={formData.returnPolicy} onValueChange={val => updateForm('returnPolicy', val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select return policy" />
                    </SelectTrigger>
                    <SelectContent>
                      {RETURN_POLICIES.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warranty">Warranty</Label>
                  <Input
                    id="warranty"
                    placeholder="e.g., 1 Year Manufacturer Warranty"
                    value={formData.warranty}
                    onChange={e => updateForm('warranty', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )

      /* ── Step 7: SEO & Tags ── */
      case 7:
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <Label className="text-base">Search Engine Optimization</Label>
              <div className="space-y-2">
                <Label htmlFor="metaTitle">Meta Title</Label>
                <Input
                  id="metaTitle"
                  placeholder="Auto-generated if empty"
                  value={formData.seo.metaTitle}
                  onChange={e => updateForm('seo', { ...formData.seo, metaTitle: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground">{formData.seo.metaTitle.length}/60 characters recommended</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="metaDescription">Meta Description</Label>
                <Textarea
                  id="metaDescription"
                  placeholder="Auto-generated if empty"
                  rows={3}
                  value={formData.seo.metaDescription}
                  onChange={e => updateForm('seo', { ...formData.seo, metaDescription: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground">{formData.seo.metaDescription.length}/160 characters recommended</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Search Keywords</Label>
                  <Button variant="ghost" size="sm" onClick={addSearchKeyword} className="gap-1 text-xs">
                    <PlusCircle className="h-3 w-3" /> Add Keyword
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.seo.searchKeywords.map((kw, ki) => (
                    <div key={ki} className="flex items-center gap-1">
                      <Input
                        value={kw}
                        onChange={e => updateSearchKeyword(ki, e.target.value)}
                        className="h-7 text-xs w-32"
                        placeholder="Keyword"
                      />
                      <button onClick={() => removeSearchKeyword(ki)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="canonicalUrl">Canonical URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="canonicalUrl"
                  placeholder="https://example.com/product/..."
                  value={formData.seo.canonicalUrl}
                  onChange={e => updateForm('seo', { ...formData.seo, canonicalUrl: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            {/* Google Search Preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Search Engine Preview</Label>
              <div className="p-3 rounded-lg border bg-white">
                <p className="text-blue-700 text-sm font-medium truncate">
                  {formData.seo.metaTitle || `${formData.name} - Buy Online at Best Price`}
                </p>
                <p className="text-green-700 text-xs truncate">
                  yourstore.com/products/{formData.name.toLowerCase().replace(/\s+/g, '-').slice(0, 50) || 'product-slug'}
                </p>
                <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
                  {formData.seo.metaDescription || formData.description.slice(0, 160) || 'Product description will appear here...'}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => {
                  const isSelected = formData.tags.includes(tag.name)
                  return (
                    <button
                      key={tag._id}
                      onClick={() => {
                        if (isSelected) {
                          updateForm('tags', formData.tags.filter(t => t !== tag.name))
                        } else {
                          updateForm('tags', [...formData.tags, tag.name])
                        }
                      }}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs border transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-muted hover:border-foreground/30'
                      )}
                    >
                      {tag.name}
                    </button>
                  )
                })}
                {tags.length === 0 && (
                  <p className="text-xs text-muted-foreground">No tags available</p>
                )}
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  /* ================================================================ */
  /*  RENDER: MAIN PAGE                                                */
  /* ================================================================ */

  return (
    <div className="space-y-4 sm:space-y-5">
        {/* ── Compact Header with Inline Stats ── */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
              <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight truncate">Products</h1>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Manage your product catalog</p>
            </div>
          </div>
          {/* Inline mini-stats */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            {statCards.slice(1).map(stat => (
              <div key={stat.label} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border', stat.bg, 'border-transparent')}>
                <stat.icon className={cn('h-3.5 w-3.5', stat.color)} />
                <span className={cn('text-xs font-bold', stat.color)}>{stat.count}</span>
              </div>
            ))}
          </div>
          <Button onClick={openAddForm} className="gap-1.5 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white flex-shrink-0">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add Product</span>
          </Button>
        </div>

        {/* ── Status Filter Pills ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 mb-4 -mx-1 px-1">
          {[
            { value: 'all', label: 'All', count: counts.total, activeClass: 'bg-emerald-500 text-white shadow-sm' },
            { value: 'Draft', label: 'Draft', count: counts.draft, activeClass: 'bg-gray-500 text-white shadow-sm' },
            { value: 'Pending', label: 'Pending', count: counts.pending, activeClass: 'bg-amber-500 text-white shadow-sm' },
            { value: 'Published', label: 'Published', count: counts.published, activeClass: 'bg-emerald-500 text-white shadow-sm' },
            { value: 'Rejected', label: 'Rejected', count: counts.rejected, activeClass: 'bg-red-500 text-white shadow-sm' },
          ].map((tab) => {
            const isActive = statusFilter === tab.value
            return (
              <button
                key={tab.value}
                onClick={() => { setStatusFilter(tab.value); setPage(1) }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0',
                  isActive ? tab.activeClass : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white/80" />}
                {tab.label}
                {isActive && tab.count !== null && tab.count > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/20">{tab.count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Search + Category Filter ── */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, brand, description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-9 bg-card border-border h-10 rounded-xl"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-2.5">
            <Select value={categoryFilter} onValueChange={val => { setCategoryFilter(val); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[160px] h-10 rounded-xl bg-card border-border">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {sellerCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Loading Skeleton ── */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden py-0 gap-0">
                <Skeleton className="aspect-square" />
                <CardContent className="p-2.5 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3.5 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && products.length === 0 && (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No products found</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              {search || statusFilter !== 'all' || categoryFilter !== 'all'
                ? 'Try adjusting your filters or search query.'
                : 'Start by adding your first product.'}
            </p>
            <Button onClick={openAddForm} className="gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white">
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          </div>
        )}

        {/* ── Product Grid View ── */}
        {!loading && products.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <AnimatePresence mode="popLayout">
              {products.map(renderProductCard)}
            </AnimatePresence>
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && products.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 mt-6 px-1">
            <p className="text-[11px] sm:text-xs text-muted-foreground">
              <span className="hidden sm:inline">Showing </span>{((page - 1) * 12) + 1}–{Math.min(page * 12, total)} <span className="hidden sm:inline">of </span>{total} <span className="hidden sm:inline">products</span>
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0 rounded-lg">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) { pageNum = i + 1 }
                else if (page <= 3) { pageNum = i + 1 }
                else if (page >= totalPages - 2) { pageNum = totalPages - 4 + i }
                else { pageNum = page - 2 + i }
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === page ? 'default' : 'outline'}
                    size="sm"
                    className={cn('h-8 w-8 p-0 text-xs rounded-lg', pageNum === page && 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600')}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0 rounded-lg">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

      {/* ================================================================ */}
      {/*  PRODUCT FORM SHEET                                              */}
      {/* ================================================================ */}

      <Sheet open={showForm} onOpenChange={open => { if (!open) closeForm() }}>
        <SheetContent side="right" className={cn('w-full sm:max-w-2xl p-0 flex flex-col', isMobile && 'w-full')}>
          <SheetHeader className="p-6 pb-0">
            <SheetTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</SheetTitle>
            <SheetDescription>
              {editingProduct ? 'Update your product details' : 'Fill in the details to add a new product'}
            </SheetDescription>
          </SheetHeader>

          {/* ── Step Indicators ── */}
          <div className="px-6 py-4 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {FORM_STEPS.map((step, i) => (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => goToStep(step.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                      formStep === step.id
                        ? 'bg-primary text-primary-foreground'
                        : formStep > step.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {formStep > step.id ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <step.icon className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{step.title}</span>
                    <span className="sm:hidden">{step.id}</span>
                  </button>
                  {i < FORM_STEPS.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <Separator />

          {/* ── Form Content ── */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={formStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderStepContent()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Form Footer ── */}
          <div className="border-t p-4 bg-background">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {formStep > 1 && (
                  <Button variant="outline" onClick={prevStep} className="gap-1">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                )}
                {formStep < 7 && (
                  <Button variant="outline" onClick={nextStep} className="gap-1">
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => saveProduct(false)} disabled={saving} className="gap-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Save as Draft
                </Button>
                <Button onClick={() => saveProduct(true)} disabled={saving} className="gap-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Submit for Review
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteDialog.open} onOpenChange={open => setDeleteDialog({ open, product: open ? deleteDialog.product : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteDialog.product?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, product: null })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteProduct} disabled={deleting} className="gap-1">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Re-edit Warning Dialog ── */}
      <Dialog open={reeditDialog.open} onOpenChange={open => setReeditDialog({ open, product: open ? reeditDialog.product : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Edit Published Product
            </DialogTitle>
            <DialogDescription>
              This product is currently <span className="font-medium text-foreground">Published</span>. Any changes you make will change the status to &quot;Pending Review&quot; and the product may be temporarily removed from the storefront until it&apos;s re-approved by admin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReeditDialog({ open: false, product: null })}>
              Cancel
            </Button>
            <Button onClick={() => reeditDialog.product && startEditForm(reeditDialog.product)} className="gap-1">
              <Pencil className="h-4 w-4" /> Proceed to Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
