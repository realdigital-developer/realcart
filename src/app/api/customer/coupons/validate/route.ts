import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getCustomerSession } from '@/lib/customer-auth'
import { ObjectId } from 'mongodb'
import {
  validateCoupon,
  toClientCoupon,
  type CouponDocument,
  type CouponCartContext,
} from '@/lib/coupon-engine'

/**
 * POST /api/customer/coupons/validate
 * Validate a coupon code against the customer's cart and calculate the discount.
 *
 * Body: {
 *   code: string,                      // coupon code
 *   cartTotal: number,                 // full cart subtotal
 *   items?: Array<{                    // optional but recommended — enables
 *     productId: string,               // applicability + per-customer checks
 *     quantity: number,
 *     price: number,                   // effective price per unit
 *     category?: string,
 *     sellerId?: string,
 *   }>
 * }
 *
 * Response: { valid: boolean, error?: string, discount: number, coupon?: ClientCoupon }
 *
 * Backward compatible: if `items` is omitted, applicability checks are
 * skipped (the coupon is treated as applying to the whole cart). Per-customer
 * and first-order checks still require `items` is not needed — they only need
 * the customerId from the session.
 */
export async function POST(request: NextRequest) {
  try {
    const customer = await getCustomerSession(request)
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { code, cartTotal, items } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: 'Coupon code is required' }, { status: 400 })
    }

    if (!cartTotal || typeof cartTotal !== 'number' || cartTotal <= 0) {
      return NextResponse.json({ valid: false, error: 'Invalid cart total' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Find coupon by code (case-insensitive). Backward compat: coupons
    // created before the engine shipped have no `scope` field — treat them
    // as platform coupons.
    const coupon = (await db.collection('coupons').findOne({
      code: code.toUpperCase().trim(),
    })) as unknown as CouponDocument | null

    if (!coupon) {
      return NextResponse.json({ valid: false, error: 'Invalid coupon code' })
    }

    // Normalise legacy coupons to platform scope
    if (!coupon.scope) coupon.scope = 'platform'

    const ctx: CouponCartContext = {
      db,
      customerId: customer.id,
      cartTotal,
      items: Array.isArray(items)
        ? items.map((i: Record<string, unknown>) => ({
            productId: String(i.productId || ''),
            quantity: Number(i.quantity) || 1,
            price: Number(i.price) || 0,
            category: i.category ? String(i.category) : undefined,
            sellerId: i.sellerId ? String(i.sellerId) : undefined,
          }))
        : [],
    }

    const result = await validateCoupon(coupon, ctx)

    // Ensure the coupon id is a string for the client
    if (coupon._id instanceof ObjectId) {
      coupon._id = coupon._id.toString()
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      discount: result.discount,
      coupon: result.coupon || toClientCoupon(coupon),
    })
  } catch (error) {
    console.error('[Coupons Validate Error]', error)
    return NextResponse.json({ valid: false, error: 'Failed to validate coupon' }, { status: 500 })
  }
}
