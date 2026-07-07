import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { cacheOrCompute, cacheInvalidate } from '@/lib/server-cache'

// Cache this route for 60 seconds at the Next.js level
export const revalidate = 60

/**
 * GET /api/admin/stats
 * Dashboard statistics — cached for 5 minutes.
 * Operations are run SEQUENTIALLY to limit peak memory from
 * concurrent MongoDB cursor buffers.
 */
export async function GET() {
  try {
    const stats = await cacheOrCompute('admin:stats:v4', async () => {
      const { db } = await connectToDatabase()

      // Sequential count operations (much safer than Promise.all for memory)
      const totalProducts = await db.collection('products').countDocuments()
      const totalCategories = await db.collection('categories').countDocuments()
      const totalCustomers = await db.collection('customers').countDocuments()
      const totalReviews = await db.collection('reviews').countDocuments()
      const activeProducts = await db.collection('products').countDocuments({ active: true })
      const flaggedReviews = await db.collection('reviews').countDocuments({ status: 'flagged' })

      const productsByCategory = await db.collection('products').aggregate([
        { $match: { status: 'Published', active: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray()

      // Review rating aggregation
      const reviewRatingResult = await db.collection('reviews').aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]).toArray()
      const averageRating = reviewRatingResult[0]?.avgRating
        ? Math.round(reviewRatingResult[0].avgRating * 10) / 10
        : 0

      // Count sellers and delivery boys
      const totalSellers = await db.collection('sellers').countDocuments()
      const totalDeliveryBoys = await db.collection('delivery_boys').countDocuments()

      // ── Order Statistics ──────────────────────────────────────────────

      // Total orders
      const totalOrders = await db.collection('orders').countDocuments()

      // Order status counts
      const orderStatusAgg = await db.collection('orders').aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray()
      const orderStatusCounts: Record<string, number> = {}
      for (const entry of orderStatusAgg) {
        if (entry._id) {
          orderStatusCounts[entry._id] = entry.count
        }
      }

      // Revenue from delivered orders (sum of totalAmount)
      const revenueResult = await db.collection('orders').aggregate([
        { $match: { status: 'Delivered' } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } },
      ]).toArray()
      const totalRevenue = revenueResult[0]?.totalRevenue ?? 0

      // Commission from delivered order items (sum of items[].commission)
      const commissionResult = await db.collection('orders').aggregate([
        { $match: { status: 'Delivered' } },
        { $unwind: '$items' },
        { $group: { _id: null, totalCommission: { $sum: '$items.commission' } } },
      ]).toArray()
      const totalCommission = commissionResult[0]?.totalCommission ?? 0

      // Delivery fees from delivered orders (sum of deliveryFee)
      const deliveryFeesResult = await db.collection('orders').aggregate([
        { $match: { status: 'Delivered' } },
        { $group: { _id: null, totalDeliveryFees: { $sum: '$deliveryFee' } } },
      ]).toArray()
      const totalDeliveryFees = deliveryFeesResult[0]?.totalDeliveryFees ?? 0

      // Pending orders (status = Pending or Processing)
      const pendingOrders = await db.collection('orders').countDocuments({
        status: { $in: ['Pending', 'Processing'] },
      })

      // Monthly revenue — last 12 months
      const now = new Date()
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      const monthlyRevenueAgg = await db.collection('orders').aggregate([
        { $match: { status: 'Delivered', createdAt: { $gte: twelveMonthsAgo.toISOString() } } },
        {
          $group: {
            _id: { month: { $month: { $dateFromString: { dateString: '$createdAt' } } }, year: { $year: { $dateFromString: { dateString: '$createdAt' } } } },
            revenue: { $sum: '$totalAmount' },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]).toArray()
      const monthlyRevenueMap = new Map<string, { month: number; year: number; revenue: number; orderCount: number }>()
      for (const entry of monthlyRevenueAgg) {
        const key = `${entry._id.year}-${entry._id.month}`
        monthlyRevenueMap.set(key, { month: entry._id.month, year: entry._id.year, revenue: entry.revenue, orderCount: entry.orderCount })
      }
      const monthlyRevenue: { month: number; year: number; revenue: number; orderCount: number }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        const entry = monthlyRevenueMap.get(key)
        monthlyRevenue.push(entry ?? { month: d.getMonth() + 1, year: d.getFullYear(), revenue: 0, orderCount: 0 })
      }

      // Recent 5 orders
      const recentOrdersRaw = await db.collection('orders')
        .find({}, {
          projection: { orderId: 1, 'shippingAddress.name': 1, totalAmount: 1, status: 1, createdAt: 1 },
          sort: { createdAt: -1 },
          limit: 5,
        })
        .toArray()
      const recentOrders = recentOrdersRaw.map((o) => ({
        orderId: o.orderId,
        customerName: o.shippingAddress?.name ?? 'Unknown',
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
      }))

      return {
        totalProducts,
        totalCategories,
        totalCustomers,
        totalSellers,
        totalDeliveryBoys,
        totalReviews,
        averageRating,
        flaggedReviews,
        activeProducts,
        productsByCategory,
        // Order statistics
        totalOrders,
        orderStatusCounts,
        totalRevenue,
        totalCommission,
        totalDeliveryFees,
        pendingOrders,
        monthlyRevenue,
        recentOrders,
      }
    }, 300_000) // 5-minute cache

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * POST /api/admin/stats
 * Invalidate the stats cache (call after product/order changes).
 */
export async function POST() {
  cacheInvalidate('admin:stats:')
  return NextResponse.json({ ok: true })
}
