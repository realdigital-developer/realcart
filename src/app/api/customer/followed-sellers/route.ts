/**
 * Customer Followed Sellers API
 * -------------------------------------------------------------------
 * GET    /api/customer/followed-sellers           — list all followed sellers (with product count, rating)
 * POST   /api/customer/followed-sellers           — follow a seller { sellerId, sellerName, storeName }
 * DELETE /api/customer/followed-sellers?id=<id>   — unfollow a seller (by followed-seller doc _id or sellerId)
 * PATCH  /api/customer/followed-sellers           — check if customer follows a seller { sellerId } → { following: boolean }
 *
 * MongoDB collection: customer_followed_sellers
 *   { _id, customerId, sellerId, sellerName, storeName, followedAt }
 *
 * Meesho-style: customers can follow sellers they like. Followed sellers
 * appear in the account page "Followed Sellers" tab with their store name,
 * product count, rating, and a quick "Visit Store" action.
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── GET: list all followed sellers (enriched with product count + rating) ──
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    // Fetch all followed-seller docs for this customer, newest first
    const followed = await db
      .collection('customer_followed_sellers')
      .find({ customerId: customer.id })
      .sort({ followedAt: -1 })
      .toArray()

    if (followed.length === 0) {
      return NextResponse.json({ followedSellers: [] })
    }

    // Enrich each followed seller with live data from the sellers + products collections
    const sellerIds = followed
      .map((f) => f.sellerId)
      .filter((id): id is string => !!id)
      .map((id) => {
        try { return new ObjectId(id) } catch { return null }
      })
      .filter((id): id is ObjectId => id !== null)

    const storeNames = followed.map((f) => f.storeName).filter(Boolean)

    // Fetch seller docs (by _id OR storeName for backward compat)
    const [sellersById, sellersByStoreName] = await Promise.all([
      sellerIds.length > 0
        ? db.collection('sellers').find({ _id: { $in: sellerIds } }).toArray()
        : Promise.resolve([]),
      storeNames.length > 0
        ? db.collection('sellers').find({ storeName: { $in: storeNames } }).toArray()
        : Promise.resolve([]),
    ])

    // Merge into a map keyed by sellerId (string)
    const sellerMap = new Map<string, Record<string, unknown>>()
    for (const s of [...sellersById, ...sellersByStoreName]) {
      sellerMap.set(s._id.toString(), s)
      // Also map by storeName for backward compat
      if (s.storeName) sellerMap.set(s.storeName, s)
    }

    // Fetch product counts + avg ratings per seller (by sellerId or storeName)
    // NOTE: product status is 'Published' (capital P) — matches the products API filter
    const sellerKeys = followed.map((f) => f.sellerId || f.storeName).filter(Boolean)
    const productAgg = await db.collection('products').aggregate([
      {
        $match: {
          $or: [
            { sellerId: { $in: sellerKeys } },
            { seller: { $in: storeNames } },
          ],
          status: 'Published',
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          avgRating: { $avg: '$avgRating' },
          totalReviews: { $sum: '$totalReviews' },
          totalSold: { $sum: '$totalSold' },
        },
      },
    ]).toArray()

    // Since the aggregation is across all followed sellers combined, we need
    // per-seller stats. Let's do a simpler approach: fetch counts per seller.
    const enrichedSellers = await Promise.all(followed.map(async (f) => {
      const sellerDoc = sellerMap.get(f.sellerId) || sellerMap.get(f.storeName)
      const sellerKey = f.sellerId || f.storeName

      // Per-seller product stats — status: 'Published' (capital P)
      const stats = await db.collection('products').aggregate([
        {
          $match: {
            $or: [{ sellerId: sellerKey }, { seller: f.storeName }],
            status: 'Published',
          },
        },
        {
          $group: {
            _id: null,
            productCount: { $sum: 1 },
            totalSold: { $sum: '$totalSold' },
          },
        },
      ]).toArray()

      const stat = stats[0] || {}

      // Fetch seller rating from seller_ratings collection (Meesho-style)
      // — NOT derived from product ratings. One aggregate per seller.
      let sellerAvgRating = 0
      let sellerTotalRatings = 0
      if (f.sellerId) {
        const ratingAgg = await db.collection('seller_ratings').aggregate([
          { $match: { sellerId: f.sellerId, status: 'active' } },
          {
            $group: {
              _id: null,
              avgRating: { $avg: '$rating' },
              totalRatings: { $sum: 1 },
            },
          },
        ]).toArray()
        const ratingStats = ratingAgg[0]
        if (ratingStats) {
          sellerAvgRating = ratingStats.avgRating ? Math.round(ratingStats.avgRating * 10) / 10 : 0
          sellerTotalRatings = ratingStats.totalRatings || 0
        }
      }

      return {
        id: f._id.toString(),
        sellerId: f.sellerId,
        storeName: f.storeName || sellerDoc?.storeName || 'Unknown Store',
        sellerName: f.sellerName || sellerDoc?.name || '',
        // Seller details
        isVerified: sellerDoc?.isVerified || false,
        verificationStatus: sellerDoc?.verificationStatus || 'pending',
        // Live stats
        productCount: stat.productCount || 0,
        avgRating: sellerAvgRating,
        totalReviews: sellerTotalRatings,
        totalSold: stat.totalSold || 0,
        followedAt: f.followedAt,
      }
    }))

    return NextResponse.json({ followedSellers: enrichedSellers })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/followed-sellers] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch followed sellers' }, { status: 500 })
  }
}

// ── POST: follow a seller ──
// Body: { sellerId: string, sellerName?: string, storeName?: string }
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { sellerId, sellerName, storeName } = body

    if (!sellerId && !storeName) {
      return NextResponse.json({ error: 'Seller ID or store name is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // If only storeName is provided, try to resolve the sellerId from the sellers collection
    let resolvedSellerId = sellerId
    let resolvedStoreName = storeName
    let resolvedSellerName = sellerName

    if (!resolvedSellerId && resolvedStoreName) {
      const sellerDoc = await db.collection('sellers').findOne({ storeName: resolvedStoreName })
      if (sellerDoc) {
        resolvedSellerId = sellerDoc._id.toString()
        resolvedSellerName = resolvedSellerName || sellerDoc.name || ''
      }
    }

    if (!resolvedSellerId) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
    }

    // Check if already following (by sellerId OR storeName to avoid duplicates)
    const existing = await db.collection('customer_followed_sellers').findOne({
      customerId: customer.id,
      $or: [
        { sellerId: resolvedSellerId },
        ...(resolvedStoreName ? [{ storeName: resolvedStoreName }] : []),
      ],
    })

    if (existing) {
      return NextResponse.json({ success: true, alreadyFollowing: true, id: existing._id.toString() })
    }

    // Create follow record
    const doc = {
      customerId: customer.id,
      sellerId: resolvedSellerId,
      sellerName: resolvedSellerName || '',
      storeName: resolvedStoreName || '',
      followedAt: new Date().toISOString(),
    }

    const result = await db.collection('customer_followed_sellers').insertOne(doc)

    // Ensure unique index to prevent duplicates (fire-and-forget)
    try {
      await db.collection('customer_followed_sellers').createIndex(
        { customerId: 1, sellerId: 1 },
        { unique: true, background: true },
      )
    } catch {
      // Index may already exist
    }

    return NextResponse.json({
      success: true,
      following: true,
      id: result.insertedId.toString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/customer/followed-sellers] error:', msg)
    return NextResponse.json({ error: 'Failed to follow seller' }, { status: 500 })
  }
}

// ── DELETE: unfollow a seller ──
// Query: ?id=<followed-seller doc _id> OR ?sellerId=<sellerId> OR ?storeName=<storeName>
export async function DELETE(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const sellerId = searchParams.get('sellerId')
    const storeName = searchParams.get('storeName')

    if (!id && !sellerId && !storeName) {
      return NextResponse.json({ error: 'ID, sellerId, or storeName is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const filter: Record<string, unknown> = { customerId: customer.id }
    if (id && ObjectId.isValid(id)) {
      filter._id = new ObjectId(id)
    } else if (sellerId) {
      filter.sellerId = sellerId
    } else if (storeName) {
      filter.storeName = storeName
    }

    const result = await db.collection('customer_followed_sellers').deleteOne(filter)

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Followed seller not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, following: false })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[DELETE /api/customer/followed-sellers] error:', msg)
    return NextResponse.json({ error: 'Failed to unfollow seller' }, { status: 500 })
  }
}

// ── PATCH: check if customer follows a seller ──
// Body: { sellerId: string } → { following: boolean }
export async function PATCH(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ following: false })
    }

    const body = await request.json()
    const { sellerId, storeName } = body

    if (!sellerId && !storeName) {
      return NextResponse.json({ error: 'Seller ID or store name is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const filter: Record<string, unknown> = { customerId: customer.id }
    if (sellerId && storeName) {
      filter.$or = [{ sellerId }, { storeName }]
    } else if (sellerId) {
      filter.sellerId = sellerId
    } else if (storeName) {
      filter.storeName = storeName
    }

    const existing = await db.collection('customer_followed_sellers').findOne(filter)

    return NextResponse.json({
      following: !!existing,
      followedId: existing?._id.toString() || null,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[PATCH /api/customer/followed-sellers] error:', msg)
    return NextResponse.json({ following: false })
  }
}
