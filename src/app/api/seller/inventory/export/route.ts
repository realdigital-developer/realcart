/**
 * Seller Inventory Export API
 *
 * GET /api/seller/inventory/export
 *   Streams the authenticated seller's inventory as a CSV file. Only products
 *   owned by this seller (by sellerId or seller/storeName alias) are included.
 *
 *   CSV columns:
 *     id,name,sku,category,brand,seller,stock,reserved,available,threshold,
 *     trackInventory,sellingPrice,mrp,costPrice,stockValueSelling,
 *     stockValueMrp,stockValueCost,status,reorderPoint,reorderQuantity,
 *     safetyStock,warehouseLocation,lastStockUpdateAt
 *
 *   Response headers:
 *     Content-Type: text/csv
 *     Content-Disposition: attachment; filename="seller-inventory-<date>.csv"
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { determineStockStatus } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]

    const { db } = await connectToDatabase()
    const query: any = {
      $or: [
        { sellerId: { $in: sellerIds } },
        { seller: { $in: sellerIds } },
        { storeName: { $in: sellerIds } },
      ],
    }

    // Hard upper bound to avoid memory blow-ups on very large catalogs.
    const products = await db.collection('products')
      .find(query)
      .sort({ name: 1 })
      .limit(10000)
      .toArray()

    const header = [
      'id',
      'name',
      'sku',
      'category',
      'brand',
      'seller',
      'stock',
      'reserved',
      'available',
      'threshold',
      'trackInventory',
      'sellingPrice',
      'mrp',
      'costPrice',
      'stockValueSelling',
      'stockValueMrp',
      'stockValueCost',
      'status',
      'reorderPoint',
      'reorderQuantity',
      'safetyStock',
      'warehouseLocation',
      'lastStockUpdateAt',
    ]

    const rows = products.map((p) => {
      const stock = Number(p.stock) || 0
      const reserved = Number(p.reservedStock) || 0
      const threshold = Number(p.lowStockThreshold) || 5
      const trackInventory = p.trackInventory !== false
      const sellingPrice = Number(p.sellingPrice) || Number(p.price) || 0
      const mrp = Number(p.mrp) || 0
      const costPrice = Number(p.costPrice) || 0
      const status = determineStockStatus(stock, threshold, trackInventory)
      return [
        p._id.toString(),
        p.name || '',
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
        costPrice,
        Math.round(stock * sellingPrice * 100) / 100,
        Math.round(stock * mrp * 100) / 100,
        Math.round(stock * costPrice * 100) / 100,
        status,
        Number(p.reorderPoint) || 0,
        Number(p.reorderQuantity) || 0,
        Number(p.safetyStock) || 0,
        p.warehouseLocation || '',
        p.lastStockUpdateAt ? new Date(p.lastStockUpdateAt).toISOString() : '',
      ].map(csvEscape).join(',')
    })

    const csv = [header.map(csvEscape).join(','), ...rows].join('\n')
    const dateStr = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="seller-inventory-${dateStr}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[Seller Inventory Export] Error:', error)
    return NextResponse.json(
      { error: 'Failed to export inventory', message: (error as Error).message },
      { status: 500 },
    )
  }
}
