import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/transactions                                       */
/*  Lists the seller's ledger entries with optional type/date filters  */
/*  and a summary of inflow / outflow / net balance.                   */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') // optional transaction type filter
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)))

    const { db } = await connectToDatabase()

    // Build seller identifiers to match — string id, ObjectId variant, and
    // legacy aliases (storeName / personal name) for older ledger entries.
    const sellerIds: Array<string | ObjectId> = [session.id, ...session.sellerAliases]
    try {
      if (ObjectId.isValid(session.id)) {
        sellerIds.push(new ObjectId(session.id))
      }
    } catch {
      // session.id is not a valid ObjectId — skip
    }

    // Build query
    const query: Record<string, unknown> = { sellerId: { $in: sellerIds } }
    if (type) {
      query.type = type
    }
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {}
      if (startDate) dateFilter.$gte = new Date(startDate)
      if (endDate) {
        // Include the entire end day
        const e = new Date(endDate)
        e.setUTCHours(23, 59, 59, 999)
        dateFilter.$lte = e
      }
      query.date = dateFilter
    }

    const total = await db.collection('transactions').countDocuments(query)

    const skip = (page - 1) * limit
    const txnsRaw = await db.collection('transactions')
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    const round2 = (n: number) => Math.round((n || 0) * 100) / 100

    const transactions = txnsRaw.map((t: Record<string, unknown>) => ({
      _id: (t._id as { toString(): string })?.toString(),
      transactionId: t.transactionId,
      type: t.type,
      subType: t.subType || null,
      orderId: t.orderId || null,
      orderItemId: t.orderItemId || null,
      payoutId: t.payoutId || null,
      refundId: t.refundId || null,
      sellerId: t.sellerId,
      customerId: t.customerId || null,
      amount: round2(t.amount as number),
      description: t.description,
      paymentMethod: t.paymentMethod || null,
      gatewayRef: t.gatewayRef || null,
      status: t.status,
      date: t.date,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))

    // Summary across ALL matching transactions (respecting type + date filters
    // but NOT pagination), so the totals reflect the current filter view.
    const summaryAgg = await db.collection('transactions').aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalInflow: {
            $sum: {
              $cond: [{ $gt: [{ $ifNull: ['$amount', 0] }, 0] }, { $ifNull: ['$amount', 0] }, 0],
            },
          },
          totalOutflow: {
            $sum: {
              $cond: [{ $lt: [{ $ifNull: ['$amount', 0] }, 0] }, { $ifNull: ['$amount', 0] }, 0],
            },
          },
        },
      },
    ]).toArray()

    const s = summaryAgg[0] || {}
    const totalInflow = round2(s.totalInflow as number)
    const totalOutflow = round2(s.totalOutflow as number)

    return NextResponse.json({
      transactions,
      total,
      page,
      limit,
      summary: {
        totalInflow,
        totalOutflow,
        netBalance: round2(totalInflow + totalOutflow),
      },
    })
  } catch (error) {
    console.error('[Seller Transactions GET Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}
