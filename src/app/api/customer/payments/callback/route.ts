/**
 * Payment Callback — GET/POST /api/customer/payments/callback
 *
 * Handles the redirect callback from Razorpay after payment completion.
 * Used for Card, Net Banking, and Wallet payments that use redirect mode.
 *
 * Razorpay redirects the browser here with payment details as POST form data
 * (or GET query params if callback_method is 'get').
 *
 * This route:
 * 1. Verifies the payment signature
 * 2. Retrieves the checkout context from payment_orders
 * 3. Creates the order
 * 4. Redirects the user to the customer page with success params
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyPaymentSignature, fetchPaymentDetails } from '@/lib/razorpay'

export async function GET(request: NextRequest) {
  return handleCallback(request)
}

export async function POST(request: NextRequest) {
  return handleCallback(request)
}

async function handleCallback(request: NextRequest) {
  try {
    let razorpayOrderId: string | null = null
    let razorpayPaymentId: string | null = null
    let razorpaySignature: string | null = null

    // Extract payment details from query params (GET) or form data (POST)
    if (request.method === 'GET') {
      const { searchParams } = new URL(request.url)
      razorpayOrderId = searchParams.get('razorpay_order_id')
      razorpayPaymentId = searchParams.get('razorpay_payment_id')
      razorpaySignature = searchParams.get('razorpay_signature')
    } else {
      // POST — Razorpay sends form-encoded data
      const formData = await request.formData()
      razorpayOrderId = formData.get('razorpay_order_id') as string | null
      razorpayPaymentId = formData.get('razorpay_payment_id') as string | null
      razorpaySignature = formData.get('razorpay_signature') as string | null
    }

    if (!razorpayOrderId || !razorpayPaymentId) {
      console.error('[Payment Callback] Missing payment details')
      return NextResponse.redirect(new URL('/customer?payment_error=missing_details', request.url))
    }

    console.log(`[Payment Callback] Received: order=${razorpayOrderId}, payment=${razorpayPaymentId}`)

    // Find the payment order in our DB
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { db } = await connectToDatabase()

    const paymentOrder = await db.collection('payment_orders').findOne({
      razorpayOrderId,
    })

    if (!paymentOrder) {
      console.error(`[Payment Callback] Payment order not found for ${razorpayOrderId}`)
      return NextResponse.redirect(new URL('/customer?payment_error=order_not_found', request.url))
    }

    // If already paid, redirect to success
    if (paymentOrder.status === 'paid') {
      const orderNumber = paymentOrder.createdOrderNumber || paymentOrder.paymentOrderId
      return NextResponse.redirect(
        new URL(`/customer?payment_success=true&order_number=${encodeURIComponent(orderNumber)}`, request.url)
      )
    }

    // Verify payment signature (if provided)
    if (razorpaySignature) {
      const isValid = verifyPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      })

      if (!isValid) {
        await db.collection('payment_orders').updateOne(
          { _id: paymentOrder._id },
          { $set: { status: 'failed', failedAt: new Date().toISOString(), failureReason: 'Invalid signature' } }
        )
        console.error(`[Payment Callback] Invalid signature for ${razorpayOrderId}`)
        return NextResponse.redirect(new URL('/customer?payment_error=verification_failed', request.url))
      }
    }

    // Fetch payment details from Razorpay
    const paymentDetails = await fetchPaymentDetails(razorpayPaymentId)

    // Update payment order status
    await db.collection('payment_orders').updateOne(
      { _id: paymentOrder._id },
      {
        $set: {
          status: 'paid',
          razorpayPaymentId,
          ...(razorpaySignature ? { razorpaySignature } : {}),
          method: paymentDetails.method || 'unknown',
          bank: paymentDetails.bank || '',
          wallet: paymentDetails.wallet || '',
          vpa: paymentDetails.vpa || '',
          cardNetwork: paymentDetails.cardNetwork || '',
          cardLast4: paymentDetails.cardLast4 || '',
          paidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    )

    // Create the order using the stored checkout context
    const checkoutContext = paymentOrder.checkoutContext
    let createdOrderNumber = paymentOrder.paymentOrderId

    if (checkoutContext) {
      try {
        const orderRes = await fetch(new URL('/api/customer/orders', request.url).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: checkoutContext.items,
            shippingAddress: checkoutContext.shippingAddress,
            paymentMethod: 'online',
            paymentDetails: {
              razorpayOrderId,
              razorpayPaymentId,
              ...(razorpaySignature ? { razorpaySignature } : {}),
              paymentOrderId: paymentOrder.paymentOrderId,
              method: paymentDetails.method || 'unknown',
              bank: paymentDetails.bank,
              vpa: paymentDetails.vpa,
              wallet: paymentDetails.wallet,
            },
            couponCode: checkoutContext.couponCode,
            couponDiscount: checkoutContext.couponDiscount,
            productDiscount: checkoutContext.productDiscount || 0,
            specialOfferDiscount: checkoutContext.specialOfferDiscount || 0,
            deliveryFee: 0,
          }),
        })

        const orderData = await orderRes.json()

        if (orderRes.ok && orderData.order?.orderId) {
          createdOrderNumber = orderData.order.orderId
          // Store the created order number
          await db.collection('payment_orders').updateOne(
            { _id: paymentOrder._id },
            { $set: { createdOrderNumber } }
          )
          console.log(`[Payment Callback] Order created: ${createdOrderNumber}`)
        } else {
          console.error('[Payment Callback] Failed to create order:', orderData.error)
        }
      } catch (orderErr) {
        console.error('[Payment Callback] Order creation error:', orderErr)
        // Payment is verified but order creation failed — admin can manually create the order
      }
    }

    // Redirect to customer page with success params
    return NextResponse.redirect(
      new URL(`/customer?payment_success=true&order_number=${encodeURIComponent(createdOrderNumber)}`, request.url)
    )
  } catch (error) {
    console.error('[Payment Callback Error]', error)
    return NextResponse.redirect(new URL('/customer?payment_error=unknown', request.url))
  }
}
