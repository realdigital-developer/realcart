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
        { phone: { $regex: search, $options: 'i' } },
        { storeName: { $regex: search, $options: 'i' } },
      ]
    }
    if (status && status !== 'all') {
      query.status = status
    }

    const total = await db.collection('sellers').countDocuments(query)
    const sellers = await db.collection('sellers')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    // Explicitly strip passwordHash before sending to client
    const safeSellers = sellers.map((s) => {
      const obj = { ...s, _id: s._id.toString() }
      delete (obj as Record<string, unknown>).passwordHash
      return obj
    })

    return NextResponse.json({
      sellers: safeSellers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Admin Sellers GET Error]', error)
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
    if (updateData.phone !== undefined) safeUpdate.phone = updateData.phone
    if (updateData.storeName !== undefined) safeUpdate.storeName = updateData.storeName
    if (updateData.address !== undefined) safeUpdate.address = updateData.address
    if (updateData.gstNumber !== undefined) safeUpdate.gstNumber = updateData.gstNumber
    if (updateData.panNumber !== undefined) safeUpdate.panNumber = updateData.panNumber
    if (updateData.businessType !== undefined) safeUpdate.businessType = updateData.businessType
    if (updateData.status !== undefined) safeUpdate.status = updateData.status
    if (updateData.isVerified !== undefined) safeUpdate.isVerified = updateData.isVerified
    if (updateData.verificationStatus !== undefined) safeUpdate.verificationStatus = updateData.verificationStatus
    // When admin verifies a seller, auto-set status to Active
    if (updateData.isVerified === true && updateData.status === undefined) {
      safeUpdate.status = 'Active'
    }

    await db.collection('sellers').updateOne(
      { _id: new ObjectId(_id) },
      { $set: safeUpdate }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Sellers PUT Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    await db.collection('sellers').deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Sellers DELETE Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
