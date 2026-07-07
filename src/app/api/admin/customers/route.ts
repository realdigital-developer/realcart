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

    const query: Record<string, unknown> = {}
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
      ]
    }
    if (status && status !== 'all') {
      query.status = status
    }

    const total = await db.collection('customers').countDocuments(query)
    const customers = await db.collection('customers')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .project({ passcodeHash: 0 }) // Never expose password hash
      .toArray()

    // Explicitly strip passcodeHash before sending to client
    const safeCustomers = customers.map((c) => {
      const obj = { ...c, _id: c._id.toString() }
      delete (obj as Record<string, unknown>).passcodeHash
      return obj
    })

    return NextResponse.json({
      customers: safeCustomers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Admin Customers GET Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()
    const { _id, ...updateData } = body

    if (!_id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    // Build safe update object - only allow specific fields
    const safeUpdate: Record<string, unknown> = { updatedAt: new Date() }
    if (updateData.name !== undefined) safeUpdate.name = updateData.name
    if (updateData.email !== undefined) safeUpdate.email = updateData.email
    if (updateData.mobile !== undefined) safeUpdate.mobile = updateData.mobile
    if (updateData.status !== undefined) safeUpdate.status = updateData.status

    await db.collection('customers').updateOne(
      { _id: new ObjectId(_id) },
      { $set: safeUpdate }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Customers PUT Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    await db.collection('customers').deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Customers DELETE Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
