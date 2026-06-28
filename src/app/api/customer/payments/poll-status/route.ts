/**
 * Poll Payment Status — GET /api/customer/payments/poll-status
 *
 * Checks if a payment has been captured against a Razorpay order.
 * Used by the "Waiting for Payment" screen in UPI Collect flow.
 *
 * Query params:
 *   - razorpayOrderId: string (required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { checkOrderPaymentStatus } from '@/lib/razorpay'

export async function GET(request: NextRequest) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const razorpayOrderId = searchParams.get('razorpayOrderId')

    if (!razorpayOrderId) {
      return NextResponse.json({ error: 'Missing razorpayOrderId' }, { status: 400 })
    }

    // Verify this order belongs to the customer
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { db } = await connectToDatabase()

    const paymentOrder = await db.collection('payment_orders').findOne({
      razorpayOrderId,
      customerId: session.id,
    })

    if (!paymentOrder) {
      return NextResponse.json({ error: 'Payment order not found' }, { status: 404 })
    }

    // If already marked as paid in our DB, return immediately
    if (paymentOrder.status === 'paid') {
      return NextResponse.json({
        status: 'paid',
        paymentId: paymentOrder.razorpayPaymentId,
        method: paymentOrder.method,
        bank: paymentOrder.bank,
        vpa: paymentOrder.vpa,
        wallet: paymentOrder.wallet,
        cardNetwork: paymentOrder.cardNetwork,
        cardLast4: paymentOrder.cardLast4,
      })
    }

    // Check Razorpay for payment status
    const result = await checkOrderPaymentStatus(razorpayOrderId)

    // If payment is captured, update our DB
    if (result.status === 'paid' && result.paymentId) {
      await db.collection('payment_orders').updateOne(
        { _id: paymentOrder._id },
        {
          $set: {
            status: 'paid',
            razorpayPaymentId: result.paymentId,
            method: result.method || 'unknown',
            bank: result.bank || '',
            wallet: result.wallet || '',
            vpa: result.vpa || '',
            cardNetwork: result.cardNetwork || '',
            cardLast4: result.cardLast4 || '',
            paidAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      )

      console.log(`[Payment] Polled & confirmed payment: ${result.paymentId} for order ${paymentOrder.paymentOrderId}`)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Poll Payment Status Error]', error)
    return NextResponse.json({ status: 'unpaid' })
  }
}
