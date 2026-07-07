/**
 * Admin Reviews API — /api/admin/reviews
 *
 * Endpoints:
 *   GET  /  — List all reviews (admin read-only, paginated, filterable, with summaries)
 *   PUT  /  — Admin actions on reviews (hide, unhide, flag, unflag)
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { generateThumbnailUrl } from '@/lib/review-utils'

/* ------------------------------------------------------------------ */
/*  GET — List all reviews (admin, read-only)                           */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')))
    const statusFilter = searchParams.get('status') || ''
    const ratingFilter = searchParams.get('rating')
    const search = searchParams.get('search') || ''
    const sort = searchParams.get('sort') || 'newest'

    const { db } = await connectToDatabase()

    // Build query filter
    const query: Record<string, unknown> = {}

    if (statusFilter) {
      query.status = statusFilter
    }

    if (ratingFilter) {
      const ratingNum = parseInt(ratingFilter)
      if (ratingNum >= 1 && ratingNum <= 5) {
        query.rating = ratingNum
      }
    }

    // Search across product name, customer name, review title
    if (search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' }
      query.$or = [
        { customerName: searchRegex },
        { title: searchRegex },
        { comment: searchRegex },
      ]
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
    const reviewIdStrings = reviews.map(r => r._id.toString())

    // ── Batch fetch product data ──────────────────────────────────────
    const productIds = [...new Set(reviews.map(r => r.productId).filter(Boolean))]
    const productMap = new Map<string, { name: string; sellerId: string }>()
    if (productIds.length > 0) {
      // Try ObjectId match first
      const objectIdProductIds = productIds.map(id => {
        try { return new ObjectId(id) } catch { return id }
      })
      const products = await db.collection('products')
        .find({ _id: { $in: objectIdProductIds } })
        .project({ name: 1, seller: 1, sellerId: 1 })
        .toArray()
      for (const p of products) {
        productMap.set(p._id.toString(), {
          name: p.name || 'Unknown Product',
          sellerId: p.sellerId || p.seller || '',
        })
      }
      // Also try string _id match for any remaining
      const missingIds = productIds.filter(id => !productMap.has(id))
      if (missingIds.length > 0) {
        const productsByStringId = await db.collection('products')
          .find({ _id: { $in: missingIds } })
          .project({ name: 1, seller: 1, sellerId: 1 })
          .toArray()
        for (const p of productsByStringId) {
          productMap.set(p._id.toString(), {
            name: p.name || 'Unknown Product',
            sellerId: p.sellerId || p.seller || '',
          })
        }
      }
    }

    // ── Batch fetch customer data ─────────────────────────────────────
    const customerIds = [...new Set(reviews.map(r => r.customerId).filter(Boolean))]
    const customerMap = new Map<string, { name: string; email: string }>()
    if (customerIds.length > 0) {
      const customerObjectIdIds = customerIds.map(id => {
        try { return new ObjectId(id) } catch { return id }
      })
      const customers = await db.collection('customers')
        .find({ _id: { $in: customerObjectIdIds } })
        .project({ name: 1, email: 1, firstName: 1, lastName: 1 })
        .toArray()
      for (const c of customers) {
        const name = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'
        customerMap.set(c._id.toString(), {
          name,
          email: c.email || '',
        })
      }
      // Also try string _id match
      const missingCustomerIds = customerIds.filter(id => !customerMap.has(id))
      if (missingCustomerIds.length > 0) {
        const customersByStringId = await db.collection('customers')
          .find({ _id: { $in: missingCustomerIds } })
          .project({ name: 1, email: 1, firstName: 1, lastName: 1 })
          .toArray()
        for (const c of customersByStringId) {
          const name = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown'
          customerMap.set(c._id.toString(), {
            name,
            email: c.email || '',
          })
        }
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

    // ── Assemble enriched reviews ─────────────────────────────────────
    const enrichedReviews = reviews.map(review => {
      const id = review._id.toString()
      const product = productMap.get(review.productId)
      const customer = customerMap.get(review.customerId)
      return {
        _id: id,
        productId: review.productId,
        productName: product?.name || 'Unknown Product',
        productSellerId: product?.sellerId || '',
        customerId: review.customerId,
        customerName: customer?.name || review.customerName || 'Unknown',
        customerEmail: customer?.email || '',
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
        flaggedReason: review.flaggedReason || '',
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

    // ── Compute status summary ────────────────────────────────────────
    const statusSummaryPipeline = [
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]
    const statusResult = await db.collection('reviews').aggregate(statusSummaryPipeline).toArray()
    const statusSummary: Record<string, number> = { active: 0, hidden: 0, flagged: 0 }
    for (const entry of statusResult) {
      const key = (entry._id as string) || 'active'
      statusSummary[key] = entry.count
    }

    // ── Compute rating summary ────────────────────────────────────────
    const ratingSummaryPipeline = [
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
        },
      },
    ]
    const ratingResult = await db.collection('reviews').aggregate(ratingSummaryPipeline).toArray()
    const ratingData = ratingResult[0]?.stats?.[0]
    const ratingSummary = {
      averageRating: ratingData ? Math.round(ratingData.averageRating * 10) / 10 : 0,
      distribution: {
        1: ratingData?.rating1 || 0,
        2: ratingData?.rating2 || 0,
        3: ratingData?.rating3 || 0,
        4: ratingData?.rating4 || 0,
        5: ratingData?.rating5 || 0,
      },
    }

    return NextResponse.json({
      reviews: enrichedReviews,
      statusSummary,
      ratingSummary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[Admin Reviews GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT — Admin actions on reviews (hide, unhide, flag, unflag)         */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { reviewId, action, flaggedReason } = body

    // ── Validation ─────────────────────────────────────────────────────
    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
    }

    const validActions = ['hide', 'unhide', 'flag', 'unflag']
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    if (action === 'flag' && (!flaggedReason || typeof flaggedReason !== 'string' || flaggedReason.trim().length === 0)) {
      return NextResponse.json(
        { error: 'flaggedReason is required when flagging a review' },
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

    // ── Validate status transitions ────────────────────────────────────
    const currentStatus = review.status || 'active'
    let newStatus: string
    let notificationMessage: string

    switch (action) {
      case 'hide':
        if (currentStatus !== 'active') {
          return NextResponse.json(
            { error: `Cannot hide a review with status '${currentStatus}'. Only active reviews can be hidden.` },
            { status: 400 }
          )
        }
        newStatus = 'hidden'
        notificationMessage = 'Your review has been hidden by an administrator.'
        break

      case 'unhide':
        if (currentStatus !== 'hidden') {
          return NextResponse.json(
            { error: `Cannot unhide a review with status '${currentStatus}'. Only hidden reviews can be unhidden.` },
            { status: 400 }
          )
        }
        newStatus = 'active'
        notificationMessage = 'Your review has been restored and is now visible.'
        break

      case 'flag':
        if (currentStatus !== 'active') {
          return NextResponse.json(
            { error: `Cannot flag a review with status '${currentStatus}'. Only active reviews can be flagged.` },
            { status: 400 }
          )
        }
        newStatus = 'flagged'
        notificationMessage = `Your review has been flagged: ${flaggedReason.trim()}`
        break

      case 'unflag':
        if (currentStatus !== 'flagged') {
          return NextResponse.json(
            { error: `Cannot unflag a review with status '${currentStatus}'. Only flagged reviews can be unflagged.` },
            { status: 400 }
          )
        }
        newStatus = 'active'
        notificationMessage = 'The flag on your review has been removed and it is now visible.'
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // ── Update review status ───────────────────────────────────────────
    const updateFields: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    }

    if (action === 'flag') {
      updateFields.flaggedReason = flaggedReason.trim()
      updateFields.flaggedAt = new Date()
      updateFields.flaggedBy = session.id
    } else if (action === 'unflag') {
      updateFields.flaggedReason = ''
      updateFields.flaggedAt = null
      updateFields.flaggedBy = null
    }

    await db.collection('reviews').updateOne(
      { _id: reviewObjectId },
      { $set: updateFields }
    )

    // ── Create notification for customer ───────────────────────────────
    if (review.customerId) {
      try {
        await db.collection('notifications').insertOne({
          customerId: review.customerId,
          type: 'review_status_change',
          title: 'Review Status Update',
          message: notificationMessage,
          reviewId: reviewId,
          productId: review.productId,
          oldStatus: currentStatus,
          newStatus,
          read: false,
          createdAt: new Date(),
        })
      } catch (notifError) {
        // Notification failure should not block the status update
        console.error('[Admin Reviews PUT] Failed to create notification:', notifError)
      }
    }

    // ── Fetch updated review ───────────────────────────────────────────
    const updatedReview = await db.collection('reviews').findOne({ _id: reviewObjectId })

    return NextResponse.json({
      success: true,
      review: {
        ...updatedReview,
        _id: updatedReview!._id.toString(),
      },
    })
  } catch (error) {
    console.error('[Admin Reviews PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 })
  }
}
