/**
 * Seller Orders API — /api/seller/orders
 *
 * Endpoints:
 *   GET  /              — List seller's orders (paginated, filterable)
 *   GET  /?orderId=xxx  — Get single order detail
 *   PUT  /?action=processing  — Accept order (Pending → Processing)
 *   PUT  /?action=ship        — Ship order (Processing → Shipped)
 *   PUT  /?action=cancel      — Cancel order
 *   PUT  /?action=assign      — Assign delivery boy
 *   PUT  /?action=approve-return  — Approve return request
 *   PUT  /?action=reject-return   — Reject return request
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import {
  getSellerOrders,
  executeStatusTransition,
  assignDeliveryBoy,
  getOrderStatusLogs,
} from '@/lib/order-helpers'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(request: NextRequest) {
  try {
    // Use authenticateSeller to get both session and sellerAliases
    const { error: authError, session } = await authenticateSeller(request)
    if (authError || !session) {
      return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sellerId = session.id
    const sellerIds = [sellerId, ...session.sellerAliases]
    const uniqueSellerIds = [...new Set(sellerIds)]

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')

    if (orderId) {
      // Get single order detail — match using seller aliases
      const { db } = await connectToDatabase()
      const order = await db.collection('orders').findOne({
        orderId,
        'items.sellerId': { $in: uniqueSellerIds },
      })

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      // Get available delivery boys for assignment
      // NOTE: Delivery boys are stored with status: 'Active' (capitalized).
      // Use case-insensitive query for robustness.
      const deliveryBoys = await db.collection('delivery_boys')
        .find({ status: { $regex: /^active$/i }, isAvailable: true })
        .project({ name: 1, mobile: 1, vehicleType: 1 })
        .limit(20)
        .toArray()

      // Get status logs
      const statusLogs = await getOrderStatusLogs(orderId)

      // Filter items to only this seller's items for privacy
      const filteredItems = (order.items || []).filter(
        (item: { sellerId: string }) => uniqueSellerIds.includes(item.sellerId)
      )

      return NextResponse.json({
        order: { ...order, _id: order._id.toString(), items: filteredItems },
        deliveryBoys: deliveryBoys.map((db: Record<string, unknown>) => ({
          _id: db._id.toString(),
          name: db.name,
          mobile: db.mobile,
          vehicleType: db.vehicleType,
        })),
        statusLogs,
        sellerId, // Pass sellerId so frontend can identify seller's items
      })
    }

    // List orders
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    const { orders, total } = await getSellerOrders(sellerId, page, limit, status, search, session.sellerAliases)

    // Filter items in each order to only this seller's items for privacy
    const filteredOrders = orders.map(order => ({
      ...order,
      items: (order.items || []).filter(
        (item: { sellerId: string }) => uniqueSellerIds.includes(item.sellerId)
      ),
    }))

    return NextResponse.json({
      orders: filteredOrders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Seller Orders GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Use authenticateSeller to get both session and sellerAliases
    const { error: authError, session } = await authenticateSeller(request)
    if (authError || !session) {
      return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sellerId = session.id
    const sellerIds = [sellerId, ...session.sellerAliases]
    const uniqueSellerIds = [...new Set(sellerIds)]

    const body = await request.json()
    const { action, orderId, orderItemId, deliveryBoyId, reason, type: requestType } = body

    if (!orderId || !action) {
      return NextResponse.json({ error: 'orderId and action are required' }, { status: 400 })
    }

    // Verify the order belongs to this seller — match using seller aliases
    const { db } = await connectToDatabase()
    const order = await db.collection('orders').findOne({
      orderId,
      'items.sellerId': { $in: uniqueSellerIds },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    let result

    switch (action) {
      case 'processing':
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Processing',
          role: 'seller',
          userId: session.id,
          userName: session.name || session.storeName || 'Seller',
          reason: 'Order accepted by seller',
        })
        break

      case 'ship': {
        // ── GUARD: Delivery boy must be assigned before shipping ──────
        // Enforces the Meesho/Flipkart/Amazon flow: assign → ship.
        // The seller cannot mark an order as shipped until a delivery boy
        // has been assigned to the order item. This prevents orders from
        // being shipped without a delivery partner to pick them up.
        if (orderItemId) {
          const itemToShip = (order.items || []).find(
            (i: Record<string, unknown>) => i._id === orderItemId
          )
          if (itemToShip && !itemToShip.deliveryBoyId) {
            return NextResponse.json(
              { error: 'Please assign a delivery boy before shipping this order.' },
              { status: 400 }
            )
          }
        }
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Shipped',
          role: 'seller',
          userId: session.id,
          userName: session.name || session.storeName || 'Seller',
          reason: 'Order shipped by seller',
        })
        break
      }

      case 'cancel':
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Cancelled',
          role: 'seller',
          userId: session.id,
          userName: session.name || session.storeName || 'Seller',
          reason: reason || 'Cancelled by seller',
        })
        break

      case 'assign': {
        if (!orderItemId || !deliveryBoyId) {
          return NextResponse.json({ error: 'orderItemId and deliveryBoyId are required' }, { status: 400 })
        }

        // Get delivery boy details
        // NOTE: Use case-insensitive status match for robustness
        const deliveryBoy = await db.collection('delivery_boys').findOne({
          _id: new ObjectId(deliveryBoyId),
          status: { $regex: /^active$/i },
        })

        if (!deliveryBoy) {
          return NextResponse.json({ error: 'Delivery boy not found or inactive' }, { status: 400 })
        }

        // Determine assignment type: use explicit type from frontend if provided,
        // otherwise fall back to determining from order item status.
        // This handles return pickup assignments robustly.
        const item = order.items?.find((i: Record<string, unknown>) => i._id === orderItemId)
        const itemStatus = item?.status as string || ''
        const type = requestType === 'pickup' ? 'pickup' :
                     (itemStatus === 'Return Approved' || itemStatus === 'Out for Pickup' ? 'pickup' : 'delivery')

        result = await assignDeliveryBoy({
          orderId,
          orderItemId,
          deliveryBoyId,
          deliveryBoyName: deliveryBoy.name || '',
          deliveryBoyPhone: deliveryBoy.mobile || '',
          sellerId: session.id,
          sellerName: session.name || session.storeName || 'Seller',
          type,
        })
        break
      }

      case 'approve-return':
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Return Approved',
          role: 'seller',
          userId: session.id,
          userName: session.name || session.storeName || 'Seller',
          reason: 'Return approved by seller',
        })
        break

      case 'reject-return':
        result = await executeStatusTransition({
          orderId,
          orderItemId,
          toStatus: 'Return Cancelled',
          role: 'seller',
          userId: session.id,
          userName: session.name || session.storeName || 'Seller',
          reason: reason || 'Return rejected by seller',
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
    console.error('[Seller Orders PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
