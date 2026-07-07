/**
 * Admin Inventory Bulk Update API
 *
 * POST /api/admin/inventory/bulk-update
 *   Apply a batch of absolute stock adjustments in one call.
 *
 *   Body:
 *     - updates: Array<{ productId: string, newQuantity: number, variantId?: string }>
 *     - reason?: string
 *
 *   Validation:
 *     - max 500 updates per call
 *     - each newQuantity must be a non-negative finite number
 *
 *   Returns: { success, message, updated, failed, errors[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { bulkUpdateStock } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

const MAX_UPDATES = 500

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

    const { updates, reason } = body as {
      updates?: Array<{ productId: string; newQuantity: number; variantId?: string }>
      reason?: string
    }

    if (!Array.isArray(updates)) {
      return NextResponse.json(
        { success: false, message: 'updates must be an array' },
        { status: 400 },
      )
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, message: 'updates array cannot be empty' },
        { status: 400 },
      )
    }

    if (updates.length > MAX_UPDATES) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many updates (${updates.length}). Maximum ${MAX_UPDATES} per call.`,
        },
        { status: 400 },
      )
    }

    // Validate each row before delegating to the manager
    const cleaned: Array<{ productId: string; newQuantity: number; variantId?: string }> = []
    for (let i = 0; i < updates.length; i++) {
      const row = updates[i]
      if (!row || typeof row !== 'object') {
        return NextResponse.json(
          { success: false, message: `update at index ${i} is invalid` },
          { status: 400 },
        )
      }
      const { productId, newQuantity, variantId } = row as any
      if (!productId || typeof productId !== 'string') {
        return NextResponse.json(
          { success: false, message: `update at index ${i} is missing a valid productId` },
          { status: 400 },
        )
      }
      const qty = Number(newQuantity)
      if (!Number.isFinite(qty) || qty < 0) {
        return NextResponse.json(
          {
            success: false,
            message: `update at index ${i} has an invalid newQuantity (must be non-negative number)`,
          },
          { status: 400 },
        )
      }
      cleaned.push({
        productId,
        newQuantity: qty,
        variantId: variantId ? String(variantId) : undefined,
      })
    }

    const result = await bulkUpdateStock({
      updates: cleaned,
      reason: reason || 'Admin bulk update',
      performedBy: 'admin',
      userId: session.id,
      userName: session.name,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('[Admin Inventory Bulk Update] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to perform bulk update',
        message: (error as Error).message,
      },
      { status: 500 },
    )
  }
}
