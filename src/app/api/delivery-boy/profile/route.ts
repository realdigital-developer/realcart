import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateDeliveryBoy } from '@/lib/delivery-boy-api-auth'
import { ObjectId } from 'mongodb'
import { uploadProfileImage, deleteFile, validateImageFile, DEFAULT_IMAGE_TYPES, DEFAULT_MAX_IMAGE_SIZE } from '@/lib/upload'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  Shared: Extract profile image URL from either string or object      */
/* ------------------------------------------------------------------ */

function extractProfileImageUrl(profileImage: unknown): string {
  if (!profileImage) return ''
  if (typeof profileImage === 'string') return profileImage
  if (typeof profileImage === 'object' && profileImage !== null && 'url' in profileImage) {
    return (profileImage as { url: string }).url
  }
  return ''
}

/* ------------------------------------------------------------------ */
/*  Shared: Build a complete profile object from a delivery_boys doc   */
/*  OPTIMIZED: Uses a single $facet aggregation instead of              */
/*  separate countDocuments + aggregation (2 ops → 1 op).              */
/* ------------------------------------------------------------------ */

async function buildCompleteProfile(db: any, deliveryBoy: any): Promise<{
  _id: string
  name: string
  mobile: string
  status: string
  isAvailable: boolean
  vehicleType: string
  vehicleNumber: string
  profileImage: string
  profileImageMeta: { url: string; publicId: string } | null
  address: string
  aadhaarNumber: string
  panNumber: string
  role: string
  totalDeliveries: number
  rating: number
  totalRatings: number
  createdAt: Date | null
  updatedAt: Date | null
  lastLoginAt: Date | null
}> {
  const deliveryBoyIdStr = deliveryBoy._id.toString()

  // Orders management removed — return zero values for delivery stats
  const totalDeliveries = 0
  const rating = 0
  const totalRatings = 0

  // Extract profile image: support both string (old) and object (Cloudinary) formats
  const profileImageUrl = extractProfileImageUrl(deliveryBoy.profileImage)
  const profileImageMeta = (
    deliveryBoy.profileImage &&
    typeof deliveryBoy.profileImage === 'object' &&
    'publicId' in deliveryBoy.profileImage
  )
    ? { url: deliveryBoy.profileImage.url, publicId: deliveryBoy.profileImage.publicId }
    : null

  return {
    _id: deliveryBoyIdStr,
    name: deliveryBoy.name || '',
    mobile: deliveryBoy.mobile || '',
    status: deliveryBoy.status || 'Active',
    isAvailable: deliveryBoy.isAvailable !== false,
    vehicleType: deliveryBoy.vehicleType || '',
    vehicleNumber: deliveryBoy.vehicleNumber || '',
    profileImage: profileImageUrl,
    profileImageMeta,
    address: deliveryBoy.address || '',
    aadhaarNumber: deliveryBoy.aadhaarNumber || '',
    panNumber: deliveryBoy.panNumber || '',
    role: deliveryBoy.role || 'delivery_boy',
    totalDeliveries,
    rating,
    totalRatings,
    createdAt: deliveryBoy.createdAt || null,
    updatedAt: deliveryBoy.updatedAt || null,
    lastLoginAt: deliveryBoy.lastLoginAt || null,
  }
}

/* ------------------------------------------------------------------ */
/*  Shared: Find delivery boy by session (ObjectId then mobile)         */
/* ------------------------------------------------------------------ */

async function findDeliveryBoy(db: any, session: { id: string; mobile: string }) {
  let deliveryBoy: any = null
  try {
    deliveryBoy = await db.collection('delivery_boys').findOne(
      { _id: new ObjectId(session.id) },
      { projection: { passcodeHash: 0 } },
    )
  } catch {
    // _id might be stored as a string
  }
  if (!deliveryBoy) {
    deliveryBoy = await db.collection('delivery_boys').findOne(
      { mobile: session.mobile },
      { projection: { passcodeHash: 0 } },
    )
  }
  return deliveryBoy
}

/* ------------------------------------------------------------------ */
/*  GET /api/delivery-boy/profile                                      */
/*  Get delivery boy profile with delivery stats. Excludes passcodeHash.*/
/*  OPTIMIZED: Stats computed via single $facet (1 query instead of 2). */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()

    const deliveryBoy = await findDeliveryBoy(db, session)

    if (!deliveryBoy) {
      return NextResponse.json({ error: 'Delivery boy not found' }, { status: 404 })
    }

    const profile = await buildCompleteProfile(db, deliveryBoy)
    return NextResponse.json({ profile })
  } catch (error) {
    console.error('[Delivery Boy Profile GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/delivery-boy/profile                                     */
/*  Upload/update delivery boy profile image.                           */
/*  Body: FormData with 'file' field (image file).                      */
/*  Stores image in Cloudinary, saves metadata to MongoDB.              */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

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

    // Find the delivery boy document
    let filter: Record<string, unknown>
    try {
      filter = { _id: new ObjectId(session.id) }
    } catch {
      filter = { mobile: session.mobile }
    }

    const existingDoc = await db.collection('delivery_boys').findOne(filter)

    // Delete old profile image from Cloudinary if it exists (object format with publicId)
    if (existingDoc?.profileImage) {
      const oldImage = existingDoc.profileImage
      if (typeof oldImage === 'object' && oldImage.publicId) {
        await deleteFile(oldImage.publicId)
      }
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Upload to Cloudinary using the shared upload module
    const deliveryBoyId = existingDoc?._id?.toString() || session.id
    const result = await uploadProfileImage(buffer, file.type, `db-${deliveryBoyId}`)

    // Store image metadata in MongoDB (object format like customer profiles)
    const profileImageMeta = {
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.size,
      uploadedAt: new Date(),
    }

    await db.collection('delivery_boys').updateOne(
      filter,
      {
        $set: {
          profileImage: profileImageMeta,
          updatedAt: new Date(),
        },
      },
    )

    return NextResponse.json({
      success: true,
      profileImage: {
        url: result.url,
        publicId: result.publicId,
      },
    })
  } catch (error) {
    console.error('[Delivery Boy Profile Image Upload Error]', error)
    return NextResponse.json({ error: 'Failed to upload profile image' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT /api/delivery-boy/profile                                      */
/*  Update delivery boy profile. Cannot change mobile, passcode.       */
/*  Returns the complete updated profile with delivery stats.           */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const body = await request.json()

    // Only allow updating specific fields
    const allowedFields = ['name', 'vehicleType', 'vehicleNumber', 'address', 'aadhaarNumber', 'panNumber']
    const safeUpdate: Record<string, unknown> = { updatedAt: new Date() }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (typeof body[field] === 'string') {
          safeUpdate[field] = body[field].trim()
        } else {
          safeUpdate[field] = body[field]
        }
      }
    }

    // Validate name is not empty if provided
    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }

    let updateFilter: any
    try {
      updateFilter = { _id: new ObjectId(session.id) }
    } catch {
      updateFilter = { mobile: session.mobile }
    }

    const updateResult = await db.collection('delivery_boys').updateOne(
      updateFilter,
      { $set: safeUpdate },
    )

    // Verify the update actually matched a document
    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ error: 'Delivery boy not found' }, { status: 404 })
    }

    // Fetch the updated profile with complete stats
    const updatedDeliveryBoy = await db.collection('delivery_boys').findOne(
      updateFilter,
      { projection: { passcodeHash: 0 } },
    )

    if (!updatedDeliveryBoy) {
      return NextResponse.json({ error: 'Failed to retrieve updated profile' }, { status: 500 })
    }

    const profile = await buildCompleteProfile(db, updatedDeliveryBoy)
    return NextResponse.json({ success: true, profile })
  } catch (error) {
    console.error('[Delivery Boy Profile PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
