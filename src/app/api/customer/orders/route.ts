/**
 * Customer Orders API — /api/customer/orders
 *
 * Endpoints:
 *   GET  /              — List customer's orders (paginated, filterable)
 *   GET  /?id=xxx       — Get single order detail (with OTP if applicable)
 *   POST /              — Create a new order (from checkout)
 *   PUT  /?action=cancel — Cancel an order (before shipped)
 *   PUT  /?action=return — Request a return (after delivered)
 *   PUT  /?action=cancel-return — Cancel a return request
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getCustomerSession } from '@/lib/customer-auth'
import {
  createOrder,
  getCustomerOrders,
  executeStatusTransition,
  processReturnRequest,
} from '@/lib/order-helpers'
import { connectToDatabase } from '@/lib/mongodb'
import { getCustomerOTP } from '@/lib/order-otp'
import { getOrderStatusLogs } from '@/lib/order-helpers'
import { normalizeStatus } from '@/lib/order-state-machine'
import type { Order } from '@/lib/order-types'
import { buildInvoiceData, generateInvoicePDF, generateInvoiceEmailHTML } from '@/lib/invoice-engine'
import { getBrandSettings } from '@/lib/brand-settings'
import { sendInvoiceEmail } from '@/lib/email-service'
import {
  checkStockAvailability,
  reserveStock,
  confirmReservation,
  releaseReservation,
} from '@/lib/inventory-manager'
import {
  validateCoupon,
  redeemCoupon,
  type CouponDocument,
} from '@/lib/coupon-engine'

export async function GET(request: NextRequest) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('id')

    if (orderId) {
      // Get single order detail
      const { db } = await connectToDatabase()
      const order = await db.collection('orders').findOne({
        orderId,
        customerId: session.id,
      })

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      // Get OTP for the customer if applicable
      const otps: { code: string; type: 'delivery' | 'pickup'; expiresAt: string; orderItemId: string }[] = []
      for (const item of order.items || []) {
        // Check for delivery OTP (when item is Out for Delivery)
        if (normalizeStatus(item.status) === 'Out for Delivery') {
          const otp = await getCustomerOTP(orderId, item._id, 'delivery')
          if (otp) {
            otps.push({ code: otp.code, type: 'delivery', expiresAt: otp.expiresAt, orderItemId: item._id })
          }
        }
        // Check for pickup OTP (when item is Out for Pickup)
        if (normalizeStatus(item.status) === 'Out for Pickup') {
          const otp = await getCustomerOTP(orderId, item._id, 'pickup')
          if (otp) {
            otps.push({ code: otp.code, type: 'pickup', expiresAt: otp.expiresAt, orderItemId: item._id })
          }
        }
      }

      // Get status logs
      const statusLogs = await getOrderStatusLogs(orderId)

      return NextResponse.json({
        order: { ...order, _id: order._id.toString() },
        otps,
        statusLogs,
      })
    }

    // List orders
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const status = searchParams.get('status') || ''

    const { orders, total } = await getCustomerOrders(session.id, page, limit, status)

    return NextResponse.json({
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Customer Orders GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Tracked outside the try block so the catch handler can release any
  // reservations that were created before the order placement failed.
  const reservationIds: string[] = []
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { items, shippingAddress, paymentMethod, couponCode, couponDiscount, productDiscount, specialOfferDiscount, deliveryFee, deliveryOption, paymentDetails } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Order must contain at least one item' }, { status: 400 })
    }

    if (!shippingAddress) {
      return NextResponse.json({ error: 'Shipping address is required' }, { status: 400 })
    }

    // Validate deliveryOption if provided (defensive — client may send garbage)
    const sanitizedDeliveryOption: 'standard' | 'express' | undefined =
      deliveryOption === 'express' || deliveryOption === 'standard'
        ? (deliveryOption as 'standard' | 'express')
        : undefined

    // Debug log: trace what the client sent (helps diagnose "I selected express
    // but order shows standard" complaints — usually a missing field in the
    // POST body from a specific checkout flow).
    console.log(
      `[Customer Orders POST] deliveryOption received from client: ${JSON.stringify(deliveryOption)} | ` +
      `sanitized: ${JSON.stringify(sanitizedDeliveryOption)} | ` +
      `paymentMethod: ${paymentMethod || 'cod'}`,
    )

    // Fetch product details for items
    const { db } = await connectToDatabase()
    const productIds = items.map((i: { productId: string }) => i.productId)
    const products = await db.collection('products')
      .find({ _id: { $in: productIds.map((id: string) => new (require('mongodb').ObjectId)(id)) } }) // eslint-disable-line @typescript-eslint/no-require-imports
      .toArray()

    // Build order items with product details
    // IMPORTANT: Use pricing from checkout (what the customer actually sees/pays)
    // NOT from the DB product price, which may differ due to discounts
    const orderItems = items.map((item: {
      productId: string;
      quantity: number;
      variant?: string | Record<string, unknown>;
      originalPrice?: number;
      sellingPrice?: number;
      effectivePrice?: number;
      hasDiscount?: boolean;
      discountPercent?: number;
    }) => {
      const product = products.find((p: Record<string, unknown>) => p._id.toString() === item.productId)
      if (!product) {
        throw new Error(`Product ${item.productId} not found`)
      }

      // Use checkout pricing if provided (authoritative — what customer agreed to pay)
      // Fall back to DB pricing only if checkout data is missing (backward compatibility)
      const originalPrice = item.originalPrice ?? product.mrp ?? product.price ?? 0
      const effectivePrice = item.effectivePrice ?? product.effectivePrice ?? product.sellingPrice ?? product.price ?? 0

      // Extract shipping/tax details from product for accurate GST calculation
      const shipping = product.shipping as Record<string, unknown> | undefined

      return {
        productId: item.productId,
        productName: product.name || '',
        productImage: product.imageUrl || product.images?.[0] || '',
        variant: item.variant,
        quantity: item.quantity,
        price: originalPrice,
        // Carry the regular selling price (before any active special offer) so
        // the discount can be split into Product Discount + Special Offer.
        sellingPrice: item.sellingPrice ?? (product.sellingPrice as number) ?? effectivePrice,
        effectivePrice: effectivePrice,
        hasDiscount: item.hasDiscount ?? (originalPrice > effectivePrice),
        discountPercent: item.discountPercent ?? (originalPrice > 0 ? Math.round((originalPrice - effectivePrice) / originalPrice * 100) : 0),
        // Prefer the ObjectId-based sellerId for proper linking,
        // fall back to storeName string for legacy products
        sellerId: product.sellerId || product.seller || 'admin',
        sellerName: product.seller || 'Admin',
        sellerStoreName: product.storeName || product.seller || 'Admin Store',
        // GST / tax details from product (for accurate per-product GST calculation)
        hsnCode: (shipping?.hsnCode as string) || product.hsnCode || '',
        gstRate: (shipping?.gstRate as number) ?? product.gstRate,
        // Category details for commission calculation
        category: (product.category as string) || '',
        subcategory: (product.subcategory as string) || undefined,
        // Shipping weight for delivery charge calculation
        weight: (shipping?.weight as number) ?? product.weight,
        // Delivery charge settings from product
        productDeliveryCharge: (shipping?.deliveryCharge as number) ?? undefined,
        productFreeDeliveryAbove: (shipping?.freeDeliveryAbove as number) ?? undefined,
        // Product-level free-delivery flag (seller can mark a product as
        // always-free-delivery). Forwarded to the delivery engine in
        // createOrder so the server-side delivery-fee computation matches
        // the delivery check API exactly (prevents checkout-vs-order mismatch).
        freeDelivery: Boolean(product.freeDelivery),
        // Seller tax details
        sellerGstin: (product.sellerGstin as string) || '',
        sellerState: (product.sellerState as string) || '',
        // Tax-inclusive flag
        isTaxInclusive: true, // Indian e-commerce default
      }
    })

    // For online payments, verify that paymentDetails are provided
    if (paymentMethod === 'online' && !paymentDetails) {
      return NextResponse.json({ error: 'Payment verification details are required for online payment' }, { status: 400 })
    }

    // === Coupon: Server-side re-validation (fraud-proof) ===
    // The client sends couponCode + couponDiscount, but we MUST re-validate
    // server-side to prevent tampering, expired coupons, usage-limit bypass,
    // and per-customer limit abuse. The server-validated discount OVERRIDES
    // whatever the client sent.
    let validatedCouponCode: string | undefined
    let validatedCouponDiscount: number | undefined
    let validatedCouponId: string | undefined
    if (couponCode) {
      const couponDoc = (await db.collection('coupons').findOne({
        code: String(couponCode).toUpperCase().trim(),
      })) as unknown as (CouponDocument & { _id: ObjectId }) | null

      if (!couponDoc) {
        return NextResponse.json(
          { error: `Coupon "${couponCode}" is invalid` },
          { status: 400 },
        )
      }

      // Normalise legacy coupons to platform scope
      if (!couponDoc.scope) couponDoc.scope = 'platform'

      const cartTotalForCoupon = orderItems.reduce(
        (s, it) => s + ((it.effectivePrice ?? 0) * it.quantity),
        0,
      )
      const couponResult = await validateCoupon(couponDoc, {
        db,
        customerId: session.id,
        cartTotal: cartTotalForCoupon,
        items: orderItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          price: it.effectivePrice ?? 0,
          category: it.category,
          sellerId: it.sellerId ? String(it.sellerId) : undefined,
        })),
      })

      if (!couponResult.valid) {
        return NextResponse.json(
          { error: `Coupon "${couponCode}" is no longer valid: ${couponResult.error}` },
          { status: 400 },
        )
      }

      validatedCouponCode = couponResult.coupon?.code || String(couponCode).toUpperCase().trim()
      validatedCouponDiscount = couponResult.discount
      validatedCouponId = couponDoc._id instanceof ObjectId
        ? couponDoc._id.toString()
        : String(couponDoc._id)
    }

    // === Inventory: Pre-check stock availability BEFORE order placement ===
    // Abort with HTTP 409 if any item is short — prevents oversell.
    const stockCheckItems = items.map((item: {
      productId: string
      quantity: number
      variant?: string | Record<string, unknown>
    }) => {
      let variantId: string | undefined
      if (item.variant) {
        if (typeof item.variant === 'string') {
          variantId = item.variant
        } else if (typeof item.variant === 'object') {
          const v = item.variant as Record<string, unknown>
          variantId = (v._id as string) || (v.sku as string) || (v.id as string) || undefined
        }
      }
      return { productId: item.productId, variantId, quantity: item.quantity }
    })

    let availability: { allAvailable: boolean; shortages: Array<{ productId: string; variantId?: string; requested: number; available: number }> }
    try {
      availability = await checkStockAvailability(stockCheckItems)
    } catch (availErr) {
      // Non-fatal — if the availability checker fails, fall through to the
      // reservation step which will catch any real shortages.
      console.warn('[Customer Orders POST] Stock availability check failed:', availErr)
      availability = { allAvailable: true, shortages: [] }
    }
    if (!availability.allAvailable) {
      return NextResponse.json(
        { error: 'Some items are out of stock', shortages: availability.shortages },
        { status: 409 },
      )
    }

    // === Inventory: Reserve stock for each item (hold → confirm) ===
    // Hold stock for 15 minutes. If any reservation fails, release all
    // previously-made reservations for this order attempt and abort with 409.
    for (const item of stockCheckItems) {
      try {
        const reserve = await reserveStock({
          productId: item.productId,
          quantity: item.quantity,
          variantId: item.variantId,
          customerId: session.id,
          cartToken: session.id,
          ttlMinutes: 15,
        })
        if (!reserve.success) {
          // Release all previously-made reservations for this attempt
          for (const rid of reservationIds) {
            try {
              await releaseReservation(rid, `Order attempt failed — ${reserve.message}`)
            } catch (relErr) {
              console.warn(`[Customer Orders POST] releaseReservation ${rid} failed:`, relErr)
            }
          }
          return NextResponse.json(
            { error: 'Failed to reserve stock', detail: reserve.message },
            { status: 409 },
          )
        }
        if (reserve.reservationId) {
          reservationIds.push(reserve.reservationId)
        }
      } catch (reserveErr) {
        console.warn(`[Customer Orders POST] reserveStock threw for product ${item.productId}:`, reserveErr)
        for (const rid of reservationIds) {
          try {
            await releaseReservation(rid, 'Order attempt failed — reservation exception')
          } catch (relErr) {
            console.warn(`[Customer Orders POST] releaseReservation ${rid} failed:`, relErr)
          }
        }
        return NextResponse.json(
          { error: 'Failed to reserve stock', detail: reserveErr instanceof Error ? reserveErr.message : String(reserveErr) },
          { status: 409 },
        )
      }
    }

    // Fetch customer email AND current name from DB — the session JWT
    // only contains id/mobile/name/role baked in at login time. The
    // name in the JWT may be stale (e.g. "User 4132" from registration
    // before the customer set their real name). To ensure the order's
    // customerName and customerEmail are always current, we fetch them
    // fresh from the customers collection.
    let customerEmail: string | undefined
    let customerName: string = session.name || session.mobile || 'Customer'
    try {
      const customerDoc = await db.collection('customers').findOne({ _id: new ObjectId(session.id) })
      if (customerDoc) {
        customerEmail = customerDoc.email || undefined
        if (customerDoc.name && String(customerDoc.name).trim()) {
          customerName = String(customerDoc.name).trim()
        }
      }
    } catch {
      // Fallback: try mobile lookup (in case the _id isn't a valid ObjectId)
      const customerDoc = await db.collection('customers').findOne({ mobile: session.mobile })
      if (customerDoc) {
        customerEmail = customerDoc.email || undefined
        if (customerDoc.name && String(customerDoc.name).trim()) {
          customerName = String(customerDoc.name).trim()
        }
      }
    }

    const order = await createOrder({
      customerId: session.id,
      customerName,
      customerPhone: session.mobile || '',
      customerEmail,
      items: orderItems,
      shippingAddress,
      paymentMethod: paymentMethod || 'cod',
      paymentDetails: paymentDetails || undefined,
      // Use the SERVER-VALIDATED coupon values (authoritative), not the
      // client-sent values which may have been tampered with or expired.
      couponCode: validatedCouponCode,
      couponDiscount: validatedCouponDiscount,
      productDiscount,
      specialOfferDiscount,
      deliveryFee,
      // Forward the customer-chosen delivery option. When provided, the
      // createOrder helper re-computes the deliveryFee + ETA AUTHORITATIVELY
      // from the delivery engine (prevents client-side tampering).
      deliveryOption: sanitizedDeliveryOption,
    })

    // === Coupon: Record redemption (atomic + idempotent) ===
    // Inserts a redemption doc (unique on couponId+orderId prevents double-
    // counting) and increments the coupon's global usedCount. Non-fatal —
    // if this fails the order is still placed; the redemption can be
    // reconciled later from the order's couponCode field.
    if (validatedCouponId && validatedCouponCode && order.orderId) {
      try {
        await redeemCoupon(
          db,
          validatedCouponId,
          validatedCouponCode,
          session.id,
          order.orderId,
          validatedCouponDiscount || 0,
        )
      } catch (redeemErr) {
        console.warn(`[Customer Orders POST] Coupon redemption failed for ${validatedCouponCode}:`, redeemErr)
      }
    }

    // === Inventory: Confirm reservations now that the order is placed ===
    // The actual decrement already ran inside createOrder (decrementStock);
    // confirming just flips the reservation status to 'confirmed' and releases
    // the reserved count. Non-fatal — order is already placed.
    for (const rid of reservationIds) {
      try {
        await confirmReservation(rid, order._id)
      } catch (confirmErr) {
        console.warn(`[Customer Orders POST] confirmReservation ${rid} failed:`, confirmErr)
      }
    }

    // Clear the cart after order creation
    try {
      await db.collection('carts').deleteOne({ customerId: session.id })
    } catch {
      // Non-fatal — cart clearing failure shouldn't block order creation
    }

    // === Send Invoice Email (async, non-blocking) ===
    // This runs in the background and NEVER blocks/fails the order response.
    // If the customer has no email, or SMTP is not configured, the invoice
    // is still generated and available for download in the customer panel.
    sendInvoiceForOrder(order, session.id).catch((err) => {
      console.error('[Customer Orders POST] Invoice email background task error:', err)
    })

    return NextResponse.json({ success: true, order }, { status: 201 })
  } catch (error) {
    // Release any reservations that were held before the order failed.
    // The TTL sweeper is the ultimate backstop, but releasing now is faster.
    for (const rid of reservationIds) {
      try {
        await releaseReservation(rid, 'Order creation failed')
      } catch (relErr) {
        console.warn(`[Customer Orders POST] releaseReservation ${rid} failed:`, relErr)
      }
    }
    console.error('[Customer Orders POST Error]', error)
    const message = error instanceof Error ? error.message : 'Failed to create order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, orderId, orderItemId, reason } = body

    if (!orderId || !action) {
      return NextResponse.json({ error: 'orderId and action are required' }, { status: 400 })
    }

    // Verify the order belongs to this customer
    const { db } = await connectToDatabase()
    const order = await db.collection('orders').findOne({
      orderId,
      customerId: session.id,
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    let result

    switch (action) {
      case 'cancel':
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Cancelled',
          role: 'customer',
          userId: session.id,
          userName: session.name || session.mobile || 'Customer',
          reason: reason || 'Cancelled by customer',
        })
        break

      case 'return':
        if (!orderItemId) {
          return NextResponse.json({ error: 'orderItemId is required for return' }, { status: 400 })
        }
        if (!reason) {
          return NextResponse.json({ error: 'Return reason is required' }, { status: 400 })
        }
        result = await processReturnRequest({
          orderId,
          orderItemId,
          customerId: session.id,
          reason,
        })
        break

      case 'cancel-return':
        if (!orderItemId) {
          return NextResponse.json({ error: 'orderItemId is required' }, { status: 400 })
        }
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Return Cancelled',
          role: 'customer',
          userId: session.id,
          userName: session.name || session.mobile || 'Customer',
          reason: reason || 'Return cancelled by customer',
        })
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: result.message })
  } catch (error) {
    console.error('[Customer Orders PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  Invoice Email Helper (background, non-blocking)                     */
/* ------------------------------------------------------------------ */

/**
 * Generate and send an invoice email for an order.
 *
 * This function is designed to be called in a fire-and-forget manner
 * (via .catch()). It NEVER throws and logs all errors internally so
 * that order creation is never affected by email issues.
 *
 * Steps:
 *   1. Fetch customer's email from the database (if not on the order)
 *   2. Fetch platform settings (name, GSTIN, address)
 *   3. Build invoice data from the order
 *   4. Generate PDF + HTML email
 *   5. Send email (or queue if SMTP not configured)
 */
async function sendInvoiceForOrder(order: Order, customerId: string): Promise<void> {
  try {
    const { db } = await connectToDatabase()

    // 1. Get customer email — prefer order.customerEmail, fallback to DB lookup
    let customerEmail = order.customerEmail
    if (!customerEmail) {
      try {
        const customer = await db.collection('customers').findOne({ _id: new (require('mongodb').ObjectId)(customerId) }) // eslint-disable-line @typescript-eslint/no-require-imports
        customerEmail = customer?.email || undefined
      } catch {
        // Try mobile lookup as fallback
        const customer = await db.collection('customers').findOne({ mobile: order.customerPhone })
        customerEmail = customer?.email || undefined
      }
    }

    // No email — can't send, but invoice is still available in panel
    if (!customerEmail) {
      console.log(`[Invoice] No email on file for order ${order.orderId}. Invoice available in customer panel.`)
      return
    }

    // 2. Fetch platform settings (brand name + logo + GSTIN + address).
    //    Falls back to "RealCart" when not configured.
    const platformInfo = await getBrandSettings(db)

    // 3. Build invoice data
    const invoiceData = await buildInvoiceData(order, platformInfo)

    // 4. Generate PDF + email HTML (in parallel for speed)
    const [pdfBuffer, emailHTML] = await Promise.all([
      generateInvoicePDF(invoiceData),
      Promise.resolve(generateInvoiceEmailHTML(invoiceData)),
    ])

    // 5. Send email (or queue if SMTP not configured)
    const result = await sendInvoiceEmail({
      to: customerEmail,
      customerName: order.customerName || 'Customer',
      orderId: order.orderId,
      invoiceNumber: invoiceData.invoiceNumber,
      invoiceHTML: emailHTML,
      pdfBuffer,
    })

    if (result.success) {
      console.log(`[Invoice] Email sent to ${customerEmail} for order ${order.orderId}`)
    } else if (result.queued) {
      console.log(`[Invoice] Email queued for ${customerEmail} (order ${order.orderId}). Configure SMTP to send.`)
    } else {
      console.warn(`[Invoice] Email not sent for order ${order.orderId}: ${result.error}`)
    }
  } catch (err) {
    console.error(`[Invoice] Failed to send invoice email for order ${order.orderId}:`, err)
  }
}

