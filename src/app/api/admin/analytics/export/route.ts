/**
 * Admin Analytics — CSV Export API
 *
 * GET /api/admin/analytics/export
 *   Query params:
 *     - type      ('sales' | 'customers' | 'products' | 'sellers' | 'overview', required)
 *     - startDate (ISO string, optional, default: 30 days ago)
 *     - endDate   (ISO string, optional, default: now)
 *   Generates a CSV download of the requested report type.
 *   Returns a text/csv Response with Content-Disposition attachment header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import {
  getAdminOverview,
  getSalesReport,
  getCustomerReport,
  getProductReport,
  getDefaultDateRange,
  salesReportToCSV,
  customerTopToCSV,
  productTopToCSV,
  overviewTopSellersToCSV,
} from '@/lib/analytics-engine'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['sales', 'customers', 'products', 'sellers', 'overview'] as const
type ExportType = (typeof VALID_TYPES)[number]

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')

    if (!typeParam || !VALID_TYPES.includes(typeParam as ExportType)) {
      return NextResponse.json(
        {
          error: 'Invalid or missing "type" parameter',
          validTypes: VALID_TYPES,
        },
        { status: 400 },
      )
    }

    const type = typeParam as ExportType
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const range = (startDate && endDate)
      ? { startDate, endDate }
      : getDefaultDateRange(30)

    let csv = ''
    let filename = 'report.csv'

    switch (type) {
      case 'sales': {
        const report = await getSalesReport(range, 'day')
        csv = salesReportToCSV(report)
        filename = 'sales-report.csv'
        break
      }
      case 'customers': {
        const report = await getCustomerReport(range)
        csv = customerTopToCSV(report)
        filename = 'top-customers.csv'
        break
      }
      case 'products': {
        const report = await getProductReport(range)
        csv = productTopToCSV(report)
        filename = 'top-products.csv'
        break
      }
      case 'sellers': {
        const report = await getAdminOverview(range)
        csv = overviewTopSellersToCSV(report)
        filename = 'top-sellers.csv'
        break
      }
      case 'overview': {
        const report = await getAdminOverview(range)
        csv = overviewTopSellersToCSV(report)
        filename = 'overview-top-sellers.csv'
        break
      }
    }

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[Admin Analytics Export] Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to export report', detail: message },
      { status: 500 },
    )
  }
}
