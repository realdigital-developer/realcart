/**
 * Admin Inventory Reorder Suggestions API
 *
 * GET /api/admin/inventory/reorder
 *   List products whose stock has reached or fallen below their reorder point,
 *   along with a suggested reorder quantity.
 *
 *   Query params:
 *     - sellerId (optional)
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *
 *   Returns: { products, total }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getReorderSuggestions } from '@/lib/inventory-manager'

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

    const result = await getReorderSuggestions(
      sellerId ? [sellerId] : undefined,
      page,
      limit,
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Admin Inventory Reorder] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reorder suggestions', message: (error as Error).message },
      { status: 500 },
    )
  }
}
