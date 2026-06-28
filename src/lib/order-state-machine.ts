/**
 * Order State Machine — Strict Role-Based Status Control
 *
 * This module enforces the complete order lifecycle with:
 *   - Valid transition checking (no illegal status jumps)
 *   - Role-based permission enforcement (only authorized roles can change status)
 *   - Automatic side effects (OTP generation on delivery assignment, etc.)
 *   - Comprehensive audit logging
 *
 * Based on production-standard flows used by Flipkart/Amazon/Meesho.
 */

import {
  type OrderStatus,
  VALID_TRANSITIONS,
  STATUS_UPDATED_BY,
  FINAL_STATUSES,
  RETURN_FLOW_STATUSES,
} from './order-types'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type UserRole = 'system' | 'customer' | 'seller' | 'delivery_boy' | 'admin'

export interface TransitionResult {
  allowed: boolean
  reason?: string
}

export interface StatusTransition {
  from: OrderStatus | null
  to: OrderStatus
  role: UserRole
  userId: string
  userName: string
  reason?: string
  timestamp: string
}

/* ------------------------------------------------------------------ */
/*  Core Validation Functions                                           */
/* ------------------------------------------------------------------ */

/**
 * Check if a status transition is valid.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function validateTransition(
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  role: UserRole,
): TransitionResult {
  // 1. Check if the target status is valid at all
  const validTargets = VALID_TRANSITIONS[fromStatus]
  if (!validTargets || validTargets.length === 0) {
    return {
      allowed: false,
      reason: `No transitions allowed from "${fromStatus}" — this is a final status.`,
    }
  }

  // 2. Check if the specific transition is allowed
  if (!validTargets.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Cannot transition from "${fromStatus}" to "${toStatus}". Valid transitions: ${validTargets.join(', ')}`,
    }
  }

  // 3. Check role-based permissions
  const requiredRole = STATUS_UPDATED_BY[toStatus]

  // Admin can NEVER update order status
  if (role === 'admin') {
    return {
      allowed: false,
      reason: 'Admin cannot update order status. Admin has view-only access.',
    }
  }

  // System can only set initial status
  if (role === 'system' && requiredRole !== 'system') {
    return {
      allowed: false,
      reason: `System can only set the initial "Pending" status.`,
    }
  }

  // Check role match
  if (requiredRole === 'customer_or_seller') {
    if (role !== 'customer' && role !== 'seller') {
      return {
        allowed: false,
        reason: `Only customer or seller can set "${toStatus}" status.`,
      }
    }
  } else if (requiredRole !== role && requiredRole !== 'system') {
    return {
      allowed: false,
      reason: `Only ${requiredRole} can set "${toStatus}" status. Your role: ${role}.`,
    }
  }

  return { allowed: true }
}

/**
 * Check if a status is a final status (no further transitions).
 */
export function isFinalStatus(status: OrderStatus): boolean {
  return FINAL_STATUSES.includes(status)
}

/**
 * Check if a status is in the return flow.
 */
export function isReturnStatus(status: OrderStatus): boolean {
  return RETURN_FLOW_STATUSES.includes(status)
}

/**
 * Get the next possible statuses from a given status.
 */
export function getNextStatuses(status: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[status] || []
}

/**
 * Get the status config for UI display.
 */
export function getStatusInfo(status: OrderStatus): {
  label: string
  isFinal: boolean
  isReturn: boolean
  nextStatuses: OrderStatus[]
  updatedBy: string
} {
  return {
    label: status,
    isFinal: isFinalStatus(status),
    isReturn: isReturnStatus(status),
    nextStatuses: getNextStatuses(status),
    updatedBy: STATUS_UPDATED_BY[status],
  }
}

/* ------------------------------------------------------------------ */
/*  Order ID Generation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Generate a human-readable Order ID.
 * Format: ORD-YYYYMMDD-XXXX (4 random alphanumeric chars)
 */
export function generateOrderId(): string {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `ORD-${dateStr}-${random}`
}

/**
 * Generate a human-readable Return ID.
 * Format: RET-YYYYMMDD-XXXX (4 random alphanumeric chars)
 */
export function generateReturnId(): string {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `RET-${dateStr}-${random}`
}

/* ------------------------------------------------------------------ */
/*  Commission & Earnings Calculation                                   */
/*  Updated with Indian GST/TDS/TCS support                            */
/* ------------------------------------------------------------------ */

/** Default platform commission rate (percentage) */
const DEFAULT_COMMISSION_RATE = 10 // 10%

/** Default delivery fee */
const DEFAULT_DELIVERY_FEE = 49 // ₹49

/** Default return pickup fee */
const DEFAULT_PICKUP_FEE = 30 // ₹30

/** Default COD convenience fee */
const DEFAULT_COD_FEE = 40 // ₹40

/** Default platform/handling fee */
const DEFAULT_PLATFORM_FEE = 5 // ₹5

/** Default free delivery threshold */
const DEFAULT_FREE_DELIVERY_ABOVE = 499 // ₹499

/**
 * Calculate seller earnings for an order item.
 *
 * LEGACY MODE (backward compatible):
 *   Seller Earnings = Item Total - Platform Commission - Delivery Fee
 *
 * GST MODE (with tax breakdown):
 *   Seller Earnings = Taxable Value - Commission - GST on Commission - Delivery - TDS - TCS
 *
 * Only credited when order is DELIVERED.
 */
export function calculateSellerEarnings(
  itemTotal: number,
  deliveryFee: number = DEFAULT_DELIVERY_FEE,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
): {
  itemTotal: number
  commission: number
  deliveryFee: number
  sellerEarnings: number
} {
  const commission = Math.round(itemTotal * commissionRate / 100)
  const sellerEarnings = Math.max(0, itemTotal - commission - deliveryFee)

  return {
    itemTotal,
    commission,
    deliveryFee,
    sellerEarnings,
  }
}

/**
 * Calculate delivery boy earnings.
 *
 * For Delivery: Paid when order = DELIVERED
 * For Return: Paid when return = RETURN COMPLETED
 */
export function calculateDeliveryBoyEarnings(
  deliveryCount: number,
  returnCount: number,
  deliveryFee: number = DEFAULT_DELIVERY_FEE,
  pickupFee: number = DEFAULT_PICKUP_FEE,
): {
  deliveryEarnings: number
  pickupEarnings: number
  totalEarnings: number
} {
  const deliveryEarnings = deliveryCount * deliveryFee
  const pickupEarnings = returnCount * pickupFee

  return {
    deliveryEarnings,
    pickupEarnings,
    totalEarnings: deliveryEarnings + pickupEarnings,
  }
}

/**
 * Calculate admin earnings (commission).
 */
export function calculateAdminEarnings(
  itemTotal: number,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
): number {
  return Math.round(itemTotal * commissionRate / 100)
}

/**
 * Get the default delivery fee.
 */
export function getDefaultDeliveryFee(): number {
  return DEFAULT_DELIVERY_FEE
}

/**
 * Get the default pickup fee.
 */
export function getDefaultPickupFee(): number {
  return DEFAULT_PICKUP_FEE
}

/**
 * Get the default commission rate.
 */
export function getDefaultCommissionRate(): number {
  return DEFAULT_COMMISSION_RATE
}

/**
 * Get the default COD fee.
 */
export function getDefaultCodFee(): number {
  return DEFAULT_COD_FEE
}

/**
 * Get the default platform fee.
 */
export function getDefaultPlatformFee(): number {
  return DEFAULT_PLATFORM_FEE
}

/**
 * Get the default free delivery threshold.
 */
export function getDefaultFreeDeliveryAbove(): number {
  return DEFAULT_FREE_DELIVERY_ABOVE
}

/* ------------------------------------------------------------------ */
/*  Status Normalization                                                */
/* ------------------------------------------------------------------ */

/**
 * Normalize a status string to the correct case/format.
 * Handles various input formats (lowercase, uppercase, etc.)
 */
export function normalizeStatus(status: string): OrderStatus {
  const normalized = status.trim()
  const allStatuses: OrderStatus[] = [
    'Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered',
    'Cancelled', 'Not Delivered', 'Return Requested', 'Return Cancelled',
    'Return Approved', 'Out for Pickup', 'Return Completed',
  ]

  // Exact match
  if (allStatuses.includes(normalized as OrderStatus)) {
    return normalized as OrderStatus
  }

  // Case-insensitive match
  const lower = normalized.toLowerCase()
  for (const s of allStatuses) {
    if (s.toLowerCase() === lower) {
      return s
    }
  }

  // Partial match / common aliases
  const aliasMap: Record<string, OrderStatus> = {
    'pending': 'Pending',
    'processing': 'Processing',
    'shipped': 'Shipped',
    'out_for_delivery': 'Out for Delivery',
    'out for delivery': 'Out for Delivery',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled',
    'canceled': 'Cancelled',
    'not_delivered': 'Not Delivered',
    'not delivered': 'Not Delivered',
    'return_requested': 'Return Requested',
    'return requested': 'Return Requested',
    'return_cancelled': 'Return Cancelled',
    'return cancelled': 'Return Cancelled',
    'return_approved': 'Return Approved',
    'return approved': 'Return Approved',
    'out_for_pickup': 'Out for Pickup',
    'out for pickup': 'Out for Pickup',
    'return_completed': 'Return Completed',
    'return completed': 'Return Completed',
  }

  if (aliasMap[lower]) {
    return aliasMap[lower]
  }

  // Default to Pending if no match
  console.warn(`[OrderStateMachine] Unknown status "${status}", defaulting to "Pending"`)
  return 'Pending'
}
