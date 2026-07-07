/**
 * Admin Inventory Dead-Stock API
 *
 * GET /api/admin/inventory/dead-stock
 *   Identify slow-moving / dead stock: products with zero sales in the last
 *   `daysThreshold` days that still carry stock.
 *
 *   Query params:
 *     - daysThreshold (default 90, clamped to 1..3650)
 *     - sellerId (optional)
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *
 *   Returns: { products, total }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getDeadStockProducts } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sellerId = searchParams.get('sellerId') || ''
    const daysThresholdRaw = parseInt(searchParams.get('daysThreshold') || '90')
    const daysThreshold = Number.isFinite(daysThresholdRaw)
      ? Math.min(3650, Math.max(1, daysThresholdRaw))
      : 90
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const result = await getDeadStockProducts(
      sellerId ? [sellerId] : undefined,
      daysThreshold,
      page,
      limit,
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Admin Inventory Dead-Stock] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dead-stock products', message: (error as Error).message },
      { status: 500 },
    )
  }
}
