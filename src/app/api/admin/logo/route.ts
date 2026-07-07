import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { uploadLogoImage, deleteLogoImage, isUploadConfigured } from '@/lib/upload'
import { DEFAULT_BRAND_NAME } from '@/lib/brand-settings'

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

// Max length for the brand name (prevents abuse / layout overflow on invoices)
const MAX_BRAND_NAME_LENGTH = 60

// Settings collection name in MongoDB
const SETTINGS_COLLECTION = 'settings'

/**
 * GET /api/admin/logo
 * Returns the current logo configuration AND the configured brand (site) name.
 *
 * Response shape:
 *   {
 *     logo: { url, publicId, width, height, format, uploadedAt, size } | null,
 *     siteName: string,            // configured brand name, or DEFAULT_BRAND_NAME
 *     cloudinaryConfigured: boolean
 *   }
 *
 * This endpoint is PUBLIC (no auth) so the customer-facing navbar can call it
 * on every page load. Only the logo URL + brand name are exposed — no secrets.
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase()
    const settings = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'site' })

    // Resolve brand name — use configured value, else fall back to default.
    let siteName = DEFAULT_BRAND_NAME
    const rawName = settings?.siteName
    if (typeof rawName === 'string' && rawName.trim().length > 0) {
      siteName = rawName.trim()
    }

    if (!settings?.logo) {
      return NextResponse.json({
        logo: null,
        siteName,
        cloudinaryConfigured: isUploadConfigured(),
      })
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
      siteName,
      cloudinaryConfigured: isUploadConfigured(),
    })
  } catch (error) {
    console.error('[Logo GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch logo' }, { status: 500 })
  }
}

/**
 * PUT /api/admin/logo
 * Updates the brand (site) name only. Expects a JSON body: `{ siteName: string }`.
 *
 * The brand name is stored on the `settings.site` document (same document that
 * holds the logo) and is read by the invoice / credit-note / email engines to
 * render the brand name dynamically on every generated document.
 *
 * Requires admin authentication.
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify admin session
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { siteName?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const rawName = typeof body.siteName === 'string' ? body.siteName.trim() : ''
    if (rawName.length === 0) {
      return NextResponse.json({ error: 'Brand name cannot be empty' }, { status: 400 })
    }
    if (rawName.length > MAX_BRAND_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Brand name must be ${MAX_BRAND_NAME_LENGTH} characters or fewer` },
        { status: 400 },
      )
    }

    const { db } = await connectToDatabase()
    await db.collection(SETTINGS_COLLECTION).updateOne(
      { key: 'site' },
      {
        $set: {
          key: 'site',
          siteName: rawName,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )

    return NextResponse.json({ success: true, siteName: rawName })
  } catch (error) {
    console.error('[Logo PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update brand name' }, { status: 500 })
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
