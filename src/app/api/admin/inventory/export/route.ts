/**
 * Admin Inventory Export API
 *
 * GET /api/admin/inventory/export
 *   Exports the platform-wide inventory as a CSV file.
 *
 *   Query params:
 *     - format (default csv — only csv supported)
 *     - sellerId (optional, filter by seller)
 *     - status (optional: in_stock | low_stock | out_of_stock | all)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { determineStockStatus } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sellerId = searchParams.get('sellerId') || ''
    const statusFilter = searchParams.get('status') || 'all'

    const { db } = await connectToDatabase()
    const query: any = {}
    if (sellerId) {
      query.$or = [{ sellerId }, { seller: sellerId }, { storeName: sellerId }]
    }
    if (statusFilter === 'in_stock') {
      query.trackInventory = { $ne: false }
      query.$expr = { $gt: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] }
    } else if (statusFilter === 'low_stock') {
      query.trackInventory = { $ne: false }
      query.$expr = {
        $and: [
          { $gt: [{ $ifNull: ['$stock', 0] }, 0] },
          { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] },
        ],
      }
    } else if (statusFilter === 'out_of_stock') {
      query.trackInventory = { $ne: false }
      query.$expr = { $lte: [{ $ifNull: ['$stock', 0] }, 0] }
    }

    const products = await db.collection('products')
      .find(query)
      .sort({ name: 1 })
      .limit(5000)
      .toArray()

    const header = [
      'Product ID',
      'Name',
      'SKU',
      'Category',
      'Brand',
      'Seller',
      'Stock',
      'Reserved',
      'Available',
      'Low Stock Threshold',
      'Track Inventory',
      'Selling Price',
      'MRP',
      'Stock Value (Selling)',
      'Stock Value (MRP)',
      'Status',
      'Reorder Point',
      'Warehouse Location',
      'Last Stock Update',
    ]

    const rows = products.map((p) => {
      const stock = Number(p.stock) || 0
      const reserved = Number(p.reservedStock) || 0
      const threshold = Number(p.lowStockThreshold) || 5
      const trackInventory = p.trackInventory !== false
      const sellingPrice = Number(p.sellingPrice) || 0
      const mrp = Number(p.mrp) || 0
      const status = determineStockStatus(stock, threshold, trackInventory)
      return [
        p._id.toString(),
        p.name,
        p.sku || '',
        p.category || '',
        p.brand || '',
        p.storeName || p.seller || '',
        stock,
        reserved,
        trackInventory ? Math.max(0, stock - reserved) : stock,
        threshold,
        trackInventory ? 'Yes' : 'No',
        sellingPrice,
        mrp,
        Math.round(stock * sellingPrice * 100) / 100,
        Math.round(stock * mrp * 100) / 100,
        status,
        Number(p.reorderPoint) || 0,
        p.warehouseLocation || '',
        p.lastStockUpdateAt ? new Date(p.lastStockUpdateAt).toISOString() : '',
      ].map(csvEscape).join(',')
    })

    const csv = [header.map(csvEscape).join(','), ...rows].join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inventory-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (error) {
    console.error('[Admin Inventory Export] Error:', error)
    return NextResponse.json(
      { error: 'Failed to export inventory', message: (error as Error).message },
      { status: 500 },
    )
  }
}
