import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'

/**
 * GET /api/customer/addresses
 * Get all addresses for the authenticated customer
 */
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const addresses = await db.collection('addresses')
      .find({ customerId: customer.id })
      .sort({ isDefault: -1, createdAt: -1 })
      .toArray()

    return NextResponse.json({
      addresses: addresses.map(a => ({ ...a, _id: a._id.toString() })),
    })
  } catch (error) {
    console.error('[Addresses GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch addresses' }, { status: 500 })
  }
}

/**
 * POST /api/customer/addresses
 * Add a new address
 */
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { name, mobile, addressLine1, addressLine2, city, state, pincode, landmark, type = 'home', isDefault = false } = body

    if (!name || !mobile || !addressLine1 || !city || !state || !pincode) {
      return NextResponse.json({ error: 'Required fields: name, mobile, addressLine1, city, state, pincode' }, { status: 400 })
    }

    if (!/^\d{6}$/.test(pincode)) {
      return NextResponse.json({ error: 'Pincode must be 6 digits' }, { status: 400 })
    }

    if (!/^\d{10}$/.test(mobile.replace(/\D/g, ''))) {
      return NextResponse.json({ error: 'Mobile must be 10 digits' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // If this is set as default, unset other defaults
    if (isDefault) {
      await db.collection('addresses').updateMany(
        { customerId: customer.id, isDefault: true },
        { $set: { isDefault: false } }
      )
    }

    // If this is the first address, make it default
    const existingCount = await db.collection('addresses').countDocuments({ customerId: customer.id })
    const shouldBeDefault = isDefault || existingCount === 0

    const addressDoc = {
      customerId: customer.id,
      name: name.trim(),
      mobile: mobile.replace(/\D/g, '').slice(-10),
      addressLine1: addressLine1.trim(),
      addressLine2: (addressLine2 || '').trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      landmark: (landmark || '').trim(),
      type: type || 'home',
      isDefault: shouldBeDefault,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await db.collection('addresses').insertOne(addressDoc)

    return NextResponse.json({
      success: true,
      address: { ...addressDoc, _id: result.insertedId.toString() },
    })
  } catch (error) {
    console.error('[Addresses POST Error]', error)
    return NextResponse.json({ error: 'Failed to add address' }, { status: 500 })
  }
}

/**
 * PUT /api/customer/addresses
 * Update an existing address
 */
export async function PUT(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { _id, ...updateData } = body

    if (!_id) {
      return NextResponse.json({ error: 'Address ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Verify ownership
    const existing = await db.collection('addresses').findOne({
      _id: new ObjectId(_id),
      customerId: customer.id,
    })

    if (!existing) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    }

    // If setting as default, unset other defaults
    if (updateData.isDefault) {
      await db.collection('addresses').updateMany(
        { customerId: customer.id, isDefault: true },
        { $set: { isDefault: false } }
      )
    }

    const cleanUpdate: Record<string, unknown> = { updatedAt: new Date() }
    const allowedFields = ['name', 'mobile', 'addressLine1', 'addressLine2', 'city', 'state', 'pincode', 'landmark', 'type', 'isDefault']
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        cleanUpdate[field] = typeof updateData[field] === 'string' ? updateData[field].trim() : updateData[field]
      }
    }

    await db.collection('addresses').updateOne(
      { _id: new ObjectId(_id) },
      { $set: cleanUpdate }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Addresses PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update address' }, { status: 500 })
  }
}

/**
 * DELETE /api/customer/addresses
 * Delete an address
 * Body: { addressId }
 */
export async function DELETE(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { addressId } = body

    if (!addressId) {
      return NextResponse.json({ error: 'Address ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const deleted = await db.collection('addresses').findOneAndDelete({
      _id: new ObjectId(addressId),
      customerId: customer.id,
    })

    if (deleted && deleted.isDefault) {
      // Set the most recent remaining address as default
      const nextAddress = await db.collection('addresses').findOne(
        { customerId: customer.id },
        { sort: { createdAt: -1 } }
      )
      if (nextAddress) {
        await db.collection('addresses').updateOne(
          { _id: nextAddress._id },
          { $set: { isDefault: true } }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Addresses DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete address' }, { status: 500 })
  }
}
