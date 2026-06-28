/**
 * Admin Inventory Forecast API
 *
 * GET /api/admin/inventory/forecast
 *   Generate a demand forecast for a single product using a simple moving
 *   average of daily sales over the last `lookbackDays`, projected forward
 *   for `horizonDays`.
 *
 *   Query params:
 *     - productId (required)
 *     - lookbackDays (default 30, clamped to 1..365)
 *     - horizonDays (default 30, clamped to 1..365)
 *
 *   Returns: the forecast object { productId, dailyAvgSales, projectedDemand,
 *            currentStock, daysOfCover, recommendedReorderQty, history }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getInventoryForecast } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId') || ''
    if (!productId) {
      return NextResponse.json(
        { error: 'productId is required' },
        { status: 400 },
      )
    }

    const lookbackRaw = parseInt(searchParams.get('lookbackDays') || '30')
    const horizonRaw = parseInt(searchParams.get('horizonDays') || '30')
    const lookbackDays = Number.isFinite(lookbackRaw)
      ? Math.min(365, Math.max(1, lookbackRaw))
      : 30
    const horizonDays = Number.isFinite(horizonRaw)
      ? Math.min(365, Math.max(1, horizonRaw))
      : 30

    const forecast = await getInventoryForecast(productId, lookbackDays, horizonDays)

    return NextResponse.json(forecast)
  } catch (error) {
    console.error('[Admin Inventory Forecast] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate forecast', message: (error as Error).message },
      { status: 500 },
    )
  }
}
