/* ------------------------------------------------------------------ */
/*  Production-Level Inventory Manager                                   */
/*  Following Flipkart/Meesho/Amazon inventory management patterns       */
/*                                                                       */
/*  Responsibilities:                                                    */
/*   - Atomic stock decrement / restock with safety checks               */
/*   - Stock reservations during checkout (hold → confirm/release)       */
/*   - Manual stock adjustments (seller / admin)                         */
/*   - Full audit trail via inventory_movements collection               */
/*   - Low-stock & out-of-stock alert generation                         */
/*   - Variant-aware stock operations                                    */
/*   - Inventory summaries & reporting helpers                           */
/* ------------------------------------------------------------------ */

import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type MovementType =
  | 'order'            // Stock consumed by a placed order
  | 'cancel'           // Stock restored on order cancellation
  | 'return'           // Stock restored on return completion
  | 'adjustment'       // Manual adjustment by seller/admin
  | 'restock'          // Restock via product edit / bulk update
  | 'reservation'      // Temporary hold during checkout
  | 'release'          // Reservation released (expired / cancelled)
  | 'reservation_confirm' // Reservation converted to actual sale
  | 'initial'          // Initial stock set on product creation
  | 'correction'       // System correction (e.g. reconciliation)
  | 'transfer'         // Stock transfer between warehouses
  | 'count_adjustment' // Cycle count / stocktake adjustment

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unlimited'

export interface InventoryMovement {
  _id?: string
  movementId: string
  productId: string
  productName?: string
  variantId?: string
  variantSku?: string
  sellerId?: string
  sellerName?: string
  /** Type of movement */
  type: MovementType
  /** Quantity delta — positive = stock added, negative = stock removed */
  quantityChange: number
  /** Stock level before this movement */
  stockBefore: number
  /** Stock level after this movement */
  stockAfter: number
  /** Related order ID (for order/cancel/return movements) */
  orderId?: string
  /** Related reservation ID (for reservation movements) */
  reservationId?: string
  /** Reason / note for the movement */
  reason?: string
  /** Who performed the action */
  performedBy: 'system' | 'seller' | 'admin' | 'customer'
  userId?: string
  userName?: string
  createdAt: string
}

export interface StockReservation {
  _id?: string
  reservationId: string
  productId: string
  variantId?: string
  customerId?: string
  sessionId?: string
  quantity: number
  /** Cart token or checkout id */
  cartToken?: string
  status: 'active' | 'confirmed' | 'released' | 'expired'
  expiresAt: Date
  createdAt: string
  releasedAt?: string
  confirmedAt?: string
  orderId?: string
}

export interface InventoryAlert {
  _id?: string
  alertId: string
  productId: string
  productName?: string
  variantId?: string
  sellerId?: string
  sellerName?: string
  type: 'low_stock' | 'out_of_stock' | 'reorder'
  currentStock: number
  threshold: number
  status: 'active' | 'acknowledged' | 'resolved'
  message: string
  createdAt: string
  acknowledgedAt?: string
  acknowledgedBy?: string
  resolvedAt?: string
}

export interface StockLevel {
  productId: string
  totalStock: number
  reservedStock: number
  availableStock: number
  trackInventory: boolean
  status: StockStatus
  variantId?: string
  variantStock?: number
}

export interface InventorySummary {
  totalSkus: number
  trackedSkus: number
  inStockSkus: number
  lowStockSkus: number
  outOfStockSkus: number
  reorderSkus: number
  totalUnits: number
  totalReservedUnits: number
  totalAvailableUnits: number
  /** Estimated stock value at selling price */
  stockValue: number
  /** Estimated stock value at MRP */
  stockValueMrp: number
  /** Estimated stock value at cost price (for valuation) */
  stockValueCost: number
  /** Potential profit (selling - cost) */
  potentialProfit: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function generateMovementId(): string {
  return `IMV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function generateReservationId(): string {
  return `RSV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function generateAlertId(): string {
  return `ALR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

/**
 * Remove all `undefined` valued keys from an object (shallow).
 *
 * WHY: The MongoDB Node.js driver (v7) serializes JS `undefined` field values
 * as BSON `null` rather than omitting them. When a collection has a
 * `$jsonSchema` validator that requires a field to be `bsonType: 'string'`,
 * a `null` value fails validation with "Document failed validation".
 *
 * This is the ROOT CAUSE of the "Failed to reserve stock" error in the
 * customer checkout flow: `reserveStock()` builds a reservation document
 * containing `variantId: undefined` / `sessionId: undefined` (when those
 * params are not supplied), which the driver turns into `null`, which the
 * `stock_reservations` validator rejects.
 *
 * Stripping undefined keys before insert guarantees only defined values are
 * sent to the server, so optional fields are simply omitted (which the
 * validator accepts) instead of being sent as `null`.
 *
 * This helper is applied to every insert in this module (movements,
 * reservations, alerts) as a defensive measure.
 */
function cleanUndefined<T extends Record<string, unknown>>(obj: T): T {
  const cleaned: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (value !== undefined) {
      cleaned[key] = value
    }
  }
  return cleaned as T
}

/**
 * Determine the stock status of a product given its stock level and threshold.
 */
export function determineStockStatus(
  stock: number,
  lowStockThreshold: number,
  trackInventory: boolean,
): StockStatus {
  if (!trackInventory) return 'unlimited'
  if (stock <= 0) return 'out_of_stock'
  if (stock <= lowStockThreshold) return 'low_stock'
  return 'in_stock'
}

/* ------------------------------------------------------------------ */
/*  Core: Record a Movement (audit log)                                  */
/* ------------------------------------------------------------------ */

export async function recordMovement(params: {
  productId: string
  productName?: string
  variantId?: string
  variantSku?: string
  sellerId?: string
  sellerName?: string
  type: MovementType
  quantityChange: number
  stockBefore: number
  stockAfter: number
  orderId?: string
  reservationId?: string
  reason?: string
  performedBy: InventoryMovement['performedBy']
  userId?: string
  userName?: string
}): Promise<InventoryMovement | null> {
  try {
    const { db } = await connectToDatabase()
    const movement: InventoryMovement = {
      movementId: generateMovementId(),
      productId: params.productId,
      productName: params.productName,
      variantId: params.variantId,
      variantSku: params.variantSku,
      sellerId: params.sellerId,
      sellerName: params.sellerName,
      type: params.type,
      quantityChange: params.quantityChange,
      stockBefore: params.stockBefore,
      stockAfter: params.stockAfter,
      orderId: params.orderId,
      reservationId: params.reservationId,
      reason: params.reason,
      performedBy: params.performedBy,
      userId: params.userId,
      userName: params.userName,
      createdAt: new Date().toISOString(),
    }
    // Strip undefined values — the MongoDB driver serializes undefined as
    // null, which fails the collection's $jsonSchema validator.
    const cleanMovement = cleanUndefined(movement)
    await db.collection('inventory_movements').insertOne(cleanMovement)
    return movement
  } catch (err) {
    // Movement logging must NEVER break the parent operation (order placement etc.)
    console.error('[Inventory] Failed to record movement:', err)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Core: Decrement Stock (on order placement)                           */
/* ------------------------------------------------------------------ */

/**
 * Atomically decrement stock for a product / variant when an order is placed.
 *
 * Behaviour:
 *  - If product.trackInventory === false → no-op (unlimited stock)
 *  - Uses MongoDB conditional update to prevent overselling:
 *        only decrements if available stock >= quantity
 *  - Records the movement in the audit log
 *  - Updates lastStockUpdateAt on the product
 *  - Triggers low-stock / out-of-stock alerts as needed
 *
 * @returns { success, message, newStock } — success=false if insufficient stock
 */
export async function decrementStock(params: {
  productId: string
  quantity: number
  variantId?: string
  orderId?: string
  reason?: string
  performedBy?: InventoryMovement['performedBy']
  userId?: string
  userName?: string
}): Promise<{ success: boolean; message: string; newStock?: number }> {
  const {
    productId,
    quantity,
    variantId,
    orderId,
    reason = 'Order placed',
    performedBy = 'system',
    userId,
    userName,
  } = params

  if (quantity <= 0) {
    return { success: true, message: 'No quantity to decrement', newStock: undefined }
  }

  const { db } = await connectToDatabase()

  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: productId as any })
  }
  if (!product) {
    return { success: false, message: `Product ${productId} not found` }
  }

  // Unlimited stock products skip decrement
  if (product.trackInventory === false) {
    return { success: true, message: 'Inventory tracking disabled for this product' }
  }

  const sellerName = product.storeName || product.seller || ''
  const sellerId = product.sellerId || product.seller || ''

  // === Variant-aware decrement ===
  if (variantId && Array.isArray(product.variants) && product.variants.length > 0) {
    const variantIndex = product.variants.findIndex(
      (v: any) => v._id === variantId || v.sku === variantId || v.id === variantId,
    )
    if (variantIndex === -1) {
      return { success: false, message: `Variant ${variantId} not found on product` }
    }
    const variant = product.variants[variantIndex]
    const stockBefore = Number(variant.stock) || 0
    if (stockBefore < quantity) {
      return { success: false, message: `Insufficient stock for variant ${variant.sku || variantId}` }
    }
    const stockAfter = stockBefore - quantity

    // Conditional atomic update — prevents oversell under concurrency
    const result = await db.collection('products').updateOne(
      {
        _id: product._id,
        [`variants.${variantIndex}.stock`]: { $gte: quantity },
      },
      {
        $inc: {
          [`variants.${variantIndex}.stock`]: -quantity,
          stock: -quantity, // Keep parent stock in sync (sum of variants)
        },
        $set: {
          lastStockUpdateAt: new Date(),
          updatedAt: new Date(),
        },
      },
    )

    if (result.modifiedCount === 0) {
      // Race condition: someone else bought the last unit
      return { success: false, message: 'Insufficient stock (concurrent purchase)' }
    }

    await recordMovement({
      productId,
      productName: product.name,
      variantId,
      variantSku: variant.sku,
      sellerId,
      sellerName,
      type: 'order',
      quantityChange: -quantity,
      stockBefore,
      stockAfter,
      orderId,
      reason,
      performedBy,
      userId,
      userName,
    })

    // Check alerts for this variant
    await checkAndCreateAlert(productId, product, stockAfter, variantId, variant.sku)

    return { success: true, message: 'Stock decremented', newStock: stockAfter }
  }

  // === Simple product decrement (no variant) ===
  const stockBefore = Number(product.stock) || 0
  const reserved = Number(product.reservedStock) || 0
  const available = stockBefore - reserved

  if (available < quantity) {
    return {
      success: false,
      message: `Insufficient stock. Available: ${available}, requested: ${quantity}`,
    }
  }

  const stockAfter = stockBefore - quantity

  // Conditional atomic update — prevents oversell under concurrency
  const result = await db.collection('products').updateOne(
    {
      _id: product._id,
      stock: { $gte: quantity },
    },
    {
      $inc: { stock: -quantity },
      $set: {
        lastStockUpdateAt: new Date(),
        updatedAt: new Date(),
      },
    },
  )

  if (result.modifiedCount === 0) {
    return { success: false, message: 'Insufficient stock (concurrent purchase)' }
  }

  await recordMovement({
    productId,
    productName: product.name,
    sellerId,
    sellerName,
    type: 'order',
    quantityChange: -quantity,
    stockBefore,
    stockAfter,
    orderId,
    reason,
    performedBy,
    userId,
    userName,
  })

  await checkAndCreateAlert(productId, product, stockAfter)

  return { success: true, message: 'Stock decremented', newStock: stockAfter }
}

/* ------------------------------------------------------------------ */
/*  Core: Restock (on cancel / return)                                   */
/* ------------------------------------------------------------------ */

/**
 * Add stock back to a product / variant when an order is cancelled or a
 * return is completed. Records the movement and resolves any active
 * low-stock / out-of-stock alerts that are now satisfied.
 */
export async function restockProduct(params: {
  productId: string
  quantity: number
  variantId?: string
  orderId?: string
  reason?: string
  performedBy?: InventoryMovement['performedBy']
  userId?: string
  userName?: string
}): Promise<{ success: boolean; message: string; newStock?: number }> {
  const {
    productId,
    quantity,
    variantId,
    orderId,
    reason = 'Order cancelled / returned',
    performedBy = 'system',
    userId,
    userName,
  } = params

  if (quantity <= 0) {
    return { success: true, message: 'No quantity to restock', newStock: undefined }
  }

  const { db } = await connectToDatabase()

  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: productId as any })
  }
  if (!product) {
    return { success: false, message: `Product ${productId} not found` }
  }

  if (product.trackInventory === false) {
    return { success: true, message: 'Inventory tracking disabled for this product' }
  }

  const sellerName = product.storeName || product.seller || ''
  const sellerId = product.sellerId || product.seller || ''

  // === Variant-aware restock ===
  if (variantId && Array.isArray(product.variants) && product.variants.length > 0) {
    const variantIndex = product.variants.findIndex(
      (v: any) => v._id === variantId || v.sku === variantId || v.id === variantId,
    )
    if (variantIndex === -1) {
      return { success: false, message: `Variant ${variantId} not found on product` }
    }
    const variant = product.variants[variantIndex]
    const stockBefore = Number(variant.stock) || 0
    const stockAfter = stockBefore + quantity

    await db.collection('products').updateOne(
      { _id: product._id },
      {
        $inc: {
          [`variants.${variantIndex}.stock`]: quantity,
          stock: quantity,
        },
        $set: {
          lastStockUpdateAt: new Date(),
          updatedAt: new Date(),
        },
      },
    )

    await recordMovement({
      productId,
      productName: product.name,
      variantId,
      variantSku: variant.sku,
      sellerId,
      sellerName,
      type: params.reason?.toLowerCase().includes('return') ? 'return' : 'cancel',
      quantityChange: quantity,
      stockBefore,
      stockAfter,
      orderId,
      reason,
      performedBy,
      userId,
      userName,
    })

    await resolveAlertsForProduct(productId, variantId, stockAfter, product.lowStockThreshold || 5)
    return { success: true, message: 'Stock restocked', newStock: stockAfter }
  }

  // === Simple product restock ===
  const stockBefore = Number(product.stock) || 0
  const stockAfter = stockBefore + quantity

  await db.collection('products').updateOne(
    { _id: product._id },
    {
      $inc: { stock: quantity },
      $set: {
        lastStockUpdateAt: new Date(),
        updatedAt: new Date(),
      },
    },
  )

  await recordMovement({
    productId,
    productName: product.name,
    sellerId,
    sellerName,
    type: params.reason?.toLowerCase().includes('return') ? 'return' : 'cancel',
    quantityChange: quantity,
    stockBefore,
    stockAfter,
    orderId,
    reason,
    performedBy,
    userId,
    userName,
  })

  await resolveAlertsForProduct(productId, undefined, stockAfter, product.lowStockThreshold || 5)
  return { success: true, message: 'Stock restocked', newStock: stockAfter }
}

/* ------------------------------------------------------------------ */
/*  Core: Manual Adjustment (seller / admin)                             */
/* ------------------------------------------------------------------ */

/**
 * Manually adjust stock to an absolute value. Computes the delta and records
 * the movement. Used by the seller inventory panel "Quick Adjust" feature.
 */
export async function adjustStock(params: {
  productId: string
  newQuantity: number
  variantId?: string
  reason?: string
  performedBy: InventoryMovement['performedBy']
  userId?: string
  userName?: string
}): Promise<{ success: boolean; message: string; newStock?: number }> {
  const {
    productId,
    newQuantity,
    variantId,
    reason = 'Manual adjustment',
    performedBy,
    userId,
    userName,
  } = params

  if (newQuantity < 0) {
    return { success: false, message: 'Stock cannot be negative' }
  }

  const { db } = await connectToDatabase()

  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: productId as any })
  }
  if (!product) {
    return { success: false, message: `Product ${productId} not found` }
  }

  const sellerName = product.storeName || product.seller || ''
  const sellerId = product.sellerId || product.seller || ''
  const threshold = Number(product.lowStockThreshold) || 5

  // === Variant-aware adjustment ===
  if (variantId && Array.isArray(product.variants) && product.variants.length > 0) {
    const variantIndex = product.variants.findIndex(
      (v: any) => v._id === variantId || v.sku === variantId || v.id === variantId,
    )
    if (variantIndex === -1) {
      return { success: false, message: `Variant ${variantId} not found on product` }
    }
    const variant = product.variants[variantIndex]
    const stockBefore = Number(variant.stock) || 0
    const delta = newQuantity - stockBefore
    if (delta === 0) {
      return { success: true, message: 'No change', newStock: stockBefore }
    }

    await db.collection('products').updateOne(
      { _id: product._id },
      {
        $inc: {
          [`variants.${variantIndex}.stock`]: delta,
          stock: delta,
        },
        $set: {
          lastStockUpdateAt: new Date(),
          updatedAt: new Date(),
        },
      },
    )

    await recordMovement({
      productId,
      productName: product.name,
      variantId,
      variantSku: variant.sku,
      sellerId,
      sellerName,
      type: 'adjustment',
      quantityChange: delta,
      stockBefore,
      stockAfter: newQuantity,
      reason,
      performedBy,
      userId,
      userName,
    })

    if (newQuantity <= threshold) {
      await checkAndCreateAlert(productId, product, newQuantity, variantId, variant.sku)
    } else {
      await resolveAlertsForProduct(productId, variantId, newQuantity, threshold)
    }

    return { success: true, message: 'Stock adjusted', newStock: newQuantity }
  }

  // === Simple product adjustment ===
  const stockBefore = Number(product.stock) || 0
  const delta = newQuantity - stockBefore
  if (delta === 0) {
    return { success: true, message: 'No change', newStock: stockBefore }
  }

  await db.collection('products').updateOne(
    { _id: product._id },
    {
      $inc: { stock: delta },
      $set: {
        lastStockUpdateAt: new Date(),
        updatedAt: new Date(),
      },
    },
  )

  await recordMovement({
    productId,
    productName: product.name,
    sellerId,
    sellerName,
    type: 'adjustment',
    quantityChange: delta,
    stockBefore,
    stockAfter: newQuantity,
    reason,
    performedBy,
    userId,
    userName,
  })

  if (newQuantity <= threshold) {
    await checkAndCreateAlert(productId, product, newQuantity)
  } else {
    await resolveAlertsForProduct(productId, undefined, newQuantity, threshold)
  }

  return { success: true, message: 'Stock adjusted', newStock: newQuantity }
}

/* ------------------------------------------------------------------ */
/*  Stock Reservations (checkout hold)                                   */
/* ------------------------------------------------------------------ */

/**
 * Reserve stock for a configurable TTL (default 15 minutes) during checkout.
 * The reservation is tracked separately in `stock_reservations` and reflected
 * in `product.reservedStock` so that other concurrent checkouts see the
 * reduced availability. If the order is confirmed, call confirmReservation().
 * If the customer abandons checkout, call releaseReservation().
 */
export async function reserveStock(params: {
  productId: string
  quantity: number
  variantId?: string
  customerId?: string
  sessionId?: string
  cartToken?: string
  ttlMinutes?: number
}): Promise<{ success: boolean; message: string; reservationId?: string }> {
  const { productId, quantity, variantId, customerId, sessionId, cartToken, ttlMinutes = 15 } = params
  if (quantity <= 0) {
    return { success: false, message: 'Quantity must be greater than zero' }
  }

  const { db } = await connectToDatabase()
  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: productId as any })
  }
  if (!product) {
    return { success: false, message: 'Product not found' }
  }
  if (product.trackInventory === false) {
    return { success: true, message: 'Inventory tracking disabled' }
  }

  const currentStock = Number(product.stock) || 0
  const currentReserved = Number(product.reservedStock) || 0
  const available = currentStock - currentReserved
  if (available < quantity) {
    return { success: false, message: `Only ${available} unit(s) available` }
  }

  // Atomically increment reservedStock only if enough available
  const result = await db.collection('products').updateOne(
    { _id: product._id, $expr: { $gte: [{ $subtract: ['$stock', { $ifNull: ['$reservedStock', 0] }] }, quantity] } },
    {
      $inc: { reservedStock: quantity },
      $set: { lastStockUpdateAt: new Date() },
    },
  )
  if (result.modifiedCount === 0) {
    return { success: false, message: 'Insufficient available stock (concurrent checkout)' }
  }

  const reservationId = generateReservationId()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000)

  const reservation: StockReservation = {
    reservationId,
    productId,
    variantId,
    customerId,
    sessionId,
    quantity,
    cartToken,
    status: 'active',
    expiresAt,
    createdAt: now.toISOString(),
  }
  // CRITICAL: Strip undefined values before insert.
  // The MongoDB driver (v7) serializes JS `undefined` as BSON `null`, which
  // fails the `stock_reservations` $jsonSchema validator (it requires
  // `bsonType: 'string'` for optional fields like variantId/sessionId).
  // This was the root cause of the "Failed to reserve stock" error shown to
  // customers at checkout when ordering a product without a variant.
  const cleanReservation = cleanUndefined(reservation)
  await db.collection('stock_reservations').insertOne(cleanReservation)

  await recordMovement({
    productId,
    productName: product.name,
    variantId,
    sellerId: product.sellerId || product.seller,
    sellerName: product.storeName || product.seller,
    type: 'reservation',
    quantityChange: -quantity, // shown as a negative impact on availability
    stockBefore: currentStock,
    stockAfter: currentStock,
    reservationId,
    reason: `Reserved for checkout (${ttlMinutes}m)`,
    performedBy: 'customer',
    userId: customerId || sessionId,
  })

  return { success: true, message: 'Stock reserved', reservationId }
}

/**
 * Confirm a reservation — converts the hold into an actual stock decrement
 * (called when the order is successfully placed).
 */
export async function confirmReservation(
  reservationId: string,
  orderId: string,
): Promise<{ success: boolean; message: string }> {
  const { db } = await connectToDatabase()
  const reservation = await db.collection('stock_reservations').findOne({ reservationId })
  if (!reservation) {
    return { success: false, message: 'Reservation not found' }
  }
  if (reservation.status === 'confirmed') {
    return { success: true, message: 'Already confirmed' }
  }
  if (reservation.status !== 'active') {
    return { success: false, message: `Reservation is ${reservation.status}` }
  }

  const now = new Date()
  await db.collection('stock_reservations').updateOne(
    { _id: reservation._id },
    { $set: { status: 'confirmed', confirmedAt: now.toISOString(), orderId } },
  )

  // Release the reserved count (the actual decrement happened in createOrder)
  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(reservation.productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: reservation.productId as any })
  }
  if (product) {
    await db.collection('products').updateOne(
      { _id: product._id, reservedStock: { $gte: reservation.quantity } },
      { $inc: { reservedStock: -reservation.quantity } },
    )
  }

  await recordMovement({
    productId: reservation.productId,
    variantId: reservation.variantId || undefined,
    type: 'reservation_confirm',
    quantityChange: -reservation.quantity,
    stockBefore: Number(product?.stock) || 0,
    stockAfter: Number(product?.stock) || 0,
    orderId,
    reservationId,
    reason: 'Reservation confirmed — order placed',
    performedBy: 'system',
  })

  return { success: true, message: 'Reservation confirmed' }
}

/**
 * Release an active reservation (customer abandoned checkout or reservation
 * expired). Restores the reservedStock counter on the product.
 */
export async function releaseReservation(
  reservationId: string,
  reason: string = 'Checkout abandoned',
): Promise<{ success: boolean; message: string }> {
  const { db } = await connectToDatabase()
  const reservation = await db.collection('stock_reservations').findOne({ reservationId })
  if (!reservation) {
    return { success: false, message: 'Reservation not found' }
  }
  if (reservation.status !== 'active') {
    return { success: true, message: `Reservation already ${reservation.status}` }
  }

  const now = new Date()
  await db.collection('stock_reservations').updateOne(
    { _id: reservation._id },
    { $set: { status: 'released', releasedAt: now.toISOString() } },
  )

  // Restore reserved stock
  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(reservation.productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: reservation.productId as any })
  }
  if (product) {
    await db.collection('products').updateOne(
      { _id: product._id },
      { $inc: { reservedStock: -reservation.quantity } },
    )
  }

  await recordMovement({
    productId: reservation.productId,
    variantId: reservation.variantId || undefined,
    type: 'release',
    quantityChange: reservation.quantity,
    stockBefore: Number(product?.stock) || 0,
    stockAfter: Number(product?.stock) || 0,
    reservationId,
    reason,
    performedBy: 'system',
  })

  return { success: true, message: 'Reservation released' }
}

/* ------------------------------------------------------------------ */
/*  Alerts                                                              */
/* ------------------------------------------------------------------ */

/**
 * Check a product's current stock and create / update alerts as needed.
 * Called automatically after every decrement / adjustment.
 */
export async function checkAndCreateAlert(
  productId: string,
  product: any,
  currentStock: number,
  variantId?: string,
  variantSku?: string,
): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    const threshold = Number(product.lowStockThreshold) || 5
    const reorderPoint = Number(product.reorderPoint) || 0
    const sellerId = product.sellerId || product.seller || ''
    const sellerName = product.storeName || product.seller || ''
    const productName = product.name || ''

    // Determine alert type — reorder takes priority if stock <= reorderPoint (and reorderPoint > 0)
    // Then out_of_stock (stock <= 0), then low_stock (stock <= threshold)
    let type: 'low_stock' | 'out_of_stock' | 'reorder' | null = null
    let message = ''
    if (currentStock <= 0) {
      type = 'out_of_stock'
      message = `${productName}${variantSku ? ` (${variantSku})` : ''} is out of stock`
    } else if (reorderPoint > 0 && currentStock <= reorderPoint) {
      type = 'reorder'
      message = `${productName}${variantSku ? ` (${variantSku})` : ''} has reached reorder point (${currentStock} ≤ ${reorderPoint})`
    } else if (currentStock <= threshold) {
      type = 'low_stock'
      message = `${productName}${variantSku ? ` (${variantSku})` : ''} is running low (${currentStock} left)`
    }

    if (!type) return

    // Check if an active alert already exists for this product/variant
    const existing = await db.collection('inventory_alerts').findOne({
      productId,
      variantId: variantId || null,
      type,
      status: 'active',
    })

    if (existing) {
      // Update the current stock on the existing alert
      await db.collection('inventory_alerts').updateOne(
        { _id: existing._id },
        { $set: { currentStock, message, createdAt: new Date().toISOString() } },
      )
      return
    }

    const alert: InventoryAlert = {
      alertId: generateAlertId(),
      productId,
      productName,
      variantId: variantId || undefined,
      sellerId,
      sellerName,
      type,
      currentStock,
      threshold: type === 'reorder' ? reorderPoint : threshold,
      status: 'active',
      message,
      createdAt: new Date().toISOString(),
    }
    // Strip undefined values — the MongoDB driver serializes undefined as
    // null, which fails the collection's $jsonSchema validator.
    const cleanAlert = cleanUndefined(alert)
    await db.collection('inventory_alerts').insertOne(cleanAlert)
  } catch (err) {
    console.error('[Inventory] Alert check failed:', err)
  }
}

/**
 * Resolve active alerts for a product when stock has been restored above the
 * threshold. Non-fatal — never blocks the parent operation.
 */
export async function resolveAlertsForProduct(
  productId: string,
  variantId: string | undefined,
  currentStock: number,
  threshold: number,
): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    if (currentStock > threshold) {
      await db.collection('inventory_alerts').updateMany(
        {
          productId,
          variantId: variantId || null,
          status: 'active',
        },
        {
          $set: {
            status: 'resolved',
            resolvedAt: new Date().toISOString(),
          },
        },
      )
    }
  } catch (err) {
    console.error('[Inventory] Alert resolution failed:', err)
  }
}

/* ------------------------------------------------------------------ */
/*  Query Helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Get the current stock level for a product (and optional variant).
 */
export async function getStockLevel(productId: string, variantId?: string): Promise<StockLevel | null> {
  const { db } = await connectToDatabase()
  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: productId as any })
  }
  if (!product) return null

  const trackInventory = product.trackInventory !== false
  const totalStock = Number(product.stock) || 0
  const reservedStock = Number(product.reservedStock) || 0
  const availableStock = Math.max(0, totalStock - reservedStock)
  const threshold = Number(product.lowStockThreshold) || 5

  if (variantId && Array.isArray(product.variants)) {
    const variant = product.variants.find(
      (v: any) => v._id === variantId || v.sku === variantId || v.id === variantId,
    )
    if (variant) {
      const variantStock = Number(variant.stock) || 0
      return {
        productId,
        totalStock: variantStock,
        reservedStock: 0,
        availableStock: variantStock,
        trackInventory,
        status: determineStockStatus(variantStock, threshold, trackInventory),
        variantId,
        variantStock,
      }
    }
  }

  return {
    productId,
    totalStock,
    reservedStock,
    availableStock,
    trackInventory,
    status: determineStockStatus(totalStock, threshold, trackInventory),
  }
}

/**
 * Query the inventory movement audit log with filters.
 */
export async function getInventoryMovements(filter: {
  productId?: string
  sellerId?: string
  sellerIds?: string[]
  orderId?: string
  type?: MovementType
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}): Promise<{ movements: InventoryMovement[]; total: number; page: number; totalPages: number }> {
  const { db } = await connectToDatabase()
  const query: any = {}
  if (filter.productId) query.productId = filter.productId
  if (filter.sellerId) query.sellerId = filter.sellerId
  if (filter.orderId) query.orderId = filter.orderId
  if (filter.type) query.type = filter.type
  // Accept an array of seller IDs (so sellers with multiple aliases get their full history)
  if (filter.sellerIds && filter.sellerIds.length > 0) {
    query.sellerId = { $in: filter.sellerIds }
  }
  if (filter.startDate || filter.endDate) {
    query.createdAt = {}
    if (filter.startDate) query.createdAt.$gte = filter.startDate
    if (filter.endDate) query.createdAt.$lte = filter.endDate
  }

  const page = filter.page || 1
  const limit = Math.min(filter.limit || 50, 200)
  const total = await db.collection('inventory_movements').countDocuments(query)
  const movements = await db.collection('inventory_movements')
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  return {
    movements: movements.map((m) => ({ ...m, _id: m._id.toString() })) as InventoryMovement[],
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * Get low-stock and out-of-stock products for a seller (or platform-wide
 * if sellerIds is omitted). Returns products whose stock is at or below
 * their low-stock threshold.
 */
export async function getLowStockProducts(
  sellerIds?: string[],
  page: number = 1,
  limit: number = 50,
): Promise<{ products: any[]; total: number }> {
  const { db } = await connectToDatabase()
  const query: any = {
    trackInventory: { $ne: false },
    active: { $ne: false },
    $expr: { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] },
  }
  if (sellerIds && sellerIds.length > 0) {
    query.$or = [
      { sellerId: { $in: sellerIds } },
      { seller: { $in: sellerIds } },
    ]
  }

  const total = await db.collection('products').countDocuments(query)
  const products = await db.collection('products')
    .find(query)
    .sort({ stock: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  return {
    products: products.map((p) => ({
      ...p,
      _id: p._id.toString(),
      status: determineStockStatus(Number(p.stock) || 0, Number(p.lowStockThreshold) || 5, p.trackInventory !== false),
    })),
    total,
  }
}

/**
 * Build an inventory summary for a seller (or platform-wide).
 */
export async function getInventorySummary(sellerIds?: string[]): Promise<InventorySummary> {
  const { db } = await connectToDatabase()

  const matchStage: any = {}
  if (sellerIds && sellerIds.length > 0) {
    matchStage.$or = [
      { sellerId: { $in: sellerIds } },
      { seller: { $in: sellerIds } },
    ]
  }

  const pipeline: any[] = []
  if (Object.keys(matchStage).length > 0) pipeline.push({ $match: matchStage })

      pipeline.push({
    $group: {
      _id: null,
      totalSkus: { $sum: 1 },
      trackedSkus: {
        $sum: { $cond: [{ $ne: ['$trackInventory', false] }, 1, 0] },
      },
      inStockSkus: {
        $sum: {
          $cond: [
            {
              $and: [
                { $ne: ['$trackInventory', false] },
                { $gt: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] },
              ],
            },
            1,
            0,
          ],
        },
      },
      lowStockSkus: {
        $sum: {
          $cond: [
            {
              $and: [
                { $ne: ['$trackInventory', false] },
                { $gt: [{ $ifNull: ['$stock', 0] }, 0] },
                { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] },
              ],
            },
            1,
            0,
          ],
        },
      },
      outOfStockSkus: {
        $sum: {
          $cond: [
            {
              $and: [
                { $ne: ['$trackInventory', false] },
                { $lte: [{ $ifNull: ['$stock', 0] }, 0] },
              ],
            },
            1,
            0,
          ],
        },
      },
      reorderSkus: {
        $sum: {
          $cond: [
            {
              $and: [
                { $ne: ['$trackInventory', false] },
                { $gt: [{ $ifNull: ['$reorderPoint', 0] }, 0] },
                { $gt: [{ $ifNull: ['$stock', 0] }, 0] },
                { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$reorderPoint', 0] }] },
              ],
            },
            1,
            0,
          ],
        },
      },
      totalUnits: { $sum: { $ifNull: ['$stock', 0] } },
      totalReservedUnits: { $sum: { $ifNull: ['$reservedStock', 0] } },
      stockValue: {
        $sum: {
          $multiply: [
            { $ifNull: ['$stock', 0] },
            { $ifNull: ['$sellingPrice', 0] },
          ],
        },
      },
      stockValueMrp: {
        $sum: {
          $multiply: [
            { $ifNull: ['$stock', 0] },
            { $ifNull: ['$mrp', 0] },
          ],
        },
      },
      stockValueCost: {
        $sum: {
          $multiply: [
            { $ifNull: ['$stock', 0] },
            { $ifNull: ['$costPrice', 0] },
          ],
        },
      },
    },
  })

  const results = await db.collection('products').aggregate(pipeline).toArray()
  const r = results[0] || {}
  const stockValue = Math.round((r.stockValue || 0) * 100) / 100
  const stockValueCost = Math.round((r.stockValueCost || 0) * 100) / 100
  return {
    totalSkus: r.totalSkus || 0,
    trackedSkus: r.trackedSkus || 0,
    inStockSkus: r.inStockSkus || 0,
    lowStockSkus: r.lowStockSkus || 0,
    outOfStockSkus: r.outOfStockSkus || 0,
    reorderSkus: r.reorderSkus || 0,
    totalUnits: r.totalUnits || 0,
    totalReservedUnits: r.totalReservedUnits || 0,
    totalAvailableUnits: (r.totalUnits || 0) - (r.totalReservedUnits || 0),
    stockValue,
    stockValueMrp: Math.round((r.stockValueMrp || 0) * 100) / 100,
    stockValueCost,
    potentialProfit: Math.round((stockValue - stockValueCost) * 100) / 100,
  }
}

/**
 * Bulk update stock for multiple products in one call. Used by the seller
 * inventory panel "Bulk Update" feature.
 */
export async function bulkUpdateStock(params: {
  updates: Array<{
    productId: string
    newQuantity: number
    variantId?: string
  }>
  reason?: string
  performedBy: InventoryMovement['performedBy']
  userId?: string
  userName?: string
}): Promise<{ success: boolean; message: string; updated: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let updated = 0
  let failed = 0

  for (const update of params.updates) {
    const result = await adjustStock({
      productId: update.productId,
      newQuantity: update.newQuantity,
      variantId: update.variantId,
      reason: params.reason || 'Bulk stock update',
      performedBy: params.performedBy,
      userId: params.userId,
      userName: params.userName,
    })
    if (result.success) {
      updated++
    } else {
      failed++
      errors.push(`${update.productId}: ${result.message}`)
    }
  }

  return {
    success: true,
    message: `${updated} product(s) updated, ${failed} failed`,
    updated,
    failed,
    errors,
  }
}

/* ------------------------------------------------------------------ */
/*  Production Inventory Extensions                                     */
/*  - Initial stock recording (on product create)                       */
/*  - Delta-based adjustments                                           */
/*  - Alert acknowledge / resolve                                       */
/*  - Dead-stock identification                                          */
/*  - Demand forecasting                                                */
/*  - Reorder suggestions                                               */
/*  - Inventory valuation report                                        */
/* ------------------------------------------------------------------ */

/**
 * Record the initial stock when a product is created. Should be called
 * from product create routes (seller + admin) to seed the audit trail.
 */
export async function recordInitialStock(params: {
  productId: string
  productName?: string
  stock: number
  variantId?: string
  variantSku?: string
  sellerId?: string
  sellerName?: string
  performedBy?: InventoryMovement['performedBy']
  userId?: string
  userName?: string
}): Promise<void> {
  try {
    const stock = Number(params.stock) || 0
    if (stock === 0) return
    await recordMovement({
      productId: params.productId,
      productName: params.productName,
      variantId: params.variantId,
      variantSku: params.variantSku,
      sellerId: params.sellerId,
      sellerName: params.sellerName,
      type: 'initial',
      quantityChange: stock,
      stockBefore: 0,
      stockAfter: stock,
      reason: 'Initial stock on product creation',
      performedBy: params.performedBy || 'seller',
      userId: params.userId,
      userName: params.userName,
    })
  } catch (err) {
    console.error('[Inventory] recordInitialStock failed:', err)
  }
}

/**
 * Adjust stock by a delta (relative change) rather than an absolute value.
 * Useful for "+5 units", "-3 units" style adjustments from cycle counts.
 */
export async function adjustStockDelta(params: {
  productId: string
  delta: number
  variantId?: string
  reason?: string
  performedBy: InventoryMovement['performedBy']
  userId?: string
  userName?: string
}): Promise<{ success: boolean; message: string; newStock?: number }> {
  const { db } = await connectToDatabase()
  const { productId, delta, variantId, reason = 'Delta adjustment', performedBy, userId, userName } = params

  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: productId as any })
  }
  if (!product) {
    return { success: false, message: `Product ${productId} not found` }
  }

  const sellerId = product.sellerId || product.seller || ''
  const sellerName = product.storeName || product.seller || ''
  const threshold = Number(product.lowStockThreshold) || 5

  if (variantId && Array.isArray(product.variants) && product.variants.length > 0) {
    const variantIndex = product.variants.findIndex(
      (v: any) => v._id === variantId || v.sku === variantId || v.id === variantId,
    )
    if (variantIndex === -1) {
      return { success: false, message: `Variant ${variantId} not found` }
    }
    const variant = product.variants[variantIndex]
    const stockBefore = Number(variant.stock) || 0
    const newQuantity = Math.max(0, stockBefore + delta)
    const actualDelta = newQuantity - stockBefore
    if (actualDelta === 0) {
      return { success: true, message: 'No change', newStock: stockBefore }
    }

    await db.collection('products').updateOne(
      { _id: product._id },
      {
        $inc: {
          [`variants.${variantIndex}.stock`]: actualDelta,
          stock: actualDelta,
        },
        $set: { lastStockUpdateAt: new Date(), updatedAt: new Date() },
      },
    )

    await recordMovement({
      productId,
      productName: product.name,
      variantId,
      variantSku: variant.sku,
      sellerId,
      sellerName,
      type: 'adjustment',
      quantityChange: actualDelta,
      stockBefore,
      stockAfter: newQuantity,
      reason,
      performedBy,
      userId,
      userName,
    })

    if (newQuantity <= threshold) {
      await checkAndCreateAlert(productId, product, newQuantity, variantId, variant.sku)
    } else {
      await resolveAlertsForProduct(productId, variantId, newQuantity, threshold)
    }
    return { success: true, message: 'Stock adjusted', newStock: newQuantity }
  }

  // Simple product
  const stockBefore = Number(product.stock) || 0
  const newQuantity = Math.max(0, stockBefore + delta)
  const actualDelta = newQuantity - stockBefore
  if (actualDelta === 0) {
    return { success: true, message: 'No change', newStock: stockBefore }
  }

  await db.collection('products').updateOne(
    { _id: product._id },
    {
      $inc: { stock: actualDelta },
      $set: { lastStockUpdateAt: new Date(), updatedAt: new Date() },
    },
  )

  await recordMovement({
    productId,
    productName: product.name,
    sellerId,
    sellerName,
    type: 'adjustment',
    quantityChange: actualDelta,
    stockBefore,
    stockAfter: newQuantity,
    reason,
    performedBy,
    userId,
    userName,
  })

  if (newQuantity <= threshold) {
    await checkAndCreateAlert(productId, product, newQuantity)
  } else {
    await resolveAlertsForProduct(productId, undefined, newQuantity, threshold)
  }
  return { success: true, message: 'Stock adjusted', newStock: newQuantity }
}

/**
 * Acknowledge an inventory alert (mark as seen by seller/admin).
 */
export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { db } = await connectToDatabase()
    const result = await db.collection('inventory_alerts').updateOne(
      { alertId, status: 'active' },
      {
        $set: {
          status: 'acknowledged',
          acknowledgedAt: new Date().toISOString(),
          acknowledgedBy,
        },
      },
    )
    if (result.modifiedCount === 0) {
      return { success: false, message: 'Alert not found or already acknowledged' }
    }
    return { success: true, message: 'Alert acknowledged' }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }
}

/**
 * Resolve an inventory alert manually (e.g. after restocking).
 */
export async function resolveAlert(
  alertId: string,
  resolvedBy: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { db } = await connectToDatabase()
    const result = await db.collection('inventory_alerts').updateOne(
      { alertId, status: { $in: ['active', 'acknowledged'] } },
      {
        $set: {
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
          acknowledgedAt: new Date().toISOString(),
          acknowledgedBy: resolvedBy,
        },
      },
    )
    if (result.modifiedCount === 0) {
      return { success: false, message: 'Alert not found or already resolved' }
    }
    return { success: true, message: 'Alert resolved' }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }
}

/**
 * Identify dead / slow-moving stock: products with zero sales (order movements)
 * in the last `daysThreshold` days AND with stock > 0. Returns enriched rows.
 */
export async function getDeadStockProducts(
  sellerIds?: string[],
  daysThreshold: number = 90,
  page: number = 1,
  limit: number = 50,
): Promise<{ products: any[]; total: number }> {
  const { db } = await connectToDatabase()
  const cutoff = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000).toISOString()

  // Find productIds that HAVE had an 'order' movement in the last N days
  const soldProductIds = await db.collection('inventory_movements')
    .distinct('productId', {
      type: 'order',
      createdAt: { $gte: cutoff },
    })

  const query: any = {
    trackInventory: { $ne: false },
    active: { $ne: false },
    stock: { $gt: 0 },
    _id: { $nin: soldProductIds },
  }
  if (sellerIds && sellerIds.length > 0) {
    query.$or = [
      { sellerId: { $in: sellerIds } },
      { seller: { $in: sellerIds } },
    ]
  }

  const total = await db.collection('products').countDocuments(query)
  const products = await db.collection('products')
    .find(query)
    .sort({ stock: -1, updatedAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  // For each dead-stock product, fetch the last sale date (or null if never sold)
  const enriched = await Promise.all(products.map(async (p) => {
    const lastSale = await db.collection('inventory_movements')
      .findOne(
        { productId: p._id.toString(), type: 'order' },
        { sort: { createdAt: -1 } },
      )
    return {
      ...p,
      _id: p._id.toString(),
      lastSaleDate: lastSale?.createdAt || null,
      daysSinceLastSale: lastSale
        ? Math.floor((Date.now() - new Date(lastSale.createdAt).getTime()) / (24 * 60 * 60 * 1000))
        : null,
      stockValue: (Number(p.stock) || 0) * (Number(p.sellingPrice) || 0),
      stockValueCost: (Number(p.stock) || 0) * (Number(p.costPrice) || 0),
    }
  }))

  return { products: enriched, total }
}

/**
 * Generate a demand forecast for a product using a simple moving average of
 * daily sales (order movements) over the last `lookbackDays` days, projected
 * forward for `horizonDays`. Returns daily avg, projected demand, days of
 * cover remaining, and a recommended reorder quantity.
 */
export async function getInventoryForecast(
  productId: string,
  lookbackDays: number = 30,
  horizonDays: number = 30,
): Promise<{
  productId: string
  dailyAvgSales: number
  projectedDemand: number
  currentStock: number
  daysOfCover: number | null
  recommendedReorderQty: number
  history: Array<{ date: string; qty: number }>
}> {
  const { db } = await connectToDatabase()
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)

  // Aggregate daily sales quantity
  const dailySales = await db.collection('inventory_movements')
    .aggregate([
      {
        $match: {
          productId,
          type: 'order',
          createdAt: { $gte: cutoff.toISOString() },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: { $dateFromString: { dateString: '$createdAt' } } } },
          qty: { $sum: { $abs: '$quantityChange' } },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray()

  const totalSold = dailySales.reduce((sum, d) => sum + d.qty, 0)
  const dailyAvgSales = lookbackDays > 0 ? totalSold / lookbackDays : 0
  const projectedDemand = Math.ceil(dailyAvgSales * horizonDays)

  // Get current stock
  let product: any = null
  try {
    product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
  } catch {
    /* _id may be a string */
  }
  if (!product) {
    product = await db.collection('products').findOne({ _id: productId as any })
  }
  const currentStock = Number(product?.stock) || 0
  const reorderPoint = Number(product?.reorderPoint) || 0
  const reorderQuantity = Number(product?.reorderQuantity) || 0
  const safetyStock = Number(product?.safetyStock) || 0

  const daysOfCover = dailyAvgSales > 0 ? Math.floor(currentStock / dailyAvgSales) : null
  // Recommended reorder qty = projected demand over horizon - current stock + safety stock
  const recommendedReorderQty = Math.max(0, Math.ceil(projectedDemand - currentStock + safetyStock))

  return {
    productId,
    dailyAvgSales: Math.round(dailyAvgSales * 100) / 100,
    projectedDemand,
    currentStock,
    daysOfCover,
    recommendedReorderQty: recommendedReorderQty > 0 ? recommendedReorderQty : reorderQuantity,
    history: dailySales.map((d) => ({ date: d._id, qty: d.qty })),
  }
}

/**
 * Get reorder suggestions: products whose stock has reached or fallen below
 * their reorder point. Returns enriched rows with suggested reorder qty.
 */
export async function getReorderSuggestions(
  sellerIds?: string[],
  page: number = 1,
  limit: number = 50,
): Promise<{ products: any[]; total: number }> {
  const { db } = await connectToDatabase()
  const query: any = {
    trackInventory: { $ne: false },
    active: { $ne: false },
    reorderPoint: { $gt: 0 },
    $expr: { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$reorderPoint', 0] }] },
  }
  if (sellerIds && sellerIds.length > 0) {
    query.$or = [
      { sellerId: { $in: sellerIds } },
      { seller: { $in: sellerIds } },
    ]
  }

  const total = await db.collection('products').countDocuments(query)
  const products = await db.collection('products')
    .find(query)
    .sort({ stock: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  const enriched = products.map((p) => {
    const stock = Number(p.stock) || 0
    const reorderPoint = Number(p.reorderPoint) || 0
    const reorderQuantity = Number(p.reorderQuantity) || 0
    const safetyStock = Number(p.safetyStock) || 0
    const shortfall = Math.max(0, reorderPoint - stock)
    const suggestedQty = Math.max(reorderQuantity, shortfall + safetyStock)
    return {
      ...p,
      _id: p._id.toString(),
      stock,
      reorderPoint,
      reorderQuantity,
      safetyStock,
      shortfall,
      suggestedReorderQty: suggestedQty,
      leadTimeDays: Number(p.leadTimeDays) || 0,
      supplier: p.supplier || '',
      status: stock <= 0 ? 'out_of_stock' : stock <= reorderPoint ? 'reorder' : 'in_stock',
    }
  })

  return { products: enriched, total }
}

/**
 * Build an inventory valuation report: per-product stock value at cost,
 * selling price, and MRP. Supports weighted-average cost basis (using
 * the current costPrice field; FIFO layer tracking can be added later).
 */
export async function getInventoryValuation(
  sellerIds?: string[],
  page: number = 1,
  limit: number = 50,
): Promise<{
  products: any[]
  total: number
  totals: {
    stockValueCost: number
    stockValueSelling: number
    stockValueMrp: number
    potentialProfit: number
    totalUnits: number
  }
}> {
  const { db } = await connectToDatabase()
  const query: any = {
    trackInventory: { $ne: false },
    active: { $ne: false },
    stock: { $gt: 0 },
  }
  if (sellerIds && sellerIds.length > 0) {
    query.$or = [
      { sellerId: { $in: sellerIds } },
      { seller: { $in: sellerIds } },
    ]
  }

  const total = await db.collection('products').countDocuments(query)
  const products = await db.collection('products')
    .find(query)
    .sort({ stock: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  let stockValueCost = 0
  let stockValueSelling = 0
  let stockValueMrp = 0
  let totalUnits = 0

  const enriched = products.map((p) => {
    const stock = Number(p.stock) || 0
    const costPrice = Number(p.costPrice) || 0
    const sellingPrice = Number(p.sellingPrice) || Number(p.price) || 0
    const mrp = Number(p.mrp) || 0
    const valueCost = stock * costPrice
    const valueSelling = stock * sellingPrice
    const valueMrp = stock * mrp
    stockValueCost += valueCost
    stockValueSelling += valueSelling
    stockValueMrp += valueMrp
    totalUnits += stock
    return {
      _id: p._id.toString(),
      productId: p._id.toString(),
      name: p.name,
      sku: p.sku || '',
      sellerId: p.sellerId || p.seller || '',
      sellerName: p.storeName || p.seller || '',
      stock,
      costPrice,
      sellingPrice,
      mrp,
      stockValueCost: Math.round(valueCost * 100) / 100,
      stockValueSelling: Math.round(valueSelling * 100) / 100,
      stockValueMrp: Math.round(valueMrp * 100) / 100,
      potentialProfit: Math.round((valueSelling - valueCost) * 100) / 100,
      warehouseLocation: p.warehouseLocation || '',
    }
  })

  return {
    products: enriched,
    total,
    totals: {
      stockValueCost: Math.round(stockValueCost * 100) / 100,
      stockValueSelling: Math.round(stockValueSelling * 100) / 100,
      stockValueMrp: Math.round(stockValueMrp * 100) / 100,
      potentialProfit: Math.round((stockValueSelling - stockValueCost) * 100) / 100,
      totalUnits,
    },
  }
}

/**
 * Sweep expired stock reservations and release them, restoring reservedStock
 * on the affected products. Intended to be called by a periodic job. Safe to
 * call repeatedly. Returns count of released reservations.
 */
export async function sweepExpiredReservations(): Promise<{ released: number }> {
  const { db } = await connectToDatabase()
  const now = new Date()
  let released = 0

  const expired = await db.collection('stock_reservations')
    .find({ status: 'active', expiresAt: { $lte: now } })
    .toArray()

  for (const r of expired) {
    try {
      const result = await db.collection('products').updateOne(
        { _id: new ObjectId(r.productId) },
        { $inc: { reservedStock: -Math.abs(r.quantity) }, $set: { lastStockUpdateAt: now } },
      )
      if (result.modifiedCount > 0) {
        await db.collection('stock_reservations').updateOne(
          { _id: r._id },
          { $set: { status: 'expired', releasedAt: now.toISOString() } },
        )
        await recordMovement({
          productId: r.productId,
          variantId: r.variantId,
          type: 'release',
          quantityChange: Math.abs(r.quantity),
          stockBefore: 0,
          stockAfter: 0,
          reservationId: r.reservationId,
          reason: 'Reservation expired (TTL sweep)',
          performedBy: 'system',
        })
        released++
      }
    } catch (err) {
      console.error('[Inventory] Sweep: failed to release reservation', r.reservationId, err)
    }
  }

  return { released }
}

/**
 * Pre-check stock sufficiency for a list of cart items before order placement.
 * Returns the list of items that cannot be fulfilled (with available qty).
 */
export async function checkStockAvailability(
  items: Array<{ productId: string; variantId?: string; quantity: number }>,
): Promise<{ allAvailable: boolean; shortages: Array<{ productId: string; variantId?: string; requested: number; available: number }> }> {
  const shortages: Array<{ productId: string; variantId?: string; requested: number; available: number }> = []
  for (const item of items) {
    const level = await getStockLevel(item.productId, item.variantId)
    if (!level) {
      shortages.push({ productId: item.productId, variantId: item.variantId, requested: item.quantity, available: 0 })
      continue
    }
    if (level.trackInventory && level.availableStock < item.quantity) {
      shortages.push({
        productId: item.productId,
        variantId: item.variantId,
        requested: item.quantity,
        available: level.availableStock,
      })
    }
  }
  return { allAvailable: shortages.length === 0, shortages }
}
