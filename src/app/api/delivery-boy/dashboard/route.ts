import { NextRequest, NextResponse } from 'next/server'
import { authenticateDeliveryBoy } from '@/lib/delivery-boy-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/delivery-boy/dashboard                                    */
/*  Dashboard statistics for the delivery boy.                         */
/*  Computes stats from orders and delivery_assignments.               */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const deliveryBoyId = session.id

    // ── Date helpers ───────────────────────────────────────────────
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayStartISO = todayStart.toISOString()

    // 7 days ago (for weekly earnings)
    const weekAgo = new Date(todayStart)
    weekAgo.setDate(weekAgo.getDate() - 6)
    const weekAgoISO = weekAgo.toISOString()

    // ── Delivery assignment stats ──────────────────────────────────
    const [assignedOrders, totalAssigned] = await Promise.all([
      db.collection('delivery_assignments').countDocuments({
        deliveryBoyId,
        status: 'accepted',
      }),
      db.collection('delivery_assignments').countDocuments({
        deliveryBoyId,
        status: 'accepted',
      }),
    ])

    // ── Order item stats via aggregation ───────────────────────────
    // Match orders that have items assigned to this delivery boy
    // (either as forward delivery person or return pickup person)
    const dbOrderMatch = {
      $or: [
        { 'items.deliveryBoyId': deliveryBoyId },
        { 'items.pickupDeliveryBoyId': deliveryBoyId },
      ],
    }
    const dbItemMatch = {
      $or: [
        { 'items.deliveryBoyId': deliveryBoyId },
        { 'items.pickupDeliveryBoyId': deliveryBoyId },
      ],
    }

    const statsResult = await db.collection('orders').aggregate([
      { $match: dbOrderMatch },
      { $unwind: '$items' },
      { $match: dbItemMatch },
      {
        $facet: {
          // Per-status item counts
          byStatus: [
            { $group: { _id: '$items.status', count: { $sum: 1 } } },
          ],
          // Today's delivered items (using order's deliveredAt or updatedAt)
          todayDelivered: [
            { $match: { 'items.status': 'Delivered' } },
            {
              $match: {
                $or: [
                  { deliveredAt: { $gte: todayStartISO } },
                  { 'items.updatedAt': { $gte: todayStartISO } },
                ],
              },
            },
            { $count: 'total' },
          ],
          // Today's return completed items (pickups)
          todayPickups: [
            { $match: { 'items.status': 'Return Completed' } },
            {
              $match: {
                $or: [
                  { deliveredAt: { $gte: todayStartISO } },
                  { 'items.updatedAt': { $gte: todayStartISO } },
                ],
              },
            },
            { $count: 'total' },
          ],
          // Weekly breakdown of deliveries and pickups
          weeklyBreakdown: [
            {
              $match: {
                'items.status': { $in: ['Delivered', 'Return Completed'] },
                $or: [
                  { deliveredAt: { $gte: weekAgoISO } },
                  { 'items.updatedAt': { $gte: weekAgoISO } },
                ],
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: {
                      $dateFromString: { dateString: '$items.updatedAt' },
                    },
                  },
                },
                deliveredCount: {
                  $sum: { $cond: [{ $eq: ['$items.status', 'Delivered'] }, 1, 0] },
                },
                pickupCount: {
                  $sum: { $cond: [{ $eq: ['$items.status', 'Return Completed'] }, 1, 0] },
                },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]).toArray()

    const facets = statsResult[0] || {}
    const byStatus = facets.byStatus || []
    const todayDeliveredResult = facets.todayDelivered || []
    const todayPickupsResult = facets.todayPickups || []
    const weeklyBreakdown = facets.weeklyBreakdown || []

    // Build status map
    const statusMap: Record<string, number> = {}
    for (const item of byStatus) {
      statusMap[item._id || 'Unknown'] = item.count
    }

    // Earnings calculation: ₹40 per delivery, ₹30 per pickup
    const DELIVERY_EARNING = 40
    const PICKUP_EARNING = 30

    const totalDelivered = statusMap['Delivered'] || 0
    const totalPickups = statusMap['Return Completed'] || 0
    const totalEarnings = (totalDelivered * DELIVERY_EARNING) + (totalPickups * PICKUP_EARNING)

    const todayDeliveries = todayDeliveredResult.length > 0 ? todayDeliveredResult[0].total : 0
    const todayPickupCount = todayPickupsResult.length > 0 ? todayPickupsResult[0].total : 0
    const todayEarnings = (todayDeliveries * DELIVERY_EARNING) + (todayPickupCount * PICKUP_EARNING)

    // ── Build weekly earnings (7 days, zero-filled) ────────────────
    const weeklyMap: Record<string, { deliveredCount: number; pickupCount: number }> = {}
    for (const day of weeklyBreakdown) {
      if (day._id) {
        weeklyMap[day._id] = {
          deliveredCount: day.deliveredCount || 0,
          pickupCount: day.pickupCount || 0,
        }
      }
    }

    const weeklyEarnings = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' })
      const dayData = weeklyMap[dateStr] || { deliveredCount: 0, pickupCount: 0 }

      weeklyEarnings.push({
        day: dayName,
        date: dateStr,
        earnings: (dayData.deliveredCount * DELIVERY_EARNING) + (dayData.pickupCount * PICKUP_EARNING),
        deliveries: dayData.deliveredCount + dayData.pickupCount,
      })
    }

    // ── Rating from delivery_boys profile ──────────────────────────
    let rating = 0
    let totalRatings = 0
    let deliveryBoyDoc: Record<string, unknown> | null = null
    try {
      deliveryBoyDoc = await db.collection('delivery_boys').findOne(
        { _id: new ObjectId(deliveryBoyId) },
        { projection: { rating: 1, totalRatings: 1 } },
      )
    } catch {
      // _id might be stored as string, not ObjectId
    }
    if (!deliveryBoyDoc) {
      deliveryBoyDoc = await db.collection('delivery_boys').findOne(
        { _id: deliveryBoyId },
        { projection: { rating: 1, totalRatings: 1 } },
      )
    }
    if (deliveryBoyDoc) {
      rating = deliveryBoyDoc.rating || 0
      totalRatings = deliveryBoyDoc.totalRatings || 0
    }

    // ── Recent orders (last 5) ─────────────────────────────────────
    const recentOrdersRaw = await db.collection('orders')
      .find(dbOrderMatch)
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray()

    // Filter items to only this delivery boy's items (either delivery or pickup)
    const recentOrders = recentOrdersRaw.map((order) => ({
      ...order,
      _id: order._id.toString(),
      items: (order.items || []).filter(
        (item: { deliveryBoyId?: string; pickupDeliveryBoyId?: string }) =>
          item.deliveryBoyId === deliveryBoyId || item.pickupDeliveryBoyId === deliveryBoyId
      ),
    }))

    return NextResponse.json({
      stats: {
        assignedOrders,
        todayDeliveries,
        pendingPickups: statusMap['Out for Pickup'] || 0,
        inTransitOrders: statusMap['Out for Delivery'] || 0,
        totalDelivered,
        totalAssigned,
        todayEarnings,
        totalEarnings,
        rating,
        totalRatings,
      },
      weeklyEarnings,
      recentOrders,
    })
  } catch (error) {
    console.error('[Delivery Boy Dashboard GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
