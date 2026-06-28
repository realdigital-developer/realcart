/**
 * POST /api/customer/shared-products — Store a product share record
 * GET  /api/customer/shared-products — Get all products shared by the customer
 *
 * When a customer shares a product (via the Web Share API), a record is
 * stored in MongoDB so the customer can view all their shared products
 * in the Shared Products page.
 *
 * Auth: requires customer session (JWT cookie)
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST — store a share record
 * Body: { productId, name, imageUrl, effectivePrice, mrp, brand, category }
 */
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { productId, name, imageUrl, effectivePrice, mrp, brand, category } = body

    if (!productId || !name) {
      return NextResponse.json({ error: 'productId and name are required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Upsert — if the customer already shared this product, update the
    // share count and timestamp instead of creating a duplicate.
    const existing = await db.collection('shared_products').findOne({
      customerId: customer.id,
      productId,
    })

    if (existing) {
      await db.collection('shared_products').updateOne(
        { _id: existing._id },
        {
          $set: {
            name, imageUrl, effectivePrice, mrp, brand, category,
            lastSharedAt: new Date().toISOString(),
          },
          $inc: { shareCount: 1 },
        },
      )
    } else {
      await db.collection('shared_products').insertOne({
        customerId: customer.id,
        productId,
        name,
        imageUrl: imageUrl || '',
        effectivePrice: effectivePrice || 0,
        mrp: mrp || 0,
        brand: brand || '',
        category: category || '',
        shareCount: 1,
        firstSharedAt: new Date().toISOString(),
        lastSharedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/customer/shared-products] error:', msg)
    return NextResponse.json({ error: 'Failed to store share record' }, { status: 500 })
  }
}

/**
 * GET — fetch all products shared by the customer
 * Returns: { sharedProducts: [...] }
 */
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const sharedProducts = await db
      .collection('shared_products')
      .find({ customerId: customer.id })
      .sort({ lastSharedAt: -1 })
      .toArray()

    return NextResponse.json({
      sharedProducts: sharedProducts.map((p) => ({
        _id: p._id.toString(),
        productId: p.productId,
        name: p.name,
        imageUrl: p.imageUrl,
        effectivePrice: p.effectivePrice,
        mrp: p.mrp,
        brand: p.brand,
        category: p.category,
        shareCount: p.shareCount,
        firstSharedAt: p.firstSharedAt,
        lastSharedAt: p.lastSharedAt,
      })),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/shared-products] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch shared products' }, { status: 500 })
  }
}
