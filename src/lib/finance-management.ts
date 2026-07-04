/**
 * Finance Management — Settlement, Payout, Refund & Reporting Engine
 *
 * This module is the INTEGRATION LAYER that connects the existing finance engine
 * (commission, TDS, TCS, GST calculations in finance-engine.ts) to the database
 * and order lifecycle. It provides:
 *
 *   1. Settlement Engine — groups delivered order items by seller & period,
 *      computes net payouts, creates payout records
 *   2. Payout Processor — marks payouts as processed/paid, records transaction refs
 *   3. Refund Processor — initiates Razorpay refunds on order cancellation/return,
 *      records refund transactions
 *   4. Financial Reports — revenue reports, GST summaries, seller-wise payouts,
 *      platform profit calculations
 *   5. Transaction Ledger — unified ledger of all financial movements
 *
 * Design principles:
 *   - NEVER throws on non-critical failures (logging + graceful degradation)
 *   - All monetary values rounded to 2 decimal places (paise-level precision)
 *   - Idempotent: re-running settlement won't double-create payouts
 *   - Settlement only includes DELIVERED order items (not pending/cancelled)
 *   - Refunds respect payment method (online → Razorpay refund; COD → no refund)
 *
 * Collections used (defined in mongodb.ts):
 *   - seller_payouts   — settlement records per seller per period
 *   - transactions     — unified financial ledger
 *   - refunds          — refund records
 *   - expenses         — platform expense records
 */

import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'
import { calculateSellerPayout, type SellerPayout, type SettlementStatus } from './finance-engine'
import { initiateRefund } from './razorpay'
import { creditWallet } from './wallet-helper'
import { createCustomerNotification } from './customer-notifications'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

/** A unified financial transaction in the ledger */
export interface FinancialTransaction {
  _id?: string
  /** Transaction ID for display (e.g. TXN-20260101-XXXX) */
  transactionId: string
  /** Type of transaction */
  type: 'order_payment' | 'commission_earned' | 'gst_collected' | 'tds_deducted' | 'tcs_collected' | 'delivery_earned' | 'cod_fee' | 'platform_fee' | 'seller_payout' | 'refund_issued' | 'expense' | 'adjustment'
  /** Sub-type for finer classification */
  subType?: string
  /** Order ID (if related to an order) */
  orderId?: string
  /** Order item ID (if related to a specific item) */
  orderItemId?: string
  /** Payout ID (if related to a seller payout) */
  payoutId?: string
  /** Refund ID (if related to a refund) */
  refundId?: string
  /** Seller ID (if related to a seller) */
  sellerId?: string
  /** Customer ID (if related to a customer) */
  customerId?: string
  /** Amount in INR (positive = credit/inflow, negative = debit/outflow) */
  amount: number
  /** Description */
  description: string
  /** Payment method */
  paymentMethod?: 'cod' | 'online' | 'bank_transfer' | 'internal'
  /** Gateway reference (Razorpay payment/refund ID) */
  gatewayRef?: string
  /** Transaction status */
  status: 'pending' | 'completed' | 'failed'
  /** Transaction date */
  date: Date
  createdAt: Date
  updatedAt: Date
}

/** A refund record */
export interface RefundRecord {
  _id?: string
  refundId: string
  orderId: string
  orderItemId?: string
  customerId: string
  sellerId?: string
  /** Original payment ID from Razorpay */
  razorpayPaymentId?: string
  /** Refund amount in INR */
  amount: number
  /** Refund reason */
  reason: string
  /** Refund type: full or partial */
  refundType: 'full' | 'partial'
  /** Refund status */
  status: 'initiated' | 'processed' | 'failed' | 'pending'
  /** Gateway refund ID */
  gatewayRefundId?: string
  /** Payment method of original transaction */
  paymentMethod: 'cod' | 'online'
  /** Initiated by */
  initiatedBy: 'admin' | 'seller' | 'system' | 'customer'
  initiatedByUserId?: string
  processedAt?: Date
  failureReason?: string
  createdAt: Date
  updatedAt: Date
}

/** A platform expense record */
export interface ExpenseRecord {
  _id?: string
  expenseId: string
  /** Expense category */
  category: 'operations' | 'marketing' | 'logistics' | 'technology' | 'salaries' | 'refunds' | 'payment_gateway' | 'cloud_infra' | 'legal' | 'office' | 'other'
  /** Sub-category / description */
  description: string
  /** Amount in INR */
  amount: number
  /** GST paid on expense (input tax credit) */
  gstAmount?: number
  /** Vendor/payee */
  vendor?: string
  /** Invoice/reference number */
  invoiceNumber?: string
  /** Expense date */
  date: Date
  /** Payment method */
  paymentMethod?: 'bank_transfer' | 'upi' | 'card' | 'cash' | 'cheque'
  /** Status */
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  /** Created by (admin user) */
  createdBy?: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

/** Revenue report data */
export interface RevenueReport {
  period: { start: string; end: string }
  // Gross metrics
  grossOrderValue: number        // Sum of totalAmount for all orders
  totalTaxableValue: number      // Sum of taxable values
  totalGst: number               // Total GST collected (CGST+SGST+IGST)
  totalCgst: number
  totalSgst: number
  totalIgst: number
  totalCess: number
  // Platform earnings
  totalCommission: number
  totalGstOnCommission: number
  totalDeliveryFees: number      // Delivery charges collected from customers
  totalGstOnDelivery: number
  totalCodFee: number
  totalPlatformFee: number
  // Statutory deductions
  totalTds: number
  totalTcs: number
  // Seller payouts
  totalSellerEarnings: number    // Net payable to sellers
  // Refunds
  totalRefunds: number
  refundCount: number
  refundImpactOnPlatform: number   // Commission + fees reversed due to refunds (platform's actual loss)
  // Platform profit (commission + fees - refund impact - expenses)
  platformRevenue: number        // commission + codFee + platformFee + gstOnCommission
  platformExpenses: number
  platformProfit: number
  // Order counts
  totalOrders: number
  deliveredOrders: number
  cancelledOrders: number
  returnedOrders: number
  // Payment method split
  codOrders: number
  codRevenue: number
  onlineOrders: number
  onlineRevenue: number
  // Monthly breakdown
  monthlyBreakdown: Array<{
    month: string
    revenue: number
    commission: number
    orders: number
  }>
  // Daily breakdown (for chart rendering on short date ranges)
  dailyBreakdown: Array<{
    date: string          // YYYY-MM-DD
    revenue: number
    commission: number
    orders: number
  }>
  // Seller-wise breakdown
  sellerWiseBreakdown: Array<{
    sellerId: string
    sellerName: string
    storeName: string
    orderCount: number
    grossSales: number
    commission: number
    netPayout: number
  }>
}

/** GST report data (for GSTR-1 style filing) */
export interface GstReport {
  period: { start: string; end: string }
  platformGstin: string
  // B2B + B2C supplies
  totalTaxableValue: number
  totalInvoiceValue: number
  // GST breakup
  cgst: number
  sgst: number
  igst: number
  cess: number
  totalGst: number
  // GST on commission (platform as service provider)
  gstOnCommission: number
  gstOnDelivery: number
  // HSN-wise summary
  hsnSummary: Array<{
    hsn: string
    description: string
    quantity: number
    taxableValue: number
    gstRate: number
    cgst: number
    sgst: number
    igst: number
    totalGst: number
  }>
  // State-wise summary (place of supply)
  stateWiseSummary: Array<{
    state: string
    intraState: boolean
    taxableValue: number
    cgst: number
    sgst: number
    igst: number
  }>
}

/* ------------------------------------------------------------------ */
/*  ID Generators                                                       */
/* ------------------------------------------------------------------ */

export function generateTransactionId(): string {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `TXN-${dateStr}-${random}`
}

export function generateRefundId(): string {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `RFD-${dateStr}-${random}`
}

export function generateExpenseId(): string {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `EXP-${dateStr}-${random}`
}

export function generatePayoutId(): string {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PAY-${dateStr}-${random}`
}

/* ------------------------------------------------------------------ */
/*  Transaction Ledger                                                  */
/* ------------------------------------------------------------------ */

/**
 * Record a financial transaction in the unified ledger.
 * Never throws — logs on failure.
 */
export async function recordTransaction(params: Omit<FinancialTransaction, '_id' | 'transactionId' | 'createdAt' | 'updatedAt'> & { transactionId?: string }): Promise<FinancialTransaction | null> {
  try {
    const { db } = await connectToDatabase()
    const now = new Date()
    const txn: FinancialTransaction = {
      ...params,
      transactionId: params.transactionId || generateTransactionId(),
      date: params.date || now,
      createdAt: now,
      updatedAt: now,
    }
    await db.collection('transactions').insertOne(txn)
    return txn
  } catch (err) {
    console.error('[Finance] Failed to record transaction:', err)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Refund Processor                                                    */
/* ------------------------------------------------------------------ */

/**
 * Process a refund for an order (full or partial).
 *
 * - For ONLINE payments: calls Razorpay initiateRefund()
 * - For COD payments: no gateway refund needed (customer paid on delivery)
 * - Records the refund in the refunds collection
 * - Records a transaction in the ledger
 * - Updates order paymentStatus
 *
 * NEVER throws — returns a result object. This ensures order cancellation
 * never fails due to refund processing issues.
 */
export async function processRefund(params: {
  orderId: string
  orderItemId?: string
  amount: number
  reason: string
  initiatedBy: 'admin' | 'seller' | 'system' | 'customer'
  initiatedByUserId?: string
  refundType?: 'full' | 'partial'
}): Promise<{ success: boolean; refundId?: string; gatewayRefundId?: string; error?: string }> {
  const { db } = await connectToDatabase()
  const now = new Date()
  const refundId = generateRefundId()

  try {
    // 1. Fetch the order
    const order = await db.collection('orders').findOne({ orderId: params.orderId })
    if (!order) {
      return { success: false, error: 'Order not found' }
    }

    const paymentMethod = order.paymentMethod as 'cod' | 'online'
    const razorpayPaymentId = order.razorpayPaymentId as string | undefined
    const customerId = order.customerId as string

    // 2. Create refund record (initial status: initiated)
    const refundRecord: RefundRecord = {
      refundId,
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      customerId,
      sellerId: (order.items as any[])?.[0]?.sellerId,
      razorpayPaymentId,
      amount: Math.round(params.amount * 100) / 100,
      reason: params.reason,
      refundType: params.refundType || (params.amount >= order.totalAmount ? 'full' : 'partial'),
      status: 'initiated',
      paymentMethod,
      initiatedBy: params.initiatedBy,
      initiatedByUserId: params.initiatedByUserId,
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('refunds').insertOne(refundRecord)

    // 3. Process refund — route based on how the order was paid.
    //    Three cases:
    //      a) Full wallet payment (paymentMethodDetail === 'wallet_balance'):
    //         credit the entire refund amount back to the customer's wallet.
    //      b) Partial wallet + online (split payment): the wallet portion was
    //         debited separately (linked via customer_wallets.transactions.orderId).
    //         Credit that wallet portion back + refund the online remainder via Razorpay.
    //      c) Pure online (UPI/Card/Net Banking/Wallet): refund via Razorpay gateway.
    //      d) COD: no refund (just record).
    let gatewayRefundId: string | undefined
    const paymentMethodDetail = order.paymentMethodDetail as string | undefined

    // ── Detect wallet usage on this order ──
    // Full wallet: paymentMethodDetail === 'wallet_balance' (razorpayPaymentId starts with 'wallet_')
    const isFullWalletPayment = paymentMethodDetail === 'wallet_balance'
      || (typeof razorpayPaymentId === 'string' && razorpayPaymentId.startsWith('wallet_'))

    // Partial wallet: query customer_wallets for debit transactions linked to this order
    let walletDebitAmount = 0
    if (!isFullWalletPayment) {
      try {
        const walletDoc = await db.collection('customer_wallets').findOne({ customerId })
        if (walletDoc?.transactions) {
          walletDebitAmount = (walletDoc.transactions as Array<{ orderId?: string; type: string; amount: number }>)
            .filter((t) => t.orderId === params.orderId && t.type === 'debit')
            .reduce((sum, t) => sum + (t.amount || 0), 0)
        }
      } catch {
        // Non-critical — treat as no wallet usage
      }
    }

    // ── Case (a): Full wallet payment → credit entire refund to wallet ──
    if (isFullWalletPayment) {
      try {
        await creditWallet({
          customerId,
          amount: params.amount,
          source: 'refund',
          description: `Refund for cancelled/returned order ${params.orderId}`,
          orderId: params.orderId,
        })
        await db.collection('refunds').updateOne(
          { refundId },
          { $set: { status: 'processed', processedAt: now, updatedAt: now, refundMethod: 'wallet' } },
        )
        console.log(`[Finance] Wallet refund: ₹${params.amount} credited back for order ${params.orderId}`)
      } catch (walletErr) {
        console.error(`[Finance] Wallet refund failed for order ${params.orderId}:`, walletErr)
        await db.collection('refunds').updateOne(
          { refundId },
          { $set: { status: 'failed', failureReason: 'Wallet credit failed', updatedAt: now } },
        )
        return { success: false, refundId, error: 'Wallet refund failed' }
      }
    }
    // ── Case (b): Partial wallet + online → credit wallet portion + Razorpay for remainder ──
    else if (walletDebitAmount > 0 && paymentMethod === 'online') {
      // Credit the wallet portion back first
      const walletRefundPortion = Math.min(walletDebitAmount, params.amount)
      try {
        await creditWallet({
          customerId,
          amount: walletRefundPortion,
          source: 'refund',
          description: `Wallet refund for order ${params.orderId}`,
          orderId: params.orderId,
        })
        console.log(`[Finance] Partial wallet refund: ₹${walletRefundPortion} credited back for order ${params.orderId}`)
      } catch (walletErr) {
        console.error(`[Finance] Partial wallet refund failed for order ${params.orderId}:`, walletErr)
        // Continue with the online portion — don't fail the entire refund
      }

      // Refund the online remainder via Razorpay (if there's a remainder)
      const onlineRemainder = params.amount - walletRefundPortion
      if (onlineRemainder > 0 && razorpayPaymentId) {
        const refundResult = await initiateRefund({
          razorpayPaymentId,
          amount: onlineRemainder,
          reason: params.reason,
        })
        if (refundResult.success && refundResult.refundId) {
          gatewayRefundId = refundResult.refundId
        } else {
          console.warn(`[Finance] Online remainder refund failed for order ${params.orderId}: ${refundResult.error}`)
          // Wallet portion already refunded — don't fail entirely
        }
      }
      await db.collection('refunds').updateOne(
        { refundId },
        { $set: { status: 'processed', gatewayRefundId, processedAt: now, updatedAt: now, refundMethod: 'split', walletRefundAmount: walletRefundPortion } },
      )
    }
    // ── Case (c): Pure online payment → refund via Razorpay gateway ──
    else if (paymentMethod === 'online' && razorpayPaymentId) {
      const refundResult = await initiateRefund({
        razorpayPaymentId,
        amount: params.refundType === 'partial' ? params.amount : undefined, // full refund if undefined
        reason: params.reason,
      })

      if (refundResult.success && refundResult.refundId) {
        gatewayRefundId = refundResult.refundId
        await db.collection('refunds').updateOne(
          { refundId },
          { $set: { status: 'processed', gatewayRefundId, processedAt: now, updatedAt: now } },
        )
      } else {
        await db.collection('refunds').updateOne(
          { refundId },
          { $set: { status: 'failed', failureReason: refundResult.error || 'Gateway refund failed', updatedAt: now } },
        )
        // Still record the attempt in the ledger
        await recordTransaction({
          type: 'refund_issued',
          subType: 'gateway_failed',
          orderId: params.orderId,
          orderItemId: params.orderItemId,
          refundId,
          customerId,
          amount: -params.amount,
          description: `Refund failed for order ${params.orderId}: ${params.reason}`,
          paymentMethod: 'online',
          status: 'failed',
          date: now,
        })
        return { success: false, refundId, error: refundResult.error || 'Gateway refund failed' }
      }
    }
    // ── Case (d): COD refund — no gateway action needed, just record ──
    else {
      await db.collection('refunds').updateOne(
        { refundId },
        { $set: { status: 'processed', processedAt: now, updatedAt: now } },
      )
    }

    // 4. Update order payment status
    await db.collection('orders').updateOne(
      { orderId: params.orderId },
      {
        $set: {
          paymentStatus: 'refunded',
          refundId,
          refundedAt: now,
          updatedAt: now,
        },
      },
    )

    // 5. Record in transaction ledger
    await recordTransaction({
      type: 'refund_issued',
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      refundId,
      customerId,
      amount: -params.amount,
      description: `Refund for order ${params.orderId}: ${params.reason}`,
      paymentMethod,
      gatewayRef: gatewayRefundId,
      status: 'completed',
      date: now,
    })

    console.log(`[Finance] Refund ${refundId} processed for order ${params.orderId}: ₹${params.amount}`)

    // === Send notification: Refund processed ===
    await createCustomerNotification({
      customerId,
      type: 'refund_processed',
      title: 'Refund Processed 💰',
      message: `₹${params.amount} has been refunded for order ${params.orderId}. ${paymentMethod === 'online' ? 'Credited to your RealCart Balance.' : 'Will be transferred to your bank account in 5-7 days.'}`,
      relatedId: params.orderId,
      relatedType: 'order',
    })

    return { success: true, refundId, gatewayRefundId }
  } catch (err) {
    console.error('[Finance] Refund processing error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    try {
      await db.collection('refunds').updateOne(
        { refundId },
        { $set: { status: 'failed', failureReason: message, updatedAt: now } },
      )
    } catch { /* ignore */ }
    return { success: false, refundId, error: message }
  }
}

/* ------------------------------------------------------------------ */
/*  Settlement Engine                                                   */
/* ------------------------------------------------------------------ */

/**
 * Get all delivered order items for a seller within a period that haven't
 * been settled yet (not included in any paid payout).
 */
async function getUnsettledItemsForSeller(sellerId: string, periodEnd?: Date): Promise<any[]> {
  const { db } = await connectToDatabase()
  // Orders store createdAt as ISO string, so convert the date for comparison
  const periodEndFilter = periodEnd ? { createdAt: { $lte: periodEnd.toISOString() } } : {}

  // Find all delivered orders containing items from this seller
  const orders = await db.collection('orders').find({
    ...periodEndFilter,
    'items.sellerId': { $in: [sellerId, new ObjectId(sellerId)] },
    'items.status': 'Delivered',
  }).toArray()

  const unsettledItems: any[] = []
  for (const order of orders) {
    for (const item of (order.items as any[])) {
      // Match seller ID (could be string or ObjectId)
      const itemSellerId = item.sellerId?.toString()
      if (itemSellerId !== sellerId) continue
      if (item.status !== 'Delivered') continue
      // Check if this item is already in a paid/processed payout
      if (item.payoutId) continue
      unsettledItems.push({ ...item, orderId: order.orderId, customerId: order.customerId })
    }
  }
  return unsettledItems
}

/**
 * Create a settlement (payout) for a seller.
 * Groups all unsettled delivered items into a single payout.
 *
 * @returns The created payout record, or null if no items to settle
 */
export async function createSellerSettlement(params: {
  sellerId: string
  periodEnd?: Date
  processedBy?: string
}): Promise<{ success: boolean; payoutId?: string; payout?: SellerPayout; error?: string }> {
  const { db } = await connectToDatabase()
  const now = new Date()

  try {
    // 1. Get seller info — try ObjectId first, then string, then by storeName/name
    //    (seller IDs in order items may be stored in various formats)
    let seller: any = null
    try {
      seller = await db.collection('sellers').findOne({ _id: new ObjectId(params.sellerId) })
    } catch { /* not a valid ObjectId */ }
    if (!seller) {
      seller = await db.collection('sellers').findOne({ _id: params.sellerId as any })
    }
    if (!seller) {
      // Try matching by the sellerId field directly (some orders store sellerId as a custom field)
      seller = await db.collection('sellers').findOne({ sellerId: params.sellerId })
    }
    if (!seller) {
      return { success: false, error: 'Seller not found' }
    }

    // 2. Get unsettled delivered items
    const items = await getUnsettledItemsForSeller(params.sellerId, params.periodEnd)
    if (items.length === 0) {
      return { success: false, error: 'No unsettled delivered items for this seller' }
    }

    // 3. Calculate payout using existing finance engine
    const payoutCalc = calculateSellerPayout({
      items: items.map(item => ({
        taxableValue: item.taxableValue || 0,
        commission: item.commission || 0,
        gstOnCommission: item.gstOnCommission || 0,
        deliveryCharge: item.deliveryFee || 0,
        tdsAmount: item.tdsAmount || 0,
        tcsAmount: item.tcsAmount || 0,
      })),
    })

    // 4. Determine settlement period
    const periodStart = items.reduce((min, item) => {
      const d = new Date(item.createdAt || now)
      return d < min ? d : min
    }, new Date(items[0].createdAt || now))
    const periodEnd = params.periodEnd || now

    // 5. Get seller bank details
    const bankAccount = {
      accountNumber: seller.bankDetails?.accountNumber || '',
      ifscCode: seller.bankDetails?.ifsc || '',
      bankName: seller.bankDetails?.bankName || '',
      accountHolderName: seller.bankDetails?.accountName || seller.name || '',
    }

    // 6. Create payout record
    const payoutId = generatePayoutId()
    const payout: SellerPayout = {
      sellerId: params.sellerId,
      sellerName: seller.name || '',
      sellerStoreName: seller.storeName || '',
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      grossOrderValue: payoutCalc.grossOrderValue,
      commission: payoutCalc.totalCommission,
      gstOnCommission: payoutCalc.totalGstOnCommission,
      deliveryCollected: payoutCalc.totalDeliveryCollected,
      tdsDeducted: payoutCalc.totalTds,
      tcsCollected: payoutCalc.totalTcs,
      netPayout: payoutCalc.netPayout,
      status: 'pending' as SettlementStatus,
      bankAccount,
      orderIds: items.map(i => i.orderId),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    await db.collection('seller_payouts').insertOne({ ...payout, payoutId, _payoutObjId: new ObjectId() })

    // 7. Mark items as settled (set payoutId on each item)
    for (const item of items) {
      await db.collection('orders').updateOne(
        { orderId: item.orderId, 'items.id': item.id },
        { $set: { 'items.$.payoutId': payoutId, 'items.$.settledAt': now } },
      )
    }

    // 8. Record transactions in ledger
    await recordTransaction({
      type: 'seller_payout',
      subType: 'settlement_created',
      payoutId,
      sellerId: params.sellerId,
      amount: -payoutCalc.netPayout,
      description: `Settlement ${payoutId} for ${seller.storeName || seller.name} (${items.length} items)`,
      paymentMethod: 'internal',
      status: 'pending',
      date: now,
    })

    console.log(`[Finance] Settlement ${payoutId} created for seller ${params.sellerId}: ₹${payoutCalc.netPayout} (${items.length} items)`)
    return { success: true, payoutId, payout }
  } catch (err) {
    console.error('[Finance] Settlement creation error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Mark a payout as processed (admin has initiated the bank transfer).
 */
export async function processPayout(payoutId: string, transactionRef?: string): Promise<{ success: boolean; error?: string }> {
  const { db } = await connectToDatabase()
  const now = new Date()

  try {
    const result = await db.collection('seller_payouts').updateOne(
      { payoutId },
      { $set: { status: 'processed', processedAt: now.toISOString(), transactionRef: transactionRef || '', updatedAt: now.toISOString() } },
    )

    if (result.matchedCount === 0) {
      return { success: false, error: 'Payout not found' }
    }

    // Update ledger transaction
    await db.collection('transactions').updateOne(
      { payoutId, type: 'seller_payout' },
      { $set: { status: 'completed', gatewayRef: transactionRef, updatedAt: now } },
    )

    console.log(`[Finance] Payout ${payoutId} marked as processed`)
    return { success: true }
  } catch (err) {
    console.error('[Finance] Payout processing error:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Mark a payout as paid (bank transfer completed).
 */
export async function completePayout(payoutId: string, transactionRef?: string): Promise<{ success: boolean; error?: string }> {
  const { db } = await connectToDatabase()
  const now = new Date()

  try {
    const result = await db.collection('seller_payouts').updateOne(
      { payoutId },
      { $set: { status: 'paid', paidAt: now.toISOString(), transactionRef: transactionRef || '', updatedAt: now.toISOString() } },
    )

    if (result.matchedCount === 0) {
      return { success: false, error: 'Payout not found' }
    }

    console.log(`[Finance] Payout ${payoutId} marked as paid`)
    return { success: true }
  } catch (err) {
    console.error('[Finance] Payout completion error:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/* ------------------------------------------------------------------ */
/*  Financial Reports                                                   */
/* ------------------------------------------------------------------ */

/**
 * Generate a comprehensive revenue report for a date range.
 */
export async function generateRevenueReport(startDate: Date, endDate: Date): Promise<RevenueReport> {
  const { db } = await connectToDatabase()

  // Orders store createdAt as an ISO string (not a Date object), so we must
  // compare using ISO strings for correct chronological ordering.
  const startISO = startDate.toISOString()
  const endISO = endDate.toISOString()
  const matchFilter = {
    createdAt: { $gte: startISO, $lte: endISO },
  }

  // Aggregate all orders in the period
  const orders = await db.collection('orders').find(matchFilter).toArray()

  // Initialize accumulators
  let grossOrderValue = 0
  let totalTaxableValue = 0
  let totalCgst = 0
  let totalSgst = 0
  let totalIgst = 0
  let totalCess = 0
  let totalGst = 0
  let totalCommission = 0
  let totalGstOnCommission = 0
  let totalDeliveryFees = 0
  let totalGstOnDelivery = 0
  let totalCodFee = 0
  let totalPlatformFee = 0
  let totalTds = 0
  let totalTcs = 0
  let totalSellerEarnings = 0
  let codOrders = 0
  let codRevenue = 0
  let onlineOrders = 0
  let onlineRevenue = 0
  let deliveredOrders = 0
  let cancelledOrders = 0
  let returnedOrders = 0

  const sellerMap = new Map<string, { sellerName: string; storeName: string; orderCount: number; grossSales: number; commission: number; netPayout: number }>()
  const monthlyMap = new Map<string, { revenue: number; commission: number; orders: number }>()
  const dailyMap = new Map<string, { revenue: number; commission: number; orders: number }>()

  for (const order of orders) {
    grossOrderValue += order.totalAmount || 0
    totalTaxableValue += order.totalTaxableValue || 0
    totalCgst += order.totalCgst || 0
    totalSgst += order.totalSgst || 0
    totalIgst += order.totalIgst || 0
    totalCess += order.totalCess || 0
    totalGst += order.totalGst || 0
    totalCommission += order.totalCommission || 0
    totalGstOnCommission += order.totalGstOnCommission || 0
    totalDeliveryFees += order.totalDeliveryCharge || 0
    totalGstOnDelivery += order.totalGstOnDelivery || 0
    totalCodFee += order.codFee || 0
    totalPlatformFee += order.platformFee || 0
    totalTds += order.totalTds || 0
    totalTcs += order.totalTcs || 0
    totalSellerEarnings += order.totalSellerEarnings || 0

    // Payment method split
    if (order.paymentMethod === 'cod') {
      codOrders++
      codRevenue += order.totalAmount || 0
    } else {
      onlineOrders++
      onlineRevenue += order.totalAmount || 0
    }

    // Order status counts
    const itemStatuses = (order.items as any[])?.map((i: any) => i.status) || []
    if (itemStatuses.every(s => s === 'Delivered')) deliveredOrders++
    if (itemStatuses.some(s => s === 'Cancelled')) cancelledOrders++
    if (itemStatuses.some(s => s === 'Return Completed')) returnedOrders++

    // Monthly breakdown
    const od = new Date(order.createdAt)
    const monthKey = `${od.getFullYear()}-${(od.getMonth() + 1).toString().padStart(2, '0')}`
    const monthEntry = monthlyMap.get(monthKey) || { revenue: 0, commission: 0, orders: 0 }
    monthEntry.revenue += order.totalAmount || 0
    monthEntry.commission += order.totalCommission || 0
    monthEntry.orders++
    monthlyMap.set(monthKey, monthEntry)

    // Daily breakdown
    const dayKey = `${od.getFullYear()}-${(od.getMonth() + 1).toString().padStart(2, '0')}-${od.getDate().toString().padStart(2, '0')}`
    const dayEntry = dailyMap.get(dayKey) || { revenue: 0, commission: 0, orders: 0 }
    dayEntry.revenue += order.totalAmount || 0
    dayEntry.commission += order.totalCommission || 0
    dayEntry.orders++
    dailyMap.set(dayKey, dayEntry)

    // Seller-wise breakdown
    for (const item of (order.items as any[]) || []) {
      const sid = item.sellerId?.toString()
      if (!sid) continue
      const entry = sellerMap.get(sid) || { sellerName: '', storeName: '', orderCount: 0, grossSales: 0, commission: 0, netPayout: 0 }
      entry.orderCount++
      entry.grossSales += item.taxableValue || item.total || 0
      entry.commission += item.commission || 0
      entry.netPayout += item.sellerEarnings || 0
      if (!entry.sellerName) entry.sellerName = item.sellerName || ''
      if (!entry.storeName) entry.storeName = item.storeName || ''
      sellerMap.set(sid, entry)
    }
  }

  // Get refunds in the period (refunds store createdAt as a Date object)
  const refunds = await db.collection('refunds').find({
    createdAt: { $gte: startDate, $lte: endDate },
    status: 'processed',
  }).toArray()
  const totalRefunds = refunds.reduce((sum, r) => sum + (r.amount || 0), 0)
  const refundCount = refunds.length

  // ── Calculate the platform's ACTUAL loss from refunds ──
  // The full refund amount (totalRefunds) is the customer's money returned,
  // which comes from the seller's earnings (product value) + the platform's
  // reversed commission/fees. The platform only loses the commission + GST
  // on commission + any platform/COD fees it had collected on the refunded
  // order. Subtracting the full refund from platform profit is incorrect
  // (it would make profit negative even when the platform is profitable).
  // This is how Flipkart/Amazon/Meesho calculate platform P&L.
  let refundImpactOnPlatform = 0
  const refundedOrderIds = [...new Set(refunds.map(r => r.orderId).filter(Boolean))]
  if (refundedOrderIds.length > 0) {
    const refundedOrders = await db.collection('orders').find({
      orderId: { $in: refundedOrderIds },
    }).toArray()
    const orderMap = new Map(refundedOrders.map(o => [o.orderId, o]))

    for (const refund of refunds) {
      const order = orderMap.get(refund.orderId)
      if (!order) continue

      if (refund.orderItemId && Array.isArray(order.items)) {
        // Item-level refund: reverse only that item's commission + GST
        const item = order.items.find((i: any) => i.id === refund.orderItemId || i._id === refund.orderItemId)
        if (item) {
          refundImpactOnPlatform += (item.commission || 0) + (item.gstOnCommission || 0)
        }
      } else {
        // Full order refund: reverse all commission + GST + platform fees
        refundImpactOnPlatform += (order.totalCommission || 0)
          + (order.totalGstOnCommission || 0)
          + (order.platformFee || 0)
          + (order.codFee || 0)
      }
    }
  }
  refundImpactOnPlatform = round2(refundImpactOnPlatform)

  // Get expenses in the period (expenses store date as a Date object)
  const expenses = await db.collection('expenses').find({
    date: { $gte: startDate, $lte: endDate },
    status: { $in: ['approved', 'paid'] },
  }).toArray()
  const platformExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)

  // Platform revenue = commission + GST on commission + COD fee + platform fee
  const platformRevenue = totalCommission + totalGstOnCommission + totalCodFee + totalPlatformFee
  // Platform profit = Platform revenue - commission/fees reversed due to refunds - operating expenses
  const platformProfit = platformRevenue - refundImpactOnPlatform - platformExpenses

  // Sort monthly breakdown
  const monthlyBreakdown = Array.from(monthlyMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // Sort daily breakdown chronologically
  const dailyBreakdown = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Sort seller-wise by grossSales desc
  const sellerWiseBreakdown = Array.from(sellerMap.entries())
    .map(([sellerId, data]) => ({ sellerId, ...data }))
    .sort((a, b) => b.grossSales - a.grossSales)

  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    grossOrderValue: round2(grossOrderValue),
    totalTaxableValue: round2(totalTaxableValue),
    totalGst: round2(totalGst),
    totalCgst: round2(totalCgst),
    totalSgst: round2(totalSgst),
    totalIgst: round2(totalIgst),
    totalCess: round2(totalCess),
    totalCommission: round2(totalCommission),
    totalGstOnCommission: round2(totalGstOnCommission),
    totalDeliveryFees: round2(totalDeliveryFees),
    totalGstOnDelivery: round2(totalGstOnDelivery),
    totalCodFee: round2(totalCodFee),
    totalPlatformFee: round2(totalPlatformFee),
    totalTds: round2(totalTds),
    totalTcs: round2(totalTcs),
    totalSellerEarnings: round2(totalSellerEarnings),
    totalRefunds: round2(totalRefunds),
    refundCount,
    platformRevenue: round2(platformRevenue),
    platformExpenses: round2(platformExpenses),
    platformProfit: round2(platformProfit),
    totalOrders: orders.length,
    deliveredOrders,
    cancelledOrders,
    returnedOrders,
    codOrders,
    codRevenue: round2(codRevenue),
    onlineOrders,
    onlineRevenue: round2(onlineRevenue),
    monthlyBreakdown,
    dailyBreakdown,
    sellerWiseBreakdown,
  }
}

/**
 * Generate a GST report (GSTR-1 style) for a date range.
 */
export async function generateGstReport(startDate: Date, endDate: Date): Promise<GstReport> {
  const { db } = await connectToDatabase()

  // Get platform GSTIN from settings
  const taxSettings = await db.collection('settings').findOne({ key: 'tax' })
  const platformGstin = taxSettings?.platformGstin || ''

  // Orders store createdAt as an ISO string (not a Date object)
  const startISO = startDate.toISOString()
  const endISO = endDate.toISOString()
  const orders = await db.collection('orders').find({
    createdAt: { $gte: startISO, $lte: endISO },
  }).toArray()

  let totalTaxableValue = 0
  let totalInvoiceValue = 0
  let cgst = 0
  let sgst = 0
  let igst = 0
  let cess = 0
  let gstOnCommission = 0
  let gstOnDelivery = 0

  const hsnMap = new Map<string, { hsn: string; description: string; quantity: number; taxableValue: number; gstRate: number; cgst: number; sgst: number; igst: number; totalGst: number }>()
  const stateMap = new Map<string, { state: string; intraState: boolean; taxableValue: number; cgst: number; sgst: number; igst: number }>()

  for (const order of orders) {
    totalInvoiceValue += order.totalAmount || 0

    for (const item of (order.items as any[]) || []) {
      const taxable = item.taxableValue || 0
      const qty = item.quantity || 1
      totalTaxableValue += taxable
      cgst += item.cgst || 0
      sgst += item.sgst || 0
      igst += item.igst || 0
      cess += item.cess || 0
      gstOnCommission += item.gstOnCommission || 0
      gstOnDelivery += item.gstOnDelivery || 0

      // HSN summary
      const hsn = item.hsnCode || 'UNKNOWN'
      const hsnEntry = hsnMap.get(hsn) || { hsn, description: item.productName || '', quantity: 0, taxableValue: 0, gstRate: item.gstRate || 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0 }
      hsnEntry.quantity += qty
      hsnEntry.taxableValue += taxable
      hsnEntry.cgst += item.cgst || 0
      hsnEntry.sgst += item.sgst || 0
      hsnEntry.igst += item.igst || 0
      hsnEntry.totalGst += (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0)
      hsnMap.set(hsn, hsnEntry)

      // State-wise summary (place of supply = customer state)
      const state = order.shippingAddress?.state || 'Unknown'
      const isIntra = !!item.isIntraState
      const stateEntry = stateMap.get(state) || { state, intraState: isIntra, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
      stateEntry.taxableValue += taxable
      stateEntry.cgst += item.cgst || 0
      stateEntry.sgst += item.sgst || 0
      stateEntry.igst += item.igst || 0
      stateMap.set(state, stateEntry)
    }
  }

  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    platformGstin,
    totalTaxableValue: round2(totalTaxableValue),
    totalInvoiceValue: round2(totalInvoiceValue),
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    cess: round2(cess),
    totalGst: round2(cgst + sgst + igst + cess),
    gstOnCommission: round2(gstOnCommission),
    gstOnDelivery: round2(gstOnDelivery),
    hsnSummary: Array.from(hsnMap.values()).map(h => ({
      ...h,
      taxableValue: round2(h.taxableValue),
      cgst: round2(h.cgst),
      sgst: round2(h.sgst),
      igst: round2(h.igst),
      totalGst: round2(h.totalGst),
    })).sort((a, b) => b.taxableValue - a.taxableValue),
    stateWiseSummary: Array.from(stateMap.values()).map(s => ({
      ...s,
      taxableValue: round2(s.taxableValue),
      cgst: round2(s.cgst),
      sgst: round2(s.sgst),
      igst: round2(s.igst),
    })).sort((a, b) => b.taxableValue - a.taxableValue),
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
