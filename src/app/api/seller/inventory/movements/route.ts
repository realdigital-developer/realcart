/**
 * Seller Inventory Movements API
 *
 * GET /api/seller/inventory/movements
 *   Returns the seller's inventory movement audit log with filters.
 *
 *   Query params:
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *     - productId (optional)
 *     - orderId (optional)
 *     - type (optional: order | cancel | return | adjustment | restock | reservation | release | initial)
 *     - startDate, endDate (ISO strings, optional)
 *
 *   The seller's full set of IDs (primary sellerId + all aliases) is passed
 *   to getInventoryMovements via the `sellerIds` parameter so movements
 *   recorded under any alias are returned.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getInventoryMovements, type MovementType } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    // Full seller ID set: canonical ObjectId + store name + personal name aliases.
    const sellerIds = [session.id, ...session.sellerAliases]

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const productId = searchParams.get('productId') || undefined
    const orderId = searchParams.get('orderId') || undefined
    const type = (searchParams.get('type') || undefined) as MovementType | undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    const result = await getInventoryMovements({
      sellerIds,
      productId,
      orderId,
      type,
      startDate,
      endDate,
      page,
      limit,
    })

    return NextResponse.json({
      movements: result.movements,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    })
  } catch (error) {
    console.error('[Seller Inventory Movements] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch movements', message: (error as Error).message },
      { status: 500 },
    )
  }
}
