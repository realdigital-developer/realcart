'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Package,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  MapPin,
  CreditCard,
  Banknote,
  KeyRound,
  Loader2,
  ShoppingBag,
  RefreshCw,
  Search,
  X,
  Home,
  Building2,
  Briefcase,
  Copy,
  Check,
  Timer,
  Store,
  Heart,
  Star,
  FileText,
  Download,
  Sparkles,
  Wallet,
  ChevronDown,
  Hash,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { STATUS_CONFIG, formatVariant, type Order, type OrderItem, type OrderStatus, type OrderStatusLog } from '@/lib/order-types'
import { normalizeStatus } from '@/lib/order-state-machine'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useLanguage } from '@/components/providers/language-provider'
import { InvoiceDialog } from '@/components/customer/invoice-dialog'
import { CreditNoteDialog } from '@/components/customer/credit-note-dialog'

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined || isNaN(Number(price))) return '₹0'
  return `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatRelativeTime(dateStr: string): string {
  try {
    const now = new Date()
    const d = new Date(dateStr)
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const diffDays = Math.floor(diffHrs / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(dateStr)
  } catch {
    return formatDate(dateStr)
  }
}

function getOTPExpiryTime(expiresAt: string): string {
  try {
    const now = new Date()
    const exp = new Date(expiresAt)
    const diffMs = exp.getTime() - now.getTime()
    if (diffMs <= 0) return 'Expired'
    const hrs = Math.floor(diffMs / (1000 * 60 * 60))
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hrs}h ${mins}m`
  } catch {
    return ''
  }
}

/** Map STATUS_CONFIG icon strings to Lucide React components */
const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'clock': Clock,
  'package': Package,
  'truck': Truck,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
  'alert-triangle': AlertTriangle,
  'rotate-ccw': RotateCcw,
  'check-circle-2': CheckCircle2,
}

function StatusIcon({ status, className }: { status: OrderStatus; className?: string }) {
  const config = STATUS_CONFIG[status]
  const IconComp = STATUS_ICONS[config.icon] || Clock
  return <IconComp className={className} />
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                        */
/* ------------------------------------------------------------------ */

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge
      className={cn(
        'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
        config.bgColor,
        config.color,
        config.borderColor
      )}
      variant="outline"
    >
      {config.label}
    </Badge>
  )
}

/* ------------------------------------------------------------------ */
/*  OTP Display Box                                                     */
/* ------------------------------------------------------------------ */

function OTPDisplayBox({ otps, onCopy }: {
  otps: { code: string; type: 'delivery' | 'pickup'; expiresAt: string; orderItemId: string }[]
  onCopy: (code: string) => void
}) {
  if (!otps || otps.length === 0) return null

  return (
    <div className="space-y-3">
      {otps.map((otp) => (
        <motion.div
          key={otp.orderItemId}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className={cn(
            'rounded-xl border-2 p-4',
            otp.type === 'delivery'
              ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
              : 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800'
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className={cn(
              'h-4 w-4',
              otp.type === 'delivery' ? 'text-orange-600 dark:text-orange-400' : 'text-violet-600 dark:text-violet-400'
            )} />
            <span className={cn(
              'text-sm font-bold',
              otp.type === 'delivery' ? 'text-orange-700 dark:text-orange-300' : 'text-violet-700 dark:text-violet-300'
            )}>
              {otp.type === 'delivery' ? 'Delivery OTP' : 'Pickup OTP'}
            </span>
          </div>

          {/* OTP Code — Large and prominent */}
          <div className={cn(
            'flex items-center justify-center gap-2 py-3 px-4 rounded-lg',
            otp.type === 'delivery'
              ? 'bg-white dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700'
              : 'bg-white dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700'
          )}>
            <span className="text-2xl sm:text-3xl font-mono font-bold tracking-[0.3em] text-gray-900 dark:text-gray-100">
              {otp.code}
            </span>
            <button
              onClick={() => onCopy(otp.code)}
              className="ml-2 h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Copy OTP"
            >
              <Copy className="h-3.5 w-3.5 text-gray-500" />
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              Share this with the {otp.type === 'delivery' ? 'delivery person' : 'pickup person'}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
              <Timer className="h-3 w-3" />
              Expires in: {getOTPExpiryTime(otp.expiresAt)}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Return Request Dialog                                               */
/* ------------------------------------------------------------------ */

function ReturnRequestDialog({ isOpen, onClose, onSubmit, loading }: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  const presetReasons = [
    'Product damaged or defective',
    'Wrong item received',
    'Item does not match description',
    'Size/fit issue',
    'Changed my mind',
  ]
  const [selectedPreset, setSelectedPreset] = useState('')

  if (!isOpen) return null

  const finalReason = selectedPreset || reason

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          className="bg-white dark:bg-gray-950 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">Request Return</h2>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Preset Reasons */}
          <div className="p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Select a reason</p>
            {presetReasons.map((r) => (
              <button
                key={r}
                onClick={() => { setSelectedPreset(r); setReason('') }}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors',
                  selectedPreset === r
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 font-medium'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                )}
              >
                {r}
              </button>
            ))}

            {/* Custom reason */}
            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Or type your reason</p>
              <textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); setSelectedPreset('') }}
                placeholder="Describe why you want to return this item..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-950">
            <button
              onClick={() => onSubmit(finalReason)}
              disabled={loading || !finalReason.trim()}
              className={cn(
                'w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors',
                !loading && finalReason.trim()
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              )}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              SUBMIT RETURN REQUEST
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Cancel Confirmation Dialog                                          */
/* ------------------------------------------------------------------ */

function CancelDialog({ isOpen, onClose, onSubmit, loading, title, description }: {
  isOpen: boolean
  onClose: () => void
  onSubmit: () => void
  loading: boolean
  title: string
  description: string
}) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-white dark:bg-gray-950 rounded-2xl w-full max-w-sm p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 text-center mb-1">{title}</h3>
          <p className="text-sm text-gray-500 text-center mb-5">{description}</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              No, Keep It
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={onSubmit}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Yes, Cancel
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Status Timeline                                                     */
/* ------------------------------------------------------------------ */

function StatusTimeline({ logs }: { logs: OrderStatusLog[] }) {
  if (!logs || logs.length === 0) return null

  return (
    <div className="space-y-0">
      {logs.map((log, idx) => {
        const status = normalizeStatus(log.toStatus)
        const config = STATUS_CONFIG[status]
        const isLast = idx === logs.length - 1

        return (
          <div key={idx} className="flex gap-3">
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                config.bgColor
              )}>
                <StatusIcon status={status} className={cn('h-3.5 w-3.5', config.color)} />
              </div>
              {!isLast && (
                <div className="w-0.5 flex-1 min-h-[24px] bg-gray-200 dark:bg-gray-700 my-1" />
              )}
            </div>

            {/* Content */}
            <div className={cn('flex-1 pb-4', isLast && 'pb-0')}>
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-semibold', config.color)}>
                  {config.label}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {formatDate(log.createdAt)} · {formatTime(log.createdAt)}
              </p>
              {log.reason && (
                <p className="text-xs text-gray-500 mt-0.5">Reason: {log.reason}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-0.5">
                by {log.updatedBy === 'customer' ? 'You' : log.userName}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Order Item Card (in list view)                                      */
/* ------------------------------------------------------------------ */

function OrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const status = normalizeStatus(order.status)
  const config = STATUS_CONFIG[status]
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const [showInvoice, setShowInvoice] = useState(false)
  const { t } = useLanguage()
  const hasCreditNote = !!(order.creditNoteNumber || (order.creditNotes && order.creditNotes.length > 0))
  // For cancelled OR return-completed orders with a credit note, the invoice
  // view button shows the credit note instead. Both are terminal statuses
  // where a credit note is issued (cancellation credit note or return credit
  // note) — matching the cancelled-order pattern for return-completed orders.
  const showCreditNoteInstead = (status === 'Cancelled' || status === 'Return Completed') && hasCreditNote

  // Determine if OTP should be shown (any item Out for Delivery or Out for Pickup)
  const hasOTPItem = order.items.some(
    item => normalizeStatus(item.status) === 'Out for Delivery' || normalizeStatus(item.status) === 'Out for Pickup'
  )

  // Determine action button type
  const getActionInfo = () => {
    if (status === 'Pending' || status === 'Processing') {
      return { type: 'cancel' as const, label: t('orders.cancelOrder'), color: 'text-red-500 hover:text-red-600' }
    }
    if (status === 'Delivered') {
      return { type: 'return' as const, label: t('orders.return'), color: 'text-orange-500 hover:text-orange-600' }
    }
    if (status === 'Return Requested') {
      return { type: 'cancel-return' as const, label: 'Cancel Return', color: 'text-red-500 hover:text-red-600' }
    }
    return null
  }

  const actionInfo = getActionInfo()

  // Group items by seller
  const sellerGroups = order.items.reduce<Record<string, OrderItem[]>>((acc, item) => {
    const key = item.sellerStoreName || item.sellerName || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
    >
      {/* Card Header: Order ID + Status + Date */}
      <button
        onClick={onClick}
        className="w-full text-left px-3 py-2.5 flex items-center justify-between border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-xs font-mono font-semibold text-gray-600 dark:text-gray-400 truncate">
            {order.orderId}
          </span>
          <OrderStatusBadge status={status} />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-gray-400">{formatRelativeTime(order.createdAt)}</span>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </button>

      {/* OTP Banner (when applicable) */}
      {hasOTPItem && (
        <div className="px-3 py-2 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-100 dark:border-orange-900/50 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-orange-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">
            OTP available — Tap to view
          </span>
        </div>
      )}

      {/* Items List */}
      <button onClick={onClick} className="w-full text-left px-3 py-2.5 space-y-2">
        {Object.entries(sellerGroups).map(([sellerName, items]) => (
          <div key={sellerName}>
            {/* Seller header */}
            <div className="flex items-center gap-1 mb-1">
              <Store className="h-3 w-3 text-gray-400" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{sellerName}</span>
            </div>
            {/* Items */}
            {items.map((item, idx) => {
              // Handle both new orders (with effectivePrice) and legacy orders (without)
              const hasItemDiscount = (item.discountAmount ?? 0) > 0 || (item.effectivePrice != null && item.effectivePrice < item.price)
              const displayEffectivePrice = item.effectivePrice ?? item.price
              const displayTotal = hasItemDiscount ? displayEffectivePrice * item.quantity : item.total

              return (
              <div key={item._id || idx} className="flex gap-2.5 mb-1.5">
                <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800">
                  {item.productImage ? (
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-4 w-4 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1 leading-tight">
                    {item.productName}
                  </p>
                  {formatVariant(item.variant) && (
                    <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{formatVariant(item.variant)}</p>
                  )}
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[11px] text-gray-400">Qty: {item.quantity}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {formatPrice(displayTotal)}
                      </span>
                      {hasItemDiscount && (
                        <span className="text-[10px] text-gray-400 line-through">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        ))}
      </button>

      {/* Footer: Total + Action */}
      <div className="px-3 py-2.5 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-gray-400">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatPrice(order.totalAmount)}</span>
          </div>
          {/* Show RealCart Balance credit breakdown for split payments (Meesho-style) */}
          {(order.walletAppliedAmount ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-violet-600 dark:text-violet-400 flex items-center gap-0.5">
                <Wallet className="h-2.5 w-2.5" />
                Balance −{formatPrice(order.walletAppliedAmount)}
              </span>
              <span className="text-gray-300 dark:text-gray-700">•</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Paid {formatPrice(order.totalAmount - (order.walletAppliedAmount ?? 0))}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setShowInvoice(true) }}
            className={cn(
              'h-7 w-7 flex items-center justify-center rounded-lg transition-colors',
              showCreditNoteInstead
                ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
            )}
            title={showCreditNoteInstead ? t('orders.viewCreditNote') : t('orders.viewInvoice')}
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
          {actionInfo && (
            <button
              onClick={(e) => { e.stopPropagation(); onClick() }}
              className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors', actionInfo.color)}
            >
              {actionInfo.label}
            </button>
          )}
        </div>
      </div>

      {/* Document Dialog — Credit Note for cancelled/returned orders, Invoice otherwise */}
      {showCreditNoteInstead ? (
        <CreditNoteDialog
          isOpen={showInvoice}
          onClose={() => setShowInvoice(false)}
          orderId={order.orderId}
          creditNoteNumber={order.creditNoteNumber}
          customerEmail={order.customerEmail}
        />
      ) : (
        <InvoiceDialog
          isOpen={showInvoice}
          onClose={() => setShowInvoice(false)}
          orderId={order.orderId}
          invoiceNumber={order.invoiceNumber}
          customerEmail={order.customerEmail}
        />
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Order Detail View                                                   */
/* ------------------------------------------------------------------ */

interface OrderDetailData {
  order: Order
  otps: { code: string; type: 'delivery' | 'pickup'; expiresAt: string; orderItemId: string }[]
  statusLogs: OrderStatusLog[]
}

function OrderDetailView({
  order,
  detailData,
  onBack,
  onAction,
  actionLoading,
  onNavigate,
}: {
  order: Order
  detailData: OrderDetailData | null
  onBack: () => void
  onAction: (action: 'cancel' | 'return' | 'cancel-return', orderItemId?: string, reason?: string) => void
  actionLoading: string | null
  onNavigate?: (tab: string) => void
}) {
  const status = normalizeStatus(order.status)
  const config = STATUS_CONFIG[status]
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [returnItemId, setReturnItemId] = useState<string>('')
  const [copiedOtp, setCopiedOtp] = useState<string | null>(null)
  const [showInvoice, setShowInvoice] = useState(false)
  // Transaction ID expandable popover (shown on clicking the Payment Status badge)
  const [showTxnDetail, setShowTxnDetail] = useState(false)
  const [copiedTxn, setCopiedTxn] = useState<string | null>(null)
  const { t } = useLanguage()
  const hasCreditNote = !!(order.creditNoteNumber || (order.creditNotes && order.creditNotes.length > 0))
  // For cancelled OR return-completed orders with a credit note, the invoice
  // view button shows the credit note instead. Both are terminal statuses
  // where a credit note is issued (cancellation credit note or return credit
  // note) — matching the cancelled-order pattern for return-completed orders.
  const showCreditNoteInstead = (status === 'Cancelled' || status === 'Return Completed') && hasCreditNote

  // Group items by seller for detail view
  const sellerGroups = order.items.reduce<Record<string, OrderItem[]>>((acc, item) => {
    const key = item.sellerStoreName || item.sellerName || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const addressTypeIcon = order.shippingAddress.type === 'home' ? Home : order.shippingAddress.type === 'work' ? Building2 : Briefcase

  const handleCopyOTP = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedOtp(code)
      setTimeout(() => setCopiedOtp(null), 2000)
    }).catch(() => {
      // Fallback
    })
  }

  const handleReturnSubmit = (reason: string) => {
    onAction('return', returnItemId, reason)
    setShowReturnDialog(false)
  }

  const canCancel = status === 'Pending' || status === 'Processing'
  const canReturn = status === 'Delivered'
  const canCancelReturn = status === 'Return Requested'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-800 dark:text-gray-200 truncate">{t('orders.orderDetails')}</h1>
            <p className="text-[10px] font-mono text-gray-400">{order.orderId}</p>
          </div>
          {/* Document quick-access button — Credit Note for cancelled/returned orders, Invoice otherwise */}
          <button
            onClick={() => setShowInvoice(true)}
            className={cn(
              'h-8 px-2.5 flex items-center gap-1.5 rounded-full transition-colors text-xs font-semibold',
              showCreditNoteInstead
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
            )}
            title={showCreditNoteInstead ? t('orders.viewCreditNote') : t('orders.viewInvoice')}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{showCreditNoteInstead ? 'Credit Note' : 'Invoice'}</span>
          </button>
          <OrderStatusBadge status={status} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 space-y-4">

          {/* OTP Section — Most prominent */}
          {detailData?.otps && detailData.otps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <OTPDisplayBox otps={detailData.otps} onCopy={handleCopyOTP} />
            </motion.div>
          )}

          {/* Order Summary Card */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <StatusIcon status={status} className={cn('h-4 w-4', config.color)} />
              <span className={cn('text-sm font-bold', config.color)}>{config.label}</span>
            </div>
            <p className="text-xs text-gray-400">{config.description}</p>

            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-400">{t('orders.orderDate')}</span>
                <p className="font-semibold text-gray-700 dark:text-gray-300 mt-0.5">{formatDate(order.createdAt)}</p>
              </div>
              <div>
                <span className="text-gray-400">{t('orders.payment')}</span>
                <p className="font-semibold text-gray-700 dark:text-gray-300 mt-0.5 flex items-center gap-1">
                  {order.paymentMethod === 'cod' ? 'COD' : order.paymentMethodDetail === 'upi' ? 'UPI' : order.paymentMethodDetail === 'card' ? 'Card' : order.paymentMethodDetail === 'netbanking' ? 'Net Banking' : 'Online'}
                  {order.paymentStatus === 'paid' && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="Paid" />
                  )}
                </p>
              </div>
              {order.estimatedDelivery && (
                <div>
                  <span className="text-gray-400">{t('orders.estDelivery')}</span>
                  <p className="font-semibold text-gray-700 dark:text-gray-300 mt-0.5">
                    {formatDate(order.estimatedDelivery)}
                  </p>
                  {/* Show delivery option badge (Standard / Express) if present */}
                  {order.deliveryOption === 'express' && (
                    <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      ⚡ Express
                    </span>
                  )}
                  {order.deliveryOption === 'standard' && (
                    <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      Standard
                    </span>
                  )}
                </div>
              )}
              {order.deliveredAt && (
                <div>
                  <span className="text-gray-400">{t('orders.deliveredOn')}</span>
                  <p className="font-semibold text-emerald-600 mt-0.5">{formatDate(order.deliveredAt)}</p>
                </div>
              )}
              {order.cancelledAt && (
                <div>
                  <span className="text-gray-400">{t('orders.cancelledOn')}</span>
                  <p className="font-semibold text-red-500 mt-0.5">{formatDate(order.cancelledAt)}</p>
                </div>
              )}
            </div>

            {order.cancellationReason && (
              <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                <p className="text-xs text-red-600 dark:text-red-400">
                  <span className="font-semibold">Cancel reason:</span> {order.cancellationReason}
                </p>
              </div>
            )}
          </div>

          {/* Items by Vendor */}
          {Object.entries(sellerGroups).map(([sellerName, items]) => (
            <div
              key={sellerName}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
            >
              {/* Seller Header */}
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <Store className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  {sellerName}
                </span>
              </div>

              {/* Items */}
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {items.map((item, idx) => {
                  const itemStatus = normalizeStatus(item.status)
                  const itemConfig = STATUS_CONFIG[itemStatus]

                  return (
                    <div key={item._id || idx} className="flex gap-3 p-3">
                      {/* Image */}
                      <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800">
                        {item.productImage ? (
                          <img
                            src={item.productImage}
                            alt={item.productName}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-5 w-5 text-gray-300" />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 leading-tight">
                          {item.productName}
                        </p>
                        {formatVariant(item.variant) && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{formatVariant(item.variant)}</p>
                        )}
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-500">
                            Qty: {item.quantity} × {formatPrice(item.effectivePrice ?? item.price)}
                            {(item.discountAmount ?? 0) > 0 && item.effectivePrice != null && item.effectivePrice < item.price && (
                              <span className="text-gray-400 line-through ml-1">{formatPrice(item.price)}</span>
                            )}
                          </span>
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatPrice(item.total)}</span>
                        </div>

                        {/* Per-item status */}
                        <div className="flex items-center justify-between mt-1.5">
                          <OrderStatusBadge status={itemStatus} />
                          {/* Per-item action buttons */}
                          <div className="flex items-center gap-2">
                            {itemStatus === 'Delivered' && (
                              <button
                                onClick={() => {
                                  // Navigate to product page with review=true to auto-open review modal
                                  window.location.href = `/customer/product/${item.productId}?review=true&orderId=${order.orderId || order._id}&orderItemId=${item._id}`
                                }}
                                className="text-[10px] font-semibold text-emerald-500 hover:text-emerald-600 px-2 py-1 rounded transition-colors flex items-center gap-1"
                              >
                                <Star className="h-3 w-3" />
                                Write Review
                              </button>
                            )}
                            {itemStatus === 'Delivered' && (
                              <button
                                onClick={() => {
                                  setReturnItemId(item._id || '')
                                  setShowReturnDialog(true)
                                }}
                                className="text-[10px] font-semibold text-orange-500 hover:text-orange-600 px-2 py-1 rounded transition-colors"
                              >
                                {t('orders.return')}
                              </button>
                            )}
                          </div>
                          {itemStatus === 'Return Requested' && (
                            <button
                              onClick={() => onAction('cancel-return', item._id)}
                              disabled={actionLoading === `cancel-return-${item._id}`}
                              className="text-[10px] font-semibold text-red-500 hover:text-red-600 px-2 py-1 rounded transition-colors flex items-center gap-1"
                            >
                              {actionLoading === `cancel-return-${item._id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : null}
                              Cancel Return
                            </button>
                          )}
                        </div>

                        {/* Delivery boy info */}
                        {item.deliveryBoyName && (itemStatus === 'Out for Delivery' || itemStatus === 'Out for Pickup') && (
                          <div className="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5 text-gray-400" />
                            <div>
                              <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{item.deliveryBoyName}</p>
                              {item.deliveryBoyPhone && (
                                <p className="text-[10px] text-gray-400">{item.deliveryBoyPhone}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Shipping Address */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Shipping Address</h3>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                {(() => { const Icon = addressTypeIcon; return <Icon className="h-3.5 w-3.5 text-gray-400" /> })()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {order.shippingAddress.name}
                  </span>
                  {order.shippingAddress.type && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 uppercase font-medium">
                      {order.shippingAddress.type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{order.shippingAddress.phone}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                  {order.shippingAddress.addressLine1}
                  {order.shippingAddress.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ''}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              {order.paymentMethod === 'cod' ? (
                <Banknote className="h-4 w-4 text-emerald-500" />
              ) : (
                <CreditCard className="h-4 w-4 text-emerald-500" />
              )}
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Payment Details</h3>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Payment Method</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethodDetail
                    ? order.paymentMethodDetail === 'upi' ? 'UPI'
                      : order.paymentMethodDetail === 'card' ? 'Credit/Debit Card'
                        : order.paymentMethodDetail === 'netbanking' ? 'Net Banking'
                          : order.paymentMethodDetail === 'wallet' ? 'Wallet'
                            : order.paymentMethodDetail === 'wallet_balance' ? 'RealCart Balance'
                              : order.paymentMethodDetail === 'emi' ? 'EMI'
                                : 'Online Payment'
                    : 'Online Payment'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Payment Status</span>
                {order.paymentStatus === 'paid' && order.razorpayPaymentId ? (
                  <button
                    onClick={() => setShowTxnDetail(!showTxnDetail)}
                    className="inline-flex items-center gap-1 transition-transform active:scale-95"
                    aria-label="View transaction details"
                  >
                    <Badge
                      className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity',
                        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      )}
                      variant="outline"
                    >
                      Paid
                    </Badge>
                    <ChevronDown className={cn('h-3 w-3 text-emerald-500 transition-transform', showTxnDetail && 'rotate-180')} />
                  </button>
                ) : (
                  <Badge
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                      order.paymentStatus === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : order.paymentStatus === 'refunded'
                          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    )}
                    variant="outline"
                  >
                    {order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus === 'refunded' ? 'Refunded' : 'Pending'}
                  </Badge>
                )}
              </div>
              {/* Expandable transaction details (shown on clicking Payment Status) */}
              <AnimatePresence>
                {showTxnDetail && order.paymentStatus === 'paid' && order.razorpayPaymentId && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1.5 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-100 dark:border-emerald-800/30 p-3">
                      {/* Transaction ID header */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <Hash className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Transaction ID</span>
                      </div>
                      {/* Transaction ID value + copy */}
                      <div className="flex items-center justify-between gap-2 bg-white/60 dark:bg-gray-900/40 rounded-lg px-2.5 py-2">
                        <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 truncate">
                          {order.razorpayPaymentId}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(order.razorpayPaymentId!)
                            setCopiedTxn(order.razorpayPaymentId!)
                            setTimeout(() => setCopiedTxn(null), 2000)
                          }}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-colors flex-shrink-0"
                          aria-label="Copy Transaction ID"
                        >
                          {copiedTxn === order.razorpayPaymentId ? (
                            <>
                              <Check className="h-3 w-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      {/* Payment method sub-details (kept here, moved from the removed rows) */}
                      {order.paymentMethodDetail === 'wallet_balance' && (
                        <div className="flex justify-between gap-2 mt-2 text-[11px]">
                          <span className="text-gray-500">Payment Source</span>
                          <span className="font-medium text-violet-600 dark:text-violet-400">RealCart Balance</span>
                        </div>
                      )}
                      {order.paymentVpa && (
                        <div className="flex justify-between gap-2 mt-1.5 text-[11px]">
                          <span className="text-gray-500">UPI ID</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{order.paymentVpa}</span>
                        </div>
                      )}
                      {order.paymentCardLast4 && (
                        <div className="flex justify-between gap-2 mt-1.5 text-[11px]">
                          <span className="text-gray-500">Card</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {order.paymentCardNetwork ? `${order.paymentCardNetwork} ` : ''}**** {order.paymentCardLast4}
                          </span>
                        </div>
                      )}
                      {order.paymentBank && (
                        <div className="flex justify-between gap-2 mt-1.5 text-[11px]">
                          <span className="text-gray-500">Bank</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">{order.paymentBank}</span>
                        </div>
                      )}
                      {order.paymentWallet && (
                        <div className="flex justify-between gap-2 mt-1.5 text-[11px]">
                          <span className="text-gray-500">Wallet</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{order.paymentWallet}</span>
                        </div>
                      )}
                      {order.paidAt && (
                        <div className="flex justify-between gap-2 mt-1.5 text-[11px]">
                          <span className="text-gray-500">Paid On</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {new Date(order.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Removed: Transaction ID + Order ID rows (now shown in the expandable popover above) */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 space-y-1.5">
                {(() => {
                  // Aggregate ALL discounts for clear display + Total Savings summary.
                  // The product discount is split into a regular markdown
                  // ("Product Discount") and a distinct "Special Offer" line when a
                  // limited-time specialPrice was active at the time of purchase —
                  // matching Flipkart / Amazon / Meesho UX.
                  const specialDisc = (order.specialOfferDiscount ?? 0) > 0 ? (order.specialOfferDiscount ?? 0) : 0
                  // Regular product discount = total product discount − special-offer portion
                  const productDisc = Math.max(0, (order.productDiscount ?? 0) - specialDisc)
                  const couponDisc = order.couponCode && (order.couponDiscount ?? 0) > 0 ? (order.couponDiscount ?? 0) : 0
                  // Legacy orders may only have `discount` (total) without productDiscount/couponDiscount
                  const legacyDisc = (productDisc === 0 && specialDisc === 0 && couponDisc === 0 && (order.discount ?? 0) > 0) ? (order.discount ?? 0) : 0
                  const totalSavings = productDisc + specialDisc + couponDisc + legacyDisc

                  // === Price After Discount — computed from ACTUAL stored tax values ===
                  // We use `totalTaxableValue + totalGst` (what the customer actually
                  // pays for items, tax-inclusive) instead of `subtotal - productDiscount`.
                  // These two should be equal for new orders, but may differ for legacy
                  // orders created before the GST-inclusive-delivery fix (where the
                  // totalAmount included a separate GST-on-delivery line that wasn't
                  // reflected in the breakdown). Using the stored tax values ensures
                  // the breakdown ALWAYS reconciles to order.totalAmount.
                  // Fallback for very old orders without tax fields: subtotal - savings.
                  const storedItemsTotal = (order.totalTaxableValue ?? 0) + (order.totalGst ?? 0)
                  const priceAfterDiscount = storedItemsTotal > 0
                    ? storedItemsTotal
                    : Math.max(0, (order.subtotal ?? 0) - totalSavings)

                  // === Taxes & Adjustments — catches any residual difference ===
                  // For new orders (GST-inclusive delivery): this is 0 or a tiny
                  // rounding amount (< ₹1) absorbed by the final rupee rounding.
                  // For legacy orders (pre-GST-inclusive fix): this captures the
                  // old GST-on-delivery that was baked into totalAmount but not
                  // shown as a separate line. Showing it here ensures the
                  // breakdown ALWAYS sums to Total Payable — exactly like
                  // Flipkart/Amazon's "Taxes" or "Round Off" line.
                  const deliveryFee = order.deliveryFee ?? 0
                  const codFee = order.codFee ?? 0
                  const platformFee = order.platformFee ?? 0
                  const additiveSum = priceAfterDiscount + deliveryFee + codFee + platformFee - couponDisc
                  const taxesAndAdjustments = Math.round(((order.totalAmount ?? 0) - additiveSum) * 100) / 100

                  return (
                    <>
                      {/* Row 1: Subtotal (MRP) — sum of all items' original prices */}
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Subtotal (MRP)</span>
                        <span className="text-gray-600 dark:text-gray-400">{formatPrice(order.subtotal)}</span>
                      </div>
                      {/* Row 2: Product Discount — regular markdown (MRP → sellingPrice) */}
                      {productDisc > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Product Discount</span>
                          <span className="text-emerald-500 font-medium">- {formatPrice(productDisc)}</span>
                        </div>
                      )}
                      {/* Row 3: Special Offer — limited-time deal (sellingPrice → effectivePrice), highlighted */}
                      {specialDisc > 0 && (
                        <div className="flex justify-between text-xs bg-amber-50 dark:bg-amber-900/20 -mx-1 px-2 py-1 rounded">
                          <span className="text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            Special Offer
                          </span>
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">- {formatPrice(specialDisc)}</span>
                        </div>
                      )}
                      {/* Row 4: Coupon Discount — additional coupon savings */}
                      {couponDisc > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Coupon ({order.couponCode})</span>
                          <span className="text-emerald-500 font-medium">- {formatPrice(couponDisc)}</span>
                        </div>
                      )}
                      {/* Row 5: Legacy Discount fallback (for old orders without productDiscount/couponDiscount) */}
                      {legacyDisc > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Discount</span>
                          <span className="text-emerald-500 font-medium">- {formatPrice(legacyDisc)}</span>
                        </div>
                      )}
                      {/* Row 6: Total Savings — highlighted summary of ALL discounts */}
                      {totalSavings > 0 && (
                        <div className="flex justify-between text-xs bg-emerald-50 dark:bg-emerald-900/20 -mx-1 px-2 py-1 rounded">
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Total Savings</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">- {formatPrice(totalSavings)}</span>
                        </div>
                      )}
                      {/* Row 7: Price After Discount — the actual items total (tax-inclusive)
                          computed from stored totalTaxableValue + totalGst so the breakdown
                          always reconciles to Total Payable. */}
                      <div className="flex justify-between text-xs border-t border-dashed border-gray-100 dark:border-gray-800 pt-1.5">
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Price After Discount</span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{formatPrice(priceAfterDiscount)}</span>
                      </div>
                      {/* Row 8: Delivery Fee — additive. Shows the chosen option's label. */}
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 flex items-center gap-1.5">
                          Delivery Fee
                          {order.deliveryOption === 'express' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                              ⚡ Express
                            </span>
                          )}
                          {order.deliveryOption === 'standard' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                              Standard
                            </span>
                          )}
                        </span>
                        <span className={deliveryFee === 0 ? 'text-emerald-500 font-medium' : 'text-gray-600 dark:text-gray-400'}>
                          {deliveryFee === 0 ? 'FREE' : formatPrice(deliveryFee)}
                        </span>
                      </div>
                      {/* Row 9: COD Fee — additive (only for COD orders) */}
                      {codFee > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">COD Fee</span>
                          <span className="text-gray-600 dark:text-gray-400">{formatPrice(codFee)}</span>
                        </div>
                      )}
                      {/* Row 10: Platform Fee — additive */}
                      {platformFee > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Platform Fee</span>
                          <span className="text-gray-600 dark:text-gray-400">{formatPrice(platformFee)}</span>
                        </div>
                      )}
                      {/* Row 11: Taxes & Adjustments — inclusive taxes + rounding.
                          Only shown when non-zero. For new orders this is typically ₹0
                          (GST is already inside effectivePrice and deliveryFee). For
                          legacy orders created before the GST-inclusive-delivery fix,
                          this captures the old GST-on-delivery that was baked into
                          totalAmount. Ensures the breakdown ALWAYS sums to Total Payable. */}
                      {Math.abs(taxesAndAdjustments) >= 1 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Taxes &amp; Adjustments</span>
                          <span className="text-gray-600 dark:text-gray-400">{formatPrice(taxesAndAdjustments)}</span>
                        </div>
                      )}
                      {/* Row 12: Total Payable */}
                      <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-1.5">
                        <span className="font-bold text-gray-800 dark:text-gray-200">Total Payable</span>
                        <span className="font-bold text-gray-800 dark:text-gray-200">{formatPrice(order.totalAmount)}</span>
                      </div>
                      {/* Row 13: RealCart Balance credit (Meesho-style split payment) */}
                      {(order.walletAppliedAmount ?? 0) > 0 && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-violet-600 dark:text-violet-400 flex items-center gap-1">
                              <Wallet className="h-3 w-3" />
                              RealCart Balance
                            </span>
                            <span className="text-violet-600 dark:text-violet-400 font-semibold">−{formatPrice(order.walletAppliedAmount)}</span>
                          </div>
                          <div className="border-t border-dashed border-gray-300 dark:border-gray-600 pt-1.5 flex justify-between">
                            <span className="font-bold text-gray-800 dark:text-gray-200">Amount Paid Online</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(order.totalAmount - (order.walletAppliedAmount ?? 0))}</span>
                          </div>
                        </>
                      )}
                      <p className="text-[10px] text-gray-400 text-right">inclusive of all taxes</p>
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Document Download Button — Credit Note for cancelled/returned orders, Invoice otherwise */}
            <button
              onClick={() => setShowInvoice(true)}
              className={cn(
                'w-full mt-3 h-10 rounded-lg border transition-colors flex items-center justify-center gap-2 text-xs font-semibold',
                showCreditNoteInstead
                  ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                  : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
              )}
            >
              <FileText className="h-4 w-4" />
              {showCreditNoteInstead ? 'View / Download Credit Note' : 'View / Download Invoice'}
              {showCreditNoteInstead
                ? (order.creditNoteNumber && <span className="text-[10px] font-mono opacity-70">({order.creditNoteNumber})</span>)
                : (order.invoiceNumber && <span className="text-[10px] font-mono opacity-70">({order.invoiceNumber})</span>)
              }
            </button>
          </div>

          {/* Return Info */}
          {order.returnId && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Return Information</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Return ID</span>
                  <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{order.returnId}</span>
                </div>
                {order.returnReason && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Reason</span>
                    <span className="text-gray-700 dark:text-gray-300 max-w-[200px] text-right">{order.returnReason}</span>
                  </div>
                )}
                {order.returnRequestedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Requested On</span>
                    <span className="text-gray-700 dark:text-gray-300">{formatDate(order.returnRequestedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Timeline */}
          {detailData?.statusLogs && detailData.statusLogs.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Status Timeline</h3>
              <StatusTimeline logs={detailData.statusLogs} />
            </div>
          )}
        </div>
      </div>

      {/* Sticky Action Footer */}
      {(canCancel || canReturn || canCancelReturn) && (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3">
          <div className="flex gap-3 max-w-3xl mx-auto">
            {canCancel && (
              <Button
                variant="outline"
                className="flex-1 border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                onClick={() => setShowCancelDialog(true)}
                disabled={actionLoading === 'cancel'}
              >
                {actionLoading === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                {t('orders.cancelOrder')}
              </Button>
            )}
            {canReturn && order.items.length > 0 && (
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => {
                  // Default to first item if only one, or let user pick in detail
                  const firstItem = order.items[0]
                  setReturnItemId(firstItem._id || '')
                  setShowReturnDialog(true)
                }}
                disabled={actionLoading === 'return'}
              >
                {actionLoading === 'return' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Return Item
              </Button>
            )}
            {canCancelReturn && (
              <Button
                variant="outline"
                className="flex-1 border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                onClick={() => onAction('cancel-return')}
                disabled={actionLoading === 'cancel-return'}
              >
                {actionLoading === 'cancel-return' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancel Return
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ReturnRequestDialog
        key={showReturnDialog ? 'open' : 'closed'}
        isOpen={showReturnDialog}
        onClose={() => setShowReturnDialog(false)}
        onSubmit={handleReturnSubmit}
        loading={actionLoading === 'return'}
      />
      <CancelDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onSubmit={() => onAction('cancel')}
        loading={actionLoading === 'cancel'}
        title="Cancel Order?"
        description="This action cannot be undone. Are you sure you want to cancel this order?"
      />
      {/* Document Dialog — Credit Note for cancelled/returned orders, Invoice otherwise */}
      {showCreditNoteInstead ? (
        <CreditNoteDialog
          isOpen={showInvoice}
          onClose={() => setShowInvoice(false)}
          orderId={order.orderId}
          creditNoteNumber={order.creditNoteNumber}
          customerEmail={order.customerEmail}
        />
      ) : (
        <InvoiceDialog
          isOpen={showInvoice}
          onClose={() => setShowInvoice(false)}
          orderId={order.orderId}
          invoiceNumber={order.invoiceNumber}
          customerEmail={order.customerEmail}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Orders Page                                                    */
/* ------------------------------------------------------------------ */

export function OrdersPage({ onBack, onNavigate }: { onBack?: () => void; onNavigate?: (tab: string) => void }) {
  const { authenticated } = useCustomerAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [detailData, setDetailData] = useState<OrderDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const { totalItems: wishlistCount } = useWishlist()
  const { t } = useLanguage()

  // Track if we've already attempted to load an order detail from URL orderId
  const urlOrderIdLoaded = useRef(false)
  // Track if the order detail was opened from a notification (deep link)
  // — if so, pressing back from the detail view should go directly to the
  // previous page (notifications), not the orders list.
  const openedFromDeepLink = useRef(false)
  // Track if we're loading a deep-linked order detail — while true, we show
  // a detail loading skeleton instead of the orders list.
  const [deepLinkLoading, setDeepLinkLoading] = useState(false)

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!authenticated) return
    try {
      setLoading(true)
      setError('')
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', '10')
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/customer/orders?${params}`)
      if (!res.ok) throw new Error('Failed to fetch orders')
      const data = await res.json().catch(() => ({}))
      setOrders(data.orders || [])
      setTotalPages(data.totalPages || 1)
    } catch {
      setError('Failed to load orders. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [authenticated, page, statusFilter])

  useEffect(() => {
    // Skip fetching the orders list if we're deep-linking to a specific order detail
    // (from a notification). The order detail will be loaded by the URL orderId effect below.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('orderId')) {
        setLoading(false)
        return
      }
    }
    fetchOrders()
  }, [fetchOrders])

  // Fetch order detail with OTP
  const fetchOrderDetail = useCallback(async (orderId: string) => {
    try {
      setDetailLoading(true)
      const res = await fetch(`/api/customer/orders?id=${orderId}`)
      if (!res.ok) throw new Error('Failed to fetch order detail')
      const data = await res.json().catch(() => ({}))
      setDetailData(data)
      setSelectedOrder(data.order)
    } catch {
      // If detail fails, still show the order card data
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // Helper: update URL with or without orderId
  const updateUrlOrderId = useCallback((orderId: string | null) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (orderId) {
      url.searchParams.set('orderId', orderId)
    } else {
      url.searchParams.delete('orderId')
    }
    window.history.replaceState({}, '', url.toString())
  }, [])

  // Auto-load order detail from URL orderId on mount / refresh
  useEffect(() => {
    if (urlOrderIdLoaded.current) return
    urlOrderIdLoaded.current = true
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const orderId = params.get('orderId')
    if (orderId) {
      openedFromDeepLink.current = true
      setDeepLinkLoading(true)
      fetchOrderDetail(orderId).finally(() => setDeepLinkLoading(false))
    }
  }, [fetchOrderDetail])

  // Handle clicking an order
  const handleOrderClick = useCallback((order: Order) => {
    openedFromDeepLink.current = false
    setSelectedOrder(order)
    setDetailData(null)
    fetchOrderDetail(order.orderId)
    updateUrlOrderId(order.orderId)
  }, [fetchOrderDetail, updateUrlOrderId])

  // Handle action
  const handleAction = useCallback(async (action: 'cancel' | 'return' | 'cancel-return', orderItemId?: string, reason?: string) => {
    if (!selectedOrder) return
    const actionKey = orderItemId ? `${action}-${orderItemId}` : action
    try {
      setActionLoading(actionKey)
      const res = await fetch('/api/customer/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          orderId: selectedOrder.orderId,
          orderItemId,
          reason,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Action failed')

      // Refresh detail
      await fetchOrderDetail(selectedOrder.orderId)
      // Also refresh the list
      fetchOrders()
    } catch (err) {
      console.error('Order action error:', err)
      setError(err instanceof Error ? err.message : 'Action failed. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }, [selectedOrder, fetchOrderDetail, fetchOrders])

  // Filter orders by search
  const filteredOrders = searchQuery
    ? orders.filter((order) =>
        order.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.items.some(item =>
          item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.sellerStoreName?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : orders

  // Loading state — also guard when loading order detail from URL (prevent flash of orders list)
  // When deepLinkLoading is true (coming from notification), show an order-detail-style
  // loading skeleton (NOT the orders list skeleton) so the customer sees "Order Details"
  // loading, not "My Orders" loading.
  if ((loading && orders.length === 0) || (detailLoading && !selectedOrder) || deepLinkLoading) {
    const isDeepLink = deepLinkLoading || (detailLoading && !selectedOrder)
    return (
      <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-[calc(100dvh)]">
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {onBack && (
                <button onClick={onBack} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                </button>
              )}
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {isDeepLink ? t('orders.orderDetails') : t('orders.title')}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <div className="h-9 w-9" />
              <div className="h-9 w-9" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {isDeepLink ? (
            // Order detail loading skeleton — looks like a detail page, not a list
            <>
              <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            </>
          ) : (
            // Orders list loading skeleton
            [1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))
          )}
        </div>
      </div>
    )
  }

  // Detail View
  if (selectedOrder) {
    return (
      <OrderDetailView
        order={selectedOrder}
        detailData={detailData}
        onBack={() => {
          if (openedFromDeepLink.current && onBack) {
            // Opened from a notification deep link — go directly back to the
            // previous page (notifications), not the orders list.
            openedFromDeepLink.current = false
            onBack()
          } else {
            // Opened from the orders list — go back to the list
            setSelectedOrder(null)
            setDetailData(null)
            updateUrlOrderId(null)
          }
        }}
        onAction={handleAction}
        actionLoading={actionLoading}
        onNavigate={onNavigate}
      />
    )
  }

  // Error state
  if (error && orders.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-[calc(100dvh)]">
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  onClick={onBack}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                </button>
              )}
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200">{t('orders.title')}</h1>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <div className="h-9 w-9" />
              <button
                onClick={() => onNavigate?.('wishlist')}
                className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
              >
                <Heart className="h-5 w-5" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                    {wishlistCount > 99 ? '99+' : wishlistCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <Button onClick={fetchOrders} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  // Status filter options
  const statusFilters = [
    { value: '', label: t('orders.statusAll') },
    { value: 'Pending', label: t('orders.statusPending') },
    { value: 'Processing', label: t('orders.statusProcessing') },
    { value: 'Shipped', label: t('orders.statusShipped') },
    { value: 'Out for Delivery', label: t('orders.statusOutForDelivery') },
    { value: 'Delivered', label: t('orders.statusDelivered') },
    { value: 'Cancelled', label: t('orders.statusCancelled') },
    { value: 'Return Requested', label: t('orders.statusReturn') },
  ]

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-[calc(100dvh)]">
      {/* ── Sticky Header Bar ── */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">{t('orders.title')}</h1>
            </div>
          </div>

          {/* Right Icons: Search → Wishlist */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="h-9 w-9 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Wishlist Icon with Badge */}
            <button
              onClick={() => onNavigate?.('wishlist')}
              className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Heart className="h-5 w-5" />
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {wishlistCount > 99 ? '99+' : wishlistCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Expandable Search */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="flex items-center h-9 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 gap-2 mt-2">
                <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('orders.searchPlaceholder')}
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => { setShowSearch(false); setSearchQuery('') }} className="text-gray-400 hover:text-gray-600 ml-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Filter Chips */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1) }}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors',
                statusFilter === f.value
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {orders.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[400px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center gap-5"
            >
              <div className="relative">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-50 to-orange-50 dark:from-emerald-900/20 dark:to-orange-900/20 flex items-center justify-center">
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <ShoppingBag className="h-12 w-12 text-emerald-300 dark:text-emerald-600" />
                  </motion.div>
                </div>
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-orange-200 dark:bg-orange-800/50" />
                <div className="absolute -bottom-1 -left-3 w-3 h-3 rounded-full bg-emerald-200 dark:bg-emerald-800/50" />
              </div>

              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">{t('orders.empty')}</h2>
                <p className="text-sm text-gray-400 max-w-[250px]">
                  {t('orders.emptyDesc')}
                </p>
              </div>
              {onBack && (
                <button
                  onClick={onBack}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors shadow-sm"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {t('common.startShopping')}
                </button>
              )}
            </motion.div>
          </div>
        ) : filteredOrders.length === 0 ? (
          /* Search no results */
          <div className="flex flex-col items-center justify-center p-6 min-h-[300px]">
            <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500">{t('orders.noMatch', { query: searchQuery })}</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {t('common.clearSearch')}
            </button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-4 space-y-3">
            <AnimatePresence>
              {filteredOrders.map((order) => (
                <OrderCard
                  key={order.orderId}
                  order={order}
                  onClick={() => handleOrderClick(order)}
                />
              ))}
            </AnimatePresence>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8 px-3 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-40 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  {t('common.previous')}
                </button>
                <span className="text-xs text-gray-400">
                  {t('orders.pageInfo', { page, total: totalPages })}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-8 px-3 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-40 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
