/**
 * GET /api/customer/payments — Fetch customer's payments and refunds
 *
 * Returns a unified view of all payment transactions and refunds for the
 * logged-in customer. Uses ORDERS as the primary source (they have item
 * details, images, order numbers) and payment_orders as supplementary
 * (for transaction IDs like razorpayPaymentId).
 *
 * Response shape:
 *   {
 *     payments: [{ id, orderId, orderNumber, transactionId, razorpayPaymentId,
 *                  amount, method, methodDetail, status, createdAt, paidAt,
 *                  items: [{name, imageUrl, quantity}] }],
 *     refunds:  [{ id, refundId, orderId, orderNumber, amount, reason,
 *                  status, refundType, paymentMethod, initiatedBy,
 *                  gatewayRefundId, createdAt, processedAt }],
 *     summary:  { totalSpent, totalRefunded, paymentCount, refundCount }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    // ── Fetch ALL orders for this customer (primary data source) ──
    // Orders have: orderNumber, orderId, items (with productName, productImage),
    // totalAmount, paymentMethod, paymentStatus, razorpayOrderId, razorpayPaymentId,
    // paymentMethodDetail, paidAt, createdAt
    const customerOrders = await db
      .collection('orders')
      .find({ customerId: customer.id })
      .sort({ createdAt: -1 })
      .toArray()

    // ── Fetch payment_orders for supplementary transaction IDs ──
    const paymentOrders = await db
      .collection('payment_orders')
      .find({ customerId: customer.id })
      .toArray()

    // Build a lookup: razorpayOrderId → payment_order (for transaction IDs)
    const paymentOrderMap = new Map<string, any>()
    for (const po of paymentOrders) {
      if (po.razorpayOrderId) {
        paymentOrderMap.set(po.razorpayOrderId, po)
      }
    }

    // ── Build payments list from ORDERS (not payment_orders) ──
    // Orders are the source of truth — they have items, images, order numbers.
    // payment_orders are only used to supplement transaction IDs.
    const payments = customerOrders.map((order) => {
      // Find matching payment_order for extra transaction IDs
      const po = order.razorpayOrderId ? paymentOrderMap.get(order.razorpayOrderId) : null

      // Map order items to the shape the frontend expects
      // Order items use: productName, productImage (not name, imageUrl)
      const items = (order.items || []).map((item: any) => ({
        name: item.productName || item.name || '',
        imageUrl: item.productImage || item.imageUrl || item.image || '',
        quantity: item.quantity || 1,
      }))

      // Determine payment method label
      const method = order.paymentMethod === 'cod' ? 'cod' : (order.paymentMethodDetail || po?.method || 'online')

      return {
        id: order._id.toString(),
        paymentOrderId: po?.paymentOrderId || '',
        razorpayOrderId: order.razorpayOrderId || po?.razorpayOrderId || '',
        razorpayPaymentId: order.razorpayPaymentId || po?.razorpayPaymentId || '',
        orderId: order._id.toString(),
        orderNumber: order.orderId || order.orderNumber || '',
        amount: order.totalAmount || order.totals?.total || 0,
        currency: 'INR',
        method,
        status: order.paymentStatus === 'paid' ? 'paid' : (order.paymentStatus === 'refunded' ? 'refunded' : 'pending'),
        bank: order.paymentBank || po?.bank || '',
        wallet: order.paymentWallet || po?.wallet || '',
        vpa: order.paymentVpa || po?.vpa || '',
        cardNetwork: order.paymentCardNetwork || po?.cardNetwork || '',
        cardLast4: order.paymentCardLast4 || po?.cardLast4 || '',
        createdAt: order.createdAt,
        paidAt: order.paidAt || null,
        failedAt: null,
        failureReason: null,
        items,
      }
    })

    // ── Fetch refunds ──
    const refundDocs = await db
      .collection('refunds')
      .find({ customerId: customer.id })
      .sort({ createdAt: -1 })
      .toArray()

    const refunds = refundDocs.map((r) => {
      const matchedOrder = customerOrders.find(
        (o) => o._id.toString() === r.orderId || o.orderId === r.orderId,
      )
      // Extract items from the matched order (same shape as payment items)
      const items = (matchedOrder?.items || []).map((item: any) => ({
        name: item.productName || item.name || '',
        imageUrl: item.productImage || item.imageUrl || item.image || '',
        quantity: item.quantity || 1,
      }))
      return {
        id: r._id.toString(),
        refundId: r.refundId || '',
        orderId: r.orderId || '',
        orderNumber: matchedOrder?.orderId || matchedOrder?.orderNumber || '',
        amount: r.amount || 0,
        reason: r.reason || '',
        status: r.status || 'unknown',
        refundType: r.refundType || 'full',
        paymentMethod: r.paymentMethod || '',
        initiatedBy: r.initiatedBy || '',
        gatewayRefundId: r.gatewayRefundId || '',
        createdAt: r.createdAt,
        processedAt: r.processedAt || null,
        failureReason: r.failureReason || null,
        items,
      }
    })

    // ── Build summary ──
    const totalSpent = payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0)
    const totalRefunded = refunds
      .filter((r) => r.status === 'processed' || r.status === 'initiated')
      .reduce((sum, r) => sum + r.amount, 0)

    return NextResponse.json({
      payments,
      refunds,
      summary: {
        totalSpent,
        totalRefunded,
        paymentCount: payments.length,
        refundCount: refunds.length,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/payments] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch payment data' }, { status: 500 })
  }
}
