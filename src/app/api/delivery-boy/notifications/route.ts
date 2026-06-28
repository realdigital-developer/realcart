import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateDeliveryBoy } from '@/lib/delivery-boy-api-auth'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  Valid notification types for delivery boy                           */
/* ------------------------------------------------------------------ */

const VALID_TYPES = [
  'order_assigned',
  'order_picked_up',
  'order_delivered',
  'order_failed',
  'order_cancelled',
  'earning_credited',
  'payout_processed',
  'availability_reminder',
  'account_update',
  'system_alert',
] as const

type DeliveryNotificationType = typeof VALID_TYPES[number]

/* ------------------------------------------------------------------ */
/*  Ensure indexes (idempotent, runs once per cold start)               */
/* ------------------------------------------------------------------ */

let indexEnsured = false

async function ensureNotificationIndexes(db: any) {
  if (indexEnsured) return
  try {
    await db.collection('delivery_boy_notifications').createIndex(
      { deliveryBoyId: 1, createdAt: -1 },
      { background: true, name: 'deliveryBoy_createdAt_compound' },
    )
    await db.collection('delivery_boy_notifications').createIndex(
      { deliveryBoyId: 1, read: 1 },
      { background: true, name: 'deliveryBoy_read_compound' },
    )
    console.log('[MongoDB] Delivery boy notifications indexes ensured')
  } catch (err: any) {
    console.warn('[MongoDB] Notifications index creation (non-fatal):', err.message)
  }
  indexEnsured = true
}

/* ------------------------------------------------------------------ */
/*  GET /api/delivery-boy/notifications                                */
/*  Fetch paginated notifications for the authenticated delivery boy   */
/*                                                                     */
/*  OPTIMIZED: Uses a single $facet aggregation for total + unread     */
/*  counts in one round-trip, plus parallel find for notifications.    */
/*  Supports ?countOnly=true for lightweight unread count fetching     */
/*  (used by the bell icon hook).                                      */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const countOnly = searchParams.get('countOnly') === 'true'

    // Ensure indexes on first call (fire-and-forget, non-blocking)
    ensureNotificationIndexes(db)

    const query = { deliveryBoyId: session.id }

    // ── Count-only mode (lightweight, for bell icon hook) ─────────
    if (countOnly) {
      const [facetResult] = await db.collection('delivery_boy_notifications').aggregate([
        { $match: query },
        {
          $facet: {
            total: [{ $count: 'count' }],
            unread: [{ $match: { read: false } }, { $count: 'count' }],
          },
        },
      ]).toArray()

      const facet = facetResult || {}
      return NextResponse.json({
        total: facet.total?.[0]?.count || 0,
        unreadCount: facet.unread?.[0]?.count || 0,
      })
    }

    // ── Full mode: $facet for counts + parallel find ──────────────
    const [facetResult, notifications] = await Promise.all([
      db.collection('delivery_boy_notifications').aggregate([
        { $match: query },
        {
          $facet: {
            total: [{ $count: 'count' }],
            unread: [{ $match: { read: false } }, { $count: 'count' }],
          },
        },
      ]).toArray(),
      db.collection('delivery_boy_notifications')
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ])

    const facet = facetResult || {}
    const total = facet.total?.[0]?.count || 0
    const unreadCount = facet.unread?.[0]?.count || 0

    return NextResponse.json({
      notifications: notifications.map(n => ({ ...n, _id: n._id.toString() })),
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Delivery Boy Notifications GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT /api/delivery-boy/notifications                                */
/*  Mark notifications as read                                         */
/*  Body: { notificationId } or { markAllRead: true }                 */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const body = await request.json()
    const { db } = await connectToDatabase()

    if (body.markAllRead) {
      const result = await db.collection('delivery_boy_notifications').updateMany(
        { deliveryBoyId: session.id, read: false },
        { $set: { read: true } }
      )
      return NextResponse.json({
        success: true,
        message: 'All notifications marked as read',
        modifiedCount: result.modifiedCount,
      })
    }

    if (body.notificationId) {
      if (!ObjectId.isValid(body.notificationId)) {
        return NextResponse.json({ error: 'Invalid notification ID' }, { status: 400 })
      }

      const result = await db.collection('delivery_boy_notifications').updateOne(
        {
          _id: new ObjectId(body.notificationId),
          deliveryBoyId: session.id,
        },
        { $set: { read: true } }
      )

      if (result.matchedCount === 0) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Provide notificationId or markAllRead' }, { status: 400 })
  } catch (error) {
    console.error('[Delivery Boy Notifications PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/delivery-boy/notifications                               */
/*  Create a notification (internal use, called by other APIs)         */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deliveryBoyId, type, title, message, relatedId, relatedType, priority } = body

    if (!deliveryBoyId || !type || !title || !message) {
      return NextResponse.json(
        { error: 'deliveryBoyId, type, title, and message are required' },
        { status: 400 }
      )
    }

    if (!VALID_TYPES.includes(type as DeliveryNotificationType)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const { db } = await connectToDatabase()

    const notification = {
      deliveryBoyId,
      type,
      title,
      message,
      read: false,
      priority: priority || 'normal',
      relatedId: relatedId || null,
      relatedType: relatedType || null,
      createdAt: new Date(),
    }

    const result = await db.collection('delivery_boy_notifications').insertOne(notification)

    return NextResponse.json({
      success: true,
      notification: { ...notification, _id: result.insertedId.toString() },
    }, { status: 201 })
  } catch (error) {
    console.error('[Delivery Boy Notifications POST Error]', error)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/delivery-boy/notifications                             */
/*  Delete a specific notification or clear all read notifications     */
/* ------------------------------------------------------------------ */

export async function DELETE(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const body = await request.json()
    const { db } = await connectToDatabase()

    if (body.clearRead) {
      const result = await db.collection('delivery_boy_notifications').deleteMany({
        deliveryBoyId: session.id,
        read: true,
      })
      return NextResponse.json({
        success: true,
        message: 'All read notifications cleared',
        deletedCount: result.deletedCount,
      })
    }

    if (body.notificationId) {
      if (!ObjectId.isValid(body.notificationId)) {
        return NextResponse.json({ error: 'Invalid notification ID' }, { status: 400 })
      }

      const result = await db.collection('delivery_boy_notifications').deleteOne({
        _id: new ObjectId(body.notificationId),
        deliveryBoyId: session.id,
      })

      if (result.deletedCount === 0) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Provide notificationId or clearRead' }, { status: 400 })
  } catch (error) {
    console.error('[Delivery Boy Notifications DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 })
  }
}
