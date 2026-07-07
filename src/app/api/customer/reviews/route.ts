/**
 * Customer Reviews API — /api/customer/reviews
 *
 * Endpoints:
 *   GET    /  — Get reviews for a product (public, no auth required)
 *   POST   /  — Submit a review (auth required, verified buyers only)
 *   PUT    /  — Edit a review (auth required, owner only, within 30 days)
 *   DELETE /  — Delete a review (auth required, owner only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { generateThumbnailUrl } from '@/lib/review-utils'
import { normalizeStatus } from '@/lib/order-state-machine'

/* ------------------------------------------------------------------ */
/*  Helper: Recalculate product rating after any change                 */
/* ------------------------------------------------------------------ */

async function recalculateRating(db: ReturnType<typeof connectToDatabase extends () => Promise<{ db: infer D }> ? D : never>, productId: string) {
  // Always recalculate from the actual reviews collection for accuracy
  const pipeline = [
    { $match: { productId, status: 'active' } },
    {
      $group: {
        _id: null,
        rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        total: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]

  const result = await db.collection('reviews').aggregate(pipeline).toArray()
  const data = result[0]

  if (data) {
    const avgRating = Math.round((data.avgRating || 0) * 10) / 10
    await db.collection('product_rating_summary').updateOne(
      { productId },
      {
        $set: {
          avgRating,
          totalReviews: data.total,
          rating1Count: data.rating1,
          rating2Count: data.rating2,
          rating3Count: data.rating3,
          rating4Count: data.rating4,
          rating5Count: data.rating5,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          productId,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )
  } else {
    // No reviews — reset summary
    await db.collection('product_rating_summary').updateOne(
      { productId },
      {
        $set: {
          avgRating: 0,
          totalReviews: 0,
          rating1Count: 0,
          rating2Count: 0,
          rating3Count: 0,
          rating4Count: 0,
          rating5Count: 0,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          productId,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )
  }
}

/** Rating key mapping for $inc operations */
const RATING_KEY_MAP: Record<number, string> = {
  1: 'rating1Count',
  2: 'rating2Count',
  3: 'rating3Count',
  4: 'rating4Count',
  5: 'rating5Count',
}

/* ------------------------------------------------------------------ */
/*  GET — Get reviews for a product (public)                            */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')))
    const filter = searchParams.get('filter') || 'all' // all | positive | critical | photos
    const sort = searchParams.get('sort') || 'newest' // newest | helpful

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Build query filter
    const query: Record<string, unknown> = {
      productId,
      status: 'active',
    }

    // Apply review filter
    if (filter === 'positive') {
      query.rating = { $gte: 4 }
    } else if (filter === 'critical') {
      query.rating = { $lte: 2 }
    } else if (filter === 'photos') {
      query.hasMedia = true
    }

    // Build sort
    const sortOption: Record<string, 1 | -1> = sort === 'helpful'
      ? { helpful: -1, createdAt: -1 }
      : { createdAt: -1 }

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
    // IMPORTANT: review_media, review_replies, and review_helpfulness store reviewId as strings,
    // so we must query with string IDs, not ObjectIds (MongoDB strict type matching)
    const reviewIdStrings = reviews.map(r => r._id.toString())

    // Batch fetch media for all reviews
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

    // Batch fetch replies for all reviews
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

    // Optional: check if authenticated user has voted on these reviews
    let helpfulnessMap = new Map<string, string>()
    const customer = await verifyCustomerSession()
    if (customer && reviewIdStrings.length > 0) {
      const votes = await db.collection('review_helpfulness')
        .find({
          reviewId: { $in: reviewIdStrings },
          customerId: customer.id,
        })
        .toArray()
      for (const v of votes) {
        helpfulnessMap.set(v.reviewId.toString(), v.vote)
      }
    }

    // ── Batch fetch customer profiles (for fresh name + avatar) ──────
    // Reviews store customerName as a SNAPSHOT at submission time. If the
    // customer later updates their name (via /api/customer/profile PUT) — or
    // never provided one and got the "User XXXX" registration default — old
    // reviews would show stale data forever. We join with the LIVE customers
    // collection here so the current name + profileImage are always shown.
    // Falls back gracefully to the snapshot if the customer is gone.
    const customerIdsRaw = reviews
      .map(r => r.customerId as string | undefined)
      .filter((id): id is string => !!id)
    const uniqueCustomerIds = [...new Set(customerIdsRaw)]
    const validObjectIds = uniqueCustomerIds
      .filter(id => ObjectId.isValid(id) && id.length === 24)
      .map(id => new ObjectId(id))
    const customerDocs = uniqueCustomerIds.length > 0
      ? await db.collection('customers')
          .find({
            $or: [
              ...(validObjectIds.length > 0 ? [{ _id: { $in: validObjectIds } }] : []),
              { _id: { $in: uniqueCustomerIds } },
            ],
          })
          .project({ name: 1, profileImage: 1 })
          .toArray()
      : []
    const customerProfileMap = new Map<string, { name: string; avatar: string | null }>()
    for (const c of customerDocs) {
      const key = c._id.toString()
      const profileImg = c.profileImage as { url?: string } | null | undefined
      const avatarUrl = (profileImg && typeof profileImg.url === 'string' && profileImg.url) || null
      customerProfileMap.set(key, {
        name: (c.name as string) || '',
        avatar: avatarUrl,
      })
    }

    // Assemble reviews with media, replies, and user vote
    const enrichedReviews = reviews.map(review => {
      const id = review._id.toString()
      // Resolve the LIVE customer profile (falls back to snapshot)
      const liveProfile = review.customerId
        ? customerProfileMap.get(review.customerId)
        : undefined
      const resolvedName =
        (liveProfile && liveProfile.name) ||
        (review.customerName as string) ||
        'Customer'
      const resolvedAvatar = liveProfile ? liveProfile.avatar : null
      return {
        _id: id,
        productId: review.productId,
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
          const mediaType = (m.mediaType as string) || 'image' // default to image for backward compat
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
        userVote: helpfulnessMap.get(id) || null,
      }
    })

    // Compute stats via aggregation pipeline for efficiency
    const statsPipeline = [
      { $match: { productId, status: 'active' } },
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
                mediaCount: { $sum: { $cond: ['$hasMedia', 1, 0] } },
              },
            },
          ],
        },
      },
    ]

    const statsResult = await db.collection('reviews').aggregate(statsPipeline).toArray()
    const statsData = statsResult[0]?.stats?.[0]

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
      mediaCount: statsData?.mediaCount || 0,
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
    console.error('[Reviews GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST — Submit a review (auth required)                              */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { productId, orderId, orderItemId, rating, title, comment, pros, cons, images, videos } = body

    // ── Validation ─────────────────────────────────────────────────────
    if (!productId || !orderId || !orderItemId) {
      return NextResponse.json(
        { error: 'productId, orderId, and orderItemId are required' },
        { status: 400 }
      )
    }

    const ratingNum = Number(rating)
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 })
    }

    if (!comment || typeof comment !== 'string' || comment.trim().length < 10) {
      return NextResponse.json({ error: 'Comment must be at least 10 characters' }, { status: 400 })
    }

    if (title && typeof title === 'string' && title.length > 100) {
      return NextResponse.json({ error: 'Title must be 100 characters or less' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // ── Verify order belongs to customer and item is Delivered ──────────
    const order = await db.collection('orders').findOne({
      orderId,
      customerId: customer.id,
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found or does not belong to you' }, { status: 404 })
    }

    // Find the specific order item
    const orderItem = (order.items || []).find(
      (item: Record<string, unknown>) =>
        (item._id === orderItemId || item._id?.toString() === orderItemId) &&
        item.productId === productId
    )

    if (!orderItem) {
      return NextResponse.json({ error: 'Order item not found for this product' }, { status: 404 })
    }

    if (normalizeStatus(orderItem.status as string) !== 'Delivered') {
      return NextResponse.json(
        { error: 'You can only review delivered items' },
        { status: 400 }
      )
    }

    // ── Check for existing review (one per product per order) ───────────
    const duplicateFilter: Record<string, unknown> = {
      customerId: customer.id,
      productId,
    }
    if (orderId) duplicateFilter.orderId = orderId

    const existingReview = await db.collection('reviews').findOne(duplicateFilter)

    if (existingReview) {
      return NextResponse.json(
        { error: 'You have already reviewed this product for this order' },
        { status: 409 }
      )
    }

    // ── Anti-fraud: max 5 reviews per day per customer ──────────────────
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayReviewCount = await db.collection('reviews').countDocuments({
      customerId: customer.id,
      createdAt: { $gte: todayStart },
    })

    if (todayReviewCount >= 5) {
      return NextResponse.json(
        { error: 'You have reached the daily review limit (5 per day)' },
        { status: 429 }
      )
    }

    // ── Extract variant info from order item ────────────────────────────
    let variantStr = ''
    if (orderItem.variant) {
      if (typeof orderItem.variant === 'string') {
        variantStr = orderItem.variant
      } else if (typeof orderItem.variant === 'object') {
        const entries = Object.entries(orderItem.variant as Record<string, unknown>)
          .filter(([, v]) => v != null && v !== '')
        if (entries.length > 0) {
          variantStr = entries.map(([k, v]) => `${k}: ${v}`).join(', ')
        }
      }
    }

    // ── Extract sellerId from order item ────────────────────────────────
    const sellerId = orderItem.sellerId || ''

    // ── Determine verified status ───────────────────────────────────────
    const verified = !!(orderItem.sellerId && orderItem.deliveryBoyId)

    // ── Insert review ──────────────────────────────────────────────────
    const now = new Date()
    const reviewDoc = {
      productId,
      orderId,
      orderItemId,
      customerId: customer.id,
      customerName: customer.name || 'Customer',
      rating: ratingNum,
      title: (title || '').trim(),
      comment: comment.trim(),
      pros: (pros || '').trim(),
      cons: (cons || '').trim(),
      variant: variantStr,
      sellerId,
      verified,
      hasMedia: !!(images && Array.isArray(images) && images.length > 0) || !!(videos && Array.isArray(videos) && videos.length > 0),
      helpful: 0,
      notHelpful: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }

    const insertResult = await db.collection('reviews').insertOne(reviewDoc)
    const reviewId = insertResult.insertedId

    // ── Insert media if images/videos provided ──────────────────────────
    const mediaDocs: Array<Record<string, unknown>> = []

    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        const url = typeof img === 'string' ? img : img.url
        const publicId = typeof img === 'string' ? '' : img.publicId || ''
        mediaDocs.push({
          reviewId: reviewId.toString(),
          productId,
          mediaType: 'image',
          url: url || '',
          publicId,
          createdAt: now,
        })
      }
    }

    if (videos && Array.isArray(videos) && videos.length > 0) {
      for (const vid of videos) {
        const url = typeof vid === 'string' ? vid : vid.url
        const publicId = typeof vid === 'string' ? '' : vid.publicId || ''
        mediaDocs.push({
          reviewId: reviewId.toString(),
          productId,
          mediaType: 'video',
          url: url || '',
          publicId,
          createdAt: now,
        })
      }
    }

    if (mediaDocs.length > 0) {
      await db.collection('review_media').insertMany(mediaDocs)
    }

    // ── Update product_rating_summary ───────────────────────────────────
    const ratingKey = RATING_KEY_MAP[ratingNum]
    if (ratingKey) {
      // Build $setOnInsert excluding fields already in $inc to avoid conflict
      const setOnInsert: Record<string, unknown> = {
        productId,
        avgRating: 0,
        createdAt: now,
      }
      for (const [rk, field] of Object.entries(RATING_KEY_MAP)) {
        if (rk !== String(ratingNum)) {
          setOnInsert[field] = 0
        }
      }

      await db.collection('product_rating_summary').updateOne(
        { productId },
        {
          $inc: { [ratingKey]: 1, totalReviews: 1 },
          $set: { updatedAt: now },
          $setOnInsert: setOnInsert,
        },
        { upsert: true }
      )

      // Recalculate avgRating atomically
      await recalculateRating(db, productId)
    }

    return NextResponse.json({
      success: true,
      review: {
        _id: reviewId.toString(),
        ...reviewDoc,
        createdAt: reviewDoc.createdAt.toISOString(),
        updatedAt: reviewDoc.updatedAt.toISOString(),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[Reviews POST Error]', error)
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT — Edit a review (auth required, owner only, within 30 days)     */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { reviewId, rating, title, comment, pros, cons, images, videos } = body

    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
    }

    // Validate rating if provided
    if (rating !== undefined) {
      const ratingNum = Number(rating)
      if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 })
      }
    }

    // Validate comment if provided
    if (comment !== undefined) {
      if (typeof comment !== 'string' || comment.trim().length < 10) {
        return NextResponse.json({ error: 'Comment must be at least 10 characters' }, { status: 400 })
      }
    }

    // Validate title if provided
    if (title !== undefined && typeof title === 'string' && title.length > 100) {
      return NextResponse.json({ error: 'Title must be 100 characters or less' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // ── Find the review ─────────────────────────────────────────────────
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

    // ── Verify ownership ────────────────────────────────────────────────
    if (review.customerId !== customer.id) {
      return NextResponse.json({ error: 'You can only edit your own reviews' }, { status: 403 })
    }

    // ── Check 30-day edit window ────────────────────────────────────────
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    if (review.createdAt < thirtyDaysAgo) {
      return NextResponse.json(
        { error: 'Reviews can only be edited within 30 days of creation' },
        { status: 400 }
      )
    }

    // ── Build update object ─────────────────────────────────────────────
    const updateFields: Record<string, unknown> = { updatedAt: new Date() }

    if (rating !== undefined) updateFields.rating = Number(rating)
    if (title !== undefined) updateFields.title = (title as string)?.trim() || ''
    if (comment !== undefined) updateFields.comment = (comment as string)?.trim() || ''
    if (pros !== undefined) updateFields.pros = (pros as string)?.trim() || ''
    if (cons !== undefined) updateFields.cons = (cons as string)?.trim() || ''

    // ── Handle rating change → update product_rating_summary ────────────
    const oldRating = review.rating
    const newRating = rating !== undefined ? Number(rating) : oldRating

    if (newRating !== oldRating) {
      const oldKey = RATING_KEY_MAP[oldRating]
      const newKey = RATING_KEY_MAP[newRating]

      if (oldKey && newKey) {
        await db.collection('product_rating_summary').updateOne(
          { productId: review.productId },
          {
            $inc: { [oldKey]: -1, [newKey]: 1 },
            $set: { updatedAt: new Date() },
          }
        )
        await recalculateRating(db, review.productId)
      }
    }

    // ── Handle media update if images/videos provided ───────────────────
    if (images !== undefined || videos !== undefined) {
      const hasMedia = (Array.isArray(images) && images.length > 0) || (Array.isArray(videos) && videos.length > 0)
      updateFields.hasMedia = hasMedia

      // Get current media for this review to determine what to keep vs remove
      const currentMedia = await db.collection('review_media')
        .find({ reviewId: reviewId })
        .toArray()

      // Build a set of URLs that should be kept (from images + videos arrays)
      const keptUrls = new Set<string>()
      if (Array.isArray(images)) {
        for (const img of images) {
          const url = typeof img === 'string' ? img : img.url
          if (url) keptUrls.add(url)
        }
      }
      if (Array.isArray(videos)) {
        for (const vid of videos) {
          const url = typeof vid === 'string' ? vid : vid.url
          if (url) keptUrls.add(url)
        }
      }

      // Find media to remove (existing media whose URL is NOT in the kept set)
      const mediaToRemove = currentMedia.filter((m: Record<string, unknown>) => {
        const mUrl = (m.url as string) || ''
        return !keptUrls.has(mUrl)
      })

      // Remove media that were removed by the user
      if (mediaToRemove.length > 0) {
        const removeIds = mediaToRemove.map((m: Record<string, unknown>) => m._id)
        await db.collection('review_media').deleteMany({
          _id: { $in: removeIds },
        })
      }

      // Find new media to insert (media whose URL is not in existing media)
      const existingUrls = new Set(currentMedia.map((m: Record<string, unknown>) => (m.url as string) || ''))

      // New images
      const newImages = Array.isArray(images)
        ? images.filter((img: { url?: string; publicId?: string } | string) => {
            const url = typeof img === 'string' ? img : img.url
            return url && !existingUrls.has(url)
          })
        : []

      // New videos
      const newVideos = Array.isArray(videos)
        ? videos.filter((vid: { url?: string; publicId?: string } | string) => {
            const url = typeof vid === 'string' ? vid : vid.url
            return url && !existingUrls.has(url)
          })
        : []

      // Insert only truly new media
      const newMediaDocs: Array<Record<string, unknown>> = []
      const now = new Date()

      for (const img of newImages) {
        const url = typeof img === 'string' ? img : img.url
        const publicId = typeof img === 'string' ? '' : img.publicId || ''
        newMediaDocs.push({
          reviewId: reviewId,
          productId: review.productId,
          mediaType: 'image',
          url: url || '',
          publicId,
          createdAt: now,
        })
      }

      for (const vid of newVideos) {
        const url = typeof vid === 'string' ? vid : vid.url
        const publicId = typeof vid === 'string' ? '' : vid.publicId || ''
        newMediaDocs.push({
          reviewId: reviewId,
          productId: review.productId,
          mediaType: 'video',
          url: url || '',
          publicId,
          createdAt: now,
        })
      }

      if (newMediaDocs.length > 0) {
        await db.collection('review_media').insertMany(newMediaDocs)
      }
    }

    // ── Apply update ────────────────────────────────────────────────────
    await db.collection('reviews').updateOne(
      { _id: reviewObjectId },
      { $set: updateFields }
    )

    // Fetch updated review
    const updatedReview = await db.collection('reviews').findOne({ _id: reviewObjectId })

    return NextResponse.json({
      success: true,
      review: {
        ...updatedReview,
        _id: updatedReview!._id.toString(),
        createdAt: updatedReview!.createdAt.toISOString
          ? updatedReview!.createdAt.toISOString()
          : updatedReview!.createdAt,
        updatedAt: updatedReview!.updatedAt.toISOString
          ? updatedReview!.updatedAt.toISOString()
          : updatedReview!.updatedAt,
      },
    })
  } catch (error) {
    console.error('[Reviews PUT Error]', error)
    return NextResponse.json({ error: 'Failed to edit review' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — Delete a review (auth required, owner only)                */
/* ------------------------------------------------------------------ */

export async function DELETE(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { reviewId } = body

    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // ── Find the review ─────────────────────────────────────────────────
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

    // ── Verify ownership ────────────────────────────────────────────────
    if (review.customerId !== customer.id) {
      return NextResponse.json({ error: 'You can only delete your own reviews' }, { status: 403 })
    }

    const productId = review.productId
    const ratingVal = review.rating

    // ── Delete review and related data ──────────────────────────────────
    await Promise.all([
      db.collection('reviews').deleteOne({ _id: reviewObjectId }),
      db.collection('review_media').deleteMany({ reviewId: reviewId }),
      db.collection('review_replies').deleteMany({ reviewId: reviewId }),
      db.collection('review_helpfulness').deleteMany({ reviewId: reviewId }),
    ])

    // ── Update product_rating_summary ───────────────────────────────────
    const ratingKey = RATING_KEY_MAP[ratingVal]
    if (ratingKey) {
      await db.collection('product_rating_summary').updateOne(
        { productId },
        {
          $inc: { [ratingKey]: -1, totalReviews: -1 },
          $set: { updatedAt: new Date() },
        }
      )
      await recalculateRating(db, productId)
    }

    return NextResponse.json({ success: true, message: 'Review deleted' })
  } catch (error) {
    console.error('[Reviews DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete review' }, { status: 500 })
  }
}
