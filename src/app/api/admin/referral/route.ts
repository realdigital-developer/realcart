/**
 * Admin Referral Program API
 * -------------------------------------------------------------------
 * GET   /api/admin/referral           — fetch program config + analytics summary
 * POST  /api/admin/referral           — create / update program config
 * PATCH /api/admin/referral           — toggle program status (active/inactive)
 *
 * MongoDB collection: referral_programs
 *   {
 *     _id, name, status: 'active'|'inactive',
 *     rewardType: 'wallet'|'discount_coupon',
 *     referrerReward: number,     // reward for the person who refers
 *     refereeReward: number,      // reward for the new joiner
 *     minOrderValue: number,      // min order value to qualify the referral
 *     shareMessage: string,
 *     termsAndConditions: string[],
 *     createdAt, updatedAt
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ensure admin is authenticated. */
async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return null
  return session
}

// ── GET: program config + analytics ──
export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    // Fetch the latest program (active or inactive)
    const program = await db.collection('referral_programs').findOne({}, {
      sort: { updatedAt: -1 },
    })

    // ── Analytics ──
    const referralsCol = db.collection('referrals')
    const customersCol = db.collection('customers')

    const [totalReferrals, totalQualified, totalRewarded, totalPending, totalRewardedDocs] = await Promise.all([
      referralsCol.countDocuments({}),
      referralsCol.countDocuments({ status: { $in: ['qualified', 'rewarded'] } }),
      referralsCol.countDocuments({ status: 'rewarded' }),
      referralsCol.countDocuments({ status: 'pending' }),
      referralsCol.find({ status: 'rewarded' }).toArray(),
    ])

    const totalReferrerPayout = totalRewardedDocs.reduce((sum, r) => sum + (r.referrerRewardAmount || 0), 0)
    const totalRefereePayout = totalRewardedDocs.reduce((sum, r) => sum + (r.refereeRewardAmount || 0), 0)
    const totalPayout = totalReferrerPayout + totalRefereePayout

    // Customers with referral codes
    const customersWithCodes = await customersCol.countDocuments({ referralCode: { $exists: true, $ne: null } })

    // Recent referrals (last 20) with enriched names
    const recentReferrals = await referralsCol.find({}).sort({ createdAt: -1 }).limit(20).toArray()
    const referrerIds = [...new Set(recentReferrals.map((r) => r.referrerId).filter(Boolean))]
      .map((id) => { try { return new ObjectId(id) } catch { return null } })
      .filter((id): id is ObjectId => id !== null)
    const refereeIds = [...new Set(recentReferrals.map((r) => r.refereeId).filter(Boolean))]
      .map((id) => { try { return new ObjectId(id) } catch { return null } })
      .filter((id): id is ObjectId => id !== null)

    const [referrerDocs, refereeDocsArr] = await Promise.all([
      referrerIds.length ? customersCol.find({ _id: { $in: referrerIds } }, { projection: { name: 1, mobile: 1 } }).toArray() : Promise.resolve([]),
      refereeIds.length ? customersCol.find({ _id: { $in: refereeIds } }, { projection: { name: 1, mobile: 1 } }).toArray() : Promise.resolve([]),
    ])
    const referrerMap = new Map(referrerDocs.map((d) => [d._id.toString(), d]))
    const refereeMap = new Map(refereeDocsArr.map((d) => [d._id.toString(), d]))

    const recent = recentReferrals.map((r) => {
      const ref = referrerMap.get(r.referrerId || '')
      const fee = refereeMap.get(r.refereeId || '')
      return {
        id: r._id.toString(),
        referrerName: ref?.name || '—',
        referrerMobile: ref?.mobile || '—',
        refereeName: fee?.name || '—',
        refereeMobile: fee?.mobile ? `${fee.mobile.slice(0, 2)}••••${fee.mobile.slice(-2)}` : '—',
        referralCode: r.referralCode,
        status: r.status,
        referrerReward: r.referrerRewardAmount || 0,
        refereeReward: r.refereeRewardAmount || 0,
        createdAt: r.createdAt,
        qualifiedAt: r.qualifiedAt || null,
        rewardedAt: r.rewardedAt || null,
      }
    })

    return NextResponse.json({
      program: program ? {
        id: program._id.toString(),
        name: program.name || 'Refer & Earn',
        status: program.status || 'inactive',
        rewardType: program.rewardType || 'wallet',
        referrerReward: program.referrerReward || 0,
        refereeReward: program.refereeReward || 0,
        minOrderValue: program.minOrderValue || 0,
        shareMessage: program.shareMessage || '',
        termsAndConditions: program.termsAndConditions || [],
        createdAt: program.createdAt,
        updatedAt: program.updatedAt,
      } : null,
      analytics: {
        totalReferrals,
        totalQualified,
        totalRewarded,
        totalPending,
        customersWithCodes,
        totalReferrerPayout,
        totalRefereePayout,
        totalPayout,
        conversionRate: totalReferrals > 0 ? Math.round((totalQualified / totalReferrals) * 100) : 0,
      },
      recent,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/admin/referral] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch referral program' }, { status: 500 })
  }
}

// ── POST: create / update program config ──
export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      id,
      name,
      status,
      rewardType,
      referrerReward,
      refereeReward,
      minOrderValue,
      shareMessage,
      termsAndConditions,
    } = body

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Program name is required' }, { status: 400 })
    }
    if (!['wallet', 'discount_coupon'].includes(rewardType)) {
      return NextResponse.json({ error: 'Invalid reward type' }, { status: 400 })
    }
    if (typeof referrerReward !== 'number' || referrerReward < 0) {
      return NextResponse.json({ error: 'Referrer reward must be a non-negative number' }, { status: 400 })
    }
    if (typeof refereeReward !== 'number' || refereeReward < 0) {
      return NextResponse.json({ error: 'Referee reward must be a non-negative number' }, { status: 400 })
    }
    if (typeof minOrderValue !== 'number' || minOrderValue < 0) {
      return NextResponse.json({ error: 'Min order value must be a non-negative number' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const now = new Date().toISOString()

    // Normalize terms & conditions into a string array
    const tnc: string[] = Array.isArray(termsAndConditions)
      ? termsAndConditions.filter((t: unknown) => typeof t === 'string' && t.trim().length > 0).map((t: string) => t.trim())
      : typeof termsAndConditions === 'string'
        ? termsAndConditions.split('\n').map((t) => t.trim()).filter(Boolean)
        : []

    const doc = {
      name: name.trim(),
      status: status === 'active' ? 'active' : 'inactive',
      rewardType,
      referrerReward: Math.round(referrerReward * 100) / 100,
      refereeReward: Math.round(refereeReward * 100) / 100,
      minOrderValue: Math.round(minOrderValue * 100) / 100,
      shareMessage: (shareMessage || '').trim(),
      termsAndConditions: tnc,
      updatedAt: now,
    }

    if (id && ObjectId.isValid(id)) {
      // If activating this program, deactivate all others (only one active at a time)
      if (doc.status === 'active') {
        await db.collection('referral_programs').updateMany(
          { _id: { $ne: new ObjectId(id) } },
          { $set: { status: 'inactive', updatedAt: now } },
        )
      }
      await db.collection('referral_programs').updateOne(
        { _id: new ObjectId(id) },
        { $set: doc },
      )
      return NextResponse.json({ success: true, id })
    }

    // Create new — if active, deactivate others
    if (doc.status === 'active') {
      await db.collection('referral_programs').updateMany(
        {},
        { $set: { status: 'inactive', updatedAt: now } },
      )
    }
    const result = await db.collection('referral_programs').insertOne({
      ...doc,
      createdAt: now,
    })
    return NextResponse.json({ success: true, id: result.insertedId.toString() })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/admin/referral] error:', msg)
    return NextResponse.json({ error: 'Failed to save referral program' }, { status: 500 })
  }
}

// ── PATCH: toggle program status ──
export async function PATCH(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, status } = body

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Valid ID is required' }, { status: 400 })
    }
    if (!['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const now = new Date().toISOString()

    if (status === 'active') {
      // Deactivate all others
      await db.collection('referral_programs').updateMany(
        { _id: { $ne: new ObjectId(id) } },
        { $set: { status: 'inactive', updatedAt: now } },
      )
    }
    await db.collection('referral_programs').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: now } },
    )
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[PATCH /api/admin/referral] error:', msg)
    return NextResponse.json({ error: 'Failed to update program status' }, { status: 500 })
  }
}
