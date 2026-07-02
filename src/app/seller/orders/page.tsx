'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fmtPrice } from '@/lib/currency'
import { STATUS_CONFIG, formatVariant, type Order, type OrderItem, type OrderStatus, type OrderStatusLog, type DeliveryAssignment } from '@/lib/order-types'
import { normalizeStatus } from '@/lib/order-state-machine'
import {
  ShoppingCart,
  Search,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  Truck,
  UserCheck,
  Clock,
  Package,
  MapPin,
  Phone,
  Mail,
  RotateCcw,
  XCircle,
  Image as ImageIcon,
  AlertTriangle,
  Bike,
  ShieldCheck,
  Navigation,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AdminModal from '@/components/admin/admin-modal'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { useIsMobile } from '@/hooks/use-mobile'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface DeliveryBoy {
  _id: string
  name: string
  mobile: string
  vehicleType?: string
  vehicleNumber?: string
  profileImage?: string | { url?: string; publicId?: string }
  isAvailable?: boolean
}

interface OrderStats {
  total: number
  pending: number
  processing: number
  delivered: number
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
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
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

/* ------------------------------------------------------------------ */
/*  Status Icon Mapping                                                 */
/* ------------------------------------------------------------------ */

const STATUS_ICONS: Record<string, typeof Clock> = {
  'clock': Clock,
  'package': Package,
  'truck': Truck,
  'check-circle': CheckCircle2,
  'check-circle-2': CheckCircle2,
  'x-circle': XCircle,
  'alert-triangle': AlertTriangle,
  'rotate-ccw': RotateCcw,
}

function StatusIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = STATUS_ICONS[icon] || Clock
  return <Icon className={className} />
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                 */
/* ------------------------------------------------------------------ */

export default function SellerOrders() {
  const { authenticated, loading } = useSellerAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/seller')
    }
  }, [authenticated, loading, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  return <OrdersContent />
}

/* ------------------------------------------------------------------ */
/*  Orders Content                                                      */
/* ------------------------------------------------------------------ */

function OrdersContent() {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const router = useRouter()
  const { logout } = useSellerAuth()

  const [orders, setOrders] = useState<Order[]>([])
  const [totalOrders, setTotalOrders] = useState(0)
  const [stats, setStats] = useState<OrderStats>({ total: 0, pending: 0, processing: 0, delivered: 0 })
  const [loadingData, setLoadingData] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Order detail dialog
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailDeliveryBoys, setDetailDeliveryBoys] = useState<DeliveryBoy[]>([])
  const [detailStatusLogs, setDetailStatusLogs] = useState<OrderStatusLog[]>([])

  // Assign delivery boy dialog
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignOrderItem, setAssignOrderItem] = useState<OrderItem | null>(null)
  const [assignOrderId, setAssignOrderId] = useState<string>('')
  const [assigning, setAssigning] = useState(false)
  // Track WHICH delivery boy is being assigned (so only that card shows the
  // spinner — not all cards). Empty string = none in progress.
  const [assigningBoyId, setAssigningBoyId] = useState<string>('')
  const [assignDeliveryBoys, setAssignDeliveryBoys] = useState<DeliveryBoy[]>([])
  const [assignLoadingBoys, setAssignLoadingBoys] = useState(false)
  // Track whether this is a pickup assignment or delivery assignment
  const [assignType, setAssignType] = useState<'delivery' | 'pickup'>('delivery')

  // View assigned delivery boy modal (shows the currently-assigned delivery
  // boy details in a reusable AdminModal, with a "Change" option)
  const [viewAssignedOpen, setViewAssignedOpen] = useState(false)
  const [viewAssignedItem, setViewAssignedItem] = useState<OrderItem | null>(null)
  const [viewAssignedOrderId, setViewAssignedOrderId] = useState<string>('')

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const itemsPerPage = 10

  /* ---------------------------------------------------------------- */
  /*  Fetch Orders                                                      */
  /* ---------------------------------------------------------------- */

  const fetchOrders = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/seller/orders?${params.toString()}`)

      if (res.status === 401 || res.status === 403) {
        await logout()
        router.replace('/seller')
        return
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to fetch orders')
      }

      const data = await res.json()
      const orderList: Order[] = data.orders || []

      setOrders(orderList)
      setTotalOrders(data.total || 0)

      // Compute stats from the full list (or from response if available)
      const computedStats: OrderStats = { total: data.total || 0, pending: 0, processing: 0, delivered: 0 }
      // The list API may not return all orders, so we compute from what we get
      // But we can get the stats from the first-page data for a quick view
      for (const order of orderList) {
        for (const item of order.items) {
          const s = normalizeStatus(item.status)
          if (s === 'Pending') computedStats.pending++
          if (s === 'Processing') computedStats.processing++
          if (s === 'Delivered') computedStats.delivered++
        }
      }
      setStats(prev => ({ ...computedStats, total: data.total || prev.total }))
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Unauthorized') || err.message.includes('blocked'))) {
        return
      }
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load orders. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, statusFilter, currentPage, logout, router, toast])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter])

  const totalPages = Math.max(1, Math.ceil(totalOrders / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Fetch Order Detail                                                */
  /* ---------------------------------------------------------------- */

  const fetchOrderDetail = useCallback(async (orderId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/seller/orders?orderId=${orderId}`)
      if (!res.ok) throw new Error('Failed to fetch order detail')
      const data = await res.json()
      setSelectedOrder(data.order)
      setDetailDeliveryBoys(data.deliveryBoys || [])
      setDetailStatusLogs(data.statusLogs || [])
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load order details',
        variant: 'destructive',
      })
    } finally {
      setDetailLoading(false)
    }
  }, [toast])

  /* ---------------------------------------------------------------- */
  /*  Order Actions                                                     */
  /* ---------------------------------------------------------------- */

  const handleAction = useCallback(async (
    actionKey: string,
    action: string,
    orderId: string,
    orderItemId?: string,
    deliveryBoyId?: string,
    reason?: string,
  ) => {
    setActionLoading(prev => ({ ...prev, [actionKey]: true }))
    try {
      const res = await fetch('/api/seller/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, orderId, orderItemId, deliveryBoyId, reason }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')

      toast({
        title: 'Success',
        description: data.message || 'Order updated successfully',
      })

      // Refresh data
      fetchOrders()
      if (detailOpen && selectedOrder?.orderId === orderId) {
        fetchOrderDetail(orderId)
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update order',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }))
    }
  }, [toast, fetchOrders, detailOpen, selectedOrder, fetchOrderDetail])

  /* ---------------------------------------------------------------- */
  /*  Assign Delivery Boy                                               */
  /* ---------------------------------------------------------------- */

  const handleAssignDeliveryBoy = useCallback(async (deliveryBoyId: string) => {
    if (!assignOrderItem || !assignOrderId) return
    setAssigning(true)
    setAssigningBoyId(deliveryBoyId)
    try {
      const res = await fetch('/api/seller/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          orderId: assignOrderId,
          orderItemId: assignOrderItem._id || assignOrderItem.orderId,
          deliveryBoyId,
          type: assignType,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Assignment failed')

      toast({
        title: 'Delivery Boy Assigned',
        description: `${deliveryBoyId} has been assigned successfully.`,
      })

      setAssignOpen(false)
      setAssignOrderItem(null)
      setAssignOrderId('')
      setAssigningBoyId('')
      fetchOrders()
      if (detailOpen && selectedOrder?.orderId === assignOrderId) {
        fetchOrderDetail(assignOrderId)
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to assign delivery boy',
        variant: 'destructive',
      })
    } finally {
      setAssigning(false)
      setAssigningBoyId('')
    }
  }, [assignOrderItem, assignOrderId, toast, fetchOrders, detailOpen, selectedOrder, fetchOrderDetail])

  /* ---------------------------------------------------------------- */
  /*  Open Detail                                                       */
  /* ---------------------------------------------------------------- */

  const openDetail = useCallback((order: Order) => {
    setSelectedOrder(order)
    setDetailOpen(true)
    fetchOrderDetail(order.orderId)
  }, [fetchOrderDetail])

  /* ---------------------------------------------------------------- */
  /*  Open Assign Dialog — fetches delivery boys independently           */
  /* ---------------------------------------------------------------- */

  const openAssignDialog = useCallback(async (orderId: string, item: OrderItem) => {
    setAssignOrderId(orderId)
    setAssignOrderItem(item)
    // Determine assignment type based on item status
    const itemStatus = normalizeStatus(item.status)
    const isPickup = itemStatus === 'Return Approved' || itemStatus === 'Return Requested'
    setAssignType(isPickup ? 'pickup' : 'delivery')
    setAssignOpen(true)
    setAssignLoadingBoys(true)

    // Fetch available delivery boys from the dedicated endpoint
    try {
      const res = await fetch('/api/seller/delivery-boys')
      if (res.ok) {
        const data = await res.json()
        setAssignDeliveryBoys(data.deliveryBoys || [])
      } else {
        setAssignDeliveryBoys([])
      }
    } catch {
      setAssignDeliveryBoys([])
    } finally {
      setAssignLoadingBoys(false)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Open "View Assigned Delivery Boy" Modal                           */
  /*  Shows the currently-assigned delivery boy's details in a reusable */
  /*  AdminModal, with a "Change Delivery Boy" option.                  */
  /* ---------------------------------------------------------------- */
  const openViewAssignedModal = useCallback((orderId: string, item: OrderItem) => {
    setViewAssignedOrderId(orderId)
    setViewAssignedItem(item)
    setViewAssignedOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Get seller items from an order                                    */
  /* ---------------------------------------------------------------- */

  const getSellerItems = useCallback((order: Order): OrderItem[] => {
    return order.items || []
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Get primary status for an order (worst/earliest status)           */
  /* ---------------------------------------------------------------- */

  const getPrimaryStatus = useCallback((order: Order): OrderStatus => {
    const items = getSellerItems(order)
    if (items.length === 0) return normalizeStatus(order.status)
    // Return the most "active" status (lowest in the pipeline)
    const priority: OrderStatus[] = [
      'Pending', 'Processing', 'Shipped', 'Out for Delivery',
      'Return Requested', 'Return Approved', 'Out for Pickup',
      'Delivered', 'Cancelled', 'Not Delivered',
      'Return Cancelled', 'Return Completed',
    ]
    for (const s of priority) {
      if (items.some(item => normalizeStatus(item.status) === s)) return s
    }
    return normalizeStatus(items[0].status)
  }, [getSellerItems])

  /* ---------------------------------------------------------------- */
  /*  Render Action Buttons for an order item                           */
  /* ---------------------------------------------------------------- */

  const renderActions = useCallback((order: Order, item: OrderItem) => {
    const status = normalizeStatus(item.status)
    const itemId = item._id || item.orderId
    const isLoading = (key: string) => !!actionLoading[key]

    switch (status) {
      case 'Pending':
        return (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs gap-1"
            disabled={isLoading(`accept-${itemId}`)}
            onClick={() => handleAction(`accept-${itemId}`, 'processing', order.orderId, itemId)}
          >
            {isLoading(`accept-${itemId}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Accept
          </Button>
        )
      case 'Processing': {
        // ── Meesho/Flipkart/Amazon flow: Assign delivery boy FIRST, then ship ──
        // If no delivery boy is assigned yet → show "Assign Delivery Boy" as the
        //   ONLY primary action. Shipping is blocked until assignment is done.
        // If a delivery boy IS assigned → show "Ship Order" (enabled) + a
        //   dropdown to change the assigned delivery boy.
        const hasDeliveryBoy = !!item.deliveryBoyId
        if (!hasDeliveryBoy) {
          return (
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white h-7 text-xs gap-1.5 shadow-sm"
              onClick={() => openAssignDialog(order.orderId, item)}
            >
              <UserCheck className="h-3 w-3" />
              Assign Delivery Boy
            </Button>
          )
        }
        // Delivery boy assigned — Ship is now available
        return (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white h-7 text-xs gap-1.5 shadow-sm"
              disabled={isLoading(`ship-${itemId}`)}
              onClick={() => handleAction(`ship-${itemId}`, 'ship', order.orderId, itemId)}
            >
              {isLoading(`ship-${itemId}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
              Ship Order
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 shadow-sm max-w-[120px]"
              title={`Assigned: ${item.deliveryBoyName || 'Delivery Boy'}`}
              onClick={() => openViewAssignedModal(order.orderId, item)}
            >
              <UserCheck className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{item.deliveryBoyName ? item.deliveryBoyName.split(' ')[0] : 'Assigned'}</span>
            </Button>
          </div>
        )
      }
      case 'Shipped': {
        // Show assigned delivery boy info + option to change
        const hasDeliveryBoy = !!item.deliveryBoyId
        if (!hasDeliveryBoy) {
          // Edge case: shipped but no delivery boy (legacy data) — allow assign
          return (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => openAssignDialog(order.orderId, item)}
            >
              <UserCheck className="h-3 w-3" />
              Assign
            </Button>
          )
        }
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 shadow-sm max-w-[120px]"
            title={`Assigned: ${item.deliveryBoyName || 'Delivery Boy'}`}
            onClick={() => openViewAssignedModal(order.orderId, item)}
          >
            <UserCheck className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{item.deliveryBoyName ? item.deliveryBoyName.split(' ')[0] : 'Assigned'}</span>
          </Button>
        )
      }
      case 'Return Requested':
        return (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs gap-1"
              disabled={isLoading(`approve-${itemId}`)}
              onClick={() => handleAction(`approve-${itemId}`, 'approve-return', order.orderId, itemId)}
            >
              {isLoading(`approve-${itemId}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs gap-1"
              disabled={isLoading(`reject-${itemId}`)}
              onClick={() => handleAction(`reject-${itemId}`, 'reject-return', order.orderId, itemId, undefined, 'Rejected by seller')}
            >
              {isLoading(`reject-${itemId}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
              Reject
            </Button>
          </div>
        )
      case 'Return Approved':
        return (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
              onClick={() => openAssignDialog(order.orderId, item)}
            >
              <RotateCcw className="h-3 w-3" />
              Assign for Pickup
            </Button>
          </div>
        )
      case 'Out for Delivery':
      case 'Delivered':
      case 'Cancelled':
      case 'Not Delivered':
      case 'Return Completed':
      case 'Return Cancelled':
        // No action button for terminal / in-transit statuses.
        // These statuses have no seller action:
        //   - Out for Delivery: in transit with delivery boy
        //   - Delivered: order is complete
        //   - Cancelled: order was cancelled
        //   - Not Delivered: delivery attempt failed
        //   - Return Completed: return process is finished
        //   - Return Cancelled: return was cancelled
        // The order detail can still be opened by clicking the order ID
        // or product thumbnail.
        return null
      default:
        return (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => openDetail(order)}
          >
            <Eye className="h-3 w-3" />
            View
          </Button>
        )
    }
  }, [actionLoading, handleAction, openAssignDialog, openViewAssignedModal, openDetail])

  /* ---------------------------------------------------------------- */
  /*  Format Date                                                       */
  /* ---------------------------------------------------------------- */

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Status Badge                                                      */
  /* ---------------------------------------------------------------- */

  const StatusBadge = ({ status }: { status: OrderStatus }) => {
    const normalized = normalizeStatus(status)
    const config = STATUS_CONFIG[normalized]
    if (!config) return <Badge variant="secondary">{status}</Badge>
    return (
      <Badge className={cn(config.bgColor, config.color, 'border', config.borderColor, 'text-[11px] font-medium gap-1')}>
        <StatusIcon icon={config.icon} className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4 sm:space-y-5"
    >
      {/* ── Compact Page Header with Inline Stats ────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight truncate">Orders</h1>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Manage your store orders</p>
            </div>
          </div>
          {/* Inline mini-stats — compact pills */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/30">
              <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{stats.pending}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30">
              <Package className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{stats.processing}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{stats.delivered}</span>
            </div>
          </div>
        </div>

        {/* ── Status Filter Tabs — ALL statuses as horizontal scrollable tabs ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 -mx-1 px-1">
          {[
            { value: 'all', label: 'All', count: stats.total, activeClass: 'bg-emerald-500 text-white shadow-sm' },
            { value: 'Pending', label: 'Pending', count: stats.pending, activeClass: 'bg-amber-500 text-white shadow-sm' },
            { value: 'Processing', label: 'Processing', count: stats.processing, activeClass: 'bg-blue-500 text-white shadow-sm' },
            { value: 'Shipped', label: 'Shipped', count: null, activeClass: 'bg-indigo-500 text-white shadow-sm' },
            { value: 'Out for Delivery', label: 'Out for Delivery', count: null, activeClass: 'bg-purple-500 text-white shadow-sm' },
            { value: 'Delivered', label: 'Delivered', count: stats.delivered, activeClass: 'bg-emerald-500 text-white shadow-sm' },
            { value: 'Cancelled', label: 'Cancelled', count: null, activeClass: 'bg-red-500 text-white shadow-sm' },
            { value: 'Not Delivered', label: 'Not Delivered', count: null, activeClass: 'bg-orange-500 text-white shadow-sm' },
            { value: 'Return Requested', label: 'Return Requested', count: null, activeClass: 'bg-cyan-500 text-white shadow-sm' },
            { value: 'Return Approved', label: 'Return Approved', count: null, activeClass: 'bg-teal-500 text-white shadow-sm' },
            { value: 'Out for Pickup', label: 'Out for Pickup', count: null, activeClass: 'bg-violet-500 text-white shadow-sm' },
            { value: 'Return Completed', label: 'Return Completed', count: null, activeClass: 'bg-emerald-500 text-white shadow-sm' },
            { value: 'Return Cancelled', label: 'Return Cancelled', count: null, activeClass: 'bg-gray-500 text-white shadow-sm' },
          ].map((tab) => {
            const isActive = statusFilter === tab.value
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0',
                  isActive
                    ? tab.activeClass
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white/80" />}
                {tab.label}
                {tab.count !== null && tab.count > 0 && (
                  <span className={cn('ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold', isActive ? 'bg-white/20' : 'bg-background')}>{tab.count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Search Bar ───────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by order ID or customer name..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 bg-card border-border h-10 rounded-xl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Loading Skeleton ─────────────────────────────────────────── */}
      {loadingData && (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border">
              <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <Skeleton className="h-7 w-16 rounded-lg flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────────────────── */}
      {!loadingData && orders.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-10 sm:p-14 text-center"
        >
          <div className="h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="h-8 w-8 text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {searchQuery || statusFilter !== 'all' ? 'No orders found' : 'No orders yet'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters or search query.'
              : 'Orders from customers will appear here when they place orders.'}
          </p>
        </motion.div>
      )}

      {/* ── Orders List — Unified Card Design (works on all devices) ─── */}
      {!loadingData && orders.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-2.5"
        >
          {orders.map((order) => {
            const sellerItems = getSellerItems(order)
            const primaryStatus = getPrimaryStatus(order)
            const totalAmount = sellerItems.reduce((sum, item) => sum + (item.total || 0), 0)
            const config = STATUS_CONFIG[primaryStatus]
            const firstItem = sellerItems[0]
            const hasThumb = firstItem?.productImage

            return (
              <motion.div
                key={order.orderId}
                variants={rowVariants}
                className={cn(
                  'group relative bg-card rounded-xl border border-border hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-all duration-200 overflow-hidden',
                )}
              >
                {/* Left status accent bar */}
                <div className={cn('absolute left-0 top-0 bottom-0 w-1', config?.bgColor || 'bg-muted/30')} />

                <div className="pl-3.5 pr-3 sm:pl-4 sm:pr-4 py-3">
                  {/* Top row: Order ID + Status + Amount */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Product thumbnail */}
                      <button
                        onClick={() => openDetail(order)}
                        className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-muted/50 border border-border flex items-center justify-center flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-emerald-200 dark:hover:ring-emerald-800 transition-all"
                      >
                        {hasThumb ? (
                          <img src={firstItem.productImage} alt={firstItem.productName} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => openDetail(order)}
                          className="text-xs sm:text-sm font-semibold text-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors font-mono block truncate text-left"
                        >
                          {order.orderId}
                        </button>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{order.customerName}</p>
                          {order.customerPhone && (
                            <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Phone className="h-2.5 w-2.5" />
                              {order.customerPhone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={primaryStatus} />
                    </div>
                  </div>

                  {/* Bottom row: Items + Date (left) + Amount (right) */}
                  <div className="flex items-center justify-between gap-2 pl-[46px] sm:pl-[50px]">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-md">
                        <Package className="h-2.5 w-2.5" />
                        {sellerItems.length} {sellerItems.length === 1 ? 'item' : 'items'}
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-muted-foreground hidden sm:inline">{formatDate(order.createdAt)}</span>
                    </div>
                    <span className="text-sm sm:text-base font-bold text-foreground flex-shrink-0">{fmtPrice(totalAmount)}</span>
                  </div>

                  {/* Action buttons row — below the amount, full width */}
                  {sellerItems.length === 1 && renderActions(order, sellerItems[0]) && (
                    <div className="flex items-center gap-1.5 flex-wrap pl-[46px] sm:pl-[50px] pt-2 mt-1 border-t border-border/50">
                      {renderActions(order, sellerItems[0])}
                    </div>
                  )}
                  {sellerItems.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap pl-[46px] sm:pl-[50px] pt-2 mt-1 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        onClick={() => openDetail(order)}
                      >
                        <Eye className="h-3 w-3" />
                        <span className="hidden sm:inline">View</span>
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {!loadingData && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-[11px] sm:text-xs text-muted-foreground">
            <span className="hidden sm:inline">Showing </span>{((currentPage - 1) * itemsPerPage) + 1}&ndash;{Math.min(currentPage * itemsPerPage, totalOrders)} <span className="hidden sm:inline">of </span>{totalOrders} <span className="hidden sm:inline">orders</span>
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="h-8 w-8 p-0 rounded-lg">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) { pageNum = i + 1 }
              else if (currentPage <= 3) { pageNum = i + 1 }
              else if (currentPage >= totalPages - 2) { pageNum = totalPages - 4 + i }
              else { pageNum = currentPage - 2 + i }
              return (
                <Button key={pageNum} variant={currentPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(pageNum)} className={cn('h-8 w-8 p-0 text-xs rounded-lg', currentPage === pageNum && 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600')}>
                  {pageNum}
                </Button>
              )
            })}
            <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="h-8 w-8 p-0 rounded-lg">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────── */}
      {/*  Order Detail — Reusable AdminModal                               */}
      {/* ──────────────────────────────────────────────────────────────── */}

      <AdminModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        type="view"
        size="2xl"
        className="md:max-w-3xl lg:max-w-4xl"
        title={detailLoading ? 'Loading Order...' : selectedOrder ? selectedOrder.orderId : 'Order Details'}
        description={!detailLoading && selectedOrder ? `Placed on ${formatDateTime(selectedOrder.createdAt)}` : undefined}
        headerExtra={!detailLoading && selectedOrder ? (
          <div className="flex-shrink-0">
            <StatusBadge status={getPrimaryStatus(selectedOrder)} />
          </div>
        ) : undefined}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : selectedOrder ? (
          <div className="space-y-5 sm:space-y-6">
            {/* Order Items */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-500" />
                Order Items
              </h4>
              <div className="space-y-2 sm:space-y-3">
                {getSellerItems(selectedOrder).map((item, idx) => {
                  const itemStatus = normalizeStatus(item.status)
                  const itemConfig = STATUS_CONFIG[itemStatus]
                  return (
                    <div key={item._id || idx} className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-muted/30 border border-border">
                      {/* Product Image */}
                      <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 overflow-hidden border border-border">
                        {item.productImage ? (
                          <img src={item.productImage} alt={item.productName} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-foreground truncate">{item.productName}</p>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
                          {formatVariant(item.variant) && (
                            <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{formatVariant(item.variant)}</span>
                          )}
                          <span className="text-[11px] sm:text-xs text-muted-foreground">Qty: {item.quantity}</span>
                          <span className="text-[11px] sm:text-xs font-medium text-foreground">{fmtPrice(item.total)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 flex-wrap">
                          <StatusBadge status={itemStatus} />
                          {item.deliveryBoyName && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Truck className="h-2.5 w-2.5" />
                              {item.deliveryBoyName}
                            </span>
                          )}
                          {item.pickupDeliveryBoyName && (
                            <span className="text-[10px] text-violet-600 dark:text-violet-400 flex items-center gap-1">
                              <RotateCcw className="h-2.5 w-2.5" />
                              {item.pickupDeliveryBoyName}
                            </span>
                          )}
                        </div>
                        {/* Action buttons per item */}
                        <div className="mt-2">
                          {renderActions(selectedOrder, item)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Customer & Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-500" />
                  Shipping Address
                </h4>
                <div className="p-2.5 sm:p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-foreground">{selectedOrder.shippingAddress.name}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">{selectedOrder.shippingAddress.addressLine1}</p>
                  {selectedOrder.shippingAddress.addressLine2 && (
                    <p className="text-[11px] sm:text-xs text-muted-foreground">{selectedOrder.shippingAddress.addressLine2}</p>
                  )}
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} - {selectedOrder.shippingAddress.pincode}
                  </p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="h-3 w-3" />
                    {selectedOrder.shippingAddress.phone}
                  </p>
                  {selectedOrder.shippingAddress.type && (
                    <Badge variant="secondary" className="mt-1 text-[10px]">{selectedOrder.shippingAddress.type}</Badge>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-emerald-500" />
                  Payment Info
                </h4>
                <div className="p-2.5 sm:p-3 rounded-lg bg-muted/30 border border-border space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-[11px] sm:text-xs text-muted-foreground">Method</span>
                    <span className="text-[11px] sm:text-xs font-medium text-foreground uppercase">{selectedOrder.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[11px] sm:text-xs text-muted-foreground">Status</span>
                    <Badge className={cn(
                      selectedOrder.paymentStatus === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : selectedOrder.paymentStatus === 'refunded'
                        ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                      'text-[10px] border'
                    )}>
                      {selectedOrder.paymentStatus}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between gap-2">
                    <span className="text-[11px] sm:text-xs text-muted-foreground">Subtotal</span>
                    <span className="text-[11px] sm:text-xs text-foreground">{fmtPrice(selectedOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[11px] sm:text-xs text-muted-foreground">Delivery Fee</span>
                    <span className="text-[11px] sm:text-xs text-foreground">{fmtPrice(selectedOrder.deliveryFee)}</span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[11px] sm:text-xs text-muted-foreground">Discount</span>
                      <span className="text-[11px] sm:text-xs text-emerald-600">-{fmtPrice(selectedOrder.discount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between gap-2">
                    <span className="text-[11px] sm:text-xs font-medium text-foreground">Total</span>
                    <span className="text-sm sm:text-base font-bold text-foreground">{fmtPrice(selectedOrder.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Boy Info */}
            {(getSellerItems(selectedOrder).some(item => item.deliveryBoyName) ||
              getSellerItems(selectedOrder).some(item => item.pickupDeliveryBoyName)) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-emerald-500" />
                    Delivery Personnel
                  </h4>
                  <div className="space-y-2">
                    {getSellerItems(selectedOrder).filter(item => item.deliveryBoyName).map((item, idx) => (
                      <div key={`delivery-${idx}`} className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/30 border border-border gap-2">
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-foreground truncate">{item.deliveryBoyName}</p>
                          {item.deliveryBoyPhone && (
                            <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Phone className="h-2.5 w-2.5" />
                              {item.deliveryBoyPhone}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">Delivery</Badge>
                      </div>
                    ))}
                    {getSellerItems(selectedOrder).filter(item => item.pickupDeliveryBoyName).map((item, idx) => (
                      <div key={`pickup-${idx}`} className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-violet-50/50 dark:bg-violet-950/10 border border-violet-200 dark:border-violet-800/30 gap-2">
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-foreground truncate">{item.pickupDeliveryBoyName}</p>
                          {item.pickupDeliveryBoyPhone && (
                            <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Phone className="h-2.5 w-2.5" />
                              {item.pickupDeliveryBoyPhone}
                            </p>
                          )}
                          {item.returnId && (
                            <p className="text-[10px] text-violet-600 dark:text-violet-400 font-medium mt-0.5">
                              Return ID: {item.returnId}
                            </p>
                          )}
                        </div>
                        <Badge className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-0 flex-shrink-0">Pickup</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Status Timeline */}
            {detailStatusLogs.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-500" />
                    Status Timeline
                  </h4>
                  <div className="space-y-0">
                    {detailStatusLogs.map((log, idx) => {
                      const toConfig = STATUS_CONFIG[normalizeStatus(log.toStatus)]
                      return (
                        <div key={idx} className="flex gap-2.5 sm:gap-3">
                          <div className="flex flex-col items-center">
                            <div className={cn('h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0', toConfig?.bgColor || 'bg-muted/50')}>
                              <StatusIcon icon={toConfig?.icon || 'clock'} className={cn('h-3 w-3', toConfig?.color || 'text-muted-foreground')} />
                            </div>
                            {idx < detailStatusLogs.length - 1 && (
                              <div className="w-px flex-1 bg-border min-h-[20px]" />
                            )}
                          </div>
                          <div className="pb-4 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] sm:text-xs font-medium text-foreground">{log.toStatus}</span>
                              {log.fromStatus && (
                                <span className="text-[10px] text-muted-foreground">from {log.fromStatus}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDateTime(log.createdAt)} &middot; by {log.userName} ({log.updatedBy})
                            </p>
                            {log.reason && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 italic">&quot;{log.reason}&quot;</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Return Info */}
            {(selectedOrder.returnId || getSellerItems(selectedOrder).some(item => item.returnId)) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-orange-500" />
                    Return Information
                  </h4>
                  <div className="space-y-2">
                    {getSellerItems(selectedOrder).filter(item => item.returnId).map((item, idx) => (
                      <div key={idx} className="p-2.5 sm:p-3 rounded-lg bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 space-y-1">
                        <div className="flex justify-between gap-2">
                          <span className="text-[11px] sm:text-xs text-muted-foreground flex-shrink-0">Return ID</span>
                          <span className="text-[11px] sm:text-xs font-medium text-foreground font-mono truncate">{item.returnId}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-[11px] sm:text-xs text-muted-foreground flex-shrink-0">Product</span>
                          <span className="text-[11px] sm:text-xs text-foreground truncate min-w-0">{item.productName}</span>
                        </div>
                        {item.returnReason && (
                          <div className="flex justify-between gap-2">
                            <span className="text-[11px] sm:text-xs text-muted-foreground flex-shrink-0">Reason</span>
                            <span className="text-[11px] sm:text-xs text-foreground text-right">{item.returnReason}</span>
                          </div>
                        )}
                        {item.returnRequestedAt && (
                          <div className="flex justify-between gap-2">
                            <span className="text-[11px] sm:text-xs text-muted-foreground flex-shrink-0">Requested</span>
                            <span className="text-[11px] sm:text-xs text-foreground">{formatDateTime(item.returnRequestedAt)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-muted-foreground">Order not found</div>
        )}
      </AdminModal>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/*  Assign Delivery Boy — Reusable AdminModal                        */}
      {/* ──────────────────────────────────────────────────────────────── */}

      <AdminModal
        open={assignOpen}
        onOpenChange={(o) => { if (!assigning) setAssignOpen(o) }}
        type="form"
        size="md"
        title={assignType === 'pickup' ? 'Assign for Return Pickup' : 'Assign Delivery Boy'}
        description={
          assignType === 'pickup'
            ? `Select a delivery boy for return pickup of order ${assignOrderId}${assignOrderItem?.returnId ? ` · Return ID: ${assignOrderItem.returnId}` : ''}`
            : `Select a delivery boy for order ${assignOrderId}`
        }
        submitting={assigning}
        footer={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssignOpen(false)}
            disabled={assigning}
            className="text-xs rounded-lg"
          >
            Cancel
          </Button>
        }
      >
        <div className="space-y-3">
          {/* Header banner with context */}
          <div className={cn(
            'flex items-center gap-3 p-3 rounded-xl border',
            assignType === 'pickup'
              ? 'bg-violet-50/50 dark:bg-violet-950/20 border-violet-100 dark:border-violet-900/30'
              : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30'
          )}>
            <div className={cn(
              'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
              assignType === 'pickup'
                ? 'bg-violet-100 dark:bg-violet-950/40'
                : 'bg-emerald-100 dark:bg-emerald-950/40'
            )}>
              {assignType === 'pickup' ? (
                <RotateCcw className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              ) : (
                <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">
                {assignType === 'pickup' ? 'Return Pickup Assignment' : 'Delivery Assignment'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {assignType === 'pickup'
                  ? 'Choose a partner to pick up the return item'
                  : 'Choose a partner to deliver this order'}
              </p>
            </div>
          </div>

          {/* Delivery boys list */}
          {assignLoadingBoys ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              <span className="mt-2 text-xs text-muted-foreground">Loading delivery boys...</span>
            </div>
          ) : assignDeliveryBoys.length === 0 ? (
            <div className="text-center py-10">
              <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <UserCheck className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-foreground">No delivery boys available</p>
              <p className="text-xs text-muted-foreground mt-1">Please ensure delivery boys are registered and active</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Available Partners ({assignDeliveryBoys.length})
                </p>
              </div>
              <ScrollArea className="max-h-72">
                <div className="space-y-2 pr-1">
                  {assignDeliveryBoys.map((boy) => {
                    // Only the delivery boy being assigned shows the spinner.
                    // Other cards are disabled (prevent double-click) but keep
                    // their normal icon — no spinner on them.
                    const isThisAssigning = assigning && assigningBoyId === boy._id
                    return (
                    <button
                      key={boy._id}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border transition-colors group',
                        isThisAssigning
                          ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30 ring-1 ring-emerald-300 dark:ring-emerald-800'
                          : 'border-border hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20',
                        assigning && !isThisAssigning && 'opacity-60 cursor-not-allowed',
                      )}
                      disabled={assigning}
                      onClick={() => handleAssignDeliveryBoy(boy._id)}
                    >
                      <div className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ring-2 shadow-sm transition-colors',
                        isThisAssigning
                          ? 'bg-emerald-200 dark:bg-emerald-900/40 ring-emerald-100 dark:ring-emerald-950'
                          : 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-emerald-900/20 ring-white dark:ring-gray-900',
                      )}>
                        {boy.profileImage ? (
                          <img
                            src={typeof boy.profileImage === 'string' ? boy.profileImage : (boy.profileImage as { url?: string }).url || ''}
                            alt={boy.name}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          <span className={cn(
                            'text-sm font-bold transition-colors',
                            isThisAssigning
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : 'text-emerald-600 dark:text-emerald-400',
                          )}>
                            {boy.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className={cn(
                          'text-sm font-semibold transition-colors',
                          isThisAssigning ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground',
                        )}>{boy.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" />
                            {boy.mobile}
                          </span>
                          {boy.vehicleType && (
                            <span className="text-[10px] text-muted-foreground bg-muted/60 dark:bg-muted/30 px-1.5 py-0.5 rounded-md font-medium">
                              {boy.vehicleType}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {isThisAssigning ? (
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-muted/40 dark:bg-muted/20 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-950/40 flex items-center justify-center transition-colors">
                            <UserCheck className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                          </div>
                        )}
                      </div>
                    </button>
                    )
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </AdminModal>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/*  View Assigned Delivery Boy — Reusable AdminModal                 */}
      {/*  Shows the currently-assigned delivery boy's full details with a  */}
      {/*  "Change Delivery Boy" option to reassign.                        */}
      {/* ──────────────────────────────────────────────────────────────── */}

      <AdminModal
        open={viewAssignedOpen}
        onOpenChange={setViewAssignedOpen}
        type="view"
        size="md"
        title="Assigned Delivery Boy"
        description={`Delivery partner assigned to order ${viewAssignedOrderId}`}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewAssignedOpen(false)}
              className="text-xs rounded-lg"
            >
              Close
            </Button>
            <Button
              size="sm"
              className="text-xs rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5"
              onClick={() => {
                if (viewAssignedItem) {
                  setViewAssignedOpen(false)
                  openAssignDialog(viewAssignedOrderId, viewAssignedItem)
                }
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Change Delivery Boy
            </Button>
          </>
        }
      >
        {viewAssignedItem && viewAssignedItem.deliveryBoyId ? (
          <div className="space-y-4">
            {/* Delivery boy profile card */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-emerald-50/80 to-emerald-50/30 dark:from-emerald-950/30 dark:to-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-200 to-emerald-100 dark:from-emerald-800 dark:to-emerald-900 flex items-center justify-center flex-shrink-0 ring-4 ring-white dark:ring-gray-900 shadow-md">
                <UserCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-foreground truncate">{viewAssignedItem.deliveryBoyName || 'Unknown'}</p>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Assigned
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Delivery Partner</p>
              </div>
            </div>

            {/* Contact details */}
            <div className="space-y-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1">Contact Details</p>
              {viewAssignedItem.deliveryBoyPhone && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 dark:bg-muted/10 border border-border">
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground">Phone Number</p>
                    <p className="text-sm font-semibold text-foreground">{viewAssignedItem.deliveryBoyPhone}</p>
                  </div>
                  <a
                    href={`tel:${viewAssignedItem.deliveryBoyPhone}`}
                    className="h-8 w-8 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white transition-colors flex-shrink-0"
                    title="Call delivery boy"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
              {/* Order item context */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 dark:bg-muted/10 border border-border">
                <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center flex-shrink-0">
                  <Package className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">Order Item</p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {viewAssignedItem.productName || viewAssignedItem.name || 'Item'}
                    {viewAssignedItem.quantity && ` × ${viewAssignedItem.quantity}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Helper text */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
              <Navigation className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 dark:text-blue-300">
                The delivery boy has been notified and will pick up this order. You can reassign to a different partner if needed.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <UserCheck className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground">No delivery boy assigned</p>
            <p className="text-xs text-muted-foreground mt-1">Please assign a delivery boy to this order.</p>
          </div>
        )}
      </AdminModal>
    </motion.div>
  )
}
