/**
 * Admin Finance — Transactions Ledger API
 *
 * GET /api/admin/finance/transactions
 *   Query params:
 *     - type      (optional: order_payment | commission_earned | gst_collected |
 *                          tds_deducted | tcs_collected | delivery_earned |
 *                          cod_fee | platform_fee | seller_payout |
 *                          refund_issued | expense | adjustment)
 *     - sellerId  (optional)
 *     - orderId   (optional)
 *     - startDate (ISO string, optional)
 *     - endDate   (ISO string, optional)
 *     - page      (default 1)
 *     - limit     (default 20)
 *   Returns { transactions, total, page, limit } sorted by date desc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'

const VALID_TYPES = [
  'order_payment',
  'commission_earned',
  'gst_collected',
  'tds_deducted',
  'tcs_collected',
  'delivery_earned',
  'cod_fee',
  'platform_fee',
  'seller_payout',
  'refund_issued',
  'expense',
  'adjustment',
] as const
type TxnType = (typeof VALID_TYPES)[number]

function isTxnType(value: string | null): value is TxnType {
  return value !== null && (VALID_TYPES as readonly string[]).includes(value)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const sellerId = searchParams.get('sellerId')
    const orderId = searchParams.get('orderId')
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))

    const filter: Record<string, unknown> = {}
    if (isTxnType(type)) {
      filter.type = type
    }
    if (orderId) {
      filter.orderId = orderId
    }
    if (sellerId) {
      filter.$or = [
        { sellerId },
        ...(ObjectId.isValid(sellerId) ? [{ sellerId: new ObjectId(sellerId) }] : []),
      ]
    }

    if (startDateStr || endDateStr) {
      const dateFilter: Record<string, unknown> = {}
      if (startDateStr) {
        const start = new Date(startDateStr)
        if (!isNaN(start.getTime())) dateFilter.$gte = start
      }
      if (endDateStr) {
        const end = new Date(endDateStr)
        if (!isNaN(end.getTime())) dateFilter.$lte = end
      }
      if (Object.keys(dateFilter).length > 0) {
        filter.date = dateFilter
      }
    }

    const { db } = await connectToDatabase()

    const total = await db.collection('transactions').countDocuments(filter)

    const txnsRaw = await db.collection('transactions')
      .find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const transactions = txnsRaw.map((t) => {
      const { _id, ...rest } = t as Record<string, unknown>
      // Round monetary amount to 2 decimal places for display
      if (typeof rest.amount === 'number') {
        rest.amount = Math.round((rest.amount as number) * 100) / 100
      }
      return {
        ...rest,
        _id: (_id as ObjectId).toString(),
      }
    })

    return NextResponse.json({ transactions, total, page, limit })
  } catch (error) {
    console.error('[Admin Finance Transactions GET Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', detail: message },
      { status: 500 },
    )
  }
}
