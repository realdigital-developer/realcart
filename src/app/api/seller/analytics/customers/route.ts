import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getSellerCustomerReport, getDefaultDateRange } from '@/lib/analytics-engine'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/analytics/customers                                */
/*  Returns the seller's customer analytics report.                    */
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

    const report = await getSellerCustomerReport(sellerIds, range)
    return NextResponse.json(report)
  } catch (error) {
    console.error('[Seller Analytics Customers] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate report', message: (error as Error).message },
      { status: 500 },
    )
  }
}
