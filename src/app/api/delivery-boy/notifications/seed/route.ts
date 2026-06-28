import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateDeliveryBoy } from '@/lib/delivery-boy-api-auth'

/**
 * POST /api/delivery-boy/notifications/seed
 * Seeds demo notifications for the authenticated delivery boy (testing only)
 */
export async function POST(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const deliveryBoyId = session.id

    // Check if already has notifications
    const existingCount = await db.collection('delivery_boy_notifications').countDocuments({ deliveryBoyId })
    if (existingCount > 0) {
      return NextResponse.json({
        message: 'Notifications already exist',
        count: existingCount,
      })
    }

    const now = new Date()
    const hour = 3600000
    const day = 86400000

    const seedNotifications = [
      {
        deliveryBoyId,
        type: 'order_assigned',
        title: 'New Delivery Assigned',
        message: 'Order #ORD-2024-0847 has been assigned to you. Pickup from TechHub Store, Koramangala.',
        read: false,
        priority: 'high',
        relatedId: 'order_847',
        relatedType: 'order',
        createdAt: new Date(now.getTime() - 5 * 60000),
      },
      {
        deliveryBoyId,
        type: 'order_assigned',
        title: 'New Delivery Assigned',
        message: 'Order #ORD-2024-0851 is ready for pickup at FashionMart, HSR Layout.',
        read: false,
        priority: 'normal',
        relatedId: 'order_851',
        relatedType: 'order',
        createdAt: new Date(now.getTime() - 25 * 60000),
      },
      {
        deliveryBoyId,
        type: 'earning_credited',
        title: 'Earnings Credited',
        message: '₹45 delivery fee has been credited to your wallet for Order #ORD-2024-0839.',
        read: false,
        priority: 'normal',
        relatedId: 'earning_839',
        relatedType: 'earning',
        createdAt: new Date(now.getTime() - 1.5 * hour),
      },
      {
        deliveryBoyId,
        type: 'order_delivered',
        title: 'Delivery Completed! 🎉',
        message: 'Order #ORD-2024-0839 has been successfully delivered. Customer rated you 5 stars!',
        read: true,
        priority: 'normal',
        relatedId: 'order_839',
        relatedType: 'order',
        createdAt: new Date(now.getTime() - 2 * hour),
      },
      {
        deliveryBoyId,
        type: 'order_failed',
        title: 'Delivery Failed',
        message: 'Order #ORD-2024-0832 could not be delivered. Customer was unavailable. Please contact support if needed.',
        read: true,
        priority: 'high',
        relatedId: 'order_832',
        relatedType: 'order',
        createdAt: new Date(now.getTime() - 4 * hour),
      },
      {
        deliveryBoyId,
        type: 'payout_processed',
        title: 'Weekly Payout Processed',
        message: 'Your weekly earnings of ₹2,340 have been processed and will be credited within 24 hours.',
        read: false,
        priority: 'normal',
        relatedId: 'payout_weekly',
        relatedType: 'payout',
        createdAt: new Date(now.getTime() - 6 * hour),
      },
      {
        deliveryBoyId,
        type: 'availability_reminder',
        title: 'You\'re Currently Offline',
        message: 'You haven\'t been online for 2 hours. Go online to start receiving delivery assignments.',
        read: true,
        priority: 'low',
        relatedId: null,
        relatedType: null,
        createdAt: new Date(now.getTime() - 8 * hour),
      },
      {
        deliveryBoyId,
        type: 'order_picked_up',
        title: 'Pickup Confirmed',
        message: 'You\'ve successfully picked up Order #ORD-2024-0828 from BookWorm, Indiranagar. Head to the delivery address.',
        read: true,
        priority: 'normal',
        relatedId: 'order_828',
        relatedType: 'order',
        createdAt: new Date(now.getTime() - 1 * day),
      },
      {
        deliveryBoyId,
        type: 'system_alert',
        title: 'App Update Available',
        message: 'A new version of RealCart Delivery is available. Please update for the best experience and latest features.',
        read: true,
        priority: 'low',
        relatedId: null,
        relatedType: null,
        createdAt: new Date(now.getTime() - 1.5 * day),
      },
      {
        deliveryBoyId,
        type: 'account_update',
        title: 'KYC Verification Approved',
        message: 'Your Aadhaar and PAN verification has been approved. You now have access to all delivery features.',
        read: true,
        priority: 'normal',
        relatedId: null,
        relatedType: 'account',
        createdAt: new Date(now.getTime() - 2 * day),
      },
      {
        deliveryBoyId,
        type: 'earning_credited',
        title: 'Bonus Earning! 🎁',
        message: 'You earned a ₹100 bonus for completing 5 deliveries in a single day. Keep up the great work!',
        read: true,
        priority: 'normal',
        relatedId: 'bonus_5day',
        relatedType: 'earning',
        createdAt: new Date(now.getTime() - 2.5 * day),
      },
      {
        deliveryBoyId,
        type: 'order_cancelled',
        title: 'Order Cancelled',
        message: 'Order #ORD-2024-0815 has been cancelled by the customer. No action needed from your side.',
        read: true,
        priority: 'low',
        relatedId: 'order_815',
        relatedType: 'order',
        createdAt: new Date(now.getTime() - 3 * day),
      },
    ]

    const result = await db.collection('delivery_boy_notifications').insertMany(seedNotifications)

    return NextResponse.json({
      success: true,
      message: `Seeded ${result.insertedCount} notifications`,
      count: result.insertedCount,
    })
  } catch (error) {
    console.error('[Delivery Boy Notifications Seed Error]', error)
    return NextResponse.json({ error: 'Failed to seed notifications' }, { status: 500 })
  }
}
