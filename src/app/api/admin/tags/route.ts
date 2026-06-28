import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const category = searchParams.get('category') || ''
    const createdBy = searchParams.get('createdBy') || ''

    const query: Record<string, unknown> = {}
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ]
    }
    if (status && status !== 'all') {
      query.status = status
    }
    if (category && category !== 'all') {
      query.category = category
    }
    if (createdBy && createdBy !== 'all') {
      query.createdBy = createdBy
    }

    const total = await db.collection('tags').countDocuments(query)
    const tags = await db.collection('tags')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const safeTags = tags.map((t) => ({
      ...t,
      _id: t._id.toString(),
    }))

    // Get unique categories from BOTH the categories collection AND tags collection.
    //
    // The categories collection is the AUTHORITATIVE source — it contains all
    // parent and subcategory names. We also include categories that exist only
    // in tags (in case some were deleted from categories but tags still reference them).
    //
    // This ensures the category dropdown always shows ALL available categories,
    // even when no tags have been created yet (fixes the empty dropdown bug).

    // 1. Get all category names from the categories collection (authoritative)
    const categoryNamesFromCollection = await db.collection('categories')
      .distinct('name')

    // 2. Get category names currently used in tags (may include deleted categories)
    const categoryNamesFromTags = await db.collection('tags')
      .distinct('category')

    // 3. Merge and deduplicate, then sort alphabetically
    const categoriesSet = new Set([
      ...categoryNamesFromCollection.filter((name): name is string => !!name),
      ...categoryNamesFromTags.filter((name): name is string => !!name),
    ])
    const categories = Array.from(categoriesSet).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    )

    return NextResponse.json({
      tags: safeTags,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      categories,
    })
  } catch (error) {
    console.error('[Admin Tags GET Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()
    const { name, category, status, createdBy } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
    }

    // Check for duplicate name
    const existing = await db.collection('tags').findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } })
    if (existing) {
      return NextResponse.json({ error: 'Tag with this name already exists' }, { status: 409 })
    }

    const now = new Date()
    const doc = {
      name: name.trim(),
      category: category?.trim() || 'General',
      createdBy: createdBy || 'Admin',
      status: status || 'Active',
      createdAt: now,
      updatedAt: now,
    }

    const result = await db.collection('tags').insertOne(doc)

    return NextResponse.json({
      success: true,
      tag: { ...doc, _id: result.insertedId.toString() },
    })
  } catch (error) {
    console.error('[Admin Tags POST Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()
    const { _id, ...updateData } = body

    if (!_id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const safeUpdate: Record<string, unknown> = { updatedAt: new Date() }
    if (updateData.name !== undefined) safeUpdate.name = updateData.name.trim()
    if (updateData.category !== undefined) safeUpdate.category = updateData.category.trim()
    if (updateData.status !== undefined) safeUpdate.status = updateData.status
    if (updateData.createdBy !== undefined) safeUpdate.createdBy = updateData.createdBy

    await db.collection('tags').updateOne(
      { _id: new ObjectId(_id) },
      { $set: safeUpdate }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Tags PUT Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    await db.collection('tags').deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Tags DELETE Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
