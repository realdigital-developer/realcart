/**
 * Coupon Engine — production-grade coupon validation, calculation & redemption.
 *
 * This is the SINGLE source of truth for all coupon logic in the project.
 * Every API route (admin, seller, customer) and the order-creation flow
 * import from this file so coupon behaviour is consistent everywhere.
 *
 * Features (matches Flipkart / Meesho / Amazon India):
 *  - Platform coupons (site-wide) and Seller coupons (scoped to one seller)
 *  - Percentage & flat discounts with max-discount cap
 *  - Minimum order amount threshold
 *  - Start / end date validity window
 *  - Global usage limit (total redemptions across all customers)
 *  - Per-customer usage limit (e.g. "1 use per customer")
 *  - First-order-only coupons (new customers)
 *  - Applicability rules: specific categories, products, or sellers
 *  - Server-side re-validation at order placement (fraud-proof)
 *  - Atomic redemption tracking (usedCount + per-customer redemption log)
 *
 * Backward compatible: existing coupons created before this engine shipped
 * (which only had code/discountType/discountValue/etc.) are treated as
 * unlimited, site-wide platform coupons — exactly their previous behaviour.
 */

import type { Db } from 'mongodb'
import { ObjectId } from 'mongodb'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

/** Coupon document as stored in the `coupons` MongoDB collection. */
export interface CouponDocument {
  _id?: ObjectId | string
  code: string
  description?: string
  /** Short marketing title, e.g. "FLAT ₹50 OFF" */
  title?: string
  /** Human-friendly display text shown to customers */
  displayText?: string

  /** Who owns the coupon. 'platform' = site-wide (admin-created). 'seller' = scoped to one seller. */
  scope: 'platform' | 'seller'
  /** Seller ObjectId (string) when scope === 'seller'. null for platform coupons. */
  sellerId?: string | null
  sellerStoreName?: string | null

  discountType: 'percentage' | 'flat'
  /** Percentage (0-100) when discountType='percentage'. Flat amount when 'flat'. */
  discountValue: number
  /** Cap on discount for percentage coupons (0 = no cap). */
  maxDiscount?: number
  /** Minimum cart subtotal required (0 = no minimum). */
  minOrderAmount?: number

  startDate?: Date | string | null
  endDate?: Date | string | null
  isActive?: boolean

  /** Total global redemptions allowed (0 = unlimited). */
  usageLimit?: number
  /** Current global redemption count. */
  usedCount?: number
  /** Max redemptions per customer (0 = unlimited). */
  perCustomerLimit?: number

  /** Only valid for a customer's first-ever order. */
  firstOrderOnly?: boolean

  /** Restrict to these categories (empty/missing = all categories). */
  applicableCategories?: string[]
  /** Restrict to these product ObjectIds as strings (empty/missing = all products). */
  applicableProductIds?: string[]
  /** Restrict to these seller ObjectIds as strings (empty/missing = all sellers).
   *  For seller coupons, the coupon's sellerId is implicitly included. */
  applicableSellerIds?: string[]

  /** Show as a featured / highlighted coupon in the customer UI. */
  featured?: boolean

  createdBy?: string
  createdAt?: Date | string
  updatedAt?: Date | string
}

/** Sanitised coupon safe to send to the client (no internal bookkeeping). */
export interface ClientCoupon {
  _id: string
  code: string
  title?: string
  displayText?: string
  description?: string
  scope: 'platform' | 'seller'
  sellerStoreName?: string | null
  discountType: 'percentage' | 'flat'
  discountValue: number
  maxDiscount: number
  minOrderAmount: number
  startDate?: string | null
  endDate?: string | null
  isActive: boolean
  usageLimit: number
  usedCount: number
  perCustomerLimit: number
  firstOrderOnly: boolean
  applicableCategories: string[]
  applicableProductIds: string[]
  applicableSellerIds: string[]
  featured: boolean
  createdAt?: string | null
  updatedAt?: string | null
}

/** Context describing the customer's cart — used for validation. */
export interface CouponCartContext {
  db: Db
  customerId: string
  /** Full cart subtotal = Σ (effectivePrice × qty) for all items. */
  cartTotal: number
  items: Array<{
    productId: string
    quantity: number
    /** Effective (final) price per unit the customer pays. */
    price: number
    category?: string
    sellerId?: string
  }>
}

/** Result of validating a coupon against a cart. */
export interface CouponValidationResult {
  valid: boolean
  error?: string
  /** Calculated discount amount (0 if invalid). */
  discount: number
  /** The discount computed against only the applicable items. */
  applicableAmount: number
  coupon?: ClientCoupon
}

/** Result returned by getAvailableCouponsForCart — each coupon with eligibility. */
export interface AvailableCoupon {
  coupon: ClientCoupon
  applicable: boolean
  reason?: string
  discount: number
}

/* ------------------------------------------------------------------ */
/*  Sanitisation                                                       */
/* ------------------------------------------------------------------ */

/** Convert a raw DB coupon document into a client-safe object. */
export function toClientCoupon(c: CouponDocument): ClientCoupon {
  const id = c._id instanceof ObjectId ? c._id.toString() : (c._id as string) || ''
  return {
    _id: id,
    code: c.code,
    title: c.title || '',
    displayText: c.displayText || '',
    description: c.description || '',
    scope: c.scope || 'platform',
    sellerStoreName: c.sellerStoreName || null,
    discountType: c.discountType,
    discountValue: Number(c.discountValue) || 0,
    maxDiscount: Number(c.maxDiscount) || 0,
    minOrderAmount: Number(c.minOrderAmount) || 0,
    startDate: c.startDate ? new Date(c.startDate as string).toISOString() : null,
    endDate: c.endDate ? new Date(c.endDate as string).toISOString() : null,
    isActive: c.isActive !== false,
    usageLimit: Number(c.usageLimit) || 0,
    usedCount: Number(c.usedCount) || 0,
    perCustomerLimit: Number(c.perCustomerLimit) || 0,
    firstOrderOnly: Boolean(c.firstOrderOnly),
    applicableCategories: Array.isArray(c.applicableCategories) ? c.applicableCategories : [],
    applicableProductIds: Array.isArray(c.applicableProductIds) ? c.applicableProductIds : [],
    applicableSellerIds: Array.isArray(c.applicableSellerIds) ? c.applicableSellerIds : [],
    featured: Boolean(c.featured),
    createdAt: c.createdAt ? new Date(c.createdAt as string).toISOString() : null,
    updatedAt: c.updatedAt ? new Date(c.updatedAt as string).toISOString() : null,
  }
}

/* ------------------------------------------------------------------ */
/*  Applicability & Discount Calculation                               */
/* ------------------------------------------------------------------ */

/**
 * Compute the "applicable amount" — the portion of the cart subtotal that
 * the coupon's discount is calculated against.
 *
 * Rules (first match wins):
 *  1. applicableProductIds non-empty → sum of those products' line totals
 *  2. applicableCategories non-empty → sum of items in those categories
 *  3. applicableSellerIds non-empty (or seller coupon) → sum of those sellers' items
 *  4. Otherwise → full cartTotal
 *
 * For seller coupons, the coupon's own sellerId is implicitly an applicable
 * seller, so the discount is based on that seller's items only.
 */
export function computeApplicableAmount(coupon: CouponDocument, ctx: CouponCartContext): number {
  const items = ctx.items || []

  if (coupon.applicableProductIds && coupon.applicableProductIds.length > 0) {
    const idSet = new Set(coupon.applicableProductIds)
    return items
      .filter((i) => idSet.has(i.productId))
      .reduce((sum, i) => sum + i.price * i.quantity, 0)
  }

  if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
    const catSet = new Set(coupon.applicableCategories.map((c) => c.toLowerCase()))
    return items
      .filter((i) => i.category && catSet.has(i.category.toLowerCase()))
      .reduce((sum, i) => sum + i.price * i.quantity, 0)
  }

  const sellerIds = new Set<string>(coupon.applicableSellerIds || [])
  if (coupon.scope === 'seller' && coupon.sellerId) {
    sellerIds.add(String(coupon.sellerId))
  }
  if (sellerIds.size > 0) {
    return items
      .filter((i) => i.sellerId && sellerIds.has(String(i.sellerId)))
      .reduce((sum, i) => sum + i.price * i.quantity, 0)
  }

  return ctx.cartTotal
}

/**
 * Compute the raw discount for a coupon given the applicable amount.
 * Does NOT cap at the cart total — the caller may need to clamp.
 */
export function computeRawDiscount(coupon: CouponDocument, applicableAmount: number): number {
  if (coupon.discountType === 'percentage') {
    const pct = Number(coupon.discountValue) || 0
    let d = (applicableAmount * pct) / 100
    if (coupon.maxDiscount && coupon.maxDiscount > 0 && d > coupon.maxDiscount) {
      d = coupon.maxDiscount
    }
    return d
  }
  // flat
  return Number(coupon.discountValue) || 0
}

/* ------------------------------------------------------------------ */
/*  Per-customer & first-order checks                                  */
/* ------------------------------------------------------------------ */

/** Count how many times a customer has redeemed a coupon. */
export async function getCustomerCouponUsageCount(
  db: Db,
  couponId: string,
  customerId: string,
): Promise<number> {
  return db.collection('couponRedemptions').countDocuments({
    couponId,
    customerId,
  })
}

/**
 * Whether the customer has placed any order before.
 * Used for firstOrderOnly coupons. A customer with zero orders
 * (excluding cancelled) is considered "first order".
 */
export async function isCustomerFirstOrder(db: Db, customerId: string): Promise<boolean> {
  const count = await db.collection('orders').countDocuments({
    customerId,
    status: { $nin: ['Cancelled'] },
  })
  return count === 0
}

/* ------------------------------------------------------------------ */
/*  Validation (the core engine)                                       */
/* ------------------------------------------------------------------ */

/**
 * Validate a coupon against a cart context.
 *
 * Checks (in order):
 *  1. Coupon is active
 *  2. Current date is within start/end window
 *  3. Cart meets minimum order amount
 *  4. Global usage limit not exceeded
 *  5. Per-customer usage limit not exceeded
 *  6. First-order-only restriction
 *  7. Cart has eligible items (applicable amount > 0)
 *  8. Discount is > 0
 *
 * Returns { valid, discount, applicableAmount, coupon, error? }.
 * `discount` is clamped to the applicable amount (never negative, never
 * more than the eligible items' total).
 */
export async function validateCoupon(
  coupon: CouponDocument,
  ctx: CouponCartContext,
): Promise<CouponValidationResult> {
  const clientCoupon = toClientCoupon(coupon)

  // 1. Active flag
  if (coupon.isActive === false) {
    return { valid: false, error: 'This coupon is no longer active', discount: 0, applicableAmount: 0, coupon: clientCoupon }
  }

  // 2. Date window
  const now = new Date()
  if (coupon.startDate && new Date(coupon.startDate as string) > now) {
    return { valid: false, error: 'This coupon is not yet active', discount: 0, applicableAmount: 0, coupon: clientCoupon }
  }
  if (coupon.endDate && new Date(coupon.endDate as string) < now) {
    return { valid: false, error: 'This coupon has expired', discount: 0, applicableAmount: 0, coupon: clientCoupon }
  }

  // 3. Minimum order amount (checked against full cart total — Flipkart-style)
  if (coupon.minOrderAmount && coupon.minOrderAmount > 0 && ctx.cartTotal < coupon.minOrderAmount) {
    return {
      valid: false,
      error: `Minimum order amount of ₹${coupon.minOrderAmount.toLocaleString('en-IN')} required`,
      discount: 0,
      applicableAmount: 0,
      coupon: clientCoupon,
    }
  }

  // 4. Global usage limit
  const usedCount = Number(coupon.usedCount) || 0
  const usageLimit = Number(coupon.usageLimit) || 0
  if (usageLimit > 0 && usedCount >= usageLimit) {
    return { valid: false, error: 'This coupon has reached its usage limit', discount: 0, applicableAmount: 0, coupon: clientCoupon }
  }

  // 5. Per-customer usage limit
  const perCustomerLimit = Number(coupon.perCustomerLimit) || 0
  if (perCustomerLimit > 0 && coupon._id) {
    const couponId = coupon._id instanceof ObjectId ? coupon._id.toString() : String(coupon._id)
    const myUsage = await getCustomerCouponUsageCount(ctx.db, couponId, ctx.customerId)
    if (myUsage >= perCustomerLimit) {
      return {
        valid: false,
        error: `You have already used this coupon the maximum of ${perCustomerLimit} time${perCustomerLimit !== 1 ? 's' : ''}`,
        discount: 0,
        applicableAmount: 0,
        coupon: clientCoupon,
      }
    }
  }

  // 6. First-order-only
  if (coupon.firstOrderOnly) {
    const isFirst = await isCustomerFirstOrder(ctx.db, ctx.customerId)
    if (!isFirst) {
      return { valid: false, error: 'This coupon is valid only on your first order', discount: 0, applicableAmount: 0, coupon: clientCoupon }
    }
  }

  // 7. Applicability — compute the eligible subtotal
  const applicableAmount = computeApplicableAmount(coupon, ctx)
  if (applicableAmount <= 0) {
    return {
      valid: false,
      error: 'This coupon is not applicable to items in your cart',
      discount: 0,
      applicableAmount: 0,
      coupon: clientCoupon,
    }
  }

  // 8. Calculate discount and clamp to applicable amount
  let discount = computeRawDiscount(coupon, applicableAmount)
  if (discount > applicableAmount) discount = applicableAmount
  if (discount < 0) discount = 0
  discount = Math.round(discount * 100) / 100

  if (discount <= 0) {
    return { valid: false, error: 'This coupon does not provide any discount', discount: 0, applicableAmount, coupon: clientCoupon }
  }

  return { valid: true, discount, applicableAmount, coupon: clientCoupon }
}

/* ------------------------------------------------------------------ */
/*  Available coupons for a cart                                       */
/* ------------------------------------------------------------------ */

/**
 * List all coupons the customer could use on the current cart, with each
 * coupon's applicability status and calculated discount.
 *
 * Returns active, in-date coupons (platform + seller coupons whose seller
 * has items in the cart). Each entry says whether it's `applicable` and,
 * if not, a human-readable `reason`.
 */
export async function getAvailableCouponsForCart(
  ctx: CouponCartContext,
): Promise<AvailableCoupon[]> {
  const now = new Date()
  const cartSellerIds = new Set(
    (ctx.items || [])
      .map((i) => (i.sellerId ? String(i.sellerId) : ''))
      .filter(Boolean),
  )

  // Active coupons within their date window.
  // Platform coupons are always candidates. Seller coupons only if that
  // seller has at least one item in the cart.
  const candidates = await ctx.db.collection('coupons').find({
    isActive: { $ne: false },
    $or: [
      { startDate: null },
      { startDate: { $exists: false } },
      { startDate: { $lte: now } },
    ],
    $and: [
      {
        $or: [
          { endDate: null },
          { endDate: { $exists: false } },
          { endDate: { $gte: now } },
        ],
      },
    ],
  }).sort({ featured: -1, createdAt: -1 }).toArray()

  const results: AvailableCoupon[] = []
  for (const c of candidates as unknown as CouponDocument[]) {
    // Skip seller coupons whose seller isn't in the cart
    if (c.scope === 'seller' && c.sellerId && !cartSellerIds.has(String(c.sellerId))) {
      continue
    }
    const result = await validateCoupon(c, ctx)
    results.push({
      coupon: result.coupon!,
      applicable: result.valid,
      reason: result.valid ? undefined : result.error,
      discount: result.discount,
    })
  }

  // Sort: applicable first (best discount first), then featured, then by discount value
  results.sort((a, b) => {
    if (a.applicable !== b.applicable) return a.applicable ? -1 : 1
    if (!!b.coupon.featured !== !!a.coupon.featured) return b.coupon.featured ? 1 : -1
    return b.discount - a.discount
  })

  return results
}

/* ------------------------------------------------------------------ */
/*  Redemption (atomic)                                                */
/* ------------------------------------------------------------------ */

/**
 * Record a coupon redemption for a customer + order.
 *
 * Inserts a document into `couponRedemptions` (with a unique index on
 * couponId+orderId to prevent double-redemption of the same coupon on the
 * same order) and atomically increments the coupon's usedCount.
 *
 * Safe to call multiple times for the same (couponId, orderId) — the
 * unique index prevents duplicate redemption docs, and usedCount is only
 * incremented if the insert actually happened.
 *
 * Returns true if this call recorded the redemption (first time), false
 * if it was already redeemed for this order.
 */
export async function redeemCoupon(
  db: Db,
  couponId: string,
  couponCode: string,
  customerId: string,
  orderId: string,
  discountAmount: number,
): Promise<boolean> {
  if (!couponId || !orderId) return false

  const now = new Date()
  try {
    // Try to insert a redemption doc. The unique index on {couponId, orderId}
    // guarantees idempotency — if this order already redeemed this coupon,
    // the insert throws a duplicate-key error and we treat it as "already done".
    await db.collection('couponRedemptions').insertOne({
      couponId,
      couponCode,
      customerId,
      orderId,
      discountAmount: Number(discountAmount) || 0,
      redeemedAt: now,
    })
  } catch (err: unknown) {
    // Duplicate key → already redeemed for this order. Not an error.
    const e = err as { code?: number; message?: string }
    if (e && (e.code === 11000 || (e.message && e.message.includes('E11000')))) {
      return false
    }
    // Re-throw unexpected errors
    throw err
  }

  // Increment the coupon's usedCount atomically.
  try {
    await db.collection('coupons').updateOne(
      { _id: new ObjectId(couponId) },
      { $inc: { usedCount: 1 }, $set: { updatedAt: now } },
    )
  } catch {
    // Non-fatal: the redemption doc is recorded, so per-customer limits
    // still work even if the global counter fails to increment.
  }

  return true
}

/* ------------------------------------------------------------------ */
/*  Display helpers                                                    */
/* ------------------------------------------------------------------ */

/** A short, human-friendly description of a coupon's offer. */
export function describeCouponOffer(c: ClientCoupon | CouponDocument): string {
  const dt = c.discountType
  const dv = Number(c.discountValue) || 0
  if (dt === 'percentage') {
    const max = Number((c as CouponDocument).maxDiscount) || Number((c as ClientCoupon).maxDiscount) || 0
    return max > 0 ? `${dv}% OFF up to ₹${max}` : `${dv}% OFF`
  }
  return `₹${dv} OFF`
}
