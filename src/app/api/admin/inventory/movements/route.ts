/**
 * Admin Inventory Movements API
 *
 * GET /api/admin/inventory/movements
 *   Platform-wide inventory movement audit log with filters.
 *
 *   Query params:
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *     - productId, orderId, sellerId, type (optional filters)
 *     - startDate, endDate (ISO strings, optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import type { MovementType } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const productId = searchParams.get('productId') || undefined
    const orderId = searchParams.get('orderId') || undefined
    const sellerId = searchParams.get('sellerId') || undefined
    const type = (searchParams.get('type') || undefined) as MovementType | undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    const { db } = await connectToDatabase()
    const query: any = {}
    if (productId) query.productId = productId
    if (orderId) query.orderId = orderId
    if (sellerId) {
      query.$or = [{ sellerId }, { sellerName: sellerId }]
    }
    if (type) query.type = type
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = startDate
      if (endDate) query.createdAt.$lte = endDate
    }

    const total = await db.collection('inventory_movements').countDocuments(query)
    const movements = await db.collection('inventory_movements')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    return NextResponse.json({
      movements: movements.map((m) => ({ ...m, _id: m._id.toString() })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Admin Inventory Movements] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch movements', message: (error as Error).message },
      { status: 500 },
    )
  }
}
