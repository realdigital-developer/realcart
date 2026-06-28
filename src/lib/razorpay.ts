/**
 * Razorpay Payment Gateway Integration
 *
 * Handles:
 *   - Creating Razorpay orders
 *   - Verifying payment signatures (HMAC-SHA256)
 *   - Processing webhook events
 *   - Sandbox mode simulation (when keys not configured)
 */

import crypto from 'crypto'
import { PAYMENT_CONFIG, type RazorpayOrderResult, type PaymentVerificationResult } from './payment-config'

/* ------------------------------------------------------------------ */
/*  Razorpay Instance                                                    */
/* ------------------------------------------------------------------ */

let _razorpayInstance: InstanceType<typeof import('razorpay')> | null = null

function getRazorpayInstance() {
  if (!_razorpayInstance && PAYMENT_CONFIG.isConfigured) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RazorpayModule = require('razorpay')
    // The razorpay npm package is CommonJS — module.exports is the constructor directly.
    // It does NOT have a .default property. Both `require('razorpay')` and
    // `require('razorpay').default` may work depending on the bundler runtime,
    // so we handle both cases for maximum compatibility.
    const RazorpayConstructor = typeof RazorpayModule === 'function'
      ? RazorpayModule
      : RazorpayModule.default
    if (typeof RazorpayConstructor !== 'function') {
      throw new Error('Failed to load Razorpay constructor. Ensure the "razorpay" package is installed.')
    }
    _razorpayInstance = new RazorpayConstructor({
      key_id: PAYMENT_CONFIG.keyId,
      key_secret: PAYMENT_CONFIG.keySecret,
    })
  }
  return _razorpayInstance
}

/* ------------------------------------------------------------------ */
/*  Create Razorpay Order                                                */
/* ------------------------------------------------------------------ */

/**
 * Create a Razorpay order for the given amount.
 * In sandbox mode, generates a mock order ID.
 *
 * @param params.orderId - Internal order ID (used as receipt)
 * @param params.amount - Amount in INR (will be converted to paise)
 * @param params.customerName - Customer name for prefill
 * @param params.customerEmail - Customer email for prefill
 * @param params.customerPhone - Customer phone for prefill
 */
export async function createRazorpayOrder(params: {
  orderId: string
  amount: number
  customerName: string
  customerEmail?: string
  customerPhone?: string
}): Promise<RazorpayOrderResult> {
  const amountPaise = Math.round(params.amount * 100) // Convert to paise

  if (PAYMENT_CONFIG.sandboxMode) {
    // Sandbox mode — simulate order creation
    const mockRazorpayOrderId = `order_sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log(`[Payment Sandbox] Created mock order: ${mockRazorpayOrderId} for ₹${params.amount}`)

    return {
      success: true,
      orderId: params.orderId,
      razorpayOrderId: mockRazorpayOrderId,
      amount: amountPaise,
      currency: PAYMENT_CONFIG.currency,
      key: 'rzp_test_sandbox_key',
      companyName: PAYMENT_CONFIG.companyName,
      prefill: {
        name: params.customerName,
        email: params.customerEmail || '',
        contact: params.customerPhone || '',
      },
    }
  }

  try {
    const razorpay = getRazorpayInstance()
    if (!razorpay) {
      return { success: false, orderId: '', razorpayOrderId: '', amount: 0, currency: '', key: '', companyName: '', prefill: { name: '', email: '', contact: '' }, error: 'Razorpay not configured' }
    }

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: PAYMENT_CONFIG.currency,
      receipt: params.orderId,
      notes: {
        internalOrderId: params.orderId,
        customerName: params.customerName,
      },
    })

    console.log(`[Payment] Created Razorpay order: ${order.id} for ₹${params.amount}`)

    return {
      success: true,
      orderId: params.orderId,
      razorpayOrderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      key: PAYMENT_CONFIG.keyId,
      companyName: PAYMENT_CONFIG.companyName,
      prefill: {
        name: params.customerName,
        email: params.customerEmail || '',
        contact: params.customerPhone || '',
      },
    }
  } catch (error) {
    console.error('[Payment] Failed to create Razorpay order:', error)
    return {
      success: false,
      orderId: params.orderId,
      razorpayOrderId: '',
      amount: amountPaise,
      currency: PAYMENT_CONFIG.currency,
      key: '',
      companyName: '',
      prefill: { name: '', email: '', contact: '' },
      error: error instanceof Error ? error.message : 'Failed to create payment order',
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Verify Payment Signature                                             */
/* ------------------------------------------------------------------ */

/**
 * Verify the payment signature from Razorpay checkout.
 * Uses HMAC-SHA256 to verify integrity of payment data.
 *
 * @param params.razorpayOrderId - Razorpay order ID
 * @param params.razorpayPaymentId - Razorpay payment ID
 * @param params.razorpaySignature - Signature from Razorpay
 */
export function verifyPaymentSignature(params: {
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}): boolean {
  if (PAYMENT_CONFIG.sandboxMode) {
    // In sandbox mode, always accept (signature verification skipped)
    console.log('[Payment Sandbox] Skipping signature verification')
    return true
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', PAYMENT_CONFIG.keySecret)
      .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(params.razorpaySignature, 'hex'),
    )
  } catch (error) {
    console.error('[Payment] Signature verification error:', error)
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Fetch Payment Details                                                */
/* ------------------------------------------------------------------ */

/**
 * Fetch payment details from Razorpay after successful verification.
 * Returns the payment method, bank, card info, etc.
 */
export async function fetchPaymentDetails(razorpayPaymentId: string): Promise<PaymentVerificationResult> {
  if (PAYMENT_CONFIG.sandboxMode) {
    // Return simulated payment details
    return {
      success: true,
      razorpayPaymentId,
      method: 'upi',
      bank: 'sandbox_bank',
      vpa: 'customer@sandbox',
    }
  }

  try {
    const razorpay = getRazorpayInstance()
    if (!razorpay) {
      return { success: false, error: 'Razorpay not configured' }
    }

    const payment = await razorpay.payments.fetch(razorpayPaymentId)

    return {
      success: true,
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      method: payment.method as PaymentVerificationResult['method'],
      bank: payment.bank,
      wallet: payment.wallet,
      vpa: payment.vpa,
      cardNetwork: payment.card_network,
      cardLast4: payment.card_last4,
    }
  } catch (error) {
    console.error('[Payment] Failed to fetch payment details:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch payment details',
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Process Refund                                                       */
/* ------------------------------------------------------------------ */

/**
 * Initiate a refund for a Razorpay payment.
 * Called when an online-paid order is cancelled or return is completed.
 */
export async function initiateRefund(params: {
  razorpayPaymentId: string
  amount?: number // If omitted, full refund
  reason?: string
}): Promise<{ success: boolean; refundId?: string; error?: string }> {
  if (PAYMENT_CONFIG.sandboxMode) {
    const mockRefundId = `rfnd_sandbox_${Date.now()}`
    console.log(`[Payment Sandbox] Mock refund: ${mockRefundId}`)
    return { success: true, refundId: mockRefundId }
  }

  try {
    const razorpay = getRazorpayInstance()
    if (!razorpay) {
      return { success: false, error: 'Razorpay not configured' }
    }

    const refundParams: Record<string, unknown> = {}
    if (params.amount) {
      refundParams.amount = Math.round(params.amount * 100) // Convert to paise
    }
    if (params.reason) {
      refundParams.notes = { reason: params.reason }
    }

    const refund = await razorpay.payments.refund(params.razorpayPaymentId, refundParams)

    console.log(`[Payment] Refund initiated: ${refund.id} for payment ${params.razorpayPaymentId}`)

    return { success: true, refundId: refund.id }
  } catch (error) {
    console.error('[Payment] Refund failed:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Refund failed' }
  }
}

/* ------------------------------------------------------------------ */
/*  Verify Webhook Signature                                             */
/* ------------------------------------------------------------------ */

/**
 * Verify the signature of an incoming Razorpay webhook.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
): boolean {
  if (!PAYMENT_CONFIG.webhookSecret) {
    console.warn('[Payment] Webhook secret not configured, skipping verification')
    return true // Allow in dev
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', PAYMENT_CONFIG.webhookSecret)
      .update(body)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Check Order Payment Status (for polling)                             */
/* ------------------------------------------------------------------ */

/**
 * Check the payment status of a Razorpay order.
 * Used for UPI Collect polling — checks if payment has been captured.
 *
 * Returns the first captured/attempted payment against the order.
 */
export async function checkOrderPaymentStatus(razorpayOrderId: string): Promise<{
  status: 'unpaid' | 'paid' | 'failed' | 'created'
  paymentId?: string
  method?: string
  bank?: string
  vpa?: string
  wallet?: string
  cardNetwork?: string
  cardLast4?: string
  capturedAt?: string
}> {
  if (PAYMENT_CONFIG.sandboxMode) {
    return { status: 'unpaid' }
  }

  try {
    const razorpay = getRazorpayInstance()
    if (!razorpay) {
      return { status: 'unpaid' }
    }

    const payments = await razorpay.orders.fetchPayments(razorpayOrderId)

    if (!payments.items || payments.items.length === 0) {
      return { status: 'unpaid' }
    }

    // Find the latest captured payment
    const captured = payments.items.find(
      (p: { status: string }) => p.status === 'captured'
    )
    if (captured) {
      return {
        status: 'paid',
        paymentId: captured.id,
        method: captured.method,
        bank: captured.bank || undefined,
        vpa: captured.vpa || undefined,
        wallet: captured.wallet || undefined,
        cardNetwork: captured.card_network || undefined,
        cardLast4: captured.card_last4 || undefined,
        capturedAt: captured.created_at ? new Date(captured.created_at * 1000).toISOString() : undefined,
      }
    }

    // Check for failed payments
    const failed = payments.items.find(
      (p: { status: string }) => p.status === 'failed'
    )
    if (failed) {
      return { status: 'failed', paymentId: failed.id, method: failed.method }
    }

    // Payment attempted but not yet captured
    const attempted = payments.items.find(
      (p: { status: string }) => p.status === 'authorized' || p.status === 'created'
    )
    if (attempted) {
      return { status: 'created', paymentId: attempted.id, method: attempted.method }
    }

    return { status: 'unpaid' }
  } catch (error) {
    console.error('[Payment] Failed to check order payment status:', error)
    return { status: 'unpaid' }
  }
}

/* ------------------------------------------------------------------ */
/*  Server-side UPI Collect Payment                                      */
/* ------------------------------------------------------------------ */

/**
 * Create a UPI Collect payment server-side using Razorpay's REST API.
 * This sends a collect request to the user's VPA — no client-side
 * checkout.js or modal is needed. The user approves on their UPI app.
 *
 * Uses the internal API endpoint that checkout.js calls under the hood.
 */
export async function createUpiCollectPayment(params: {
  razorpayOrderId: string
  vpa: string
  customerEmail?: string
  customerPhone?: string
}): Promise<{
  success: boolean
  razorpayPaymentId?: string
  status?: string
  error?: string
}> {
  if (PAYMENT_CONFIG.sandboxMode) {
    console.log(`[Payment Sandbox] UPI Collect mock: VPA=${params.vpa}, Order=${params.razorpayOrderId}`)
    return {
      success: true,
      razorpayPaymentId: `pay_sandbox_upi_${Date.now()}`,
      status: 'created',
    }
  }

  try {
    // Make a direct HTTP POST to Razorpay's payment creation API
    // This is the same endpoint that checkout.js uses internally
    const auth = Buffer.from(`${PAYMENT_CONFIG.keyId}:${PAYMENT_CONFIG.keySecret}`).toString('base64')

    const response = await fetch(`https://api.razorpay.com/v1/orders/${params.razorpayOrderId}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'upi',
        upi: {
          vpa: params.vpa,
          flow: 'collect',
        },
        email: params.customerEmail || '',
        contact: params.customerPhone || '',
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[Payment] UPI Collect API error:', JSON.stringify(data))
      console.error('[Payment] UPI Collect API status:', response.status, response.statusText)
      return {
        success: false,
        error: data.error?.description || data.error?.reason || 'Failed to initiate UPI Collect payment',
      }
    }

    console.log(`[Payment] UPI Collect initiated: ${data.id} for VPA ${params.vpa}`)

    return {
      success: true,
      razorpayPaymentId: data.id,
      status: data.status,
    }
  } catch (error) {
    console.error('[Payment] UPI Collect failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initiate UPI Collect payment',
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Create Payment Link (server-side redirect, no checkout.js modal)     */
/* ------------------------------------------------------------------ */

/**
 * Create a Razorpay Payment Link server-side.
 * Returns a URL that the user can be redirected to for payment.
 * This is a full-page redirect — NO modal, NO popup, NO splash screen.
 *
 * The user completes payment on Razorpay's hosted page,
 * then gets redirected back to our callback URL.
 */
export async function createPaymentLink(params: {
  razorpayOrderId: string
  amount: number // in INR (will be converted to paise)
  customerName: string
  customerEmail?: string
  customerPhone?: string
  callbackUrl: string
  description?: string
}): Promise<{
  success: boolean
  paymentLinkId?: string
  paymentLinkUrl?: string
  shortUrl?: string
  error?: string
}> {
  if (PAYMENT_CONFIG.sandboxMode) {
    const mockUrl = `https://rzp.io/i/sandbox_${Date.now()}`
    console.log(`[Payment Sandbox] Created mock payment link: ${mockUrl}`)
    return {
      success: true,
      paymentLinkId: `plink_sandbox_${Date.now()}`,
      paymentLinkUrl: mockUrl,
      shortUrl: mockUrl,
    }
  }

  try {
    const razorpay = getRazorpayInstance()
    if (!razorpay) {
      return { success: false, error: 'Razorpay not configured' }
    }

    const amountPaise = Math.round(params.amount * 100)

    const paymentLink = await razorpay.paymentLink.create({
      amount: amountPaise,
      currency: PAYMENT_CONFIG.currency,
      description: params.description || `Order Payment — ${params.razorpayOrderId}`,
      customer: {
        name: params.customerName,
        email: params.customerEmail || '',
        contact: params.customerPhone || '',
      },
      notify: {
        sms: false,
        email: false,
      },
      reminder_enable: false,
      callback_url: params.callbackUrl,
      callback_method: 'get',
      notes: {
        razorpayOrderId: params.razorpayOrderId,
      },
    })

    console.log(`[Payment] Created payment link: ${paymentLink.id} → ${paymentLink.short_url}`)

    return {
      success: true,
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.short_url,
      shortUrl: paymentLink.short_url,
    }
  } catch (error) {
    console.error('[Payment] Failed to create payment link:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment link',
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Server-side Card Payment (NO checkout.js, NO modal)                  */
/* ------------------------------------------------------------------ */

/**
 * Create a card payment server-side using Razorpay's REST API.
 * This processes the card payment entirely server-side — no client-side
 * checkout.js or modal is needed.
 *
 * IMPORTANT: Passing card details through your server requires PCI-DSS
 * compliance in production. For test/sandbox mode, this is acceptable.
 * For production, use Razorpay's Seamless Pro or Embedded Checkout.
 */
export async function createCardPayment(params: {
  razorpayOrderId: string
  cardNumber: string
  cardName: string
  cardExpiryMonth: string
  cardExpiryYear: string
  cardCvv: string
  customerEmail?: string
  customerPhone?: string
}): Promise<ServerPaymentResult> {
  if (PAYMENT_CONFIG.sandboxMode) {
    console.log(`[Payment Sandbox] Card payment mock: ****${params.cardNumber.slice(-4)}, Order=${params.razorpayOrderId}`)
    return {
      success: true,
      razorpayPaymentId: `pay_sandbox_card_${Date.now()}`,
      status: 'captured',
      method: 'card',
      cardLast4: params.cardNumber.slice(-4),
    }
  }

  try {
    const auth = Buffer.from(`${PAYMENT_CONFIG.keyId}:${PAYMENT_CONFIG.keySecret}`).toString('base64')

    const response = await fetch(`https://api.razorpay.com/v1/orders/${params.razorpayOrderId}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'card',
        card: {
          number: params.cardNumber,
          name: params.cardName,
          expiry_month: params.cardExpiryMonth,
          expiry_year: params.cardExpiryYear,
          cvv: params.cardCvv,
        },
        email: params.customerEmail || '',
        contact: params.customerPhone || '',
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[Payment] Card payment API error:', JSON.stringify(data))
      console.error('[Payment] Card payment API status:', response.status, response.statusText)
      return {
        success: false,
        error: data.error?.description || data.error?.reason || 'Card payment failed',
      }
    }

    console.log(`[Payment] Card payment created: ${data.id}, status=${data.status}`)

    return {
      success: true,
      razorpayPaymentId: data.id,
      status: data.status,
      method: 'card',
      cardLast4: data.card_last4 || params.cardNumber.slice(-4),
      cardNetwork: data.card_network || '',
    }
  } catch (error) {
    console.error('[Payment] Card payment failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Card payment failed',
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Server-side Net Banking Payment (NO checkout.js, NO modal)           */
/* ------------------------------------------------------------------ */

/**
 * Create a net banking payment server-side using Razorpay's REST API.
 * Returns a redirect URL to the bank's authentication page.
 * After bank authentication, the bank redirects to our callback URL.
 *
 * NO checkout.js, NO modal, NO popup, NO splash screen.
 */
export async function createNetbankingPayment(params: {
  razorpayOrderId: string
  bankCode: string
  customerEmail?: string
  customerPhone?: string
  callbackUrl?: string
}): Promise<ServerPaymentResult> {
  if (PAYMENT_CONFIG.sandboxMode) {
    console.log(`[Payment Sandbox] Netbanking mock: bank=${params.bankCode}, Order=${params.razorpayOrderId}`)
    return {
      success: true,
      razorpayPaymentId: `pay_sandbox_nb_${Date.now()}`,
      status: 'captured',
      method: 'netbanking',
      bank: params.bankCode,
    }
  }

  try {
    const auth = Buffer.from(`${PAYMENT_CONFIG.keyId}:${PAYMENT_CONFIG.keySecret}`).toString('base64')

    const body: Record<string, unknown> = {
      method: 'netbanking',
      netbanking: {
        bank: params.bankCode,
      },
      email: params.customerEmail || '',
      contact: params.customerPhone || '',
    }

    if (params.callbackUrl) {
      body.callback_url = params.callbackUrl
      body.callback_method = 'get'
    }

    const response = await fetch(`https://api.razorpay.com/v1/orders/${params.razorpayOrderId}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[Payment] Netbanking payment API error:', data)
      return {
        success: false,
        error: data.error?.description || data.error?.reason || 'Netbanking payment failed',
      }
    }

    console.log(`[Payment] Netbanking payment created: ${data.id}, status=${data.status}`)

    // Check for authentication/redirect URL
    const redirectUrl = data.authentication?.redirect_url || data.redirect_url || ''

    return {
      success: true,
      razorpayPaymentId: data.id,
      status: data.status,
      method: 'netbanking',
      bank: params.bankCode,
      redirectUrl,
    }
  } catch (error) {
    console.error('[Payment] Netbanking payment failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Netbanking payment failed',
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Server-side Wallet Payment (NO checkout.js, NO modal)                */
/* ------------------------------------------------------------------ */

/**
 * Create a wallet payment server-side using Razorpay's REST API.
 * Returns a redirect URL to the wallet's authentication page.
 * After wallet authentication, the wallet redirects to our callback URL.
 *
 * NO checkout.js, NO modal, NO popup, NO splash screen.
 */
export async function createWalletPayment(params: {
  razorpayOrderId: string
  walletType: string
  customerEmail?: string
  customerPhone?: string
  callbackUrl?: string
}): Promise<ServerPaymentResult> {
  if (PAYMENT_CONFIG.sandboxMode) {
    console.log(`[Payment Sandbox] Wallet payment mock: wallet=${params.walletType}, Order=${params.razorpayOrderId}`)
    return {
      success: true,
      razorpayPaymentId: `pay_sandbox_wallet_${Date.now()}`,
      status: 'captured',
      method: 'wallet',
      wallet: params.walletType,
    }
  }

  try {
    const auth = Buffer.from(`${PAYMENT_CONFIG.keyId}:${PAYMENT_CONFIG.keySecret}`).toString('base64')

    const body: Record<string, unknown> = {
      method: 'wallet',
      wallet: {
        type: params.walletType,
      },
      email: params.customerEmail || '',
      contact: params.customerPhone || '',
    }

    if (params.callbackUrl) {
      body.callback_url = params.callbackUrl
      body.callback_method = 'get'
    }

    const response = await fetch(`https://api.razorpay.com/v1/orders/${params.razorpayOrderId}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[Payment] Wallet payment API error:', data)
      return {
        success: false,
        error: data.error?.description || data.error?.reason || 'Wallet payment failed',
      }
    }

    console.log(`[Payment] Wallet payment created: ${data.id}, status=${data.status}`)

    // Check for authentication/redirect URL
    const redirectUrl = data.authentication?.redirect_url || data.redirect_url || ''

    return {
      success: true,
      razorpayPaymentId: data.id,
      status: data.status,
      method: 'wallet',
      wallet: params.walletType,
      redirectUrl,
    }
  } catch (error) {
    console.error('[Payment] Wallet payment failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Wallet payment failed',
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Common Server Payment Result Type                                     */
/* ------------------------------------------------------------------ */

export interface ServerPaymentResult {
  success: boolean
  razorpayPaymentId?: string
  status?: string
  method?: string
  bank?: string
  wallet?: string
  vpa?: string
  cardLast4?: string
  cardNetwork?: string
  redirectUrl?: string
  error?: string
}

/* ------------------------------------------------------------------ */
/*  Generate Order ID for Payment                                        */
/* ------------------------------------------------------------------ */

/**
 * Generate a temporary order ID for Razorpay order creation.
 * This is used as the receipt field and also to link the payment
 * back to the order when it's created.
 *
 * Format: PAY-YYYYMMDD-XXXXXX
 */
export function generatePaymentOrderId(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `PAY-${date}-${random}`
}
