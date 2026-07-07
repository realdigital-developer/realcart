'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart,
  Eye,
  Clock,
  CheckCircle2,
  RotateCcw,
  Package,
  Truck,
  MapPin,
  CreditCard,
  User,
  Store,
  Phone,
  Mail,
  Calendar,
  Hash,
  ArrowRight,
  Filter,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  STATUS_CONFIG,
  type Order,
  type OrderStatus,
  type OrderStatusLog,
  type DeliveryAssignment,
  formatVariant,
} from '@/lib/order-types'
import { normalizeStatus } from '@/lib/order-state-machine'
import { formatCurrency } from '@/lib/currency'
import AdminListPage, {
  listAnimations,
  StatusBadge,
  ViewButton,
  formatDate,
  formatDateTime,
  type BreakdownItem,
  type ColumnDef,
  type ListPageMessage,
  type StatCardConfig,
} from '@/components/admin/list-view'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface OrderDetailData {
  order: Order
  statusLogs: OrderStatusLog[]
  assignments: DeliveryAssignment[]
}

/* ------------------------------------------------------------------ */
/*  Column Definitions                                                  */
/* ------------------------------------------------------------------ */

const columns: ColumnDef[] = [
  { key: 'orderId', label: 'Order ID' },
  { key: 'customer', label: 'Customer' },
  { key: 'items', label: 'Items' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
  { key: 'date', label: 'Date' },
  { key: 'action', label: 'Action', className: 'text-right pr-6' },
]

/* ------------------------------------------------------------------ */
/*  Status icon mapping (module-level to avoid creating components      */
/*  during render)                                                      */
/* ------------------------------------------------------------------ */

const STATUS_ICON_MAP: Record<string, React.ElementType> = {
  'clock': Clock,
  'package': Package,
  'truck': Truck,
  'check-circle': CheckCircle2,
  'check-circle-2': CheckCircle2,
  'x-circle': RotateCcw,
  'alert-triangle': Clock,
  'rotate-ccw': RotateCcw,
}

/** Extended STATUS_CONFIG with real React icon components */
const ORDER_STATUS_ICONS: Record<OrderStatus, React.ElementType> = Object.fromEntries(
  (Object.keys(STATUS_CONFIG) as OrderStatus[]).map((status) => [
    status,
    STATUS_ICON_MAP[STATUS_CONFIG[status].icon] || Clock,
  ])
) as Record<OrderStatus, React.ElementType>

/* ------------------------------------------------------------------ */
/*  Breakdown Items for Hero Card                                       */
/* ------------------------------------------------------------------ */

const orderBreakdownItems: BreakdownItem[] = [
  { key: 'Pending', label: 'Pending', color: 'bg-amber-500' },
  { key: 'Processing', label: 'Processing', color: 'bg-blue-500' },
  { key: 'Shipped', label: 'Shipped', color: 'bg-indigo-500' },
  { key: 'Out for Delivery', label: 'OFD', color: 'bg-purple-500' },
  { key: 'Delivered', label: 'Delivered', color: 'bg-emerald-500' },
  { key: 'Cancelled', label: 'Cancelled', color: 'bg-red-500' },
  { key: 'Return Requested', label: 'Return', color: 'bg-cyan-500' },
  { key: 'Return Completed', label: 'Ret. Done', color: 'bg-teal-500' },
]

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function OrdersPage() {
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
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <OrdersContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Orders Content                                                      */
/* ------------------------------------------------------------------ */

function OrdersContent() {
  // Data state
  const [orders, setOrders] = useState<Order[]>([])
  const [totalOrders, setTotalOrders] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loadingData, setLoadingData] = useState(true)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Message state
  const [message, setMessage] = useState<ListPageMessage | null>(null)

  // Detail state
  const [detailOpen, setDetailOpen] = useState(false)
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null)
  const [orderDetail, setOrderDetail] = useState<OrderDetailData | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const itemsPerPage = 10

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch orders                                                     */
  /* ---------------------------------------------------------------- */

  const fetchOrders = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/orders?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch orders')
      const data = await res.json().catch(() => ({}))

      setOrders(data.orders || [])
      setTotalOrders(data.total || 0)
      if (data.stats) setStats(data.stats)
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load orders' })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, statusFilter, currentPage])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter])

  const totalPages = Math.max(1, Math.ceil(totalOrders / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Open detail dialog                                               */
  /* ---------------------------------------------------------------- */

  const openDetail = useCallback(async (order: Order) => {
    setViewingOrder(order)
    setDetailOpen(true)
    setOrderDetail(null)
    setLoadingDetail(true)

    try {
      const res = await fetch(`/api/admin/orders?orderId=${order.orderId}`)
      if (!res.ok) throw new Error('Failed to fetch order details')
      const data = await res.json().catch(() => ({}))
      setOrderDetail(data)
    } catch (err) {
      console.error('Detail fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load order details' })
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Stat cards data                                                  */
  /* ---------------------------------------------------------------- */

  const pendingCount = (stats['Pending'] || 0) + (stats['Processing'] || 0) + (stats['Shipped'] || 0) + (stats['Out for Delivery'] || 0)
  const deliveredCount = stats['Delivered'] || 0
  const returnedCount = (stats['Return Requested'] || 0) + (stats['Return Approved'] || 0) + (stats['Out for Pickup'] || 0) + (stats['Return Completed'] || 0)

  const statCards: StatCardConfig[] = useMemo(() => [
    {
      label: 'Pending',
      value: pendingCount,
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      bar: 'bg-amber-500',
      border: 'border-amber-500/20',
      gradient: 'from-amber-500/10 via-amber-500/5 to-transparent',
    },
    {
      label: 'Delivered',
      value: deliveredCount,
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
      bar: 'bg-emerald-500',
      border: 'border-emerald-500/20',
      gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
    },
    {
      label: 'Returned',
      value: returnedCount,
      icon: RotateCcw,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-500/10',
      bar: 'bg-red-500',
      border: 'border-red-500/20',
      gradient: 'from-red-500/10 via-red-500/5 to-transparent',
    },
  ], [pendingCount, deliveredCount, returnedCount])

  /* ---------------------------------------------------------------- */
  /*  Hero card status summary                                         */
  /* ---------------------------------------------------------------- */

  const orderStatusSummary = useMemo(() => ({
    'Pending': stats['Pending'] || 0,
    'Processing': stats['Processing'] || 0,
    'Shipped': stats['Shipped'] || 0,
    'Out for Delivery': stats['Out for Delivery'] || 0,
    'Delivered': stats['Delivered'] || 0,
    'Cancelled': stats['Cancelled'] || 0,
    'Return Requested': stats['Return Requested'] || 0,
    'Return Completed': stats['Return Completed'] || 0,
  }), [stats])

  /* ---------------------------------------------------------------- */
  /*  Filter elements                                                  */
  /* ---------------------------------------------------------------- */

  const filterElements: ReactNode = (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="w-[170px] bg-muted/50 border-0 text-xs">
        <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Status</SelectItem>
        <SelectItem value="Pending">Pending</SelectItem>
        <SelectItem value="Processing">Processing</SelectItem>
        <SelectItem value="Shipped">Shipped</SelectItem>
        <SelectItem value="Out for Delivery">Out for Delivery</SelectItem>
        <SelectItem value="Delivered">Delivered</SelectItem>
        <SelectItem value="Cancelled">Cancelled</SelectItem>
        <SelectItem value="Not Delivered">Not Delivered</SelectItem>
        <SelectItem value="Return Requested">Return Requested</SelectItem>
        <SelectItem value="Return Approved">Return Approved</SelectItem>
        <SelectItem value="Out for Pickup">Out for Pickup</SelectItem>
        <SelectItem value="Return Completed">Return Completed</SelectItem>
      </SelectContent>
    </Select>
  )

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AdminListPage
      title="Orders Management"
      subtitle="View and monitor all orders across the platform. Admin has read-only access."
      onRefresh={fetchOrders}
      heroCard={{
        icon: ShoppingCart,
        label: 'Total Orders',
        value: totalOrders,
        breakdownItems: orderBreakdownItems,
        statusSummary: orderStatusSummary,
      }}
      statCards={statCards}
      totalItems={totalOrders}
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search order ID or customer..."
      filters={filterElements}
      columns={columns}
      data={orders}
      loading={loadingData}
      loadingText="Loading orders..."
      emptyIcon={ShoppingCart}
      emptyText="No orders found"
      emptySubtext="Try adjusting your search or filters"
      renderRow={(item) => (
        <OrderRow key={item._id} order={item} onView={openDetail} />
      )}
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={setCurrentPage}
      itemName="orders"
      itemsPerPage={itemsPerPage}
      message={message}
      onDismissMessage={() => setMessage(null)}
      detailOpen={detailOpen}
      onDetailOpenChange={setDetailOpen}
      detailContent={
        viewingOrder ? (
          <OrderDetailContent
            order={viewingOrder}
            detail={orderDetail}
            loading={loadingDetail}
          />
        ) : null
      }
      detailMaxWidth="sm:max-w-[800px]"
      detailTitle="Order Details"
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Order Row Component                                                 */
/* ------------------------------------------------------------------ */

function OrderRow({ order, onView }: { order: Order; onView: (o: Order) => void }) {
  const normalizedStatus = normalizeStatus(order.status)
  const config = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG['Pending']
  const Icon = ORDER_STATUS_ICONS[normalizedStatus] || Clock
  const itemCount = order.items?.length || 0

  return (
    <motion.tr
      variants={listAnimations.rowVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="group hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => onView(order)}
    >
      <TableCell className="py-3">
        <span className="text-xs font-mono font-medium text-foreground/80">{order.orderId}</span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate max-w-[150px]">{order.customerName}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[150px]">{order.customerPhone}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm font-semibold">{formatCurrency(order.totalAmount)}</span>
      </TableCell>
      <TableCell>
        <StatusBadge
          color={config.color}
          bgColor={config.bgColor}
          icon={Icon}
          label={config.label}
        />
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
      </TableCell>
      <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
        <ViewButton onClick={() => onView(order)} label="View" />
      </TableCell>
    </motion.tr>
  )
}

/* ------------------------------------------------------------------ */
/*  Order Detail Content (Modal)                                        */
/* ------------------------------------------------------------------ */

function OrderDetailContent({
  order,
  detail,
  loading,
}: {
  order: Order
  detail: OrderDetailData | null
  loading: boolean
}) {
  const normalizedStatus = normalizeStatus(order.status)
  const config = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG['Pending']
  const StatusIcon = ORDER_STATUS_ICONS[normalizedStatus] || Clock

  return (
    <>
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center h-14 w-14 rounded-lg bg-emerald-500/10 shrink-0">
            <ShoppingCart className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold truncate">{order.orderId}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatDate(order.createdAt)}
            </p>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <Badge className={cn('px-3 py-1 text-xs font-medium rounded-full border-0', config.bgColor, config.color)}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground">Read-only</span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2.5 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading order details...
          </div>
        ) : (
          <>
            {/* Order Info & Customer Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Order Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Summary</h4>
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <DetailRow icon={Hash} label="Order ID" value={order.orderId} mono />
                  <DetailRow icon={Calendar} label="Placed" value={formatDateTime(order.createdAt)} />
                  {order.estimatedDelivery && (
                    <DetailRow icon={Truck} label="Est. Delivery" value={formatDate(order.estimatedDelivery)} />
                  )}
                  {order.deliveredAt && (
                    <DetailRow icon={CheckCircle2} label="Delivered" value={formatDateTime(order.deliveredAt)} />
                  )}
                  {order.cancelledAt && (
                    <DetailRow icon={RotateCcw} label="Cancelled" value={formatDateTime(order.cancelledAt)} />
                  )}
                  {order.cancellationReason && (
                    <DetailRow icon={RotateCcw} label="Reason" value={order.cancellationReason} />
                  )}
                </div>
              </div>

              {/* Shipping Address */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shipping Address</h4>
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <DetailRow icon={User} label="Name" value={order.shippingAddress?.name || order.customerName} />
                  <DetailRow icon={Phone} label="Phone" value={order.shippingAddress?.phone || order.customerPhone} />
                  {order.customerEmail && (
                    <DetailRow icon={Mail} label="Email" value={order.customerEmail} />
                  )}
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-sm">
                      {order.shippingAddress?.addressLine1}
                      {order.shippingAddress?.addressLine2 && `, ${order.shippingAddress.addressLine2}`}
                      <br />
                      {order.shippingAddress?.city}, {order.shippingAddress?.state} - {order.shippingAddress?.pincode}
                      {order.shippingAddress?.type && (
                        <Badge className="ml-2 px-1.5 py-0 text-[10px] rounded-full bg-muted border border-border/50 text-muted-foreground capitalize">
                          {order.shippingAddress.type}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="opacity-50" />

            {/* Payment Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Info</h4>
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Method</p>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                      {order.paymentMethod === 'cod' ? 'COD' : 'Online'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                    <Badge className={cn(
                      'px-2 py-0.5 text-[10px] font-medium rounded-full border-0',
                      order.paymentStatus === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : order.paymentStatus === 'refunded'
                          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    )}>
                      {order.paymentStatus?.charAt(0).toUpperCase() + order.paymentStatus?.slice(1) || 'N/A'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Subtotal</p>
                    <p className="text-sm font-medium">{formatCurrency(order.subtotal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                    <p className="text-sm font-bold">{formatCurrency(order.totalAmount)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Delivery Fee</p>
                    <p className="text-sm">{formatCurrency(order.deliveryFee)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Discount</p>
                    <p className="text-sm">{formatCurrency(order.discount)}</p>
                  </div>
                  {order.couponCode && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Coupon</p>
                      <p className="text-sm">{order.couponCode}</p>
                    </div>
                  )}
                  {order.couponDiscount ? (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Coupon Disc.</p>
                      <p className="text-sm">{formatCurrency(order.couponDiscount)}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <Separator className="opacity-50" />

            {/* Order Items with Vendor Split */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Order Items ({order.items?.length || 0})
              </h4>
              <div className="space-y-3">
                {/* Group items by seller */}
                {Object.entries(
                  (order.items || []).reduce<Record<string, typeof order.items>>((acc, item) => {
                    const key = item.sellerStoreName || item.sellerName || 'Unknown'
                    if (!acc[key]) acc[key] = []
                    acc[key].push(item)
                    return acc
                  }, {})
                ).map(([storeName, items]) => (
                  <div key={storeName} className="bg-muted/30 rounded-lg overflow-hidden">
                    {/* Seller Header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/30">
                      <Store className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">{storeName}</span>
                    </div>
                    {/* Items */}
                    <div className="divide-y divide-border/20">
                      {items.map((item, idx) => {
                        const itemStatus = normalizeStatus(item.status)
                        const itemConfig = STATUS_CONFIG[itemStatus] || STATUS_CONFIG['Pending']
                        const ItemIcon = ORDER_STATUS_ICONS[itemStatus] || Clock
                        return (
                          <div key={item._id || idx} className="flex items-center gap-3 px-3 py-2.5">
                            {/* Product Image */}
                            {item.productImage ? (
                              <div className="h-10 w-10 rounded-md overflow-hidden bg-muted shrink-0">
                                <img src={item.productImage} alt="" className="h-full w-full object-cover" />
                              </div>
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-muted shrink-0 flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            {/* Product Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.productName}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {formatVariant(item.variant) && <span>{formatVariant(item.variant)}</span>}
                                <span>Qty: {item.quantity}</span>
                                <span className="font-medium text-foreground">{formatCurrency(item.total)}</span>
                              </div>
                            </div>
                            {/* Item Status */}
                            <Badge className={cn('px-2 py-0.5 text-[10px] font-medium rounded-full border-0 shrink-0', itemConfig.bgColor, itemConfig.color)}>
                              <ItemIcon className="h-2.5 w-2.5 mr-0.5" />
                              {itemConfig.label}
                            </Badge>
                            {/* Delivery Boy */}
                            {item.deliveryBoyName && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                <Truck className="h-3 w-3" />
                                <span className="max-w-[80px] truncate">{item.deliveryBoyName}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Timeline */}
            {detail?.statusLogs && detail.statusLogs.length > 0 && (
              <>
                <Separator className="opacity-50" />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status Timeline</h4>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="space-y-0">
                      {detail.statusLogs.map((log, idx) => {
                        const toConfig = STATUS_CONFIG[normalizeStatus(log.toStatus)] || STATUS_CONFIG['Pending']
                        const ToIcon = ORDER_STATUS_ICONS[normalizeStatus(log.toStatus)] || Clock
                        const isLast = idx === detail.statusLogs.length - 1
                        return (
                          <div key={log._id || idx} className="flex gap-3">
                            {/* Timeline line + dot */}
                            <div className="flex flex-col items-center shrink-0">
                              <div className={cn(
                                'flex items-center justify-center w-7 h-7 rounded-full shrink-0',
                                isLast ? toConfig.bgColor : 'bg-muted/60'
                              )}>
                                <ToIcon className={cn('h-3.5 w-3.5', isLast ? toConfig.color : 'text-muted-foreground')} />
                              </div>
                              {!isLast && (
                                <div className="w-px flex-1 min-h-[20px] bg-border/40" />
                              )}
                            </div>
                            {/* Content */}
                            <div className={cn('pb-4', isLast && 'pb-0')}>
                              <div className="flex items-center gap-2">
                                <span className={cn('text-sm font-medium', isLast ? toConfig.color : 'text-foreground')}>
                                  {log.toStatus}
                                </span>
                                {log.fromStatus && (
                                  <>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground line-through">{log.fromStatus}</span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span>{formatDateTime(log.createdAt)}</span>
                                <span className="text-muted-foreground/50">&#183;</span>
                                <span className="capitalize">{log.updatedBy?.replace('_', ' ')}</span>
                                {log.userName && <span>({log.userName})</span>}
                              </div>
                              {log.reason && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic">{log.reason}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Delivery Assignments */}
            {detail?.assignments && detail.assignments.length > 0 && (
              <>
                <Separator className="opacity-50" />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery Assignments</h4>
                  <div className="bg-muted/30 rounded-lg divide-y divide-border/20">
                    {detail.assignments.map((assignment, idx) => (
                      <div key={assignment._id || idx} className="px-3 py-2.5 flex items-center gap-3">
                        <div className={cn(
                          'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
                          assignment.status === 'accepted'
                            ? 'bg-emerald-500/10'
                            : assignment.status === 'rejected'
                              ? 'bg-red-500/10'
                              : 'bg-amber-500/10'
                        )}>
                          <Truck className={cn(
                            'h-4 w-4',
                            assignment.status === 'accepted'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : assignment.status === 'rejected'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{assignment.deliveryBoyName}</span>
                            <Badge className={cn(
                              'px-1.5 py-0 text-[9px] font-medium rounded-full border-0 capitalize',
                              assignment.status === 'accepted'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : assignment.status === 'rejected'
                                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            )}>
                              {assignment.status}
                            </Badge>
                            <Badge className="px-1.5 py-0 text-[9px] rounded-full bg-muted border border-border/50 text-muted-foreground capitalize">
                              {assignment.type}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Assigned: {formatDateTime(assignment.assignedAt)}
                            {assignment.respondedAt && ` | Responded: ${formatDateTime(assignment.respondedAt)}`}
                          </div>
                          {assignment.rejectReason && (
                            <p className="text-xs text-red-500 mt-0.5">Reason: {assignment.rejectReason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Return Info */}
            {order.returnId && (
              <>
                <Separator className="opacity-50" />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Return Information</h4>
                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3 space-y-2">
                    <DetailRow icon={Hash} label="Return ID" value={order.returnId} mono />
                    {order.returnReason && (
                      <DetailRow icon={RotateCcw} label="Reason" value={order.returnReason} />
                    )}
                    {order.returnRequestedAt && (
                      <DetailRow icon={Calendar} label="Requested" value={formatDateTime(order.returnRequestedAt)} />
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Read-only notice */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/20 border border-border/30">
              <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                This is a read-only view. Order status can only be updated by the respective role holders (seller, delivery boy, or customer).
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Detail Row Helper                                                   */
/* ------------------------------------------------------------------ */

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground min-w-[70px]">{label}</span>
      <span className={cn('text-sm', mono && 'font-mono text-xs')}>{value || '\u2014'}</span>
    </div>
  )
}
