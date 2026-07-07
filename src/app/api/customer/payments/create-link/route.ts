/**
 * Create Payment Link — POST /api/customer/payments/create-link
 *
 * Creates a Razorpay order AND a Payment Link server-side.
 * Returns a URL that the frontend can redirect the user to.
 * This is a full-page redirect — NO checkout.js modal/popup/splash screen.
 *
 * Used for Card, Net Banking, and Wallet payments.
 *
 * Body:
 *   - amount: number (in INR)
 *   - customerName: string
 *   - customerEmail?: string
 *   - customerPhone?: string
 *   - checkoutContext?: object (items, address, coupon — stored for callback)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { createRazorpayOrder, createPaymentLink, generatePaymentOrderId } from '@/lib/razorpay'

export async function POST(request: NextRequest) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, customerName, customerEmail, customerPhone, checkoutContext } = body

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Generate a payment order ID
    const paymentOrderId = generatePaymentOrderId()

    // Step 1: Create Razorpay order
    const orderResult = await createRazorpayOrder({
      orderId: paymentOrderId,
      amount,
      customerName: customerName || session.name || 'Customer',
      customerEmail: customerEmail || session.email || '',
      customerPhone: customerPhone || session.phone || '',
    })

    if (!orderResult.success) {
      return NextResponse.json({ error: orderResult.error || 'Failed to create payment order' }, { status: 500 })
    }

    // Step 2: Create Payment Link
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

    // Store the payment order in DB
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { db } = await connectToDatabase()
    await db.collection('payment_orders').insertOne({
      paymentOrderId,
      razorpayOrderId: orderResult.razorpayOrderId,
      ...(linkResult.paymentLinkId ? { paymentLinkId: linkResult.paymentLinkId } : {}),
      customerId: session.id,
      amount,
      currency: orderResult.currency,
      status: 'link_created',
      // Store checkout context for redirect callback flow
      ...(checkoutContext ? { checkoutContext } : {}),
      createdAt: new Date().toISOString(),
    })

    if (!linkResult.success) {
      // Payment Link creation failed, but order was created
      // Return order details so frontend can fall back to checkout.js modal
      console.warn(`[Payment Link] Link creation failed: ${linkResult.error}. Returning order for fallback.`)
      return NextResponse.json({
        success: false,
        linkFailed: true,
        error: linkResult.error || 'Failed to create payment link',
        // Return order details for fallback to checkout.js
        razorpayOrderId: orderResult.razorpayOrderId,
        key: orderResult.key,
        amount: orderResult.amount,
        currency: orderResult.currency,
        companyName: orderResult.companyName,
        prefill: orderResult.prefill,
        paymentOrderId,
      })
    }

    console.log(`[Payment Link] Created link for order ${paymentOrderId}: ${linkResult.shortUrl}`)

    return NextResponse.json({
      success: true,
      paymentLinkUrl: linkResult.shortUrl || linkResult.paymentLinkUrl,
      paymentLinkId: linkResult.paymentLinkId,
      razorpayOrderId: orderResult.razorpayOrderId,
      paymentOrderId,
    })
  } catch (error) {
    console.error('[Create Payment Link Error]', error)
    return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 })
  }
}
