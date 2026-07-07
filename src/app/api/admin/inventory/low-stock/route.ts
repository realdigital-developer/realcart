/**
 * Admin Low-Stock API
 *
 * GET /api/admin/inventory/low-stock
 *   Returns all sellers' low-stock and out-of-stock products.
 *
 *   Query params:
 *     - page (default 1)
 *     - limit (default 50)
 *     - sellerId (optional, filter by seller)
 *     - type (optional: low_stock | out_of_stock | all)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { determineStockStatus } from '@/lib/inventory-manager'

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
    const sellerId = searchParams.get('sellerId') || ''
    const type = searchParams.get('type') || 'all'

    const { db } = await connectToDatabase()
    const query: any = {
      trackInventory: { $ne: false },
      active: { $ne: false },
    }

    if (type === 'out_of_stock') {
      query.$expr = { $lte: [{ $ifNull: ['$stock', 0] }, 0] }
    } else if (type === 'low_stock') {
      query.$expr = {
        $and: [
          { $gt: [{ $ifNull: ['$stock', 0] }, 0] },
          { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] },
        ],
      }
    } else {
      query.$expr = { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] }
    }

    if (sellerId) {
      query.$or = [{ sellerId }, { seller: sellerId }, { storeName: sellerId }]
    }

    const total = await db.collection('products').countDocuments(query)
    const products = await db.collection('products')
      .find(query)
      .sort({ stock: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    return NextResponse.json({
      products: products.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        sellerId: p.sellerId || '',
        sellerName: p.storeName || p.seller || '',
        imageUrl: p.imageUrl || (Array.isArray(p.images) && p.images[0]?.url) || '',
        stock: Number(p.stock) || 0,
        reservedStock: Number(p.reservedStock) || 0,
        availableStock: Math.max(0, (Number(p.stock) || 0) - (Number(p.reservedStock) || 0)),
        lowStockThreshold: Number(p.lowStockThreshold) || 5,
        sellingPrice: Number(p.sellingPrice) || 0,
        category: p.category || '',
        status: determineStockStatus(Number(p.stock) || 0, Number(p.lowStockThreshold) || 5, p.trackInventory !== false),
        updatedAt: p.updatedAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Admin Low Stock] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch low stock products', message: (error as Error).message },
      { status: 500 },
    )
  }
}
