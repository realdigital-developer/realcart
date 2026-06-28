/**
 * Seller Inventory Bulk Update API
 *
 * POST /api/seller/inventory/bulk-update
 *   Update stock for multiple products in a single request. Used by the
 *   "Bulk Update" feature in the seller inventory panel.
 *
 *   Body:
 *     - updates: Array<{ productId, newQuantity, variantId? }>
 *     - reason (string, optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { bulkUpdateStock } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const body = await request.json()
    const { updates, reason } = body as {
      updates: Array<{ productId: string; newQuantity: number; variantId?: string }>
      reason?: string
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'updates must be a non-empty array' }, { status: 400 })
    }
    if (updates.length > 500) {
      return NextResponse.json({ error: 'Cannot update more than 500 products at once' }, { status: 400 })
    }

    // Validate each entry
    for (const u of updates) {
      if (!u.productId || typeof u.newQuantity !== 'number' || u.newQuantity < 0) {
        return NextResponse.json(
          { error: `Invalid entry: productId=${u.productId}, newQuantity=${u.newQuantity}` },
          { status: 400 },
        )
      }
    }

    const result = await bulkUpdateStock({
      updates,
      reason: reason || 'Bulk stock update by seller',
      performedBy: 'seller',
      userId: session.id,
      userName: session.name || session.storeName,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Seller Inventory Bulk Update] Error:', error)
    return NextResponse.json(
      { error: 'Failed to bulk update stock', message: (error as Error).message },
      { status: 500 },
    )
  }
}
