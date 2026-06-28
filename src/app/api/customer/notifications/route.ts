import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'

/**
 * GET /api/customer/notifications
 * Get all notifications for the authenticated customer
 * Supports pagination: ?page=1&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))

    const query = { customerId: customer.id }

    const [total, unreadCount, notifications] = await Promise.all([
      db.collection('notifications').countDocuments(query),
      db.collection('notifications').countDocuments({ ...query, read: false }),
      db.collection('notifications')
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ])

    return NextResponse.json({
      notifications: notifications.map(n => ({ ...n, _id: n._id.toString() })),
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Customer Notifications GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

/**
 * PUT /api/customer/notifications
 * Mark notifications as read
 * Body: { notificationId } or { markAllRead: true }
 */
export async function PUT(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { db } = await connectToDatabase()

    if (body.markAllRead) {
      await db.collection('notifications').updateMany(
        { customerId: customer.id, read: false },
        { $set: { read: true } }
      )
      return NextResponse.json({ success: true, message: 'All notifications marked as read' })
    }

    if (body.notificationId) {
      await db.collection('notifications').updateOne(
        { _id: await import('mongodb').then(m => new m.ObjectId(body.notificationId)), customerId: customer.id },
        { $set: { read: true } }
      )
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (error) {
    console.error('[Customer Notifications PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}

/**
 * POST /api/customer/notifications
 * Create a notification (internal use, called by other APIs)
 * Body: { customerId, type, title, message, relatedId?, relatedType? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, type, title, message, relatedId, relatedType } = body

    if (!customerId || !type || !title || !message) {
      return NextResponse.json({ error: 'customerId, type, title, and message are required' }, { status: 400 })
    }

    const validTypes = [
      'order_placed', 'order_confirmed', 'order_shipped', 'order_out_for_delivery',
      'order_delivered', 'order_cancelled',
      'payment_success', 'payment_failed',
      'refund_processed', 'return_requested', 'return_completed',
      'referral_reward', 'referral_joined',
      'wallet_credit', 'wallet_debit', 'wallet_low_balance',
      'promo', 'price_drop', 'back_in_stock', 'seller_update',
    ]
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid notification type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const notification = {
      customerId,
      type,
      title,
      message,
      read: false,
      relatedId: relatedId || null,
      relatedType: relatedType || null,
      createdAt: new Date(),
    }

    const result = await db.collection('notifications').insertOne(notification)

    return NextResponse.json({
      success: true,
      notification: { ...notification, _id: result.insertedId.toString() },
    })
  } catch (error) {
    console.error('[Customer Notifications POST Error]', error)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}
