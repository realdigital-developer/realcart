/**
 * Razorpay Webhook — POST /api/customer/payments/webhook
 *
 * Handles async payment events from Razorpay:
 *   - payment.captured — Payment successful (backup for client-side verification)
 *   - payment.failed — Payment failed
 *   - refund.processed — Refund completed
 *   - order.paid — Order paid (alternative event)
 *
 * Security: Webhook signature is verified using RAZORPAY_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { connectToDatabase } from '@/lib/mongodb'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-razorpay-signature') || ''

    // Verify webhook signature
    const isValid = verifyWebhookSignature(body, signature)
    if (!isValid) {
      console.warn('[Webhook] Invalid signature — rejecting')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(body)
    const { entity, event: eventType } = event

    console.log(`[Webhook] Received: ${eventType}`)

    const { db } = await connectToDatabase()

    switch (eventType) {
      case 'payment.captured':
      case 'order.paid': {
        // Payment successful — update payment order
        const paymentEntity = entity === 'payment' ? event.payload.payment.entity : event.payload.payment.entity
        const razorpayOrderId = paymentEntity.order_id
        const razorpayPaymentId = paymentEntity.id

        await db.collection('payment_orders').updateOne(
          { razorpayOrderId },
          {
            $set: {
              status: 'paid',
              razorpayPaymentId,
              method: paymentEntity.method,
              bank: paymentEntity.bank || '',
              wallet: paymentEntity.wallet || '',
              vpa: paymentEntity.vpa || '',
              cardNetwork: paymentEntity.card_network || '',
              cardLast4: paymentEntity.card_last4 || '',
              paidAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        )

        // Also update the related order if it exists
        await db.collection('orders').updateOne(
          { razorpayOrderId },
          {
            $set: {
              paymentStatus: 'paid',
              razorpayPaymentId,
              paidAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        )

        console.log(`[Webhook] Payment captured: ${razorpayPaymentId}`)
        break
      }

      case 'payment.failed': {
        const paymentEntity = event.payload.payment.entity
        const razorpayOrderId = paymentEntity.order_id

        await db.collection('payment_orders').updateOne(
          { razorpayOrderId },
          {
            $set: {
              status: 'failed',
              failedAt: new Date().toISOString(),
              failureReason: paymentEntity.error_description || 'Payment failed',
              updatedAt: new Date().toISOString(),
            },
          },
        )

        console.log(`[Webhook] Payment failed: ${razorpayOrderId}`)
        break
      }

      case 'refund.processed': {
        const refundEntity = event.payload.refund.entity
        const razorpayPaymentId = refundEntity.payment_id

        // Update order payment status
        await db.collection('orders').updateOne(
          { razorpayPaymentId },
          {
            $set: {
              paymentStatus: 'refunded',
              refundId: refundEntity.id,
              refundedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        )

        console.log(`[Webhook] Refund processed: ${refundEntity.id}`)
        break
      }

      default:
        console.log(`[Webhook] Unhandled event: ${eventType}`)
    }

    // Always return 200 to acknowledge webhook
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Webhook Error]', error)
    // Still return 200 to prevent Razorpay from retrying
    return NextResponse.json({ received: true })
  }
}
