/**
 * Admin Analytics — Customer Report API
 *
 * GET /api/admin/analytics/customers
 *   Query params:
 *     - startDate (ISO string, optional, default: 30 days ago)
 *     - endDate   (ISO string, optional, default: now)
 *   Returns the full CustomerReport (new vs returning, LTV, repeat rate,
 *   top customers, cohort distribution, period-over-period growth).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getCustomerReport, getDefaultDateRange } from '@/lib/analytics-engine'

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

    const range = (startDate && endDate)
      ? { startDate, endDate }
      : getDefaultDateRange(30)

    const report = await getCustomerReport(range)
    return NextResponse.json(report)
  } catch (error) {
    console.error('[Admin Analytics Customers] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to generate customer report', detail: message },
      { status: 500 },
    )
  }
}
