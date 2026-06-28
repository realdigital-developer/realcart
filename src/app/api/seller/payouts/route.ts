import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/payouts                                            */
/*  Lists the authenticated seller's payouts with pagination + a      */
/*  summary of total earnings / pending / paid-out.                    */
/* ------------------------------------------------------------------ */

const PENDING_PAYOUT_STATUSES = ['pending', 'processed']

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') // optional filter
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)))

    const { db } = await connectToDatabase()

    // Build seller identifiers to match — string id, ObjectId variant, and
    // legacy aliases (storeName / personal name) for older payout records.
    const sellerIds: Array<string | ObjectId> = [session.id, ...session.sellerAliases]
    try {
      if (ObjectId.isValid(session.id)) {
        sellerIds.push(new ObjectId(session.id))
      }
    } catch {
      // session.id is not a valid ObjectId — skip
    }

    // Build the query for the paginated list
    const query: Record<string, unknown> = { sellerId: { $in: sellerIds } }
    if (status) {
      query.status = status
    }

    const total = await db.collection('seller_payouts').countDocuments(query)

    const skip = (page - 1) * limit
    const payoutsRaw = await db.collection('seller_payouts')
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    const round2 = (n: number) => Math.round((n || 0) * 100) / 100

    const payouts = payoutsRaw.map((p: Record<string, unknown>) => ({
      payoutId: p.payoutId,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      grossOrderValue: round2(p.grossOrderValue as number),
      commission: round2(p.commission as number),
      gstOnCommission: round2(p.gstOnCommission as number),
      tdsDeducted: round2(p.tdsDeducted as number),
      tcsCollected: round2(p.tcsCollected as number),
      netPayout: round2(p.netPayout as number),
      status: p.status,
      orderIds: p.orderIds || [],
      processedAt: p.processedAt || null,
      paidAt: p.paidAt || null,
      transactionRef: p.transactionRef || null,
      createdAt: p.createdAt,
    }))

    // Compute summary across ALL of the seller's payouts (ignores status filter
    // and pagination so the cards always reflect the full picture).
    const summaryAgg = await db.collection('seller_payouts').aggregate([
      { $match: { sellerId: { $in: sellerIds } } },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: { $ifNull: ['$netPayout', 0] } },
          pendingPayouts: {
            $sum: {
              $cond: [
                { $in: ['$status', PENDING_PAYOUT_STATUSES] },
                { $ifNull: ['$netPayout', 0] },
                0,
              ],
            },
          },
          paidOut: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'paid'] },
                { $ifNull: ['$netPayout', 0] },
                0,
              ],
            },
          },
          pendingCount: {
            $sum: {
              $cond: [{ $in: ['$status', PENDING_PAYOUT_STATUSES] }, 1, 0],
            },
          },
        },
      },
    ]).toArray()

    const s = summaryAgg[0] || {}
    const summary = {
      totalEarnings: round2(s.totalEarnings as number),
      pendingPayouts: round2(s.pendingPayouts as number),
      paidOut: round2(s.paidOut as number),
      pendingCount: s.pendingCount || 0,
    }

    return NextResponse.json({
      payouts,
      total,
      page,
      limit,
      summary,
    })
  } catch (error) {
    console.error('[Seller Payouts GET Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch payouts' },
      { status: 500 }
    )
  }
}
