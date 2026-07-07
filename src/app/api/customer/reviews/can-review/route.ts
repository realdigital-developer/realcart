/**
 * Can Review API — /api/customer/reviews/can-review
 *
 * GET — Check if the authenticated customer can review a product
 *       Query params: productId (required), orderId (optional)
 *       Returns: { canReview, reason, existingReview?, eligibleItems }
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { normalizeStatus } from '@/lib/order-state-machine'

export async function GET(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    const orderId = searchParams.get('orderId')

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // ── Check if customer already reviewed this product for this order ──
    const existingQuery: Record<string, unknown> = {
      customerId: customer.id,
      productId,
    }
    if (orderId) {
      existingQuery.orderId = orderId
    }

    const existingReview = await db.collection('reviews').findOne(existingQuery)

    if (existingReview && orderId) {
      // Already reviewed this product for this specific order
      return NextResponse.json({
        canReview: false,
        reason: 'You have already reviewed this product for this order',
        existingReview: {
          _id: existingReview._id.toString(),
          rating: existingReview.rating,
          title: existingReview.title,
          comment: existingReview.comment,
          status: existingReview.status,
          createdAt: existingReview.createdAt,
        },
        eligibleItems: [],
      })
    }

    // ── If orderId provided, verify order belongs to customer and item is delivered ──
    if (orderId) {
      const order = await db.collection('orders').findOne({
        orderId,
        customerId: customer.id,
      })

      if (!order) {
        return NextResponse.json({
          canReview: false,
          reason: 'Order not found or does not belong to you',
          eligibleItems: [],
        })
      }

      // Find items in the order matching this productId that are Delivered
      const eligibleItems = (order.items || [])
        .filter((item: Record<string, unknown>) => {
          if (item.productId !== productId) return false
          return normalizeStatus(item.status as string) === 'Delivered'
        })
        .map((item: Record<string, unknown>) => {
          // Check if this item already has a review
          return {
            orderItemId: item._id?.toString() || item._id,
            productId: item.productId,
            productName: item.productName,
            variant: item.variant || '',
            status: item.status,
          }
        })

      // Filter out items that already have reviews
      const itemIds = eligibleItems.map((i: { orderItemId: string }) => i.orderItemId)
      const existingReviewsForItems = await db.collection('reviews')
        .find({
          customerId: customer.id,
          productId,
          orderItemId: { $in: itemIds },
        })
        .toArray()

      const reviewedItemIds = new Set(existingReviewsForItems.map(r => r.orderItemId))
      const unreviewedItems = eligibleItems.filter(
        (i: { orderItemId: string }) => !reviewedItemIds.has(i.orderItemId)
      )

      if (unreviewedItems.length === 0) {
        return NextResponse.json({
          canReview: false,
          reason: 'You have already reviewed all delivered items for this product in this order',
          eligibleItems: [],
        })
      }

      return NextResponse.json({
        canReview: true,
        reason: null,
        eligibleItems: unreviewedItems,
      })
    }

    // ── No orderId provided — find all eligible orders/items for this product ──
    // Find all orders for this customer that contain this product and are delivered
    const orders = await db.collection('orders')
      .find({ customerId: customer.id })
      .toArray()

    const eligibleItems: Array<{
      orderId: string
      orderItemId: string
      productId: string
      productName: string
      variant: string | Record<string, unknown>
      status: string
    }> = []

    for (const order of orders) {
      for (const item of (order.items || []) as Record<string, unknown>[]) {
        if (item.productId !== productId) continue
        if (normalizeStatus(item.status as string) !== 'Delivered') continue

        eligibleItems.push({
          orderId: order.orderId,
          orderItemId: item._id?.toString() || (item._id as string),
          productId: item.productId as string,
          productName: item.productName as string,
          variant: (item.variant || '') as string | Record<string, unknown>,
          status: item.status as string,
        })
      }
    }

    // Filter out items that already have reviews
    const orderItemIdSet = eligibleItems.map(i => i.orderItemId)
    const existingReviews = orderItemIdSet.length > 0
      ? await db.collection('reviews')
          .find({
            customerId: customer.id,
            productId,
            orderItemId: { $in: orderItemIdSet },
          })
          .toArray()
      : []

    const reviewedIds = new Set(existingReviews.map(r => r.orderItemId))
    const unreviewedItems = eligibleItems.filter(i => !reviewedIds.has(i.orderItemId))

    if (unreviewedItems.length === 0) {
      return NextResponse.json({
        canReview: false,
        reason: existingReview
          ? 'You have already reviewed this product'
          : 'No delivered orders found for this product',
        existingReview: existingReview
          ? {
              _id: existingReview._id.toString(),
              rating: existingReview.rating,
              title: existingReview.title,
              comment: existingReview.comment,
              status: existingReview.status,
              createdAt: existingReview.createdAt,
            }
          : undefined,
        eligibleItems: [],
      })
    }

    return NextResponse.json({
      canReview: true,
      reason: null,
      eligibleItems: unreviewedItems,
    })
  } catch (error) {
    console.error('[Can Review GET Error]', error)
    return NextResponse.json({ error: 'Failed to check review eligibility' }, { status: 500 })
  }
}
