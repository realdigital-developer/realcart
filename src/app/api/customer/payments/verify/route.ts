/**
 * Verify Payment — POST /api/customer/payments/verify
 *
 * Verifies the Razorpay payment signature after checkout completion.
 * Called from the frontend after Razorpay checkout succeeds.
 *
 * Body:
 *   - razorpayOrderId: string
 *   - razorpayPaymentId: string
 *   - razorpaySignature: string
 *   - paymentOrderId: string (our internal payment order ID)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { verifyPaymentSignature, fetchPaymentDetails } from '@/lib/razorpay'

export async function POST(request: NextRequest) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentOrderId } = body

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ error: 'Missing payment verification details' }, { status: 400 })
    }

    // Verify the payment belongs to this customer
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { db } = await connectToDatabase()

    const paymentOrder = await db.collection('payment_orders').findOne({
      $or: [
        { paymentOrderId },
        { razorpayOrderId },
      ],
      customerId: session.id,
    })

    if (!paymentOrder) {
      return NextResponse.json({ error: 'Payment order not found' }, { status: 404 })
    }

    if (paymentOrder.status === 'paid') {
      // Already verified — idempotent
      return NextResponse.json({
        success: true,
        razorpayPaymentId: paymentOrder.razorpayPaymentId,
        razorpayOrderId: paymentOrder.razorpayOrderId,
        method: paymentOrder.method,
        alreadyVerified: true,
      })
    }

    // Verify the signature
    const isValid = verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    })

    if (!isValid) {
      // Update payment order status
      await db.collection('payment_orders').updateOne(
        { _id: paymentOrder._id },
        {
          $set: {
            status: 'failed',
            failedAt: new Date().toISOString(),
            failureReason: 'Invalid signature',
          },
        },
      )

      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
    }

    // Fetch payment details from Razorpay
    const paymentDetails = await fetchPaymentDetails(razorpayPaymentId)

    // Update payment order status to paid
    await db.collection('payment_orders').updateOne(
      { _id: paymentOrder._id },
      {
        $set: {
          status: 'paid',
          razorpayPaymentId,
          razorpaySignature,
          method: paymentDetails.method || 'unknown',
          bank: paymentDetails.bank || '',
          wallet: paymentDetails.wallet || '',
          vpa: paymentDetails.vpa || '',
          cardNetwork: paymentDetails.cardNetwork || '',
          cardLast4: paymentDetails.cardLast4 || '',
          paidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    )

    console.log(`[Payment] Verified payment: ${razorpayPaymentId} for order ${paymentOrder.paymentOrderId}`)

    return NextResponse.json({
      success: true,
      razorpayPaymentId,
      razorpayOrderId,
      method: paymentDetails.method,
      bank: paymentDetails.bank,
      wallet: paymentDetails.wallet,
      vpa: paymentDetails.vpa,
    })
  } catch (error) {
    console.error('[Verify Payment Error]', error)
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 })
  }
}
