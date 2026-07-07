/**
 * Seller Inventory Adjust API
 *
 * POST /api/seller/inventory/adjust
 *   Manually adjust stock for a product (and optional variant).
 *
 *   Two adjustment modes are supported:
 *     - Absolute mode (default, backward compatible):
 *         Body: { productId, newQuantity, variantId?, reason? }
 *         Calls adjustStock to set the stock to an explicit value.
 *     - Delta mode (relative change, e.g. for cycle counts):
 *         Body: { productId, delta, variantId?, reason? }
 *         Calls adjustStockDelta to apply a signed delta (+5 / -3) to the
 *         current stock. The resulting stock is clamped to >= 0.
 *
 *   If both `delta` and `newQuantity` are present, `delta` takes precedence.
 *
 *   The route verifies the product belongs to the authenticated seller before
 *   mutating anything, and records the change in the inventory_movements audit
 *   log via the inventory-manager helpers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { adjustStock, adjustStockDelta } from '@/lib/inventory-manager'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const body = await request.json()
    const { productId, newQuantity, delta, variantId, reason } = body || {}

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    const hasDelta = typeof delta === 'number'
    const hasAbsolute = typeof newQuantity === 'number'

    if (!hasDelta && !hasAbsolute) {
      return NextResponse.json(
        { error: 'Either "newQuantity" (absolute) or "delta" (relative) must be provided' },
        { status: 400 },
      )
    }

    if (hasAbsolute && (newQuantity < 0 || !Number.isFinite(newQuantity))) {
      return NextResponse.json(
        { error: 'newQuantity must be a non-negative finite number' },
        { status: 400 },
      )
    }
    if (hasDelta && !Number.isFinite(delta)) {
      return NextResponse.json(
        { error: 'delta must be a finite number' },
        { status: 400 },
      )
    }

    // Verify the product belongs to this seller
    const { db } = await connectToDatabase()
    let product: any = null
    try {
      product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
    } catch {
      /* _id may be a string */
    }
    if (!product) {
      product = await db.collection('products').findOne({ _id: productId as any })
    }
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const sellerIds = [session.id, ...session.sellerAliases]
    const belongsToSeller =
      sellerIds.includes(product.sellerId) ||
      sellerIds.includes(product.seller) ||
      sellerIds.includes(product.storeName)
    if (!belongsToSeller) {
      return NextResponse.json({ error: 'You do not own this product' }, { status: 403 })
    }

    const actorName = session.name || session.storeName

    if (hasDelta) {
      const result = await adjustStockDelta({
        productId,
        delta,
        variantId,
        reason: reason || 'Delta adjustment by seller',
        performedBy: 'seller',
        userId: session.id,
        userName: actorName,
      })

      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        mode: 'delta',
        message: result.message,
        newStock: result.newStock,
      })
    }

    // Absolute mode (backward-compatible path)
    const result = await adjustStock({
      productId,
      newQuantity,
      variantId,
      reason: reason || 'Manual adjustment by seller',
      performedBy: 'seller',
      userId: session.id,
      userName: actorName,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      mode: 'absolute',
      message: result.message,
      newStock: result.newStock,
    })
  } catch (error) {
    console.error('[Seller Inventory Adjust] Error:', error)
    return NextResponse.json(
      { error: 'Failed to adjust stock', message: (error as Error).message },
      { status: 500 },
    )
  }
}
