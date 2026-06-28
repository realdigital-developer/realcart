/**
 * Admin Analytics — Sales Report API
 *
 * GET /api/admin/analytics/sales
 *   Query params:
 *     - startDate (ISO string, optional, default: 30 days ago)
 *     - endDate   (ISO string, optional, default: now)
 *     - groupBy   ('day' | 'week' | 'month', optional, default: 'day')
 *   Returns the full SalesReport (revenue & order trends with comparison,
 *   refunds, AOV, items sold, period-over-period growth).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getSalesReport, getDefaultDateRange } from '@/lib/analytics-engine'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const groupByParam = searchParams.get('groupBy')

    const groupBy: 'day' | 'week' | 'month' =
      groupByParam === 'week' || groupByParam === 'month' ? groupByParam : 'day'

    const range = (startDate && endDate)
      ? { startDate, endDate }
      : getDefaultDateRange(30)

    const report = await getSalesReport(range, groupBy)
    return NextResponse.json(report)
  } catch (error) {
    console.error('[Admin Analytics Sales] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to generate sales report', detail: message },
      { status: 500 },
    )
  }
}
