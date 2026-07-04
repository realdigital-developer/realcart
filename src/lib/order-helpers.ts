/**
 * Order Creation & Helper Utilities
 *
 * This module contains shared order logic used by multiple API routes:
 *   - Order creation (from checkout)
 *   - Status transition validation and execution
 *   - Delivery assignment logic
 *   - Return flow helpers
 *   - Earnings calculations
 */

import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'
import {
  type Order,
  type OrderItem,
  type OrderStatus,
  type OrderStatusLog,
  type DeliveryAssignment,
  type CreditNoteRecord,
} from './order-types'
import {
  validateTransition,
  generateOrderId,
  generateReturnId,
  normalizeStatus,
  calculateSellerEarnings,
  getDefaultDeliveryFee,
  type UserRole,
} from './order-state-machine'
import { createOrderOTP } from './order-otp'
import { lookupGstRate, isIntraStateSupply, extractGstFromInclusiveCharge } from './tax-engine'
import { calculateCommission, calculateTds, calculateTcs, calculateDeliveryCharge, generateInvoiceNumber, generateCreditNoteNumber } from './finance-engine'
import { decrementStock, restockProduct } from './inventory-manager'
import { processReferralOnDelivery } from './referral-engine'
import { createCustomerNotification } from './customer-notifications'
import {
  getDeliveryEstimate,
  sanitizeDeliverySettings,
  sanitizeSellerDeliverySettings,
  resolveDeliveryOption,
} from './delivery-engine'
import {
  buildCreditNoteData,
  generateCreditNotePDF,
  generateCreditNoteEmailHTML,
} from './invoice-engine'
import {
  sendCreditNoteEmail,
  sendOrderDeliveredEmail,
  sendReturnRequestAcceptedEmail,
  sendReturnCompletedEmail,
} from './email-service'

/* ------------------------------------------------------------------ */
/*  Estimated Delivery (pincode-aware)                                  */
/* ------------------------------------------------------------------ */

/**
 * Compute the estimated delivery ISO date for a new order.
 *
 * Uses the delivery engine with the shipping address pincode + the first
 * item's seller ships-from info. Falls back to +7 days if the engine fails
 * or the pincode is missing — preserving the previous behaviour so legacy
 * orders / edge cases never break.
 *
 * When `deliveryOption === 'express'`, the express ETA is used (and falls
 * back to standard ETA if express is unavailable for this route).
 *
 * Non-fatal: any exception is swallowed and the +7 day fallback is returned.
 *
 * Returns an object with:
 *   - dateMax: the "latest" ETA (used as `estimatedDelivery` for backward compat)
 *   - dateMin: the earliest ETA (used for the express badge display)
 *   - resolvedOption: the option actually used (may differ from requested
 *       if express was requested but unavailable)
 *   - resolvedCharge: server-authoritative delivery charge for the chosen option
 *   - resolvedLabel: human-readable label for the chosen option
 *   - estimate: the full engine estimate (for callers that need more fields)
 */
async function computeEstimatedDelivery(
  db: Awaited<ReturnType<typeof connectToDatabase>>['db'],
  params: {
    items: {
      sellerId?: string
      sellerState?: string
      effectivePrice?: number
      price?: number
      quantity?: number
      /** Product-level delivery charge override (from product.shipping.deliveryCharge) */
      productDeliveryCharge?: number
      /** Product-level free-delivery threshold (from product.shipping.freeDeliveryAbove) */
      productFreeDeliveryAbove?: number
      /** Product-level free-delivery flag (from product.freeDelivery) */
      freeDelivery?: boolean
    }[]
    shippingAddress: Order['shippingAddress']
    deliveryOption?: 'standard' | 'express'
  },
  /**
   * The EFFECTIVE price total (Σ effectivePrice × qty) — what the customer
   * actually pays for items after all discounts. This is the value the
   * delivery engine compares against `freeDeliveryAbove` thresholds to
   * determine whether delivery is free.
   *
   * IMPORTANT: This must be the effective (post-discount) total, NOT the
   * MRP subtotal. Using MRP would incorrectly trigger free-delivery
   * thresholds for discounted carts (e.g., MRP ₹999 but effective ₹299
   * would wrongly qualify for free delivery above ₹499).
   */
  cartTotal: number,
  now: Date,
): Promise<{
  dateMax: string
  dateMin: string
  resolvedOption: 'standard' | 'express'
  resolvedCharge: number
  resolvedLabel: string
  estimate: ReturnType<typeof getDeliveryEstimate> | null
}> {
  const fallbackMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const fallbackMin = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const pincode = params.shippingAddress?.pincode
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return {
        dateMax: fallbackMax,
        dateMin: fallbackMin,
        resolvedOption: 'standard',
        resolvedCharge: 0,
        resolvedLabel: 'Standard Delivery',
        estimate: null,
      }
    }

    // Load platform delivery settings
    const deliveryDoc = await db.collection('settings').findOne({ key: 'delivery' })
    const settings = sanitizeDeliverySettings(deliveryDoc as Record<string, unknown> | null)

    // Resolve the first item's seller for ships-from info
    const firstSellerId = params.items.find((i) => i.sellerId)?.sellerId
    let sellerSettings
    if (firstSellerId) {
      let sellerDoc: Record<string, unknown> | null = null
      try {
        sellerDoc = (await db.collection('sellers').findOne(
          { _id: new ObjectId(firstSellerId) },
          { projection: { pickupAddress: 1, address: 1, deliverySettings: 1 } },
        )) as Record<string, unknown> | null
      } catch {
        sellerDoc = (await db.collection('sellers').findOne(
          { _id: firstSellerId as unknown as string },
          { projection: { pickupAddress: 1, address: 1, deliverySettings: 1 } },
        )) as Record<string, unknown> | null
      }
      if (sellerDoc) {
        sellerSettings = sanitizeSellerDeliverySettings(
          (sellerDoc.deliverySettings as Record<string, unknown>) || null,
        )
        const pickup = (sellerDoc.pickupAddress as Record<string, unknown>) || undefined
        const addr = sellerDoc.address
        const addrObj = typeof addr === 'object' && addr ? (addr as Record<string, unknown>) : undefined
        if (!sellerSettings.shipsFromPincode) {
          sellerSettings.shipsFromPincode =
            (pickup?.pincode as string) || (addrObj?.pincode as string) || undefined
        }
        if (!sellerSettings.shipsFromState) {
          sellerSettings.shipsFromState =
            (pickup?.state as string) || (addrObj?.state as string) || undefined
        }
      }
    }

    // === Extract product-level delivery overrides from the FIRST item ===
    // Mirrors what /api/customer/delivery/check does. To GUARANTEE the
    // order-creation fee matches the checkout-displayed fee, when these
    // overrides are NOT present on the forwarded item, we load them fresh
    // from the products collection (same source the delivery-check API uses).
    // This prevents the express-delivery-fee mismatch where the order stored
    // a different fee than what the customer saw at checkout.
    const firstItem = params.items[0]
    let productFreeDelivery = firstItem?.freeDelivery === true
    let productDeliveryCharge =
      typeof firstItem?.productDeliveryCharge === 'number'
        ? firstItem.productDeliveryCharge
        : undefined
    let productFreeDeliveryAbove =
      typeof firstItem?.productFreeDeliveryAbove === 'number'
        ? firstItem.productFreeDeliveryAbove
        : undefined

    // If any override is missing from the forwarded item, load it fresh from
    // the product doc (mirrors /api/customer/delivery/check exactly).
    if (
      firstItem?.productId &&
      (productDeliveryCharge === undefined ||
        productFreeDeliveryAbove === undefined ||
        !productFreeDelivery)
    ) {
      try {
        let productDoc: Record<string, unknown> | null = null
        try {
          productDoc = (await db.collection('products').findOne(
            { _id: new ObjectId(firstItem.productId) },
            { projection: { shipping: 1, freeDelivery: 1 } },
          )) as Record<string, unknown> | null
        } catch {
          productDoc = (await db.collection('products').findOne(
            { _id: firstItem.productId as unknown as string },
            { projection: { shipping: 1, freeDelivery: 1 } },
          )) as Record<string, unknown> | null
        }
        if (productDoc) {
          const shipping = (productDoc.shipping as Record<string, unknown>) || undefined
          if (productDeliveryCharge === undefined && typeof shipping?.deliveryCharge === 'number') {
            productDeliveryCharge = shipping.deliveryCharge as number
          }
          if (productFreeDeliveryAbove === undefined && typeof shipping?.freeDeliveryAbove === 'number') {
            productFreeDeliveryAbove = shipping.freeDeliveryAbove as number
          }
          if (!productFreeDelivery && productDoc.freeDelivery === true) {
            productFreeDelivery = true
          }
        }
      } catch {
        // Non-fatal — fall back to platform defaults if product lookup fails.
      }
    }

    const estimate = getDeliveryEstimate({
      customerPincode: pincode,
      customerState: params.shippingAddress?.state,
      seller: sellerSettings,
      cartTotal,
      productFreeDelivery,
      productDeliveryCharge,
      productFreeDeliveryAbove,
      settings,
    })

    // Resolve the final option (server-authoritative). If express was
    // requested but not available for this route, falls back to standard.
    const resolved = resolveDeliveryOption(estimate, params.deliveryOption || 'standard')

    return {
      dateMax: resolved.dateMax || fallbackMax,
      dateMin: resolved.dateMin || fallbackMin,
      resolvedOption: resolved.option,
      resolvedCharge: resolved.charge,
      resolvedLabel: resolved.label,
      estimate,
    }
  } catch (err) {
    console.warn('[computeEstimatedDelivery] Falling back to +7 days:', err)
    return {
      dateMax: fallbackMax,
      dateMin: fallbackMin,
      resolvedOption: 'standard',
      resolvedCharge: 0,
      resolvedLabel: 'Standard Delivery',
      estimate: null,
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Order Creation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Create a new order from checkout items.
 * This handles multi-vendor splitting, earnings calculation, and OTP generation.
 *
 * IMPORTANT: Pricing comes from the checkout form (what the customer agreed to pay).
 *   - item.price = original list price (for display, e.g. ₹499)
 *   - item.effectivePrice = discounted price the customer pays (e.g. ₹299)
 *   - item.discountAmount = per-item product discount ((price - effectivePrice) × quantity)
 *   - deliveryFee = what the customer is charged (₹0 = FREE)
 *
 * @returns The created Order document
 */
export async function createOrder(params: {
  customerId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  items: {
    productId: string
    productName: string
    productImage: string
    variant?: string | Record<string, unknown>
    sellerId: string
    sellerName: string
    sellerStoreName: string
    quantity: number
    price: number
    effectivePrice?: number
    /** Regular selling price (before any limited-time special offer).
     *  Used to split the discount display into Product Discount + Special Offer. */
    sellingPrice?: number
    hasDiscount?: boolean
    discountPercent?: number
    /** HSN code for GST calculation */
    hsnCode?: string
    /** GST rate from product (%) */
    gstRate?: number
    /** Product category (for category-wise commission) */
    category?: string
    /** Product subcategory */
    subcategory?: string
    /** Product shipping weight in grams */
    weight?: number
    /** Seller delivery charge from product */
    productDeliveryCharge?: number
    /** Seller free delivery threshold */
    productFreeDeliveryAbove?: number
    /** Product-level free-delivery flag (seller marked this product as always-free-delivery).
     *  Forwarded to the delivery engine so the server-side delivery-fee
     *  computation matches the delivery check API exactly. */
    freeDelivery?: boolean
    /** Seller GSTIN */
    sellerGstin?: string
    /** Seller's state code */
    sellerState?: string
    /** Whether the price is tax-inclusive */
    isTaxInclusive?: boolean
  }[]
  shippingAddress: Order['shippingAddress']
  paymentMethod: 'cod' | 'online'
  /** Payment details for online orders (from Razorpay verification) */
  paymentDetails?: {
    razorpayOrderId: string
    razorpayPaymentId: string
    method?: string
    bank?: string
    vpa?: string
    wallet?: string
    cardNetwork?: string
    cardLast4?: string
    /** Amount paid from RealCart Balance (Meesho-style split payment).
     *  When > 0, the online payment only covers the remainder. */
    walletAppliedAmount?: number
  }
  couponCode?: string
  couponDiscount?: number
  discount?: number
  /** Total product-level discount from checkout (sum of all item savings) */
  productDiscount?: number
  /** Portion of productDiscount from active Special Offers (specialPrice).
   *  Subset of productDiscount — stored so the orders page can split the
   *  discount display into "Product Discount" + "Special Offer". */
  specialOfferDiscount?: number
  /** Delivery fee charged to the customer (0 = FREE).
   *  NOTE: When `deliveryOption` is provided, this is treated as a HINT only.
   *  The server-authoritative fee is re-computed from the delivery engine
   *  based on the chosen option (prevents client-side tampering). When
   *  `deliveryOption` is omitted (legacy callers), this value is used as-is. */
  deliveryFee?: number
  /** Customer-chosen delivery option ('standard' default; 'express' if available).
   *  When provided, the server re-computes the actual deliveryFee + ETA from
   *  the delivery engine for the chosen option. */
  deliveryOption?: 'standard' | 'express'
  /** COD convenience fee */
  codFee?: number
  /** Platform/handling fee */
  platformFee?: number
  /** Whether prices are tax-inclusive (from admin settings) */
  isTaxInclusive?: boolean
  /** Seller's state code (for GST determination) */
  sellerState?: string
}): Promise<Order> {
  const { db } = await connectToDatabase()

  const orderId = generateOrderId()
  const invoiceNumber = generateInvoiceNumber()
  const now = new Date()

  // Get tax settings from settings collection
  let isTaxInclusive = params.isTaxInclusive ?? true // Default: Indian e-commerce uses tax-inclusive pricing
  let platformGstin = ''
  try {
    const taxSettings = await db.collection('settings').findOne({ key: 'tax' })
    if (taxSettings) {
      isTaxInclusive = taxSettings.isTaxInclusive ?? true
      platformGstin = taxSettings.platformGstin || ''
    }
  } catch { /* use defaults */ }

  // Customer's state from shipping address
  const customerState = params.shippingAddress.state || ''

  // Delivery fee charged to the customer.
  // If the customer chose a delivery option ('standard' or 'express'), the
  // server re-computes the fee AUTHORITATIVELY from the delivery engine below
  // (via computeEstimatedDelivery) — the client-sent `deliveryFee` is treated
  // as a hint only and overridden. This prevents fraud (tampering with the
  // fee client-side). For legacy callers that don't pass `deliveryOption`,
  // the client-sent `deliveryFee` is used as-is.
  let customerDeliveryFee = params.deliveryFee ?? 0
  let resolvedDeliveryOption: 'standard' | 'express' = params.deliveryOption || 'standard'
  let resolvedDeliveryLabel = resolvedDeliveryOption === 'express' ? 'Express Delivery' : 'Standard Delivery'
  let estimatedDeliveryIso = ''
  let estimatedDeliveryMinIso = ''

  // Calculate item totals with GST/finance
  let subtotal = 0        // Sum of original prices (MRP, for display)
  let totalProductDiscount = 0 // Sum of product-level discounts

  // Tax accumulators
  let totalTaxableValue = 0
  let totalCgst = 0
  let totalSgst = 0
  let totalIgst = 0
  let totalCess = 0
  let totalGst = 0
  let totalDeliveryCharge = 0
  let totalGstOnDelivery = 0
  let totalCommission = 0
  let totalGstOnCommission = 0
  let totalTds = 0
  let totalTcs = 0
  let totalSellerEarnings = 0

  const orderItems: OrderItem[] = params.items.map((item, index) => {
    // effectivePrice is what the customer actually pays per unit
    const effectivePrice = item.effectivePrice ?? item.price
    const itemOriginalTotal = item.price * item.quantity  // MRP × qty (for display)
    const itemDiscountAmount = (item.price - effectivePrice) * item.quantity

    subtotal += itemOriginalTotal
    totalProductDiscount += itemDiscountAmount

    // --- GST Calculation ---
    const itemSellerState = item.sellerState || params.sellerState || ''
    const itemHsnCode = item.hsnCode || ''
    const itemGstRate = item.gstRate

    const gstRate = itemGstRate !== undefined && itemGstRate >= 0 ? itemGstRate : lookupGstRate(itemHsnCode)
    const isIntraState = isIntraStateSupply(itemSellerState, customerState)

    // Calculate tax on selling price
    let taxableValuePerUnit: number
    let taxPerUnit: number
    let cgstPerUnit = 0
    let sgstPerUnit = 0
    let igstPerUnit = 0

    if (isTaxInclusive) {
      // Price includes tax — extract taxable value
      const divisor = 100 + gstRate
      taxableValuePerUnit = Math.round((effectivePrice * 100 / divisor) * 100) / 100
      const totalTaxPerUnit = Math.round((taxableValuePerUnit * gstRate / 100) * 100) / 100
      taxPerUnit = totalTaxPerUnit
      if (isIntraState) {
        cgstPerUnit = Math.round((totalTaxPerUnit / 2) * 100) / 100
        sgstPerUnit = Math.round((totalTaxPerUnit / 2) * 100) / 100
      } else {
        igstPerUnit = totalTaxPerUnit
      }
    } else {
      // Price excludes tax — add tax on top
      taxableValuePerUnit = effectivePrice
      const totalTaxPerUnit = Math.round((taxableValuePerUnit * gstRate / 100) * 100) / 100
      taxPerUnit = totalTaxPerUnit
      if (isIntraState) {
        cgstPerUnit = Math.round((totalTaxPerUnit / 2) * 100) / 100
        sgstPerUnit = Math.round((totalTaxPerUnit / 2) * 100) / 100
      } else {
        igstPerUnit = totalTaxPerUnit
      }
    }

    // Totals for quantity
    const taxableValueTotal = Math.round(taxableValuePerUnit * item.quantity * 100) / 100
    const itemCgst = Math.round(cgstPerUnit * item.quantity * 100) / 100
    const itemSgst = Math.round(sgstPerUnit * item.quantity * 100) / 100
    const itemIgst = Math.round(igstPerUnit * item.quantity * 100) / 100
    const itemTaxTotal = Math.round(taxPerUnit * item.quantity * 100) / 100
    const itemTotal = isTaxInclusive
      ? Math.round(effectivePrice * item.quantity)  // Tax-inclusive: customer pays effectivePrice
      : Math.round((effectivePrice + taxPerUnit) * item.quantity)  // Tax-exclusive: add tax

    // --- Commission Calculation ---
    const commissionResult = calculateCommission(
      taxableValueTotal,
      item.category || '',
      item.subcategory,
    )

    // --- Delivery Charge ---
    const deliveryResult = calculateDeliveryCharge({
      sellingPrice: effectivePrice * item.quantity,
      weight: item.weight,
      productDeliveryCharge: item.productDeliveryCharge,
      productFreeDeliveryAbove: item.productFreeDeliveryAbove,
    })

    // --- GST on delivery (embedded in the inclusive delivery charge) ---
    // The customer-facing delivery charge is GST-INCLUSIVE in this project
    // (no separate GST line is shown or charged to the customer). For
    // internal tax reporting (GSTR-1, seller payout, finance summaries) we
    // extract the embedded 18% GST from the inclusive charge using the
    // reverse-GST formula: gst = inclusive × 18 / 118.
    const gstOnDelivery = extractGstFromInclusiveCharge(deliveryResult.deliveryCharge)

    // --- TDS (1% under 194-O) ---
    const tdsResult = calculateTds(taxableValueTotal)

    // --- TCS (1% under Section 52) ---
    const tcsResult = calculateTcs(taxableValueTotal, isIntraState)

    // --- Seller Earnings ---
    const sellerEarnings = Math.max(0, Math.round(
      (taxableValueTotal - commissionResult.amount - commissionResult.gstOnCommission - deliveryResult.deliveryCharge - tdsResult.amount - tcsResult.amount) * 100
    ) / 100)

    // Accumulate totals
    totalTaxableValue += taxableValueTotal
    totalCgst += itemCgst
    totalSgst += itemSgst
    totalIgst += itemIgst
    totalGst += itemTaxTotal
    totalDeliveryCharge += deliveryResult.deliveryCharge
    totalGstOnDelivery += gstOnDelivery
    totalCommission += commissionResult.amount
    totalGstOnCommission += commissionResult.gstOnCommission
    totalTds += tdsResult.amount
    totalTcs += tcsResult.amount
    totalSellerEarnings += sellerEarnings

    return {
      _id: new ObjectId().toString(),
      orderId,
      sellerId: item.sellerId,
      sellerName: item.sellerName,
      sellerStoreName: item.sellerStoreName,
      productId: item.productId,
      productName: item.productName,
      productImage: item.productImage,
      variant: item.variant,
      quantity: item.quantity,
      price: item.price,                  // MRP (for display)
      sellingPrice: item.sellingPrice ?? effectivePrice,  // Regular selling price (before special offer)
      effectivePrice: effectivePrice,      // Discounted price (what customer pays per unit)
      total: itemTotal,                    // Total for this item
      discountAmount: itemDiscountAmount,  // Product-level discount for this item
      status: 'Pending' as OrderStatus,
      deliveryFee: deliveryResult.deliveryCharge,   // Delivery charge for this item
      commission: commissionResult.amount,
      sellerEarnings: sellerEarnings,

      // GST / Tax fields
      hsnCode: itemHsnCode,
      gstRate: gstRate,
      taxableValue: taxableValueTotal,
      cgst: itemCgst,
      sgst: itemSgst,
      igst: itemIgst,
      cess: 0,
      taxAmount: itemTaxTotal,
      isTaxInclusive: isTaxInclusive,

      // Finance fields
      commissionRate: commissionResult.rate,
      gstOnCommission: commissionResult.gstOnCommission,
      gstOnDelivery: gstOnDelivery,
      tdsAmount: tdsResult.amount,
      tdsRate: tdsResult.rate,
      tcsAmount: tcsResult.amount,
      tcsRate: tcsResult.rate,
      sellerGstin: item.sellerGstin || '',
      category: item.category || '',
      subcategory: item.subcategory || '',

      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
  })

  // Total discount = product-level discounts + coupon discount
  // productDiscount from checkout is the authoritative source, but we also
  // calculate from items as a fallback / validation
  const calculatedProductDiscount = totalProductDiscount
  const finalProductDiscount = params.productDiscount ?? calculatedProductDiscount
  const couponDiscount = params.couponDiscount || 0
  const totalDiscount = finalProductDiscount + couponDiscount

  // COD fee (only for COD orders)
  const codFee = params.paymentMethod === 'cod' ? (params.codFee ?? 40) : 0
  // Platform fee
  const platformFee = params.platformFee ?? 5

  // Calculate total amount (what the customer actually pays)
  //
  // KEY INSIGHT: For tax-inclusive pricing, effectivePrice already includes GST
  // AND already reflects the product discount (effectivePrice < MRP).
  // So totalTaxableValue + totalGst ≈ sum(effectivePrice × qty) = subtotal - productDiscount.
  // We must NOT subtract productDiscount again, otherwise it's double-counted.
  //
  // For tax-exclusive pricing, subtotal = MRP × qty, and we subtract totalDiscount
  // (productDiscount + couponDiscount) because the customer sees the full MRP first
  // then discounts are applied, then GST is added on the discounted price.
  //
  // IMPORTANT: The totalAmount must match what the customer agreed to pay at checkout.
  // We use the CUSTOMER-FACING delivery fee (from checkout), NOT the internal delivery
  // charge from the finance engine (which is for seller payout calculations only).
  //
  // PROJECT POLICY (GST-INCLUSIVE DELIVERY): The `customerDeliveryFee` is treated
  // as GST-INCLUSIVE — the customer pays `items + deliveryFee` and never sees a
  // separate "GST on delivery" line. The embedded GST is extracted internally
  // for tax reporting (see `gstOnCustomerDelivery` below) but is NOT added to
  // the total again.
  //
  // Tax-inclusive: totalAmount = (subtotal - productDiscount) + customerDeliveryFee + codFee + platformFee - couponDiscount
  //   which equals: totalTaxableValue + totalGst + customerDeliveryFee + codFee + platformFee - couponDiscount
  //
  // Tax-exclusive: totalAmount = (subtotal - totalDiscount) + totalGst + customerDeliveryFee + codFee + platformFee
  //   which equals: subtotal + totalGst + customerDeliveryFee + codFee + platformFee - totalDiscount

  // === Resolve delivery option AUTHORITATIVELY on the server ===
  // When the customer chose 'standard' or 'express' at checkout, we MUST
  // re-compute the actual deliveryFee from the delivery engine based on
  // the chosen option. This prevents fraud (a malicious client could send
  // deliveryFee=0 with deliveryOption='express' to bypass the surcharge).
  //
  // For legacy callers that don't pass `deliveryOption`, the client-sent
  // `deliveryFee` is used as-is (backward compatible).
  //
  // We also derive the ETA (min/max) from the same engine call so the
  // chosen option's ETA is stored on the order.
  //
  // IMPORTANT: The delivery engine's `cartTotal` must be the EFFECTIVE price
  // total (Σ effectivePrice × qty — what the customer actually pays after
  // discounts), NOT the MRP `subtotal`. Using MRP would incorrectly trigger
  // free-delivery thresholds for discounted carts (e.g., MRP ₹999 but
  // effective ₹299 would wrongly qualify for free delivery above ₹499).
  // This matches what the delivery check API (/api/customer/delivery/check)
  // and the checkout page both use.
  const effectiveCartTotal = params.items.reduce(
    (sum, item) => sum + ((item.effectivePrice ?? item.price) * (item.quantity || 1)),
    0,
  )

  if (params.deliveryOption) {
    const deliveryCompute = await computeEstimatedDelivery(db, params, effectiveCartTotal, now)
    customerDeliveryFee = deliveryCompute.resolvedCharge
    resolvedDeliveryOption = deliveryCompute.resolvedOption
    resolvedDeliveryLabel = deliveryCompute.resolvedLabel
    estimatedDeliveryIso = deliveryCompute.dateMax
    estimatedDeliveryMinIso = deliveryCompute.dateMin
  } else {
    // Legacy: no option chosen — use the original ETA-only computation
    const deliveryCompute = await computeEstimatedDelivery(db, params, effectiveCartTotal, now)
    estimatedDeliveryIso = deliveryCompute.dateMax
    estimatedDeliveryMinIso = deliveryCompute.dateMin
    resolvedDeliveryOption = deliveryCompute.resolvedOption
    resolvedDeliveryLabel = deliveryCompute.resolvedLabel
  }

  // GST embedded in the customer-facing delivery fee (for tax reporting only).
  //
  // PROJECT POLICY: The customer-facing `customerDeliveryFee` is GST-INCLUSIVE
  // — the customer pays `items + deliveryFee` and NEVER sees a separate
  // "GST on delivery" line. For internal tax reporting (GSTR-1 filing,
  // finance summaries, admin tax dashboard), we extract the embedded 18% GST
  // from the inclusive charge using the reverse-GST formula
  // `gst = inclusive × 18 / 118`. The extracted value is stored on the order
  // as `gstOnCustomerDelivery` so finance/tax reports remain accurate.
  //
  // IMPORTANT: This value is NOT added to `totalAmountPreRound` below — it is
  // already inside `customerDeliveryFee`. Adding it again would double-charge
  // the customer.
  const gstOnCustomerDelivery = extractGstFromInclusiveCharge(customerDeliveryFee)

  // Total amount the customer actually pays.
  //
  // Tax-inclusive: totalAmount = (subtotal − productDiscount) + customerDeliveryFee + codFee + platformFee − couponDiscount
  //   which equals: totalTaxableValue + totalGst + customerDeliveryFee + codFee + platformFee − couponDiscount
  //   (`customerDeliveryFee` already includes the embedded GST — do NOT add gstOnCustomerDelivery)
  //
  // Tax-exclusive: totalAmount = (subtotal − totalDiscount) + totalGst + customerDeliveryFee + codFee + platformFee
  //   which equals: subtotal + totalGst + customerDeliveryFee + codFee + platformFee − totalDiscount
  const totalAmountPreRound = isTaxInclusive
    ? Math.max(0, totalTaxableValue + totalGst + customerDeliveryFee + codFee + platformFee - couponDiscount)
    : Math.max(0, subtotal + totalGst + customerDeliveryFee + codFee + platformFee - totalDiscount)
  const totalAmount = Math.round(totalAmountPreRound) // Round to nearest rupee
  const roundOff = Math.round((totalAmount - totalAmountPreRound) * 100) / 100

  // Determine if intra-state
  const isIntraState = totalCgst > 0 || totalSgst > 0

  // NOTE: estimatedDeliveryIso, estimatedDeliveryMinIso, resolvedDeliveryOption,
  // resolvedDeliveryLabel, and customerDeliveryFee are all set above
  // (in the delivery-option resolution block) — no need to call
  // computeEstimatedDelivery again here.

  const order: Omit<Order, '_id'> = {
    orderId,
    customerId: params.customerId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerEmail: params.customerEmail,
    shippingAddress: params.shippingAddress,
    status: 'Pending',
    items: orderItems,
    subtotal,
    deliveryFee: customerDeliveryFee, // Customer-facing delivery fee (what they were charged at checkout)
    discount: totalDiscount,
    productDiscount: finalProductDiscount,
    specialOfferDiscount: Math.round((params.specialOfferDiscount ?? 0) * 100) / 100,
    totalAmount,

    // GST / Tax summary
    totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
    totalCgst: Math.round(totalCgst * 100) / 100,
    totalSgst: Math.round(totalSgst * 100) / 100,
    totalIgst: Math.round(totalIgst * 100) / 100,
    totalCess: Math.round(totalCess * 100) / 100,
    totalGst: Math.round(totalGst * 100) / 100,
    roundOff,
    isIntraState,

    // Finance summary
    totalDeliveryCharge: Math.round(totalDeliveryCharge * 100) / 100,
    totalGstOnDelivery: Math.round(totalGstOnDelivery * 100) / 100,
    codFee,
    platformFee,
    totalCommission: Math.round(totalCommission * 100) / 100,
    totalGstOnCommission: Math.round(totalGstOnCommission * 100) / 100,
    totalTds: Math.round(totalTds * 100) / 100,
    totalTcs: Math.round(totalTcs * 100) / 100,
    totalSellerEarnings: Math.round(totalSellerEarnings * 100) / 100,
    invoiceNumber,

    paymentMethod: params.paymentMethod,
    paymentStatus: params.paymentMethod === 'online' && params.paymentDetails ? 'paid' : 'pending',
    // Payment gateway details (for online orders)
    razorpayOrderId: params.paymentDetails?.razorpayOrderId,
    razorpayPaymentId: params.paymentDetails?.razorpayPaymentId,
    paymentMethodDetail: params.paymentDetails?.method,
    paymentBank: params.paymentDetails?.bank,
    paymentVpa: params.paymentDetails?.vpa,
    paymentWallet: params.paymentDetails?.wallet,
    paymentCardNetwork: params.paymentDetails?.cardNetwork,
    paymentCardLast4: params.paymentDetails?.cardLast4,
    // RealCart Balance portion (Meesho-style split payment). When > 0,
    // the online payment only covered the remainder. Stored on the order
    // so the order details page can show the split breakdown.
    walletAppliedAmount: params.paymentDetails?.walletAppliedAmount || 0,
    paidAt: params.paymentMethod === 'online' && params.paymentDetails ? now.toISOString() : undefined,
    couponCode: params.couponCode,
    couponDiscount: params.couponDiscount,
    deliveryAttempts: 0,
    estimatedDelivery: estimatedDeliveryIso,
    estimatedDeliveryMin: estimatedDeliveryMinIso,
    deliveryOption: resolvedDeliveryOption,
    deliveryOptionLabel: resolvedDeliveryLabel,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  const result = await db.collection('orders').insertOne(order)

  // === Send notification: Order placed ===
  await createCustomerNotification({
    customerId: params.customerId,
    type: 'order_placed',
    title: 'Order Placed Successfully! 🎉',
    message: `Your order ${orderId} has been placed. ${params.paymentMethod === 'cod' ? 'Pay on delivery.' : 'Payment received.'} Estimated delivery: ${resolvedDeliveryLabel || '3-7 days'}.`,
    relatedId: orderId,
    relatedType: 'order',
  })

  // Log the initial status
  await logStatusChange({
    orderId,
    fromStatus: null,
    toStatus: 'Pending',
    role: 'system',
    userId: 'system',
    userName: 'System',
    reason: 'Order created',
  })

  // === Inventory: Decrement stock for each ordered item ===
  // This is the production-grade behaviour: stock is consumed atomically when
  // an order is placed, with an audit trail in inventory_movements. Failures
  // are logged but do NOT block order creation (the order is already placed);
  // the seller / admin can reconcile via the inventory panel.
  for (const item of orderItems) {
    try {
      // Determine variant identifier (order items may store variant as object or string)
      let variantId: string | undefined
      if (item.variant) {
        if (typeof item.variant === 'string') {
          variantId = item.variant
        } else if (typeof item.variant === 'object') {
          const v = item.variant as Record<string, unknown>
          variantId = (v._id as string) || (v.sku as string) || (v.id as string) || undefined
        }
      }

      const decResult = await decrementStock({
        productId: item.productId,
        quantity: item.quantity,
        variantId,
        orderId,
        reason: `Order ${orderId} placed by ${params.customerName || 'customer'}`,
        performedBy: 'system',
      })
      if (!decResult.success) {
        console.warn(`[Order ${orderId}] Stock decrement failed for product ${item.productId}: ${decResult.message}`)
      }
    } catch (invErr) {
      console.error(`[Order ${orderId}] Inventory decrement error for product ${item.productId}:`, invErr)
    }
  }

  console.log(
    `[Order] Created order ${orderId} with ${orderItems.length} item(s), total: ₹${totalAmount} | ` +
    `deliveryOption: ${resolvedDeliveryOption} (${resolvedDeliveryLabel}) | ` +
    `requestedOption: ${params.deliveryOption || '(none — legacy)'} | ` +
    `deliveryFee: ₹${customerDeliveryFee} | ` +
    `estimatedDelivery: ${estimatedDeliveryIso}`,
  )

  return {
    ...order,
    _id: result.insertedId.toString(),
  }
}

/* ------------------------------------------------------------------ */
/*  Status Transition Execution                                         */
/* ------------------------------------------------------------------ */

/**
 * Execute a validated status transition.
 * This updates the order/item status and logs the change.
 *
 * @throws Error if transition is invalid
 */
export async function executeStatusTransition(params: {
  orderId: string
  orderItemId?: string
  toStatus: OrderStatus
  role: UserRole
  userId: string
  userName: string
  reason?: string
  otp?: string
}): Promise<{ success: boolean; message: string }> {
  const { db } = await connectToDatabase()

  // Find the order
  const order = await db.collection('orders').findOne({ orderId: params.orderId })
  if (!order) {
    return { success: false, message: 'Order not found' }
  }

  const toStatus = normalizeStatus(params.toStatus)

  if (params.orderItemId) {
    // Update specific item status (multi-vendor)
    const item = order.items?.find((i: OrderItem) => i._id === params.orderItemId || i.productId === params.orderItemId)
    if (!item) {
      return { success: false, message: 'Order item not found' }
    }

    const fromStatus = normalizeStatus(item.status)
    const validation = validateTransition(fromStatus, toStatus, params.role)
    if (!validation.allowed) {
      return { success: false, message: validation.reason || 'Invalid transition' }
    }

    // For OTP-required statuses, verify the OTP
    if (toStatus === 'Delivered' || toStatus === 'Return Completed') {
      if (!params.otp) {
        return { success: false, message: 'OTP is required to complete this action' }
      }
      const { verifyOrderOTP } = await import('./order-otp')
      const otpResult = await verifyOrderOTP(
        params.orderId,
        params.orderItemId,
        params.otp,
        toStatus === 'Delivered' ? 'delivery' : 'pickup',
        params.userId,
      )
      if (!otpResult.success) {
        return { success: false, message: otpResult.message }
      }
    }

    // Update item status
    await db.collection('orders').updateOne(
      { orderId: params.orderId, 'items._id': params.orderItemId },
      {
        $set: {
          'items.$.status': toStatus,
          'items.$.updatedAt': new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    )

    // Update overall order status based on all items
    await updateOverallOrderStatus(params.orderId)

    // Log the status change
    await logStatusChange({
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      fromStatus,
      toStatus,
      role: params.role,
      userId: params.userId,
      userName: params.userName,
      reason: params.reason,
    })

    // Side effects
    if (toStatus === 'Delivered') {
      await handleDeliveryComplete(params.orderId, params.orderItemId)
    } else if (toStatus === 'Return Completed') {
      await handleReturnComplete(params.orderId, params.orderItemId)
    } else if (toStatus === 'Cancelled') {
      await handleOrderCancel(params.orderId, params.orderItemId, params.reason)
    } else if (toStatus === 'Return Approved') {
      // === Send "Return Request Accepted" email to the customer ===
      // Fires when a seller approves the customer's return request. Mirrors
      // Flipkart / Amazon / Meesho practice. Fire-and-forget — email failure
      // never blocks the approval. Runs after the status + log are committed.
      try {
        const freshOrder = await db.collection('orders').findOne({ orderId: params.orderId }) as unknown as Order | null
        if (freshOrder) {
          const item = (freshOrder.items as any[])?.find(
            i => i._id?.toString() === params.orderItemId || i.id === params.orderItemId,
          )
          const customerEmail = await resolveCustomerEmail(freshOrder)
          if (customerEmail) {
            const { platformName } = await getPlatformInfoForEmail()
            const returnReason = (item as { returnReason?: string })?.returnReason
              || freshOrder.returnReason
              || 'Return requested by customer'
            const filterIds = new Set<string>()
            if (params.orderItemId) filterIds.add(params.orderItemId)
            const itemsSummary = buildItemsSummary(freshOrder, filterIds)
            const result = await sendReturnRequestAcceptedEmail({
              to: customerEmail,
              customerName: freshOrder.customerName || 'Customer',
              orderId: freshOrder.orderId,
              returnId: (item as { returnId?: string })?.returnId || freshOrder.returnId,
              returnReason,
              itemsSummary,
              approvedAt: new Date().toISOString(),
              platformName,
            })
            if (result.success) {
              console.log(`[Order] Return accepted email sent to ${customerEmail} for order ${params.orderId}`)
            } else if (result.queued) {
              console.log(`[Order] Return accepted email queued for ${customerEmail} (order ${params.orderId}). Configure SMTP to send.`)
            } else {
              console.warn(`[Order] Return accepted email not sent for order ${params.orderId}: ${result.error}`)
            }
          } else {
            console.log(`[Order] No email on file for order ${params.orderId}. Return accepted email skipped.`)
          }
        }
      } catch (emailErr) {
        console.error(`[Order] Return accepted email error for order ${params.orderId}:`, emailErr)
      }
    }

  } else {
    // Update entire order status
    const fromStatus = normalizeStatus(order.status)
    const validation = validateTransition(fromStatus, toStatus, params.role)
    if (!validation.allowed) {
      return { success: false, message: validation.reason || 'Invalid transition' }
    }

    const updateFields: Record<string, unknown> = {
      status: toStatus,
      updatedAt: new Date().toISOString(),
    }

    if (toStatus === 'Cancelled') {
      updateFields.cancelledAt = new Date().toISOString()
      updateFields.cancellationReason = params.reason || 'Cancelled by user'
      updateFields.cancelledBy = params.role === 'customer' ? 'customer' : 'seller'
    }

    if (toStatus === 'Delivered') {
      updateFields.deliveredAt = new Date().toISOString()
    }

    await db.collection('orders').updateOne(
      { orderId: params.orderId },
      { $set: updateFields },
    )

    // Also update all items to the same status
    await db.collection('orders').updateOne(
      { orderId: params.orderId },
      {
        $set: {
          'items.$[elem].status': toStatus,
          'items.$[elem].updatedAt': new Date().toISOString(),
        },
      },
      { arrayFilters: [{ 'elem.status': { $ne: toStatus } }] },
    )

    // Log the status change
    await logStatusChange({
      orderId: params.orderId,
      fromStatus,
      toStatus,
      role: params.role,
      userId: params.userId,
      userName: params.userName,
      reason: params.reason,
    })

    // === Whole-order side effects (inventory restock) ===
    // When an entire order is cancelled or returned, restock every item that
    // was not already in a terminal restocked state. This mirrors the
    // per-item handlers above.
    if (toStatus === 'Cancelled' || toStatus === 'Return Completed') {
      // Use the original order snapshot (fetched at the top of this function)
      // — the items array has already been updated to toStatus by now.
      const items = (order.items as any[]) || []
      const cancelledItemIds: string[] = [] // collected for cancellation credit note
      const returnedItemIds: string[] = [] // collected for return credit note
      for (const item of items) {
        // Skip items that were already cancelled/returned before this transition
        // (their stock was already restocked by the per-item handler previously)
        const prevStatus = normalizeStatus(item.status)
        if (prevStatus === 'Cancelled' || prevStatus === 'Return Completed') continue

        // Track this item for the appropriate credit note
        const iid = String(item._id || item.id || '')
        if (iid) {
          if (toStatus === 'Cancelled') {
            cancelledItemIds.push(iid)
          } else if (toStatus === 'Return Completed') {
            returnedItemIds.push(iid)
          }
        }

        try {
          let variantId: string | undefined
          if (item.variant) {
            if (typeof item.variant === 'string') {
              variantId = item.variant
            } else if (typeof item.variant === 'object') {
              const v = item.variant as Record<string, unknown>
              variantId = (v._id as string) || (v.sku as string) || (v.id as string) || undefined
            }
          }
          const restockResult = await restockProduct({
            productId: item.productId,
            quantity: item.quantity,
            variantId,
            orderId: params.orderId,
            reason: toStatus === 'Return Completed'
              ? `Return completed for order ${params.orderId}`
              : (params.reason ? `Order cancelled: ${params.reason}` : `Order ${params.orderId} cancelled`),
            performedBy: 'system',
          })
          if (!restockResult.success) {
            console.warn(`[Order ${params.orderId}] Restock failed for item ${item._id}: ${restockResult.message}`)
          }
        } catch (invErr) {
          console.error(`[Order ${params.orderId}] Restock error for item ${item._id}:`, invErr)
        }
      }

      // === Generate & send GST credit note for whole-order CANCELLATION ===
      // Reverses the original tax invoice per GST Rule 16 (CGST Rules 2017).
      // Only for cancellations (returns have their own flow). Fire-and-forget.
      if (toStatus === 'Cancelled' && cancelledItemIds.length > 0) {
        // === Process refund for whole-order online cancellation ===
        // The refund amount = order total − non-refundable platform fee.
        // (Delivery fee + COD fee ARE refunded for whole-order cancellation;
        //  only the platform/handling fee is non-refundable, matching
        //  Amazon / Flipkart / Meesho policy.)
        const orderPaymentMethod = order.paymentMethod as 'cod' | 'online'
        const orderPaymentStatus = order.paymentStatus as string
        const orderTotalAmount = (order.totalAmount as number) ?? 0
        const orderPlatformFee = (order.platformFee as number) ?? 0
        const wholeOrderRefundAmount = Math.max(0, orderTotalAmount - orderPlatformFee)
        if (wholeOrderRefundAmount > 0 && (orderPaymentMethod === 'online' || orderPaymentStatus === 'paid')) {
          try {
            const { processRefund } = await import('./finance-management')
            const refundResult = await processRefund({
              orderId: params.orderId,
              orderItemId: undefined, // whole-order refund
              amount: wholeOrderRefundAmount,
              reason: params.reason || 'Order cancelled by customer',
              initiatedBy: params.role,
              refundType: 'full',
            })
            if (refundResult.success) {
              console.log(`[Order ${params.orderId}] Whole-order refund ${refundResult.refundId} processed (₹${wholeOrderRefundAmount}, platform fee ₹${orderPlatformFee} non-refundable)`)
            } else {
              console.warn(`[Order ${params.orderId}] Whole-order refund failed: ${refundResult.error}`)
            }
          } catch (refundErr) {
            console.error(`[Order ${params.orderId}] Whole-order refund error:`, refundErr)
          }
        }

        const cnCancelledBy: 'customer' | 'seller' | 'system' =
          params.role === 'customer' ? 'customer'
            : params.role === 'seller' ? 'seller'
              : 'system'
        generateAndSendCreditNote(
          params.orderId,
          cancelledItemIds,
          params.reason || 'Order cancelled',
          cnCancelledBy,
        ).catch((cnErr) => {
          console.error(`[Order ${params.orderId}] Credit note generation error:`, cnErr)
        })
      }

      // === Generate & send GST credit note for whole-order RETURN ===
      // Mirrors the cancellation flow but with reasonType='return'. The credit
      // note reverses the original tax invoice for ALL returned items in one
      // document. Fire-and-forget — never blocks return completion.
      if (toStatus === 'Return Completed' && returnedItemIds.length > 0) {
        const returnReason = (order as { returnReason?: string }).returnReason
          || params.reason
          || 'Return completed - product returned by customer'
        generateAndSendReturnCreditNote(
          params.orderId,
          returnedItemIds,
          returnReason,
        ).catch((cnErr) => {
          console.error(`[Order ${params.orderId}] Return credit note generation error:`, cnErr)
        })
      }
    }
  }

  return { success: true, message: `Status updated to "${toStatus}"` }
}

/**
 * Update the overall order status based on all item statuses.
 * Uses "lowest common denominator" logic:
 *   - If all items have the same status → order status = that status
 *   - If items have different statuses → order status = the "lowest" active status
 */
async function updateOverallOrderStatus(orderId: string): Promise<void> {
  const { db } = await connectToDatabase()

  const order = await db.collection('orders').findOne({ orderId })
  if (!order || !order.items) return

  const itemStatuses: OrderStatus[] = order.items.map((i: OrderItem) => normalizeStatus(i.status))
  const uniqueStatuses = [...new Set(itemStatuses)]

  let overallStatus: OrderStatus

  if (uniqueStatuses.length === 1) {
    overallStatus = uniqueStatuses[0]
  } else {
    // Priority order: the "least progressed / most active" status wins.
    // Return flow statuses should take priority over "Delivered" because
    // they represent active issues that need attention.
    const statusPriority: OrderStatus[] = [
      'Pending', 'Processing', 'Shipped', 'Out for Delivery',
      'Not Delivered', 'Return Requested', 'Return Approved',
      'Out for Pickup', 'Return Completed',
      'Delivered', 'Cancelled', 'Return Cancelled',
    ]

    overallStatus = uniqueStatuses.reduce((lowest, status) => {
      const lowestIdx = statusPriority.indexOf(lowest)
      const statusIdx = statusPriority.indexOf(status)
      return statusIdx < lowestIdx ? status : lowest
    }, statusPriority[statusPriority.length - 1])
  }

  await db.collection('orders').updateOne(
    { orderId },
    {
      $set: {
        status: overallStatus,
        updatedAt: new Date().toISOString(),
        ...(overallStatus === 'Delivered' ? { deliveredAt: new Date().toISOString() } : {}),
        ...(overallStatus === 'Cancelled' ? { cancelledAt: new Date().toISOString() } : {}),
      },
    },
  )
}

/* ------------------------------------------------------------------ */
/*  Delivery Assignment                                                 */
/* ------------------------------------------------------------------ */

/**
 * Assign a delivery boy to an order item.
 * Creates a DeliveryAssignment record and generates OTP.
 */
export async function assignDeliveryBoy(params: {
  orderId: string
  orderItemId: string
  deliveryBoyId: string
  deliveryBoyName: string
  deliveryBoyPhone: string
  sellerId: string
  sellerName: string
  type: 'delivery' | 'pickup'
}): Promise<{ success: boolean; message: string }> {
  const { db } = await connectToDatabase()

  // Check if there's an existing pending assignment
  const existingAssignment = await db.collection('delivery_assignments').findOne({
    orderItemId: params.orderItemId,
    status: 'pending',
  })

  if (existingAssignment) {
    // Cancel existing assignment
    await db.collection('delivery_assignments').updateOne(
      { _id: existingAssignment._id },
      { $set: { status: 'rejected', rejectReason: 'Reassigned by seller', respondedAt: new Date() } },
    )
  }

  // Create new assignment
  const now = new Date()

  // For pickup type, get the returnId from the order item
  let returnId: string | undefined
  if (params.type === 'pickup') {
    const order = await db.collection('orders').findOne({ orderId: params.orderId })
    if (order) {
      const item = (order.items || []).find((i: OrderItem) => i._id === params.orderItemId)
      returnId = item?.returnId || order.returnId
    }
  }

  await db.collection('delivery_assignments').insertOne({
    orderId: params.orderId,
    orderItemId: params.orderItemId,
    deliveryBoyId: params.deliveryBoyId,
    deliveryBoyName: params.deliveryBoyName,
    deliveryBoyPhone: params.deliveryBoyPhone,
    sellerId: params.sellerId,
    sellerName: params.sellerName,
    status: 'pending',
    type: params.type,
    returnId: returnId || undefined,
    assignedAt: now,
  })

  // Update the order item with delivery boy info
  // IMPORTANT: For pickup type, store in SEPARATE pickup fields to preserve
  // the original delivery boy's info. The original delivery boy should still
  // see their completed delivery in the Completed tab.
  if (params.type === 'pickup') {
    await db.collection('orders').updateOne(
      {
        orderId: params.orderId,
        'items._id': params.orderItemId,
      },
      {
        $set: {
          'items.$.pickupDeliveryBoyId': params.deliveryBoyId,
          'items.$.pickupDeliveryBoyName': params.deliveryBoyName,
          'items.$.pickupDeliveryBoyPhone': params.deliveryBoyPhone,
          'items.$.updatedAt': now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
    )
  } else {
    await db.collection('orders').updateOne(
      {
        orderId: params.orderId,
        'items._id': params.orderItemId,
      },
      {
        $set: {
          'items.$.deliveryBoyId': params.deliveryBoyId,
          'items.$.deliveryBoyName': params.deliveryBoyName,
          'items.$.deliveryBoyPhone': params.deliveryBoyPhone,
          'items.$.updatedAt': now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
    )
  }

  // Generate OTP for the customer
  await createOrderOTP(params.orderId, params.orderItemId, params.type)

  console.log(`[Delivery] Assigned ${params.deliveryBoyName} to order item ${params.orderItemId} (${params.type})`)

  return { success: true, message: 'Delivery boy assigned successfully' }
}

/**
 * Delivery boy accepts or rejects an assignment.
 */
export async function respondToAssignment(params: {
  assignmentId: string
  deliveryBoyId: string
  response: 'accepted' | 'rejected'
  reason?: string
}): Promise<{ success: boolean; message: string }> {
  const { db } = await connectToDatabase()

  const assignment = await db.collection('delivery_assignments').findOne({
    _id: new ObjectId(params.assignmentId),
    deliveryBoyId: params.deliveryBoyId,
    status: 'pending',
  })

  if (!assignment) {
    return { success: false, message: 'Assignment not found or already responded' }
  }

  await db.collection('delivery_assignments').updateOne(
    { _id: assignment._id },
    {
      $set: {
        status: params.response,
        respondedAt: new Date(),
        ...(params.response === 'rejected' ? { rejectReason: params.reason } : {}),
      },
    },
  )

  if (params.response === 'rejected') {
    // Clear delivery boy from order item so seller can reassign
    // IMPORTANT: Clear pickup fields for pickup assignments, delivery fields for delivery assignments
    if (assignment.type === 'pickup') {
      await db.collection('orders').updateOne(
        {
          orderId: assignment.orderId,
          'items._id': assignment.orderItemId,
        },
        {
          $set: {
            'items.$.pickupDeliveryBoyId': null,
            'items.$.pickupDeliveryBoyName': null,
            'items.$.pickupDeliveryBoyPhone': null,
            'items.$.updatedAt': new Date().toISOString(),
          },
        },
      )
    } else {
      await db.collection('orders').updateOne(
        {
          orderId: assignment.orderId,
          'items._id': assignment.orderItemId,
        },
        {
          $set: {
            'items.$.deliveryBoyId': null,
            'items.$.deliveryBoyName': null,
            'items.$.deliveryBoyPhone': null,
            'items.$.updatedAt': new Date().toISOString(),
          },
        },
      )
    }
  }

  console.log(`[Delivery] ${params.deliveryBoyId} ${params.response} assignment ${params.assignmentId}`)

  return { success: true, message: `Assignment ${params.response}` }
}

/* ------------------------------------------------------------------ */
/*  Return Flow Helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Process a return request from a customer.
 * Generates a Return ID and updates the order item status.
 */
export async function processReturnRequest(params: {
  orderId: string
  orderItemId: string
  customerId: string
  reason: string,
}): Promise<{ success: boolean; message: string; returnId?: string }> {
  const { db } = await connectToDatabase()

  const order = await db.collection('orders').findOne({ orderId: params.orderId })
  if (!order) {
    return { success: false, message: 'Order not found' }
  }

  const item = order.items?.find((i: OrderItem) => i._id === params.orderItemId)
  if (!item) {
    return { success: false, message: 'Order item not found' }
  }

  // Check if the item is in a returnable status
  if (normalizeStatus(item.status) !== 'Delivered') {
    return { success: false, message: 'Only delivered items can be returned' }
  }

  // Generate Return ID
  const returnId = generateReturnId()

  // Update the order item status AND store returnId on the item itself
  await db.collection('orders').updateOne(
    { orderId: params.orderId, 'items._id': params.orderItemId },
    {
      $set: {
        'items.$.status': 'Return Requested',
        'items.$.updatedAt': new Date().toISOString(),
        'items.$.returnId': returnId,
        'items.$.returnReason': params.reason,
        'items.$.returnRequestedAt': new Date().toISOString(),
        returnId,
        returnReason: params.reason,
        returnRequestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  )

  // Update overall order status
  await updateOverallOrderStatus(params.orderId)

  // Log the status change
  await logStatusChange({
    orderId: params.orderId,
    orderItemId: params.orderItemId,
    fromStatus: 'Delivered',
    toStatus: 'Return Requested',
    role: 'customer',
    userId: params.customerId,
    userName: order.customerName,
    reason: params.reason,
  })

  console.log(`[Return] Return ${returnId} requested for order item ${params.orderItemId}`)

  return { success: true, message: 'Return requested successfully', returnId }
}

/* ------------------------------------------------------------------ */
/*  Side Effect Handlers                                                */
/* ------------------------------------------------------------------ */

async function handleDeliveryComplete(orderId: string, orderItemId: string): Promise<void> {
  const { db } = await connectToDatabase()

  // Update delivery attempt count
  await db.collection('orders').updateOne(
    { orderId },
    { $inc: { deliveryAttempts: 1 } },
  )

  // Mark payment as paid for COD orders
  await db.collection('orders').updateOne(
    { orderId, paymentMethod: 'cod' },
    { $set: { paymentStatus: 'paid' } },
  )

  // === Inventory Analytics: increment totalSold on the product ===
  // totalSold is a cached counter used for popularity sorting & "best seller"
  // badges. We increment it here (on successful delivery) rather than at order
  // placement so that cancelled/returned orders don't inflate the figure.
  try {
    const order = await db.collection('orders').findOne({ orderId })
    const item = (order?.items as any[])?.find(i => i.id === orderItemId || i._id?.toString() === orderItemId)
    if (item?.productId) {
      let product: any = null
      try {
        product = await db.collection('products').findOne({ _id: new ObjectId(item.productId) })
      } catch {
        /* _id may be a string */
      }
      if (!product) {
        product = await db.collection('products').findOne({ _id: item.productId as any })
      }
      if (product) {
        await db.collection('products').updateOne(
          { _id: product._id },
          { $inc: { totalSold: item.quantity || 1 }, $set: { updatedAt: new Date() } },
        )
      }
    }
  } catch (soldErr) {
    console.error(`[Order ${orderId}] totalSold increment error:`, soldErr)
  }

  // === Send "Order Delivered" confirmation email to the customer ===
  // Mirrors Flipkart / Amazon / Meesho practice. Fire-and-forget — email
  // failure NEVER blocks delivery completion. Only sent when ALL items in
  // the order are Delivered (overall order status == 'Delivered') so we
  // don't spam the customer with one email per item in a multi-vendor order.
  try {
    // Re-fetch the order to check overall status
    const freshOrder = await db.collection('orders').findOne({ orderId }) as unknown as Order | null
    if (freshOrder && normalizeStatus(freshOrder.status) === 'Delivered') {
      const deliveredAt = freshOrder.deliveredAt || new Date().toISOString()
      const customerEmail = await resolveCustomerEmail(freshOrder)
      if (customerEmail) {
        const { platformName } = await getPlatformInfoForEmail()
        const itemsSummary = buildItemsSummary(freshOrder)
        const result = await sendOrderDeliveredEmail({
          to: customerEmail,
          customerName: freshOrder.customerName || 'Customer',
          orderId: freshOrder.orderId,
          invoiceNumber: freshOrder.invoiceNumber,
          deliveredAt,
          itemsSummary,
          platformName,
        })
        if (result.success) {
          console.log(`[Order] Delivered email sent to ${customerEmail} for order ${orderId}`)
        } else if (result.queued) {
          console.log(`[Order] Delivered email queued for ${customerEmail} (order ${orderId}). Configure SMTP to send.`)
        } else {
          console.warn(`[Order] Delivered email not sent for order ${orderId}: ${result.error}`)
        }
      } else {
        console.log(`[Order] No email on file for order ${orderId}. Delivered email skipped.`)
      }
    }
  } catch (emailErr) {
    console.error(`[Order] Delivered email error for order ${orderId}:`, emailErr)
  }

  console.log(`[Order] Delivery completed for item ${orderItemId} in order ${orderId}`)

  // === Send notification: Order delivered ===
  try {
    const freshOrderForNotif = await db.collection('orders').findOne({ orderId }) as unknown as Order | null
    if (freshOrderForNotif && normalizeStatus(freshOrderForNotif.status) === 'Delivered') {
      const notifCustomerId = (freshOrderForNotif as unknown as { customerId?: string }).customerId
      if (notifCustomerId) {
        await createCustomerNotification({
          customerId: notifCustomerId,
          type: 'order_delivered',
          title: 'Order Delivered! 📦',
          message: `Your order ${orderId} has been delivered. Enjoy your purchase! Rate your products and seller.`,
          relatedId: orderId,
          relatedType: 'order',
        })
      }
    }
  } catch (notifErr) {
    console.error(`[Order ${orderId}] Delivery notification error:`, notifErr)
  }

  // === Referral Engine: qualify + reward on first delivered order ===
  // If this customer was referred by a friend, their first delivered
  // order triggers the referral reward for BOTH the referrer and the
  // new customer (credited to their wallets). Fire-and-forget —
  // referral failures never block delivery.
  try {
    const freshOrderForReferral = await db.collection('orders').findOne({ orderId }) as unknown as Order | null
    if (freshOrderForReferral && normalizeStatus(freshOrderForReferral.status) === 'Delivered') {
      const refCustomerId = (freshOrderForReferral as unknown as { customerId?: string }).customerId
      if (refCustomerId) {
        await processReferralOnDelivery(refCustomerId, orderId)
      }
    }
  } catch (refErr) {
    console.error(`[Order ${orderId}] Referral processing error:`, refErr)
  }
}

async function handleReturnComplete(orderId: string, orderItemId: string): Promise<void> {
  const { db } = await connectToDatabase()

  // Fetch order to determine refund amount and payment method
  const order = await db.collection('orders').findOne({ orderId })
  if (order) {
    // Find the returned item to get its amount
    const item = (order.items as any[])?.find(i => i.id === orderItemId || i._id?.toString() === orderItemId)
    const refundAmount = item?.total || item?.effectivePrice || 0
    const paymentMethod = order.paymentMethod as 'cod' | 'online'

    // === Inventory: Restock the returned item ===
    if (item) {
      let variantId: string | undefined
      if (item.variant) {
        if (typeof item.variant === 'string') {
          variantId = item.variant
        } else if (typeof item.variant === 'object') {
          const v = item.variant as Record<string, unknown>
          variantId = (v._id as string) || (v.sku as string) || (v.id as string) || undefined
        }
      }
      try {
        const restockResult = await restockProduct({
          productId: item.productId,
          quantity: item.quantity,
          variantId,
          orderId,
          reason: `Return completed for order ${orderId}`,
          performedBy: 'system',
        })
        if (!restockResult.success) {
          console.warn(`[Order ${orderId}] Restock failed for returned item ${orderItemId}: ${restockResult.message}`)
        }
      } catch (invErr) {
        console.error(`[Order ${orderId}] Restock error on return:`, invErr)
      }
    }

    // Only process refund if there's an amount and it was a paid order
    if (refundAmount > 0 && (paymentMethod === 'online' || order.paymentStatus === 'paid')) {
      // Import dynamically to avoid circular dependency
      const { processRefund } = await import('./finance-management')
      const refundResult = await processRefund({
        orderId,
        orderItemId,
        amount: refundAmount,
        reason: 'Return completed - product returned by customer',
        initiatedBy: 'system',
        refundType: 'partial',
      })
      if (refundResult.success) {
        console.log(`[Order] Refund ${refundResult.refundId} processed for returned item ${orderItemId}`)
      } else {
        console.warn(`[Order] Refund failed for returned item ${orderItemId}: ${refundResult.error}`)
      }
    } else {
      // COD or unpaid order — just mark as refunded (no money to return)
      await db.collection('orders').updateOne(
        { orderId },
        { $set: { paymentStatus: 'refunded' } },
      )
    }

    // === RTO Charge: Charge the seller for the return (as Flipkart/Amazon/Meesho do) ===
    // When a customer returns an item, the seller is charged an RTO (Return to Origin)
    // fee to cover the return logistics and processing. This is deducted from the
    // seller's earnings on this order item.
    if (item && item.sellerId) {
      try {
        // Fetch RTO charge from commission settings
        const commissionSettings = await db.collection('settings').findOne({ key: 'commission' })
        const rtoCharge = Number(commissionSettings?.rtoCharge) || 0

        if (rtoCharge > 0) {
          const now = new Date().toISOString()

          // Deduct RTO charge from the item's seller earnings
          const newSellerEarnings = Math.max(0, (item.sellerEarnings || 0) - rtoCharge)

          // Update the item: set rtoCharge, rtoAppliedAt, and adjusted sellerEarnings
          await db.collection('orders').updateOne(
            { orderId, 'items.id': orderItemId },
            {
              $set: {
                'items.$.rtoCharge': rtoCharge,
                'items.$.rtoAppliedAt': now,
                'items.$.sellerEarnings': newSellerEarnings,
              },
            },
          )

          // Also decrement the order-level totalSellerEarnings
          await db.collection('orders').updateOne(
            { orderId },
            { $inc: { totalSellerEarnings: -rtoCharge } },
          )

          // Record a ledger transaction for the RTO charge (platform revenue)
          const { recordTransaction } = await import('./finance-management')
          await recordTransaction({
            type: 'rto_charge',
            subType: 'return_rto',
            orderId,
            sellerId: item.sellerId,
            amount: rtoCharge,
            description: `RTO charge for returned item in order ${orderId}`,
            paymentMethod: 'internal',
            status: 'completed',
            date: new Date(),
          })

          console.log(`[Order ${orderId}] RTO charge of ₹${rtoCharge} applied to seller ${item.sellerId} for returned item ${orderItemId}`)
        }
      } catch (rtoErr) {
        console.error(`[Order ${orderId}] RTO charge application error:`, rtoErr)
        // Non-fatal — don't block return completion if RTO charge fails
      }
    }

    // === Generate & send GST credit note for the returned item ===
    // Per GST Rule 16 (CGST Rules 2017) and matching Flipkart / Amazon /
    // Meesho practice, a credit note is issued on return completion to
    // reverse the original tax invoice for the returned item(s). This is
    // the production-standard activity taken against the invoice when a
    // return is completed. Fire-and-forget — never blocks return completion.
    // For multi-vendor orders where the whole order is returned via the
    // whole-order path in executeStatusTransition, the credit note for ALL
    // returned items is generated there (not here, to avoid duplicates).
    const itemIdStr = String((item as { _id?: string; id?: string })?._id?.toString()
      || (item as { id?: string })?.id?.toString()
      || orderItemId || '')
    const returnReason = (item as { returnReason?: string })?.returnReason
      || (order as { returnReason?: string }).returnReason
      || 'Return completed - product returned by customer'
    if (itemIdStr) {
      generateAndSendReturnCreditNote(
        orderId,
        [itemIdStr],
        returnReason,
      ).catch((cnErr) => {
        console.error(`[Order ${orderId}] Return credit note generation error:`, cnErr)
      })
    }
  }

  console.log(`[Order] Return completed for item ${orderItemId} in order ${orderId}`)
}

/* ------------------------------------------------------------------ */
/*  Credit Note Generation (on cancellation)                            */
/* ------------------------------------------------------------------ */

/**
 * Generate a GST credit note for the cancelled item(s) and email it to the
 * customer. This reverses the original tax invoice per GST Rule 16 (CGST
 * Rules 2017), mirroring the practice of Flipkart / Amazon / Meesho India.
 *
 * This function NEVER throws — all errors are caught and logged so that
 * order cancellation is never blocked by credit note / email issues.
 *
 * @param orderId  The order being cancelled
 * @param itemIds  Specific item IDs included in this credit note. If empty,
 *                 all items with status 'Cancelled' are included (whole-order).
 * @param reason   Cancellation reason
 * @param cancelledBy  Who cancelled ('customer' | 'seller' | 'system')
 */
async function generateAndSendCreditNote(
  orderId: string,
  itemIds: string[],
  reason: string,
  cancelledBy: 'customer' | 'seller' | 'system',
): Promise<void> {
  try {
    const { db } = await connectToDatabase()

    // Re-fetch the order to get the latest state (with cancelledAt etc. set)
    const orderDoc = await db.collection('orders').findOne({ orderId })
    if (!orderDoc) {
      console.warn(`[CreditNote] Order ${orderId} not found — skipping credit note`)
      return
    }
    const order = orderDoc as unknown as Order

    // 1. Fetch customer email — prefer order.customerEmail, fallback to DB
    let customerEmail = order.customerEmail
    if (!customerEmail) {
      try {
        const customer = await db.collection('customers').findOne({ _id: new ObjectId(order.customerId) })
        customerEmail = customer?.email || undefined
      } catch {
        try {
          const customer = await db.collection('customers').findOne({ mobile: order.customerPhone })
          customerEmail = customer?.email || undefined
        } catch { /* no email available */ }
      }
    }

    // 2. Fetch platform settings (name, GSTIN, address)
    let platformName = 'ShopHub'
    let platformGstin = ''
    let platformAddress: string | undefined
    try {
      const [siteSettings, taxSettings] = await Promise.all([
        db.collection('settings').findOne({ key: 'site' }),
        db.collection('settings').findOne({ key: 'tax' }),
      ])
      if (siteSettings?.siteName) platformName = siteSettings.siteName
      if (taxSettings?.platformGstin) platformGstin = taxSettings.platformGstin
      if (taxSettings?.platformAddress) platformAddress = taxSettings.platformAddress
    } catch { /* use defaults */ }

    // 3. Generate a unique credit note number
    const creditNoteNumber = generateCreditNoteNumber()
    const issuedAt = new Date().toISOString()

    // 4. Build credit note data for the cancelled item(s) only
    const creditNoteData = await buildCreditNoteData(order, {
      platformName,
      platformGstin,
      platformAddress,
      itemIds: itemIds.length > 0 ? itemIds : undefined,
      reason,
      cancelledBy,
    })
    creditNoteData.creditNoteNumber = creditNoteNumber
    creditNoteData.creditNoteDate = issuedAt

    // 5. Generate PDF + email HTML (in parallel for speed)
    const [pdfBuffer, emailHTML] = await Promise.all([
      generateCreditNotePDF(creditNoteData),
      Promise.resolve(generateCreditNoteEmailHTML(creditNoteData)),
    ])

    // 6. Persist the credit note record on the order (append to creditNotes
    //    array, and update the convenience fields creditNoteNumber / IssuedAt)
    const record: CreditNoteRecord = {
      number: creditNoteNumber,
      issuedAt,
      reason,
      cancelledBy,
      itemIds: itemIds.length > 0 ? itemIds : (order.items || []).map((i) => String((i as { _id?: string; id?: string })._id || (i as { id?: string }).id || '')),
      amount: creditNoteData.refundAmount,
      refundId: order.refundId,
      refundStatus: creditNoteData.refundStatus,
      refundedAt: order.refundedAt,
      reasonType: 'cancellation',
    }

    await db.collection('orders').updateOne(
      { orderId },
      {
        $push: { creditNotes: record },
        $set: {
          creditNoteNumber,
          creditNoteIssuedAt: issuedAt,
          updatedAt: new Date().toISOString(),
        },
      },
    )

    console.log(`[CreditNote] Generated ${creditNoteNumber} for order ${orderId} (reverses ${creditNoteData.originalInvoiceNumber})`)

    // 7. Send email to the customer (if we have an email on file)
    if (customerEmail) {
      try {
        const result = await sendCreditNoteEmail({
          to: customerEmail,
          customerName: order.customerName || 'Customer',
          orderId: order.orderId,
          creditNoteNumber,
          originalInvoiceNumber: creditNoteData.originalInvoiceNumber,
          cancellationReason: reason,
          refundStatus: creditNoteData.refundStatus,
          refundAmount: creditNoteData.refundAmount,
          creditNoteHTML: emailHTML,
          pdfBuffer,
        })
        if (result.success) {
          console.log(`[CreditNote] Email sent to ${customerEmail} for order ${orderId}`)
        } else if (result.queued) {
          console.log(`[CreditNote] Email queued for ${customerEmail} (order ${orderId}). Configure SMTP to send.`)
        } else {
          console.warn(`[CreditNote] Email not sent for order ${orderId}: ${result.error}`)
        }
      } catch (emailErr) {
        console.error(`[CreditNote] Email send error for order ${orderId}:`, emailErr)
      }
    } else {
      console.log(`[CreditNote] No email on file for order ${orderId}. Credit note available in customer panel.`)
    }
  } catch (err) {
    // NEVER let credit note failure block cancellation
    console.error(`[CreditNote] Failed to generate/send credit note for order ${orderId}:`, err)
  }
}

/* ------------------------------------------------------------------ */
/*  Credit Note Generation (on return completion)                       */
/* ------------------------------------------------------------------ */

/**
 * Resolve a customer's email address for an order.
 *
 * Order documents may not always carry customerEmail (e.g. older orders or
 * customers who never set an email). This helper falls back to the customers
 * collection — first by _id (ObjectId), then by mobile number — so that
 * return/delivery emails reach the customer whenever an email is on file.
 *
 * Returns undefined if no email is available. NEVER throws.
 */
async function resolveCustomerEmail(order: Order): Promise<string | undefined> {
  // Fast path: email already on the order document
  if (order.customerEmail) return order.customerEmail

  try {
    const { db } = await connectToDatabase()
    let customer: { email?: string } | null = null
    try {
      customer = await db.collection('customers').findOne({ _id: new ObjectId(order.customerId) })
    } catch {
      /* _id may not be a valid ObjectId in legacy data — fall back below */
    }
    if (!customer) {
      customer = await db.collection('customers').findOne({ mobile: order.customerPhone })
    }
    return customer?.email || undefined
  } catch {
    return undefined
  }
}

/**
 * Build a short human-readable summary of order items (for email bodies).
 * Format: "• Product Name (Variant) x2 — ₹1,499" per line.
 */
function buildItemsSummary(order: Order, filterItemIds?: Set<string>): string {
  const items = (order.items || []).filter((i) => {
    if (!filterItemIds) return true
    const iid = String((i as { _id?: string; id?: string })._id?.toString()
      || (i as { id?: string }).id?.toString()
      || '')
    return filterItemIds.has(iid)
  })
  if (items.length === 0) return ''
  return items.map((i) => {
    const name = i.productName || 'Product'
    const qty = i.quantity ?? 1
    const price = i.effectivePrice ?? i.price ?? 0
    const variantStr = i.variant
      ? (typeof i.variant === 'string'
          ? i.variant
          : Array.isArray((i.variant as { values?: unknown }).values)
            ? (i.variant as { values: string[] }).values.join(', ')
            : '')
      : ''
    const variantPart = variantStr ? ` (${variantStr})` : ''
    return `• ${name}${variantPart} x${qty} — ₹${price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  }).join('\n')
}

/**
 * Fetch platform settings (name, GSTIN, address) for email/credit-note branding.
 * Returns sensible defaults if settings are missing or DB is unavailable.
 */
async function getPlatformInfoForEmail(): Promise<{ platformName: string; platformGstin: string; platformAddress?: string }> {
  let platformName = 'ShopHub'
  let platformGstin = ''
  let platformAddress: string | undefined
  try {
    const { db } = await connectToDatabase()
    const [siteSettings, taxSettings] = await Promise.all([
      db.collection('settings').findOne({ key: 'site' }),
      db.collection('settings').findOne({ key: 'tax' }),
    ])
    if (siteSettings?.siteName) platformName = siteSettings.siteName
    if (taxSettings?.platformGstin) platformGstin = taxSettings.platformGstin
    if (taxSettings?.platformAddress) platformAddress = taxSettings.platformAddress
  } catch { /* use defaults */ }
  return { platformName, platformGstin, platformAddress }
}

/**
 * Generate a GST credit note for the returned item(s) and email it to the
 * customer. This reverses the original tax invoice per GST Rule 16 (CGST
 * Rules 2017), mirroring the practice of Flipkart / Amazon / Meesho India
 * for completed returns.
 *
 * This is the RETURN equivalent of `generateAndSendCreditNote`. The key
 * differences are:
 *   - reasonType = 'return' (so the PDF/HTML/email say "Return Completed"
 *     instead of "Order Cancelled")
 *   - The credit note record is tagged with reasonType = 'return'
 *   - The email is sent via `sendReturnCompletedEmail` (return-specific
 *     subject + body), though the same credit note HTML/PDF is used
 *
 * This function NEVER throws — all errors are caught and logged so that
 * return completion is never blocked by credit note / email issues.
 *
 * @param orderId    The order being returned
 * @param itemIds    Specific item IDs included in this return credit note
 * @param reason     Return reason (from item.returnReason)
 */
async function generateAndSendReturnCreditNote(
  orderId: string,
  itemIds: string[],
  reason: string,
): Promise<void> {
  try {
    const { db } = await connectToDatabase()

    // Re-fetch the order to get the latest state
    const orderDoc = await db.collection('orders').findOne({ orderId })
    if (!orderDoc) {
      console.warn(`[ReturnCreditNote] Order ${orderId} not found — skipping credit note`)
      return
    }
    const order = orderDoc as unknown as Order

    // 1. Resolve customer email
    const customerEmail = await resolveCustomerEmail(order)

    // 2. Fetch platform settings
    const { platformName, platformGstin, platformAddress } = await getPlatformInfoForEmail()

    // 3. Generate a unique credit note number
    const creditNoteNumber = generateCreditNoteNumber()
    const issuedAt = new Date().toISOString()

    // 4. Build credit note data for the returned item(s) only — explicitly
    //    pass itemIds so buildCreditNoteData doesn't fall back to filtering
    //    by status === 'Cancelled' (returned items have status 'Return Completed').
    const creditNoteData = await buildCreditNoteData(order, {
      platformName,
      platformGstin,
      platformAddress,
      itemIds: itemIds.length > 0 ? itemIds : undefined,
      reason,
      cancelledBy: 'system',
      reasonType: 'return',
    })
    creditNoteData.creditNoteNumber = creditNoteNumber
    creditNoteData.creditNoteDate = issuedAt
    // Use issuedAt as the "returned at" timestamp on the credit note
    creditNoteData.cancelledAt = issuedAt

    // 5. Generate PDF + email HTML (in parallel for speed)
    const [pdfBuffer, emailHTML] = await Promise.all([
      generateCreditNotePDF(creditNoteData),
      Promise.resolve(generateCreditNoteEmailHTML(creditNoteData)),
    ])

    // 6. Persist the credit note record on the order
    const record: CreditNoteRecord = {
      number: creditNoteNumber,
      issuedAt,
      reason,
      cancelledBy: 'system',
      itemIds: itemIds.length > 0 ? itemIds : (order.items || []).map((i) => String((i as { _id?: string; id?: string })._id || (i as { id?: string }).id || '')),
      amount: creditNoteData.refundAmount,
      refundId: order.refundId,
      refundStatus: creditNoteData.refundStatus,
      refundedAt: order.refundedAt,
      reasonType: 'return',
    }

    await db.collection('orders').updateOne(
      { orderId },
      {
        $push: { creditNotes: record },
        $set: {
          creditNoteNumber,
          creditNoteIssuedAt: issuedAt,
          updatedAt: new Date().toISOString(),
        },
      },
    )

    console.log(`[ReturnCreditNote] Generated ${creditNoteNumber} for order ${orderId} (return, reverses ${creditNoteData.originalInvoiceNumber})`)

    // 7. Send the "Return Completed" email with the credit note attached
    if (customerEmail) {
      try {
        // Find the returnId for the returned items (if any)
        const returnedItems = (order.items || []).filter((i) => {
          const iid = String((i as { _id?: string; id?: string })._id?.toString()
            || (i as { id?: string }).id?.toString()
            || '')
          return itemIds.includes(iid)
        })
        const returnId = returnedItems.find((i) => (i as { returnId?: string }).returnId)?.returnId
          || order.returnId

        const result = await sendReturnCompletedEmail({
          to: customerEmail,
          customerName: order.customerName || 'Customer',
          orderId: order.orderId,
          returnId,
          returnReason: reason,
          completedAt: issuedAt,
          creditNoteNumber,
          originalInvoiceNumber: creditNoteData.originalInvoiceNumber,
          refundStatus: creditNoteData.refundStatus,
          refundAmount: creditNoteData.refundAmount,
          creditNoteHTML: emailHTML,
          pdfBuffer,
        })
        if (result.success) {
          console.log(`[ReturnCreditNote] Email sent to ${customerEmail} for order ${orderId}`)
        } else if (result.queued) {
          console.log(`[ReturnCreditNote] Email queued for ${customerEmail} (order ${orderId}). Configure SMTP to send.`)
        } else {
          console.warn(`[ReturnCreditNote] Email not sent for order ${orderId}: ${result.error}`)
        }
      } catch (emailErr) {
        console.error(`[ReturnCreditNote] Email send error for order ${orderId}:`, emailErr)
      }
    } else {
      console.log(`[ReturnCreditNote] No email on file for order ${orderId}. Credit note available in customer panel.`)
    }
  } catch (err) {
    // NEVER let credit note failure block return completion
    console.error(`[ReturnCreditNote] Failed to generate/send return credit note for order ${orderId}:`, err)
  }
}

async function handleOrderCancel(orderId: string, orderItemId: string, reason?: string): Promise<void> {
  const { db } = await connectToDatabase()

  // Fetch order to process refund if it was already paid
  const order = await db.collection('orders').findOne({ orderId })
  if (order) {
    const item = (order.items as any[])?.find(i => i.id === orderItemId || i._id?.toString() === orderItemId)
    const refundAmount = item?.total || item?.effectivePrice || 0
    const paymentMethod = order.paymentMethod as 'cod' | 'online'

    // === Inventory: Restock the cancelled item ===
    if (item) {
      let variantId: string | undefined
      if (item.variant) {
        if (typeof item.variant === 'string') {
          variantId = item.variant
        } else if (typeof item.variant === 'object') {
          const v = item.variant as Record<string, unknown>
          variantId = (v._id as string) || (v.sku as string) || (v.id as string) || undefined
        }
      }
      try {
        const restockResult = await restockProduct({
          productId: item.productId,
          quantity: item.quantity,
          variantId,
          orderId,
          reason: reason ? `Order cancelled: ${reason}` : `Order ${orderId} cancelled`,
          performedBy: 'system',
        })
        if (!restockResult.success) {
          console.warn(`[Order ${orderId}] Restock failed for cancelled item ${orderItemId}: ${restockResult.message}`)
        }
      } catch (invErr) {
        console.error(`[Order ${orderId}] Restock error on cancel:`, invErr)
      }
    }

    // Process refund only if the order was already paid (online payment or COD delivered)
    if (refundAmount > 0 && (paymentMethod === 'online' || order.paymentStatus === 'paid')) {
      const { processRefund } = await import('./finance-management')
      const refundResult = await processRefund({
        orderId,
        orderItemId,
        amount: refundAmount,
        reason: reason || 'Order cancelled',
        initiatedBy: 'system',
        refundType: 'partial',
      })
      if (refundResult.success) {
        console.log(`[Order] Refund ${refundResult.refundId} processed for cancelled item ${orderItemId}`)
      } else {
        console.warn(`[Order] Refund failed for cancelled item ${orderItemId}: ${refundResult.error}`)
      }
    }

    // === Generate & send GST credit note for the cancelled item ===
    // This reverses the original tax invoice per GST Rule 16 (CGST Rules 2017).
    // Fire-and-forget — never blocks cancellation.
    generateAndSendCreditNote(
      orderId,
      [orderItemId],
      reason || 'Item cancelled',
      'system',
    ).catch((cnErr) => {
      console.error(`[Order ${orderId}] Credit note generation error for item ${orderItemId}:`, cnErr)
    })
  }

  console.log(`[Order] Item ${orderItemId} in order ${orderId} cancelled. Reason: ${reason || 'N/A'}`)
}

/* ------------------------------------------------------------------ */
/*  Audit Logging                                                       */
/* ------------------------------------------------------------------ */

/**
 * Log a status change to the order_status_logs collection.
 */
async function logStatusChange(params: {
  orderId: string
  orderItemId?: string
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  role: UserRole
  userId: string
  userName: string
  reason?: string
}): Promise<void> {
  const { db } = await connectToDatabase()

  await db.collection('order_status_logs').insertOne({
    orderId: params.orderId,
    orderItemId: params.orderItemId,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    updatedBy: params.role,
    userId: params.userId,
    userName: params.userName,
    reason: params.reason,
    createdAt: new Date(),
  })
}

/* ------------------------------------------------------------------ */
/*  Query Helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Get orders for a specific customer with pagination.
 */
export async function getCustomerOrders(
  customerId: string,
  page: number = 1,
  limit: number = 10,
  status?: string,
): Promise<{ orders: Order[]; total: number }> {
  const { db } = await connectToDatabase()

  const query: Record<string, unknown> = { customerId }
  if (status && status !== 'all') {
    query.status = normalizeStatus(status)
  }

  const total = await db.collection('orders').countDocuments(query)
  const orders = await db.collection('orders')
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  return {
    orders: orders.map((o) => ({ ...o, _id: o._id.toString() })),
    total,
  }
}

/**
 * Get orders for a specific seller (based on items matching sellerId or seller aliases).
 *
 * IMPORTANT: Products may store seller as storeName (e.g., "My Store") rather than
 * the seller's MongoDB _id. When orders are created from products, the order item's
 * sellerId may be either the storeName or the ObjectId. To handle both cases,
 * we match against all seller aliases (ObjectId + storeName + personal name).
 */
export async function getSellerOrders(
  sellerId: string,
  page: number = 1,
  limit: number = 10,
  status?: string,
  search?: string,
  sellerAliases?: string[],
): Promise<{ orders: Order[]; total: number }> {
  const { db } = await connectToDatabase()

  // Build the list of seller identifiers to match against items.sellerId.
  // This handles the mismatch where order items may store storeName instead of ObjectId.
  const sellerIds = sellerAliases && sellerAliases.length > 0
    ? [sellerId, ...sellerAliases]
    : [sellerId]

  // Remove duplicates
  const uniqueSellerIds = [...new Set(sellerIds)]

  const query: any = { 'items.sellerId': { $in: uniqueSellerIds } }
  if (status && status !== 'all') {
    query['items.status'] = normalizeStatus(status)
  }
  if (search) {
    query.$or = [
      { orderId: { $regex: search, $options: 'i' } },
      { customerName: { $regex: search, $options: 'i' } },
    ]
  }

  const total = await db.collection('orders').countDocuments(query)
  const orders = await db.collection('orders')
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  return {
    orders: orders.map((o) => ({ ...o, _id: o._id.toString() })),
    total,
  }
}

/**
 * Get orders assigned to a specific delivery boy.
 * Searches BOTH delivery and pickup assignment fields so that:
 *   - Delivery boys see their forward delivery jobs (items.deliveryBoyId)
 *   - Pickup delivery boys see their return pickup jobs (items.pickupDeliveryBoyId)
 *   - Original delivery boys still see completed deliveries even after a return pickup is assigned
 */
export async function getDeliveryBoyOrders(
  deliveryBoyId: string,
  page: number = 1,
  limit: number = 10,
  status?: string,
): Promise<{ orders: Order[]; total: number }> {
  const { db } = await connectToDatabase()

  const query: any = {
    $or: [
      { 'items.deliveryBoyId': deliveryBoyId },
      { 'items.pickupDeliveryBoyId': deliveryBoyId },
    ],
  }
  if (status && status !== 'all') {
    query['items.status'] = normalizeStatus(status)
  }

  const total = await db.collection('orders').countDocuments(query)
  const orders = await db.collection('orders')
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  return {
    orders: orders.map((o) => ({ ...o, _id: o._id.toString() })),
    total,
  }
}

/**
 * Get all orders (admin view - read only).
 */
export async function getAllOrders(
  page: number = 1,
  limit: number = 10,
  status?: string,
  search?: string,
): Promise<{ orders: Order[]; total: number }> {
  const { db } = await connectToDatabase()

  const query: any = {}
  if (status && status !== 'all') {
    query.status = normalizeStatus(status)
  }
  if (search) {
    query.$or = [
      { orderId: { $regex: search, $options: 'i' } },
      { customerName: { $regex: search, $options: 'i' } },
    ]
  }

  const total = await db.collection('orders').countDocuments(query)
  const orders = await db.collection('orders')
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()

  return {
    orders: orders.map((o) => ({ ...o, _id: o._id.toString() })),
    total,
  }
}

/**
 * Get order status logs for a specific order.
 */
export async function getOrderStatusLogs(orderId: string): Promise<OrderStatusLog[]> {
  const { db } = await connectToDatabase()

  const logs = await db.collection('order_status_logs')
    .find({ orderId })
    .sort({ createdAt: 1 })
    .toArray()

  return logs.map((l) => ({ ...l, _id: l._id.toString() }))
}

/**
 * Get delivery assignments for a delivery boy.
 */
export async function getDeliveryBoyAssignments(
  deliveryBoyId: string,
  status?: 'pending' | 'accepted' | 'rejected',
): Promise<DeliveryAssignment[]> {
  const { db } = await connectToDatabase()

  const query: any = { deliveryBoyId }
  if (status) {
    query.status = status
  }

  const assignments = await db.collection('delivery_assignments')
    .find(query)
    .sort({ assignedAt: -1 })
    .toArray()

  return assignments.map((a) => ({ ...a, _id: a._id.toString() }))
}
