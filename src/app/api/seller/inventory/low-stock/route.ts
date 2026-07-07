/**
 * Seller Low-Stock API
 *
 * GET /api/seller/inventory/low-stock
 *   Returns the seller's low-stock and out-of-stock products.
 *
 *   Query params:
 *     - page (default 1)
 *     - limit (default 50)
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getLowStockProducts } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const result = await getLowStockProducts(sellerIds, page, limit)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Seller Low Stock] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch low stock products', message: (error as Error).message },
      { status: 500 },
    )
  }
}
