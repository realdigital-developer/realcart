'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Truck,
  RotateCcw,
  Loader2,
  Phone,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  PackageCheck,
  PackageX,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'
import { STATUS_CONFIG, formatVariant, type Order, type OrderStatus, type DeliveryAssignment } from '@/lib/order-types'
import { normalizeStatus } from '@/lib/order-state-machine'

/* ------------------------------------------------------------------ */
/*  Status Icon Mapping (module-level, no hooks)                        */
/* ------------------------------------------------------------------ */

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  clock: Clock,
  package: Package,
  truck: Truck,
  'check-circle': CheckCircle2,
  'x-circle': XCircle,
  'alert-triangle': AlertTriangle,
  'rotate-ccw': RotateCcw,
  'check-circle-2': PackageCheck,
}

function StatusIcon({ icon, className }: { icon: string; className?: string }) {
  const Comp = STATUS_ICONS[icon] || Package
  return <Comp className={className} />
}

/* ------------------------------------------------------------------ */
/*  Status Badge Component                                              */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: OrderStatus }) {
  const config = STATUS_CONFIG[status]
  if (!config) return <Badge variant="outline">{status}</Badge>

  return (
    <Badge
      className={cn(
        'border-0 gap-1 text-[10px] font-semibold px-2 py-0.5',
        config.bgColor,
        config.color
      )}
    >
      <StatusIcon icon={config.icon} className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

/* ------------------------------------------------------------------ */
/*  Relative Time Helper                                                */
/* ------------------------------------------------------------------ */

function getRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ */
/*  Delivery Job — Separate tasks for delivery vs. return pickup        */
/* ------------------------------------------------------------------ */

/**
 * A DeliveryJob represents a SINGLE task (either delivery or return pickup)
 * for a delivery boy on a specific order.
 *
 * KEY DESIGN: An order can produce UP TO TWO jobs for the same delivery boy:
 *   1. A "delivery" job  — if deliveryBoyId matches (forward delivery)
 *   2. A "pickup" job    — if pickupDeliveryBoyId matches (return pickup)
 *
 * Each job is categorized INDEPENDENTLY into pending/active/completed tabs.
 * This ensures:
 *   - A completed delivery STAYS in the Completed tab even if the customer
 *     later requests a return (the delivery boy earned that job).
 *   - A return pickup appears as a SEPARATE entry in the Active tab.
 *   - The same order can appear in BOTH tabs with different badges
 *     ("Delivery" vs "Return Pickup").
 *   - No duplicate React keys (each job has a unique jobKey).
 */
interface DeliveryJob {
  order: Order
  /** Whether this job is a forward delivery or a return pickup */
  role: 'delivery' | 'pickup'
  /** Unique key for React rendering (order ID + role) */
  jobKey: string
}

/* ------------------------------------------------------------------ */
/*  Categorize Orders into Delivery Jobs                                */
/* ------------------------------------------------------------------ */

/**
 * Categorize orders into separate DeliveryJob entries for the delivery boy panel.
 *
 * Each order can produce 0, 1, or 2 jobs:
 *   - A "delivery" job if the delivery boy is assigned as the forward delivery person
 *   - A "pickup" job if the delivery boy is assigned as the return pickup person
 *
 * Each job is categorized independently based on the relevant items' statuses.
 * This ensures delivered orders stay in the Completed tab even after a return
 * is initiated, while the return pickup appears as a separate Active job.
 */
function categorizeOrders(orders: Order[], deliveryBoyId?: string): {
  pending: DeliveryJob[]
  active: DeliveryJob[]
  completed: DeliveryJob[]
} {
  const pending: DeliveryJob[] = []
  const active: DeliveryJob[] = []
  const completed: DeliveryJob[] = []

  /** Statuses where the delivery boy needs to take action on delivery items */
  const DELIVERY_ACTIVE_STATUSES: OrderStatus[] = [
    'Shipped',           // Can start delivery
    'Out for Delivery',  // Can mark delivered / not delivered
    'Not Delivered',     // Can retry delivery
  ]

  const PICKUP_ACTIVE_STATUSES: OrderStatus[] = [
    'Return Approved',   // Can start pickup
    'Out for Pickup',    // Can complete return (OTP)
  ]

  /**
   * Statuses considered "completed" for the DELIVERY role.
   * Once an item is Delivered, any subsequent return flow statuses still mean
   * the delivery person's job is DONE. The return pickup is a separate task.
   */
  const DELIVERY_COMPLETED_STATUSES: OrderStatus[] = [
    'Delivered',
    'Cancelled',
    // Return flow statuses on delivery items → delivery is done, return is separate
    'Return Requested',
    'Return Approved',
    'Out for Pickup',
    'Return Completed',
    'Return Cancelled',
  ]

  const PICKUP_COMPLETED_STATUSES: OrderStatus[] = [
    'Return Completed',
    'Return Cancelled',
  ]

  for (const order of orders) {
    // Find items where this delivery boy is involved
    const deliveryItems = (order.items || []).filter(item =>
      item.deliveryBoyId === deliveryBoyId
    )
    const pickupItems = (order.items || []).filter(item =>
      item.pickupDeliveryBoyId === deliveryBoyId
    )

    // ─── DELIVERY JOB ───
    if (deliveryItems.length > 0) {
      const job: DeliveryJob = {
        order,
        role: 'delivery',
        jobKey: `${order._id || order.orderId}-delivery`,
      }

      const hasActive = deliveryItems.some(item =>
        DELIVERY_ACTIVE_STATUSES.includes(normalizeStatus(item.status))
      )
      const hasCompleted = deliveryItems.some(item =>
        DELIVERY_COMPLETED_STATUSES.includes(normalizeStatus(item.status))
      )

      if (hasActive) {
        active.push(job)
      } else if (hasCompleted) {
        // Delivered items (even with return flow) → Completed tab
        completed.push(job)
      } else {
        // Pending / Processing items
        pending.push(job)
      }
    }

    // ─── PICKUP JOB ───
    if (pickupItems.length > 0) {
      const job: DeliveryJob = {
        order,
        role: 'pickup',
        jobKey: `${order._id || order.orderId}-pickup`,
      }

      const hasActive = pickupItems.some(item =>
        PICKUP_ACTIVE_STATUSES.includes(normalizeStatus(item.status))
      )
      const hasCompleted = pickupItems.some(item =>
        PICKUP_COMPLETED_STATUSES.includes(normalizeStatus(item.status))
      )
      const hasPending = pickupItems.some(item =>
        normalizeStatus(item.status) === 'Return Requested'
      )

      if (hasActive) {
        active.push(job)
      } else if (hasPending) {
        // Pickup assigned but seller hasn't approved yet → Active (informational)
        active.push(job)
      } else if (hasCompleted) {
        completed.push(job)
      }
    }
  }

  return { pending, active, completed }
}

/* ------------------------------------------------------------------ */
/*  OTP Dialog                                                          */
/* ------------------------------------------------------------------ */

function OTPDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  loading,
  error,
  remainingAttempts,
  isPickup,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onSubmit: (otp: string) => void
  loading: boolean
  error: string | null
  remainingAttempts?: number
  isPickup?: boolean
}) {
  const [otp, setOtp] = useState('')
  const [prevOpen, setPrevOpen] = useState(false)

  // Reset OTP when dialog opens (derive reset from open state change)
  if (open && !prevOpen) {
    setOtp('')
  }
  if (open !== prevOpen) {
    setPrevOpen(open)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <ShieldCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-center py-2">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={setOtp}
              pattern="^[0-9]+$"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2"
              >
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{error}</p>
                  {remainingAttempts !== undefined && remainingAttempts > 0 && (
                    <p className="text-muted-foreground mt-0.5">
                      {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-[10px] text-muted-foreground text-center">
            Ask the customer for the 6-digit OTP to verify {isPickup ? 'return pickup' : 'delivery'}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="min-h-[44px]">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={() => onSubmit(otp)}
            disabled={loading || otp.length < 6}
            className="min-h-[44px] bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Verify OTP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Reason Dialog (for Not Delivered)                                   */
/* ------------------------------------------------------------------ */

function ReasonDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (reason: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  const [prevOpen, setPrevOpen] = useState(false)

  // Reset reason when dialog opens (derive reset from open state change)
  if (open && !prevOpen) {
    setReason('')
  }
  if (open !== prevOpen) {
    setPrevOpen(open)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <PackageX className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            Mark as Not Delivered
          </DialogTitle>
          <DialogDescription>
            Please provide a reason why the delivery could not be completed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              'Customer not available',
              'Wrong address',
              'Customer refused',
              'No response',
            ].map((preset) => (
              <button
                key={preset}
                onClick={() => setReason(preset)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-[11px] font-medium transition-all text-left min-h-[44px]',
                  reason === preset
                    ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-400'
                    : 'border-border hover:border-orange-200 dark:hover:border-orange-800'
                )}
              >
                {preset}
              </button>
            ))}
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Or type a custom reason..."
            className="min-h-[72px] text-sm resize-none"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="min-h-[44px]">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={() => onSubmit(reason)}
            disabled={loading || !reason.trim()}
            className="min-h-[44px] bg-destructive hover:bg-destructive/90 text-white gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Assignment Card (pending assignments at top)                        */
/* ------------------------------------------------------------------ */

function AssignmentCard({
  assignment,
  onAccept,
  onReject,
  actionLoading,
}: {
  assignment: DeliveryAssignment
  onAccept: (id: string) => void
  onReject: (id: string) => void
  actionLoading: string | null
}) {
  const isLoading = actionLoading === assignment._id

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="border-orange-200 dark:border-orange-800/30 bg-orange-50/30 dark:bg-orange-950/10">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-sm">
                {assignment.type === 'pickup' ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold leading-tight">New Assignment</p>
                <p className="text-[10px] text-muted-foreground">
                  {assignment.type === 'pickup' ? 'Return Pickup' : 'Delivery'} from{' '}
                  {assignment.sellerName}
                </p>
              </div>
            </div>
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-[9px]">
              {getRelativeTime(assignment.assignedAt)}
            </Badge>
          </div>

          {/* Order ID */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono text-[11px]">{assignment.orderId}</span>
          </div>

          {/* Return ID for pickup assignments */}
          {assignment.type === 'pickup' && (assignment as Record<string, unknown>).returnId && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-100/60 dark:bg-orange-900/20 border border-orange-200/50 dark:border-orange-800/30">
              <RotateCcw className="h-3 w-3 text-orange-600 dark:text-orange-400 shrink-0" />
              <span className="text-[10px] font-semibold text-orange-700 dark:text-orange-400">Return:</span>
              <span className="text-[10px] font-mono font-bold text-orange-800 dark:text-orange-300">
                {String((assignment as Record<string, unknown>).returnId)}
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => onAccept(assignment._id!)}
              disabled={!!actionLoading}
              className="flex-1 min-h-[44px] bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-semibold gap-1.5"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Accept
            </Button>
            <Button
              onClick={() => onReject(assignment._id!)}
              disabled={!!actionLoading}
              variant="outline"
              className="flex-1 min-h-[44px] text-destructive border-destructive/30 hover:bg-destructive/10 text-sm font-semibold gap-1.5"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Reject
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Order Card                                                          */
/* ------------------------------------------------------------------ */

function OrderCard({
  order,
  onAction,
  actionLoading,
  deliveryBoyId,
  role,
}: {
  order: Order
  onAction: (action: string, order: Order, orderItemId?: string) => void
  actionLoading: string | null
  deliveryBoyId?: string
  /** Whether this card represents a delivery job or a return pickup job */
  role: 'delivery' | 'pickup'
}) {
  const [expanded, setExpanded] = useState(false)

  // Filter items based on the EXPLICIT role — no duplicates, no ambiguity.
  // Delivery role: show only items where this person is the delivery boy
  // Pickup role: show only items where this person is the pickup delivery boy
  const deliveryItems = (order.items || []).filter(
    (item) => item.deliveryBoyId === deliveryBoyId
  )
  const pickupItems = (order.items || []).filter(
    (item) => item.pickupDeliveryBoyId === deliveryBoyId
  )

  // Only show items relevant to THIS job's role — avoids duplicate keys
  const roleItems = role === 'pickup' ? pickupItems : deliveryItems
  const displayItems = roleItems.length > 0 ? roleItems : order.items || []

  /**
   * Determine the effective status for this order card based on the role.
   *
   * Delivery role:
   *   - Active statuses: Shipped, Out for Delivery, Not Delivered
   *   - Completed: Delivered (even if return flow started — delivery is DONE)
   *   - Any return-flow status on a delivery item → show "Delivered"
   *
   * Pickup role:
   *   - Active statuses: Return Approved, Out for Pickup
   *   - Completed: Return Completed, Return Cancelled
   */
  const effectiveStatus = (() => {
    if (role === 'pickup') {
      const priority: OrderStatus[] = [
        'Out for Pickup', 'Return Approved', 'Return Requested',
        'Return Completed', 'Return Cancelled',
        'Delivered', 'Cancelled',
      ]
      for (const s of priority) {
        if (pickupItems.some(item => normalizeStatus(item.status) === s)) return s
      }
    } else {
      // Delivery role — check active statuses first
      const activePriority: OrderStatus[] = [
        'Out for Delivery', 'Not Delivered', 'Shipped',
      ]
      for (const s of activePriority) {
        if (deliveryItems.some(item => normalizeStatus(item.status) === s)) return s
      }
      // Completed: if any delivery item was delivered or is in return flow,
      // the delivery boy's job is DONE → show 'Delivered'
      const completedStatuses: OrderStatus[] = [
        'Delivered', 'Cancelled',
        'Return Requested', 'Return Approved', 'Out for Pickup',
        'Return Completed', 'Return Cancelled',
      ]
      for (const s of completedStatuses) {
        if (deliveryItems.some(item => normalizeStatus(item.status) === s)) {
          // Return flow after delivery → still 'Delivered' from delivery perspective
          const normalizedStatuses = deliveryItems
            .filter(item => completedStatuses.includes(normalizeStatus(item.status)))
            .map(item => normalizeStatus(item.status))
          if (normalizedStatuses.includes('Delivered')) return 'Delivered'
          if (normalizedStatuses.includes('Cancelled')) return 'Cancelled'
          // Item in return flow after delivery → delivery is complete
          if (normalizedStatuses.some(s =>
            s === 'Return Requested' || s === 'Return Approved' ||
            s === 'Out for Pickup' || s === 'Return Completed' ||
            s === 'Return Cancelled'
          )) return 'Delivered'
          return s
        }
      }
    }
    return normalizeStatus(order.status)
  })()

  const config = STATUS_CONFIG[effectiveStatus]

  // Get the primary item that needs action (based on role)
  const primaryItem = (() => {
    if (role === 'pickup') {
      const priority: OrderStatus[] = [
        'Out for Pickup', 'Return Approved', 'Return Requested',
      ]
      for (const s of priority) {
        const item = pickupItems.find(i => normalizeStatus(i.status) === s)
        if (item) return item
      }
      return pickupItems[0]
    } else {
      const priority: OrderStatus[] = [
        'Out for Delivery', 'Not Delivered', 'Shipped',
      ]
      for (const s of priority) {
        const item = deliveryItems.find(i => normalizeStatus(i.status) === s)
        if (item) return item
      }
      return deliveryItems[0]
    }
  })()

  // Return ID — for pickup role, always show; for delivery role, informational
  const returnId = primaryItem?.returnId || order.returnId

  // Job type label for badge
  const jobTypeLabel = role === 'pickup' ? 'Return Pickup' : 'Delivery'

  // For delivery role, check if a return is in progress (informational badge)
  const hasReturnInProgress = role === 'delivery' && deliveryItems.some(item => {
    const s = normalizeStatus(item.status)
    return s === 'Return Requested' || s === 'Return Approved' ||
           s === 'Out for Pickup'
  })

  // Show return ID badge for pickup role (always) or delivery role (if return in progress)
  const showReturnBadge = role === 'pickup' ? !!returnId : (hasReturnInProgress && !!returnId)

  const getActionButtons = () => {
    // Delivery role actions
    if (role === 'delivery') {
      switch (effectiveStatus) {
        case 'Shipped':
          return (
            <Button
              onClick={() => onAction('out-for-delivery', order, primaryItem?._id)}
              disabled={!!actionLoading}
              className="w-full min-h-[44px] bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white text-sm font-semibold gap-1.5"
            >
              {actionLoading === `out-for-delivery-${order._id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
              Start Delivery
            </Button>
          )
        case 'Out for Delivery':
          return (
            <div className="flex flex-col gap-2 w-full">
              <Button
                onClick={() => onAction('delivered', order, primaryItem?._id)}
                disabled={!!actionLoading}
                className="w-full min-h-[44px] bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-semibold gap-1.5"
              >
                {actionLoading === `delivered-${order._id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Mark Delivered
              </Button>
              <Button
                onClick={() => onAction('not-delivered', order)}
                disabled={!!actionLoading}
                variant="outline"
                className="w-full min-h-[44px] text-orange-600 border-orange-200 dark:border-orange-800/30 hover:bg-orange-50 dark:hover:bg-orange-950/30 text-sm font-semibold gap-1.5"
              >
                {actionLoading === `not-delivered-${order._id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                Not Delivered
              </Button>
            </div>
          )
        case 'Not Delivered':
          return (
            <Button
              onClick={() => onAction('out-for-delivery', order, primaryItem?._id)}
              disabled={!!actionLoading}
              className="w-full min-h-[44px] bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white text-sm font-semibold gap-1.5"
            >
              {actionLoading === `out-for-delivery-${order._id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Retry Delivery
            </Button>
          )
        default:
          return null
      }
    }

    // Pickup role actions
    if (role === 'pickup') {
      switch (effectiveStatus) {
        case 'Out for Pickup':
          return (
            <Button
              onClick={() => onAction('return-completed', order, primaryItem?._id)}
              disabled={!!actionLoading}
              className="w-full min-h-[44px] bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-semibold gap-1.5"
            >
              {actionLoading === `return-completed-${order._id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Complete Return
            </Button>
          )
        case 'Return Approved':
          return (
            <Button
              onClick={() => onAction('out-for-pickup', order, primaryItem?._id)}
              disabled={!!actionLoading}
              className="w-full min-h-[44px] bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold gap-1.5"
            >
              {actionLoading === `out-for-pickup-${order._id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Start Pickup
            </Button>
          )
        case 'Return Requested':
          // No action for delivery boy — seller must approve first
          return (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800/30">
              <Clock className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <p className="text-[10px] text-cyan-700 dark:text-cyan-400 font-medium">
                Awaiting seller approval for return
              </p>
            </div>
          )
        default:
          return null
      }
    }

    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="border-border/60 hover:shadow-sm transition-shadow">
        <CardContent className="p-4 space-y-3">
          {/* Header: Order ID + Job Type + Status */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  'flex items-center justify-center h-9 w-9 rounded-xl shrink-0',
                  role === 'pickup'
                    ? 'bg-violet-500/10 dark:bg-violet-500/10'
                    : config?.bgColor || 'bg-muted/50'
                )}
              >
                {role === 'pickup' ? (
                  <RotateCcw className={cn('h-4 w-4', 'text-violet-600 dark:text-violet-400')} />
                ) : (
                  <StatusIcon
                    icon={config?.icon || 'package'}
                    className={cn('h-4 w-4', config?.color || 'text-muted-foreground')}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold leading-tight font-mono truncate">
                    {order.orderId}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn(
                    'text-[9px] font-semibold px-1.5 py-0.5 rounded-md',
                    role === 'pickup'
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                      : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                  )}>
                    {jobTypeLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {getRelativeTime(order.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <StatusBadge status={effectiveStatus} />
          </div>

          {/* Return ID badge for return flow */}
          {showReturnBadge && (
            <div className={cn(
              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg border',
              role === 'pickup'
                ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800/30'
                : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30'
            )}>
              <RotateCcw className={cn(
                'h-3 w-3 shrink-0',
                role === 'pickup'
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-amber-600 dark:text-amber-400'
              )} />
              <span className={cn(
                'text-[10px] font-semibold',
                role === 'pickup'
                  ? 'text-violet-700 dark:text-violet-400'
                  : 'text-amber-700 dark:text-amber-400'
              )}>
                {role === 'pickup' ? 'Return ID:' : 'Return in progress · ID:'}
              </span>
              <span className={cn(
                'text-[10px] font-mono font-bold',
                role === 'pickup'
                  ? 'text-violet-800 dark:text-violet-300'
                  : 'text-amber-800 dark:text-amber-300'
              )}>
                {returnId}
              </span>
            </div>
          )}
          {/* Delivery completed + return in progress informational badge */}
          {hasReturnInProgress && !showReturnBadge && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
              <RotateCcw className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Return in progress — delivery earnings preserved
              </span>
            </div>
          )}

          {/* Customer Info */}
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium leading-tight truncate">
                  {order.shippingAddress?.name || order.customerName}
                </p>
                <p className="text-[10px] text-muted-foreground line-clamp-2">
                  {order.shippingAddress?.addressLine1}
                  {order.shippingAddress?.addressLine2 && `, ${order.shippingAddress.addressLine2}`}
                  {`, ${order.shippingAddress?.city}, ${order.shippingAddress?.state} ${order.shippingAddress?.pincode}`}
                </p>
              </div>
            </div>
            {order.customerPhone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{order.customerPhone}</span>
              </div>
            )}
          </div>

          {/* Items Preview (collapsed: first 2 items) */}
          <div className="space-y-1.5">
            {displayItems.slice(0, expanded ? undefined : 2).map((item, idx) => (
              <div key={item._id || idx} className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-muted/50 overflow-hidden shrink-0">
                  {item.productImage ? (
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full w-full">
                      <Package className="h-3 w-3 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate">{item.productName}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {item.sellerStoreName}
                    {formatVariant(item.variant) ? ` · ${formatVariant(item.variant)}` : ''} · Qty: {item.quantity}
                  </p>
                </div>
                <span className="text-[11px] font-semibold shrink-0">
                  ₹{item.total || item.price * item.quantity}
                </span>
              </div>
            ))}
            {displayItems.length > 2 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[10px] text-orange-600 dark:text-orange-400 font-medium w-full justify-center py-1 min-h-[32px]"
              >
                {expanded ? (
                  <>
                    Show less <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    +{displayItems.length - 2} more item{displayItems.length - 2 > 1 ? 's' : ''}{' '}
                    <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Payment Method */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
            <span>
              {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid Online'}
            </span>
            <span className="font-semibold text-foreground text-xs">
              ₹{order.totalAmount}
            </span>
          </div>

          {/* Action Buttons */}
          {getActionButtons() && (
            <div className="pt-1">{getActionButtons()}</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                         */
/* ------------------------------------------------------------------ */

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">{description}</p>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Orders Page                                                         */
/* ------------------------------------------------------------------ */

export default function DeliveryOrdersPage() {
  const { handleAuthFailure, user } = useDeliveryBoyAuth()
  const deliveryBoyId = user?.id

  // Data state
  const [orders, setOrders] = useState<Order[]>([])
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([])
  const [totalOrders, setTotalOrders] = useState(0)
  const [activeTab, setActiveTab] = useState('pending')

  // Loading & error
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // OTP dialog state
  const [otpDialogOpen, setOtpDialogOpen] = useState(false)
  const [otpAction, setOtpAction] = useState<{
    action: 'delivered' | 'return-completed'
    orderId: string
    orderItemId?: string
  } | null>(null)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpRemainingAttempts, setOtpRemainingAttempts] = useState<number | undefined>()
  const [otpLoading, setOtpLoading] = useState(false)

  // Reason dialog state
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false)
  const [reasonAction, setReasonAction] = useState<{
    orderId: string
    orderItemId?: string
  } | null>(null)
  const [reasonLoading, setReasonLoading] = useState(false)

  // Polling refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFetchingRef = useRef(false)
  const mountedRef = useRef(false)

  /* ---------------------------------------------------------------- */
  /*  Fetch assignments + orders                                       */
  /* ---------------------------------------------------------------- */

  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      // Fetch assignments + orders in parallel
      const [assignmentsRes, ordersRes] = await Promise.all([
        fetch('/api/delivery-boy/orders?action=assignments', {
          signal: controller.signal,
          credentials: 'include',
        }),
        fetch('/api/delivery-boy/orders', {
          signal: controller.signal,
          credentials: 'include',
        }),
      ])
      clearTimeout(timeoutId)

      if (assignmentsRes.ok) {
        const assignmentsData = await assignmentsRes.json()
        setAssignments(assignmentsData.assignments || [])
      }

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json()
        setOrders(ordersData.orders || [])
        setTotalOrders(ordersData.total || 0)
        setError(null)
        setInitialLoading(false)
      } else if (ordersRes.status === 401) {
        // Ask auth provider to verify the session — may be transient
        const authResult = await handleAuthFailure()
        if (authResult === 'session_valid') {
          // The 401 was transient — retry the request immediately
          isFetchingRef.current = false
          fetchData()
          return
        } else if (authResult === 'session_expired') {
          if (!orders.length) {
            setError('Session expired. Redirecting to login...')
          }
        } else {
          // network_error — show retry message, not "session expired"
          if (!orders.length) {
            setError('Connection issue. Retrying...')
          }
        }
      } else if (!orders.length) {
        setError('Failed to load orders.')
      }
    } catch (err) {
      if (!orders.length) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Request timed out. Please check your connection.')
        } else {
          setError('Network error. Please try again.')
        }
      }
    } finally {
      isFetchingRef.current = false
      setInitialLoading(false)
    }
  }, [handleAuthFailure, orders.length])

  /* ---------------------------------------------------------------- */
  /*  Initial fetch on mount                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    return () => {
      mountedRef.current = false
    }
  }, [fetchData])

  /* ---------------------------------------------------------------- */
  /*  Polling                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const POLL_INTERVAL = 20_000

    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        if (mountedRef.current) fetchData()
      }, POLL_INTERVAL)
    }

    startPolling()

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData()
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchData])

  /* ---------------------------------------------------------------- */
  /*  Action Handler                                                   */
  /* ---------------------------------------------------------------- */

  const handleAction = useCallback((action: string, order: Order, orderItemId?: string) => {
    if (action === 'delivered' || action === 'return-completed') {
      // Open OTP dialog
      setOtpAction({
        action: action as 'delivered' | 'return-completed',
        orderId: order.orderId,
        orderItemId,
      })
      setOtpError(null)
      setOtpRemainingAttempts(undefined)
      setOtpDialogOpen(true)
    } else if (action === 'not-delivered') {
      // Open reason dialog
      setReasonAction({ orderId: order.orderId, orderItemId })
      setReasonDialogOpen(true)
    } else {
      // Direct action (out-for-delivery, etc.)
      performAction(action, order.orderId, orderItemId)
    }
  }, [])

  const performAction = async (
    action: string,
    orderId: string,
    orderItemId?: string,
    otp?: string,
    reason?: string
  ) => {
    const actionKey = `${action}-${orderId}`
    setActionLoading(actionKey)

    try {
      const res = await fetch('/api/delivery-boy/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          orderId,
          orderItemId,
          otp,
          reason,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        // Refresh data
        fetchData()
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Action failed' }
      }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    } finally {
      setActionLoading(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Accept/Reject Assignment                                         */
  /* ---------------------------------------------------------------- */

  const handleAcceptAssignment = async (assignmentId: string) => {
    setActionLoading(assignmentId)
    try {
      const res = await fetch('/api/delivery-boy/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'accept', assignmentId }),
      })
      if (res.ok) {
        setAssignments((prev) => prev.filter((a) => a._id !== assignmentId))
        fetchData()
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectAssignment = async (assignmentId: string) => {
    setActionLoading(assignmentId)
    try {
      const res = await fetch('/api/delivery-boy/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reject', assignmentId }),
      })
      if (res.ok) {
        setAssignments((prev) => prev.filter((a) => a._id !== assignmentId))
        fetchData()
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  OTP Submit                                                       */
  /* ---------------------------------------------------------------- */

  const handleOTPSubmit = async (otp: string) => {
    if (!otpAction) return
    setOtpLoading(true)
    setOtpError(null)

    const result = await performAction(
      otpAction.action,
      otpAction.orderId,
      otpAction.orderItemId,
      otp
    )

    setOtpLoading(false)

    if (result.success) {
      setOtpDialogOpen(false)
      setOtpAction(null)
    } else {
      setOtpError(result.error || 'Invalid OTP')
      // Parse remaining attempts from error message if available
      const attemptsMatch = result.error?.match(/(\d+)\s+attempt/i)
      if (attemptsMatch) {
        setOtpRemainingAttempts(parseInt(attemptsMatch[1], 10))
      } else {
        setOtpRemainingAttempts(undefined)
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reason Submit                                                    */
  /* ---------------------------------------------------------------- */

  const handleReasonSubmit = async (reason: string) => {
    if (!reasonAction) return
    setReasonLoading(true)

    await performAction(
      'not-delivered',
      reasonAction.orderId,
      reasonAction.orderItemId,
      undefined,
      reason
    )

    setReasonLoading(false)
    setReasonDialogOpen(false)
    setReasonAction(null)
  }

  /* ---------------------------------------------------------------- */
  /*  Direct action (out-for-delivery, etc.)                           */
  /* ---------------------------------------------------------------- */

  // Already handled in handleAction via performAction

  /* ---------------------------------------------------------------- */
  /*  Categorize orders                                                */
  /* ---------------------------------------------------------------- */

  const { pending, active, completed } = categorizeOrders(orders, deliveryBoyId)
  const pendingAssignments = assignments.filter((a) => a.status === 'pending')

  /* ---------------------------------------------------------------- */
  /*  Pull-to-refresh simulation                                       */
  /* ---------------------------------------------------------------- */

  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  /* ---------------------------------------------------------------- */
  /*  Error state                                                      */
  /* ---------------------------------------------------------------- */

  if (error && orders.length === 0 && !initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-destructive/10 text-destructive">
          <Package className="h-7 w-7" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">Pull down to refresh or wait for auto-retry</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="min-h-[44px] gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* ── Pull to refresh ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">My Orders</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* ── Pending Assignments Banner ── */}
      <AnimatePresence>
        {pendingAssignments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 px-1">
              <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                {pendingAssignments.length} New Assignment{pendingAssignments.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {pendingAssignments.map((assignment) => (
                <AssignmentCard
                  key={assignment._id}
                  assignment={assignment}
                  onAccept={handleAcceptAssignment}
                  onReject={handleRejectAssignment}
                  actionLoading={actionLoading}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full h-10 p-1">
          <TabsTrigger value="pending" className="flex-1 text-xs min-h-[36px] gap-1">
            <Clock className="h-3 w-3" />
            Pending
            {pending.length > 0 && (
              <span className="ml-0.5 min-w-[16px] h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" className="flex-1 text-xs min-h-[36px] gap-1">
            <Truck className="h-3 w-3" />
            Active
            {active.length > 0 && (
              <span className="ml-0.5 min-w-[16px] h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                {active.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex-1 text-xs min-h-[36px] gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </TabsTrigger>
        </TabsList>

        {/* ── Pending Tab ── */}
        <TabsContent value="pending">
          {pending.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No Pending Orders"
              description="New orders waiting to be processed will appear here"
            />
          ) : (
            <div className="space-y-3 mt-3">
              <AnimatePresence>
                {pending.map((job) => (
                  <OrderCard
                    key={job.jobKey}
                    order={job.order}
                    onAction={handleAction}
                    actionLoading={actionLoading}
                    deliveryBoyId={deliveryBoyId}
                    role={job.role}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        {/* ── Active Tab ── */}
        <TabsContent value="active">
          {active.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No Active Deliveries"
              description="Orders out for delivery or pickup will appear here"
            />
          ) : (
            <div className="space-y-3 mt-3">
              <AnimatePresence>
                {active.map((job) => (
                  <OrderCard
                    key={job.jobKey}
                    order={job.order}
                    onAction={handleAction}
                    actionLoading={actionLoading}
                    deliveryBoyId={deliveryBoyId}
                    role={job.role}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        {/* ── Completed Tab ── */}
        <TabsContent value="completed">
          {completed.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No Completed Orders"
              description="Delivered and completed orders will appear here"
            />
          ) : (
            <div className="space-y-3 mt-3">
              <AnimatePresence>
                {completed.map((job) => (
                  <OrderCard
                    key={job.jobKey}
                    order={job.order}
                    onAction={handleAction}
                    actionLoading={actionLoading}
                    deliveryBoyId={deliveryBoyId}
                    role={job.role}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Summary ── */}
      {orders.length > 0 && (
        <div className="text-center text-[10px] text-muted-foreground/50 pt-2 pb-4">
          {totalOrders} total order{totalOrders !== 1 ? 's' : ''}
        </div>
      )}

      {/* ── OTP Dialog ── */}
      <OTPDialog
        open={otpDialogOpen}
        onOpenChange={(open) => {
          setOtpDialogOpen(open)
          if (!open) {
            setOtpAction(null)
            setOtpError(null)
          }
        }}
        title={
          otpAction?.action === 'return-completed'
            ? 'Complete Return Pickup'
            : 'Confirm Delivery'
        }
        description={
          otpAction?.action === 'return-completed'
            ? 'Enter the OTP from the customer to complete the return pickup'
            : 'Enter the OTP from the customer to confirm delivery'
        }
        onSubmit={handleOTPSubmit}
        loading={otpLoading}
        error={otpError}
        remainingAttempts={otpRemainingAttempts}
        isPickup={otpAction?.action === 'return-completed'}
      />

      {/* ── Reason Dialog ── */}
      <ReasonDialog
        open={reasonDialogOpen}
        onOpenChange={(open) => {
          setReasonDialogOpen(open)
          if (!open) setReasonAction(null)
        }}
        onSubmit={handleReasonSubmit}
        loading={reasonLoading}
      />
    </div>
  )
}
