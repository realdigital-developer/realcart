/**
 * Seller Inventory Dead-Stock API
 *
 * GET /api/seller/inventory/dead-stock
 *   Returns products owned by the authenticated seller that have had zero sales
 *   (order movements) in the last `daysThreshold` days and still hold stock > 0.
 *
 *   Query params:
 *     - daysThreshold (default 90)
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *
 *   Response: { products, total }
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getDeadStockProducts } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]
    const { searchParams } = new URL(request.url)
    const daysThreshold = Math.max(1, parseInt(searchParams.get('daysThreshold') || '90'))
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const result = await getDeadStockProducts(sellerIds, daysThreshold, page, limit)

    return NextResponse.json({
      products: result.products,
      total: result.total,
    })
  } catch (error) {
    console.error('[Seller Inventory Dead Stock] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dead stock', message: (error as Error).message },
      { status: 500 },
    )
  }
}
