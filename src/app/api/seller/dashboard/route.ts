import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateSeller } from '@/lib/seller-api-auth'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/dashboard                                          */
/*  Dashboard statistics for the seller.                               */
/*  Computes order/revenue stats from the orders collection.           */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const sellerId = session.id
    const sellerAliases = session.sellerAliases

    // ── Product stats ──────────────────────────────────────────────
    const sellerMatch = sellerAliases.length === 1
      ? sellerAliases[0]
      : { $in: sellerAliases }

    const [totalProducts, activeProducts, draftProducts] = await Promise.all([
      db.collection('products').countDocuments({ seller: sellerMatch }),
      db.collection('products').countDocuments({ seller: sellerMatch, status: 'Published', active: true }),
      db.collection('products').countDocuments({ seller: sellerMatch, status: 'Draft' }),
    ])

    // ── Average rating of seller's products ────────────────────────
    const sellerProducts = await db.collection('products')
      .find({ seller: sellerMatch }, { projection: { _id: 1 } })
      .toArray()

    const sellerProductIds = sellerProducts.map((p) => p._id.toString())

    let averageRating = 0
    if (sellerProductIds.length > 0) {
      const ratingResult = await db.collection('reviews').aggregate([
        {
          $match: {
            productId: { $in: sellerProductIds },
            status: 'active',
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
          },
        },
      ]).toArray()

      averageRating = ratingResult.length > 0
        ? Math.round((ratingResult[0].avgRating || 0) * 10) / 10
        : 0
    }

    // ── Order & Revenue stats via aggregation ──────────────────────
    // Match orders containing items belonging to this seller.
    // Use $in with sellerAliases to handle the mismatch where order items
    // may store storeName instead of ObjectId as sellerId.
    const sellerIds = [sellerId, ...sellerAliases]
    const uniqueSellerIds = [...new Set(sellerIds)]
    const sellerOrderMatch = { 'items.sellerId': { $in: uniqueSellerIds } }
    const sellerItemMatch = { 'items.sellerId': { $in: uniqueSellerIds } }

    const statsResult = await db.collection('orders').aggregate([
      { $match: sellerOrderMatch },
      { $unwind: '$items' },
      { $match: sellerItemMatch },
      {
        $facet: {
          // Per-status order counts (unique orders per status)
          orderStatusCounts: [
            { $group: { _id: { orderId: '$orderId', status: '$items.status' } } },
            { $group: { _id: '$_id.status', orderCount: { $sum: 1 } } },
          ],
          // Total revenue from delivered items (sum of sellerEarnings)
          revenue: [
            { $match: { 'items.status': 'Delivered' } },
            { $group: { _id: null, totalRevenue: { $sum: '$items.sellerEarnings' } } },
          ],
          // Monthly revenue for the last 6 months (delivered items only)
          monthly: [
            { $match: { 'items.status': 'Delivered' } },
            {
              $group: {
                _id: {
                  year: { $year: { $dateFromString: { dateString: '$createdAt' } } },
                  month: { $month: { $dateFromString: { dateString: '$createdAt' } } },
                },
                revenue: { $sum: '$items.sellerEarnings' },
                orderCount: { $sum: 1 },
              },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
          ],
        },
      },
    ]).toArray()

    const facets = statsResult[0] || {}
    const orderStatusCounts = facets.orderStatusCounts || []
    const revenueData = facets.revenue || []
    const monthlyData = facets.monthly || []

    // Build order status map
    const statusMap: Record<string, number> = {}
    let totalOrders = 0
    for (const item of orderStatusCounts) {
      const status = item._id || 'Unknown'
      const count = item.orderCount || 0
      statusMap[status] = count
      totalOrders += count
    }

    // Total revenue from delivered items
    const totalRevenue = revenueData.length > 0 ? (revenueData[0].totalRevenue || 0) : 0

    // ── Recent orders (last 5) ─────────────────────────────────────
    const recentOrdersRaw = await db.collection('orders')
      .find(sellerOrderMatch)
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray()

    // Filter items in each order to only this seller's items
    const recentOrders = recentOrdersRaw.map((order) => ({
      ...order,
      _id: order._id.toString(),
      items: (order.items || []).filter(
        (item: { sellerId: string }) => uniqueSellerIds.includes(item.sellerId)
      ),
    }))

    // ── Monthly revenue (last 6 months, zero-filled) ───────────────
    const monthlyMap: Record<string, { revenue: number; orderCount: number }> = {}
    for (const m of monthlyData) {
      const key = `${m._id.year}-${m._id.month}`
      monthlyMap[key] = { revenue: m.revenue || 0, orderCount: m.orderCount || 0 }
    }

    const monthlyRevenue = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthName = d.toLocaleString('default', { month: 'short' })
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`
      const data = monthlyMap[key] || { revenue: 0, orderCount: 0 }

      monthlyRevenue.push({
        month: monthName,
        year: d.getFullYear(),
        monthNumber: d.getMonth() + 1,
        revenue: data.revenue,
        orderCount: data.orderCount,
      })
    }

    return NextResponse.json({
      products: {
        total: totalProducts,
        active: activeProducts,
        draft: draftProducts,
      },
      orders: {
        total: totalOrders,
        pending: statusMap['Pending'] || 0,
        processing: statusMap['Processing'] || 0,
        shipped: statusMap['Shipped'] || 0,
        delivered: statusMap['Delivered'] || 0,
      },
      revenue: {
        total: totalRevenue,
      },
      averageRating,
      recentOrders,
      monthlyRevenue,
    })
  } catch (error) {
    console.error('[Seller Dashboard GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
