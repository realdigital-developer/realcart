import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/tax-statement                                      */
/*  Generates a tax statement for the seller for a date range.         */
/*  Defaults to the current Indian financial year (Apr 1 – Mar 31).    */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const round2 = (n: number) => Math.round((n || 0) * 100) / 100

/**
 * Returns the [start, end] of the Indian financial year that contains `date`.
 * FY runs April 1 → March 31. e.g. today = 2024-06-15 → FY 2024-25 →
 * start = 2024-04-01, end = 2025-03-31.
 */
function getFinancialYearRange(date: Date): { start: Date; end: Date } {
  const year = date.getFullYear()
  const month = date.getMonth() // 0 = January
  const fyStartYear = month < 3 ? year - 1 : year // April is month index 3
  const start = new Date(fyStartYear, 3, 1, 0, 0, 0, 0) // Apr 1 00:00:00
  const end = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999) // Mar 31 23:59:59.999
  return { start, end }
}

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const searchParams = request.nextUrl.searchParams
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    // Default to current financial year
    const fyRange = getFinancialYearRange(new Date())
    const startDate = startDateParam ? new Date(startDateParam) : fyRange.start
    const endDate = endDateParam
      ? (() => {
          const e = new Date(endDateParam)
          e.setUTCHours(23, 59, 59, 999)
          return e
        })()
      : fyRange.end

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid startDate or endDate' },
        { status: 400 }
      )
    }

    const { db } = await connectToDatabase()

    // ---- Seller identifiers (string id + ObjectId + legacy aliases) ----
    const sellerIds: Array<string | ObjectId> = [session.id, ...session.sellerAliases]
    try {
      if (ObjectId.isValid(session.id)) {
        sellerIds.push(new ObjectId(session.id))
      }
    } catch {
      // session.id is not a valid ObjectId — skip
    }

    // ---- Fetch seller document for GSTIN / PAN ----
    let seller: Record<string, unknown> | null = null
    try {
      seller = await db.collection('sellers').findOne(
        { _id: new ObjectId(session.id) },
        { projection: { name: 1, storeName: 1, gstNumber: 1, panNumber: 1 } }
      )
    } catch {
      // _id might be stored as a string
    }
    if (!seller) {
      seller = await db.collection('sellers').findOne(
        { _id: session.id as unknown as string },
        { projection: { name: 1, storeName: 1, gstNumber: 1, panNumber: 1 } }
      )
    }

    const sellerInfo = {
      name: (seller?.name as string) || session.name || '',
      storeName: (seller?.storeName as string) || session.storeName || '',
      gstNumber: (seller?.gstNumber as string) || '',
      panNumber: (seller?.panNumber as string) || '',
    }

    // ---- Aggregate order items for this seller in the date range ----
    // Match orders that have at least one item from this seller AND were
    // created in the date range, then unwind + re-filter to seller's items.
    const matchStage = {
      'items.sellerId': { $in: sellerIds },
      createdAt: { $gte: startDate, $lte: endDate },
    }

    const [aggResult] = await db.collection('orders').aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      { $match: { 'items.sellerId': { $in: sellerIds } } },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalTaxableValue: { $sum: { $ifNull: ['$items.taxableValue', { $ifNull: ['$items.total', 0] }] } },
                totalCgst: { $sum: { $ifNull: ['$items.cgst', 0] } },
                totalSgst: { $sum: { $ifNull: ['$items.sgst', 0] } },
                totalIgst: { $sum: { $ifNull: ['$items.igst', 0] } },
                totalTds: { $sum: { $ifNull: ['$items.tdsAmount', 0] } },
                totalTcs: { $sum: { $ifNull: ['$items.tcsAmount', 0] } },
                totalCommission: { $sum: { $ifNull: ['$items.commission', 0] } },
                totalGstOnCommission: { $sum: { $ifNull: ['$items.gstOnCommission', 0] } },
                orderCount: { $addToSet: '$orderId' },
              },
            },
          ],
          monthly: [
            // Extract year + month from the order's createdAt ISO string
            {
              $addFields: {
                dateStr: { $toString: '$createdAt' },
              },
            },
            {
              $addFields: {
                year: { $toInt: { $substr: ['$dateStr', 0, 4] } },
                month: { $toInt: { $substr: ['$dateStr', 5, 2] } },
              },
            },
            {
              $group: {
                _id: { year: '$year', month: '$month' },
                taxableValue: {
                  $sum: { $ifNull: ['$items.taxableValue', { $ifNull: ['$items.total', 0] }] },
                },
                cgst: { $sum: { $ifNull: ['$items.cgst', 0] } },
                sgst: { $sum: { $ifNull: ['$items.sgst', 0] } },
                igst: { $sum: { $ifNull: ['$items.igst', 0] } },
                tds: { $sum: { $ifNull: ['$items.tdsAmount', 0] } },
                tcs: { $sum: { $ifNull: ['$items.tcsAmount', 0] } },
                commission: { $sum: { $ifNull: ['$items.commission', 0] } },
              },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
          ],
        },
      },
    ]).toArray()

    const summaryRow = aggResult?.summary?.[0] || {}
    const totalCgst = round2(summaryRow.totalCgst as number)
    const totalSgst = round2(summaryRow.totalSgst as number)
    const totalIgst = round2(summaryRow.totalIgst as number)
    const totalGst = round2(totalCgst + totalSgst + totalIgst)

    const summary = {
      totalTaxableValue: round2(summaryRow.totalTaxableValue as number),
      totalGst,
      totalCgst,
      totalSgst,
      totalIgst,
      totalTds: round2(summaryRow.totalTds as number),
      totalTcs: round2(summaryRow.totalTcs as number),
      totalCommission: round2(summaryRow.totalCommission as number),
      totalGstOnCommission: round2(summaryRow.totalGstOnCommission as number),
    }

    const orderCount = (summaryRow.orderCount as unknown[])?.length || 0

    // ---- Build monthly breakdown (fill missing months with zeros) ----
    const monthlyMap = new Map<string, {
      taxableValue: number
      gst: number
      tds: number
      tcs: number
      commission: number
    }>()
    for (const m of aggResult?.monthly || []) {
      const key = `${m._id.year}-${m._id.month}`
      const gst = round2((m.cgst || 0) + (m.sgst || 0) + (m.igst || 0))
      monthlyMap.set(key, {
        taxableValue: round2(m.taxableValue as number),
        gst,
        tds: round2(m.tds as number),
        tcs: round2(m.tcs as number),
        commission: round2(m.commission as number),
      })
    }

    // Walk month-by-month from startDate to endDate so the report shows every
    // month in the range (zero-filled when no data).
    const monthlyBreakdown: Array<{
      month: string
      year: number
      taxableValue: number
      gst: number
      tds: number
      tcs: number
      commission: number
    }> = []
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    while (cursor <= endDate) {
      const year = cursor.getFullYear()
      const monthIdx = cursor.getMonth() // 0-11
      const monthNumber = monthIdx + 1
      const key = `${year}-${monthNumber}`
      const data = monthlyMap.get(key)
      monthlyBreakdown.push({
        month: MONTH_NAMES[monthIdx],
        year,
        taxableValue: data?.taxableValue || 0,
        gst: data?.gst || 0,
        tds: data?.tds || 0,
        tcs: data?.tcs || 0,
        commission: data?.commission || 0,
      })
      // Advance to the first day of the next month
      cursor.setMonth(cursor.getMonth() + 1)
    }

    return NextResponse.json({
      seller: sellerInfo,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      summary,
      monthlyBreakdown,
      orderCount,
    })
  } catch (error) {
    console.error('[Seller Tax Statement GET Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate tax statement' },
      { status: 500 }
    )
  }
}
