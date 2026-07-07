import { NextRequest, NextResponse } from 'next/server'
import { authenticateDeliveryBoy } from '@/lib/delivery-boy-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { getDefaultDeliveryFee, getDefaultPickupFee } from '@/lib/order-state-machine'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/delivery-boy/earnings                                     */
/*  Earnings breakdown for the delivery boy.                           */
/*  Computes actual earnings from the orders collection.               */
/*  - ₹40 per delivery (Delivered) — uses item.deliveryFee             */
/*  - ₹30 per return pickup (Return Completed)                         */
/* ------------------------------------------------------------------ */

const EARNING_STATUSES = ['Delivered', 'Return Completed']

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const deliveryBoyId = session.id

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')))

    const defaultDeliveryFee = getDefaultDeliveryFee() // ₹40
    const pickupFee = getDefaultPickupFee()             // ₹30

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Sunday start of week
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    /* ---------------------------------------------------------------- */
    /*  Pipeline 1: All earning-eligible items for summary stats        */
    /* ---------------------------------------------------------------- */
    const statsPipeline = [
      {
        $match: {
          $or: [
            { 'items.deliveryBoyId': deliveryBoyId },
            { 'items.pickupDeliveryBoyId': deliveryBoyId },
          ],
          'items.status': { $in: EARNING_STATUSES },
        },
      },
      { $unwind: '$items' },
      {
        $match: {
          $or: [
            { 'items.deliveryBoyId': deliveryBoyId },
            { 'items.pickupDeliveryBoyId': deliveryBoyId },
          ],
          'items.status': { $in: EARNING_STATUSES },
        },
      },
      {
        $project: {
          itemStatus: '$items.status',
          itemDeliveryFee: '$items.deliveryFee',
          itemUpdatedAt: '$items.updatedAt',
          itemCreatedAt: '$items.createdAt',
          orderDeliveredAt: '$deliveredAt',
          orderCreatedAt: '$createdAt',
        },
      },
    ]

    const allEarningItems = await db.collection('orders').aggregate(statsPipeline).toArray()

    // Compute summary statistics
    let todayEarnings = 0
    let todayDeliveries = 0
    let weekEarnings = 0
    let weekDeliveries = 0
    let monthEarnings = 0
    let monthDeliveries = 0
    let totalEarnings = 0
    let totalDeliveries = 0

    // Monthly breakdown map: key = "YYYY-MM"
    const monthlyMap = new Map<string, { earnings: number; deliveries: number; month: number; year: number }>()

    for (const item of allEarningItems) {
      // Calculate fee for this item
      const isDelivered = item.itemStatus === 'Delivered'
      const fee = isDelivered
        ? (item.itemDeliveryFee || defaultDeliveryFee)
        : pickupFee

      // Determine the completion date (when the item reached its earning status)
      const completionDate = new Date(
        item.itemUpdatedAt || item.itemCreatedAt || item.orderDeliveredAt || item.orderCreatedAt || now
      )

      totalEarnings += fee
      totalDeliveries += 1

      // Today
      if (completionDate >= todayStart) {
        todayEarnings += fee
        todayDeliveries += 1
      }

      // This week (from Sunday)
      if (completionDate >= weekStart) {
        weekEarnings += fee
        weekDeliveries += 1
      }

      // This month
      if (completionDate >= monthStart) {
        monthEarnings += fee
        monthDeliveries += 1
      }

      // Monthly breakdown accumulation
      const year = completionDate.getFullYear()
      const month = completionDate.getMonth() + 1 // 1-indexed
      const key = `${year}-${month}`
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { earnings: 0, deliveries: 0, month, year })
      }
      const entry = monthlyMap.get(key)!
      entry.earnings += fee
      entry.deliveries += 1
    }

    // Build 12-month breakdown (last 12 months including current)
    const monthlyBreakdown = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = d.getMonth() + 1
      const key = `${year}-${month}`
      const data = monthlyMap.get(key) || { earnings: 0, deliveries: 0 }

      monthlyBreakdown.push({
        month: d.toLocaleString('default', { month: 'short' }),
        year,
        monthNumber: month,
        earnings: data.earnings,
        deliveries: data.deliveries,
      })
    }

    /* ---------------------------------------------------------------- */
    /*  Pipeline 2: Paginated order breakdown                           */
    /* ---------------------------------------------------------------- */

    // Count total orders that have earning-eligible items for this delivery boy
    const totalOrders = await db.collection('orders').countDocuments({
      $or: [
        { 'items.deliveryBoyId': deliveryBoyId },
        { 'items.pickupDeliveryBoyId': deliveryBoyId },
      ],
      'items.status': { $in: EARNING_STATUSES },
    })

    const totalPages = Math.max(1, Math.ceil(totalOrders / limit))

    const orderBreakdownPipeline = [
      {
        $match: {
          $or: [
            { 'items.deliveryBoyId': deliveryBoyId },
            { 'items.pickupDeliveryBoyId': deliveryBoyId },
          ],
          'items.status': { $in: EARNING_STATUSES },
        },
      },
      {
        $addFields: {
          // Filter items to only those assigned to this delivery boy with earning status
          earningItems: {
            $filter: {
              input: '$items',
              as: 'item',
              cond: {
                $and: [
                  {
                    $or: [
                      { $eq: ['$$item.deliveryBoyId', deliveryBoyId] },
                      { $eq: ['$$item.pickupDeliveryBoyId', deliveryBoyId] },
                    ],
                  },
                  { $in: ['$$item.status', EARNING_STATUSES] },
                ],
              },
            },
          },
        },
      },
      // Sort by most recent delivery/pickup completion date, then order creation
      {
        $sort: { deliveredAt: -1, createdAt: -1 },
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]

    const orderDocs = await db.collection('orders').aggregate(orderBreakdownPipeline).toArray()

    const orderBreakdown = orderDocs.map((order: Record<string, unknown>) => {
      const earningItems = (order.earningItems || []) as Record<string, unknown>[]

      // Calculate total delivery fee earned from this order
      const totalFee = earningItems.reduce((sum: number, item: Record<string, unknown>) => {
        const status = item.status as string
        const isDelivered = status === 'Delivered'
        const fee = isDelivered
          ? ((item.deliveryFee as number) || defaultDeliveryFee)
          : pickupFee
        return sum + fee
      }, 0)

      // Get the most recent completion date among earning items
      const completionDate = earningItems.reduce((latest: string | null, item: Record<string, unknown>) => {
        const updatedAt = item.updatedAt as string | undefined
        if (!updatedAt) return latest
        if (!latest) return updatedAt
        return updatedAt > latest ? updatedAt : latest
      }, null as string | null)

      // Build items array for the response
      const items = earningItems.map((item: Record<string, unknown>) => ({
        name: (item.productName as string) || 'Unknown Product',
        imageUrl: (item.productImage as string) || '',
      }))

      return {
        _id: (order._id as { toString(): string }).toString(),
        orderNumber: order.orderId as string,
        customerName: order.customerName as string,
        deliveredAt: completionDate || (order.deliveredAt as string | null) || null,
        deliveryFee: totalFee,
        totalAmount: order.totalAmount as number,
        paymentMethod: order.paymentMethod as string,
        items,
      }
    })

    return NextResponse.json({
      todayEarnings,
      todayDeliveries,
      weekEarnings,
      weekDeliveries,
      monthEarnings,
      monthDeliveries,
      totalEarnings,
      totalDeliveries,
      monthlyBreakdown,
      orderBreakdown,
      pagination: {
        page,
        limit,
        total: totalOrders,
        totalPages,
      },
    })
  } catch (error) {
    console.error('[Delivery Boy Earnings GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch earnings data' }, { status: 500 })
  }
}
