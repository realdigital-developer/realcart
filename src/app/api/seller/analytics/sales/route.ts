import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getSellerSalesReport, getDefaultDateRange } from '@/lib/analytics-engine'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/analytics/sales                                    */
/*  Returns the seller's sales trend + breakdown report.               */
/*  Query: ?startDate=ISO&endDate=ISO&groupBy=day|week|month           */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]

    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    const range = (startDate && endDate)
      ? { startDate, endDate }
      : getDefaultDateRange(30)

    const groupByParam = request.nextUrl.searchParams.get('groupBy')
    const validGroups: Array<'day' | 'week' | 'month'> = ['day', 'week', 'month']
    const groupBy: 'day' | 'week' | 'month' =
      groupByParam && validGroups.includes(groupByParam as 'day' | 'week' | 'month')
        ? (groupByParam as 'day' | 'week' | 'month')
        : 'day'

    const report = await getSellerSalesReport(sellerIds, range, groupBy)
    return NextResponse.json(report)
  } catch (error) {
    console.error('[Seller Analytics Sales] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate report', message: (error as Error).message },
      { status: 500 },
    )
  }
}
