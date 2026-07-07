import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/earnings                                           */
/*  Computes actual earnings from the MongoDB orders collection.       */
/*  Now includes TDS/TCS/GST-on-commission deductions.                 */
/* ------------------------------------------------------------------ */

const PENDING_STATUSES = ['Processing', 'Shipped', 'Out for Delivery']

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10')))

    const { db } = await connectToDatabase()

    // Build the list of seller identifiers to match against items.sellerId
    const sellerIds = [session.id, ...session.sellerAliases]

    // ----------------------------------------------------------------
    // 1. Earnings with TDS/TCS breakdown (single aggregation with $facet)
    // ----------------------------------------------------------------
    const [earningsResult] = await db.collection('orders').aggregate([
      { $match: { 'items.sellerId': { $in: sellerIds } } },
      { $unwind: '$items' },
      { $match: { 'items.sellerId': { $in: sellerIds } } },
      {
        $facet: {
          delivered: [
            { $match: { 'items.status': 'Delivered' } },
            {
              $group: {
                _id: null,
                totalEarnings: { $sum: '$items.sellerEarnings' },
                totalCommission: { $sum: { $ifNull: ['$items.commission', 0] } },
                totalGstOnCommission: { $sum: { $ifNull: ['$items.gstOnCommission', 0] } },
                totalTds: { $sum: { $ifNull: ['$items.tdsAmount', 0] } },
                totalTcs: { $sum: { $ifNull: ['$items.tcsAmount', 0] } },
                totalTaxableValue: { $sum: { $ifNull: ['$items.taxableValue', '$items.total'] } },
              },
            },
          ],
          pending: [
            { $match: { 'items.status': { $in: PENDING_STATUSES } } },
            {
              $group: {
                _id: null,
                pendingPayments: { $sum: '$items.sellerEarnings' },
              },
            },
          ],
        },
      },
    ]).toArray()

    const totalEarnings = earningsResult?.delivered?.[0]?.totalEarnings || 0
    const pendingPayments = earningsResult?.pending?.[0]?.pendingPayments || 0
    const totalCommission = earningsResult?.delivered?.[0]?.totalCommission || 0
    const totalGstOnCommission = earningsResult?.delivered?.[0]?.totalGstOnCommission || 0
    const totalTds = earningsResult?.delivered?.[0]?.totalTds || 0
    const totalTcs = earningsResult?.delivered?.[0]?.totalTcs || 0
    const totalTaxableValue = earningsResult?.delivered?.[0]?.totalTaxableValue || 0

    // ----------------------------------------------------------------
    // 2. Monthly breakdown (last 12 months, delivered items only)
    // ----------------------------------------------------------------
    const now = new Date()

    // Use $toString to safely convert Date objects or pass through strings,
    // then $substr to extract year/month from ISO format "YYYY-MM-DD..."
    const monthlyRaw = await db.collection('orders').aggregate([
      { $match: { 'items.sellerId': { $in: sellerIds } } },
      { $unwind: '$items' },
      {
        $match: {
          'items.sellerId': { $in: sellerIds },
          'items.status': 'Delivered',
        },
      },
      {
        $addFields: {
          dateStr: {
            $toString: { $ifNull: ['$deliveredAt', '$createdAt'] },
          },
        },
      },
      {
        $addFields: {
          year: { $toInt: { $substr: ['$dateStr', 0, 4] } },
          month: { $toInt: { $substr: ['$dateStr', 5, 2] } },
        },
      },
      {
        $group: {
          _id: { year: '$year', month: '$month' },
          earnings: { $sum: '$items.sellerEarnings' },
          itemsSold: { $sum: '$items.quantity' },
          orderIds: { $addToSet: '$orderId' },
        },
      },
      {
        $project: {
          year: '$_id.year',
          month: '$_id.month',
          earnings: 1,
          itemsSold: 1,
          orderCount: { $size: '$orderIds' },
        },
      },
    ]).toArray()

    // Build a lookup map from aggregation results
    const monthlyMap = new Map<string, { earnings: number; itemsSold: number; orderCount: number }>()
    for (const m of monthlyRaw) {
      monthlyMap.set(`${m.year}-${m.month}`, {
        earnings: m.earnings || 0,
        itemsSold: m.itemsSold || 0,
        orderCount: m.orderCount || 0,
      })
    }

    // Fill in all 12 months (zero-filled for months with no data)
    const monthlyBreakdown = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const monthNumber = d.getMonth() + 1
      const monthName = d.toLocaleString('default', { month: 'short' })
      const key = `${year}-${monthNumber}`
      const data = monthlyMap.get(key)

      monthlyBreakdown.push({
        month: monthName,
        year,
        monthNumber,
        earnings: data?.earnings || 0,
        itemsSold: data?.itemsSold || 0,
        orderCount: data?.orderCount || 0,
      })
    }

    // ----------------------------------------------------------------
    // 3. Order breakdown (paginated list of delivered orders)
    // ----------------------------------------------------------------
    // Count total orders that have at least one delivered item from this seller
    const totalDeliveredOrders = await db.collection('orders').countDocuments({
      'items.sellerId': { $in: sellerIds },
      'items.status': 'Delivered',
    })

    const totalPages = Math.max(1, Math.ceil(totalDeliveredOrders / limit))
    const skip = (page - 1) * limit

    const ordersRaw = await db.collection('orders')
      .find({
        'items.sellerId': { $in: sellerIds },
        'items.status': 'Delivered',
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    const orderBreakdown = ordersRaw.map((order: any) => {
      // Filter to only this seller's delivered items
      const sellerItems = (order.items || []).filter(
        (item: any) => sellerIds.includes(item.sellerId) && item.status === 'Delivered'
      )

      const sellerEarnings = sellerItems.reduce(
        (sum: number, item: any) => sum + (item.sellerEarnings || 0),
        0
      )

      return {
        _id: order._id.toString(),
        orderNumber: order.orderId,
        customerName:
          order.shippingAddress?.name
          || order.customerName
          || 'Unknown',
        status: 'Delivered',
        orderDate: order.createdAt,
        deliveredAt: order.deliveredAt || null,
        sellerEarnings,
        items: sellerItems.map((item: any) => ({
          name: item.productName,
          price: item.price,
          effectivePrice: item.quantity > 0 ? item.total / item.quantity : item.price,
          quantity: item.quantity,
          imageUrl: item.productImage,
          brand: item.sellerStoreName,
        })),
      }
    })

    // ----------------------------------------------------------------
    // 4. Return response
    // ----------------------------------------------------------------
    return NextResponse.json({
      totalEarnings,
      pendingPayments,
      totalCommission,
      totalGstOnCommission,
      totalTds,
      totalTcs,
      totalTaxableValue,
      monthlyBreakdown,
      orderBreakdown,
      pagination: {
        page,
        limit,
        total: totalDeliveredOrders,
        totalPages,
      },
    })
  } catch (error) {
    console.error('[Seller Earnings GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch earnings data' }, { status: 500 })
  }
}
