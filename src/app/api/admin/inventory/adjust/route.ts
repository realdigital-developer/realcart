/**
 * Admin Inventory Adjust API
 *
 * POST /api/admin/inventory/adjust
 *   Manually adjust stock for a single product (or a variant of it).
 *
 *   Body:
 *     - productId (string, required)
 *     - newQuantity (number, optional)  — absolute target (used when `delta` is absent)
 *     - delta (number, optional)        — relative change (+/-); preferred when present
 *     - variantId (string, optional)
 *     - reason (string, optional)
 *     - sellerId (string, optional)     — informational; the actual sellerId is
 *                                          resolved from the product document
 *
 *   Returns: { success, message, newStock? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { adjustStock, adjustStockDelta } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const { productId, newQuantity, delta, variantId, reason, sellerId } = body as {
      productId?: string
      newQuantity?: number
      delta?: number
      variantId?: string
      reason?: string
      sellerId?: string
    }

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json(
        { success: false, message: 'productId is required' },
        { status: 400 },
      )
    }

    const hasDelta = delta !== undefined && delta !== null
    const hasAbs = newQuantity !== undefined && newQuantity !== null

    if (!hasDelta && !hasAbs) {
      return NextResponse.json(
        { success: false, message: 'Either newQuantity or delta must be provided' },
        { status: 400 },
      )
    }

    // Delta-based adjustment (relative change)
    if (hasDelta) {
      const numericDelta = Number(delta)
      if (!Number.isFinite(numericDelta)) {
        return NextResponse.json(
          { success: false, message: 'delta must be a finite number' },
          { status: 400 },
        )
      }
      const result = await adjustStockDelta({
        productId,
        delta: numericDelta,
        variantId: variantId || undefined,
        reason: reason || `Admin delta adjustment${sellerId ? ` (seller: ${sellerId})` : ''}`,
        performedBy: 'admin',
        userId: session.id,
        userName: session.name,
      })
      return NextResponse.json(result, { status: result.success ? 200 : 400 })
    }

    // Absolute adjustment
    const numericQty = Number(newQuantity)
    if (!Number.isFinite(numericQty) || numericQty < 0) {
      return NextResponse.json(
        { success: false, message: 'newQuantity must be a non-negative number' },
        { status: 400 },
      )
    }
    const result = await adjustStock({
      productId,
      newQuantity: numericQty,
      variantId: variantId || undefined,
      reason: reason || `Admin manual adjustment${sellerId ? ` (seller: ${sellerId})` : ''}`,
      performedBy: 'admin',
      userId: session.id,
      userName: session.name,
    })
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    console.error('[Admin Inventory Adjust] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to adjust stock',
        message: (error as Error).message,
      },
      { status: 500 },
    )
  }
}
