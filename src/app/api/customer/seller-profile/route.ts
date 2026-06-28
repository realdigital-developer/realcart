/**
 * Customer Seller Profile API
 * -------------------------------------------------------------------
 * GET /api/customer/seller-profile?storeName=<name>&page=1&limit=20
 * GET /api/customer/seller-profile?sellerId=<id>&page=1&limit=20
 *
 * Returns seller info + paginated product list + aggregate stats.
 * Used by the Seller Profile page (Meesho-style) opened from the
 * "Sold by" section on product detail pages.
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeName = searchParams.get('storeName')
    const sellerId = searchParams.get('sellerId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(40, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    if (!storeName && !sellerId) {
      return NextResponse.json({ error: 'storeName or sellerId is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // ── Fetch the seller document ──
    let sellerDoc: Record<string, unknown> | null = null
    if (sellerId && ObjectId.isValid(sellerId)) {
      sellerDoc = await db.collection('sellers').findOne({ _id: new ObjectId(sellerId) })
    }
    if (!sellerDoc && storeName) {
      sellerDoc = await db.collection('sellers').findOne({ storeName })
    }

    // Build the seller query for products (match by sellerId OR seller/storeName)
    // Note: product status is 'Published' (capital P) — matches the products API filter
    const productSellerQuery: Record<string, unknown> = {
      status: 'Published',
      active: { $ne: false },
    }
    if (sellerDoc) {
      const sid = sellerDoc._id.toString()
      const sname = sellerDoc.storeName as string
      productSellerQuery.$or = [
        { sellerId: sid },
        { seller: sname },
      ]
    } else if (storeName) {
      // Seller doc not found — fall back to storeName only
      productSellerQuery.$or = [{ seller: storeName }, { sellerId: storeName }]
    } else if (sellerId) {
      productSellerQuery.$or = [{ sellerId }, { seller: sellerId }]
    }

    // ── Fetch aggregate stats ──
    const statsAgg = await db.collection('products').aggregate([
      { $match: productSellerQuery },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          avgRating: { $avg: '$avgRating' },
          totalReviews: { $sum: '$totalReviews' },
          totalSold: { $sum: '$totalSold' },
          minPrice: { $min: '$effectivePrice' },
          maxPrice: { $max: '$effectivePrice' },
        },
      },
    ]).toArray()
    const stats = statsAgg[0] || {}

    // ── Fetch paginated products ──
    const skip = (page - 1) * limit
    const products = await db.collection('products')
      .find(productSellerQuery, {
        projection: {
          _id: 1, name: 1, slug: 1, mrp: 1, sellingPrice: 1, effectivePrice: 1,
          hasDiscount: 1, discountPercent: 1, imageUrl: 1, images: 1,
          category: 1, subcategory: 1, brand: 1, stock: 1, inStock: 1,
          avgRating: 1, totalReviews: 1, totalSold: 1, freeDelivery: 1,
          seller: 1, sellerId: 1, storeName: 1,
        },
      })
      .sort({ totalSold: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    const totalCount = await db.collection('products').countDocuments(productSellerQuery)

    // ── Fetch seller rating from seller_ratings collection ──
    // Meesho/Flipkart-style: sellers have their own rating (not derived from
    // product ratings). This is the aggregate of all customer ratings submitted
    // directly for the seller.
    const resolvedSellerIdForRating = sellerDoc?._id?.toString() || sellerId || ''
    let sellerAvgRating = 0
    let sellerTotalRatings = 0
    let sellerRatingDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }

    if (resolvedSellerIdForRating) {
      const ratingAgg = await db.collection('seller_ratings').aggregate([
        { $match: { sellerId: resolvedSellerIdForRating, status: 'active' } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalRatings: { $sum: 1 },
            r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          },
        },
      ]).toArray()
      const ratingStats = ratingAgg[0]
      if (ratingStats) {
        sellerAvgRating = ratingStats.avgRating ? Math.round(ratingStats.avgRating * 10) / 10 : 0
        sellerTotalRatings = ratingStats.totalRatings || 0
        sellerRatingDistribution = {
          '1': ratingStats.r1 || 0,
          '2': ratingStats.r2 || 0,
          '3': ratingStats.r3 || 0,
          '4': ratingStats.r4 || 0,
          '5': ratingStats.r5 || 0,
        }
      }
    }

    // ── Build seller profile response ──
    const profile = {
      sellerId: sellerDoc?._id?.toString() || sellerId || '',
      storeName: (sellerDoc?.storeName as string) || storeName || '',
      sellerName: (sellerDoc?.name as string) || '',
      isVerified: (sellerDoc?.isVerified as boolean) || false,
      verificationStatus: (sellerDoc?.verificationStatus as string) || 'pending',
      businessType: (sellerDoc?.businessType as string) || '',
      address: (sellerDoc?.address as string) || '',
      pickupAddress: sellerDoc?.pickupAddress || null,
      createdAt: sellerDoc?.createdAt || null,
      // Stats
      totalProducts: stats.totalProducts || 0,
      // Seller rating from seller_ratings collection (NOT product ratings)
      avgRating: sellerAvgRating,
      totalReviews: sellerTotalRatings,
      ratingDistribution: sellerRatingDistribution,
      totalSold: stats.totalSold || 0,
      priceRange: {
        min: stats.minPrice || 0,
        max: stats.maxPrice || 0,
      },
    }

    return NextResponse.json({
      seller: profile,
      products: products.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        slug: p.slug,
        mrp: p.mrp,
        sellingPrice: p.sellingPrice,
        effectivePrice: p.effectivePrice,
        hasDiscount: p.hasDiscount,
        discountPercent: p.discountPercent,
        imageUrl: p.imageUrl,
        images: p.images,
        category: p.category,
        subcategory: p.subcategory,
        brand: p.brand,
        stock: p.stock,
        inStock: p.inStock,
        avgRating: p.avgRating || 0,
        totalReviews: p.totalReviews || 0,
        totalSold: p.totalSold || 0,
        freeDelivery: p.freeDelivery || false,
        seller: p.seller,
        sellerId: p.sellerId,
      })),
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + products.length < totalCount,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/seller-profile] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch seller profile' }, { status: 500 })
  }
}
