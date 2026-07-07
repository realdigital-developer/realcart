/**
 * Seller Inventory Valuation API
 *
 * GET /api/seller/inventory/valuation
 *   Returns the inventory valuation report for the authenticated seller.
 *
 *   Query params:
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *
 *   Response: { products, total, totals }
 *     - products: per-product stock value at cost / selling / MRP
 *     - totals:   aggregated stockValueCost, stockValueSelling, stockValueMrp,
 *                 potentialProfit, totalUnits for the current page
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getInventoryValuation } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const result = await getInventoryValuation(sellerIds, page, limit)

    return NextResponse.json({
      products: result.products,
      total: result.total,
      totals: result.totals,
    })
  } catch (error) {
    console.error('[Seller Inventory Valuation] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory valuation', message: (error as Error).message },
      { status: 500 },
    )
  }
}
