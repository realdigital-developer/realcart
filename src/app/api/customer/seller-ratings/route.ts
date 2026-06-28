/**
 * Customer Seller Ratings API
 * -------------------------------------------------------------------
 * GET    /api/customer/seller-ratings?storeName=<name>           — fetch aggregate rating + distribution + recent reviews
 * GET    /api/customer/seller-ratings?sellerId=<id>              — same, by sellerId
 * POST   /api/customer/seller-ratings                            — submit/update a seller rating { storeName, rating, review? }
 * PATCH  /api/customer/seller-ratings                            — check if customer has rated { storeName } → { hasRated, myRating }
 *
 * MongoDB collection: seller_ratings
 *   { _id, customerId, customerName, sellerId, storeName, rating (1-5), review?, status, createdAt, updatedAt }
 *
 * Meesho/Flipkart-style: customers can rate sellers (1-5 stars) with an
 * optional text review. One rating per customer per seller (updatable).
 * The aggregate rating + distribution is computed from all active ratings.
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Resolve sellerId from storeName (or use the provided sellerId). */
async function resolveSellerId(db: import('mongodb').Db, sellerId: string | null, storeName: string | null): Promise<string | null> {
  if (sellerId) return sellerId
  if (!storeName) return null
  const sellerDoc = await db.collection('sellers').findOne({ storeName }, { projection: { _id: 1 } })
  return sellerDoc ? sellerDoc._id.toString() : null
}

// ── GET: aggregate rating + distribution + recent reviews ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeName = searchParams.get('storeName')
    const sellerId = searchParams.get('sellerId')
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)))

    if (!storeName && !sellerId) {
      return NextResponse.json({ error: 'storeName or sellerId is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const resolvedSellerId = await resolveSellerId(db, sellerId, storeName)

    // Build the query for seller ratings
    const query: Record<string, unknown> = { status: 'active' }
    if (resolvedSellerId) {
      query.sellerId = resolvedSellerId
    } else if (storeName) {
      query.storeName = storeName
    }

    // Fetch aggregate stats
    const agg = await db.collection('seller_ratings').aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 },
          rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
    ]).toArray()

    const stats = agg[0] || {}
    const avgRating = stats.avgRating ? Math.round(stats.avgRating * 10) / 10 : 0
    const totalRatings = stats.totalRatings || 0

    // Fetch recent reviews (with text only)
    const recentReviews = await db.collection('seller_ratings')
      .find({ ...query, review: { $exists: true, $ne: null, $ne: '' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    return NextResponse.json({
      avgRating,
      totalRatings,
      distribution: {
        1: stats.rating1 || 0,
        2: stats.rating2 || 0,
        3: stats.rating3 || 0,
        4: stats.rating4 || 0,
        5: stats.rating5 || 0,
      },
      reviews: recentReviews.map((r) => ({
        id: r._id.toString(),
        customerName: r.customerName || 'Anonymous',
        rating: r.rating,
        review: r.review || '',
        createdAt: r.createdAt,
      })),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/seller-ratings] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch seller ratings' }, { status: 500 })
  }
}

// ── POST: submit or update a seller rating ──
// Body: { storeName: string, rating: number (1-5), review?: string }
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { storeName, rating, review } = body

    // Validate
    if (!storeName || typeof storeName !== 'string') {
      return NextResponse.json({ error: 'Store name is required' }, { status: 400 })
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 })
    }
    if (review && typeof review !== 'string') {
      return NextResponse.json({ error: 'Invalid review text' }, { status: 400 })
    }
    if (review && review.length > 500) {
      return NextResponse.json({ error: 'Review must be 500 characters or less' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const resolvedSellerId = await resolveSellerId(db, null, storeName)

    if (!resolvedSellerId) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
    }

    // Check if customer already rated this seller
    const existing = await db.collection('seller_ratings').findOne({
      customerId: customer.id,
      sellerId: resolvedSellerId,
    })

    const now = new Date().toISOString()
    const reviewText = (review || '').trim()

    if (existing) {
      // Update existing rating
      await db.collection('seller_ratings').updateOne(
        { _id: existing._id },
        {
          $set: {
            rating,
            review: reviewText || existing.review || '',
            updatedAt: now,
          },
        },
      )
      return NextResponse.json({
        success: true,
        action: 'updated',
        ratingId: existing._id.toString(),
      })
    }

    // Create new rating
    const doc = {
      customerId: customer.id,
      customerName: customer.name || 'Anonymous',
      sellerId: resolvedSellerId,
      storeName,
      rating,
      review: reviewText,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    const result = await db.collection('seller_ratings').insertOne(doc)

    // Ensure unique index (one rating per customer per seller)
    try {
      await db.collection('seller_ratings').createIndex(
        { customerId: 1, sellerId: 1 },
        { unique: true, background: true },
      )
    } catch {
      // Index may already exist
    }

    return NextResponse.json({
      success: true,
      action: 'created',
      ratingId: result.insertedId.toString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/customer/seller-ratings] error:', msg)
    return NextResponse.json({ error: 'Failed to submit rating' }, { status: 500 })
  }
}

// ── PATCH: check if customer has rated this seller ──
// Body: { storeName: string } → { hasRated: boolean, myRating?: number, ratingId?: string }
export async function PATCH(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ hasRated: false })
    }

    const body = await request.json()
    const { storeName, sellerId } = body

    if (!storeName && !sellerId) {
      return NextResponse.json({ error: 'storeName or sellerId is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const resolvedSellerId = await resolveSellerId(db, sellerId || null, storeName || null)

    if (!resolvedSellerId) {
      return NextResponse.json({ hasRated: false })
    }

    const existing = await db.collection('seller_ratings').findOne({
      customerId: customer.id,
      sellerId: resolvedSellerId,
    })

    return NextResponse.json({
      hasRated: !!existing,
      myRating: existing?.rating || 0,
      ratingId: existing?._id.toString() || null,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[PATCH /api/customer/seller-ratings] error:', msg)
    return NextResponse.json({ hasRated: false })
  }
}
