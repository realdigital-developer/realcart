/**
 * Referral Engine — qualifies + rewards referrals on order delivery.
 * -------------------------------------------------------------------
 * Called from order-helpers.ts handleDeliveryComplete() when an order
 * transitions to "Delivered". If the ordering customer was referred by
 * someone AND this is their FIRST delivered order, the referral qualifies
 * and both referrer + referee receive their rewards (credited to wallet).
 *
 * Reward flow (Meesho-style):
 *   1. New customer signs up using a friend's referral code → referral
 *      record created with status "pending".
 *   2. New customer places their first order → still "pending".
 *   3. First order is DELIVERED → referral qualifies → status becomes
 *      "qualified", then immediately "rewarded" with wallet credits.
 *
 * All reward credits are logged in customer_wallets.transactions[] for
 * audit. Failures are non-blocking (logged) so delivery never fails due
 * to referral issues.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { createCustomerNotification } from './customer-notifications'

/**
 * Process referral qualification for a customer whose order was just delivered.
 * Safe to call on every delivery — it no-ops if the customer has no referral
 * or already received their reward.
 */
export async function processReferralOnDelivery(customerId: string, orderId: string): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    const customersCol = db.collection('customers')
    const referralsCol = db.collection('referrals')
    const walletsCol = db.collection('customer_wallets')

    // 1. Find the customer + check if they were referred
    const customer = await customersCol.findOne({ _id: new ObjectId(customerId) })
    if (!customer || !customer.referredBy) {
      return // Not referred — nothing to do
    }

    // 2. Find the pending referral record for this referee
    const referral = await referralsCol.findOne({
      refereeId: customerId,
      status: 'pending',
    })
    if (!referral) {
      return // No pending referral (already rewarded or cancelled)
    }

    // 3. Count the referee's delivered orders (this is the qualifying trigger)
    //    A referral qualifies on the FIRST delivered order.
    const deliveredOrdersCount = await db.collection('orders').countDocuments({
      customerId,
      status: 'Delivered',
    })

    // Update the referral's order count
    await referralsCol.updateOne(
      { _id: referral._id },
      { $set: { refereeOrderCount: deliveredOrdersCount, updatedAt: new Date().toISOString() } },
    )

    if (deliveredOrdersCount < 1) {
      return // Not yet qualified
    }

    // 4. Qualify + reward the referral
    const now = new Date().toISOString()
    const referrerReward = referral.referrerRewardAmount || 0
    const refereeReward = referral.refereeRewardAmount || 0

    // 4a. Credit the referrer's wallet
    if (referrerReward > 0 && referral.referrerId) {
      await creditWallet(
        walletsCol,
        referral.referrerId,
        referrerReward,
        `Referral reward — ${customer.name || customer.mobile} joined using your code`,
        referral._id.toString(),
        orderId,
      )
    }

    // 4b. Credit the referee's wallet (the new customer)
    if (refereeReward > 0) {
      await creditWallet(
        walletsCol,
        customerId,
        refereeReward,
        `Referral welcome bonus — joined via ${referral.referralCode}`,
        referral._id.toString(),
        orderId,
      )
    }

    // 4c. Mark referral as rewarded
    await referralsCol.updateOne(
      { _id: referral._id },
      {
        $set: {
          status: 'rewarded',
          qualifiedAt: now,
          rewardedAt: now,
          updatedAt: now,
        },
      },
    )

    console.log(`[Referral] Rewarded: referrer=${referral.referrerId} (+₹${referrerReward}), referee=${customerId} (+₹${refereeReward}), order=${orderId}`)

    // === Send notifications: Referral reward to both referrer + referee ===
    if (referrerReward > 0 && referral.referrerId) {
      await createCustomerNotification({
        customerId: referral.referrerId,
        type: 'referral_reward',
        title: 'Referral Reward Earned! 🎁',
        message: `₹${referrerReward} credited to your RealCart Balance! Your friend's order ${orderId} was delivered. Keep referring to earn more!`,
        relatedId: orderId,
        relatedType: 'referral',
      })
    }
    if (refereeReward > 0) {
      await createCustomerNotification({
        customerId,
        type: 'referral_reward',
        title: 'Referral Welcome Bonus! 🎉',
        message: `₹${refereeReward} credited to your RealCart Balance as a welcome bonus! Your first order was delivered successfully.`,
        relatedId: orderId,
        relatedType: 'referral',
      })
    }
  } catch (error: unknown) {
    // Non-blocking — never fail delivery due to referral issues
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[Referral] processReferralOnDelivery error for customer ${customerId}:`, msg)
  }
}

/**
 * Credit a customer's wallet. Creates the wallet doc if it doesn't exist.
 * Logs the transaction in the wallet's transactions[] array.
 */
async function creditWallet(
  walletsCol: import('mongodb').Collection,
  customerId: string,
  amount: number,
  description: string,
  referralId: string,
  orderId: string,
): Promise<void> {
  const txn = {
    id: new ObjectId().toString(),
    type: 'credit',
    source: 'referral',
    amount,
    description,
    referralId,
    orderId,
    status: 'completed',
    createdAt: new Date().toISOString(),
  }

  // Try to increment existing wallet
  const result = await walletsCol.updateOne(
    { customerId },
    {
      $inc: { balance: amount },
      $push: { transactions: txn },
      $set: { updatedAt: new Date().toISOString() },
    },
  )

  if (result.matchedCount === 0) {
    // Wallet doesn't exist — create it
    await walletsCol.insertOne({
      customerId,
      balance: amount,
      transactions: [txn],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
}
