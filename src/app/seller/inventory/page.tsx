'use client'

/* ------------------------------------------------------------------ */
/*  Seller Inventory Management Page                                    */
/*  Production-level inventory dashboard following                       */
/*  Flipkart/Meesho/Amazon seller panel patterns.                       */
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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    adjustment: { label: 'Adjustment', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: <Settings2 className="h-3 w-3" /> },
    restock: { label: 'Restock', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <Package className="h-3 w-3" /> },
    reservation: { label: 'Reserved', className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', icon: <Info className="h-3 w-3" /> },
    release: { label: 'Released', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <RefreshCw className="h-3 w-3" /> },
    reservation_confirm: { label: 'Confirmed', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', icon: <CheckCircle2 className="h-3 w-3" /> },
    initial: { label: 'Initial', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <Package className="h-3 w-3" /> },
    correction: { label: 'Correction', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: <AlertTriangle className="h-3 w-3" /> },
  }
  const cfg = map[type] || { label: type, className: 'bg-slate-100 text-slate-700', icon: null }
  return (
    <Badge className={cn('gap-1', cfg.className)}>
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

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="h-7 w-7 text-primary" />
            Inventory Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track stock levels, manage alerts, and audit every movement.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { fetchDashboard(); fetchList() }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Bulk Update
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 max-w-5xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="list">Inventory</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts
            {alerts.length > 0 && (
              <Badge className="ml-2 bg-red-500 text-white">{alerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="reorder" className="gap-1">
            <Bell className="h-3.5 w-3.5" />
            Reorder
          </TabsTrigger>
          <TabsTrigger value="dead-stock" className="gap-1">
            <PackageX className="h-3.5 w-3.5" />
            Dead Stock
          </TabsTrigger>
          <TabsTrigger value="valuation" className="gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Valuation
          </TabsTrigger>
          <TabsTrigger value="io" className="gap-1">
            <Upload className="h-3.5 w-3.5" />
            Import / Export
          </TabsTrigger>
        </TabsList>

        {/* ===================== OVERVIEW TAB ===================== */}
        <TabsContent value="overview" className="space-y-4">
          {loadingDashboard ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total SKUs</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summary?.totalSkus ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summary?.trackedSkus ?? 0} tracked
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">In Stock</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary?.inStockSkus ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">{summary?.totalUnits ?? 0} units</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary?.lowStockSkus ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Need restocking soon</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Out of Stock</CardTitle>
                    <PackageX className="h-4 w-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary?.outOfStockSkus ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Action required</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (Selling)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">{fmtPrice(summary?.stockValue ?? 0, 0)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Reserved: {summary?.totalReservedUnits ?? 0} units
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (MRP)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{fmtPrice(summary?.stockValueMrp ?? 0, 0)}</div>
                    <p className="text-xs text-muted-foreground mt-1">At maximum retail price</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Available Units</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summary?.totalAvailableUnits ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Sellable right now</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Lowest Stock Products
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {lowStockProducts.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                        All products are well stocked!
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {lowStockProducts.map((p) => (
                          <div key={p._id} className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                              {p.imageUrl && (
                                <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.stock} / {p.lowStockThreshold} units
                              </p>
                            </div>
                            <div className="text-right">
                              {statusBadge(p.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="h-4 w-4 text-primary" />
                      Recent Stock Movements
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {recentMovements.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No movements yet
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {recentMovements.map((m) => (
                          <div key={m._id} className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {movementTypeBadge(m.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.productName}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.quantityChange > 0 ? '+' : ''}{m.quantityChange} units
                                {m.reason ? ` · ${m.reason}` : ''}
                              </p>
                              <p className="text-[10px] text-muted-foreground/70">{formatDate(m.createdAt)}</p>
                            </div>
                            <div className="text-xs text-muted-foreground text-right">
                              {m.stockBefore} → {m.stockAfter}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ===================== LIST TAB ===================== */}
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, SKU, or brand..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setListPage(1) }}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setListPage(1) }}>
                  <SelectTrigger className="w-full md:w-44">
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
                  <SelectTrigger className="w-full md:w-44">
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
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
                      <TableRow>
                        <TableHead className="min-w-[200px]">Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">In Stock</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Threshold</TableHead>
                        <TableHead className="text-right">Reorder Pt</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">Cost Price</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                {item.imageUrl && (
                                  <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate max-w-[200px]">{item.name}</p>
                                <p className="text-xs text-muted-foreground">{item.category}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{item.sku || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{item.trackInventory ? item.stock : '∞'}</TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400">{item.reservedStock || 0}</TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">
                            {item.trackInventory ? item.availableStock : '∞'}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.lowStockThreshold}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.reorderPoint > 0 ? item.reorderPoint : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.warehouseLocation || (
                              <span className="opacity-50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.costPrice ? fmtPrice(item.costPrice, 0) : '—'}
                          </TableCell>
                          <TableCell className="text-right">{fmtPrice(item.stockValue, 0)}</TableCell>
                          <TableCell>{statusBadge(item.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openAdjustDialog(item)}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Adjust
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openQuickRestock(item)}
                                disabled={!item.trackInventory}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
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
            </CardContent>
          </Card>

          {listTotal > listLimit && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(listPage - 1) * listLimit + 1}–{Math.min(listPage * listLimit, listTotal)} of {listTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={listPage <= 1}
                  onClick={() => setListPage((p) => p - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {listPage} / {listTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={listPage >= listTotalPages}
                  onClick={() => setListPage((p) => p + 1)}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== ALERTS TAB ===================== */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 text-primary" />
                  Active Inventory Alerts
                  {alerts.length > 0 && (
                    <Badge className="ml-1 bg-red-500 text-white">{alerts.length}</Badge>
                  )}
                </CardTitle>
                {alerts.length > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleBulkResolve}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Resolve All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                  No active alerts. All stock levels are healthy.
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert._id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border',
                        alert.type === 'out_of_stock'
                          ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20'
                          : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20',
                      )}
                    >
                      <div className="flex-shrink-0">
                        {alert.type === 'out_of_stock' ? (
                          <PackageX className="h-5 w-5 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{alert.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {alert.message} · {formatDate(alert.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcknowledge(alert.alertId)}
                        >
                          Acknowledge
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleResolve(alert.alertId)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Resolve
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== MOVEMENTS TAB ===================== */}
        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold">Stock Movement History</h3>
                  <p className="text-xs text-muted-foreground">Complete audit trail of all stock changes</p>
                </div>
                <Select value={movementTypeFilter} onValueChange={(v) => { setMovementTypeFilter(v); setMovementsPage(1) }}>
                  <SelectTrigger className="w-full sm:w-48">
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
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
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="min-w-[200px]">Product</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                        <TableHead className="text-right">Before</TableHead>
                        <TableHead className="text-right">After</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>By</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((m) => (
                        <TableRow key={m._id}>
                          <TableCell>{movementTypeBadge(m.type)}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium truncate max-w-[200px]">{m.productName}</p>
                              {m.variantSku && (
                                <p className="text-xs text-muted-foreground font-mono">{m.variantSku}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={cn(
                            'text-right font-semibold font-mono',
                            m.quantityChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                          )}>
                            {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{m.stockBefore}</TableCell>
                          <TableCell className="text-right font-medium">{m.stockAfter}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {m.reason || '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="capitalize">{m.performedBy}</span>
                            {m.userName ? ` · ${m.userName}` : ''}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(m.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {movementsTotal > 50 && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(movementsPage - 1) * 50 + 1}–{Math.min(movementsPage * 50, movementsTotal)} of {movementsTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={movementsPage <= 1}
                  onClick={() => setMovementsPage((p) => p - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {movementsPage} / {movementsTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={movementsPage >= movementsTotalPages}
                  onClick={() => setMovementsPage((p) => p + 1)}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== REORDER TAB ===================== */}
        <TabsContent value="reorder" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Card className="flex-1 min-w-[200px]">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Products Need Reordering</CardTitle>
                <Bell className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{reorderTotal}</div>
                <p className="text-xs text-muted-foreground mt-1">Stock at or below reorder point</p>
              </CardContent>
            </Card>
            <Button variant="outline" size="sm" onClick={fetchReorder} disabled={loadingReorder}>
              <RefreshCw className={cn('h-4 w-4 mr-2', loadingReorder && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
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
                      <TableRow>
                        <TableHead className="min-w-[200px]">Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">Reorder Pt</TableHead>
                        <TableHead className="text-right">Reorder Qty</TableHead>
                        <TableHead className="text-right">Safety</TableHead>
                        <TableHead className="text-right">Shortfall</TableHead>
                        <TableHead className="text-right">Suggested</TableHead>
                        <TableHead className="text-right">Lead (days)</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reorderProducts.map((p) => (
                        <TableRow key={p._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                {p.imageUrl && (
                                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate max-w-[200px]">{p.name}</p>
                                {p.category && (
                                  <p className="text-xs text-muted-foreground">{p.category}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{p.sku || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.reorderPoint}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.reorderQuantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.safetyStock}</TableCell>
                          <TableCell className="text-right text-red-600 dark:text-red-400 font-medium">{p.shortfall}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">{p.suggestedReorderQty}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {p.leadTimeDays > 0 ? p.leadTimeDays : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                            {p.supplier || '—'}
                          </TableCell>
                          <TableCell>
                            {p.status === 'out_of_stock' ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">Out</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">Reorder</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openQuickRestock(p, p.suggestedReorderQty)}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Restock Now
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toast.info('Purchase order feature coming soon')}
                              >
                                <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                                Create PO
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {reorderTotal > 10 && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(reorderPage - 1) * 10 + 1}–{Math.min(reorderPage * 10, reorderTotal)} of {reorderTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reorderPage <= 1}
                  onClick={() => setReorderPage((p) => p - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {reorderPage} / {reorderTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reorderPage >= reorderTotalPages}
                  onClick={() => setReorderPage((p) => p + 1)}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== DEAD STOCK TAB ===================== */}
        <TabsContent value="dead-stock" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Threshold:</span>
              {[30, 60, 90, 180].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={deadStockDays === d ? 'default' : 'outline'}
                  onClick={() => { setDeadStockDays(d); setDeadStockPage(1) }}
                >
                  {d}d
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={fetchDeadStock} disabled={loadingDeadStock}>
              <RefreshCw className={cn('h-4 w-4 mr-2', loadingDeadStock && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Dead-Stock Products</CardTitle>
                <PackageX className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{deadStockTotal}</div>
                <p className="text-xs text-muted-foreground mt-1">No sales in last {deadStockDays} days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tied-up Value (Cost)</CardTitle>
                <Wallet className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {fmtPrice(deadStockProducts.reduce((sum, p) => sum + (p.stockValueCost || 0), 0), 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Capital locked in unsold stock</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
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
                      <TableRow>
                        <TableHead className="min-w-[200px]">Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Value (Selling)</TableHead>
                        <TableHead className="text-right">Value (Cost)</TableHead>
                        <TableHead>Last Sale Date</TableHead>
                        <TableHead className="text-right">Days Since</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deadStockProducts.map((p) => (
                        <TableRow key={p._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                {p.imageUrl && (
                                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate max-w-[200px]">{p.name}</p>
                                {p.category && (
                                  <p className="text-xs text-muted-foreground">{p.category}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{p.sku || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                          <TableCell className="text-right">{fmtPrice(p.stockValue, 0)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmtPrice(p.stockValueCost, 0)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {p.lastSaleDate ? formatDate(p.lastSaleDate) : 'Never sold'}
                          </TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400 font-medium">
                            {p.daysSinceLastSale !== null ? `${p.daysSinceLastSale}d` : '∞'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toast.info('Clearance feature coming soon')}
                            >
                              <PackageX className="h-3.5 w-3.5 mr-1" />
                              Mark for Clearance
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {deadStockTotal > 10 && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(deadStockPage - 1) * 10 + 1}–{Math.min(deadStockPage * 10, deadStockTotal)} of {deadStockTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={deadStockPage <= 1}
                  onClick={() => setDeadStockPage((p) => p - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {deadStockPage} / {deadStockTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={deadStockPage >= deadStockTotalPages}
                  onClick={() => setDeadStockPage((p) => p + 1)}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== VALUATION TAB ===================== */}
        <TabsContent value="valuation" className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={fetchValuation} disabled={loadingValuation}>
              <RefreshCw className={cn('h-4 w-4 mr-2', loadingValuation && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (Cost)</CardTitle>
                <Wallet className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {fmtPrice(valuationTotals?.stockValueCost ?? 0, 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">At cost price</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (Selling)</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {fmtPrice(valuationTotals?.stockValueSelling ?? 0, 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">At selling price</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (MRP)</CardTitle>
                <BadgeDollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {fmtPrice(valuationTotals?.stockValueMrp ?? 0, 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">At maximum retail price</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Potential Profit</CardTitle>
                <Sparkles className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {fmtPrice(valuationTotals?.potentialProfit ?? 0, 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Selling − Cost</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
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
                      <TableRow>
                        <TableHead className="min-w-[200px]">Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Selling</TableHead>
                        <TableHead className="text-right">MRP</TableHead>
                        <TableHead className="text-right">Value (Cost)</TableHead>
                        <TableHead className="text-right">Value (Selling)</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead>Warehouse</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valuationProducts.map((p) => (
                        <TableRow key={p._id}>
                          <TableCell className="text-sm font-medium truncate max-w-[200px]">{p.name}</TableCell>
                          <TableCell className="font-mono text-xs">{p.sku || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmtPrice(p.costPrice, 0)}</TableCell>
                          <TableCell className="text-right">{fmtPrice(p.sellingPrice, 0)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmtPrice(p.mrp, 0)}</TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400 font-medium">{fmtPrice(p.stockValueCost, 0)}</TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">{fmtPrice(p.stockValueSelling, 0)}</TableCell>
                          <TableCell className="text-right text-purple-600 dark:text-purple-400 font-medium">{fmtPrice(p.potentialProfit, 0)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.warehouseLocation || <span className="opacity-50">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {valuationTotal > 10 && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(valuationPage - 1) * 10 + 1}–{Math.min(valuationPage * 10, valuationTotal)} of {valuationTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={valuationPage <= 1}
                  onClick={() => setValuationPage((p) => p - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {valuationPage} / {valuationTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={valuationPage >= valuationTotalPages}
                  onClick={() => setValuationPage((p) => p + 1)}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== IMPORT / EXPORT TAB ===================== */}
        <TabsContent value="io" className="space-y-4">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* EXPORT */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileDown className="h-4 w-4 text-primary" />
                  Export Inventory
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Exports ALL your products with full inventory details (stock, SKU, reorder points,
                  cost price, warehouse location, etc.).
                </p>
                <Button onClick={handleServerExport} className="w-full sm:w-auto">
                  <Download className="h-4 w-4 mr-2" />
                  Export Inventory to CSV
                </Button>
              </CardContent>
            </Card>

            {/* IMPORT */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileUp className="h-4 w-4 text-primary" />
                  Import Inventory
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="import-file">CSV File (optional)</Label>
                  <Input
                    id="import-file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  />
                  {importFile && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="import-text">Or paste CSV rows</Label>
                  <Textarea
                    id="import-text"
                    placeholder={'productId,newQuantity,variantId\n665a1b2c3d4e5f6a7b8c9d0e,100,'}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={5}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="import-reason">Reason</Label>
                  <Input
                    id="import-reason"
                    value={importReason}
                    onChange={(e) => setImportReason(e.target.value)}
                    placeholder="e.g. CSV bulk update"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="import-dryrun"
                    checked={importDryRun}
                    onCheckedChange={(v) => setImportDryRun(v === true)}
                  />
                  <Label htmlFor="import-dryrun" className="text-sm font-normal cursor-pointer">
                    Dry Run (validate without applying)
                  </Label>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    onClick={handleImport}
                    disabled={importLoading || (!importFile && !importText.trim())}
                  >
                    {importLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {importDryRun ? 'Dry Run' : 'Import'}
                  </Button>
                  <Button variant="outline" onClick={handleDownloadTemplate}>
                    <FileDown className="h-4 w-4 mr-2" />
                    Download Template
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  CSV format: <code className="bg-muted px-1 rounded">productId,newQuantity,variantId</code> (variantId
                  optional). Max 500 rows. Use Dry Run to validate first.
                </p>

                {importResult && (
                  <div className={cn(
                    'rounded-lg border p-3 text-sm',
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      {importResult.dryRun
                        ? `${importResult.validRowCount || 0} valid row(s)${importResult.failed ? `, ${importResult.failed} error(s)` : ''}`
                        : `${importResult.updated} updated, ${importResult.failed} failed`}
                    </p>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2 max-h-32 overflow-y-auto rounded bg-background/60 p-2 text-xs">
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
              </CardContent>
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
