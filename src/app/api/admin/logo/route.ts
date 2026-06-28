import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { uploadLogoImage, deleteLogoImage, isUploadConfigured } from '@/lib/upload'

// Allowed MIME types for logo upload
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
])

// Max file size: 5 MB
const MAX_FILE_SIZE = 5 * 1024 * 1024

// Settings collection name in MongoDB
const SETTINGS_COLLECTION = 'settings'

/**
 * GET /api/admin/logo
 * Returns the current logo configuration.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase()
    const settings = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'site' })

    if (!settings?.logo) {
      return NextResponse.json({ logo: null, cloudinaryConfigured: isUploadConfigured() })
    }

    return NextResponse.json({
      logo: {
        url: settings.logo.url,
        publicId: settings.logo.publicId,
        width: settings.logo.width,
        height: settings.logo.height,
        format: settings.logo.format,
        uploadedAt: settings.logo.uploadedAt,
        size: settings.logo.size,
      },
      cloudinaryConfigured: isUploadConfigured(),
    })
  } catch (error) {
    console.error('[Logo GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch logo' }, { status: 500 })
  }
}

/**
 * POST /api/admin/logo
 * Uploads a new logo image to Cloudinary.
 * Cloudinary handles image optimization, resizing, and CDN delivery.
 * Metadata is stored in MongoDB for quick access.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin session
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('logo') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PNG, JPEG, WebP, SVG, GIF' },
        { status: 400 },
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 5 MB' },
        { status: 400 },
      )
    }

    // Upload image to Cloudinary
    let result
    try {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      result = await uploadLogoImage(buffer, file.type)
    } catch (uploadError) {
      const uploadErrMsg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
      console.error('[Logo POST] Cloudinary upload failed:', uploadErrMsg)
      return NextResponse.json(
        { error: `Image upload failed: ${uploadErrMsg}` },
        { status: 500 },
      )
    }

    // Delete old logo from Cloudinary if public ID has changed
    const { db } = await connectToDatabase()
    const existingSettings = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'site' })

    if (existingSettings?.logo?.publicId && existingSettings.logo.publicId !== result.publicId) {
      await deleteLogoImage(existingSettings.logo.publicId)
    }

    // Build logo metadata for MongoDB
    const logoData = {
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
      uploadedAt: new Date().toISOString(),
      size: result.size,
    }

    // Save logo metadata to MongoDB
    await db.collection(SETTINGS_COLLECTION).updateOne(
      { key: 'site' },
      {
        $set: {
          key: 'site',
          logo: logoData,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )

    return NextResponse.json({
      success: true,
      logo: logoData,
    })
  } catch (error) {
    console.error('[Logo POST Error]', error)
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/logo
 * Removes the current logo from Cloudinary and clears the database reference.
 */
export async function DELETE(request: NextRequest) {
  try {
    // Verify admin session
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const settings = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'site' })

    if (settings?.logo?.publicId) {
      // Delete the logo image from Cloudinary
      await deleteLogoImage(settings.logo.publicId)
    }

    // Clear logo from settings
    await db.collection(SETTINGS_COLLECTION).updateOne(
      { key: 'site' },
      {
        $unset: { logo: '' },
        $set: { updatedAt: new Date() },
      },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Logo DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete logo' }, { status: 500 })
  }
}
