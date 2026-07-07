'use client'

/* ------------------------------------------------------------------ */
/*  Admin Inventory Management Page                                     */
/*  Platform-wide inventory oversight following                         */
/*  Flipkart/Meesho/Amazon admin panel patterns.                        */
/* ------------------------------------------------------------------ */

import React, { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import {
  Boxes,
  Package,
  AlertTriangle,
  PackageX,
  RefreshCw,
  Download,
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
  Store,
  Inbox,
  TrendingUp,
  LineChart,
  Search,
  Upload,
  FileText,
  Sparkles,
  Trash2,
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

interface AdminSummary {
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
  stockValueCost?: number
}

interface SellerHealth {
  sellerId: string
  sellerName: string
  totalSkus: number
  lowStockSkus: number
  outOfStockSkus: number
  totalUnits: number
  stockValue: number
}

interface AdminAlert {
  _id: string
  alertId: string
  productId: string
  productName: string
  sellerName: string
  type: 'low_stock' | 'out_of_stock' | 'reorder'
  currentStock: number
  threshold: number
  status: string
  message: string
  createdAt: string
}

interface AdminMovement {
  _id: string
  movementId: string
  productId: string
  productName: string
  variantId?: string
  variantSku?: string
  sellerId?: string
  sellerName?: string
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

interface LowStockProduct {
  _id: string
  name: string
  sellerId: string
  sellerName: string
  imageUrl: string
  stock: number
  reservedStock: number
  availableStock: number
  lowStockThreshold: number
  sellingPrice: number
  category: string
  status: string
  updatedAt: string
}

interface InventoryAlert {
  _id: string
  alertId?: string
  productId?: string
  productName?: string
  sellerName?: string
  sellerId?: string
  type: 'low_stock' | 'out_of_stock' | 'reorder'
  currentStock?: number
  threshold?: number
  status: string
  message?: string
  createdAt: string
}

interface ReorderProduct {
  _id: string
  name: string
  sku?: string
  sellerId?: string
  sellerName?: string
  stock: number
  reorderPoint: number
  reorderQuantity: number
  safetyStock: number
  shortfall: number
  suggestedReorderQty: number
  leadTimeDays: number
  supplier: string
  status: string
}

interface DeadStockProduct {
  _id: string
  name: string
  sku?: string
  sellerId?: string
  sellerName?: string
  stock: number
  costPrice?: number
  sellingPrice?: number
  lastSaleDate: string | null
  daysSinceLastSale: number | null
  stockValue: number
  stockValueCost: number
}

interface ValuationProduct {
  _id: string
  productId: string
  name: string
  sku: string
  sellerId: string
  sellerName: string
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

interface ValuationTotals {
  stockValueCost: number
  stockValueSelling: number
  stockValueMrp: number
  potentialProfit: number
  totalUnits: number
}

interface ForecastResult {
  productId: string
  productName?: string
  dailyAvgSales: number
  projectedDemand: number
  currentStock: number
  daysOfCover: number | null
  recommendedReorderQty: number
  history: Array<{ date: string; qty: number }>
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function statusBadge(status: string) {
  switch (status) {
    case 'in_stock':
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">In Stock</Badge>
    case 'low_stock':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">Low Stock</Badge>
    case 'out_of_stock':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">Out of Stock</Badge>
    case 'unlimited':
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300">Unlimited</Badge>
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

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/** Minimal RFC-4180-ish single-line CSV parser (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { fields.push(current); current = '' }
      else current += ch
    }
  }
  fields.push(current)
  return fields
}

/** Parse a CSV blob into import-ready rows. Skips header + invalid rows. */
function parseCsvToRows(text: string): Array<{ productId: string; newQuantity: number; variantId?: string }> {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  let header: Record<string, number> | null = null
  let start = 0
  const first = parseCsvLine(lines[0]).map((f) => f.trim().toLowerCase())
  if (first.includes('productid')) {
    header = {}
    first.forEach((name, idx) => { if (name) header![name] = idx })
    start = 1
  }
  const rows: Array<{ productId: string; newQuantity: number; variantId?: string }> = []
  for (let i = start; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    let productId: string
    let qtyStr: string
    let variantId: string | undefined
    if (header) {
      productId = (fields[header['productid'] ?? 0] || '').trim()
      qtyStr = (fields[header['newquantity'] ?? 1] || '').trim()
      variantId = (fields[header['variantid'] ?? 2] || '').trim() || undefined
    } else {
      productId = (fields[0] || '').trim()
      qtyStr = (fields[1] || '').trim()
      variantId = (fields[2] || '').trim() || undefined
    }
    if (!productId) continue
    const qty = Number(qtyStr)
    if (!Number.isFinite(qty) || qty < 0) continue
    rows.push({ productId, newQuantity: qty, variantId })
  }
  return rows
}

function alertTypeBadge(type: string) {
  switch (type) {
    case 'out_of_stock':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">Out of Stock</Badge>
    case 'low_stock':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">Low Stock</Badge>
    case 'reorder':
      return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300">Reorder</Badge>
    default:
      return <Badge variant="secondary">{type}</Badge>
  }
}

function alertStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">Active</Badge>
    case 'acknowledged':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">Acknowledged</Badge>
    case 'resolved':
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">Resolved</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

/**
 * Lightweight CSS-only bar chart for daily sales history. Renders one vertical
 * bar per day, with the bar height proportional to that day's quantity vs the
 * max quantity observed in the window. No charting library required.
 */
function SalesHistoryChart({ history }: { history: Array<{ date: string; qty: number }> }) {
  const maxQty = history.reduce((m, h) => Math.max(m, h.qty), 0) || 1
  return (
    <div>
      <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
        {history.map((h, i) => {
          const heightPct = Math.max(4, Math.round((h.qty / maxQty) * 100))
          return (
            <div
              key={`${h.date}-${i}`}
              className="flex flex-col items-center justify-end flex-shrink-0"
              style={{ minWidth: '14px' }}
              title={`${h.date}: ${h.qty} unit(s)`}
            >
              <span className="text-[9px] text-muted-foreground mb-0.5">{h.qty}</span>
              <div
                className="w-3 rounded-t-sm bg-gradient-to-t from-primary/60 to-primary"
                style={{ height: `${heightPct}%`, minHeight: '4px' }}
              />
              <span className="text-[8px] text-muted-foreground mt-1 whitespace-nowrap rotate-45 origin-left">
                {h.date.slice(5)}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        {history.length} day(s) with sales in the lookback window · Peak: {maxQty} unit(s)/day
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Reusable Stock Adjustment Dialog                                    */
/* ------------------------------------------------------------------ */

function StockAdjustmentDialog({
  open,
  onOpenChange,
  productId,
  variantId,
  productName,
  currentStock,
  presetQty,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  productId: string
  variantId?: string
  productName?: string
  currentStock?: number
  presetQty?: number
  onSuccess?: () => void
}) {
  const [mode, setMode] = useState<'absolute' | 'delta'>('absolute')
  const [quantity, setQuantity] = useState<string>(presetQty !== undefined ? String(presetQty) : '')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setMode('absolute')
      setQuantity(presetQty !== undefined ? String(presetQty) : '')
      setReason('')
    }
  }, [open, presetQty])

  const submit = async () => {
    if (!productId) {
      toast.error('Missing product ID')
      return
    }
    const qtyNum = Number(quantity)
    if (!Number.isFinite(qtyNum)) {
      toast.error('Quantity must be a valid number')
      return
    }
    if (mode === 'absolute' && qtyNum < 0) {
      toast.error('Absolute quantity cannot be negative')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        productId,
        reason: reason || undefined,
        variantId: variantId || undefined,
      }
      if (mode === 'absolute') body.newQuantity = qtyNum
      else body.delta = qtyNum
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || 'Adjust failed')
      toast.success(`Stock adjusted. New stock: ${data.newStock ?? '—'}`)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast.error((err as Error).message || 'Failed to adjust stock')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Adjust Stock
          </DialogTitle>
          <DialogDescription>
            {productName ? `Adjusting stock for "${productName}"` : 'Manually adjust stock for a product.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground break-all">
            Product ID: <span className="font-mono">{productId}</span>
            {variantId && (
              <>
                {' · '}Variant: <span className="font-mono">{variantId}</span>
              </>
            )}
            {currentStock !== undefined && (
              <>
                {' · '}Current stock: <span className="font-semibold">{currentStock}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === 'absolute' ? 'default' : 'outline'}
              onClick={() => setMode('absolute')}
            >
              Absolute
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'delta' ? 'default' : 'outline'}
              onClick={() => setMode('delta')}
            >
              Delta (+/-)
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-qty" className="text-xs">
              {mode === 'absolute' ? 'New absolute quantity' : 'Delta (use negative for decrease)'}
            </Label>
            <Input
              id="adj-qty"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={mode === 'absolute' ? 'e.g. 50' : 'e.g. -10 or +10'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason" className="text-xs">Reason (optional)</Label>
            <Input
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged in warehouse"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || quantity === ''}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Adjust Stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                 */
/* ------------------------------------------------------------------ */

export default function AdminInventoryPage() {
  const { authenticated, loading } = useAdminAuth()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState('overview')

  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [sellerHealth, setSellerHealth] = useState<SellerHealth[]>([])
  const [activeAlerts, setActiveAlerts] = useState<AdminAlert[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([])
  const [recentMovements, setRecentMovements] = useState<AdminMovement[]>([])

  const [lowStockList, setLowStockList] = useState<LowStockProduct[]>([])
  const [lowStockTotal, setLowStockTotal] = useState(0)
  const [lowStockPage, setLowStockPage] = useState(1)
  const [lowStockType, setLowStockType] = useState('all')

  const [movements, setMovements] = useState<AdminMovement[]>([])
  const [movementsTotal, setMovementsTotal] = useState(0)
  const [movementsPage, setMovementsPage] = useState(1)
  const [movementTypeFilter, setMovementTypeFilter] = useState('all')
  const [movementSellerSearch, setMovementSellerSearch] = useState('')

  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingLowStock, setLoadingLowStock] = useState(true)
  const [loadingMovements, setLoadingMovements] = useState(true)

  /* --- Alerts tab state --- */
  const [alerts, setAlerts] = useState<InventoryAlert[]>([])
  const [alertsTotal, setAlertsTotal] = useState(0)
  const [alertsPage, setAlertsPage] = useState(1)
  const [alertsTotalPages, setAlertsTotalPages] = useState(1)
  const [alertsStatus, setAlertsStatus] = useState('active')
  const [alertsType, setAlertsType] = useState('all')
  const [alertsSellerSearch, setAlertsSellerSearch] = useState('')
  const [loadingAlerts, setLoadingAlerts] = useState(true)

  /* --- Reorder tab state --- */
  const [reorderProducts, setReorderProducts] = useState<ReorderProduct[]>([])
  const [reorderTotal, setReorderTotal] = useState(0)
  const [reorderPage, setReorderPage] = useState(1)
  const [reorderSellerSearch, setReorderSellerSearch] = useState('')
  const [loadingReorder, setLoadingReorder] = useState(true)

  /* --- Dead stock tab state --- */
  const [deadStockProducts, setDeadStockProducts] = useState<DeadStockProduct[]>([])
  const [deadStockTotal, setDeadStockTotal] = useState(0)
  const [deadStockPage, setDeadStockPage] = useState(1)
  const [deadStockDays, setDeadStockDays] = useState(90)
  const [deadStockSellerSearch, setDeadStockSellerSearch] = useState('')
  const [loadingDeadStock, setLoadingDeadStock] = useState(true)
  const [deadStockTotals, setDeadStockTotals] = useState<{ cost: number; selling: number }>({ cost: 0, selling: 0 })

  /* --- Valuation tab state --- */
  const [valuationProducts, setValuationProducts] = useState<ValuationProduct[]>([])
  const [valuationTotal, setValuationTotal] = useState(0)
  const [valuationPage, setValuationPage] = useState(1)
  const [valuationSellerSearch, setValuationSellerSearch] = useState('')
  const [loadingValuation, setLoadingValuation] = useState(true)
  const [valuationTotals, setValuationTotals] = useState<ValuationTotals | null>(null)

  /* --- Forecast tab state --- */
  const [forecastProductId, setForecastProductId] = useState('')
  const [forecastLookback, setForecastLookback] = useState(30)
  const [forecastHorizon, setForecastHorizon] = useState(30)
  const [forecastData, setForecastData] = useState<ForecastResult | null>(null)
  const [loadingForecast, setLoadingForecast] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)

  /* --- Adjust tab state (inline single adjust form) --- */
  const [adjustProductId, setAdjustProductId] = useState('')
  const [adjustVariantId, setAdjustVariantId] = useState('')
  const [adjustMode, setAdjustMode] = useState<'absolute' | 'delta'>('absolute')
  const [adjustQuantity, setAdjustQuantity] = useState<string>('')
  const [adjustReason, setAdjustReason] = useState('')
  const [submittingAdjust, setSubmittingAdjust] = useState(false)

  /* --- Import state --- */
  const [importText, setImportText] = useState('')
  const [importReason, setImportReason] = useState('')
  const [importDryRun, setImportDryRun] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: boolean
    message?: string
    updated: number
    failed: number
    errors?: string[]
    dryRun?: boolean
    rowCount?: number
  } | null>(null)
  const [submittingImport, setSubmittingImport] = useState(false)

  /* --- Sweep state --- */
  const [sweeping, setSweeping] = useState(false)
  const [sweepResult, setSweepResult] = useState<{ released: number } | null>(null)

  /* --- Reusable adjust dialog state (opened from Reorder / Dead Stock tabs) --- */
  const [adjustDialog, setAdjustDialog] = useState<{
    open: boolean
    productId: string
    variantId?: string
    productName?: string
    currentStock?: number
    presetQty?: number
  }>({ open: false, productId: '' })

  /* --- Overview tab extra KPIs --- */
  const [overviewExtra, setOverviewExtra] = useState<{ reorderCount: number; deadStockCount: number }>({
    reorderCount: 0,
    deadStockCount: 0,
  })

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/admin/login')
    }
  }, [loading, authenticated, router])

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true)
    try {
      const res = await fetch('/api/admin/inventory/overview', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load overview')
      const data = await res.json().catch(() => ({}))
      setSummary(data.summary)
      setSellerHealth(data.sellerHealth || [])
      setActiveAlerts(data.activeAlerts || [])
      setLowStockProducts(data.lowStockProducts || [])
      setRecentMovements(data.recentMovements || [])
    } catch (err) {
      console.error('[Admin Inventory] Overview fetch error:', err)
      toast.error('Failed to load inventory overview')
    } finally {
      setLoadingOverview(false)
    }
  }, [])

  const fetchLowStock = useCallback(async () => {
    setLoadingLowStock(true)
    try {
      const params = new URLSearchParams({
        page: String(lowStockPage),
        limit: '50',
        type: lowStockType,
      })
      const res = await fetch(`/api/admin/inventory/low-stock?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load low stock')
      const data = await res.json().catch(() => ({}))
      setLowStockList(data.products || [])
      setLowStockTotal(data.total || 0)
    } catch (err) {
      console.error('[Admin Inventory] Low stock fetch error:', err)
      toast.error('Failed to load low stock products')
    } finally {
      setLoadingLowStock(false)
    }
  }, [lowStockPage, lowStockType])

  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true)
    try {
      const params = new URLSearchParams({
        page: String(movementsPage),
        limit: '50',
      })
      if (movementTypeFilter !== 'all') params.set('type', movementTypeFilter)
      if (movementSellerSearch) params.set('sellerId', movementSellerSearch)
      const res = await fetch(`/api/admin/inventory/movements?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load movements')
      const data = await res.json().catch(() => ({}))
      setMovements(data.movements || [])
      setMovementsTotal(data.total || 0)
    } catch (err) {
      console.error('[Admin Inventory] Movements fetch error:', err)
      toast.error('Failed to load movement history')
    } finally {
      setLoadingMovements(false)
    }
  }, [movementsPage, movementTypeFilter, movementSellerSearch])

  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true)
    try {
      const params = new URLSearchParams({
        page: String(alertsPage),
        limit: '50',
        status: alertsStatus,
      })
      if (alertsType !== 'all') params.set('type', alertsType)
      if (alertsSellerSearch) params.set('sellerId', alertsSellerSearch)
      const res = await fetch(`/api/admin/inventory/alerts?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load alerts')
      const data = await res.json().catch(() => ({}))
      setAlerts(data.alerts || [])
      setAlertsTotal(data.total || 0)
      setAlertsTotalPages(data.totalPages || 1)
    } catch (err) {
      console.error('[Admin Inventory] Alerts fetch error:', err)
      toast.error('Failed to load inventory alerts')
    } finally {
      setLoadingAlerts(false)
    }
  }, [alertsPage, alertsStatus, alertsType, alertsSellerSearch])

  const fetchReorder = useCallback(async () => {
    setLoadingReorder(true)
    try {
      const params = new URLSearchParams({
        page: String(reorderPage),
        limit: '10',
      })
      if (reorderSellerSearch) params.set('sellerId', reorderSellerSearch)
      const res = await fetch(`/api/admin/inventory/reorder?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load reorder suggestions')
      const data = await res.json().catch(() => ({}))
      setReorderProducts(data.products || [])
      setReorderTotal(data.total || 0)
    } catch (err) {
      console.error('[Admin Inventory] Reorder fetch error:', err)
      toast.error('Failed to load reorder suggestions')
    } finally {
      setLoadingReorder(false)
    }
  }, [reorderPage, reorderSellerSearch])

  const fetchDeadStock = useCallback(async () => {
    setLoadingDeadStock(true)
    try {
      const params = new URLSearchParams({
        page: String(deadStockPage),
        limit: '10',
        daysThreshold: String(deadStockDays),
      })
      if (deadStockSellerSearch) params.set('sellerId', deadStockSellerSearch)
      const res = await fetch(`/api/admin/inventory/dead-stock?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load dead stock')
      const data = await res.json().catch(() => ({}))
      const list: DeadStockProduct[] = data.products || []
      setDeadStockProducts(list)
      setDeadStockTotal(data.total || 0)
      // Aggregate tied-up value across the current page (best-effort, since the
      // API does not return a platform-wide aggregate).
      const cost = list.reduce((s, p) => s + (p.stockValueCost || 0), 0)
      const selling = list.reduce((s, p) => s + (p.stockValue || 0), 0)
      setDeadStockTotals({ cost, selling })
    } catch (err) {
      console.error('[Admin Inventory] Dead stock fetch error:', err)
      toast.error('Failed to load dead stock products')
    } finally {
      setLoadingDeadStock(false)
    }
  }, [deadStockPage, deadStockDays, deadStockSellerSearch])

  const fetchValuation = useCallback(async () => {
    setLoadingValuation(true)
    try {
      const params = new URLSearchParams({
        page: String(valuationPage),
        limit: '10',
      })
      if (valuationSellerSearch) params.set('sellerId', valuationSellerSearch)
      const res = await fetch(`/api/admin/inventory/valuation?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load valuation')
      const data = await res.json().catch(() => ({}))
      setValuationProducts(data.products || [])
      setValuationTotal(data.total || 0)
      setValuationTotals(data.totals || null)
    } catch (err) {
      console.error('[Admin Inventory] Valuation fetch error:', err)
      toast.error('Failed to load inventory valuation')
    } finally {
      setLoadingValuation(false)
    }
  }, [valuationPage, valuationSellerSearch])

  const fetchForecast = useCallback(async () => {
    if (!forecastProductId.trim()) {
      toast.error('Enter a product ID to generate a forecast')
      return
    }
    setLoadingForecast(true)
    setForecastError(null)
    try {
      const params = new URLSearchParams({
        productId: forecastProductId.trim(),
        lookbackDays: String(forecastLookback),
        horizonDays: String(forecastHorizon),
      })
      const res = await fetch(`/api/admin/inventory/forecast?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})).catch(() => null)
        throw new Error(err?.message || 'Failed to generate forecast')
      }
      const data = await res.json().catch(() => ({}))
      setForecastData(data)
    } catch (err) {
      console.error('[Admin Inventory] Forecast fetch error:', err)
      setForecastError((err as Error).message)
      toast.error('Failed to generate forecast')
    } finally {
      setLoadingForecast(false)
    }
  }, [forecastProductId, forecastLookback, forecastHorizon])

  const fetchOverviewExtras = useCallback(async () => {
    try {
      const [reorderRes, deadRes] = await Promise.all([
        fetch('/api/admin/inventory/reorder?limit=1&page=1', { cache: 'no-store' }),
        fetch('/api/admin/inventory/dead-stock?daysThreshold=90&limit=1&page=1', { cache: 'no-store' }),
      ])
      const reorderJson = reorderRes.ok ? await reorderRes.json() : { total: 0 }
      const deadJson = deadRes.ok ? await deadRes.json() : { total: 0 }
      setOverviewExtra({
        reorderCount: reorderJson.total || 0,
        deadStockCount: deadJson.total || 0,
      })
    } catch (err) {
      console.error('[Admin Inventory] Overview extras fetch error:', err)
    }
  }, [])

  const handleAlertAction = useCallback(
    async (action: 'acknowledge' | 'resolve', alertId: string) => {
      try {
        const res = await fetch('/api/admin/inventory/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, alertId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) throw new Error(data.message || 'Action failed')
        toast.success(`Alert ${action === 'acknowledge' ? 'acknowledged' : 'resolved'}`)
        fetchAlerts()
      } catch (err) {
        toast.error((err as Error).message || `Failed to ${action} alert`)
      }
    },
    [fetchAlerts],
  )

  const handleBulkAlertAction = useCallback(
    async (action: 'bulk_acknowledge' | 'bulk_resolve') => {
      const ids = alerts
        .map((a) => a.alertId || a._id)
        .filter(Boolean) as string[]
      if (ids.length === 0) {
        toast.error('No alerts on this page to process')
        return
      }
      try {
        const res = await fetch('/api/admin/inventory/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, alertIds: ids }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.message || 'Bulk action failed')
        toast.success(data.message || `Bulk ${action} completed`)
        fetchAlerts()
      } catch (err) {
        toast.error((err as Error).message || `Bulk ${action} failed`)
      }
    },
    [alerts, fetchAlerts],
  )

  const handleSingleAdjust = useCallback(async () => {
    if (!adjustProductId.trim()) {
      toast.error('Product ID is required')
      return
    }
    const qtyNum = Number(adjustQuantity)
    if (!Number.isFinite(qtyNum)) {
      toast.error('Quantity must be a valid number')
      return
    }
    if (adjustMode === 'absolute' && qtyNum < 0) {
      toast.error('Absolute quantity cannot be negative')
      return
    }
    setSubmittingAdjust(true)
    try {
      const body: Record<string, unknown> = {
        productId: adjustProductId.trim(),
        reason: adjustReason || undefined,
        variantId: adjustVariantId.trim() || undefined,
      }
      if (adjustMode === 'absolute') body.newQuantity = qtyNum
      else body.delta = qtyNum
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || 'Adjust failed')
      toast.success(`Stock adjusted. New stock: ${data.newStock ?? '—'}`)
      setAdjustQuantity('')
      setAdjustReason('')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to adjust stock')
    } finally {
      setSubmittingAdjust(false)
    }
  }, [adjustProductId, adjustVariantId, adjustMode, adjustQuantity, adjustReason])

  const handleImport = useCallback(async () => {
    if (!importText.trim()) {
      toast.error('Paste CSV content or select a file first')
      return
    }
    setSubmittingImport(true)
    setImportResult(null)
    try {
      const rows = parseCsvToRows(importText)
      if (rows.length === 0) {
        setImportResult({
          success: false,
          message: 'No valid rows could be parsed. Expected columns: productId,newQuantity,variantId',
          updated: 0,
          failed: 0,
          errors: [],
        })
        toast.error('No valid rows could be parsed from the input')
        return
      }
      const url = importDryRun
        ? '/api/admin/inventory/import?dryRun=true'
        : '/api/admin/inventory/import'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          reason: importReason || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Import failed')
      setImportResult(data)
      toast.success(data.message || 'Import completed')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to import')
    } finally {
      setSubmittingImport(false)
    }
  }, [importText, importReason, importDryRun])

  const handleSweep = useCallback(async () => {
    setSweeping(true)
    setSweepResult(null)
    try {
      const res = await fetch('/api/admin/inventory/sweep', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Sweep failed')
      setSweepResult({ released: data.released || 0 })
      toast.success(`Released ${data.released || 0} expired reservation(s)`)
    } catch (err) {
      toast.error((err as Error).message || 'Sweep failed')
    } finally {
      setSweeping(false)
    }
  }, [])

  const openAdjustDialog = useCallback(
    (opts: {
      productId: string
      variantId?: string
      productName?: string
      currentStock?: number
      presetQty?: number
    }) => {
      setAdjustDialog({ open: true, ...opts })
    },
    [],
  )

  const handleAdjustDialogSuccess = useCallback(() => {
    // Refresh whichever tab opened the dialog
    if (activeTab === 'reorder') fetchReorder()
    else if (activeTab === 'dead-stock') fetchDeadStock()
  }, [activeTab, fetchReorder, fetchDeadStock])

  const downloadCsvTemplate = useCallback(() => {
    const csv = 'productId,newQuantity,variantId\n' +
      '507f1f77bcf86cd799439011,100,\n' +
      '507f1f77bcf86cd799439012,50,507f1f77bcf86cd799439099\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'inventory-import-template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Template downloaded')
  }, [])

  useEffect(() => {
    if (authenticated) fetchOverview()
  }, [authenticated, fetchOverview])

  useEffect(() => {
    if (authenticated && activeTab === 'low-stock') fetchLowStock()
  }, [authenticated, activeTab, fetchLowStock])

  useEffect(() => {
    if (authenticated && activeTab === 'movements') fetchMovements()
  }, [authenticated, activeTab, fetchMovements])

  useEffect(() => {
    if (authenticated && activeTab === 'alerts') fetchAlerts()
  }, [authenticated, activeTab, fetchAlerts])

  useEffect(() => {
    if (authenticated && activeTab === 'reorder') fetchReorder()
  }, [authenticated, activeTab, fetchReorder])

  useEffect(() => {
    if (authenticated && activeTab === 'dead-stock') fetchDeadStock()
  }, [authenticated, activeTab, fetchDeadStock])

  useEffect(() => {
    if (authenticated && activeTab === 'valuation') fetchValuation()
  }, [authenticated, activeTab, fetchValuation])

  useEffect(() => {
    if (authenticated && activeTab === 'overview') fetchOverviewExtras()
  }, [authenticated, activeTab, fetchOverviewExtras])

  // Preload active-alerts count for the tab badge as soon as the user lands
  // on the page (independent of which tab is currently selected).
  useEffect(() => {
    if (!authenticated) return
    fetch('/api/admin/inventory/alerts?status=active&limit=1&page=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.total === 'number') {
          setAlertsTotal(data.total)
        }
      })
      .catch(() => {})
  }, [authenticated])

  const handleExport = () => {
    // Trigger server-side CSV export
    window.location.href = '/api/admin/inventory/export'
    toast.success('Export started — check your downloads')
  }

  const lowStockTotalPages = Math.max(1, Math.ceil(lowStockTotal / 50))
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
            Platform-wide inventory oversight, seller health, and audit trail.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchOverview}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 max-w-5xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sellers">Seller Health</TabsTrigger>
          <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
          <TabsTrigger value="movements">Audit Log</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1">
            <Bell className="h-3.5 w-3.5" />
            Alerts
            {alertsTotal > 0 && activeTab !== 'alerts' && (
              <Badge className="ml-1 bg-red-500 text-white hover:bg-red-500 h-4 min-w-4 px-1 text-[10px] leading-none">
                {alertsTotal > 99 ? '99+' : alertsTotal}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reorder" className="gap-1">
            <ShoppingCart className="h-3.5 w-3.5" />
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
          <TabsTrigger value="forecast" className="gap-1">
            <LineChart className="h-3.5 w-3.5" />
            Forecast
          </TabsTrigger>
          <TabsTrigger value="adjust" className="gap-1">
            <Settings2 className="h-3.5 w-3.5" />
            Adjust / Import
          </TabsTrigger>
        </TabsList>

        {/* ===================== OVERVIEW TAB ===================== */}
        <TabsContent value="overview" className="space-y-4">
          {loadingOverview ? (
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
                    <p className="text-xs text-muted-foreground mt-1">{summary?.trackedSkus ?? 0} tracked</p>
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
                    <p className="text-xs text-muted-foreground mt-1">Across all sellers</p>
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
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock Value (Selling)</CardTitle>
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
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock Value (MRP)</CardTitle>
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
                    <p className="text-xs text-muted-foreground mt-1">Sellable across platform</p>
                  </CardContent>
                </Card>
              </div>

              {/* Extended KPIs: reorder / dead stock / cost value */}
              <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Reorder Alerts</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{overviewExtra.reorderCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">Products at/below reorder point</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Dead Stock (90d)</CardTitle>
                    <PackageX className="h-4 w-4 text-slate-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{overviewExtra.deadStockCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">No sales in last 90 days</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (Cost)</CardTitle>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtPrice(summary?.stockValueCost ?? 0, 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">At cost basis</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Active Alerts ({activeAlerts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activeAlerts.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                        No active alerts. All stock levels are healthy.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {activeAlerts.slice(0, 15).map((alert) => (
                          <div key={alert._id} className="flex items-start gap-3 p-2 rounded-md border">
                            <div className="flex-shrink-0 mt-0.5">
                              {alert.type === 'out_of_stock' ? (
                                <PackageX className="h-4 w-4 text-red-500" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{alert.productName}</p>
                              <p className="text-xs text-muted-foreground">
                                {alert.sellerName} · {alert.message}
                              </p>
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
                      Recent Movements
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {recentMovements.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No movements yet
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {recentMovements.map((m) => (
                          <div key={m._id} className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {movementTypeBadge(m.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.productName}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.sellerName || 'Unknown seller'} · {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                              </p>
                              <p className="text-[10px] text-muted-foreground/70">{formatDate(m.createdAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Top lowest stock products */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-red-500" />
                    Top 10 Critical Stock Products
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {lowStockProducts.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                      No critical stock issues!
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Seller</TableHead>
                            <TableHead className="text-right">Stock</TableHead>
                            <TableHead className="text-right">Threshold</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lowStockProducts.map((p) => (
                            <TableRow key={p._id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                    {p.imageUrl && (
                                      <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                                    )}
                                  </div>
                                  <p className="text-sm font-medium truncate max-w-[220px]">{p.name}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{p.sellerName}</TableCell>
                              <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{p.lowStockThreshold}</TableCell>
                              <TableCell>{statusBadge(p.status)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===================== SELLER HEALTH TAB ===================== */}
        <TabsContent value="sellers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Store className="h-4 w-4 text-primary" />
                Seller Inventory Health
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingOverview ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sellerHealth.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  No seller inventory data available
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Seller</TableHead>
                        <TableHead className="text-right">Total SKUs</TableHead>
                        <TableHead className="text-right">Low Stock</TableHead>
                        <TableHead className="text-right">Out of Stock</TableHead>
                        <TableHead className="text-right">Total Units</TableHead>
                        <TableHead className="text-right">Stock Value</TableHead>
                        <TableHead>Health</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sellerHealth.map((s) => {
                        const criticalCount = s.lowStockSkus + s.outOfStockSkus
                        const healthRatio = s.totalSkus > 0 ? criticalCount / s.totalSkus : 0
                        const health = healthRatio === 0 ? 'healthy' : healthRatio < 0.2 ? 'fair' : healthRatio < 0.5 ? 'warning' : 'critical'
                        return (
                          <TableRow key={s.sellerId || s.sellerName}>
                            <TableCell className="font-medium">{s.sellerName || s.sellerId || 'Unknown'}</TableCell>
                            <TableCell className="text-right">{s.totalSkus}</TableCell>
                            <TableCell className="text-right text-amber-600 dark:text-amber-400">{s.lowStockSkus}</TableCell>
                            <TableCell className="text-right text-red-600 dark:text-red-400">{s.outOfStockSkus}</TableCell>
                            <TableCell className="text-right">{s.totalUnits}</TableCell>
                            <TableCell className="text-right font-medium">{fmtPrice(s.stockValue, 0)}</TableCell>
                            <TableCell>
                              {health === 'healthy' && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Healthy</Badge>}
                              {health === 'fair' && <Badge className="bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300">Fair</Badge>}
                              {health === 'warning' && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Warning</Badge>}
                              {health === 'critical' && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Critical</Badge>}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== LOW STOCK TAB ===================== */}
        <TabsContent value="low-stock" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold">Low & Out of Stock Products</h3>
                  <p className="text-xs text-muted-foreground">All sellers' inventory that needs attention</p>
                </div>
                <Select value={lowStockType} onValueChange={(v) => { setLowStockType(v); setLowStockPage(1) }}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Issues</SelectItem>
                    <SelectItem value="low_stock">Low Stock Only</SelectItem>
                    <SelectItem value="out_of_stock">Out of Stock Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loadingLowStock ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : lowStockList.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                  No low stock products. Inventory is healthy.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Product</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Threshold</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStockList.map((p) => (
                        <TableRow key={p._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                {p.imageUrl && (
                                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                                )}
                              </div>
                              <p className="text-sm font-medium truncate max-w-[200px]">{p.name}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{p.sellerName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.category}</TableCell>
                          <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400">{p.reservedStock}</TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{p.availableStock}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.lowStockThreshold}</TableCell>
                          <TableCell>{statusBadge(p.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {lowStockTotal > 50 && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(lowStockPage - 1) * 50 + 1}–{Math.min(lowStockPage * 50, lowStockTotal)} of {lowStockTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={lowStockPage <= 1} onClick={() => setLowStockPage((p) => p - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground">Page {lowStockPage} / {lowStockTotalPages}</span>
                <Button size="sm" variant="outline" disabled={lowStockPage >= lowStockTotalPages} onClick={() => setLowStockPage((p) => p + 1)}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== MOVEMENTS TAB ===================== */}
        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold">Inventory Audit Log</h3>
                  <p className="text-xs text-muted-foreground">Complete audit trail of all stock changes across the platform</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Seller ID / name..."
                    value={movementSellerSearch}
                    onChange={(e) => { setMovementSellerSearch(e.target.value); setMovementsPage(1) }}
                    className="w-full sm:w-48 h-9"
                  />
                  <Select value={movementTypeFilter} onValueChange={(v) => { setMovementTypeFilter(v); setMovementsPage(1) }}>
                    <SelectTrigger className="w-full sm:w-44 h-9">
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
                        <TableHead className="min-w-[180px]">Product</TableHead>
                        <TableHead>Seller</TableHead>
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
                              <p className="text-sm font-medium truncate max-w-[180px]">{m.productName}</p>
                              {m.variantSku && (
                                <p className="text-xs text-muted-foreground font-mono">{m.variantSku}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.sellerName || '—'}</TableCell>
                          <TableCell className={cn(
                            'text-right font-semibold font-mono',
                            m.quantityChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                          )}>
                            {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{m.stockBefore}</TableCell>
                          <TableCell className="text-right font-medium">{m.stockAfter}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
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
                <Button size="sm" variant="outline" disabled={movementsPage <= 1} onClick={() => setMovementsPage((p) => p - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground">Page {movementsPage} / {movementsTotalPages}</span>
                <Button size="sm" variant="outline" disabled={movementsPage >= movementsTotalPages} onClick={() => setMovementsPage((p) => p + 1)}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== ALERTS TAB ===================== */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    Inventory Alerts
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {alertsTotal} alert(s) match the current filter
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={fetchAlerts}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkAlertAction('bulk_acknowledge')}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Ack All
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkAlertAction('bulk_resolve')}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Resolve All
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={alertsStatus} onValueChange={(v) => { setAlertsStatus(v); setAlertsPage(1) }}>
                  <SelectTrigger className="w-full sm:w-40 h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={alertsType} onValueChange={(v) => { setAlertsType(v); setAlertsPage(1) }}>
                  <SelectTrigger className="w-full sm:w-40 h-9">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="low_stock">Low Stock</SelectItem>
                    <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                    <SelectItem value="reorder">Reorder</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Seller ID / name..."
                  value={alertsSellerSearch}
                  onChange={(e) => { setAlertsSellerSearch(e.target.value); setAlertsPage(1) }}
                  className="w-full sm:w-48 h-9"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loadingAlerts ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  No alerts in this category.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Current Stock</TableHead>
                        <TableHead className="text-right">Threshold</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alerts.map((a) => (
                        <TableRow key={a._id}>
                          <TableCell className="text-sm font-medium truncate max-w-[200px]">{a.productName || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{a.sellerName || '—'}</TableCell>
                          <TableCell>{alertTypeBadge(a.type)}</TableCell>
                          <TableCell className="text-right font-semibold">{a.currentStock ?? '—'}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{a.threshold ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{a.message || '—'}</TableCell>
                          <TableCell>{alertStatusBadge(a.status)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(a.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={a.status !== 'active'} onClick={() => handleAlertAction('acknowledge', a.alertId || a._id)}>
                                Ack
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={a.status === 'resolved'} onClick={() => handleAlertAction('resolve', a.alertId || a._id)}>
                                Resolve
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

          {alertsTotal > 50 && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(alertsPage - 1) * 50 + 1}–{Math.min(alertsPage * 50, alertsTotal)} of {alertsTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={alertsPage <= 1} onClick={() => setAlertsPage((p) => p - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground">Page {alertsPage} / {alertsTotalPages}</span>
                <Button size="sm" variant="outline" disabled={alertsPage >= alertsTotalPages} onClick={() => setAlertsPage((p) => p + 1)}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== REORDER TAB ===================== */}
        <TabsContent value="reorder" className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    Reorder Suggestions
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Products whose stock has reached or fallen below their reorder point
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Seller ID / name..."
                    value={reorderSellerSearch}
                    onChange={(e) => { setReorderSellerSearch(e.target.value); setReorderPage(1) }}
                    className="w-full sm:w-48 h-9"
                  />
                  <Button size="sm" variant="outline" onClick={fetchReorder}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Products Needing Reorder</p>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{reorderTotal}</div>
                <p className="text-xs text-muted-foreground mt-1">Stock has reached or fallen below the reorder point</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Sellers Affected (this page)</p>
                <div className="text-2xl font-bold">
                  {new Set(reorderProducts.map((p) => p.sellerId).filter(Boolean)).size}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Unique sellers on the current page</p>
              </CardContent>
            </Card>
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
                  No products need reordering right now.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">Reorder Pt</TableHead>
                        <TableHead className="text-right">Reorder Qty</TableHead>
                        <TableHead className="text-right">Safety</TableHead>
                        <TableHead className="text-right">Shortfall</TableHead>
                        <TableHead className="text-right">Suggested</TableHead>
                        <TableHead className="text-right">Lead (d)</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reorderProducts.map((p) => (
                        <TableRow key={p._id}>
                          <TableCell className="text-sm font-medium truncate max-w-[180px]">{p.name}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{p.sku || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.sellerName || '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">{p.stock}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.reorderPoint}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.reorderQuantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.safetyStock}</TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400">{p.shortfall}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">{p.suggestedReorderQty}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.leadTimeDays || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{p.supplier || '—'}</TableCell>
                          <TableCell>
                            <Badge className={cn(
                              p.status === 'out_of_stock' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                              p.status === 'reorder' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
                              'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                            )}>
                              {p.status === 'out_of_stock' ? 'OOS' : p.status === 'reorder' ? 'Reorder' : 'In Stock'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => openAdjustDialog({
                                productId: p._id,
                                productName: p.name,
                                currentStock: p.stock,
                                presetQty: p.suggestedReorderQty,
                              })}
                            >
                              Adjust
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

          {reorderTotal > 10 && (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(reorderPage - 1) * 10 + 1}–{Math.min(reorderPage * 10, reorderTotal)} of {reorderTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={reorderPage <= 1} onClick={() => setReorderPage((p) => p - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground">Page {reorderPage} / {reorderTotalPages}</span>
                <Button size="sm" variant="outline" disabled={reorderPage >= reorderTotalPages} onClick={() => setReorderPage((p) => p + 1)}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== DEAD STOCK TAB ===================== */}
        <TabsContent value="dead-stock" className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <PackageX className="h-4 w-4 text-primary" />
                    Dead Stock Analysis
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Products with stock but no sales in the last {deadStockDays} days
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Seller ID / name..."
                    value={deadStockSellerSearch}
                    onChange={(e) => { setDeadStockSellerSearch(e.target.value); setDeadStockPage(1) }}
                    className="w-full sm:w-48 h-9"
                  />
                  <Button size="sm" variant="outline" onClick={fetchDeadStock}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Threshold:</span>
                {[30, 60, 90, 180, 365].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={deadStockDays === d ? 'default' : 'outline'}
                    className="h-7 px-2 text-xs"
                    onClick={() => { setDeadStockDays(d); setDeadStockPage(1) }}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Dead-Stock Products</p>
                <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{deadStockTotal}</div>
                <p className="text-xs text-muted-foreground mt-1">No sales in last {deadStockDays} days</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Tied-Up Value (Cost, this page)</p>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{fmtPrice(deadStockTotals.cost, 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Capital locked in unsold stock</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Tied-Up Value (Selling, this page)</p>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{fmtPrice(deadStockTotals.selling, 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Potential revenue if sold</p>
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
                  No dead stock found for this threshold.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead className="text-right">Current Stock</TableHead>
                        <TableHead className="text-right">Value (Cost)</TableHead>
                        <TableHead className="text-right">Value (Selling)</TableHead>
                        <TableHead>Last Sale Date</TableHead>
                        <TableHead className="text-right">Days Since</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deadStockProducts.map((p) => (
                        <TableRow key={p._id}>
                          <TableCell className="text-sm font-medium truncate max-w-[180px]">{p.name}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{p.sku || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.sellerName || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                          <TableCell className="text-right text-red-600 dark:text-red-400">{fmtPrice(p.stockValueCost || 0, 0)}</TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400">{fmtPrice(p.stockValue || 0, 0)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateOnly(p.lastSaleDate)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{p.daysSinceLastSale ?? '—'}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs text-red-600 dark:text-red-400"
                              onClick={() => openAdjustDialog({
                                productId: p._id,
                                productName: p.name,
                                currentStock: p.stock,
                                presetQty: 0,
                              })}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Clear
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
                <Button size="sm" variant="outline" disabled={deadStockPage <= 1} onClick={() => setDeadStockPage((p) => p - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground">Page {deadStockPage} / {deadStockTotalPages}</span>
                <Button size="sm" variant="outline" disabled={deadStockPage >= deadStockTotalPages} onClick={() => setDeadStockPage((p) => p + 1)}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== VALUATION TAB ===================== */}
        <TabsContent value="valuation" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Inventory Valuation
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Per-product stock value at cost, selling price, and MRP
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Seller ID / name..."
                    value={valuationSellerSearch}
                    onChange={(e) => { setValuationSellerSearch(e.target.value); setValuationPage(1) }}
                    className="w-full sm:w-48 h-9"
                  />
                  <Button size="sm" variant="outline" onClick={fetchValuation}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (Cost)</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtPrice(valuationTotals?.stockValueCost ?? 0, 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">At cost basis</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (Selling)</CardTitle>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{fmtPrice(valuationTotals?.stockValueSelling ?? 0, 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">At selling price</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (MRP)</CardTitle>
                <Boxes className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmtPrice(valuationTotals?.stockValueMrp ?? 0, 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">At maximum retail price</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Potential Profit</CardTitle>
                <Sparkles className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtPrice(valuationTotals?.potentialProfit ?? 0, 0)}</div>
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
                  No valuation data available.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Cost Price</TableHead>
                        <TableHead className="text-right">Selling Price</TableHead>
                        <TableHead className="text-right">MRP</TableHead>
                        <TableHead className="text-right">Value (Cost)</TableHead>
                        <TableHead className="text-right">Value (Selling)</TableHead>
                        <TableHead className="text-right">Potential Profit</TableHead>
                        <TableHead>Warehouse</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valuationProducts.map((p) => (
                        <TableRow key={p._id}>
                          <TableCell className="text-sm font-medium truncate max-w-[180px]">{p.name}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{p.sku || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.sellerName || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmtPrice(p.costPrice, 0)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmtPrice(p.sellingPrice, 0)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{fmtPrice(p.mrp, 0)}</TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">{fmtPrice(p.stockValueCost, 0)}</TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400 font-medium">{fmtPrice(p.stockValueSelling, 0)}</TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{fmtPrice(p.potentialProfit, 0)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{p.warehouseLocation || '—'}</TableCell>
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
                <Button size="sm" variant="outline" disabled={valuationPage <= 1} onClick={() => setValuationPage((p) => p - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground">Page {valuationPage} / {valuationTotalPages}</span>
                <Button size="sm" variant="outline" disabled={valuationPage >= valuationTotalPages} onClick={() => setValuationPage((p) => p + 1)}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== FORECAST TAB ===================== */}
        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <LineChart className="h-4 w-4 text-primary" />
                    Demand Forecast
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Project future demand from the moving average of recent daily sales
                  </p>
                </div>
              </div>
              <div className="flex flex-col lg:flex-row gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Paste product ID (MongoDB ObjectId)..."
                    value={forecastProductId}
                    onChange={(e) => setForecastProductId(e.target.value)}
                    className="pl-9 h-9 font-mono text-xs"
                  />
                </div>
                <Select value={String(forecastLookback)} onValueChange={(v) => setForecastLookback(Number(v))}>
                  <SelectTrigger className="w-full sm:w-36 h-9">
                    <SelectValue placeholder="Lookback" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Lookback: 7d</SelectItem>
                    <SelectItem value="30">Lookback: 30d</SelectItem>
                    <SelectItem value="60">Lookback: 60d</SelectItem>
                    <SelectItem value="90">Lookback: 90d</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={String(forecastHorizon)} onValueChange={(v) => setForecastHorizon(Number(v))}>
                  <SelectTrigger className="w-full sm:w-36 h-9">
                    <SelectValue placeholder="Horizon" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Horizon: 7d</SelectItem>
                    <SelectItem value="14">Horizon: 14d</SelectItem>
                    <SelectItem value="30">Horizon: 30d</SelectItem>
                    <SelectItem value="60">Horizon: 60d</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={fetchForecast} disabled={loadingForecast || !forecastProductId.trim()}>
                  {loadingForecast ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  Generate Forecast
                </Button>
              </div>
            </CardContent>
          </Card>

          {forecastError && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3 p-3 rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
                  <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">Forecast failed</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-all">{forecastError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!forecastData && !forecastError && !loadingForecast && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-sm text-muted-foreground">
                  <LineChart className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  Search for a product to generate a demand forecast.
                </div>
              </CardContent>
            </Card>
          )}

          {loadingForecast && (
            <Card>
              <CardContent className="py-12">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              </CardContent>
            </Card>
          )}

          {forecastData && !loadingForecast && (
            <>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Product ID</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm font-mono font-bold break-all">{forecastData.productId}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Current Stock</CardTitle>
                    <Boxes className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{forecastData.currentStock}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Daily Avg Sales</CardTitle>
                    <TrendingUp className="h-4 w-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{forecastData.dailyAvgSales}</div>
                    <p className="text-xs text-muted-foreground mt-1">units / day (last {forecastLookback}d)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Projected Demand</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{forecastData.projectedDemand}</div>
                    <p className="text-xs text-muted-foreground mt-1">units over next {forecastHorizon}d</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Days of Cover</CardTitle>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {forecastData.daysOfCover === null ? '∞' : forecastData.daysOfCover}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {forecastData.daysOfCover === null ? 'No sales velocity' : 'Stock will last ~ days'}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Recommended Reorder Qty</CardTitle>
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{forecastData.recommendedReorderQty}</div>
                    <p className="text-xs text-muted-foreground mt-1">units to reorder now</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <LineChart className="h-4 w-4 text-primary" />
                    Daily Sales History (last {forecastLookback} days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {forecastData.history.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No sales recorded in the lookback window.
                    </div>
                  ) : (
                    <SalesHistoryChart history={forecastData.history} />
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===================== ADJUST / IMPORT TAB ===================== */}
        <TabsContent value="adjust" className="space-y-4">
          {/* SECTION 1 — Single adjustment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-primary" />
                Single Stock Adjustment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adj-product-id" className="text-xs">Product ID *</Label>
                  <Input
                    id="adj-product-id"
                    value={adjustProductId}
                    onChange={(e) => setAdjustProductId(e.target.value)}
                    placeholder="MongoDB ObjectId"
                    className="font-mono text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adj-variant-id" className="text-xs">Variant ID (optional)</Label>
                  <Input
                    id="adj-variant-id"
                    value={adjustVariantId}
                    onChange={(e) => setAdjustVariantId(e.target.value)}
                    placeholder="Leave blank for parent"
                    className="font-mono text-xs h-9"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={adjustMode === 'absolute' ? 'default' : 'outline'} onClick={() => setAdjustMode('absolute')}>
                  Absolute (newQuantity)
                </Button>
                <Button type="button" size="sm" variant={adjustMode === 'delta' ? 'default' : 'outline'} onClick={() => setAdjustMode('delta')}>
                  Delta (+/- N)
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adj-qty-input" className="text-xs">
                    {adjustMode === 'absolute' ? 'New absolute quantity' : 'Delta (negative = decrease)'}
                  </Label>
                  <Input
                    id="adj-qty-input"
                    type="number"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(e.target.value)}
                    placeholder={adjustMode === 'absolute' ? 'e.g. 50' : 'e.g. -10 or +10'}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adj-reason-input" className="text-xs">Reason (optional)</Label>
                  <Input
                    id="adj-reason-input"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Damaged in warehouse"
                    className="h-9"
                  />
                </div>
              </div>
              <Button onClick={handleSingleAdjust} disabled={submittingAdjust || !adjustProductId.trim() || adjustQuantity === ''}>
                {submittingAdjust && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Adjust Stock
              </Button>
            </CardContent>
          </Card>

          {/* SECTION 2 — Bulk CSV import */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4 text-primary" />
                Bulk CSV Import
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">
                  Columns: <span className="font-mono">productId,newQuantity,variantId</span> (header optional)
                </p>
                <Button size="sm" variant="outline" onClick={downloadCsvTemplate}>
                  <FileText className="h-4 w-4 mr-1" /> Download Template
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-file" className="text-xs">Upload CSV file</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      setImportText(String(reader.result || ''))
                    }
                    reader.readAsText(f)
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-text" className="text-xs">Or paste CSV content</Label>
                <Textarea
                  id="import-text"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={'productId,newQuantity,variantId\n507f1f77bcf86cd799439011,100,\n507f1f77bcf86cd799439012,50,507f1f77bcf86cd799439099'}
                  className="font-mono text-xs min-h-24"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="import-reason" className="text-xs">Reason (optional)</Label>
                  <Input
                    id="import-reason"
                    value={importReason}
                    onChange={(e) => setImportReason(e.target.value)}
                    placeholder="e.g. Monthly stock-take reconciliation"
                    className="h-9"
                  />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Checkbox
                    id="import-dry-run"
                    checked={importDryRun}
                    onCheckedChange={(v) => setImportDryRun(v === true)}
                  />
                  <Label htmlFor="import-dry-run" className="text-xs cursor-pointer">
                    Dry run (validate without applying)
                  </Label>
                </div>
              </div>
              <Button onClick={handleImport} disabled={submittingImport || !importText.trim()}>
                {submittingImport && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {importDryRun ? 'Dry Run Import' : 'Import'}
              </Button>

              {importResult && (
                <div className={cn(
                  'rounded-md border p-3 text-sm',
                  importResult.success
                    ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800'
                    : 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800',
                )}>
                  <div className="flex items-start gap-2">
                    {importResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        {importResult.dryRun ? 'Dry run · ' : ''}{importResult.updated} updated, {importResult.failed} failed
                        {importResult.rowCount !== undefined && ` · ${importResult.rowCount} rows parsed`}
                      </p>
                      {importResult.message && (
                        <p className="text-xs text-muted-foreground mt-0.5">{importResult.message}</p>
                      )}
                      {importResult.errors && importResult.errors.length > 0 && (
                        <ul className="text-xs text-muted-foreground mt-2 max-h-32 overflow-y-auto space-y-0.5">
                          {importResult.errors.slice(0, 20).map((e, i) => (
                            <li key={i} className="font-mono break-all">· {e}</li>
                          ))}
                          {importResult.errors.length > 20 && (
                            <li className="italic">… and {importResult.errors.length - 20} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 3 — Maintenance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="h-4 w-4 text-primary" />
                Maintenance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium">Sweep Expired Reservations</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Releases stock that was reserved during checkout but never confirmed
                    (e.g. abandoned carts). Safe to run repeatedly — only reservations whose
                    expiry has passed are released.
                  </p>
                </div>
                <Button onClick={handleSweep} disabled={sweeping} variant="outline">
                  {sweeping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Sweep Now
                </Button>
              </div>
              {sweepResult && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-3 text-sm flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Released <span className="font-bold text-emerald-700 dark:text-emerald-300">{sweepResult.released}</span> expired reservation(s).
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reusable Stock Adjustment Dialog (opened from Reorder / Dead Stock tabs) */}
      <StockAdjustmentDialog
        open={adjustDialog.open}
        onOpenChange={(v) => setAdjustDialog((prev) => ({ ...prev, open: v }))}
        productId={adjustDialog.productId}
        variantId={adjustDialog.variantId}
        productName={adjustDialog.productName}
        currentStock={adjustDialog.currentStock}
        presetQty={adjustDialog.presetQty}
        onSuccess={handleAdjustDialogSuccess}
      />
    </div>
  )
}
