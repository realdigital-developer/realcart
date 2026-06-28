/**
 * Seller Reviews API — /api/seller/reviews
 *
 * Endpoints:
 *   GET  /  — List reviews for seller's products (paginated, filterable, with stats)
 *   POST /  — Seller reply to a review (one reply per review)
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { generateThumbnailUrl } from '@/lib/review-utils'

/* ------------------------------------------------------------------ */
/*  GET — List reviews for seller's products                            */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error: authError, session } = await authenticateSeller(request)
    if (authError || !session) {
      return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')))
    const ratingFilter = searchParams.get('rating')
    const statusFilter = searchParams.get('status') || ''
    const productIdFilter = searchParams.get('productId') || ''
    const sort = searchParams.get('sort') || 'newest'

    const { db } = await connectToDatabase()

    // Build seller ID aliases for querying
    const sellerIds = [session.id, ...session.sellerAliases]
    const uniqueSellerIds = [...new Set(sellerIds)]

    // Build query filter
    const query: Record<string, unknown> = {
      sellerId: { $in: uniqueSellerIds },
    }

    if (ratingFilter) {
      const ratingNum = parseInt(ratingFilter)
      if (ratingNum >= 1 && ratingNum <= 5) {
        query.rating = ratingNum
      }
    }

    if (statusFilter) {
      query.status = statusFilter
    }

    if (productIdFilter) {
      query.productId = productIdFilter
    }

    // Build sort option
    const sortOption: Record<string, 1 | -1> = (() => {
      switch (sort) {
        case 'oldest':
          return { createdAt: 1 }
        case 'highest':
          return { rating: -1, createdAt: -1 }
        case 'lowest':
          return { rating: 1, createdAt: -1 }
        case 'newest':
        default:
          return { createdAt: -1 }
      }
    })()

    // Get total count
    const total = await db.collection('reviews').countDocuments(query)

    // Fetch reviews
    const reviews = await db.collection('reviews')
      .find(query)
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    // Get review IDs for batch queries
    const reviewIds = reviews.map(r => r._id)
    const reviewIdStrings = reviews.map(r => r._id.toString())

    // ── Batch fetch product data ──────────────────────────────────────
    const productIds = [...new Set(reviews.map(r => r.productId).filter(Boolean))]
    const productMap = new Map<string, string>()
    if (productIds.length > 0) {
      const products = await db.collection('products')
        .find({ _id: { $in: productIds.map(id => { try { return new ObjectId(id) } catch { return id } }) } })
        .project({ name: 1 })
        .toArray()
      for (const p of products) {
        productMap.set(p._id.toString(), p.name || 'Unknown Product')
      }
      // Also try string _id match
      const productsByStringId = await db.collection('products')
        .find({ _id: { $in: productIds.filter(id => !productMap.has(id)) } })
        .project({ name: 1 })
        .toArray()
      for (const p of productsByStringId) {
        productMap.set(p._id.toString(), p.name || 'Unknown Product')
      }
    }

    // ── Batch fetch seller replies ────────────────────────────────────
    const allReplies = reviewIdStrings.length > 0
      ? await db.collection('review_replies')
          .find({ reviewId: { $in: reviewIdStrings } })
          .sort({ createdAt: 1 })
          .toArray()
      : []
    const repliesMap = new Map<string, typeof allReplies>()
    for (const r of allReplies) {
      const key = r.reviewId.toString()
      if (!repliesMap.has(key)) repliesMap.set(key, [])
      repliesMap.get(key)!.push(r)
    }

    // ── Batch fetch media ─────────────────────────────────────────────
    const allMedia = reviewIdStrings.length > 0
      ? await db.collection('review_media')
          .find({ reviewId: { $in: reviewIdStrings } })
          .toArray()
      : []
    const mediaMap = new Map<string, typeof allMedia>()
    for (const m of allMedia) {
      const key = m.reviewId.toString()
      if (!mediaMap.has(key)) mediaMap.set(key, [])
      mediaMap.get(key)!.push(m)
    }

    // ── Batch fetch customer profiles (fresh name + avatar) ──────────
    // Reviews store customerName as a SNAPSHOT; join live customers so the
    // seller always sees the current name + profile image. Falls back to
    // the snapshot if the customer record is missing.
    const sellerCustIdsRaw = reviews
      .map(r => r.customerId as string | undefined)
      .filter((id): id is string => !!id)
    const sellerUniqueCustIds = [...new Set(sellerCustIdsRaw)]
    const sellerValidObjectIds = sellerUniqueCustIds
      .filter(id => ObjectId.isValid(id) && id.length === 24)
      .map(id => new ObjectId(id))
    const sellerCustomerDocs = sellerUniqueCustIds.length > 0
      ? await db.collection('customers')
          .find({
            $or: [
              ...(sellerValidObjectIds.length > 0 ? [{ _id: { $in: sellerValidObjectIds } }] : []),
              { _id: { $in: sellerUniqueCustIds } },
            ],
          })
          .project({ name: 1, profileImage: 1 })
          .toArray()
      : []
    const sellerCustomerMap = new Map<string, { name: string; avatar: string | null }>()
    for (const c of sellerCustomerDocs) {
      const key = c._id.toString()
      const profileImg = c.profileImage as { url?: string } | null | undefined
      const avatarUrl = (profileImg && typeof profileImg.url === 'string' && profileImg.url) || null
      sellerCustomerMap.set(key, {
        name: (c.name as string) || '',
        avatar: avatarUrl,
      })
    }

    // ── Assemble enriched reviews ─────────────────────────────────────
    const enrichedReviews = reviews.map(review => {
      const id = review._id.toString()
      const liveProfile = review.customerId
        ? sellerCustomerMap.get(review.customerId)
        : undefined
      const resolvedName =
        (liveProfile && liveProfile.name) ||
        (review.customerName as string) ||
        'Customer'
      const resolvedAvatar = liveProfile ? liveProfile.avatar : null
      return {
        _id: id,
        productId: review.productId,
        productName: productMap.get(review.productId) || 'Unknown Product',
        customerId: review.customerId,
        customerName: resolvedName,
        customerAvatar: resolvedAvatar,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        pros: review.pros || '',
        cons: review.cons || '',
        verified: review.verified || false,
        variant: review.variant || '',
        sellerId: review.sellerId || '',
        hasMedia: review.hasMedia || false,
        helpful: review.helpful || 0,
        notHelpful: review.notHelpful || 0,
        status: review.status,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        media: (mediaMap.get(id) || []).map((m: Record<string, unknown>) => {
          const mediaUrl = (m.url as string) || ''
          const mediaType = (m.mediaType as string) || 'image'
          return {
            _id: (m._id as ObjectId).toString(),
            url: mediaUrl,
            mediaUrl,
            mediaType,
            thumbnailUrl: generateThumbnailUrl(mediaUrl, mediaType as 'image' | 'video'),
            publicId: m.publicId,
          }
        }),
        replies: (repliesMap.get(id) || []).map((r: Record<string, unknown>) => ({
          _id: (r._id as ObjectId).toString(),
          sellerId: r.sellerId,
          sellerName: r.sellerName,
          comment: r.comment,
          createdAt: r.createdAt,
        })),
      }
    })

    // ── Compute stats ─────────────────────────────────────────────────
    const statsPipeline = [
      { $match: { sellerId: { $in: uniqueSellerIds } } },
      {
        $facet: {
          stats: [
            {
              $group: {
                _id: null,
                averageRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 },
                rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
                rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
              },
            },
          ],
          repliedCount: [
            { $match: { status: 'active' } },
            {
              $lookup: {
                from: 'review_replies',
                localField: '_id',
                foreignField: 'reviewId',
                as: 'reply',
              },
            },
            { $match: { 'reply.0': { $exists: true } } },
            { $count: 'count' },
          ],
        },
      },
    ]

    const statsResult = await db.collection('reviews').aggregate(statsPipeline).toArray()
    const statsData = statsResult[0]?.stats?.[0]
    const repliedCount = statsResult[0]?.repliedCount?.[0]?.count || 0

    const stats = {
      averageRating: statsData ? Math.round(statsData.averageRating * 10) / 10 : 0,
      totalReviews: statsData?.totalReviews || 0,
      ratingDistribution: {
        1: statsData?.rating1 || 0,
        2: statsData?.rating2 || 0,
        3: statsData?.rating3 || 0,
        4: statsData?.rating4 || 0,
        5: statsData?.rating5 || 0,
      },
      repliedCount,
    }

    return NextResponse.json({
      reviews: enrichedReviews,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[Seller Reviews GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST — Seller reply to a review                                     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { error: authError, session } = await authenticateSeller(request)
    if (authError || !session) {
      return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { reviewId, replyText } = body

    // ── Validation ─────────────────────────────────────────────────────
    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
    }

    if (!replyText || typeof replyText !== 'string' || replyText.trim().length === 0) {
      return NextResponse.json({ error: 'replyText is required' }, { status: 400 })
    }

    if (replyText.trim().length > 1000) {
      return NextResponse.json(
        { error: 'Reply text must be 1000 characters or less' },
        { status: 400 }
      )
    }

    const { db } = await connectToDatabase()

    // ── Find the review ────────────────────────────────────────────────
    let reviewObjectId: ObjectId
    try {
      reviewObjectId = new ObjectId(reviewId)
    } catch {
      return NextResponse.json({ error: 'Invalid reviewId format' }, { status: 400 })
    }

    const review = await db.collection('reviews').findOne({ _id: reviewObjectId })

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    // ── Verify review belongs to this seller ───────────────────────────
    const sellerIds = [session.id, ...session.sellerAliases]
    const uniqueSellerIds = [...new Set(sellerIds)]

    if (!uniqueSellerIds.includes(review.sellerId)) {
      return NextResponse.json(
        { error: 'You can only reply to reviews for your own products' },
        { status: 403 }
      )
    }

    // ── Check for existing reply (only 1 per review) ──────────────────
    const existingReply = await db.collection('review_replies').findOne({
      reviewId: reviewId,
    })

    if (existingReply) {
      return NextResponse.json(
        { error: 'A reply already exists for this review' },
        { status: 409 }
      )
    }

    // ── Insert reply ───────────────────────────────────────────────────
    const now = new Date()
    const replyDoc = {
      reviewId: reviewId,
      sellerId: session.id,
      sellerName: session.storeName || session.name || 'Seller',
      comment: replyText.trim(),
      createdAt: now,
      updatedAt: now,
    }

    const insertResult = await db.collection('review_replies').insertOne(replyDoc)

    return NextResponse.json({
      success: true,
      reply: {
        _id: insertResult.insertedId.toString(),
        ...replyDoc,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[Seller Reviews POST Error]', error)
    return NextResponse.json({ error: 'Failed to submit reply' }, { status: 500 })
  }
}
