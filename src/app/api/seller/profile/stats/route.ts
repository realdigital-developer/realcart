import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/profile/stats                                      */
/*  Comprehensive seller profile with performance stats.               */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const sellerId = session.id
    const sellerAliases = session.sellerAliases

    // ── Fetch seller profile ────────────────────────────────────────
    let seller: any = null
    try {
      seller = await db.collection('sellers').findOne(
        { _id: new ObjectId(sellerId) },
        { projection: { passwordHash: 0 } }
      )
    } catch {
      // _id might be stored as a string
    }
    if (!seller) {
      seller = await db.collection('sellers').findOne(
        { _id: sellerId as any },
        { projection: { passwordHash: 0 } }
      )
    }
    if (!seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
    }

    // ── Build seller match filter ───────────────────────────────────
    const sellerMatch = sellerAliases.length === 1
      ? sellerAliases[0]
      : { $in: sellerAliases }

    // ── Product stats ───────────────────────────────────────────────
    const [totalProducts, activeProducts] = await Promise.all([
      db.collection('products').countDocuments({ seller: sellerMatch }),
      db.collection('products').countDocuments({ seller: sellerMatch, status: 'Published', active: true }),
    ])

    // ── Seller product IDs for reviews ──────────────────────────────
    const sellerProducts = await db.collection('products')
      .find({ seller: sellerMatch }, { projection: { _id: 1 } })
      .toArray()
    const sellerProductIds = sellerProducts.map((p) => p._id.toString())

    // ── Average rating & review count ───────────────────────────────
    let averageRating = 0
    let totalReviews = 0
    if (sellerProductIds.length > 0) {
      const ratingResult = await db.collection('reviews').aggregate([
        { $match: { productId: { $in: sellerProductIds }, status: 'active' } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            count: { $sum: 1 },
          },
        },
      ]).toArray()

      if (ratingResult.length > 0) {
        averageRating = Math.round((ratingResult[0].avgRating || 0) * 10) / 10
        totalReviews = ratingResult[0].count || 0
      }
    }

    // ── Order & Revenue stats ───────────────────────────────────────
    const uniqueSellerIds = [sellerId, ...sellerAliases]
    const sellerOrderMatch = { 'items.sellerId': { $in: uniqueSellerIds } }
    const sellerItemMatch = { 'items.sellerId': { $in: uniqueSellerIds } }

    const statsResult = await db.collection('orders').aggregate([
      { $match: sellerOrderMatch },
      { $unwind: '$items' },
      { $match: sellerItemMatch },
      {
        $facet: {
          orderStatusCounts: [
            { $group: { _id: { orderId: '$orderId', status: '$items.status' } } },
            { $group: { _id: '$_id.status', orderCount: { $sum: 1 } } },
          ],
          revenue: [
            { $match: { 'items.status': 'Delivered' } },
            { $group: { _id: null, totalRevenue: { $sum: '$items.sellerEarnings' } } },
          ],
        },
      },
    ]).toArray()

    const facets = statsResult[0] || {}
    const orderStatusCounts = facets.orderStatusCounts || []
    const revenueData = facets.revenue || []

    const statusMap: Record<string, number> = {}
    let totalOrders = 0
    for (const item of orderStatusCounts) {
      const status = item._id || 'Unknown'
      const count = item.orderCount || 0
      statusMap[status] = count
      totalOrders += count
    }

    const totalRevenue = revenueData.length > 0 ? (revenueData[0].totalRevenue || 0) : 0
    const deliveredOrders = statusMap['Delivered'] || 0

    // ── Documents completion ────────────────────────────────────────
    const requiredDocTypes = ['gst_certificate', 'pan_card', 'cancel_cheque', 'business_registration', 'address_proof']
    const uploadedDocs = requiredDocTypes.filter(
      (docType) => seller.documents && seller.documents[docType]
    )
    const documentsCompletion = Math.round((uploadedDocs.length / requiredDocTypes.length) * 100)

    // ── Member tenure ───────────────────────────────────────────────
    const createdAt = seller.createdAt ? new Date(seller.createdAt) : new Date()
    const now = new Date()
    const memberDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

    // ── Build profile response ──────────────────────────────────────
    const profile = {
      _id: seller._id.toString(),
      name: seller.name || '',
      email: seller.email || '',
      storeName: seller.storeName || '',
      phone: seller.phone || '',
      address: seller.address || null,
      gstNumber: seller.gstNumber || '',
      panNumber: seller.panNumber || '',
      businessType: seller.businessType || '',
      bankDetails: seller.bankDetails || null,
      pickupAddress: seller.pickupAddress || null,
      documents: seller.documents || null,
      verificationStatus: seller.verificationStatus || 'pending',
      verificationNotes: seller.verificationNotes || [],
      role: seller.role || 'seller',
      isVerified: seller.isVerified || false,
      status: seller.status || 'Active',
      createdAt: seller.createdAt || null,
      updatedAt: seller.updatedAt || null,
      lastLoginAt: seller.lastLoginAt || null,
    }

    const stats = {
      totalProducts,
      activeProducts,
      totalOrders,
      deliveredOrders,
      totalRevenue,
      averageRating,
      totalReviews,
      memberDays,
      documentsCompletion,
    }

    return NextResponse.json({ profile, stats })
  } catch (error) {
    console.error('[Seller Profile Stats GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch profile stats' }, { status: 500 })
  }
}
