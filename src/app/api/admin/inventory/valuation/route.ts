/**
 * Admin Inventory Valuation API
 *
 * GET /api/admin/inventory/valuation
 *   Build a per-product inventory valuation report at cost / selling / MRP.
 *
 *   Query params:
 *     - sellerId (optional)  — restrict to a single seller
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *
 *   Returns: { products, total, totals }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getInventoryValuation } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sellerId = searchParams.get('sellerId') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const result = await getInventoryValuation(
      sellerId ? [sellerId] : undefined,
      page,
      limit,
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Admin Inventory Valuation] Error:', error)
    return NextResponse.json(
      { error: 'Failed to build valuation report', message: (error as Error).message },
      { status: 500 },
    )
  }
}
