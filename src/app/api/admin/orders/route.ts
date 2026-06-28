/**
 * Admin Orders API — /api/admin/orders
 *
 * READ-ONLY: Admin can view all orders but CANNOT update order status.
 * This enforces strict role-based control as per the design spec.
 *
 * Endpoints:
 *   GET  /              — List all orders (paginated, filterable)
 *   GET  /?orderId=xxx  — Get single order detail with full audit trail
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getAllOrders, getOrderStatusLogs } from '@/lib/order-helpers'
import { connectToDatabase } from '@/lib/mongodb'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')

    if (orderId) {
      // Get single order detail
      const { db } = await connectToDatabase()
      const order = await db.collection('orders').findOne({ orderId })

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      // Get full audit trail
      const statusLogs = await getOrderStatusLogs(orderId)

      // Get delivery assignments
      const assignments = await db.collection('delivery_assignments')
        .find({ orderId })
        .sort({ assignedAt: -1 })
        .toArray()

      return NextResponse.json({
        order: { ...order, _id: order._id.toString() },
        statusLogs,
        assignments: assignments.map((a: Record<string, unknown>) => ({ ...a, _id: a._id.toString() })),
      })
    }

    // List all orders
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    const { orders, total } = await getAllOrders(page, limit, status, search)

    // Get order statistics for the admin dashboard
    const { db } = await connectToDatabase()
    const statusCounts = await db.collection('orders').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray()

    const stats: Record<string, number> = {}
    for (const item of statusCounts) {
      stats[item._id || 'Unknown'] = item.count
    }

    return NextResponse.json({
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats,
    })
  } catch (error) {
    console.error('[Admin Orders GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

// No POST/PUT/DELETE — Admin has READ-ONLY access to orders
