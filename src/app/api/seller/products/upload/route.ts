/**
 * Seller Product Image Upload API — /api/seller/products/upload
 *
 * POST — Upload a product image to Cloudinary (seller auth required)
 *         Accepts multipart/form-data with:
 *           - 'file' field: a single image file
 *         Returns: { url, publicId }
 *
 * This route was MISSING — the frontend called /api/seller/products/upload
 * but no route existed at that path, causing "Upload Error" toasts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { validateImageFile } from '@/lib/upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Allowed image types and max size (5MB)
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
])
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: NextRequest) {
  try {
    // Authenticate seller
    const { error: authError, session } = await authenticateSeller(request)
    if (authError || !session) {
      return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type and size
    const validationError = validateImageFile(
      { type: file.type, size: file.size },
      ALLOWED_TYPES,
      MAX_SIZE
    )
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Convert to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Generate a unique public ID for Cloudinary
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const publicId = `seller-${session.id}-${timestamp}-${randomStr}`

    // Upload to Cloudinary
    const result = await uploadToCloudinary(buffer, file.type, {
      folder: 'realcart/products',
      publicId,
      resourceType: 'image',
      tags: ['product', `seller-${session.id}`],
    })

    return NextResponse.json({
      url: result.url,
      publicId: result.publicId,
    })
  } catch (error) {
    console.error('[Seller Product Upload Error]', error)
    const msg = error instanceof Error ? error.message : 'Failed to upload image'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
