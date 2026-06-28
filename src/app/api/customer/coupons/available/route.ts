import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getCustomerSession } from '@/lib/customer-auth'
import {
  getAvailableCouponsForCart,
  type CouponCartContext,
} from '@/lib/coupon-engine'

/**
 * POST /api/customer/coupons/available
 * List all coupons available for the customer's current cart, with each
 * coupon's applicability status and calculated discount.
 *
 * Body: {
 *   cartTotal: number,
 *   items: Array<{
 *     productId: string,
 *     quantity: number,
 *     price: number,
 *     category?: string,
 *     sellerId?: string,
 *   }>
 * }
 *
 * Response: { coupons: AvailableCoupon[] }
 *
 * Used by the cart & checkout pages to show a "Coupons & Offers" list
 * (like Flipkart's coupon drawer).
 */
export async function POST(request: NextRequest) {
  try {
    const customer = await getCustomerSession(request)
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { cartTotal, items } = body

    if (!cartTotal || typeof cartTotal !== 'number' || cartTotal <= 0) {
      return NextResponse.json({ coupons: [] })
    }

    const { db } = await connectToDatabase()

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

    const coupons = await getAvailableCouponsForCart(ctx)

    return NextResponse.json({ coupons })
  } catch (error) {
    console.error('[Coupons Available Error]', error)
    return NextResponse.json({ error: 'Failed to fetch available coupons' }, { status: 500 })
  }
}
