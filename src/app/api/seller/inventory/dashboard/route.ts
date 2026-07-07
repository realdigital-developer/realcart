/**
 * Seller Inventory Dashboard API
 *
 * GET /api/seller/inventory/dashboard
 *   Returns the seller's inventory summary (KPIs) + recent alerts + top movers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { getInventorySummary, determineStockStatus } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]
    const { db } = await connectToDatabase()

    // Inventory summary KPIs
    const summary = await getInventorySummary(sellerIds)

    // Recent active alerts for this seller
    const alerts = await db.collection('inventory_alerts')
      .find({
        $or: [{ sellerId: { $in: sellerIds } }, { sellerName: { $in: sellerIds } }],
        status: 'active',
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray()

    // Top 5 lowest-stock products (most urgent)
    const lowStockProducts = await db.collection('products')
      .find({
        trackInventory: { $ne: false },
        active: { $ne: false },
        $or: [{ sellerId: { $in: sellerIds } }, { seller: { $in: sellerIds } }],
        $expr: { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] },
      })
      .sort({ stock: 1 })
      .limit(5)
      .toArray()
      .then((ps) => ps.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        imageUrl: p.imageUrl || (Array.isArray(p.images) && p.images[0]?.url) || '',
        stock: Number(p.stock) || 0,
        lowStockThreshold: Number(p.lowStockThreshold) || 5,
        reservedStock: Number(p.reservedStock) || 0,
        sellingPrice: Number(p.sellingPrice) || 0,
        status: determineStockStatus(Number(p.stock) || 0, Number(p.lowStockThreshold) || 5, p.trackInventory !== false),
      })))

    // Recent movements (last 10)
    const movements = await db.collection('inventory_movements')
      .find({
        $or: [{ sellerId: { $in: sellerIds } }, { sellerName: { $in: sellerIds } }],
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray()
      .then((ms) => ms.map((m) => ({ ...m, _id: m._id.toString() })))

    return NextResponse.json({
      summary,
      alerts: alerts.map((a) => ({ ...a, _id: a._id.toString() })),
      lowStockProducts,
      recentMovements: movements,
    })
  } catch (error) {
    console.error('[Seller Inventory Dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory dashboard', message: (error as Error).message },
      { status: 500 },
    )
  }
}
