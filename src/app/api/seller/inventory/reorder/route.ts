/**
 * Seller Inventory Reorder Suggestions API
 *
 * GET /api/seller/inventory/reorder
 *   Returns products owned by the authenticated seller whose stock has reached
 *   or fallen below their reorder point, with a suggested reorder quantity.
 *
 *   Query params:
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *
 *   Response: { products, total }
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getReorderSuggestions } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const result = await getReorderSuggestions(sellerIds, page, limit)

    return NextResponse.json({
      products: result.products,
      total: result.total,
    })
  } catch (error) {
    console.error('[Seller Inventory Reorder] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reorder suggestions', message: (error as Error).message },
      { status: 500 },
    )
  }
}
