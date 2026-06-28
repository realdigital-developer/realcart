/**
 * Delivery Boy Orders API — /api/delivery-boy/orders
 *
 * Endpoints:
 *   GET  /                    — List assigned orders (paginated, filterable)
 *   GET  /?orderId=xxx        — Get single order detail (with OTP prompt)
 *   GET  /?action=assignments — Get pending assignments
 *   PUT  /?action=accept      — Accept delivery assignment
 *   PUT  /?action=reject      — Reject delivery assignment
 *   PUT  /?action=out-for-delivery — Mark Out for Delivery
 *   PUT  /?action=not-delivered    — Mark Not Delivered
 *   PUT  /?action=delivered        — Mark Delivered (requires OTP)
 *   PUT  /?action=out-for-pickup   — Mark Out for Pickup
 *   PUT  /?action=return-completed — Mark Return Completed (requires OTP)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDeliveryBoySession } from '@/lib/delivery-boy-auth'
import {
  getDeliveryBoyOrders,
  getDeliveryBoyAssignments,
  executeStatusTransition,
  respondToAssignment,
} from '@/lib/order-helpers'
import { connectToDatabase } from '@/lib/mongodb'
import { getOrderStatusLogs } from '@/lib/order-helpers'
import { normalizeStatus } from '@/lib/order-state-machine'

export async function GET(request: NextRequest) {
  try {
    const session = await getDeliveryBoySession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const orderId = searchParams.get('orderId')

    // Get pending assignments
    if (action === 'assignments') {
      const assignments = await getDeliveryBoyAssignments(session.id, 'pending')
      return NextResponse.json({ assignments })
    }

    // Get single order detail
    if (orderId) {
      const { db } = await connectToDatabase()
      const order = await db.collection('orders').findOne({
        orderId,
        $or: [
          { 'items.deliveryBoyId': session.id },
          { 'items.pickupDeliveryBoyId': session.id },
        ],
      })

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      // Get the specific items assigned to this delivery boy
      // A delivery boy may be assigned as either delivery or pickup person
      const assignedItems = (order.items || []).filter(
        (i: Record<string, unknown>) =>
          i.deliveryBoyId === session.id || i.pickupDeliveryBoyId === session.id
      )

      // Get status logs
      const statusLogs = await getOrderStatusLogs(orderId)

      return NextResponse.json({
        order: { ...order, _id: order._id.toString() },
        assignedItems,
        statusLogs,
      })
    }

    // List orders
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const status = searchParams.get('status') || ''

    const { orders, total } = await getDeliveryBoyOrders(session.id, page, limit, status)

    return NextResponse.json({
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Delivery Boy Orders GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getDeliveryBoySession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, orderId, orderItemId, assignmentId, otp, reason } = body

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    // Accept/reject assignments don't need orderId
    if (action === 'accept' || action === 'reject') {
      if (!assignmentId) {
        return NextResponse.json({ error: 'assignmentId is required' }, { status: 400 })
      }

      const result = await respondToAssignment({
        assignmentId,
        deliveryBoyId: session.id,
        response: action === 'accept' ? 'accepted' : 'rejected',
        reason,
      })

      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: result.message })
    }

    // All other actions need orderId
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }

    let result

    switch (action) {
      case 'out-for-delivery':
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Out for Delivery',
          role: 'delivery_boy',
          userId: session.id,
          userName: session.name || 'Delivery Boy',
          reason: 'Out for delivery',
        })
        break

      case 'not-delivered':
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Not Delivered',
          role: 'delivery_boy',
          userId: session.id,
          userName: session.name || 'Delivery Boy',
          reason: reason || 'Delivery failed',
        })
        break

      case 'delivered':
        if (!otp) {
          return NextResponse.json({ error: 'OTP is required to mark as delivered' }, { status: 400 })
        }
        if (!orderItemId) {
          return NextResponse.json({ error: 'orderItemId is required' }, { status: 400 })
        }
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Delivered',
          role: 'delivery_boy',
          userId: session.id,
          userName: session.name || 'Delivery Boy',
          otp,
        })
        break

      case 'out-for-pickup':
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Out for Pickup',
          role: 'delivery_boy',
          userId: session.id,
          userName: session.name || 'Delivery Boy',
          reason: 'Out for return pickup',
        })
        break

      case 'return-completed':
        if (!otp) {
          return NextResponse.json({ error: 'OTP is required to complete return' }, { status: 400 })
        }
        if (!orderItemId) {
          return NextResponse.json({ error: 'orderItemId is required' }, { status: 400 })
        }
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Return Completed',
          role: 'delivery_boy',
          userId: session.id,
          userName: session.name || 'Delivery Boy',
          otp,
        })
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: result.message })
  } catch (error) {
    console.error('[Delivery Boy Orders PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
