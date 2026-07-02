'use client'

/* ------------------------------------------------------------------ */
/*  Seller Inventory Management Page                                    */
/*  Redesigned with modern, compact UI following the established        */
/*  seller-panel design language (consistent with Products page).       */
/* ------------------------------------------------------------------ */

import React, { useEffect, useState, useCallback } from 'react'
import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import {
  Boxes,
  Package,
  AlertTriangle,
  PackageX,
  Search,
  RefreshCw,
  Download,
  Pencil,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  History,
  Bell,
  ShoppingCart,
  RotateCcw,
  Settings2,
  Upload,
  Save,
  Inbox,
  TrendingUp,
  Plus,
  Wallet,
  BadgeDollarSign,
  FileUp,
  FileDown,
  Check,
  Sparkles,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface InventoryItem {
  _id: string
  name: string
  slug?: string
  sku: string
  category: string
  brand: string
  imageUrl: string
  stock: number
  reservedStock: number
  availableStock: number
  lowStockThreshold: number
  trackInventory: boolean
  reorderPoint: number
  reorderQuantity: number
  warehouseLocation: string
  sellingPrice: number
  mrp: number
  costPrice?: number
  stockValue: number
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unlimited'
  status_value: string
  active: boolean
  lastStockUpdateAt: string | null
  updatedAt: string
  variants: Array<{
    _id: string
    sku: string
    attributes: Record<string, string>
    stock: number
    sellingPrice: number
    mrp: number
    isActive: boolean
    status: string
  }>
}

interface InventorySummary {
  totalSkus: number
  trackedSkus: number
  inStockSkus: number
  lowStockSkus: number
  outOfStockSkus: number
  totalUnits: number
  totalReservedUnits: number
  totalAvailableUnits: number
  stockValue: number
  stockValueMrp: number
}

interface InventoryAlert {
  _id: string
  alertId: string
  productId: string
  productName: string
  variantId?: string
  sellerName: string
  type: 'low_stock' | 'out_of_stock' | 'reorder'
  currentStock: number
  threshold: number
  status: string
  message: string
  createdAt: string
}

interface Movement {
  _id: string
  movementId: string
  productId: string
  productName: string
  variantId?: string
  variantSku?: string
  type: string
  quantityChange: number
  stockBefore: number
  stockAfter: number
  orderId?: string
  reason?: string
  performedBy: string
  userName?: string
  createdAt: string
}

interface ReorderProduct {
  _id: string
  name: string
  sku: string
  stock: number
  reorderPoint: number
  reorderQuantity: number
  safetyStock: number
  shortfall: number
  suggestedReorderQty: number
  leadTimeDays: number
  supplier: string
  status: string
  imageUrl?: string
  category?: string
}

interface DeadStockProduct {
  _id: string
  name: string
  sku: string
  stock: number
  sellingPrice: number
  costPrice: number
  stockValue: number
  stockValueCost: number
  lastSaleDate: string | null
  daysSinceLastSale: number | null
  imageUrl?: string
  category?: string
}

interface ValuationProduct {
  _id: string
  productId: string
  name: string
  sku: string
  stock: number
  costPrice: number
  sellingPrice: number
  mrp: number
  stockValueCost: number
  stockValueSelling: number
  stockValueMrp: number
  potentialProfit: number
  warehouseLocation: string
}

interface ImportResult {
  success: boolean
  updated: number
  failed: number
  errors: string[]
  dryRun: boolean
  applied: boolean
  validRowCount?: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const STATUS_DOT: Record<string, string> = {
  in_stock: 'bg-emerald-500',
  low_stock: 'bg-amber-500',
  out_of_stock: 'bg-red-500',
  unlimited: 'bg-blue-500',
}

const STATUS_LABEL: Record<string, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low',
  out_of_stock: 'Out',
  unlimited: '∞',
}

function statusBadge(status: string) {
  switch (status) {
    case 'in_stock':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
          In Stock
        </Badge>
      )
    case 'low_stock':
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">
          Low Stock
        </Badge>
      )
    case 'out_of_stock':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">
          Out of Stock
        </Badge>
      )
    case 'unlimited':
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300">
          Unlimited
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function movementTypeBadge(type: string) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    order: { label: 'Order', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: <ShoppingCart className="h-3 w-3" /> },
    cancel: { label: 'Cancel', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: <XCircle className="h-3 w-3" /> },
    return: { label: 'Return', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: <RotateCcw className="h-3 w-3" /> },
    adjustment: { label: 'Adjust', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: <Settings2 className="h-3 w-3" /> },
    restock: { label: 'Restock', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <Package className="h-3 w-3" /> },
    reservation: { label: 'Reserve', className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', icon: <Info className="h-3 w-3" /> },
    release: { label: 'Release', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <RefreshCw className="h-3 w-3" /> },
    reservation_confirm: { label: 'Confirm', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', icon: <CheckCircle2 className="h-3 w-3" /> },
    initial: { label: 'Initial', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <Package className="h-3 w-3" /> },
    correction: { label: 'Correct', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: <AlertTriangle className="h-3 w-3" /> },
  }
  const cfg = map[type] || { label: type, className: 'bg-slate-100 text-slate-700', icon: null }
  return (
    <Badge className={cn('gap-1 text-[10px] px-1.5 py-0', cfg.className)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  } catch {
    return iso
  }
}

/* ------------------------------------------------------------------ */
/*  Compact Stat Card                                                   */
/* ------------------------------------------------------------------ */

function MiniStat({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
  bg,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  sublabel?: string
  color: string
  bg: string
}) {
  return (
    <Card className="p-3 py-2.5 gap-0 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2.5">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
          <Icon className={cn('h-4 w-4', color)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">{label}</p>
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-base sm:text-lg font-bold leading-tight', color)}>{value}</span>
            {sublabel && <span className="text-[10px] text-muted-foreground truncate">{sublabel}</span>}
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Product Thumbnail (shared)                                          */
/* ------------------------------------------------------------------ */

function ProductThumb({ url, name, size = 'md' }: { url?: string; name: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <div className={cn('rounded-md overflow-hidden bg-muted flex-shrink-0', dim)}>
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <Package className="h-3.5 w-3.5 text-muted-foreground/50" />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                 */
/* ------------------------------------------------------------------ */

export default function SellerInventoryPage() {
  const { authenticated, loading } = useSellerAuth()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState('overview')

  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const [alerts, setAlerts] = useState<InventoryAlert[]>([])
  const [recentMovements, setRecentMovements] = useState<Movement[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([])

  const [items, setItems] = useState<InventoryItem[]>([])
  const [listTotal, setListTotal] = useState(0)
  const [listPage, setListPage] = useState(1)
  const [listLimit] = useState(15)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('updated')

  const [movements, setMovements] = useState<Movement[]>([])
  const [movementsTotal, setMovementsTotal] = useState(0)
  const [movementsPage, setMovementsPage] = useState(1)
  const [movementTypeFilter, setMovementTypeFilter] = useState('all')

  const [loadingDashboard, setLoadingDashboard] = useState(true)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMovements, setLoadingMovements] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [adjustVariantId, setAdjustVariantId] = useState<string | undefined>(undefined)
  const [adjustQty, setAdjustQty] = useState<number>(0)
  const [adjustReason, setAdjustReason] = useState('')

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkReason, setBulkReason] = useState('')

  // Reorder tab state
  const [reorderProducts, setReorderProducts] = useState<ReorderProduct[]>([])
  const [reorderTotal, setReorderTotal] = useState(0)
  const [reorderPage, setReorderPage] = useState(1)
  const [loadingReorder, setLoadingReorder] = useState(true)

  // Dead stock tab state
  const [deadStockProducts, setDeadStockProducts] = useState<DeadStockProduct[]>([])
  const [deadStockTotal, setDeadStockTotal] = useState(0)
  const [deadStockDays, setDeadStockDays] = useState(90)
  const [deadStockPage, setDeadStockPage] = useState(1)
  const [loadingDeadStock, setLoadingDeadStock] = useState(true)

  // Valuation tab state
  const [valuationProducts, setValuationProducts] = useState<ValuationProduct[]>([])
  const [valuationTotal, setValuationTotal] = useState(0)
  const [valuationTotals, setValuationTotals] = useState<{
    stockValueCost: number
    stockValueSelling: number
    stockValueMrp: number
    potentialProfit: number
    totalUnits: number
  } | null>(null)
  const [valuationPage, setValuationPage] = useState(1)
  const [loadingValuation, setLoadingValuation] = useState(true)

  // Import tab state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importText, setImportText] = useState('')
  const [importReason, setImportReason] = useState('CSV bulk update')
  const [importDryRun, setImportDryRun] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Quick restock dialog state
  const [quickRestockItem, setQuickRestockItem] = useState<{
    _id: string
    name: string
    imageUrl?: string
    stock: number
    trackInventory?: boolean
    reservedStock?: number
  } | null>(null)
  const [quickRestockQty, setQuickRestockQty] = useState<number>(0)
  const [quickRestockReason, setQuickRestockReason] = useState('')

  // Adjust dialog mode (Absolute vs Delta)
  const [adjustMode, setAdjustMode] = useState<'absolute' | 'delta'>('absolute')
  const [adjustDelta, setAdjustDelta] = useState<number>(0)

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/seller')
    }
  }, [loading, authenticated, router])

  const fetchDashboard = useCallback(async () => {
    setLoadingDashboard(true)
    try {
      const res = await fetch('/api/seller/inventory/dashboard', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load dashboard')
      const data = await res.json()
      setSummary(data.summary)
      setAlerts(data.alerts || [])
      setRecentMovements(data.recentMovements || [])
      setLowStockProducts(data.lowStockProducts || [])
    } catch (err) {
      console.error('[Inventory] Dashboard fetch error:', err)
      toast.error('Failed to load inventory dashboard')
    } finally {
      setLoadingDashboard(false)
    }
  }, [])

  const fetchList = useCallback(async () => {
    setLoadingList(true)
    try {
      const params = new URLSearchParams({
        page: String(listPage),
        limit: String(listLimit),
        status: statusFilter,
        sort,
      })
      if (search) params.set('search', search)
      const res = await fetch(`/api/seller/inventory/list?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load inventory list')
      const data = await res.json()
      setItems(data.items || [])
      setListTotal(data.total || 0)
    } catch (err) {
      console.error('[Inventory] List fetch error:', err)
      toast.error('Failed to load inventory list')
    } finally {
      setLoadingList(false)
    }
  }, [listPage, listLimit, statusFilter, sort, search])

  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true)
    try {
      const params = new URLSearchParams({
        page: String(movementsPage),
        limit: '50',
      })
      if (movementTypeFilter !== 'all') params.set('type', movementTypeFilter)
      const res = await fetch(`/api/seller/inventory/movements?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load movements')
      const data = await res.json()
      setMovements(data.movements || [])
      setMovementsTotal(data.total || 0)
    } catch (err) {
      console.error('[Inventory] Movements fetch error:', err)
      toast.error('Failed to load movement history')
    } finally {
      setLoadingMovements(false)
    }
  }, [movementsPage, movementTypeFilter])

  const fetchReorder = useCallback(async () => {
    setLoadingReorder(true)
    try {
      const params = new URLSearchParams({
        page: String(reorderPage),
        limit: '10',
      })
      const res = await fetch(`/api/seller/inventory/reorder?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load reorder suggestions')
      const data = await res.json()
      setReorderProducts(data.products || [])
      setReorderTotal(data.total || 0)
    } catch (err) {
      console.error('[Inventory] Reorder fetch error:', err)
      toast.error('Failed to load reorder suggestions')
    } finally {
      setLoadingReorder(false)
    }
  }, [reorderPage])

  const fetchDeadStock = useCallback(async () => {
    setLoadingDeadStock(true)
    try {
      const params = new URLSearchParams({
        daysThreshold: String(deadStockDays),
        page: String(deadStockPage),
        limit: '10',
      })
      const res = await fetch(`/api/seller/inventory/dead-stock?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load dead stock')
      const data = await res.json()
      setDeadStockProducts(data.products || [])
      setDeadStockTotal(data.total || 0)
    } catch (err) {
      console.error('[Inventory] Dead stock fetch error:', err)
      toast.error('Failed to load dead stock report')
    } finally {
      setLoadingDeadStock(false)
    }
  }, [deadStockDays, deadStockPage])

  const fetchValuation = useCallback(async () => {
    setLoadingValuation(true)
    try {
      const params = new URLSearchParams({
        page: String(valuationPage),
        limit: '10',
      })
      const res = await fetch(`/api/seller/inventory/valuation?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load valuation')
      const data = await res.json()
      setValuationProducts(data.products || [])
      setValuationTotal(data.total || 0)
      setValuationTotals(data.totals || null)
    } catch (err) {
      console.error('[Inventory] Valuation fetch error:', err)
      toast.error('Failed to load inventory valuation')
    } finally {
      setLoadingValuation(false)
    }
  }, [valuationPage])

  useEffect(() => {
    if (authenticated) fetchDashboard()
  }, [authenticated, fetchDashboard])

  useEffect(() => {
    if (authenticated) fetchList()
  }, [authenticated, fetchList])

  useEffect(() => {
    if (authenticated && activeTab === 'movements') fetchMovements()
  }, [authenticated, activeTab, fetchMovements])

  useEffect(() => {
    if (authenticated && activeTab === 'reorder') fetchReorder()
  }, [authenticated, activeTab, fetchReorder])

  useEffect(() => {
    if (authenticated && activeTab === 'dead-stock') fetchDeadStock()
  }, [authenticated, activeTab, fetchDeadStock])

  useEffect(() => {
    if (authenticated && activeTab === 'valuation') fetchValuation()
  }, [authenticated, activeTab, fetchValuation])

  const openAdjustDialog = (item: InventoryItem, variantId?: string) => {
    setAdjustItem(item)
    setAdjustVariantId(variantId)
    if (variantId) {
      const v = item.variants.find((x) => x._id === variantId)
      setAdjustQty(v?.stock || 0)
    } else {
      setAdjustQty(item.stock)
    }
    setAdjustReason('')
    setAdjustMode('absolute')
    setAdjustDelta(0)
  }

  const openQuickRestock = (
    item: { _id: string; name: string; imageUrl?: string; stock: number; trackInventory?: boolean; reservedStock?: number },
    presetQty?: number,
  ) => {
    setQuickRestockItem(item)
    setQuickRestockQty(presetQty ?? 0)
    setQuickRestockReason('')
  }

  const handleAdjust = async () => {
    if (!adjustItem) return
    setActionLoading(true)
    try {
      const payload: Record<string, unknown> = {
        productId: adjustItem._id,
        variantId: adjustVariantId,
        reason: adjustReason || undefined,
      }
      if (adjustMode === 'delta') {
        payload.delta = adjustDelta
      } else {
        payload.newQuantity = adjustQty
      }
      const res = await fetch('/api/seller/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Adjust failed')
      }
      toast.success(`Stock updated to ${data.newStock}`)
      setAdjustItem(null)
      fetchList()
      fetchDashboard()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to adjust stock')
    } finally {
      setActionLoading(false)
    }
  }

  const handleQuickRestock = async () => {
    if (!quickRestockItem) return
    if (!Number.isFinite(quickRestockQty) || quickRestockQty === 0) {
      toast.error('Please enter a non-zero quantity')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch('/api/seller/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: quickRestockItem._id,
          delta: quickRestockQty,
          reason: quickRestockReason || 'Quick restock',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Quick restock failed')
      }
      toast.success(`Stock updated to ${data.newStock}`)
      setQuickRestockItem(null)
      fetchList()
      fetchDashboard()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restock')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAcknowledge = async (alertId: string) => {
    try {
      const res = await fetch('/api/seller/inventory/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge', alertId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      toast.success('Alert acknowledged')
      setAlerts((prev) => prev.filter((a) => a.alertId !== alertId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to acknowledge alert')
    }
  }

  const handleResolve = async (alertId: string) => {
    try {
      const res = await fetch('/api/seller/inventory/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', alertId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      toast.success('Alert resolved')
      setAlerts((prev) => prev.filter((a) => a.alertId !== alertId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve alert')
    }
  }

  const handleBulkResolve = async () => {
    const ids = alerts.map((a) => a.alertId).filter(Boolean)
    if (ids.length === 0) {
      toast.error('No alerts to resolve')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch('/api/seller/inventory/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_resolve', alertIds: ids }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      toast.success(`Resolved ${data.updated} alert(s)`)
      setAlerts([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to bulk resolve alerts')
    } finally {
      setActionLoading(false)
    }
  }

  const handleServerExport = () => {
    toast.info('Preparing CSV export...')
    window.location.href = '/api/seller/inventory/export'
  }

  const handleDownloadTemplate = () => {
    const header = 'productId,newQuantity,variantId'
    const sample1 = '665a1b2c3d4e5f6a7b8c9d0e,100,'
    const sample2 = '665a1b2c3d4e5f6a7b8c9d0f,50,variant-id-001'
    const csv = [header, sample1, sample2].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'inventory-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Template downloaded')
  }

  const handleImport = async () => {
    setImportLoading(true)
    setImportResult(null)
    try {
      const url = importDryRun
        ? '/api/seller/inventory/import?dryRun=true'
        : '/api/seller/inventory/import'
      let res: Response
      if (importFile) {
        const formData = new FormData()
        formData.append('file', importFile)
        if (importReason) formData.append('reason', importReason)
        res = await fetch(url, { method: 'POST', body: formData })
      } else {
        const lines = importText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        const rows: Array<{ productId: string; newQuantity: number; variantId?: string }> = []
        const headerLine = lines[0]?.toLowerCase() || ''
        const startIdx = headerLine.includes('productid') && headerLine.includes('newquantity') ? 1 : 0
        for (let i = startIdx; i < lines.length; i++) {
          const parts = lines[i].split(',').map((p) => p.trim())
          if (parts.length < 2) continue
          rows.push({
            productId: parts[0],
            newQuantity: Number(parts[1]),
            variantId: parts[2] || undefined,
          })
        }
        if (rows.length === 0) {
          toast.error('No valid rows to import')
          setImportLoading(false)
          return
        }
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows, reason: importReason || undefined }),
        })
      }
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Import failed')
      }
      setImportResult({
        success: data.success,
        updated: data.updated || 0,
        failed: data.failed || 0,
        errors: data.errors || [],
        dryRun: data.dryRun || false,
        applied: data.applied || false,
        validRowCount: data.validRowCount,
      })
      if (data.success && data.applied) {
        toast.success(`Imported ${data.updated} product(s)`)
        fetchList()
        fetchDashboard()
      } else if (data.dryRun) {
        toast.info(`Dry run complete: ${data.validRowCount || 0} valid row(s)`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import')
    } finally {
      setImportLoading(false)
    }
  }

  const handleBulkUpdate = async () => {
    setActionLoading(true)
    try {
      const lines = bulkText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const updates: Array<{ productId: string; newQuantity: number; variantId?: string }> = []
      for (const line of lines) {
        const parts = line.split(',').map((p) => p.trim())
        if (parts.length < 2) {
          toast.error(`Invalid line: ${line}`)
          setActionLoading(false)
          return
        }
        const productId = parts[0]
        const qty = Number(parts[1])
        const variantId = parts[2] || undefined
        if (!productId || !Number.isFinite(qty) || qty < 0) {
          toast.error(`Invalid line: ${line}`)
          setActionLoading(false)
          return
        }
        updates.push({ productId, newQuantity: qty, variantId })
      }
      if (updates.length === 0) {
        toast.error('No valid entries found')
        setActionLoading(false)
        return
      }
      const res = await fetch('/api/seller/inventory/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, reason: bulkReason || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk update failed')
      toast.success(data.message || `Updated ${data.updated} product(s)`)
      if (data.errors && data.errors.length > 0) {
        toast.warning(`${data.errors.length} error(s). Check console.`)
        console.warn('Bulk update errors:', data.errors)
      }
      setBulkOpen(false)
      setBulkText('')
      setBulkReason('')
      fetchList()
      fetchDashboard()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleExport = () => {
    const header = ['Product ID', 'Name', 'SKU', 'Category', 'Stock', 'Reserved', 'Available', 'Status', 'Selling Price', 'Stock Value']
    const rows = items.map((i) => [
      i._id,
      i.name,
      i.sku,
      i.category,
      i.stock,
      i.reservedStock,
      i.availableStock,
      i.status,
      i.sellingPrice,
      i.stockValue,
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seller-inventory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Inventory exported')
  }

  const listTotalPages = Math.max(1, Math.ceil(listTotal / listLimit))
  const movementsTotalPages = Math.max(1, Math.ceil(movementsTotal / 50))
  const reorderTotalPages = Math.max(1, Math.ceil(reorderTotal / 10))
  const deadStockTotalPages = Math.max(1, Math.ceil(deadStockTotal / 10))
  const valuationTotalPages = Math.max(1, Math.ceil(valuationTotal / 10))

  if (loading || !authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  /* ── Tab config ── */
  const tabs = [
    { value: 'overview', label: 'Overview', icon: Boxes },
    { value: 'list', label: 'Inventory', icon: Package },
    { value: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.length },
    { value: 'movements', label: 'Movements', icon: History },
    { value: 'reorder', label: 'Reorder', icon: TrendingUp },
    { value: 'dead-stock', label: 'Dead Stock', icon: PackageX },
    { value: 'valuation', label: 'Valuation', icon: BadgeDollarSign },
    { value: 'io', label: 'Import/Export', icon: Upload },
  ]

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Compact Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
            <Boxes className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight truncate">Inventory</h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Track stock, alerts & movements</p>
          </div>
        </div>
        {/* Inline mini-stats */}
        {summary && (
          <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-600">{summary.inStockSkus}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs font-bold text-amber-600">{summary.lowStockSkus}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30">
              <PackageX className="h-3.5 w-3.5 text-red-600" />
              <span className="text-xs font-bold text-red-600">{summary.outOfStockSkus}</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => { fetchDashboard(); fetchList() }} className="h-9 rounded-xl gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0} className="h-9 rounded-xl gap-1.5">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Export</span>
          </Button>
          <Button size="sm" onClick={() => setBulkOpen(true)} className="h-9 rounded-xl gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bulk Update</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* ── Compact Tab Pills ── */}
        <TabsList className="inline-flex h-auto p-1 bg-muted/50 rounded-xl gap-0.5 mb-1 overflow-x-auto max-w-full scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.badge ? (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500 text-white">{tab.badge}</span>
                ) : null}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* ===================== OVERVIEW TAB ===================== */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {loadingDashboard ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Stat cards row */}
              <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
                <MiniStat
                  icon={Package}
                  label="Total SKUs"
                  value={summary?.totalSkus ?? 0}
                  sublabel={`· ${summary?.trackedSkus ?? 0} tracked`}
                  color="text-gray-700 dark:text-gray-300"
                  bg="bg-gray-100 dark:bg-gray-800"
                />
                <MiniStat
                  icon={CheckCircle2}
                  label="In Stock"
                  value={summary?.inStockSkus ?? 0}
                  sublabel={`· ${summary?.totalUnits ?? 0} units`}
                  color="text-emerald-600 dark:text-emerald-400"
                  bg="bg-emerald-50 dark:bg-emerald-950/30"
                />
                <MiniStat
                  icon={AlertTriangle}
                  label="Low Stock"
                  value={summary?.lowStockSkus ?? 0}
                  sublabel="· restock soon"
                  color="text-amber-600 dark:text-amber-400"
                  bg="bg-amber-50 dark:bg-amber-950/30"
                />
                <MiniStat
                  icon={PackageX}
                  label="Out of Stock"
                  value={summary?.outOfStockSkus ?? 0}
                  sublabel="· action req'd"
                  color="text-red-600 dark:text-red-400"
                  bg="bg-red-50 dark:bg-red-950/30"
                />
              </div>

              {/* Value cards row */}
              <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-3">
                <MiniStat
                  icon={TrendingUp}
                  label="Stock Value (Selling)"
                  value={fmtPrice(summary?.stockValue ?? 0, 0)}
                  sublabel={`· ${summary?.totalReservedUnits ?? 0} reserved`}
                  color="text-emerald-600 dark:text-emerald-400"
                  bg="bg-emerald-50 dark:bg-emerald-950/30"
                />
                <MiniStat
                  icon={BadgeDollarSign}
                  label="Stock Value (MRP)"
                  value={fmtPrice(summary?.stockValueMrp ?? 0, 0)}
                  sublabel="· at MRP"
                  color="text-primary"
                  bg="bg-primary/10"
                />
                <MiniStat
                  icon={Package}
                  label="Available Units"
                  value={summary?.totalAvailableUnits ?? 0}
                  sublabel="· sellable now"
                  color="text-blue-600 dark:text-blue-400"
                  bg="bg-blue-50 dark:bg-blue-950/30"
                />
              </div>

              {/* Two-column: Low stock + Recent movements */}
              <div className="grid gap-2.5 grid-cols-1 lg:grid-cols-2">
                {/* Lowest Stock Products */}
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <h3 className="text-sm font-semibold">Lowest Stock Products</h3>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{lowStockProducts.length}</Badge>
                  </div>
                  <div className="p-2">
                    {lowStockProducts.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-emerald-500" />
                        All products are well stocked!
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
                        {lowStockProducts.map((p) => (
                          <div key={p._id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <ProductThumb url={p.imageUrl} name={p.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {p.stock} / {p.lowStockThreshold} units
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[p.status] || 'bg-gray-400')} />
                              <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[p.status] || p.status}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[10px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                onClick={() => openQuickRestock(p, p.lowStockThreshold * 2 - p.stock)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Recent Movements */}
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">Recent Stock Movements</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => setActiveTab('movements')}
                    >
                      View All
                    </Button>
                  </div>
                  <div className="p-2">
                    {recentMovements.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        <Inbox className="h-7 w-7 mx-auto mb-2 opacity-40" />
                        No movements yet
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
                        {recentMovements.map((m) => (
                          <div key={m._id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex-shrink-0 mt-0.5">
                              {movementTypeBadge(m.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{m.productName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                <span className={m.quantityChange > 0 ? 'text-emerald-600' : 'text-red-600'}>
                                  {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                                </span>
                                {' '}{m.reason ? `· ${m.reason}` : ''}
                              </p>
                              <p className="text-[9px] text-muted-foreground/70">{formatRelative(m.createdAt)}</p>
                            </div>
                            <div className="text-[10px] text-muted-foreground text-right flex-shrink-0 font-mono">
                              {m.stockBefore}→{m.stockAfter}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ===================== LIST TAB ===================== */}
        <TabsContent value="list" className="space-y-3 mt-4">
          {/* Compact toolbar: search + filters in one row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, SKU, or brand..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setListPage(1) }}
                className="pl-9 h-9 rounded-xl"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setListPage(1) }}>
              <SelectTrigger className="w-full sm:w-40 h-9 rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="low_stock">Low Stock</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                <SelectItem value="unlimited">Unlimited</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-full sm:w-44 h-9 rounded-xl">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recently Updated</SelectItem>
                <SelectItem value="stock_asc">Stock (Low → High)</SelectItem>
                <SelectItem value="stock_desc">Stock (High → Low)</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
                <SelectItem value="value">Stock Value</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden">
            {loadingList ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                No products found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[200px] h-9 text-[11px]">Product</TableHead>
                      <TableHead className="h-9 text-[11px]">SKU</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Stock</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Avail.</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Value</TableHead>
                      <TableHead className="h-9 text-[11px]">Status</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item._id} className="h-12">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <ProductThumb url={item.imageUrl} name={item.name} size="sm" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate max-w-[180px]">{item.name}</p>
                              <p className="text-[10px] text-muted-foreground">{item.category}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{item.sku || '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            'text-xs font-semibold',
                            item.status === 'out_of_stock' && 'text-red-600',
                            item.status === 'low_stock' && 'text-amber-600',
                          )}>
                            {item.trackInventory ? item.stock : '∞'}
                          </span>
                          {item.reservedStock > 0 && (
                            <span className="block text-[9px] text-amber-600/70">−{item.reservedStock} res</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          {item.trackInventory ? item.availableStock : '∞'}
                        </TableCell>
                        <TableCell className="text-right text-xs">{fmtPrice(item.stockValue, 0)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STATUS_DOT[item.status] || 'bg-gray-400')} />
                            <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[item.status] || item.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAdjustDialog(item)}
                              className="h-7 px-2 text-[10px] gap-1"
                            >
                              <Pencil className="h-3 w-3" />
                              Adjust
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => openQuickRestock(item)}
                              disabled={!item.trackInventory}
                              className="h-7 px-2 text-[10px] gap-1 bg-emerald-500 hover:bg-emerald-600"
                            >
                              <Plus className="h-3 w-3" />
                              Restock
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {listTotal > listLimit && (
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <p className="text-[11px] text-muted-foreground">
                Showing {(listPage - 1) * listLimit + 1}–{Math.min(listPage * listLimit, listTotal)} of {listTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={listPage <= 1}
                  onClick={() => setListPage((p) => p - 1)}
                  className="h-8 gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {listPage} / {listTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={listPage >= listTotalPages}
                  onClick={() => setListPage((p) => p + 1)}
                  className="h-8 gap-1"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== ALERTS TAB ===================== */}
        <TabsContent value="alerts" className="space-y-3 mt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Active Alerts</h3>
              {alerts.length > 0 && (
                <Badge className="bg-red-500 text-white text-[10px]">{alerts.length}</Badge>
              )}
            </div>
            {alerts.length > 0 && (
              <Button
                size="sm"
                variant="default"
                onClick={handleBulkResolve}
                disabled={actionLoading}
                className="h-8 gap-1.5"
              >
                {actionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Resolve All
              </Button>
            )}
          </div>

          {loadingDashboard ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : alerts.length === 0 ? (
            <Card className="p-8">
              <div className="text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                No active alerts. All stock levels are healthy.
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <Card
                  key={alert._id}
                  className={cn(
                    'p-3 py-2.5 gap-0 border-l-4',
                    alert.type === 'out_of_stock'
                      ? 'border-l-red-500 bg-red-50/30 dark:bg-red-950/10'
                      : 'border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/10'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {alert.type === 'out_of_stock' ? (
                        <PackageX className="h-4 w-4 text-red-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{alert.productName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {alert.message} · {formatRelative(alert.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAcknowledge(alert.alertId)}
                        className="h-7 px-2 text-[10px]"
                      >
                        Ack
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResolve(alert.alertId)}
                        className="h-7 px-2 text-[10px] gap-1"
                      >
                        <Check className="h-3 w-3" />
                        Resolve
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===================== MOVEMENTS TAB ===================== */}
        <TabsContent value="movements" className="space-y-3 mt-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Stock Movement History</h3>
              <p className="text-[11px] text-muted-foreground">Complete audit trail of all stock changes</p>
            </div>
            <Select value={movementTypeFilter} onValueChange={(v) => { setMovementTypeFilter(v); setMovementsPage(1) }}>
              <SelectTrigger className="w-full sm:w-44 h-9 rounded-xl">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="order">Orders</SelectItem>
                <SelectItem value="cancel">Cancellations</SelectItem>
                <SelectItem value="return">Returns</SelectItem>
                <SelectItem value="adjustment">Adjustments</SelectItem>
                <SelectItem value="restock">Restocks</SelectItem>
                <SelectItem value="reservation">Reservations</SelectItem>
                <SelectItem value="release">Releases</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden">
            {loadingMovements ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : movements.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                No movements found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 text-[11px]">Type</TableHead>
                      <TableHead className="min-w-[180px] h-9 text-[11px]">Product</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Change</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Before → After</TableHead>
                      <TableHead className="h-9 text-[11px]">Reason</TableHead>
                      <TableHead className="h-9 text-[11px]">By</TableHead>
                      <TableHead className="h-9 text-[11px]">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m._id} className="h-11">
                        <TableCell>{movementTypeBadge(m.type)}</TableCell>
                        <TableCell>
                          <p className="text-xs font-medium truncate max-w-[180px]">{m.productName}</p>
                          {m.variantSku && (
                            <p className="text-[10px] text-muted-foreground font-mono">{m.variantSku}</p>
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          'text-right text-xs font-semibold font-mono',
                          m.quantityChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                        )}>
                          {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                        </TableCell>
                        <TableCell className="text-right text-[11px] text-muted-foreground font-mono">
                          {m.stockBefore} → {m.stockAfter}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground max-w-[160px] truncate">
                          {m.reason || '—'}
                        </TableCell>
                        <TableCell className="text-[10px] capitalize">
                          {m.performedBy}{m.userName ? ` · ${m.userName}` : ''}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatRelative(m.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {movementsTotal > 50 && (
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <p className="text-[11px] text-muted-foreground">
                Showing {(movementsPage - 1) * 50 + 1}–{Math.min(movementsPage * 50, movementsTotal)} of {movementsTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={movementsPage <= 1}
                  onClick={() => setMovementsPage((p) => p - 1)}
                  className="h-8 gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {movementsPage} / {movementsTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={movementsPage >= movementsTotalPages}
                  onClick={() => setMovementsPage((p) => p + 1)}
                  className="h-8 gap-1"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== REORDER TAB ===================== */}
        <TabsContent value="reorder" className="space-y-3 mt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <MiniStat
              icon={Bell}
              label="Products Need Reordering"
              value={reorderTotal}
              sublabel="· at/below reorder point"
              color="text-amber-600 dark:text-amber-400"
              bg="bg-amber-50 dark:bg-amber-950/30"
            />
            <Button variant="outline" size="sm" onClick={fetchReorder} disabled={loadingReorder} className="h-9 rounded-xl gap-1.5">
              <RefreshCw className={cn('h-3.5 w-3.5', loadingReorder && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <Card className="overflow-hidden">
            {loadingReorder ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : reorderProducts.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                No products need reordering. Set reorder points on your products to get restock alerts.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[180px] h-9 text-[11px]">Product</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Current</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Reorder Pt</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Shortfall</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Suggested</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Lead</TableHead>
                      <TableHead className="h-9 text-[11px]">Status</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reorderProducts.map((p) => (
                      <TableRow key={p._id} className="h-12">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <ProductThumb url={p.imageUrl} name={p.name} size="sm" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate max-w-[160px]">{p.name}</p>
                              {p.category && <p className="text-[10px] text-muted-foreground">{p.category}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">{p.stock}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{p.reorderPoint}</TableCell>
                        <TableCell className="text-right text-xs text-red-600 dark:text-red-400 font-medium">{p.shortfall}</TableCell>
                        <TableCell className="text-right text-xs font-semibold text-primary">{p.suggestedReorderQty}</TableCell>
                        <TableCell className="text-right text-[11px] text-muted-foreground">
                          {p.leadTimeDays > 0 ? `${p.leadTimeDays}d` : '—'}
                        </TableCell>
                        <TableCell>
                          {p.status === 'out_of_stock' ? (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300 text-[10px]">Out</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">Reorder</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => openQuickRestock(p, p.suggestedReorderQty)}
                              className="h-7 px-2 text-[10px] gap-1 bg-emerald-500 hover:bg-emerald-600"
                            >
                              <Plus className="h-3 w-3" />
                              Restock
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toast.info('Purchase order feature coming soon')}
                              className="h-7 px-2 text-[10px] gap-1"
                            >
                              <ShoppingCart className="h-3 w-3" />
                              PO
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {reorderTotal > 10 && (
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <p className="text-[11px] text-muted-foreground">
                Showing {(reorderPage - 1) * 10 + 1}–{Math.min(reorderPage * 10, reorderTotal)} of {reorderTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={reorderPage <= 1} onClick={() => setReorderPage((p) => p - 1)} className="h-8 gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="text-[11px] text-muted-foreground">{reorderPage} / {reorderTotalPages}</span>
                <Button size="sm" variant="outline" disabled={reorderPage >= reorderTotalPages} onClick={() => setReorderPage((p) => p + 1)} className="h-8 gap-1">
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== DEAD STOCK TAB ===================== */}
        <TabsContent value="dead-stock" className="space-y-3 mt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Threshold:</span>
              {[30, 60, 90, 180].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={deadStockDays === d ? 'default' : 'outline'}
                  onClick={() => { setDeadStockDays(d); setDeadStockPage(1) }}
                  className="h-7 px-2.5 text-[11px] rounded-lg"
                >
                  {d}d
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={fetchDeadStock} disabled={loadingDeadStock} className="h-9 rounded-xl gap-1.5">
              <RefreshCw className={cn('h-3.5 w-3.5', loadingDeadStock && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2">
            <MiniStat
              icon={PackageX}
              label="Dead-Stock Products"
              value={deadStockTotal}
              sublabel={`· no sales in ${deadStockDays}d`}
              color="text-red-600 dark:text-red-400"
              bg="bg-red-50 dark:bg-red-950/30"
            />
            <MiniStat
              icon={Wallet}
              label="Tied-up Value (Cost)"
              value={fmtPrice(deadStockProducts.reduce((sum, p) => sum + (p.stockValueCost || 0), 0), 0)}
              sublabel="· capital locked"
              color="text-amber-600 dark:text-amber-400"
              bg="bg-amber-50 dark:bg-amber-950/30"
            />
          </div>

          <Card className="overflow-hidden">
            {loadingDeadStock ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : deadStockProducts.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                No dead stock found. All your products have sold recently.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[180px] h-9 text-[11px]">Product</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Stock</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Value (Selling)</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Value (Cost)</TableHead>
                      <TableHead className="h-9 text-[11px]">Last Sale</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Days</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deadStockProducts.map((p) => (
                      <TableRow key={p._id} className="h-12">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <ProductThumb url={p.imageUrl} name={p.name} size="sm" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate max-w-[160px]">{p.name}</p>
                              {p.category && <p className="text-[10px] text-muted-foreground">{p.category}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">{p.stock}</TableCell>
                        <TableCell className="text-right text-xs">{fmtPrice(p.stockValue, 0)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{fmtPrice(p.stockValueCost, 0)}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {p.lastSaleDate ? formatRelative(p.lastSaleDate) : 'Never sold'}
                        </TableCell>
                        <TableCell className="text-right text-xs text-amber-600 dark:text-amber-400 font-medium">
                          {p.daysSinceLastSale !== null ? `${p.daysSinceLastSale}d` : '∞'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toast.info('Clearance feature coming soon')}
                            className="h-7 px-2 text-[10px] gap-1"
                          >
                            <PackageX className="h-3 w-3" />
                            Clearance
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {deadStockTotal > 10 && (
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <p className="text-[11px] text-muted-foreground">
                Showing {(deadStockPage - 1) * 10 + 1}–{Math.min(deadStockPage * 10, deadStockTotal)} of {deadStockTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={deadStockPage <= 1} onClick={() => setDeadStockPage((p) => p - 1)} className="h-8 gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="text-[11px] text-muted-foreground">{deadStockPage} / {deadStockTotalPages}</span>
                <Button size="sm" variant="outline" disabled={deadStockPage >= deadStockTotalPages} onClick={() => setDeadStockPage((p) => p + 1)} className="h-8 gap-1">
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== VALUATION TAB ===================== */}
        <TabsContent value="valuation" className="space-y-3 mt-4">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={fetchValuation} disabled={loadingValuation} className="h-9 rounded-xl gap-1.5">
              <RefreshCw className={cn('h-3.5 w-3.5', loadingValuation && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
            <MiniStat
              icon={Wallet}
              label="Value (Cost)"
              value={fmtPrice(valuationTotals?.stockValueCost ?? 0, 0)}
              sublabel="· at cost"
              color="text-amber-600 dark:text-amber-400"
              bg="bg-amber-50 dark:bg-amber-950/30"
            />
            <MiniStat
              icon={TrendingUp}
              label="Value (Selling)"
              value={fmtPrice(valuationTotals?.stockValueSelling ?? 0, 0)}
              sublabel="· at selling"
              color="text-emerald-600 dark:text-emerald-400"
              bg="bg-emerald-50 dark:bg-emerald-950/30"
            />
            <MiniStat
              icon={BadgeDollarSign}
              label="Value (MRP)"
              value={fmtPrice(valuationTotals?.stockValueMrp ?? 0, 0)}
              sublabel="· at MRP"
              color="text-primary"
              bg="bg-primary/10"
            />
            <MiniStat
              icon={Sparkles}
              label="Potential Profit"
              value={fmtPrice(valuationTotals?.potentialProfit ?? 0, 0)}
              sublabel="· sell − cost"
              color="text-purple-600 dark:text-purple-400"
              bg="bg-purple-50 dark:bg-purple-950/30"
            />
          </div>

          <Card className="overflow-hidden">
            {loadingValuation ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : valuationProducts.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                No inventory to value.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[180px] h-9 text-[11px]">Product</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Stock</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Cost</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Selling</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Value (Cost)</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Value (Sell)</TableHead>
                      <TableHead className="text-right h-9 text-[11px]">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {valuationProducts.map((p) => (
                      <TableRow key={p._id} className="h-11">
                        <TableCell>
                          <p className="text-xs font-medium truncate max-w-[180px]">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{p.sku || '—'}</p>
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">{p.stock}</TableCell>
                        <TableCell className="text-right text-[11px] text-muted-foreground">{fmtPrice(p.costPrice, 0)}</TableCell>
                        <TableCell className="text-right text-[11px]">{fmtPrice(p.sellingPrice, 0)}</TableCell>
                        <TableCell className="text-right text-xs text-amber-600 dark:text-amber-400 font-medium">{fmtPrice(p.stockValueCost, 0)}</TableCell>
                        <TableCell className="text-right text-xs text-emerald-600 dark:text-emerald-400 font-medium">{fmtPrice(p.stockValueSelling, 0)}</TableCell>
                        <TableCell className="text-right text-xs text-purple-600 dark:text-purple-400 font-medium">{fmtPrice(p.potentialProfit, 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {valuationTotal > 10 && (
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <p className="text-[11px] text-muted-foreground">
                Showing {(valuationPage - 1) * 10 + 1}–{Math.min(valuationPage * 10, valuationTotal)} of {valuationTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={valuationPage <= 1} onClick={() => setValuationPage((p) => p - 1)} className="h-8 gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="text-[11px] text-muted-foreground">{valuationPage} / {valuationTotalPages}</span>
                <Button size="sm" variant="outline" disabled={valuationPage >= valuationTotalPages} onClick={() => setValuationPage((p) => p + 1)} className="h-8 gap-1">
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== IMPORT / EXPORT TAB ===================== */}
        <TabsContent value="io" className="space-y-3 mt-4">
          <div className="grid gap-2.5 grid-cols-1 lg:grid-cols-2">
            {/* EXPORT */}
            <Card className="p-4 gap-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileDown className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Export Inventory</h3>
                  <p className="text-[11px] text-muted-foreground">Full inventory details to CSV</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Exports ALL your products with stock, SKU, reorder points, cost price, warehouse location, etc.
              </p>
              <Button onClick={handleServerExport} className="w-full sm:w-auto h-9 rounded-xl gap-1.5">
                <Download className="h-4 w-4" />
                Export to CSV
              </Button>
            </Card>

            {/* IMPORT */}
            <Card className="p-4 gap-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileUp className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Import Inventory</h3>
                  <p className="text-[11px] text-muted-foreground">Bulk update stock from CSV</p>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <Label htmlFor="import-file" className="text-[11px]">CSV File (optional)</Label>
                  <Input
                    id="import-file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="h-9 text-xs"
                  />
                  {importFile && (
                    <p className="text-[10px] text-muted-foreground">
                      {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="import-text" className="text-[11px]">Or paste CSV rows</Label>
                  <Textarea
                    id="import-text"
                    placeholder={'productId,newQuantity,variantId\n665a1b2c3d4e5f6a7b8c9d0e,100,'}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={4}
                    className="font-mono text-[11px]"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="import-reason" className="text-[11px]">Reason</Label>
                  <Input
                    id="import-reason"
                    value={importReason}
                    onChange={(e) => setImportReason(e.target.value)}
                    placeholder="e.g. CSV bulk update"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="import-dryrun"
                    checked={importDryRun}
                    onCheckedChange={(v) => setImportDryRun(v === true)}
                  />
                  <Label htmlFor="import-dryrun" className="text-xs font-normal cursor-pointer">
                    Dry Run (validate without applying)
                  </Label>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={handleImport}
                    disabled={importLoading || (!importFile && !importText.trim())}
                    className="h-9 rounded-xl gap-1.5"
                  >
                    {importLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {importDryRun ? 'Dry Run' : 'Import'}
                  </Button>
                  <Button variant="outline" onClick={handleDownloadTemplate} className="h-9 rounded-xl gap-1.5">
                    <FileDown className="h-4 w-4" />
                    Template
                  </Button>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Format: <code className="bg-muted px-1 rounded">productId,newQuantity,variantId</code> (variantId optional). Max 500 rows.
                </p>

                {importResult && (
                  <div className={cn(
                    'rounded-lg border p-2.5 text-xs',
                    importResult.success
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                      : 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20',
                  )}>
                    <div className="flex items-center gap-2 font-medium">
                      {importResult.success ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      {importResult.dryRun ? 'Dry Run Result' : importResult.applied ? 'Import Complete' : 'Import Failed'}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {importResult.dryRun
                        ? `${importResult.validRowCount || 0} valid row(s)${importResult.failed ? `, ${importResult.failed} error(s)` : ''}`
                        : `${importResult.updated} updated, ${importResult.failed} failed`}
                    </p>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2 max-h-28 overflow-y-auto rounded bg-background/60 p-2 text-[10px] scrollbar-thin">
                        <ul className="space-y-0.5">
                          {importResult.errors.slice(0, 20).map((e, i) => (
                            <li key={i} className="text-red-600 dark:text-red-400 font-mono">{e}</li>
                          ))}
                          {importResult.errors.length > 20 && (
                            <li className="text-muted-foreground italic">
                              ...and {importResult.errors.length - 20} more
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ===================== ADJUST DIALOG ===================== */}
      <Dialog open={!!adjustItem} onOpenChange={(open) => !open && setAdjustItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Adjust Stock
            </DialogTitle>
            <DialogDescription>
              Set an absolute stock level or apply a relative (+/−) delta.
            </DialogDescription>
          </DialogHeader>
          {adjustItem && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-10 w-10 rounded-md overflow-hidden bg-background flex-shrink-0">
                  {adjustItem.imageUrl && (
                    <img src={adjustItem.imageUrl} alt={adjustItem.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{adjustItem.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Current: {adjustItem.trackInventory ? `${adjustItem.stock} units` : 'Unlimited'}
                    {adjustItem.reservedStock > 0 && ` · ${adjustItem.reservedStock} reserved`}
                  </p>
                </div>
              </div>

              {adjustItem.variants && adjustItem.variants.length > 0 && (
                <div className="space-y-2">
                  <Label>Variant</Label>
                  <Select
                    value={adjustVariantId || 'default'}
                    onValueChange={(v) => {
                      if (v === 'default') {
                        setAdjustVariantId(undefined)
                        setAdjustQty(adjustItem.stock)
                      } else {
                        setAdjustVariantId(v)
                        const variant = adjustItem.variants.find((x) => x._id === v)
                        setAdjustQty(variant?.stock || 0)
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Product (parent)</SelectItem>
                      {adjustItem.variants.map((v) => (
                        <SelectItem key={v._id} value={v._id}>
                          {v.sku} — {Object.values(v.attributes).join(' / ') || 'variant'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Adjustment Mode</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={adjustMode === 'absolute' ? 'default' : 'outline'}
                    onClick={() => setAdjustMode('absolute')}
                  >
                    Absolute
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={adjustMode === 'delta' ? 'default' : 'outline'}
                    onClick={() => setAdjustMode('delta')}
                  >
                    Delta (+/−)
                  </Button>
                </div>
              </div>

              {adjustMode === 'absolute' ? (
                <div className="space-y-2">
                  <Label htmlFor="qty">New Stock Quantity</Label>
                  <Input
                    id="qty"
                    type="number"
                    min={0}
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Math.max(0, Number(e.target.value)))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Set the absolute stock count. Positive or negative deltas are calculated automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="delta">Delta (positive to add, negative to remove)</Label>
                  <Input
                    id="delta"
                    type="number"
                    value={adjustDelta}
                    onChange={(e) => setAdjustDelta(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g. <code className="bg-muted px-1 rounded">+50</code> adds 50 units,{' '}
                    <code className="bg-muted px-1 rounded">−10</code> removes 10 units. Stock is clamped to ≥ 0.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g. Restocked from supplier, damaged goods, stock correction..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleAdjust}
              disabled={actionLoading || !adjustItem?.trackInventory || (adjustMode === 'delta' && adjustDelta === 0)}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== BULK UPDATE DIALOG ===================== */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Bulk Stock Update
            </DialogTitle>
            <DialogDescription>
              Paste product IDs and new stock quantities below (one per line).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bulk">Entries (productId, newQuantity, variantId?)</Label>
              <Textarea
                id="bulk"
                placeholder={'665a1b2c3d4e5f6a7b8c9d0e,50\n665a1b2c3d4e5f6a7b8c9d0f,30,variant-sku-1'}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Format: <code className="bg-muted px-1 rounded">productId,newQuantity[,variantId]</code> — one per line.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulkReason">Reason (optional)</Label>
              <Input
                id="bulkReason"
                placeholder="e.g. Monthly stock reconciliation"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={handleBulkUpdate} disabled={actionLoading || !bulkText.trim()}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Update {bulkText.trim() ? `(${bulkText.split('\n').filter((l) => l.trim()).length} items)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== QUICK RESTOCK DIALOG ===================== */}
      <Dialog open={!!quickRestockItem} onOpenChange={(open) => !open && setQuickRestockItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-500" />
              Quick Restock
            </DialogTitle>
            <DialogDescription>
              Add or remove units from current stock (delta mode).
            </DialogDescription>
          </DialogHeader>
          {quickRestockItem && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-10 w-10 rounded-md overflow-hidden bg-background flex-shrink-0">
                  {quickRestockItem.imageUrl && (
                    <img src={quickRestockItem.imageUrl} alt={quickRestockItem.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{quickRestockItem.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Current: {quickRestockItem.stock} units
                    {quickRestockItem.reservedStock && quickRestockItem.reservedStock > 0
                      ? ` · ${quickRestockItem.reservedStock} reserved`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="restock-qty">Units to Add (+/−)</Label>
                <Input
                  id="restock-qty"
                  type="number"
                  value={quickRestockQty}
                  onChange={(e) => setQuickRestockQty(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Positive to add stock (e.g. +50), negative to remove (e.g. −10). Stock is clamped to ≥ 0.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="restock-reason">Reason (optional)</Label>
                <Input
                  id="restock-reason"
                  placeholder="e.g. Supplier delivery, restock..."
                  value={quickRestockReason}
                  onChange={(e) => setQuickRestockReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickRestockItem(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleQuickRestock}
              disabled={actionLoading || quickRestockQty === 0}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Apply Restock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
