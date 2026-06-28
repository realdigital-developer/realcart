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
    const type = searchParams.get('type') || ''

    const query: Record<string, unknown> = {}
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }
    if (status && status !== 'all') {
      query.status = status
    }
    if (type && type !== 'all') {
      query.type = type
    }

    const total = await db.collection('attributes').countDocuments(query)
    const attributes = await db.collection('attributes')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const safeAttributes = attributes.map((a) => ({
      ...a,
      _id: a._id.toString(),
    }))

    return NextResponse.json({
      attributes: safeAttributes,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Admin Attributes GET Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()
    const { name, description, type, values, status } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Attribute name is required' }, { status: 400 })
    }

    // Check for duplicate name
    const existing = await db.collection('attributes').findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } })
    if (existing) {
      return NextResponse.json({ error: 'Attribute with this name already exists' }, { status: 409 })
    }

    const now = new Date()
    const doc = {
      name: name.trim(),
      description: description?.trim() || '',
      type: type || 'text',
      values: Array.isArray(values) ? values : [],
      status: status || 'Active',
      createdAt: now,
      updatedAt: now,
    }

    const result = await db.collection('attributes').insertOne(doc)

    return NextResponse.json({
      success: true,
      attribute: { ...doc, _id: result.insertedId.toString() },
    })
  } catch (error) {
    console.error('[Admin Attributes POST Error]', error)
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
    if (updateData.description !== undefined) safeUpdate.description = updateData.description.trim()
    if (updateData.type !== undefined) safeUpdate.type = updateData.type
    if (updateData.values !== undefined) safeUpdate.values = updateData.values
    if (updateData.status !== undefined) safeUpdate.status = updateData.status

    await db.collection('attributes').updateOne(
      { _id: new ObjectId(_id) },
      { $set: safeUpdate }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Attributes PUT Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    await db.collection('attributes').deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Attributes DELETE Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
