import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { verifyCustomerSession, createCustomerSessionToken, CUSTOMER_COOKIE_NAME } from '@/lib/customer-auth'
import { uploadProfileImage, deleteFile, validateImageFile, DEFAULT_IMAGE_TYPES, DEFAULT_MAX_IMAGE_SIZE } from '@/lib/upload'

/**
 * GET /api/customer/profile
 * Get customer profile details including profile image
 */
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    // Try to find by _id first (convert to ObjectId), then by mobile
    let customerDoc = null
    try {
      customerDoc = await db.collection('customers').findOne({ _id: new ObjectId(customer.id) })
    } catch {
      // ID might not be a valid ObjectId, try mobile lookup
    }

    if (!customerDoc) {
      customerDoc = await db.collection('customers').findOne({ mobile: customer.mobile })
    }

    if (!customerDoc) {
      // Return basic info from session if DB record not found
      return NextResponse.json({
        profile: {
          _id: customer.id,
          name: customer.name || '',
          mobile: customer.mobile || '',
          email: '',
          profileImage: null,
          createdAt: new Date().toISOString(),
        },
      })
    }

    return NextResponse.json({
      profile: {
        _id: customerDoc._id.toString(),
        name: customerDoc.name || '',
        mobile: customerDoc.mobile || '',
        email: customerDoc.email || '',
        profileImage: customerDoc.profileImage || null,
        createdAt: customerDoc.createdAt ? new Date(customerDoc.createdAt).toISOString() : null,
      },
    })
  } catch (error) {
    console.error('[Profile GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

/**
 * POST /api/customer/profile
 * Upload/update customer profile image
 * Body: FormData with 'file' field
 */
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type and size
    const validationError = validateImageFile(file, DEFAULT_IMAGE_TYPES, DEFAULT_MAX_IMAGE_SIZE)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Find the customer document
    let filter: Record<string, unknown>
    try {
      filter = { _id: new ObjectId(customer.id) }
    } catch {
      filter = { mobile: customer.mobile }
    }

    const existingDoc = await db.collection('customers').findOne(filter)

    // Delete old profile image from Cloudinary if it exists
    if (existingDoc?.profileImage?.publicId) {
      await deleteFile(existingDoc.profileImage.publicId)
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Upload to Cloudinary
    const customerId = existingDoc?._id?.toString() || customer.id
    const result = await uploadProfileImage(buffer, file.type, customerId)

    // Store image metadata in MongoDB
    const profileImageMeta = {
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.size,
      uploadedAt: new Date(),
    }

    await db.collection('customers').updateOne(
      filter,
      {
        $set: {
          profileImage: profileImageMeta,
          updatedAt: new Date(),
        },
      }
    )

    return NextResponse.json({
      success: true,
      profileImage: {
        url: result.url,
        publicId: result.publicId,
      },
    })
  } catch (error) {
    console.error('[Profile Image Upload Error]', error)
    const message = error instanceof Error ? error.message : 'Failed to upload profile image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT /api/customer/profile
 * Update customer profile (name, email)
 * Body: { name?, email? }  (mobile cannot be changed)
 */
export async function PUT(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { name, email } = body

    if (name === undefined && email === undefined) {
      return NextResponse.json({ error: 'At least one field (name or email) must be provided' }, { status: 400 })
    }

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return NextResponse.json({ error: 'Name must be a non-empty string' }, { status: 400 })
    }

    if (email !== undefined && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const cleanUpdate: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) cleanUpdate.name = name.trim()
    if (email !== undefined) cleanUpdate.email = email.trim()

    // Try to update by _id first (with ObjectId), then by mobile
    let updateResult = { matchedCount: 0 }
    try {
      updateResult = await db.collection('customers').updateOne(
        { _id: new ObjectId(customer.id) },
        { $set: cleanUpdate }
      )
    } catch {
      // ID might not be a valid ObjectId
    }

    if (updateResult.matchedCount === 0) {
      await db.collection('customers').updateOne(
        { mobile: customer.mobile },
        { $set: cleanUpdate }
      )
    }

    // Fetch updated profile
    const updatedProfile = await db.collection('customers').findOne({
      mobile: customer.mobile,
    })

    // ── Refresh the JWT session cookie ───────────────────────────────
    // The customer JWT bakes in the name at login/registration time.
    // When the customer updates their name here, we must issue a fresh
    // JWT with the new name so that ALL server-side code reading
    // session.name (e.g. orders/route.ts creates orders with
    // customerName = session.name) uses the CURRENT name, not the stale
    // "User 4132" default from registration.
    //
    // The session API (/api/auth/customer/session) also fetches the
    // name from DB, but refreshing the JWT here is defense-in-depth:
    // it ensures session.name is correct everywhere, even in routes
    // that don't do a DB lookup.
    const finalName = updatedProfile?.name || name?.trim() || customer.name
    const response = NextResponse.json({
      success: true,
      profile: {
        _id: (updatedProfile?._id || customer.id).toString(),
        name: updatedProfile?.name || name || customer.name || '',
        mobile: updatedProfile?.mobile || customer.mobile || '',
        email: updatedProfile?.email || email || '',
        profileImage: updatedProfile?.profileImage || null,
        createdAt: updatedProfile?.createdAt ? new Date(updatedProfile.createdAt).toISOString() : null,
      },
    })

    try {
      const freshToken = await createCustomerSessionToken({
        id: customer.id,
        mobile: customer.mobile,
        name: finalName,
        role: 'customer',
      })
      response.cookies.set(CUSTOMER_COOKIE_NAME, freshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      })
    } catch {
      // Non-critical — the DB update already succeeded; the session
      // API will still return the fresh name from DB on next request.
    }

    return response
  } catch (error) {
    console.error('[Profile PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
