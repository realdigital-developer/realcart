/**
 * Customer Wallet (RealCart Balance) API
 * -------------------------------------------------------------------
 * GET   /api/customer/wallet          — fetch balance + transaction history
 *
 * Meesho-style behavior: customers CANNOT manually add/load money to
 * their wallet. The balance only grows from:
 *   - Referral rewards (via referral-engine.ts → creditWallet)
 *   - Promotional cashback / bonuses (admin-issued → creditWallet)
 *   - Refunds (cancelled/returned orders → creditWallet)
 *
 * The balance can be SPENT at checkout via POST /api/customer/wallet/pay
 * (separate endpoint — debits the wallet for an order purchase).
 *
 * MongoDB collection: customer_wallets
 *   { _id, customerId, balance, transactions[], createdAt, updatedAt }
 *
 * Each transaction:
 *   { id, type: 'credit'|'debit', source, amount, description,
 *     orderId?, referralId?, status, createdAt }
 */

import { NextResponse } from 'next/server'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { getWallet } from '@/lib/wallet-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── GET: wallet balance + transaction history ──
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { balance, transactions } = await getWallet(customer.id)

    // Sort transactions newest-first for display
    const sortedTxns = [...transactions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    return NextResponse.json({
      balance,
      transactions: sortedTxns.map((t) => ({
        id: t.id,
        type: t.type,
        source: t.source,
        amount: t.amount,
        description: t.description,
        orderId: t.orderId || null,
        referralId: t.referralId || null,
        status: t.status,
        createdAt: t.createdAt,
      })),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/wallet] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch wallet data' }, { status: 500 })
  }
}

// NOTE: There is NO POST handler here. Customers cannot manually add money
// to their RealCart Balance (Meesho-style). Balance is only credited from:
//   - Referral rewards (referral-engine.ts)
//   - Promotional cashback / bonuses (admin-issued)
//   - Refunds (order cancellation / return)
// To SPEND the balance at checkout, use POST /api/customer/wallet/pay
// (separate endpoint that debits the wallet for an order purchase).
