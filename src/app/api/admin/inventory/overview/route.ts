/**
 * Admin Inventory Overview API
 *
 * GET /api/admin/inventory/overview
 *   Platform-wide inventory KPIs + per-seller inventory health.
 *
 *   Query params:
 *     - none
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { getInventorySummary, determineStockStatus } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    // Platform-wide summary
    const summary = await getInventorySummary()

    // Per-seller inventory health (aggregate by sellerId)
    const sellerHealthPipeline = [
      {
        $match: {
          trackInventory: { $ne: false },
        },
      },
      {
        $group: {
          _id: { sellerId: '$sellerId', sellerName: '$storeName' },
          totalSkus: { $sum: 1 },
          lowStockSkus: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: [{ $ifNull: ['$stock', 0] }, 0] },
                    { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStockSkus: {
            $sum: { $cond: [{ $lte: [{ $ifNull: ['$stock', 0] }, 0] }, 1, 0] },
          },
          totalUnits: { $sum: { $ifNull: ['$stock', 0] } },
          stockValue: {
            $sum: { $multiply: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$sellingPrice', 0] }] },
          },
        },
      },
      { $sort: { stockValue: -1 } },
      { $limit: 50 },
    ]
    const sellerHealth = await db.collection('products').aggregate(sellerHealthPipeline).toArray()

    // Platform-wide active alerts
    const activeAlerts = await db.collection('inventory_alerts')
      .find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray()

    // Top 10 lowest-stock products across the platform
    const lowStockProducts = await db.collection('products')
      .find({
        trackInventory: { $ne: false },
        active: { $ne: false },
        $expr: { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] },
      })
      .sort({ stock: 1 })
      .limit(10)
      .toArray()
      .then((ps) => ps.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        sellerName: p.storeName || p.seller || '',
        imageUrl: p.imageUrl || (Array.isArray(p.images) && p.images[0]?.url) || '',
        stock: Number(p.stock) || 0,
        lowStockThreshold: Number(p.lowStockThreshold) || 5,
        sellingPrice: Number(p.sellingPrice) || 0,
        status: determineStockStatus(Number(p.stock) || 0, Number(p.lowStockThreshold) || 5, p.trackInventory !== false),
      })))

    // Recent movements across the platform
    const recentMovements = await db.collection('inventory_movements')
      .find({})
      .sort({ createdAt: -1 })
      .limit(15)
      .toArray()
      .then((ms) => ms.map((m) => ({ ...m, _id: m._id.toString() })))

    return NextResponse.json({
      summary,
      sellerHealth: sellerHealth.map((s) => ({
        sellerId: s._id.sellerId,
        sellerName: s._id.sellerName || 'Unknown',
        totalSkus: s.totalSkus,
        lowStockSkus: s.lowStockSkus,
        outOfStockSkus: s.outOfStockSkus,
        totalUnits: s.totalUnits,
        stockValue: Math.round((s.stockValue || 0) * 100) / 100,
      })),
      activeAlerts: activeAlerts.map((a) => ({ ...a, _id: a._id.toString() })),
      lowStockProducts,
      recentMovements,
    })
  } catch (error) {
    console.error('[Admin Inventory Overview] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory overview', message: (error as Error).message },
      { status: 500 },
    )
  }
}
