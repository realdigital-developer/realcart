import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

const HIGHLIGHTS_COLLECTION = 'highlights'

/**
 * GET /api/admin/highlights
 * Fetch highlights with pagination, search, and status filter.
 * Query params: search, status, createdBy, page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10', 10)))
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const createdBy = searchParams.get('createdBy') || ''

    // Build filter
    const query: any = {}
    if (search) {
      query.name = { $regex: search, $options: 'i' }
    }
    if (status && status !== 'all') {
      query.status = status
    }
    if (createdBy && createdBy !== 'all') {
      query.createdBy = createdBy
    }

    const total = await db.collection(HIGHLIGHTS_COLLECTION).countDocuments(query)
    const highlights = await db.collection(HIGHLIGHTS_COLLECTION)
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const safeHighlights = highlights.map((h) => ({
      ...h,
      _id: h._id.toString(),
    }))

    return NextResponse.json({
      highlights: safeHighlights,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (error) {
    console.error('[Admin Highlights GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch highlights' }, { status: 500 })
  }
}

/**
 * POST /api/admin/highlights
 * Create a new highlight. Only requires a name field.
 * Body: { name: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()
    const { name } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Highlight name is required' }, { status: 400 })
    }

    // Check for duplicate name (case-insensitive)
    const existing = await db.collection(HIGHLIGHTS_COLLECTION).findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
    })
    if (existing) {
      return NextResponse.json({ error: 'A highlight with this name already exists' }, { status: 409 })
    }

    const now = new Date()
    const doc = {
      name: name.trim(),
      status: 'Active',
      createdBy: 'Admin',
      createdAt: now,
      updatedAt: now,
    }

    const result = await db.collection(HIGHLIGHTS_COLLECTION).insertOne(doc)

    return NextResponse.json({
      success: true,
      highlight: { ...doc, _id: result.insertedId.toString() },
    }, { status: 201 })
  } catch (error) {
    console.error('[Admin Highlights POST Error]', error)
    return NextResponse.json({ error: 'Failed to create highlight' }, { status: 500 })
  }
}

/**
 * PUT /api/admin/highlights
 * Update an existing highlight by ID.
 * Body: { _id: string, name?: string, status?: string }
 */
export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()
    const { _id, ...updateData } = body

    if (!_id) {
      return NextResponse.json({ error: 'Highlight ID is required' }, { status: 400 })
    }

    // Build safe update object (whitelist allowed fields)
    const safeUpdate: any = { updatedAt: new Date() }
    if (updateData.name !== undefined) {
      const trimmedName = updateData.name.trim()
      if (!trimmedName) {
        return NextResponse.json({ error: 'Highlight name cannot be empty' }, { status: 400 })
      }

      // Check for duplicate name (excluding current highlight)
      const existing = await db.collection(HIGHLIGHTS_COLLECTION).findOne({
        name: { $regex: `^${trimmedName}$`, $options: 'i' },
        _id: { $ne: new ObjectId(_id) },
      })
      if (existing) {
        return NextResponse.json({ error: 'A highlight with this name already exists' }, { status: 409 })
      }

      safeUpdate.name = trimmedName
    }
    if (updateData.status !== undefined) {
      safeUpdate.status = updateData.status
    }

    const result = await db.collection(HIGHLIGHTS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(_id) },
      { $set: safeUpdate },
      { returnDocument: 'after' },
    )

    if (!result) {
      return NextResponse.json({ error: 'Highlight not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      highlight: {
        _id: result._id.toString(),
        name: result.name,
        status: result.status,
        createdBy: result.createdBy,
        createdAt: result.createdAt ? new Date(result.createdAt).toISOString() : null,
        updatedAt: result.updatedAt ? new Date(result.updatedAt).toISOString() : null,
      },
    })
  } catch (error) {
    console.error('[Admin Highlights PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update highlight' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/highlights
 * Delete a highlight by ID.
 * Query params: id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Highlight ID is required' }, { status: 400 })
    }

    const result = await db.collection(HIGHLIGHTS_COLLECTION).findOneAndDelete({
      _id: new ObjectId(id),
    })

    if (!result) {
      return NextResponse.json({ error: 'Highlight not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      deletedHighlight: {
        _id: result._id.toString(),
        name: result.name,
      },
    })
  } catch (error) {
    console.error('[Admin Highlights DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete highlight' }, { status: 500 })
  }
}
