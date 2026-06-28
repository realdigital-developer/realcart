/**
 * Customer Notification Helper
 * -------------------------------------------------------------------
 * Centralized function to create customer notifications.
 * Used by: order creation, payment processing, refunds, returns,
 * referral rewards, wallet transactions, order status updates.
 *
 * Collection: notifications
 *   { _id, customerId, type, title, message, read, relatedId, relatedType, createdAt }
 */

import { connectToDatabase } from '@/lib/mongodb'

export type CustomerNotificationType =
  | 'order_placed'
  | 'order_confirmed'
  | 'order_shipped'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled'
  | 'payment_success'
  | 'payment_failed'
  | 'refund_processed'
  | 'return_requested'
  | 'return_completed'
  | 'referral_reward'
  | 'referral_joined'
  | 'wallet_credit'
  | 'wallet_debit'
  | 'wallet_low_balance'
  | 'promo'
  | 'price_drop'
  | 'back_in_stock'
  | 'seller_update'

export interface CustomerNotificationInput {
  customerId: string
  type: CustomerNotificationType
  title: string
  message: string
  relatedId?: string
  relatedType?: string
}

/**
 * Create a customer notification. Fire-and-forget — never throws.
 * Safe to call from any async context (order creation, refund, etc.)
 */
export async function createCustomerNotification(input: CustomerNotificationInput): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    await db.collection('notifications').insertOne({
      customerId: input.customerId,
      type: input.type,
      title: input.title,
      message: input.message,
      read: false,
      relatedId: input.relatedId || null,
      relatedType: input.relatedType || null,
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    // Non-critical — log but never throw
    console.error('[Notification Helper] Failed to create notification:', error)
  }
}

/**
 * Create multiple notifications at once (batch).
 */
export async function createCustomerNotifications(inputs: CustomerNotificationInput[]): Promise<void> {
  if (!inputs.length) return
  try {
    const { db } = await connectToDatabase()
    const now = new Date().toISOString()
    await db.collection('notifications').insertMany(
      inputs.map((input) => ({
        customerId: input.customerId,
        type: input.type,
        title: input.title,
        message: input.message,
        read: false,
        relatedId: input.relatedId || null,
        relatedType: input.relatedType || null,
        createdAt: now,
      }))
    )
  } catch (error) {
    console.error('[Notification Helper] Failed to create notifications (batch):', error)
  }
}
