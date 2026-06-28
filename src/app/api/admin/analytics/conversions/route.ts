/**
 * Admin Analytics — Conversion Funnel Report API
 *
 * GET /api/admin/analytics/conversions
 *   Query params:
 *     - startDate (ISO string, optional, default: 30 days ago)
 *     - endDate   (ISO string, optional, default: now)
 *   Returns the full ConversionReport (visits → product views → cart → checkout
 *   → orders funnel, conversion rates, drop-off, period-over-period comparison).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getConversionReport, getDefaultDateRange } from '@/lib/analytics-engine'

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

    const report = await getConversionReport(range)
    return NextResponse.json(report)
  } catch (error) {
    console.error('[Admin Analytics Conversions] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to generate conversion report', detail: message },
      { status: 500 },
    )
  }
}
