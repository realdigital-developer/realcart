/**
 * UPI Collect — POST /api/customer/payments/upi-collect
 *
 * Attempts server-side UPI Collect payment. If the Razorpay API
 * doesn't support it (returns error), falls back to Payment Link
 * redirect flow — which is a full-page redirect (no modal/popup).
 *
 * For UPI, the Payment Link page allows the user to pay via UPI
 * after entering their UPI ID on Razorpay's hosted page.
 *
 * Body:
 *   - amount: number (in INR)
 *   - vpa: string (UPI ID, e.g. user@okicici)
 *   - customerName: string
 *   - customerEmail?: string
 *   - customerPhone?: string
 *   - checkoutContext?: object (items, address, coupon — stored for later order creation)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { createRazorpayOrder, createUpiCollectPayment, createPaymentLink, generatePaymentOrderId } from '@/lib/razorpay'

export async function POST(request: NextRequest) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, vpa, customerName, customerEmail, customerPhone, checkoutContext } = body

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Validate VPA
    if (!vpa || !vpa.includes('@') || vpa.length < 3) {
      return NextResponse.json({ error: 'Please enter a valid UPI ID' }, { status: 400 })
    }

    // Generate a payment order ID
    const paymentOrderId = generatePaymentOrderId()

    // Step 1: Create Razorpay order
    const orderResult = await createRazorpayOrder({
      orderId: paymentOrderId,
      amount,
      customerName: customerName || session.name || 'Customer',
      customerEmail: customerEmail || session.email || '',
      customerPhone: customerPhone || '',
    })

    if (!orderResult.success) {
      return NextResponse.json({ error: orderResult.error || 'Failed to create payment order' }, { status: 500 })
    }

    // Step 2: Try server-side UPI Collect
    const collectResult = await createUpiCollectPayment({
      razorpayOrderId: orderResult.razorpayOrderId,
      vpa,
      customerEmail: customerEmail || session.email || '',
      customerPhone: customerPhone || '',
    })

    // Store the payment order in DB
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { db } = await connectToDatabase()
    await db.collection('payment_orders').insertOne({
      paymentOrderId,
      razorpayOrderId: orderResult.razorpayOrderId,
      customerId: session.id,
      amount,
      currency: orderResult.currency,
      status: collectResult.success ? 'collect_initiated' : 'collect_failed',
      method: 'upi',
      vpa,
      ...(collectResult.razorpayPaymentId ? { razorpayPaymentId: collectResult.razorpayPaymentId } : {}),
      ...(checkoutContext ? { checkoutContext } : {}),
      createdAt: new Date().toISOString(),
    })

    if (collectResult.success) {
      // Server-side UPI Collect succeeded!
      // Return order details for polling flow (no redirect needed)
      console.log(`[UPI Collect] Order ${paymentOrderId}: Collect request sent to ${vpa}`)
      return NextResponse.json({
        success: true,
        razorpayOrderId: orderResult.razorpayOrderId,
        razorpayPaymentId: collectResult.razorpayPaymentId,
        paymentOrderId,
        status: collectResult.status,
        message: 'UPI Collect request sent. Please approve on your UPI app.',
      })
    }

    // UPI Collect failed — fall back to Payment Link (full-page redirect, no modal)
    console.warn(`[UPI Collect] Server-side Collect not supported. Creating Payment Link for redirect.`)

    const callbackUrl = `${process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin}/api/customer/payments/callback`

    const linkResult = await createPaymentLink({
      razorpayOrderId: orderResult.razorpayOrderId,
      amount,
      customerName: customerName || session.name || 'Customer',
      customerEmail: customerEmail || session.email || '',
      customerPhone: customerPhone || session.phone || '',
      callbackUrl,
      description: `Order Payment — ${paymentOrderId}`,
    })

    if (linkResult.success && linkResult.shortUrl) {
      // Update payment order with link info
      await db.collection('payment_orders').updateOne(
        { paymentOrderId },
        { $set: { paymentLinkId: linkResult.paymentLinkId, status: 'link_created' } }
      )

      return NextResponse.json({
        success: true,
        paymentLinkUrl: linkResult.shortUrl,
        paymentLinkId: linkResult.paymentLinkId,
        razorpayOrderId: orderResult.razorpayOrderId,
        paymentOrderId,
        redirectMode: true, // Frontend should redirect to paymentLinkUrl
      })
    }

    // Payment Link also failed — return order details for checkout.js fallback
    return NextResponse.json({
      success: false,
      collectFailed: true,
      error: 'Payment Link creation also failed. Please try again.',
      razorpayOrderId: orderResult.razorpayOrderId,
      key: orderResult.key,
      amount: orderResult.amount,
      currency: orderResult.currency,
      companyName: orderResult.companyName,
      prefill: orderResult.prefill,
      paymentOrderId,
    })
  } catch (error) {
    console.error('[UPI Collect Error]', error)
    return NextResponse.json({ error: 'Failed to initiate UPI payment' }, { status: 500 })
  }
}
