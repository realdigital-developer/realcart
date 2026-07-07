/**
 * Create Razorpay Order — POST /api/customer/payments/create-order
 *
 * Called from the checkout page when the customer selects online payment.
 * Creates a Razorpay order and returns the checkout details.
 *
 * Body:
 *   - amount: number (in INR)
 *   - customerName: string
 *   - customerEmail?: string
 *   - customerPhone?: string
 *   - checkoutContext?: object (items, address, coupon — stored for redirect callback)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { createRazorpayOrder, generatePaymentOrderId } from '@/lib/razorpay'

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

    // Maximum order amount check (₹5,00,000 per Razorpay limits)
    if (amount > 500000) {
      return NextResponse.json({ error: 'Amount exceeds maximum limit' }, { status: 400 })
    }

    // Minimum order amount (₹1)
    if (amount < 1) {
      return NextResponse.json({ error: 'Amount must be at least ₹1' }, { status: 400 })
    }

    // Generate a payment order ID (used as receipt in Razorpay)
    const paymentOrderId = generatePaymentOrderId()

    // Create Razorpay order
    const result = await createRazorpayOrder({
      orderId: paymentOrderId,
      amount,
      customerName: customerName || session.name || 'Customer',
      customerEmail: customerEmail || session.email || '',
      customerPhone: customerPhone || session.phone || '',
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to create payment order' }, { status: 500 })
    }

    // Store the payment order in DB for verification later
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { db } = await connectToDatabase()
    await db.collection('payment_orders').insertOne({
      paymentOrderId,
      razorpayOrderId: result.razorpayOrderId,
      customerId: session.id,
      amount,
      currency: result.currency,
      status: 'created',
      // Store checkout context for redirect callback flow
      // (Card/NetBanking/Wallet redirect back to our callback URL)
      ...(checkoutContext ? { checkoutContext } : {}),
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[Create Payment Order Error]', error)
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 })
  }
}
