/**
 * Customer Top Vendors API
 * -------------------------------------------------------------------
 * GET /api/customer/top-vendors
 *
 * Fetches top sellers from the database based on:
 *   - Number of products published
 *   - Total items sold
 *   - Seller rating (from seller_ratings collection)
 *
 * Returns up to 8 vendors with their store info, product count,
 * rating, and a representative product image.
 */

import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { db } = await connectToDatabase()

    // Aggregate sellers with their product stats
    const sellers = await db.collection('sellers')
      .find({
        status: { $in: ['Active', 'Approved', 'Pending'] },
      })
      .sort({ createdAt: 1 })
      .limit(20)
      .toArray()

    if (sellers.length === 0) {
      return NextResponse.json({ vendors: [] })
    }

    // For each seller, fetch product count + total sold + a representative image
    const vendorPromises = sellers.map(async (seller) => {
      const sellerId = seller._id.toString()
      const storeName = seller.storeName || 'Unknown Store'

      // Fetch product stats for this seller
      const productStats = await db.collection('products').aggregate([
        {
          $match: {
            $or: [
              { sellerId: sellerId },
              { seller: storeName },
            ],
            status: 'Published',
          },
        },
        {
          $group: {
            _id: null,
            productCount: { $sum: 1 },
            totalSold: { $sum: '$totalSold' },
            avgRating: { $avg: '$avgRating' },
          },
        },
      ]).toArray()

      const stats = productStats[0] || { productCount: 0, totalSold: 0, avgRating: 0 }

      // Fetch seller rating from seller_ratings collection
      const ratingAgg = await db.collection('seller_ratings').aggregate([
        { $match: { sellerId, status: 'active' } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalRatings: { $sum: 1 },
          },
        },
      ]).toArray()
      const ratingStats = ratingAgg[0] || { avgRating: 0, totalRatings: 0 }

      // Fetch a representative product image (first published product's image)
      const sampleProduct = await db.collection('products').findOne(
        {
          $or: [
            { sellerId: sellerId },
            { seller: storeName },
          ],
          status: 'Published',
        },
        { projection: { imageUrl: 1, images: 1 }, sort: { totalSold: -1 } }
      )

      const representativeImage = sampleProduct?.imageUrl || sampleProduct?.images?.[0]?.url || ''

      // Fetch follower count from customer_followed_sellers
      const followerCount = await db.collection('customer_followed_sellers').countDocuments({
        sellerId: sellerId,
      })

      return {
        id: sellerId,
        name: storeName,
        sellerName: seller.name || '',
        category: seller.businessType || 'General',
        rating: ratingStats.avgRating ? Math.round(ratingStats.avgRating * 10) / 10 : 0,
        totalRatings: ratingStats.totalRatings || 0,
        followers: followerCount,
        productCount: stats.productCount || 0,
        totalSold: stats.totalSold || 0,
        image: representativeImage,
        isVerified: seller.isVerified || false,
      }
    })

    let vendors = await Promise.all(vendorPromises)

    // Sort by: totalSold desc, then productCount desc, then rating desc
    vendors.sort((a, b) => {
      if (b.totalSold !== a.totalSold) return b.totalSold - a.totalSold
      if (b.productCount !== a.productCount) return b.productCount - a.productCount
      return b.rating - a.rating
    })

    // Take top 8
    vendors = vendors.slice(0, 8)

    return NextResponse.json({ vendors })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/top-vendors] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch top vendors' }, { status: 500 })
  }
}
