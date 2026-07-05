/**
 * Seller Product Image Upload API
 *
 * POST /api/seller/products/upload
 *   Body: FormData with 'file' field (image)
 *   Returns: { url, publicId }
 *
 * Authenticates the seller, validates the image file, uploads to
 * Cloudinary in the realcart/products folder, and returns the CDN URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { validateImageFile } from '@/lib/upload'
import { uploadToCloudinary } from '@/lib/cloudinary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // ── Authenticate seller ──
    const { error, session } = await authenticateSeller(request)
    if (error || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    // ── Parse FormData ──
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 },
      )
    }

    // ── Validate image file ──
    const validationError = validateImageFile({
      type: file.type,
      size: file.size,
    })
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 },
      )
    }

    // ── Convert file to buffer ──
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ── Generate unique public ID ──
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const publicId = `${session.id}-${timestamp}-${randomStr}`

    // ── Upload to Cloudinary ──
    const result = await uploadToCloudinary(buffer, file.type, {
      folder: 'realcart/products',
      publicId,
      resourceType: 'image',
    })

    return NextResponse.json({
      url: result.url,
      publicId: result.publicId,
    })
  } catch (error) {
    console.error('[Seller Product Upload Error]', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
