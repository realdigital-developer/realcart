/**
 * Admin Finance — Revenue Report API
 *
 * GET /api/admin/finance/revenue
 *   Query params:
 *     - startDate (ISO string, optional, default: first day of current month)
 *     - endDate   (ISO string, optional, default: now)
 *   Returns the comprehensive RevenueReport (gross order value, GST, commission,
 *   TDS, TCS, seller earnings, refunds, platform profit, monthly & seller breakdowns).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { generateRevenueReport } from '@/lib/finance-management'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')

    const startDate = startDateStr ? new Date(startDateStr) : firstDayOfMonth
    const endDate = endDateStr ? new Date(endDateStr) : now

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid startDate or endDate format. Expected ISO string.' },
        { status: 400 },
      )
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: 'startDate cannot be after endDate' },
        { status: 400 },
      )
    }

    const report = await generateRevenueReport(startDate, endDate)

    return NextResponse.json(report)
  } catch (error) {
    console.error('[Admin Finance Revenue GET Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to generate revenue report', detail: message },
      { status: 500 },
    )
  }
}
