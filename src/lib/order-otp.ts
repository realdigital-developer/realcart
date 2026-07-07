/**
 * Order OTP System — Secure Verification for Delivery & Return Pickup
 *
 * Generates, validates, and manages OTPs for:
 *   - Forward delivery (delivery boy completes delivery with customer OTP)
 *   - Return pickup (delivery boy picks up return with customer OTP)
 *
 * Security features:
 *   - 6-digit OTP with configurable expiry (default: 24 hours)
 *   - Max 5 verification attempts per OTP
 *   - OTP is visible to customer (UI + email) but NOT to delivery boy
 *   - Auto-regeneration on expiry
 *   - One-time use (OTP invalidated after successful verification)
 */

import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** OTP length in digits */
const OTP_LENGTH = 6

/** OTP expiry time in milliseconds (24 hours) */
const OTP_EXPIRY_MS = 24 * 60 * 60 * 1000

/** Maximum verification attempts before OTP is invalidated */
const MAX_OTP_ATTEMPTS = 5

/* ------------------------------------------------------------------ */
/*  OTP Generation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Generate a random 6-digit OTP code.
 * Uses crypto.randomInt for cryptographically secure randomness.
 */
function generateOTPCode(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomInt } = require('crypto')
  const min = Math.pow(10, OTP_LENGTH - 1)
  const max = Math.pow(10, OTP_LENGTH)
  return randomInt(min, max).toString()
}

/**
 * Create a new OTP for an order item.
 * If an active (unexpired, unverified) OTP exists, return it instead.
 *
 * @param orderId - The order ID
 * @param orderItemId - The order item ID
 * @param type - 'delivery' or 'pickup'
 * @returns The OTP code
 */
export async function createOrderOTP(
  orderId: string,
  orderItemId: string,
  type: 'delivery' | 'pickup',
): Promise<string> {
  const { db } = await connectToDatabase()

  // Check if there's an existing active OTP
  const existingOTP = await db.collection('order_otps').findOne({
    orderId,
    orderItemId,
    type,
    verified: false,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: MAX_OTP_ATTEMPTS },
  })

  if (existingOTP) {
    return existingOTP.code
  }

  // Generate new OTP
  const code = generateOTPCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS)

  await db.collection('order_otps').insertOne({
    orderId,
    orderItemId,
    code,
    type,
    verified: false,
    expiresAt,
    attempts: 0,
    createdAt: now,
  })

  console.log(`[OTP] Generated ${type} OTP for order item ${orderItemId}: ****`)

  return code
}

/**
 * Verify an OTP code for delivery/pickup completion.
 *
 * @returns { success: boolean, message: string }
 */
export async function verifyOrderOTP(
  orderId: string,
  orderItemId: string,
  code: string,
  type: 'delivery' | 'pickup',
  deliveryBoyId: string,
): Promise<{ success: boolean; message: string }> {
  const { db } = await connectToDatabase()

  // Find the OTP record
  const otpRecord = await db.collection('order_otps').findOne({
    orderId,
    orderItemId,
    type,
    verified: false,
  })

  if (!otpRecord) {
    return { success: false, message: 'No active OTP found. Please request a new OTP.' }
  }

  // Check if OTP has expired
  if (otpRecord.expiresAt < new Date()) {
    return { success: false, message: 'OTP has expired. Please request a new OTP.' }
  }

  // Check if max attempts reached
  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    return { success: false, message: 'Maximum verification attempts reached. Please request a new OTP.' }
  }

  // Increment attempt count
  await db.collection('order_otps').updateOne(
    { _id: otpRecord._id },
    { $inc: { attempts: 1 } },
  )

  // Check if OTP matches
  if (otpRecord.code !== code) {
    const remaining = MAX_OTP_ATTEMPTS - otpRecord.attempts - 1
    return {
      success: false,
      message: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
    }
  }

  // Mark OTP as verified
  await db.collection('order_otps').updateOne(
    { _id: otpRecord._id },
    {
      $set: {
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: deliveryBoyId,
      },
    },
  )

  console.log(`[OTP] ${type} OTP verified for order item ${orderItemId} by delivery boy ${deliveryBoyId}`)

  return { success: true, message: 'OTP verified successfully' }
}

/**
 * Get the active OTP for a customer to view.
 * This is what the customer sees on their order detail page.
 */
export async function getCustomerOTP(
  orderId: string,
  orderItemId: string,
  type: 'delivery' | 'pickup',
): Promise<{ code: string; expiresAt: string } | null> {
  const { db } = await connectToDatabase()

  const otpRecord = await db.collection('order_otps').findOne({
    orderId,
    orderItemId,
    type,
    verified: false,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: MAX_OTP_ATTEMPTS },
  })

  if (!otpRecord) {
    return null
  }

  return {
    code: otpRecord.code,
    expiresAt: otpRecord.expiresAt.toISOString(),
  }
}

/**
 * Regenerate OTP for an order item (e.g., when expired).
 * Invalidates the old OTP and creates a new one.
 */
export async function regenerateOTP(
  orderId: string,
  orderItemId: string,
  type: 'delivery' | 'pickup',
): Promise<string> {
  const { db } = await connectToDatabase()

  // Invalidate any existing OTPs for this order item
  await db.collection('order_otps').updateMany(
    {
      orderId,
      orderItemId,
      type,
      verified: false,
    },
    { $set: { verified: true, expiresAt: new Date() } },
  )

  // Create a new OTP
  return createOrderOTP(orderId, orderItemId, type)
}
