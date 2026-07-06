/**
 * Unified Payment Processing — POST /api/customer/payments/process
 *
 * Handles ALL payment methods server-side — NO checkout.js, NO modal, NO popup.
 *
 * Body:
 *   - amount: number (in INR)
 *   - method: 'upi' | 'card' | 'netbanking' | 'wallet'
 *   - vpa?: string (for UPI)
 *   - cardNumber?: string (for Card)
 *   - cardName?: string (for Card)
 *   - cardExpiryMonth?: string (for Card)
 *   - cardExpiryYear?: string (for Card)
 *   - cardCvv?: string (for Card)
 *   - savedCard?: boolean (for saved Card — RBI-compliant tokenization)
 *   - cardLast4?: string (for saved Card)
 *   - cardNetwork?: string (for saved Card)
 *   - cardType?: string (for saved Card)
 *   - bankCode?: string (for Net Banking)
 *   - walletType?: string (for Wallet)
 *   - customerName: string
 *   - customerEmail?: string
 *   - customerPhone?: string
 *   - checkoutContext?: object (items, address, coupon — stored for redirect callback)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import {
  createRazorpayOrder,
  createUpiCollectPayment,
  createCardPayment,
  createNetbankingPayment,
  createWalletPayment,
  generatePaymentOrderId,
} from '@/lib/razorpay'

export async function POST(request: NextRequest) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      amount,
      method,
      vpa,
      cardNumber,
      cardName,
      cardExpiryMonth,
      cardExpiryYear,
      cardCvv,
      savedCard,
      cardLast4,
      cardNetwork,
      cardType,
      bankCode,
      walletType,
      customerName,
      customerEmail,
      customerPhone,
      checkoutContext,
    } = body

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Validate method
    if (!method || !['upi', 'card', 'netbanking', 'wallet'].includes(method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    }

    // Method-specific validation
    if (method === 'upi' && (!vpa || !vpa.includes('@') || vpa.length < 3)) {
      return NextResponse.json({ error: 'Please enter a valid UPI ID' }, { status: 400 })
    }
    // Saved card (RBI-compliant tokenization) — only CVV + last4 required
    if (method === 'card' && savedCard && (!cardLast4 || !cardCvv)) {
      return NextResponse.json({ error: 'Please enter the CVV for your saved card' }, { status: 400 })
    }
    // New card — full details required
    if (method === 'card' && !savedCard && (!cardNumber || !cardName || !cardExpiryMonth || !cardExpiryYear || !cardCvv)) {
      return NextResponse.json({ error: 'Please fill in all card details' }, { status: 400 })
    }
    if (method === 'netbanking' && !bankCode) {
      return NextResponse.json({ error: 'Please select a bank' }, { status: 400 })
    }
    if (method === 'wallet' && !walletType) {
      return NextResponse.json({ error: 'Please select a wallet' }, { status: 400 })
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

    // Build callback URL for redirect-based methods
    const callbackUrl = `${process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin}/api/customer/payments/callback`

    // Step 2: Create payment server-side based on method
    let paymentResult

    switch (method) {
      case 'upi':
        paymentResult = await createUpiCollectPayment({
          razorpayOrderId: orderResult.razorpayOrderId,
          vpa: vpa!,
          customerEmail: customerEmail || session.email || '',
          customerPhone: customerPhone || '',
        })
        break

      case 'card':
        if (savedCard) {
          // Saved card (RBI-compliant tokenization) — we don't have the full
          // card number, so we can't create a real Razorpay card payment.
          // Fall through to fallback mode (simulated), which is the same path
          // used for standard Razorpay accounts on Vercel.
          paymentResult = { success: false, error: 'saved_card_token' }
        } else {
          paymentResult = await createCardPayment({
            razorpayOrderId: orderResult.razorpayOrderId,
            cardNumber: cardNumber!,
            cardName: cardName!,
            cardExpiryMonth: cardExpiryMonth!,
            cardExpiryYear: cardExpiryYear!,
            cardCvv: cardCvv!,
            customerEmail: customerEmail || session.email || '',
            customerPhone: customerPhone || '',
          })
        }
        break

      case 'netbanking':
        paymentResult = await createNetbankingPayment({
          razorpayOrderId: orderResult.razorpayOrderId,
          bankCode: bankCode!,
          customerEmail: customerEmail || session.email || '',
          customerPhone: customerPhone || '',
          callbackUrl,
        })
        break

      case 'wallet':
        paymentResult = await createWalletPayment({
          razorpayOrderId: orderResult.razorpayOrderId,
          walletType: walletType!,
          customerEmail: customerEmail || session.email || '',
          customerPhone: customerPhone || '',
          callbackUrl,
        })
        break
    }

    // Store the payment order in DB
    const { connectToDatabase } = await import('@/lib/mongodb')
    const { db } = await connectToDatabase()

    const dbDoc: Record<string, unknown> = {
      paymentOrderId,
      razorpayOrderId: orderResult.razorpayOrderId,
      customerId: session.id,
      amount,
      currency: orderResult.currency,
      method,
      status: paymentResult?.success ? (paymentResult.status === 'captured' ? 'paid' : 'collect_initiated') : 'failed',
      ...(checkoutContext ? { checkoutContext } : {}),
      // Store the customer's "save payment method" preference so the
      // callback route (which runs after redirect-mode payments) can
      // honour it by saving to customer_payment_methods.
      savePaymentMethod: body.savePaymentMethod === true,
      createdAt: new Date().toISOString(),
    }

    if (paymentResult?.razorpayPaymentId) {
      dbDoc.razorpayPaymentId = paymentResult.razorpayPaymentId
    }
    if (paymentResult?.method) {
      dbDoc.paymentMethod = paymentResult.method
    }
    if (method === 'upi' && vpa) {
      dbDoc.vpa = vpa
    }
    if (method === 'netbanking' && bankCode) {
      dbDoc.bank = bankCode
    }
    if (method === 'wallet' && walletType) {
      dbDoc.wallet = walletType
    }
    // Saved card metadata (RBI-compliant — only last4 + network, never full PAN)
    if (method === 'card' && savedCard && cardLast4) {
      dbDoc.cardLast4 = cardLast4
      dbDoc.cardNetwork = cardNetwork || ''
      dbDoc.cardType = cardType || ''
      dbDoc.savedCard = true
    }

    await db.collection('payment_orders').insertOne(dbDoc)

    // Handle payment result
    if (!paymentResult?.success) {
      console.error(`[Payment Process] ${method} payment failed:`, paymentResult?.error)

      // Server-side payment API failed — return order details for checkout.js redirect fallback
      // The frontend will use checkout.js with redirect: true (full-page redirect, NO popup/modal)
      if (method === 'card' || method === 'netbanking' || method === 'wallet' || method === 'upi') {
        console.warn(`[Payment Process] Server-side ${method} failed, returning order for checkout.js redirect fallback`)

        // Update payment order status
        await db.collection('payment_orders').updateOne(
          { paymentOrderId },
          { $set: { status: 'checkout_redirect', updatedAt: new Date().toISOString() } }
        )

        return NextResponse.json({
          success: true,
          fallbackMode: true,
          // Return order details for checkout.js with redirect: true
          razorpayOrderId: orderResult.razorpayOrderId,
          paymentOrderId,
          key: orderResult.key,
          amount: orderResult.amount,
          currency: orderResult.currency,
          companyName: orderResult.companyName,
          prefill: orderResult.prefill,
          message: 'Redirecting to secure payment...',
        })
      }

      return NextResponse.json({
        success: false,
        error: paymentResult?.error || `${method} payment failed. Please try a different payment method.`,
        razorpayOrderId: orderResult.razorpayOrderId,
        paymentOrderId,
      })
    }

    // Payment created successfully
    console.log(`[Payment Process] ${method} payment created: ${paymentResult.razorpayPaymentId}, status=${paymentResult.status}`)

    // For UPI Collect: payment is initiated, need to poll for status
    if (method === 'upi' && paymentResult.status !== 'captured') {
      return NextResponse.json({
        success: true,
        mode: 'polling', // Frontend should show polling UI
        razorpayOrderId: orderResult.razorpayOrderId,
        razorpayPaymentId: paymentResult.razorpayPaymentId,
        paymentOrderId,
        status: paymentResult.status,
        message: 'UPI Collect request sent. Please approve on your UPI app.',
      })
    }

    // For Card: if captured, payment is complete
    if (method === 'card' && paymentResult.status === 'captured') {
      // Update DB status
      await db.collection('payment_orders').updateOne(
        { paymentOrderId },
        {
          $set: {
            status: 'paid',
            razorpayPaymentId: paymentResult.razorpayPaymentId,
            cardLast4: paymentResult.cardLast4 || '',
            cardNetwork: paymentResult.cardNetwork || '',
            paidAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      )

      return NextResponse.json({
        success: true,
        mode: 'complete', // Payment is done, frontend can create order
        razorpayOrderId: orderResult.razorpayOrderId,
        razorpayPaymentId: paymentResult.razorpayPaymentId,
        paymentOrderId,
        status: 'captured',
        method: 'card',
        cardLast4: paymentResult.cardLast4,
        cardNetwork: paymentResult.cardNetwork,
      })
    }

    // For Net Banking / Wallet: redirect URL to bank/wallet page
    if ((method === 'netbanking' || method === 'wallet') && paymentResult.redirectUrl) {
      return NextResponse.json({
        success: true,
        mode: 'redirect', // Frontend should redirect to this URL
        redirectUrl: paymentResult.redirectUrl,
        razorpayOrderId: orderResult.razorpayOrderId,
        razorpayPaymentId: paymentResult.razorpayPaymentId,
        paymentOrderId,
        status: paymentResult.status,
        method,
        ...(method === 'netbanking' ? { bank: bankCode } : {}),
        ...(method === 'wallet' ? { wallet: walletType } : {}),
      })
    }

    // For Net Banking / Wallet without redirect (sandbox or auto-captured)
    if ((method === 'netbanking' || method === 'wallet') && paymentResult.status === 'captured') {
      await db.collection('payment_orders').updateOne(
        { paymentOrderId },
        {
          $set: {
            status: 'paid',
            razorpayPaymentId: paymentResult.razorpayPaymentId,
            ...(method === 'netbanking' ? { bank: bankCode } : {}),
            ...(method === 'wallet' ? { wallet: walletType } : {}),
            paidAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      )

      return NextResponse.json({
        success: true,
        mode: 'complete',
        razorpayOrderId: orderResult.razorpayOrderId,
        razorpayPaymentId: paymentResult.razorpayPaymentId,
        paymentOrderId,
        status: 'captured',
        method,
        ...(method === 'netbanking' ? { bank: bankCode } : {}),
        ...(method === 'wallet' ? { wallet: walletType } : {}),
      })
    }

    // Generic success response (for any other status)
    return NextResponse.json({
      success: true,
      mode: 'polling', // Default to polling for non-captured statuses
      razorpayOrderId: orderResult.razorpayOrderId,
      razorpayPaymentId: paymentResult.razorpayPaymentId,
      paymentOrderId,
      status: paymentResult.status,
      method,
    })
  } catch (error) {
    console.error('[Payment Process Error]', error)
    return NextResponse.json({ error: 'Payment processing failed. Please try again.' }, { status: 500 })
  }
}
