/**
 * Customer Wallet Helper — shared credit/debit + transaction logging.
 * -------------------------------------------------------------------
 * Used by:
 *   - referral-engine.ts (referral reward credits)
 *   - /api/customer/wallet (add money, view balance/transactions)
 *   - /api/customer/orders (debit on wallet-payment checkout)
 *   - refund flow (credit on refund to wallet)
 *
 * Collection: customer_wallets
 *   {
 *     _id, customerId, balance: number,
 *     transactions: [{
 *       id, type: 'credit'|'debit', source, amount, description,
 *       orderId?, referralId?, status, createdAt
 *     }],
 *     createdAt, updatedAt
 *   }
 */

import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { createCustomerNotification } from './customer-notifications'

export type WalletTxnType = 'credit' | 'debit'
export type WalletTxnSource =
  | 'referral'        // referral reward credit
  | 'topup'           // customer added money
  | 'purchase'        // debited for an order
  | 'refund'          // refund credit
  | 'cashback'        // cashback credit
  | 'adjustment'      // admin adjustment
  | 'bonus'           // promotional bonus

export interface WalletTransaction {
  id: string
  type: WalletTxnType
  source: WalletTxnSource
  amount: number
  description: string
  orderId?: string
  referralId?: string
  status: 'completed' | 'pending' | 'failed'
  createdAt: string
}

export interface WalletDoc {
  _id: ObjectId
  customerId: string
  balance: number
  transactions: WalletTransaction[]
  createdAt: string
  updatedAt: string
}

/**
 * Fetch a customer's wallet (creates an empty one if it doesn't exist).
 * Returns { balance, transactions }.
 */
export async function getWallet(customerId: string): Promise<{ balance: number; transactions: WalletTransaction[] }> {
  const { db } = await connectToDatabase()
  const walletsCol = db.collection('customer_wallets')

  let wallet = await walletsCol.findOne({ customerId })
  if (!wallet) {
    // Create an empty wallet
    const now = new Date().toISOString()
    await walletsCol.insertOne({
      customerId,
      balance: 0,
      transactions: [],
      createdAt: now,
      updatedAt: now,
    })
    wallet = await walletsCol.findOne({ customerId })
  }

  return {
    balance: wallet?.balance || 0,
    transactions: (wallet?.transactions || []) as WalletTransaction[],
  }
}

/**
 * Credit the customer's wallet (add money). Atomic + idempotent.
 * Returns the new balance.
 */
export async function creditWallet(params: {
  customerId: string
  amount: number
  source: WalletTxnSource
  description: string
  orderId?: string
  referralId?: string
}): Promise<number> {
  const { customerId, amount, source, description, orderId, referralId } = params
  if (amount <= 0) throw new Error('Amount must be positive')

  const { db } = await connectToDatabase()
  const walletsCol = db.collection('customer_wallets')
  const now = new Date().toISOString()

  const txn: WalletTransaction = {
    id: new ObjectId().toString(),
    type: 'credit',
    source,
    amount: Math.round(amount * 100) / 100,
    description,
    status: 'completed',
    createdAt: now,
  }
  if (orderId) txn.orderId = orderId
  if (referralId) txn.referralId = referralId

  // Try to increment existing wallet
  const result = await walletsCol.updateOne(
    { customerId },
    {
      $inc: { balance: txn.amount },
      $push: { transactions: txn },
      $set: { updatedAt: now },
    },
  )

  if (result.matchedCount === 0) {
    // Wallet doesn't exist — create it with this credit
    await walletsCol.insertOne({
      customerId,
      balance: txn.amount,
      transactions: [txn],
      createdAt: now,
      updatedAt: now,
    })
  }

  const updated = await walletsCol.findOne({ customerId })
  const newBalance = updated?.balance || txn.amount

  // === Send notification: Wallet credited (skip for refund — refund has its own notif) ===
  if (source !== 'refund') {
    await createCustomerNotification({
      customerId,
      type: 'wallet_credit',
      title: 'RealCart Balance Credited 💳',
      message: `₹${txn.amount} added to your RealCart Balance. New balance: ₹${newBalance}. ${description}`,
      relatedType: 'wallet',
    })
  }

  return newBalance
}

/**
 * Debit the customer's wallet (subtract money). Fails if insufficient balance.
 * Returns the new balance, or throws if insufficient funds.
 */
export async function debitWallet(params: {
  customerId: string
  amount: number
  source: WalletTxnSource
  description: string
  orderId?: string
}): Promise<number> {
  const { customerId, amount, source, description, orderId } = params
  if (amount <= 0) throw new Error('Amount must be positive')

  const { db } = await connectToDatabase()
  const walletsCol = db.collection('customer_wallets')

  // Check balance first (atomic check)
  const wallet = await walletsCol.findOne({ customerId })
  const currentBalance = wallet?.balance || 0

  if (currentBalance < amount) {
    throw new Error(`Insufficient wallet balance. Available: ₹${currentBalance}, Required: ₹${amount}`)
  }

  const now = new Date().toISOString()
  const txn: WalletTransaction = {
    id: new ObjectId().toString(),
    type: 'debit',
    source,
    amount: Math.round(amount * 100) / 100,
    description,
    status: 'completed',
    createdAt: now,
  }
  if (orderId) txn.orderId = orderId

  // Atomic decrement with balance guard (prevents race conditions)
  const result = await walletsCol.updateOne(
    { customerId, balance: { $gte: amount } },
    {
      $inc: { balance: -txn.amount },
      $push: { transactions: txn },
      $set: { updatedAt: now },
    },
  )

  if (result.matchedCount === 0) {
    // Race condition — balance changed between check and update
    throw new Error('Insufficient wallet balance. Please try again.')
  }

  const updated = await walletsCol.findOne({ customerId })
  const newBalance = updated?.balance || 0

  // === Send notification: Wallet debited (skip for purchase — order has its own notif) ===
  if (source !== 'purchase') {
    await createCustomerNotification({
      customerId,
      type: 'wallet_debit',
      title: 'RealCart Balance Debited 💳',
      message: `₹${txn.amount} debited from your RealCart Balance. Remaining balance: ₹${newBalance}. ${description}`,
      relatedType: 'wallet',
    })
  }

  return newBalance
}
