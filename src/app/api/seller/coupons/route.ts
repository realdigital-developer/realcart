import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { ObjectId } from 'mongodb'
import {
  toClientCoupon,
  type CouponDocument,
} from '@/lib/coupon-engine'

/* ------------------------------------------------------------------ */
/*  Helpers (shared with admin route logic)                            */
/* ------------------------------------------------------------------ */

async function ensureRedemptionIndex(db: import('mongodb').Db) {
  try {
    await db.collection('couponRedemptions').createIndex(
      { couponId: 1, orderId: 1 },
      { unique: true },
    )
  } catch {
    // Non-fatal
  }
}

function buildCouponDoc(
  body: Record<string, unknown>,
  sellerId: string,
  sellerStoreName: string,
): { ok: boolean; error?: string; doc?: CouponDocument } {
  const code = String(body.code || '').toUpperCase().trim()
  if (!code) return { ok: false, error: 'Coupon code is required' }

  const discountType = body.discountType
  if (!discountType || !['percentage', 'flat'].includes(discountType as string)) {
    return { ok: false, error: 'Discount type must be "percentage" or "flat"' }
  }

  const discountValue = Number(body.discountValue)
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { ok: false, error: 'Discount value must be a positive number' }
  }
  if (discountType === 'percentage' && discountValue > 100) {
    return { ok: false, error: 'Percentage discount cannot exceed 100%' }
  }

  const maxDiscount = Math.max(0, Number(body.maxDiscount) || 0)
  const minOrderAmount = Math.max(0, Number(body.minOrderAmount) || 0)
  const usageLimit = Math.max(0, Math.floor(Number(body.usageLimit) || 0))
  const perCustomerLimit = Math.max(0, Math.floor(Number(body.perCustomerLimit) || 0))

  const asStrArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
    if (typeof v === 'string' && v.trim()) return v.split(',').map((x) => x.trim()).filter(Boolean)
    return []
  }
  // Seller coupons may restrict to specific categories or products within their store.
  // applicableSellerIds is ignored for seller coupons (always scoped to the owner).
  const applicableCategories = asStrArray(body.applicableCategories)
  const applicableProductIds = asStrArray(body.applicableProductIds)

  const parseDate = (v: unknown): Date | null => {
    if (!v) return null
    if (v instanceof Date) return v
    const d = new Date(v as string)
    return isNaN(d.getTime()) ? null : d
  }
  const startDate = parseDate(body.startDate)
  const endDate = parseDate(body.endDate)
  if (startDate && endDate && startDate > endDate) {
    return { ok: false, error: 'Start date cannot be after end date' }
  }

  const now = new Date()
  const doc: CouponDocument = {
    code,
    title: String(body.title || '').trim(),
    displayText: String(body.displayText || '').trim(),
    description: String(body.description || '').trim(),
    scope: 'seller',
    sellerId,
    sellerStoreName,
    discountType: discountType as 'percentage' | 'flat',
    discountValue,
    maxDiscount,
    minOrderAmount,
    startDate,
    endDate,
    isActive: body.isActive !== false,
    usageLimit,
    usedCount: 0,
    perCustomerLimit,
    firstOrderOnly: Boolean(body.firstOrderOnly),
    applicableCategories,
    applicableProductIds,
    applicableSellerIds: [],
    featured: Boolean(body.featured),
    createdAt: now,
    updatedAt: now,
  }
  return { ok: true, doc }
}

/* ------------------------------------------------------------------ */
/*  Auth wrapper                                                        */
/* ------------------------------------------------------------------ */

async function sellerAuth(request: NextRequest) {
  const auth = await authenticateSeller(request)
  if (auth.error) return { error: auth.error, session: null }
  return { error: null, session: auth.session }
}

/* ------------------------------------------------------------------ */
/*  GET — list THIS seller's coupons                                   */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await sellerAuth(request)
    if (error || !session) return error!

    const { db } = await connectToDatabase()
    await ensureRedemptionIndex(db)

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const activeOnly = searchParams.get('activeOnly') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))

    const filter: Record<string, unknown> = {
      scope: 'seller',
      sellerId: session.id,
    }
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
      ]
    }
    if (activeOnly) filter.isActive = { $ne: false }

    const total = await db.collection('coupons').countDocuments(filter)
    const coupons = await db.collection('coupons')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    return NextResponse.json({
      coupons: coupons.map((c) => toClientCoupon(c as unknown as CouponDocument)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Seller Coupons GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST — create a seller coupon                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { error, session } = await sellerAuth(request)
    if (error || !session) return error!

    const body = await request.json()
    const built = buildCouponDoc(body, session.id, session.storeName)
    if (!built.ok || !built.doc) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    await ensureRedemptionIndex(db)

    const existing = await db.collection('coupons').findOne({ code: built.doc.code })
    if (existing) {
      return NextResponse.json({ error: 'A coupon with this code already exists' }, { status: 409 })
    }

    built.doc.createdBy = session.id
    const result = await db.collection('coupons').insertOne(built.doc)
    const created = { ...built.doc, _id: result.insertedId }

    return NextResponse.json(
      { success: true, coupon: toClientCoupon(created) },
      { status: 201 },
    )
  } catch (error) {
    console.error('[Seller Coupons POST Error]', error)
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT — update a seller coupon (must own it)                         */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const { error, session } = await sellerAuth(request)
    if (error || !session) return error!

    const body = await request.json()
    const { _id, ...updateData } = body

    if (!_id) {
      return NextResponse.json({ error: 'Coupon ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Verify ownership — seller can only update their own coupons
    const existing = await db.collection('coupons').findOne({
      _id: new ObjectId(_id),
      scope: 'seller',
      sellerId: session.id,
    })
    if (!existing) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
    }

    if (updateData.code && String(updateData.code).toUpperCase().trim() !== existing.code) {
      const duplicate = await db.collection('coupons').findOne({
        code: String(updateData.code).toUpperCase().trim(),
        _id: { $ne: new ObjectId(_id) },
      })
      if (duplicate) {
        return NextResponse.json({ error: 'A coupon with this code already exists' }, { status: 409 })
      }
    }

    const cleanUpdate: Record<string, unknown> = { updatedAt: new Date() }
    const asStrArray = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
      if (typeof v === 'string' && v.trim()) return v.split(',').map((x) => x.trim()).filter(Boolean)
      return []
    }
    const parseDate = (v: unknown): Date | null => {
      if (!v) return null
      if (v instanceof Date) return v
      const d = new Date(v as string)
      return isNaN(d.getTime()) ? null : d
    }

    if (updateData.code !== undefined) cleanUpdate.code = String(updateData.code).toUpperCase().trim()
    if (updateData.title !== undefined) cleanUpdate.title = String(updateData.title).trim()
    if (updateData.displayText !== undefined) cleanUpdate.displayText = String(updateData.displayText).trim()
    if (updateData.description !== undefined) cleanUpdate.description = String(updateData.description).trim()
    if (updateData.discountType !== undefined) {
      if (!['percentage', 'flat'].includes(updateData.discountType)) {
        return NextResponse.json({ error: 'Invalid discount type' }, { status: 400 })
      }
      cleanUpdate.discountType = updateData.discountType
    }
    if (updateData.discountValue !== undefined) {
      const v = Number(updateData.discountValue)
      if (!Number.isFinite(v) || v <= 0) {
        return NextResponse.json({ error: 'Discount value must be positive' }, { status: 400 })
      }
      if (updateData.discountType === 'percentage' && v > 100) {
        return NextResponse.json({ error: 'Percentage cannot exceed 100%' }, { status: 400 })
      }
      cleanUpdate.discountValue = v
    }
    if (updateData.maxDiscount !== undefined) cleanUpdate.maxDiscount = Math.max(0, Number(updateData.maxDiscount) || 0)
    if (updateData.minOrderAmount !== undefined) cleanUpdate.minOrderAmount = Math.max(0, Number(updateData.minOrderAmount) || 0)
    if (updateData.usageLimit !== undefined) cleanUpdate.usageLimit = Math.max(0, Math.floor(Number(updateData.usageLimit) || 0))
    if (updateData.perCustomerLimit !== undefined) cleanUpdate.perCustomerLimit = Math.max(0, Math.floor(Number(updateData.perCustomerLimit) || 0))
    if (updateData.isActive !== undefined) cleanUpdate.isActive = Boolean(updateData.isActive)
    if (updateData.firstOrderOnly !== undefined) cleanUpdate.firstOrderOnly = Boolean(updateData.firstOrderOnly)
    if (updateData.featured !== undefined) cleanUpdate.featured = Boolean(updateData.featured)
    if (updateData.applicableCategories !== undefined) cleanUpdate.applicableCategories = asStrArray(updateData.applicableCategories)
    if (updateData.applicableProductIds !== undefined) cleanUpdate.applicableProductIds = asStrArray(updateData.applicableProductIds)
    if (updateData.startDate !== undefined) cleanUpdate.startDate = parseDate(updateData.startDate)
    if (updateData.endDate !== undefined) cleanUpdate.endDate = parseDate(updateData.endDate)

    await db.collection('coupons').updateOne(
      { _id: new ObjectId(_id) },
      { $set: cleanUpdate },
    )

    const updated = await db.collection('coupons').findOne({ _id: new ObjectId(_id) })
    return NextResponse.json({ success: true, coupon: toClientCoupon(updated as unknown as CouponDocument) })
  } catch (error) {
    console.error('[Seller Coupons PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — delete a seller coupon (must own it)                      */
/* ------------------------------------------------------------------ */

export async function DELETE(request: NextRequest) {
  try {
    const { error, session } = await sellerAuth(request)
    if (error || !session) return error!

    const body = await request.json()
    const { _id } = body

    if (!_id) {
      return NextResponse.json({ error: 'Coupon ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Verify ownership before deleting
    const result = await db.collection('coupons').findOneAndDelete({
      _id: new ObjectId(_id),
      scope: 'seller',
      sellerId: session.id,
    })

    if (!result) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Seller Coupons DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete coupon' }, { status: 500 })
  }
}
