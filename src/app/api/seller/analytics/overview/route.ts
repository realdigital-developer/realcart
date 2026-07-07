import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getSellerOverview, getDefaultDateRange } from '@/lib/analytics-engine'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/analytics/overview                                 */
/*  Returns the seller's high-level KPI overview report.               */
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

    const report = await getSellerOverview(sellerIds, range)
    return NextResponse.json(report)
  } catch (error) {
    console.error('[Seller Analytics Overview] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate report', message: (error as Error).message },
      { status: 500 },
    )
  }
}
