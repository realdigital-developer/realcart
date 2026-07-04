/**
 * Order Types — Production-Grade Multivendor Ecommerce Order System
 *
 * This module defines all TypeScript types/interfaces for the order system.
 * It follows a strict role-based status control model inspired by
 * Flipkart / Amazon / Meesho.
 *
 * Key design decisions:
 *   - Orders contain vendor-split OrderItems (one per seller)
 *   - Return IDs are generated only for return flows
 *   - OTP is mandatory for delivery and return pickup completion
 *   - Admin can VIEW but NOT UPDATE order status
 *   - Every status transition is logged with who, when, and why
 */

/* ------------------------------------------------------------------ */
/*  Order Statuses                                                      */
/* ------------------------------------------------------------------ */

/** All possible order statuses in the lifecycle */
export type OrderStatus =
  | 'Pending'
  | 'Processing'
  | 'Shipped'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'Not Delivered'
  | 'Return Requested'
  | 'Return Cancelled'
  | 'Return Approved'
  | 'Out for Pickup'
  | 'Return Completed'

/** Statuses that represent an "active" forward delivery flow */
export const FORWARD_FLOW_STATUSES: OrderStatus[] = [
  'Pending',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Not Delivered',
]

/** Statuses that represent a return flow */
export const RETURN_FLOW_STATUSES: OrderStatus[] = [
  'Return Requested',
  'Return Cancelled',
  'Return Approved',
  'Out for Pickup',
  'Return Completed',
]

/** Statuses where the order is considered "final" (no further transitions) */
export const FINAL_STATUSES: OrderStatus[] = [
  'Delivered',
  'Cancelled',
  'Return Completed',
  'Return Cancelled',
]

/** Statuses visible in customer panel as "active" (not yet delivered/cancelled) */
export const CUSTOMER_ACTIVE_STATUSES: OrderStatus[] = [
  'Pending',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Return Requested',
  'Return Approved',
  'Out for Pickup',
]

/* ------------------------------------------------------------------ */
/*  Role-Based Status Transitions                                       */
/* ------------------------------------------------------------------ */

/**
 * Who can update to each status.
 * This enforces strict role-based control.
 */
export const STATUS_UPDATED_BY: Record<OrderStatus, string> = {
  'Pending': 'system',
  'Cancelled': 'customer_or_seller',
  'Processing': 'seller',
  'Shipped': 'seller',
  'Out for Delivery': 'delivery_boy',
  'Delivered': 'delivery_boy',
  'Not Delivered': 'delivery_boy',
  'Return Requested': 'customer',
  'Return Cancelled': 'customer',
  'Return Approved': 'seller',
  'Out for Pickup': 'delivery_boy',
  'Return Completed': 'delivery_boy',
}

/**
 * Valid status transitions from each status.
 * This defines the allowed paths in the order lifecycle.
 */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'Pending': ['Processing', 'Cancelled'],
  'Processing': ['Shipped', 'Cancelled'],
  'Shipped': ['Out for Delivery', 'Cancelled'],
  'Out for Delivery': ['Delivered', 'Not Delivered'],
  'Delivered': ['Return Requested'],
  'Cancelled': [],
  'Not Delivered': ['Out for Delivery'],
  'Return Requested': ['Return Approved', 'Return Cancelled'],
  'Return Cancelled': [],
  'Return Approved': ['Out for Pickup'],
  'Out for Pickup': ['Return Completed'],
  'Return Completed': [],
}

/* ------------------------------------------------------------------ */
/*  Core Order Interfaces                                               */
/* ------------------------------------------------------------------ */

/** A single item within an order (vendor-specific) */
export interface OrderItem {
  _id?: string
  orderId: string
  sellerId: string
  sellerName: string
  sellerStoreName: string
  productId: string
  productName: string
  productImage: string
  variant?: string | Record<string, unknown>
  quantity: number
  /** Original list price of the product (before discount) — MRP */
  price: number
  /** Regular selling price (before any limited-time special offer). Optional —
   *  used to split the discount display into Product Discount + Special Offer. */
  sellingPrice?: number
  /** Discounted price the customer actually pays per unit (falls back to price for legacy orders) */
  effectivePrice?: number
  /** Total price for this item (effectivePrice × quantity if available, else price × quantity) */
  total: number
  /** Product-level discount amount for this item ((price - effectivePrice) × quantity). 0 for legacy orders */
  discountAmount?: number
  /** Status of this individual item (for multi-vendor split) */
  status: OrderStatus
  /** Delivery boy assigned for FORWARD delivery */
  deliveryBoyId?: string
  deliveryBoyName?: string
  deliveryBoyPhone?: string
  /** Delivery boy assigned for RETURN pickup (separate from delivery) */
  pickupDeliveryBoyId?: string
  pickupDeliveryBoyName?: string
  pickupDeliveryBoyPhone?: string
  /** Return ID for this item (generated when return is requested) */
  returnId?: string
  /** Return reason for this item */
  returnReason?: string
  /** When return was requested for this item */
  returnRequestedAt?: string
  /** RTO (Return to Origin) charge applied to seller when this item is returned */
  rtoCharge?: number
  /** When the RTO charge was applied */
  rtoAppliedAt?: string
  /** Delivery fee for this item */
  deliveryFee: number
  /** Platform commission for this item */
  commission: number
  /** Seller earnings for this item */
  sellerEarnings: number

  // === GST / Tax Fields (Indian E-Commerce) ===
  /** HSN code for this product */
  hsnCode?: string
  /** GST rate applied (%) */
  gstRate?: number
  /** Taxable value per unit (before GST) */
  taxableValue?: number
  /** CGST amount for this item */
  cgst?: number
  /** SGST amount for this item */
  sgst?: number
  /** IGST amount for this item */
  igst?: number
  /** Cess amount for this item */
  cess?: number
  /** Total tax amount for this item (CGST + SGST + IGST + Cess) */
  taxAmount?: number
  /** Whether the price is tax-inclusive */
  isTaxInclusive?: boolean

  // === Finance Fields (Commission / TDS / TCS) ===
  /** Commission rate applied (%) */
  commissionRate?: number
  /** GST on commission amount (18% on commission) */
  gstOnCommission?: number
  /** GST on delivery charge */
  gstOnDelivery?: number
  /** TDS deducted under Section 194-O */
  tdsAmount?: number
  /** TDS rate applied (%) */
  tdsRate?: number
  /** TCS collected under Section 52 */
  tcsAmount?: number
  /** TCS rate applied (%) */
  tcsRate?: number
  /** Seller's GSTIN */
  sellerGstin?: string
  /** Product category (for commission) */
  category?: string
  /** Product subcategory (for commission) */
  subcategory?: string

  createdAt: string
  updatedAt: string
}

/** Delivery assignment record */
export interface DeliveryAssignment {
  _id?: string
  orderItemId: string
  orderId: string
  deliveryBoyId: string
  deliveryBoyName: string
  deliveryBoyPhone: string
  sellerId: string
  sellerName: string
  /** Whether the delivery boy accepted the assignment */
  status: 'pending' | 'accepted' | 'rejected'
  /** Type of delivery: forward or return pickup */
  type: 'delivery' | 'pickup'
  /** Return ID for pickup assignments */
  returnId?: string
  /** When the assignment was created */
  assignedAt: string
  /** When the delivery boy responded */
  respondedAt?: string
  /** Reason for rejection if rejected */
  rejectReason?: string
}

/** OTP record for delivery/pickup verification */
export interface OrderOTP {
  _id?: string
  orderId: string
  orderItemId: string
  /** 6-digit OTP code */
  code: string
  /** Whether this is for delivery or return pickup */
  type: 'delivery' | 'pickup'
  /** Whether the OTP has been used */
  verified: boolean
  /** When the OTP expires */
  expiresAt: string
  /** When the OTP was verified */
  verifiedAt?: string
  /** Which delivery boy verified it */
  verifiedBy?: string
  /** Number of failed verification attempts */
  attempts: number
  createdAt: string
}

/** Order status log entry (audit trail) */
export interface OrderStatusLog {
  _id?: string
  orderId: string
  orderItemId?: string
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  updatedBy: 'system' | 'customer' | 'seller' | 'delivery_boy' | 'admin'
  userId: string
  userName: string
  reason?: string
  createdAt: string
}

/**
 * Credit Note record — issued when an order (or part of an order) is cancelled.
 *
 * A credit note is the GST-compliant document that REVERSES the original tax
 * invoice. Under GST Rule 16 (CGST Rules 2017), when a supply is cancelled,
 * the supplier must issue a credit note to reverse the tax charged on the
 * original invoice. This record captures all the data needed to regenerate
 * the credit note PDF/HTML on demand and to audit the reversal.
 */
export interface CreditNoteRecord {
  /** Credit note number (e.g., CN-20240115-ABCD) — unique per cancellation event */
  number: string
  /** ISO timestamp when the credit note was issued */
  issuedAt: string
  /** Reason for cancellation (copied from cancellationReason at issue time) */
  reason: string
  /** Who cancelled ('customer' | 'seller' | 'system') */
  cancelledBy: 'customer' | 'seller' | 'system'
  /** Order item IDs covered by this credit note (empty array = whole order) */
  itemIds: string[]
  /** Total amount reversed (positive number — the refund/value reversed) */
  amount: number
  /** Razorpay refund ID, if a refund was processed */
  refundId?: string
  /** Refund status: 'processed' = refund done, 'pending' = refund queued, 'not_applicable' = COD/no payment */
  refundStatus?: 'processed' | 'pending' | 'not_applicable'
  /** ISO timestamp when refund was processed, if applicable */
  refundedAt?: string
  /**
   * What kind of reversal this credit note represents.
   * - 'cancellation' (default) — order/item was cancelled before delivery.
   * - 'return' — item was delivered, then returned by the customer and
   *   the return was completed. The credit note reverses the original tax
   *   invoice for the returned item(s), per GST Rule 16 (CGST Rules 2017).
   * Optional for backward compatibility — older records default to 'cancellation'.
   */
  reasonType?: 'cancellation' | 'return'
}

/** Main Order document */
export interface Order {
  _id?: string
  /** Human-readable order ID (e.g., ORD-20240115-ABCD) */
  orderId: string
  customerId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  /** Shipping address */
  shippingAddress: {
    name: string
    phone: string
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    pincode: string
    type?: 'home' | 'work' | 'other'
  }
  /** Overall order status (derived from item statuses) */
  status: OrderStatus
  /** Items in this order (may span multiple sellers) */
  items: OrderItem[]
  /** Subtotal of all items */
  subtotal: number
  /** Total delivery fee charged to customer (0 = FREE) */
  deliveryFee: number
  /** Total discount (product-level discount + coupon discount) */
  discount: number
  /** Product-level discount total (savings from effectivePrice vs original price) */
  productDiscount?: number
  /** Portion of productDiscount that came from a limited-time Special Offer
   *  (specialPrice). Subset of productDiscount — used to split the discount
   *  display into "Product Discount" + "Special Offer" on the orders page.
   *  0 (or absent) for orders with no active special offer. */
  specialOfferDiscount?: number
  /** Total amount paid */
  totalAmount: number

  // === GST / Tax Summary (Order Level) ===
  /** Total taxable value across all items */
  totalTaxableValue?: number
  /** Total CGST */
  totalCgst?: number
  /** Total SGST */
  totalSgst?: number
  /** Total IGST */
  totalIgst?: number
  /** Total Cess */
  totalCess?: number
  /** Total GST amount */
  totalGst?: number
  /** Round-off to nearest rupee */
  roundOff?: number
  /** Whether supply is intra-state (CGST+SGST) or inter-state (IGST) */
  isIntraState?: boolean

  // === Finance Summary (Order Level) ===
  /** Total delivery charges (customer-facing) */
  totalDeliveryCharge?: number
  /** GST on delivery charges */
  totalGstOnDelivery?: number
  /** COD convenience fee */
  codFee?: number
  /** Platform/handling fee */
  platformFee?: number
  /** Total platform commission */
  totalCommission?: number
  /** Total GST on commission */
  totalGstOnCommission?: number
  /** Total TDS deducted */
  totalTds?: number
  /** Total TCS collected */
  totalTcs?: number
  /** Total seller earnings */
  totalSellerEarnings?: number
  /** GST invoice number */
  invoiceNumber?: string

  /** Payment method */
  paymentMethod: 'cod' | 'online'
  /** Payment status */
  paymentStatus: 'pending' | 'paid' | 'refunded'
  /** Razorpay order ID (e.g., order_XXXXXX) — links to Razorpay dashboard */
  razorpayOrderId?: string
  /** Razorpay payment ID (e.g., pay_XXXXXX) — set after payment capture */
  razorpayPaymentId?: string
  /** Payment method sub-type (upi, card, netbanking, wallet, emi) */
  paymentMethodDetail?: string
  /** Bank name for netbanking/card payments */
  paymentBank?: string
  /** UPI VPA for UPI payments */
  paymentVpa?: string
  /** Wallet name for wallet payments */
  paymentWallet?: string
  /** Card network (Visa, Mastercard) */
  paymentCardNetwork?: string
  /** Last 4 digits of card */
  paymentCardLast4?: string
  /** RealCart Balance portion (Meesho-style split payment). When > 0,
   *  the online payment only covered the remainder. */
  walletAppliedAmount?: number
  /** When the payment was captured */
  paidAt?: string
  /** Razorpay refund ID */
  refundId?: string
  /** When the refund was processed */
  refundedAt?: string
  /** Coupon code if used */
  couponCode?: string
  /** Coupon discount amount */
  couponDiscount?: number
  /** Return ID (generated when return is requested) */
  returnId?: string
  /** Return reason */
  returnReason?: string
  /** Return requested at */
  returnRequestedAt?: string
  /** When the order was delivered */
  deliveredAt?: string
  /** When the order was cancelled */
  cancelledAt?: string
  /** Cancellation reason */
  cancellationReason?: string
  /** Who cancelled the order */
  cancelledBy?: 'customer' | 'seller'
  /**
   * Credit notes issued for this order — one per cancellation event.
   * Each entry reverses the tax invoice for the cancelled item(s).
   * Follows GST Rule 16 (CGST Rules 2017) — credit notes must be issued
   * to reverse tax when a supply is cancelled.
   */
  creditNotes?: CreditNoteRecord[]
  /** Latest credit note number (convenience field = last entry in creditNotes) */
  creditNoteNumber?: string
  /** When the latest credit note was issued (ISO timestamp) */
  creditNoteIssuedAt?: string
  /** Number of delivery attempts */
  deliveryAttempts: number
  /** Estimated delivery date (latest, for backward compat) */
  estimatedDelivery?: string
  /** Earliest estimated delivery date (ISO) — used for express display */
  estimatedDeliveryMin?: string
  /**
   * Customer-chosen delivery option at checkout.
   * - 'standard' (default) — normal delivery, free above platform threshold
   * - 'express' — faster transit, includes express surcharge
   * Optional for backward compatibility with legacy orders.
   */
  deliveryOption?: 'standard' | 'express'
  /** Human-readable label for the chosen delivery option (e.g. "Standard", "Express") */
  deliveryOptionLabel?: string
  createdAt: string
  updatedAt: string
}

/** Return order document (separate from main order) */
export interface ReturnOrder {
  _id?: string
  /** Human-readable return ID (e.g., RET-20240115-ABCD) */
  returnId: string
  /** The original order this return is linked to */
  orderId: string
  orderItemId: string
  customerId: string
  customerName: string
  customerPhone: string
  sellerId: string
  sellerName: string
  productId: string
  productName: string
  productImage: string
  variant?: string | Record<string, unknown>
  quantity: number
  price: number
  total: number
  status: OrderStatus
  reason: string
  /** Delivery boy assigned for pickup */
  deliveryBoyId?: string
  deliveryBoyName?: string
  deliveryBoyPhone?: string
  /** Pickup OTP */
  pickupOTP?: string
  /** When the return was completed */
  completedAt?: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/*  API Request/Response Types                                          */
/* ------------------------------------------------------------------ */

/** Create order request */
export interface CreateOrderRequest {
  items: {
    productId: string
    quantity: number
    variant?: string | Record<string, unknown>
  }[]
  shippingAddressId: string
  paymentMethod: 'cod' | 'online'
  couponCode?: string
  /** Customer-chosen delivery option ('standard' default; 'express' if available) */
  deliveryOption?: 'standard' | 'express'
  /** Payment details for online orders */
  paymentDetails?: {
    razorpayOrderId: string
    razorpayPaymentId: string
    razorpaySignature?: string
    paymentOrderId: string
    method?: string
    bank?: string
    vpa?: string
    wallet?: string
    cardNetwork?: string
    cardLast4?: string
  }
}

/** API response for order list */
export interface OrderListResponse {
  orders: Order[]
  total: number
  page: number
  totalPages: number
}

/** API response for order detail */
export interface OrderDetailResponse {
  order: Order
  otp?: {
    code: string
    type: 'delivery' | 'pickup'
    expiresAt: string
  }
  statusLogs: OrderStatusLog[]
  assignment?: DeliveryAssignment
}

/** Status update request */
export interface StatusUpdateRequest {
  orderItemId?: string
  status: OrderStatus
  reason?: string
  otp?: string
}

/** Delivery assignment request */
export interface AssignDeliveryRequest {
  orderItemId: string
  deliveryBoyId: string
  type: 'delivery' | 'pickup'
}

/** Delivery assignment response */
export interface DeliveryAssignmentResponse {
  status: 'accepted' | 'rejected'
  reason?: string
}

/** Return request */
export interface ReturnRequest {
  orderItemId: string
  reason: string
}

/** OTP verification request */
export interface VerifyOTPRequest {
  orderId: string
  orderItemId: string
  otp: string
  type: 'delivery' | 'pickup'
}

/* ------------------------------------------------------------------ */
/*  Status Config for UI                                                */
/* ------------------------------------------------------------------ */

export interface StatusConfig {
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
  description: string
}

export const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  'Pending': {
    label: 'Pending',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    icon: 'clock',
    description: 'Order placed, waiting for seller to accept',
  },
  'Processing': {
    label: 'Processing',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    icon: 'package',
    description: 'Seller is preparing your order',
  },
  'Shipped': {
    label: 'Shipped',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
    icon: 'truck',
    description: 'Order has been shipped',
  },
  'Out for Delivery': {
    label: 'Out for Delivery',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    icon: 'truck',
    description: 'Delivery boy is on the way',
  },
  'Delivered': {
    label: 'Delivered',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    icon: 'check-circle',
    description: 'Order has been delivered successfully',
  },
  'Cancelled': {
    label: 'Cancelled',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    icon: 'x-circle',
    description: 'Order has been cancelled',
  },
  'Not Delivered': {
    label: 'Not Delivered',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
    icon: 'alert-triangle',
    description: 'Delivery attempt was unsuccessful',
  },
  'Return Requested': {
    label: 'Return Requested',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
    icon: 'rotate-ccw',
    description: 'Customer has requested a return',
  },
  'Return Cancelled': {
    label: 'Return Cancelled',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/20',
    icon: 'x-circle',
    description: 'Return request has been cancelled',
  },
  'Return Approved': {
    label: 'Return Approved',
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/20',
    icon: 'check-circle',
    description: 'Seller has approved the return',
  },
  'Out for Pickup': {
    label: 'Out for Pickup',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/20',
    icon: 'truck',
    description: 'Delivery boy is coming to pick up the return',
  },
  'Return Completed': {
    label: 'Return Completed',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    icon: 'check-circle-2',
    description: 'Return has been completed successfully',
  },
}

/* ------------------------------------------------------------------ */
/*  Variant Formatting Utility                                          */
/* ------------------------------------------------------------------ */

/** Format a variant value for display. Handles both string and object variants. */
export function formatVariant(variant: string | Record<string, unknown> | undefined): string {
  if (!variant) return ''
  if (typeof variant === 'string') return variant
  // Object variant: e.g. { Color: 'Blue', Size: 'M' }
  if (typeof variant === 'object') {
    const entries = Object.entries(variant).filter(([, v]) => v != null && v !== '')
    if (entries.length === 0) return ''
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ')
  }
  return String(variant)
}
