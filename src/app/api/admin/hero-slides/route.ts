import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { uploadHeroSlideImage, deleteCategoryImageFile, isUploadConfigured } from '@/lib/upload'
import { ObjectId } from 'mongodb'
import { cacheInvalidate } from '@/lib/server-cache'

const HERO_SLIDES_COLLECTION = 'hero_slides'

// Allowed MIME types for hero slide image upload
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

// Max file size: 10 MB — hero slides are high-resolution banners
const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * GET /api/admin/hero-slides
 * Fetch all hero slides for the admin panel.
 * Returns slides sorted by displayOrder ascending.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    const slides = await db.collection(HERO_SLIDES_COLLECTION)
      .find({})
      .sort({ displayOrder: 1, createdAt: -1 })
      .toArray()

    const safeSlides = slides.map((s) => ({
      _id: s._id.toString(),
      title: s.title || '',
      imageUrl: s.imageUrl || null,
      imagePublicId: s.imagePublicId || null,
      redirectUrl: s.redirectUrl || '',
      status: s.status || 'Active',
      displayOrder: typeof s.displayOrder === 'number' ? s.displayOrder : 0,
      startDate: s.startDate || null,
      endDate: s.endDate || null,
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
      updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
    }))

    return NextResponse.json({
      slides: safeSlides,
      total: safeSlides.length,
      cloudinaryConfigured: isUploadConfigured(),
    })
  } catch (error) {
    console.error('[Admin Hero Slides GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch hero slides' }, { status: 500 })
  }
}

/**
 * POST /api/admin/hero-slides
 * Create a new hero slide.
 *
 * Simplified form — the admin only provides:
 *   - title        : internal identifier for the slide
 *   - image        : high-resolution predesigned banner image (required)
 *   - redirectUrl  : the page/URL the customer navigates to when they click the slide
 *   - startDate    : optional scheduling start date
 *   - endDate      : optional scheduling end date
 *
 * The slide image IS the slide — no gradient/text overlay is rendered on the
 * customer side. The admin uploads a fully-designed banner and the customer
 * sees it as-is, exactly like Flipkart/Amazon/Meesho hero banners.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const title = (formData.get('title') as string || '').trim()
    const redirectUrl = (formData.get('redirectUrl') as string || '').trim()
    const startDate = (formData.get('startDate') as string || '').trim() || null
    const endDate = (formData.get('endDate') as string || '').trim() || null
    const imageFile = formData.get('image') as File | null

    if (!title) {
      return NextResponse.json({ error: 'Slide title is required' }, { status: 400 })
    }

    if (!imageFile || imageFile.size === 0) {
      return NextResponse.json({ error: 'Slide image is required' }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF' },
        { status: 400 },
      )
    }

    if (imageFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 10 MB' },
        { status: 400 },
      )
    }

    const { db } = await connectToDatabase()

    // ── Upload image to Cloudinary ──
    let imageUrl: string
    let imagePublicId: string

    try {
      const arrayBuffer = await imageFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'slide'
      const result = await uploadHeroSlideImage(buffer, imageFile.type, slug)
      imageUrl = result.url
      imagePublicId = result.publicId
    } catch (uploadError) {
      const uploadErrMsg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
      console.error('[Hero Slides POST] Cloudinary upload failed:', uploadErrMsg)
      return NextResponse.json(
        { error: `Image upload failed: ${uploadErrMsg}` },
        { status: 500 },
      )
    }

    // ── Compute displayOrder (new slide appears last) ──
    const maxOrderDoc = await db.collection(HERO_SLIDES_COLLECTION)
      .find({}, { projection: { displayOrder: 1 } })
      .sort({ displayOrder: -1 })
      .limit(1)
      .toArray()

    const nextDisplayOrder = maxOrderDoc.length > 0 && typeof maxOrderDoc[0].displayOrder === 'number'
      ? maxOrderDoc[0].displayOrder + 1
      : 0

    const now = new Date()
    const doc = {
      title,
      imageUrl,
      imagePublicId,
      redirectUrl,
      status: 'Active', // Always Active — no Draft concept in the simplified form
      displayOrder: nextDisplayOrder,
      startDate,
      endDate,
      createdAt: now,
      updatedAt: now,
    }

    const result = await db.collection(HERO_SLIDES_COLLECTION).insertOne(doc)

    // Invalidate the public cache so the new slide appears immediately
    cacheInvalidate('public:hero-slides')

    return NextResponse.json({
      success: true,
      slide: {
        _id: result.insertedId.toString(),
        ...doc,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[Hero Slides POST Error]', error)
    return NextResponse.json({ error: 'Failed to create hero slide' }, { status: 500 })
  }
}

/**
 * PUT /api/admin/hero-slides
 * Update an existing hero slide.
 *
 * Accepts FormData with: _id, title, redirectUrl, startDate, endDate,
 * image (optional new file), removeImage (optional "true")
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const _id = (formData.get('_id') as string || '').trim()
    const title = (formData.get('title') as string || '').trim()
    const redirectUrl = (formData.get('redirectUrl') as string || '').trim()
    const startDate = (formData.get('startDate') as string || '').trim() || null
    const endDate = (formData.get('endDate') as string || '').trim() || null
    const imageFile = formData.get('image') as File | null
    const removeImage = formData.get('removeImage') as string || ''

    if (!_id) {
      return NextResponse.json({ error: 'Slide ID is required' }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: 'Slide title is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const currentSlide = await db.collection(HERO_SLIDES_COLLECTION).findOne({
      _id: new ObjectId(_id),
    })
    if (!currentSlide) {
      return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
    }

    let imageUrl: string | null = currentSlide.imageUrl || null
    let imagePublicId: string | null = currentSlide.imagePublicId || null

    // If removeImage is set, delete the current image from Cloudinary
    if (removeImage === 'true' && imagePublicId) {
      await deleteCategoryImageFile(imagePublicId)
      imageUrl = null
      imagePublicId = null
    }

    // Upload new image to Cloudinary if provided
    if (imageFile && imageFile.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF' },
          { status: 400 },
        )
      }

      if (imageFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File too large. Maximum size: 10 MB' },
          { status: 400 },
        )
      }

      // Delete old image from Cloudinary if exists
      if (imagePublicId) {
        await deleteCategoryImageFile(imagePublicId)
      }

      try {
        const arrayBuffer = await imageFile.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'slide'
        const result = await uploadHeroSlideImage(buffer, imageFile.type, slug)
        imageUrl = result.url
        imagePublicId = result.publicId
      } catch (uploadError) {
        const uploadErrMsg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
        console.error('[Hero Slides PUT] Cloudinary upload failed:', uploadErrMsg)
        return NextResponse.json(
          { error: `Image upload failed: ${uploadErrMsg}. Try updating the slide without changing the image.` },
          { status: 500 },
        )
      }
    }

    const now = new Date()
    const updateDoc = {
      title,
      imageUrl,
      imagePublicId,
      redirectUrl,
      startDate,
      endDate,
      updatedAt: now,
    }

    const result = await db.collection(HERO_SLIDES_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(_id) },
      { $set: updateDoc },
      { returnDocument: 'after' },
    )

    if (!result) {
      return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
    }

    // Invalidate the public cache
    cacheInvalidate('public:hero-slides')

    return NextResponse.json({
      success: true,
      slide: {
        _id: result._id.toString(),
        title: result.title,
        imageUrl: result.imageUrl,
        imagePublicId: result.imagePublicId || null,
        redirectUrl: result.redirectUrl || '',
        status: result.status,
        displayOrder: typeof result.displayOrder === 'number' ? result.displayOrder : 0,
        startDate: result.startDate || null,
        endDate: result.endDate || null,
        updatedAt: now.toISOString(),
      },
    })
  } catch (error) {
    console.error('[Hero Slides PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update hero slide' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/hero-slides
 * Delete a hero slide by ID.
 * Also removes the slide image from Cloudinary.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let _id: string | null = null

    try {
      const body = await request.json()
      _id = body._id || null
    } catch {
      // Body might be empty, try query params
    }

    if (!_id) {
      const { searchParams } = new URL(request.url)
      _id = searchParams.get('id')
    }

    if (!_id) {
      return NextResponse.json({ error: 'Slide ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const result = await db.collection(HERO_SLIDES_COLLECTION).findOneAndDelete({
      _id: new ObjectId(_id),
    })

    if (!result) {
      return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
    }

    // Delete the slide image from Cloudinary
    if (result.imagePublicId) {
      await deleteCategoryImageFile(result.imagePublicId)
    }

    // Invalidate the public cache
    cacheInvalidate('public:hero-slides')

    return NextResponse.json({
      success: true,
      deletedSlide: {
        _id: result._id.toString(),
        title: result.title,
      },
    })
  } catch (error) {
    console.error('[Hero Slides DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete hero slide' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/hero-slides
 * Bulk-update the displayOrder of hero slides (for drag-and-drop reordering).
 *
 * Body: { items: [{ _id: string, displayOrder: number }, ...] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'items array is required and must not be empty' }, { status: 400 })
    }

    const updates: Array<{ _id: string; displayOrder: number }> = []
    for (const item of body.items) {
      if (!item._id || typeof item._id !== 'string') {
        return NextResponse.json({ error: 'Each item must have a valid _id' }, { status: 400 })
      }
      if (typeof item.displayOrder !== 'number' || !Number.isFinite(item.displayOrder) || item.displayOrder < 0) {
        return NextResponse.json({ error: `Invalid displayOrder for item ${item._id}` }, { status: 400 })
      }
      try {
        new ObjectId(item._id)
      } catch {
        return NextResponse.json({ error: `Invalid slide ID: ${item._id}` }, { status: 400 })
      }
      updates.push({ _id: item._id, displayOrder: Math.floor(item.displayOrder) })
    }

    const { db } = await connectToDatabase()
    const now = new Date()

    const bulkOps = updates.map((u) => ({
      updateOne: {
        filter: { _id: new ObjectId(u._id) },
        update: { $set: { displayOrder: u.displayOrder, updatedAt: now } },
      },
    }))

    const result = await db.collection(HERO_SLIDES_COLLECTION).bulkWrite(bulkOps)

    // Invalidate the public cache
    cacheInvalidate('public:hero-slides')

    return NextResponse.json({
      success: true,
      updated: result.modifiedCount || updates.length,
      message: `Reordered ${updates.length} slide${updates.length === 1 ? '' : 's'}`,
    })
  } catch (error) {
    console.error('[Hero Slides PATCH Error]', error)
    return NextResponse.json({ error: 'Failed to reorder hero slides' }, { status: 500 })
  }
}
