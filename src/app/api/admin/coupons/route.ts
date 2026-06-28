import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { ObjectId } from 'mongodb'
import {
  toClientCoupon,
  type CouponDocument,
} from '@/lib/coupon-engine'

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Ensure the couponRedemptions collection has its unique index. */
async function ensureRedemptionIndex(db: import('mongodb').Db) {
  try {
    await db.collection('couponRedemptions').createIndex(
      { couponId: 1, orderId: 1 },
      { unique: true },
    )
  } catch {
    // Non-fatal — index may already exist or creation is not permitted.
  }
}

/** Normalise + validate an incoming coupon body into a CouponDocument. */
function buildCouponDoc(body: Record<string, unknown>, scope: 'platform' | 'seller', sellerId?: string, sellerStoreName?: string): {
  ok: boolean
  error?: string
  doc?: CouponDocument
} {
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

  // Parse applicability arrays (accept string[] or comma-separated string)
  const asStrArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
    if (typeof v === 'string' && v.trim()) return v.split(',').map((x) => x.trim()).filter(Boolean)
    return []
  }
  const applicableCategories = asStrArray(body.applicableCategories)
  const applicableProductIds = asStrArray(body.applicableProductIds)
  const applicableSellerIds = asStrArray(body.applicableSellerIds)

  // Dates
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
    scope,
    sellerId: scope === 'seller' ? (sellerId || null) : null,
    sellerStoreName: scope === 'seller' ? (sellerStoreName || null) : null,
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
    applicableSellerIds,
    featured: Boolean(body.featured),
    createdAt: now,
    updatedAt: now,
  }
  return { ok: true, doc }
}

/* ------------------------------------------------------------------ */
/*  GET — list coupons                                                  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    await ensureRedemptionIndex(db)

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const scope = searchParams.get('scope') || '' // 'platform' | 'seller' | ''
    const activeOnly = searchParams.get('activeOnly') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))

    const filter: Record<string, unknown> = {}
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
      ]
    }
    if (scope === 'platform' || scope === 'seller') {
      filter.scope = scope
    }
    if (activeOnly) {
      filter.isActive = { $ne: false }
    }

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
    console.error('[Admin Coupons GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST — create coupon                                                */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const built = buildCouponDoc(body, 'platform')
    if (!built.ok || !built.doc) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    await ensureRedemptionIndex(db)

    // Check for duplicate code
    const existing = await db.collection('coupons').findOne({ code: built.doc.code })
    if (existing) {
      return NextResponse.json({ error: 'A coupon with this code already exists' }, { status: 409 })
    }

    built.doc.createdBy = 'admin'
    const result = await db.collection('coupons').insertOne(built.doc)
    const created = { ...built.doc, _id: result.insertedId }

    return NextResponse.json(
      { success: true, coupon: toClientCoupon(created) },
      { status: 201 },
    )
  } catch (error) {
    console.error('[Admin Coupons POST Error]', error)
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT — update coupon                                                 */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { _id, ...updateData } = body

    if (!_id) {
      return NextResponse.json({ error: 'Coupon ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const existing = await db.collection('coupons').findOne({ _id: new ObjectId(_id) })
    if (!existing) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
    }

    // If code is being updated, check for duplicates
    if (updateData.code && String(updateData.code).toUpperCase().trim() !== existing.code) {
      const duplicate = await db.collection('coupons').findOne({
        code: String(updateData.code).toUpperCase().trim(),
        _id: { $ne: new ObjectId(_id) },
      })
      if (duplicate) {
        return NextResponse.json({ error: 'A coupon with this code already exists' }, { status: 409 })
      }
    }

    // Build the update document with validation
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
    if (updateData.applicableSellerIds !== undefined) cleanUpdate.applicableSellerIds = asStrArray(updateData.applicableSellerIds)
    if (updateData.startDate !== undefined) cleanUpdate.startDate = parseDate(updateData.startDate)
    if (updateData.endDate !== undefined) cleanUpdate.endDate = parseDate(updateData.endDate)

    await db.collection('coupons').updateOne(
      { _id: new ObjectId(_id) },
      { $set: cleanUpdate },
    )

    const updated = await db.collection('coupons').findOne({ _id: new ObjectId(_id) })
    return NextResponse.json({ success: true, coupon: toClientCoupon(updated as unknown as CouponDocument) })
  } catch (error) {
    console.error('[Admin Coupons PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — delete coupon                                              */
/* ------------------------------------------------------------------ */

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { _id } = body

    if (!_id) {
      return NextResponse.json({ error: 'Coupon ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const result = await db.collection('coupons').findOneAndDelete({
      _id: new ObjectId(_id),
    })

    if (!result) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Coupons DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete coupon' }, { status: 500 })
  }
}
