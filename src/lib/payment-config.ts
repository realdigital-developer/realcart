/**
 * Payment Gateway Configuration
 *
 * Supports Razorpay (India) with sandbox mode for development.
 * Set environment variables in .env to activate live mode.
 *
 * Required env vars for production:
 *   RAZORPAY_KEY_ID     — Razorpay API key
 *   RAZORPAY_KEY_SECRET — Razorpay API secret
 *
 * For testing without Razorpay keys, the system runs in sandbox mode
 * which simulates payment flow end-to-end.
 */

export const PAYMENT_CONFIG = {
  /** Gateway provider name */
  provider: 'razorpay' as const,

  /** Whether Razorpay keys are configured */
  get isConfigured(): boolean {
    return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  },

  /** Razorpay key ID (safe for client-side) */
  get keyId(): string {
    return process.env.RAZORPAY_KEY_ID || ''
  },

  /** Razorpay key secret (server-side only) */
  get keySecret(): string {
    return process.env.RAZORPAY_KEY_SECRET || ''
  },

  /** Currency code */
  currency: 'INR' as const,

  /** Company name shown in Razorpay checkout */
  companyName: 'RealCart',

  /** Sandbox mode — simulates payment when keys are not configured */
  get sandboxMode(): boolean {
    return !this.isConfigured
  },

  /** Webhook secret for signature verification */
  get webhookSecret(): string {
    return process.env.RAZORPAY_WEBHOOK_SECRET || ''
  },
} as const

/**
 * Payment status values for tracking
 */
export type PaymentGatewayStatus =
  | 'created'     // Razorpay order created, awaiting payment
  | 'attempted'   // Payment attempted but not completed
  | 'paid'        // Payment successful
  | 'failed'      // Payment failed
  | 'refunded'    // Payment refunded

/**
 * Payment method sub-types (what the customer chose in Razorpay modal)
 */
export type PaymentSubMethod =
  | 'upi'
  | 'card'
  | 'netbanking'
  | 'wallet'
  | 'emi'
  | 'cardless_emi'
  | 'paylater'

/**
 * Result of creating a Razorpay order
 */
export interface RazorpayOrderResult {
  success: boolean
  /** Our internal order ID (ORD-YYYYMMDD-XXXX) — used as Razorpay receipt */
  orderId: string
  /** Razorpay order ID (order_XXXXXX) */
  razorpayOrderId: string
  /** Amount in paise (₹1 = 100 paise) */
  amount: number
  /** Currency code */
  currency: string
  /** Razorpay key ID for frontend checkout */
  key: string
  /** Company name for checkout */
  companyName: string
  /** Customer details prefill */
  prefill: {
    name: string
    email: string
    contact: string
  }
  /** Error message if failed */
  error?: string
}

/**
 * Result of verifying a Razorpay payment
 */
export interface PaymentVerificationResult {
  success: boolean
  /** Razorpay payment ID */
  razorpayPaymentId?: string
  /** Razorpay order ID */
  razorpayOrderId?: string
  /** Payment method used (upi, card, etc.) */
  method?: PaymentSubMethod
  /** Bank or UPI ID */
  bank?: string
  /** Wallet name if wallet payment */
  wallet?: string
  /** VPA (UPI ID) if UPI payment */
  vpa?: string
  /** Card network (Visa, Mastercard, etc.) */
  cardNetwork?: string
  /** Last 4 digits of card */
  cardLast4?: string
  /** Error message if failed */
  error?: string
}
