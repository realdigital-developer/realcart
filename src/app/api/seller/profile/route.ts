import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { ObjectId } from 'mongodb'
import { verifyPassword, hashPassword } from '@/lib/seller-auth'
import { uploadProfileImage, deleteFile, validateImageFile, DEFAULT_IMAGE_TYPES, DEFAULT_MAX_IMAGE_SIZE } from '@/lib/upload'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/profile                                            */
/*  Get seller profile. Excludes passwordHash.                         */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    let seller: any = null
    try {
      seller = await db.collection('sellers').findOne(
        { _id: new ObjectId(session.id) },
        {
          projection: {
            passwordHash: 0, // Never return password hash
          },
        }
      )
    } catch {
      // _id might be stored as a string, not an ObjectId
    }
    if (!seller) {
      seller = await db.collection('sellers').findOne(
        { _id: session.id as any },
        {
          projection: {
            passwordHash: 0,
          },
        }
      )
    }

    if (!seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
    }

    // Return safe profile data (including new fields with backward compatibility)
    const profile = {
      _id: seller._id.toString(),
      name: seller.name || '',
      email: seller.email || '',
      storeName: seller.storeName || '',
      phone: seller.phone || '',
      address: seller.address || null,
      gstNumber: seller.gstNumber || '',
      panNumber: seller.panNumber || '',
      businessType: seller.businessType || '',
      bankDetails: seller.bankDetails || null,
      pickupAddress: seller.pickupAddress || null,
      documents: seller.documents || null,
      profileImage: seller.profileImage || null,
      verificationStatus: seller.verificationStatus || 'pending',
      verificationNotes: seller.verificationNotes || [],
      role: seller.role || 'seller',
      isVerified: seller.isVerified || false,
      status: seller.status || 'Active',
      createdAt: seller.createdAt || null,
      updatedAt: seller.updatedAt || null,
      lastLoginAt: seller.lastLoginAt || null,
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('[Seller Profile GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT /api/seller/profile                                            */
/*  Update seller profile. Cannot change email, storeName, password.   */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const body = await request.json()

    // Only allow updating specific fields
    const allowedFields = ['name', 'phone', 'address', 'gstNumber', 'panNumber', 'businessType']
    const safeUpdate: Record<string, unknown> = { updatedAt: new Date() }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'address' && typeof body[field] === 'object') {
          safeUpdate.address = body[field]
        } else if (typeof body[field] === 'string') {
          safeUpdate[field] = body[field].trim()
        } else {
          safeUpdate[field] = body[field]
        }
      }
    }

    // Handle nested object updates
    if (body.bankDetails && typeof body.bankDetails === 'object') {
      safeUpdate.bankDetails = body.bankDetails
    }

    if (body.pickupAddress && typeof body.pickupAddress === 'object') {
      safeUpdate.pickupAddress = body.pickupAddress
      // Update backward-compatible address string
      const pa = body.pickupAddress
      safeUpdate.address = `${pa.addressLine1 || ''}, ${pa.city || ''}, ${pa.state || ''} - ${pa.pincode || ''}`
    }

    // Handle password change
    if (body.currentPassword && body.newPassword) {
      // Fetch the seller's current password hash
      let sellerDoc: any = null
      try {
        sellerDoc = await db.collection('sellers').findOne(
          { _id: new ObjectId(session.id) },
          { projection: { passwordHash: 1 } }
        )
      } catch {
        sellerDoc = await db.collection('sellers').findOne(
          { _id: session.id as any },
          { projection: { passwordHash: 1 } }
        )
      }

      if (!sellerDoc || !sellerDoc.passwordHash) {
        return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
      }

      // Verify current password
      const isValid = await verifyPassword(body.currentPassword, sellerDoc.passwordHash)
      if (!isValid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
      }

      // Validate new password
      if (body.newPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters long' }, { status: 400 })
      }

      // Hash and set new password
      const newPasswordHash = await hashPassword(body.newPassword)
      safeUpdate.passwordHash = newPasswordHash
    }

    // Validate name is not empty if provided
    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }

    let updateFilter: any
    try {
      updateFilter = { _id: new ObjectId(session.id) }
    } catch {
      updateFilter = { _id: session.id }
    }

    await db.collection('sellers').updateOne(
      updateFilter,
      { $set: safeUpdate },
    )

    // Fetch the updated profile to return
    const updatedSeller = await db.collection('sellers').findOne(
      updateFilter,
      { projection: { passwordHash: 0 } }
    )

    const profile = {
      _id: updatedSeller!._id.toString(),
      name: updatedSeller!.name || '',
      email: updatedSeller!.email || '',
      storeName: updatedSeller!.storeName || '',
      phone: updatedSeller!.phone || '',
      address: updatedSeller!.address || null,
      gstNumber: updatedSeller!.gstNumber || '',
      panNumber: updatedSeller!.panNumber || '',
      businessType: updatedSeller!.businessType || '',
      bankDetails: updatedSeller!.bankDetails || null,
      pickupAddress: updatedSeller!.pickupAddress || null,
      documents: updatedSeller!.documents || null,
      profileImage: updatedSeller!.profileImage || null,
      verificationStatus: updatedSeller!.verificationStatus || 'pending',
      verificationNotes: updatedSeller!.verificationNotes || [],
      role: updatedSeller!.role || 'seller',
      isVerified: updatedSeller!.isVerified || false,
      status: updatedSeller!.status || 'Active',
      createdAt: updatedSeller!.createdAt || null,
      updatedAt: updatedSeller!.updatedAt || null,
      lastLoginAt: updatedSeller!.lastLoginAt || null,
    }

    return NextResponse.json({
      success: true,
      profile,
    })
  } catch (error) {
    console.error('[Seller Profile PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/seller/profile                                           */
/*  Upload seller profile image. Body: FormData with 'file' field.     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate the file
    const validation = validateImageFile(file, DEFAULT_IMAGE_TYPES, DEFAULT_MAX_IMAGE_SIZE)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const sellerId = session.id

    // Get existing seller to check for old image
    const existingSeller = await db.collection('sellers').findOne(
      { _id: new ObjectId(sellerId) },
      { projection: { profileImage: 1 } }
    )

    // Delete old profile image from Cloudinary if it exists
    if (existingSeller?.profileImage?.publicId) {
      await deleteFile(existingSeller.profileImage.publicId)
    }

    // Upload the new image
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadProfileImage(buffer, file.type, sellerId)

    const profileImageMeta = {
      url: result.url,
      publicId: result.publicId,
      uploadedAt: new Date(),
    }

    // Update seller document
    await db.collection('sellers').updateOne(
      { _id: new ObjectId(sellerId) },
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
        url: profileImageMeta.url,
        publicId: profileImageMeta.publicId,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload profile image'
    console.error('[Seller Profile Image Upload Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
