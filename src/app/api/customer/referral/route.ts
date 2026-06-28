/**
 * Customer Referral API
 * -------------------------------------------------------------------
 * GET   /api/customer/referral          — fetch referral code, stats, history, program config
 * POST  /api/customer/referral          — validate + apply a referral code (links referrer)
 *
 * MongoDB collections:
 *   referral_programs  — single active program config (admin-managed)
 *   referrals          — one doc per referred friend
 *   customer_wallets   — wallet balance + transactions (referral rewards credit here)
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Generate a unique, human-readable referral code from the customer's name. */
function generateReferralCode(name: string, mobile: string): string {
  const base = (name || `USER${mobile.slice(-4)}`)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
    .padEnd(4, 'USER'.slice(0, 4))
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `${base}-${suffix}`
}

/** Fetch the active referral program config (admin-managed). */
async function getActiveProgram(db: import('mongodb').Db) {
  return db.collection('referral_programs').findOne({ status: 'active' }, {
    sort: { updatedAt: -1 },
  })
}

// ── GET: referral code, stats, invited friends, program config ──
export async function GET(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const customersCol = db.collection('customers')
    const referralsCol = db.collection('referrals')

    // ── Ensure the customer has a referral code ──
    const customerDoc = await customersCol.findOne({ _id: new ObjectId(customer.id) })
    if (!customerDoc) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    let referralCode = customerDoc.referralCode as string | undefined
    if (!referralCode) {
      referralCode = generateReferralCode(customerDoc.name || customer.mobile, customer.mobile)
      // Ensure uniqueness — retry with a fresh suffix on collision
      let attempts = 0
      while (attempts < 5) {
        const exists = await customersCol.findOne({ referralCode })
        if (!exists) break
        referralCode = generateReferralCode(customerDoc.name || customer.mobile, customer.mobile)
        attempts++
      }
      await customersCol.updateOne(
        { _id: new ObjectId(customer.id) },
        { $set: { referralCode, referredBy: customerDoc.referredBy || null } },
      )
    }

    // ── Fetch the active program config ──
    const program = await getActiveProgram(db)

    // ── Fetch the customer's invited friends (referrals they made) ──
    const referrals = await referralsCol
      .find({ referrerId: customer.id })
      .sort({ createdAt: -1 })
      .toArray()

    // Enrich with referee name (masked mobile for privacy)
    const refereeIds = referrals
      .map((r) => r.refereeId)
      .filter((id): id is string => !!id)
      .map((id) => {
        try { return new ObjectId(id) } catch { return null }
      })
      .filter((id): id is ObjectId => id !== null)

    const refereeDocs = refereeIds.length > 0
      ? await customersCol.find({ _id: { $in: refereeIds } }, { projection: { name: 1, mobile: 1, createdAt: 1 } }).toArray()
      : []
    const refereeMap = new Map(refereeDocs.map((d) => [d._id.toString(), d]))

    const invitedFriends = referrals.map((r) => {
      const ref = refereeMap.get(r.refereeId || '')
      const maskedMobile = ref?.mobile ? `${ref.mobile.slice(0, 2)}••••${ref.mobile.slice(-2)}` : '—'
      return {
        id: r._id.toString(),
        friendName: ref?.name || 'New User',
        friendMobile: maskedMobile,
        status: r.status, // pending | qualified | rewarded | cancelled
        rewardAmount: r.referrerRewardAmount || 0,
        joinedAt: r.createdAt,
        qualifiedAt: r.qualifiedAt || null,
        rewardedAt: r.rewardedAt || null,
        orderCount: r.refereeOrderCount || 0,
      }
    })

    // ── Compute stats ──
    const totalInvited = referrals.length
    const totalQualified = referrals.filter((r) => ['qualified', 'rewarded'].includes(r.status)).length
    const totalRewarded = referrals.filter((r) => r.status === 'rewarded').length
    const totalEarnings = referrals
      .filter((r) => r.status === 'rewarded')
      .reduce((sum, r) => sum + (r.referrerRewardAmount || 0), 0)
    const pendingEarnings = referrals
      .filter((r) => r.status === 'qualified')
      .reduce((sum, r) => sum + (r.referrerRewardAmount || 0), 0)

    // ── Fetch wallet balance (for display) ──
    const wallet = await db.collection('customer_wallets').findOne({ customerId: customer.id })
    const walletBalance = wallet?.balance || 0

    // ── Has the customer been referred by someone? (show referrer name) ──
    let referredByInfo: { name: string; rewarded: boolean } | null = null
    if (customerDoc.referredBy) {
      const referrerDoc = await customersCol.findOne(
        { referralCode: customerDoc.referredBy },
        { projection: { name: 1 } },
      )
      if (referrerDoc) {
        const incomingRef = await referralsCol.findOne({
          refereeId: customer.id,
          referrerId: referrerDoc._id.toString(),
        })
        referredByInfo = {
          name: referrerDoc.name || 'Friend',
          rewarded: incomingRef?.status === 'rewarded',
        }
      }
    }

    return NextResponse.json({
      referralCode,
      shareMessage: program?.shareMessage || `Hey! I'm using RealCart for the best deals. Sign up with my referral code ${referralCode} and get exciting rewards! 🎁`,
      shareUrl: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/customer?ref=${referralCode}`,
      program: program ? {
        id: program._id.toString(),
        name: program.name || 'Refer & Earn',
        referrerReward: program.referrerReward || 0,
        refereeReward: program.refereeReward || 0,
        rewardType: program.rewardType || 'wallet',
        minOrderValue: program.minOrderValue || 0,
        termsAndConditions: program.termsAndConditions || [],
        isActive: true,
      } : null,
      stats: {
        totalInvited,
        totalQualified,
        totalRewarded,
        totalEarnings,
        pendingEarnings,
        walletBalance,
      },
      invitedFriends,
      referredBy: referredByInfo,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/referral] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch referral data' }, { status: 500 })
  }
}

// ── POST: validate + apply a referral code (links the current customer to a referrer) ──
// Body: { referralCode: string }
// Returns: { valid: boolean, referrerName?: string }
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { referralCode } = body

    if (!referralCode || typeof referralCode !== 'string') {
      return NextResponse.json({ error: 'Referral code is required' }, { status: 400 })
    }

    const code = referralCode.trim().toUpperCase()
    const { db } = await connectToDatabase()

    // Prevent self-referral
    const selfDoc = await db.collection('customers').findOne({ _id: new ObjectId(customer.id) })
    if (selfDoc?.referralCode === code) {
      return NextResponse.json({ valid: false, error: 'You cannot use your own referral code' }, { status: 400 })
    }

    // Already referred — can't change referrer
    if (selfDoc?.referredBy) {
      return NextResponse.json({ valid: false, error: 'You have already used a referral code' }, { status: 400 })
    }

    // Find the referrer
    const referrer = await db.collection('customers').findOne({ referralCode: code })
    if (!referrer) {
      return NextResponse.json({ valid: false, error: 'Invalid referral code' }, { status: 404 })
    }

    // Link the customer to the referrer
    await db.collection('customers').updateOne(
      { _id: new ObjectId(customer.id) },
      { $set: { referredBy: code } },
    )

    // Create a referral record (status: pending — qualifies on first delivered order)
    const program = await getActiveProgram(db)
    await db.collection('referrals').insertOne({
      referrerId: referrer._id.toString(),
      refereeId: customer.id,
      referralCode: code,
      status: 'pending',
      referrerRewardAmount: program?.referrerReward || 0,
      refereeRewardAmount: program?.refereeReward || 0,
      refereeOrderCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      valid: true,
      referrerName: referrer.name || 'Friend',
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/customer/referral] error:', msg)
    return NextResponse.json({ error: 'Failed to validate referral code' }, { status: 500 })
  }
}
