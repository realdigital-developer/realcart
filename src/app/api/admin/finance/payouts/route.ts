/**
 * Admin Finance — Seller Payouts API
 *
 * GET  /api/admin/finance/payouts
 *   Query params:
 *     - status    (optional: pending | processed | paid | failed)
 *     - sellerId  (optional)
 *     - page      (default 1)
 *     - limit     (default 20)
 *   Returns { payouts, total, page, limit } sorted by createdAt desc.
 *
 * POST /api/admin/finance/payouts
 *   Body: { sellerId: string }
 *   Creates a settlement for the seller (groups all unsettled delivered items
 *   into a single payout). Calls createSellerSettlement().
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { createSellerSettlement } from '@/lib/finance-management'

const VALID_STATUSES = ['pending', 'processed', 'paid', 'failed'] as const
type PayoutStatus = (typeof VALID_STATUSES)[number]

function isPayoutStatus(value: string | null): value is PayoutStatus {
  return value !== null && (VALID_STATUSES as readonly string[]).includes(value)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const sellerId = searchParams.get('sellerId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))

    const filter: Record<string, unknown> = {}
    if (isPayoutStatus(status)) {
      filter.status = status
    }
    if (sellerId) {
      // sellerId may be stored as either ObjectId or string; match both
      filter.$or = [
        { sellerId },
        ...(ObjectId.isValid(sellerId) ? [{ sellerId: new ObjectId(sellerId) }] : []),
      ]
    }

    const { db } = await connectToDatabase()

    const total = await db.collection('seller_payouts').countDocuments(filter)

    const payoutsRaw = await db.collection('seller_payouts')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const payouts = payoutsRaw.map((p) => {
      const { _payoutObjId, ...rest } = p as Record<string, unknown>
      return {
        ...rest,
        _id: (p as { _id: ObjectId })._id.toString(),
      }
    })

    return NextResponse.json({ payouts, total, page, limit })
  } catch (error) {
    console.error('[Admin Finance Payouts GET Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to fetch payouts', detail: message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { sellerId } = body as { sellerId?: string }
    if (!sellerId || typeof sellerId !== 'string' || sellerId.trim().length === 0) {
      return NextResponse.json({ error: 'sellerId is required' }, { status: 400 })
    }

    const result = await createSellerSettlement({
      sellerId: sellerId.trim(),
      processedBy: session.id,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create settlement' },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { success: true, payoutId: result.payoutId, payout: result.payout },
      { status: 201 },
    )
  } catch (error) {
    console.error('[Admin Finance Payouts POST Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to create settlement', detail: message },
      { status: 500 },
    )
  }
}
