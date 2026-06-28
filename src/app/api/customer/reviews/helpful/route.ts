/**
 * Review Helpfulness API — /api/customer/reviews/helpful
 *
 * PUT — Vote on review helpfulness (auth required)
 *        Body: { reviewId, vote: 'helpful' | 'not_helpful' }
 *        Toggle behavior: same vote removes it, different vote switches
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'

export async function PUT(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { reviewId, vote } = body

    // ── Validation ─────────────────────────────────────────────────────
    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
    }

    if (!vote || (vote !== 'helpful' && vote !== 'not_helpful')) {
      return NextResponse.json(
        { error: 'vote must be "helpful" or "not_helpful"' },
        { status: 400 }
      )
    }

    const { db } = await connectToDatabase()

    // ── Verify review exists ────────────────────────────────────────────
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

    // ── Check existing vote ─────────────────────────────────────────────
    const existingVote = await db.collection('review_helpfulness').findOne({
      reviewId,
      customerId: customer.id,
    })

    if (existingVote) {
      if (existingVote.vote === vote) {
        // Same vote → toggle off (remove the vote)
        await db.collection('review_helpfulness').deleteOne({
          reviewId,
          customerId: customer.id,
        })

        // Decrement the count on the review
        const field = vote === 'helpful' ? 'helpful' : 'notHelpful'
        await db.collection('reviews').updateOne(
          { _id: reviewObjectId },
          { $inc: { [field]: -1 }, $set: { updatedAt: new Date() } }
        )

        return NextResponse.json({
          success: true,
          action: 'removed',
          vote: null,
        })
      } else {
        // Different vote → switch the vote
        await db.collection('review_helpfulness').updateOne(
          { reviewId, customerId: customer.id },
          {
            $set: { vote, updatedAt: new Date() },
          }
        )

        // Decrement old vote count, increment new vote count
        const oldField = existingVote.vote === 'helpful' ? 'helpful' : 'notHelpful'
        const newField = vote === 'helpful' ? 'helpful' : 'notHelpful'

        await db.collection('reviews').updateOne(
          { _id: reviewObjectId },
          {
            $inc: { [oldField]: -1, [newField]: 1 },
            $set: { updatedAt: new Date() },
          }
        )

        return NextResponse.json({
          success: true,
          action: 'switched',
          vote,
        })
      }
    }

    // ── No existing vote → create new vote ──────────────────────────────
    await db.collection('review_helpfulness').insertOne({
      reviewId,
      customerId: customer.id,
      vote,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Increment the count on the review
    const field = vote === 'helpful' ? 'helpful' : 'notHelpful'
    await db.collection('reviews').updateOne(
      { _id: reviewObjectId },
      { $inc: { [field]: 1 }, $set: { updatedAt: new Date() } }
    )

    return NextResponse.json({
      success: true,
      action: 'added',
      vote,
    })
  } catch (error) {
    console.error('[Review Helpfulness PUT Error]', error)
    return NextResponse.json({ error: 'Failed to vote on review' }, { status: 500 })
  }
}
