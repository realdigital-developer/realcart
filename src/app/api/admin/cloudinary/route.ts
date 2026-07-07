import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import {
  isCloudinaryConfigured,
  getMissingConfigVars,
  getCloudinaryConfig,
  getConfigStatus,
} from '@/lib/cloudinary-config'
import { isUploadConfigured, getMissingConfig, verifyCloudinaryConnection, uploadFile, validateImageFile } from '@/lib/upload'

// Allowed MIME types for generic uploads
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
])

// Max file size: 10 MB for videos, 5 MB for images
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_VIDEO_SIZE = 10 * 1024 * 1024

/**
 * GET /api/admin/cloudinary
 * Returns the Cloudinary configuration status and connectivity check.
 * Uses the cloudinary-config module which includes the full fallback chain.
 *
 * NOTE: The status check (GET) is also available publicly via /api/upload-status
 * which does not require authentication. This endpoint keeps auth for backward
 * compatibility with the settings page connectivity test.
 *
 * Query params:
 *   test=1 — Also verify connectivity by pinging Cloudinary API
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request as any)

    // Allow unauthenticated access to basic config status
    // (the public /api/upload-status endpoint is the preferred way)
    // Full connectivity test (test=1) still requires auth
    const { searchParams } = new URL(request.url)
    if (searchParams.get('test') === '1' && !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use cloudinary-config module for accurate, fallback-aware status
    const config = getCloudinaryConfig()
    const status = getConfigStatus()
    const missingEnvVars = getMissingConfigVars()

    // Base response — safe to return without auth (no secrets exposed)
    const response: Record<string, any> = {
      configured: status.configured,
      missingVars: status.configured ? [] : missingEnvVars,
      cloudName: config.cloudName,
      // Never expose API key or secret — just show if they're set
      apiKeySet: !!config.apiKey,
      apiSecretSet: !!config.apiSecret,
      // Include source info
      usingFallback: status.usingFallback,
      sources: status.sources,
    }

    // If query param test=1, also verify connectivity (requires auth)
    if (searchParams.get('test') === '1' && session) {
      const connectionTest = await verifyCloudinaryConnection()
      response.connectionTest = connectionTest
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Cloudinary Status Error]', error)
    return NextResponse.json({ error: 'Failed to check Cloudinary status' }, { status: 500 })
  }
}

/**
 * POST /api/admin/cloudinary
 * Upload a file (image or video) to Cloudinary.
 * Accepts FormData with:
 *   - file: File (required) — the file to upload
 *   - folder: string (optional) — Cloudinary folder path (default: "realcart/uploads")
 *
 * Returns: { url, secure_url, publicId, width, height, format, size, resourceType }
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Check Cloudinary configuration (uses fallback chain) ──
    if (!isUploadConfigured()) {
      return NextResponse.json(
        { error: 'Cloudinary is not configured. All sources failed (env vars, fallback values, and runtime overrides).' },
        { status: 503 },
      )
    }

    // ── Parse FormData ──
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string || 'realcart/uploads').trim()

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // ── Validate MIME type ──
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: PNG, JPEG, WebP, GIF, MP4, WebM` },
        { status: 400 },
      )
    }

    // ── Validate file size ──
    const isVideo = file.type.startsWith('video/')
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (file.size > maxSize) {
      const maxMB = (maxSize / (1024 * 1024)).toFixed(0)
      return NextResponse.json(
        { error: `File too large. Maximum size for ${isVideo ? 'videos' : 'images'}: ${maxMB} MB` },
        { status: 400 },
      )
    }

    // ── Upload to Cloudinary ──
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate a unique public_id using timestamp + random string
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const publicId = `${timestamp}-${randomSuffix}`

    const result = await uploadFile(buffer, file.type, {
      folder,
      publicId,
      resourceType: isVideo ? 'video' : 'image',
    })

    return NextResponse.json({
      url: result.url,
      secure_url: result.url, // Cloudinary URLs are already HTTPS
      publicId: result.publicId,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.size,
      resourceType: isVideo ? 'video' : 'image',
    })
  } catch (error) {
    console.error('[Cloudinary Upload Error]', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
