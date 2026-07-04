/**
 * Seller Inventory List API
 *
 * GET /api/seller/inventory/list
 *   Returns a paginated, searchable, filterable list of the seller's products
 *   with full inventory details (stock, reserved, available, status, SKU,
 *   reorder point, etc.).
 *
 *   Query params:
 *     - page (default 1)
 *     - limit (default 20, max 100)
 *     - search (product name / SKU)
 *     - status (in_stock | low_stock | out_of_stock | unlimited | all)
 *     - category (optional)
 *     - sort (stock_asc | stock_desc | name | updated | value)
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { determineStockStatus } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const search = searchParams.get('search') || ''
    const statusFilter = searchParams.get('status') || 'all'
    const category = searchParams.get('category') || ''
    const sort = searchParams.get('sort') || 'updated'

    const { db } = await connectToDatabase()

    const query: any = {
      $or: [{ sellerId: { $in: sellerIds } }, { seller: { $in: sellerIds } }],
    }
    if (search) {
      query.$and = [
        query.$or ? { $or: query.$or } : {},
        {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { sku: { $regex: search, $options: 'i' } },
            { brand: { $regex: search, $options: 'i' } },
          ],
        },
      ]
      delete query.$or
    }
    if (category) {
      query.category = category
    }

    // Status filter (server-side pre-filter using thresholds)
    if (statusFilter !== 'all') {
      if (statusFilter === 'unlimited') {
        query.trackInventory = false
      } else if (statusFilter === 'in_stock') {
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
    }

    // Sort
    const sortOptions: Record<string, any> = {
      stock_asc: { stock: 1 },
      stock_desc: { stock: -1 },
      name: { name: 1 },
      updated: { updatedAt: -1 },
      value: { sellingPrice: -1 },
    }

    const total = await db.collection('products').countDocuments(query)
    const products = await db.collection('products')
      .find(query)
      .sort(sortOptions[sort] || sortOptions.updated)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const items = products.map((p) => {
      const stock = Number(p.stock) || 0
      const reserved = Number(p.reservedStock) || 0
      const threshold = Number(p.lowStockThreshold) || 5
      const trackInventory = p.trackInventory !== false
      const sellingPrice = Number(p.sellingPrice) || 0
      const mrp = Number(p.mrp) || 0
      return {
        _id: p._id.toString(),
        name: p.name,
        slug: p.slug,
        sku: p.sku || '',
        category: p.category || '',
        brand: p.brand || '',
        imageUrl: p.imageUrl || (Array.isArray(p.images) && p.images[0]?.url) || '',
        stock,
        reservedStock: reserved,
        availableStock: trackInventory ? Math.max(0, stock - reserved) : stock,
        lowStockThreshold: threshold,
        trackInventory,
        reorderPoint: Number(p.reorderPoint) || 0,
        reorderQuantity: Number(p.reorderQuantity) || 0,
        safetyStock: Number(p.safetyStock) || 0,
        warehouseLocation: p.warehouseLocation || '',
        leadTimeDays: Number(p.leadTimeDays) || 0,
        supplier: p.supplier || '',
        sellingPrice,
        mrp,
        costPrice: Number(p.costPrice) || 0,
        stockValue: Math.round(stock * sellingPrice * 100) / 100,
        status: determineStockStatus(stock, threshold, trackInventory),
        status_value: p.status,
        active: p.active,
        lastStockUpdateAt: p.lastStockUpdateAt || null,
        updatedAt: p.updatedAt,
        variants: (p.variants || []).map((v: any) => {
          // Variants may store their identifier as _id, id, or sku.
          // Fall back to sku (always present per the ProductVariant type) so
          // the Radix Select in the UI always has a non-empty value.
          const variantId = v._id || v.id || v.sku || ''
          return {
            _id: variantId,
            sku: v.sku || '',
            attributes: v.attributes || {},
            stock: Number(v.stock) || 0,
            sellingPrice: Number(v.sellingPrice) || 0,
            mrp: Number(v.mrp) || 0,
            isActive: v.isActive !== false,
            status: determineStockStatus(Number(v.stock) || 0, threshold, true),
          }
        }).filter((v: any) => v._id),  // Exclude variants without any identifier
      }
    })

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Seller Inventory List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory list', message: (error as Error).message },
      { status: 500 },
    )
  }
}
