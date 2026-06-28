/**
 * Review Upload Media API — /api/customer/reviews/upload-media
 *
 * POST — Upload review images and/or videos (auth required)
 *         Accepts multipart/form-data with:
 *           - 'images' field(s): up to 10 images
 *           - 'videos' field(s): up to 5 videos
 *         Returns: { success, images: [...], videos: [...] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCustomerSession } from '@/lib/customer-auth'
import {
  uploadReviewImageFile,
  validateImageFile,
  MAX_REVIEW_IMAGE_SIZE,
  MAX_REVIEW_IMAGES,
  REVIEW_IMAGE_TYPES,
  uploadReviewVideoFile,
  validateVideoFile,
  MAX_REVIEW_VIDEO_SIZE,
  MAX_REVIEW_VIDEOS,
  REVIEW_VIDEO_TYPES,
} from '@/lib/upload'

export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const formData = await request.formData()
    const imageFiles = formData.getAll('images')
    const videoFiles = formData.getAll('videos')

    if ((!imageFiles || imageFiles.length === 0) && (!videoFiles || videoFiles.length === 0)) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (imageFiles.length > MAX_REVIEW_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_REVIEW_IMAGES} images allowed per review` },
        { status: 400 }
      )
    }

    if (videoFiles.length > MAX_REVIEW_VIDEOS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_REVIEW_VIDEOS} videos allowed per review` },
        { status: 400 }
      )
    }

    const allowedImageTypes = new Set(REVIEW_IMAGE_TYPES)
    const allowedVideoTypes = new Set(REVIEW_VIDEO_TYPES)

    // ── Validate image files ────────────────────────────────────────────
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: `Image at index ${i} is not a valid file` },
          { status: 400 }
        )
      }
      const validationError = validateImageFile(
        { type: file.type, size: file.size },
        allowedImageTypes,
        MAX_REVIEW_IMAGE_SIZE
      )
      if (validationError) {
        return NextResponse.json(
          { error: `Image ${i + 1}: ${validationError}` },
          { status: 400 }
        )
      }
    }

    // ── Validate video files ────────────────────────────────────────────
    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i]
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: `Video at index ${i} is not a valid file` },
          { status: 400 }
        )
      }
      const validationError = validateVideoFile(
        { type: file.type, size: file.size },
        allowedVideoTypes,
        MAX_REVIEW_VIDEO_SIZE
      )
      if (validationError) {
        return NextResponse.json(
          { error: `Video ${i + 1}: ${validationError}` },
          { status: 400 }
        )
      }
    }

    // ── Upload images ───────────────────────────────────────────────────
    const uploadedImages: Array<{ url: string; publicId: string }> = []
    const tempReviewId = `review-${customer.id}-${Date.now()}`

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i] as File
      const buffer = Buffer.from(await file.arrayBuffer())
      const suffix = `-img-${i}`

      try {
        const result = await uploadReviewImageFile(buffer, file.type, `${tempReviewId}${suffix}`)
        uploadedImages.push({
          url: result.url,
          publicId: result.publicId,
        })
      } catch (uploadError) {
        console.error(`[Upload Media] Failed to upload image ${i + 1}:`, uploadError)
        return NextResponse.json(
          {
            error: `Failed to upload image ${i + 1}. Please try again.`,
            partialUploads: { images: uploadedImages, videos: [] },
          },
          { status: 500 }
        )
      }
    }

    // ── Upload videos ───────────────────────────────────────────────────
    const uploadedVideos: Array<{ url: string; publicId: string }> = []

    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i] as File
      const buffer = Buffer.from(await file.arrayBuffer())
      const suffix = `-vid-${i}`

      try {
        const result = await uploadReviewVideoFile(buffer, file.type, `${tempReviewId}${suffix}`)
        uploadedVideos.push({
          url: result.url,
          publicId: result.publicId,
        })
      } catch (uploadError) {
        console.error(`[Upload Media] Failed to upload video ${i + 1}:`, uploadError)
        return NextResponse.json(
          {
            error: `Failed to upload video ${i + 1}. Please try again.`,
            partialUploads: { images: uploadedImages, videos: uploadedVideos },
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      images: uploadedImages,
      videos: uploadedVideos,
    })
  } catch (error) {
    console.error('[Upload Media POST Error]', error)
    return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 })
  }
}
