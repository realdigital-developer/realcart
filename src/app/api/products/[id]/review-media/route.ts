/**
 * Review Media Gallery API — /api/products/{id}/review-media
 *
 * GET — Fetch all review images/videos for a product (public, no auth required)
 *       Query params: page, limit, sort (newest | helpful)
 *       Returns: { media: [...], pagination }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'
import { generateThumbnailUrl } from '@/lib/review-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const sort = searchParams.get('sort') || 'newest'

    const { db } = await connectToDatabase()

    // Find all active reviews with media for this product
    const reviewsWithMedia = await db.collection('reviews')
      .find({
        productId,
        status: 'active',
        hasMedia: true,
      })
      .project({ _id: 1, customerId: 1, customerName: 1, rating: 1, helpful: 1, createdAt: 1 })
      .sort(sort === 'helpful' ? { helpful: -1, createdAt: -1 } : { createdAt: -1 })
      .toArray()

    if (reviewsWithMedia.length === 0) {
      return NextResponse.json({
        media: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      })
    }

    // Get all media for these reviews
    const reviewIdStrings = reviewsWithMedia.map(r => r._id.toString())

    const allMedia = await db.collection('review_media')
      .find({ reviewId: { $in: reviewIdStrings } })
      .sort({ createdAt: -1 })
      .toArray()

    // ── Batch fetch customer profiles (fresh name + avatar) ──────────
    // Reviews store customerName as a SNAPSHOT; join live customers so the
    // gallery shows the current name + profile image. Falls back to the
    // snapshot if the customer record is missing.
    const galleryCustIdsRaw = reviewsWithMedia
      .map(r => r.customerId as string | undefined)
      .filter((id): id is string => !!id)
    const galleryUniqueCustIds = [...new Set(galleryCustIdsRaw)]
    const galleryValidObjectIds = galleryUniqueCustIds
      .filter(id => ObjectId.isValid(id) && id.length === 24)
      .map(id => new ObjectId(id))
    const galleryCustomerDocs = galleryUniqueCustIds.length > 0
      ? await db.collection('customers')
          .find({
            $or: [
              ...(galleryValidObjectIds.length > 0 ? [{ _id: { $in: galleryValidObjectIds } }] : []),
              { _id: { $in: galleryUniqueCustIds } },
            ],
          })
          .project({ name: 1, profileImage: 1 })
          .toArray()
      : []
    const galleryCustomerMap = new Map<string, { name: string; avatar: string | null }>()
    for (const c of galleryCustomerDocs) {
      const key = c._id.toString()
      const profileImg = c.profileImage as { url?: string } | null | undefined
      const avatarUrl = (profileImg && typeof profileImg.url === 'string' && profileImg.url) || null
      galleryCustomerMap.set(key, {
        name: (c.name as string) || '',
        avatar: avatarUrl,
      })
    }

    // Enrich media with review data
    const reviewMap = new Map(reviewsWithMedia.map(r => [r._id.toString(), r]))

    const enrichedMedia = allMedia.map(m => {
      const review = reviewMap.get(m.reviewId?.toString() || '')
      const liveProfile = review?.customerId
        ? galleryCustomerMap.get(review.customerId as string)
        : undefined
      const resolvedName =
        (liveProfile && liveProfile.name) ||
        (review?.customerName as string | undefined) ||
        'Customer'
      const resolvedAvatar = liveProfile ? liveProfile.avatar : null
      const mediaUrl = (m.url as string) || ''
      const mediaType = (m.mediaType as string) || 'image' // default to image for backward compat
      return {
        _id: m._id.toString(),
        reviewId: m.reviewId,
        mediaUrl,
        mediaType,
        thumbnailUrl: generateThumbnailUrl(mediaUrl, mediaType as 'image' | 'video'),
        customerName: resolvedName,
        customerAvatar: resolvedAvatar,
        rating: review?.rating || 0,
        createdAt: m.createdAt,
      }
    })

    // Paginate
    const total = enrichedMedia.length
    const paginatedMedia = enrichedMedia.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      media: paginatedMedia,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[Review Media Gallery GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch review media' }, { status: 500 })
  }
}
