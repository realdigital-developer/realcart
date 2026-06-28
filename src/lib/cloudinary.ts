/**
 * Cloudinary Utilities — Robust & Production-Ready
 *
 * ALL image and file uploads go through Cloudinary exclusively.
 * No local filesystem storage is ever used.
 *
 * Features:
 *   - Lazy-loaded Cloudinary SDK (~50MB+ memory, loaded only when needed)
 *   - Automatic retry with exponential backoff for transient failures
 *   - Configurable upload timeout to prevent hanging requests
 *   - Connectivity verification (ping Cloudinary API)
 *   - Generic upload function for any resource type
 *   - CDN-backed URLs for fast global delivery
 *   - Automatic format conversion (WebP, AVIF) and quality optimization
 *   - On-the-fly resizing and transformations via URL parameters
 *   - Secure, reliable cloud storage with 99.9% uptime SLA
 *
 * Configuration resolution (handled by cloudinary-config.ts):
 *   1. Runtime override (highest priority — configureCloudinary())
 *   2. process.env (standard Next.js .env loading)
 *   3. Hardcoded fallback values (always available as safety net)
 *
 * This module delegates ALL configuration resolution to cloudinary-config.ts,
 * which is the SINGLE SOURCE OF TRUTH for Cloudinary credentials.
 */

import {
  getCloudinaryConfig,
  isCloudinaryConfigured as isConfiguredFromModule,
  getMissingConfigVars as getMissingFromModule,
  getConfigStatus as getStatusFromModule,
  type ResolvedCloudinaryConfig,
  type CloudinaryConfigStatus as ModuleConfigStatus,
} from './cloudinary-config'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface CloudinaryUploadResult {
  url: string
  publicId: string
  width: number
  height: number
  format: string
  size: number
}

export interface UploadOptions {
  /** Cloudinary folder path, e.g. "realcart/categories" */
  folder: string
  /** Public ID for the resource (unique within the folder) */
  publicId: string
  /** Whether to overwrite an existing resource with the same public_id */
  overwrite?: boolean
  /** Resource type: 'image' (default), 'video', 'raw' (for non-media files) */
  resourceType?: 'image' | 'video' | 'raw'
  /** Maximum width for the uploaded image (0 = no limit) */
  maxWidth?: number
  /** Maximum height for the uploaded image (0 = no limit) */
  maxHeight?: number
  /** Quality preset: 'auto' | 'auto:good' | 'auto:eco' | 'auto:low' */
  quality?: string
  /** Tags to assign to the uploaded resource */
  tags?: string[]
}

export interface CloudinaryConfigStatus {
  configured: boolean
  missingVars: string[]
  cloudName: string | null
  apiKeySet: boolean
  apiSecretSet: boolean
  /** Whether fallback values are being used */
  usingFallback: boolean
  /** Which source is being used for each value */
  sources: ResolvedCloudinaryConfig['sources']
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Maximum number of retry attempts for transient failures */
const MAX_RETRIES = 3

/** Base delay in ms for exponential backoff (doubles each retry) */
const BASE_RETRY_DELAY = 500

/** Default upload timeout in milliseconds (30 seconds) */
const DEFAULT_UPLOAD_TIMEOUT = 30_000

/** Default maximum image dimension for uploads */
const DEFAULT_MAX_DIMENSION = 1024

/** Default quality preset for image optimization */
const DEFAULT_QUALITY = 'auto:good'

/* ------------------------------------------------------------------ */
/*  Lazy-loaded Cloudinary SDK with Config Change Detection             */
/* ------------------------------------------------------------------ */

let _cloudinary: any = null
let _lastConfigHash: string | null = null

/**
 * Compute a simple hash of the resolved config to detect changes.
 * If the config changes (e.g., runtime override applied), we need to
 * re-initialize the Cloudinary SDK with the new credentials.
 */
function computeConfigHash(config: ResolvedCloudinaryConfig): string {
  return `${config.cloudName}:${config.apiKey}:${config.apiSecret}`
}

/**
 * Check if Cloudinary is properly configured.
 * Uses the cloudinary-config module which includes fallback values,
 * so this ALWAYS returns true unless even the fallbacks are missing.
 */
export function isCloudinaryConfigured(): boolean {
  return isConfiguredFromModule()
}

/**
 * Get the list of missing Cloudinary environment variables.
 * Note: Even if env vars are "missing", Cloudinary may still work
 * via the fallback values in cloudinary-config.ts.
 */
export function getMissingConfigVars(): string[] {
  return getMissingFromModule()
}

/**
 * Get the current Cloudinary configuration status.
 * Used by the admin UI and upload-status endpoint.
 * Delegates to cloudinary-config module for accurate source tracking.
 */
export function getConfigStatus(): CloudinaryConfigStatus {
  const status = getStatusFromModule()
  return {
    configured: status.configured,
    missingVars: status.missingVars,
    cloudName: status.cloudName,
    apiKeySet: status.apiKeySet,
    apiSecretSet: status.apiSecretSet,
    usingFallback: status.usingFallback,
    sources: status.sources,
  }
}

/**
 * Lazily load and configure the Cloudinary SDK.
 * Only loaded once, then cached for subsequent calls.
 * If the resolved config changes (e.g., runtime override), the SDK
 * is re-initialized with the new credentials.
 *
 * IMPORTANT: This uses the FULL fallback chain from cloudinary-config.ts,
 * not just process.env. This ensures Cloudinary works even when .env is empty.
 *
 * @throws Error if Cloudinary is not configured (all sources failed)
 */
async function getCloudinary() {
  // Always resolve config fresh (in case runtime override was applied)
  const config = getCloudinaryConfig()
  const configHash = computeConfigHash(config)

  // If SDK already loaded with the same config, return cached instance
  if (_cloudinary && _lastConfigHash === configHash) {
    return _cloudinary
  }

  if (!isConfiguredFromModule()) {
    throw new Error(
      'Cloudinary is not configured. All sources failed (env vars, fallback values, and runtime overrides). ' +
      'Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    )
  }

  const { v2 } = await import('cloudinary')
  v2.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  })

  _cloudinary = v2
  _lastConfigHash = configHash

  console.log(
    `[Cloudinary SDK] Initialized — cloud: ${config.cloudName} ` +
    `(cloudName: ${config.sources.cloudName}, apiKey: ${config.sources.apiKey}, apiSecret: ${config.sources.apiSecret})`
  )

  return _cloudinary
}

/* ------------------------------------------------------------------ */
/*  Retry Logic with Exponential Backoff                                */
/* ------------------------------------------------------------------ */

/**
 * Classify an error as transient (retryable) or permanent.
 * Transient errors include: network timeouts, rate limits (429),
 * server errors (5xx), and ECONNRESET.
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const msg = error.message.toLowerCase()
  const name = (error as any).name?.toLowerCase() || ''

  // Network-level transient errors
  if (name.includes('timeout') || name.includes('econnreset') || name.includes('econnrefused')) {
    return true
  }
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused')) {
    return true
  }

  // HTTP rate limiting
  if (msg.includes('429') || msg.includes('rate limit')) {
    return true
  }

  // Server-side errors
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return true
  }

  // Cloudinary-specific transient error patterns
  if (msg.includes('request timeout') || msg.includes('internal server error')) {
    return true
  }

  return false
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute an async operation with automatic retry on transient failures.
 * Uses exponential backoff: delay doubles after each failed attempt.
 *
 * @param fn - The async operation to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelay - Base delay in ms for backoff (default: 500ms)
 * @returns The result of the async operation
 * @throws The last error if all retries are exhausted
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = BASE_RETRY_DELAY,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry if this is a permanent error or we've exhausted retries
      if (!isTransientError(error) || attempt === maxRetries) {
        throw error
      }

      // Calculate backoff delay with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200
      console.warn(
        `[Cloudinary] Attempt ${attempt + 1}/${maxRetries} failed (transient). ` +
        `Retrying in ${Math.round(delay)}ms... Error: ${error instanceof Error ? error.message : 'Unknown'}`
      )
      await sleep(delay)
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError
}

/* ------------------------------------------------------------------ */
/*  Upload Timeout Wrapper                                              */
/* ------------------------------------------------------------------ */

/**
 * Wrap a promise with a timeout. If the promise doesn't resolve
 * within the specified time, it's rejected with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Cloudinary ${operation} timed out after ${ms / 1000}s`))
    }, ms)

    promise
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

/* ------------------------------------------------------------------ */
/*  Core Upload Function                                                */
/* ------------------------------------------------------------------ */

/**
 * Generic upload function — uploads a buffer to Cloudinary with full
 * configuration options, retry logic, and timeout handling.
 *
 * This is the foundation for all other upload functions.
 *
 * @param buffer - The file buffer to upload
 * @param mimetype - MIME type of the file
 * @param options - Upload configuration options
 * @returns Upload result with CDN URL, publicId, and metadata
 * @throws Error if Cloudinary is not configured or upload fails after retries
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  mimetype: string,
  options: UploadOptions,
): Promise<CloudinaryUploadResult> {
  const {
    folder,
    publicId,
    overwrite = false,
    resourceType = 'image',
    maxWidth = DEFAULT_MAX_DIMENSION,
    maxHeight = DEFAULT_MAX_DIMENSION,
    quality = DEFAULT_QUALITY,
    tags = [],
  } = options

  const cloudinary = await getCloudinary()

  // Convert buffer to base64 data URI for Cloudinary upload
  const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`

  // Build upload parameters
  const uploadParams: any = {
    folder,
    public_id: publicId,
    overwrite,
    resource_type: resourceType,
    tags: tags.length > 0 ? tags : undefined,
  }

  // Add image-specific transformations (only for image resources)
  if (resourceType === 'image' && (maxWidth > 0 || maxHeight > 0)) {
    uploadParams.transformation = [
      {
        width: maxWidth || undefined,
        height: maxHeight || undefined,
        crop: 'limit',
        quality,
        fetch_format: 'auto',
      },
    ]
    uploadParams.fetch_format = 'auto'
    uploadParams.quality = quality
  }

  // Execute upload with retry + timeout
  const result = await withRetry(
    () => withTimeout(
      cloudinary.uploader.upload(dataUri, uploadParams),
      DEFAULT_UPLOAD_TIMEOUT,
      'upload',
    ),
  )

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.bytes,
  }
}

/* ------------------------------------------------------------------ */
/*  Connectivity Verification                                           */
/* ------------------------------------------------------------------ */

/**
 * Verify Cloudinary connectivity by making a lightweight API call.
 * Uses the `ping` endpoint to check if the Cloudinary API is reachable
 * and the credentials are valid.
 *
 * @returns Connection status with success flag and message
 */
export async function verifyCloudinaryConnection(): Promise<{
  success: boolean
  message: string
  cloudName?: string
}> {
  if (!isConfiguredFromModule()) {
    return {
      success: false,
      message: 'Cloudinary is not configured. All sources failed (env, fallback, runtime).',
    }
  }

  try {
    const cloudinary = await getCloudinary()

    // Use the ping API to verify connectivity
    const result = await withTimeout(
      cloudinary.api.ping(),
      10_000, // 10s timeout for ping
    )

    const config = getCloudinaryConfig()
    return {
      success: result.status === 'ok',
      message: result.status === 'ok' ? 'Connected to Cloudinary successfully' : `Unexpected status: ${result.status}`,
      cloudName: config.cloudName,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    const config = getCloudinaryConfig()
    return {
      success: false,
      message: `Connection failed: ${msg}`,
      cloudName: config.cloudName,
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Specialized Upload Functions                                        */
/* ------------------------------------------------------------------ */

/**
 * Upload a category image to Cloudinary.
 * Stored in the "realcart/categories/" folder with a unique public_id
 * based on the category slug and timestamp.
 * Automatic format conversion and quality optimization applied.
 */
export async function uploadCategoryImage(
  buffer: Buffer,
  mimetype: string,
  categorySlug: string,
): Promise<CloudinaryUploadResult> {
  const timestamp = Date.now()
  const publicId = `${categorySlug}-${timestamp}`

  return uploadToCloudinary(buffer, mimetype, {
    folder: 'realcart/categories',
    publicId,
    overwrite: false,
    resourceType: 'image',
    maxWidth: 512,
    maxHeight: 512,
    quality: 'auto:good',
    tags: ['category', categorySlug],
  })
}

/**
 * Upload a site logo to Cloudinary.
 * Stored in the "realcart/" folder as "site-logo" with overwrite enabled
 * (only one logo at a time).
 */
export async function uploadLogo(
  buffer: Buffer,
  mimetype: string,
): Promise<CloudinaryUploadResult> {
  return uploadToCloudinary(buffer, mimetype, {
    folder: 'realcart',
    publicId: 'site-logo',
    overwrite: true,
    resourceType: 'image',
    maxWidth: 512,
    maxHeight: 512,
    quality: 'auto:good',
    tags: ['logo'],
  })
}

/**
 * Upload a hero slider image to Cloudinary.
 * Stored in the "realcart/hero-slides/" folder with a unique public_id.
 * Hero slides are wide banners (recommended 2:1 aspect ratio) displayed
 * on the customer home page. Cloudinary handles automatic format
 * conversion, quality optimization, and CDN delivery.
 *
 * @param buffer - Image buffer
 * @param mimetype - MIME type of the image
 * @param slideSlug - Slug for the slide (used in Cloudinary public_id)
 * @returns Upload result with CDN URL, publicId, and metadata
 */
export async function uploadHeroSlideImage(
  buffer: Buffer,
  mimetype: string,
  slideSlug: string,
): Promise<CloudinaryUploadResult> {
  const timestamp = Date.now()
  const publicId = `${slideSlug}-${timestamp}`

  return uploadToCloudinary(buffer, mimetype, {
    folder: 'realcart/hero-slides',
    publicId,
    overwrite: false,
    resourceType: 'image',
    // Hero slides are wide banners — allow larger dimensions than category icons
    maxWidth: 1600,
    maxHeight: 800,
    quality: 'auto:good',
    tags: ['hero-slide', slideSlug],
  })
}

/**
 * Upload a review image to Cloudinary.
 * Stored in the "realcart/reviews/" folder with a unique public_id.
 * Automatic format conversion and quality optimization applied.
 */
export async function uploadReviewImage(
  buffer: Buffer,
  mimetype: string,
  reviewId: string,
): Promise<CloudinaryUploadResult> {
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  const publicId = `review-${reviewId}-${timestamp}-${randomSuffix}`

  return uploadToCloudinary(buffer, mimetype, {
    folder: 'realcart/reviews',
    publicId,
    overwrite: false,
    resourceType: 'image',
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 'auto:good',
    tags: ['review', reviewId],
  })
}

/**
 * Upload a review video to Cloudinary.
 * Stored in the "realcart/reviews/videos/" folder with a unique public_id.
 * Cloudinary handles automatic video format conversion and optimization.
 * Video resources are uploaded with resourceType 'video' so Cloudinary
 * processes them correctly (generates thumbnails, converts formats, etc.).
 *
 * @param buffer - Video buffer
 * @param mimetype - MIME type of the video
 * @param reviewId - Review identifier (used for Cloudinary public_id and tagging)
 * @returns Upload result with CDN URL, publicId, and metadata
 */
export async function uploadReviewVideo(
  buffer: Buffer,
  mimetype: string,
  reviewId: string,
): Promise<CloudinaryUploadResult> {
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  const publicId = `review-vid-${reviewId}-${timestamp}-${randomSuffix}`

  return uploadToCloudinary(buffer, mimetype, {
    folder: 'realcart/reviews/videos',
    publicId,
    overwrite: false,
    resourceType: 'video',
    quality: 'auto:good',
    tags: ['review', 'video', reviewId],
  })
}

/**
 * Upload a customer profile image to Cloudinary.
 * Stored in the "realcart/profiles/" folder with a unique public_id
 * based on the customer ID and timestamp.
 * Automatic format conversion, quality optimization, and square crop applied.
 */
export async function uploadProfileImage(
  buffer: Buffer,
  mimetype: string,
  customerId: string,
): Promise<CloudinaryUploadResult> {
  const timestamp = Date.now()
  const publicId = `profile-${customerId}-${timestamp}`

  return uploadToCloudinary(buffer, mimetype, {
    folder: 'realcart/profiles',
    publicId,
    overwrite: false,
    resourceType: 'image',
    maxWidth: 512,
    maxHeight: 512,
    quality: 'auto:good',
    tags: ['profile', customerId],
  })
}

/**
 * Upload a seller verification document to Cloudinary.
 * Stored in the "realcart/seller-docs/{documentType}/" folder with a unique public_id
 * based on the seller identifier and timestamp.
 * Supports both image (JPG, PNG) and raw (PDF) document formats.
 * Documents are uploaded with resourceType based on their MIME type.
 *
 * @param buffer - Document file buffer
 * @param mimetype - MIME type of the document (image/jpeg, image/png, application/pdf)
 * @param sellerId - Seller identifier (used for Cloudinary public_id and tagging)
 * @param documentType - Type of document (gst_certificate, pan_card, cancel_cheque, business_registration, address_proof)
 * @returns Upload result with CDN URL, publicId, and metadata
 */
export async function uploadSellerDocument(
  buffer: Buffer,
  mimetype: string,
  sellerId: string,
  documentType: string,
): Promise<CloudinaryUploadResult> {
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  const publicId = `${documentType}-${sellerId}-${timestamp}-${randomSuffix}`

  // Determine resource type based on mimetype
  const resourceType: 'image' | 'raw' = mimetype === 'application/pdf' ? 'raw' : 'image'

  // Build upload options based on document type
  const uploadOptions: UploadOptions = {
    folder: `realcart/seller-docs/${documentType}`,
    publicId,
    overwrite: false,
    resourceType,
    tags: ['seller-doc', documentType, sellerId],
  }

  // Add image optimizations only for image resources
  if (resourceType === 'image') {
    uploadOptions.maxWidth = 2048
    uploadOptions.maxHeight = 2048
    uploadOptions.quality = 'auto:good'
  }

  return uploadToCloudinary(buffer, mimetype, uploadOptions)
}

/* ------------------------------------------------------------------ */
/*  Delete Functions                                                    */
/* ------------------------------------------------------------------ */

/**
 * Delete a resource from Cloudinary by its public ID.
 * Uses retry logic for transient failures.
 * Silently ignores errors (resource may have already been deleted).
 */
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
): Promise<void> {
  try {
    const cloudinary = await getCloudinary()

    await withRetry(() =>
      withTimeout(
        cloudinary.uploader.destroy(publicId, { resource_type: resourceType }),
        DEFAULT_UPLOAD_TIMEOUT,
        'delete',
      ),
    )
  } catch (error) {
    // Log but don't throw — deletion is best-effort
    console.warn(
      `[Cloudinary] Failed to delete resource "${publicId}":`,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

/**
 * Delete a category image from Cloudinary.
 * Wrapper around deleteFromCloudinary for type safety.
 */
export async function deleteCategoryImage(publicId: string): Promise<void> {
  await deleteFromCloudinary(publicId, 'image')
}

/**
 * Delete the site logo from Cloudinary.
 * Wrapper around deleteFromCloudinary for type safety.
 */
export async function deleteLogo(publicId: string): Promise<void> {
  await deleteFromCloudinary(publicId, 'image')
}

/* ------------------------------------------------------------------ */
/*  URL Generation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Generate an optimized CDN URL for a Cloudinary resource
 * with specific dimensions and automatic format conversion.
 */
export async function getOptimizedUrl(
  publicId: string,
  options: { width?: number; height?: number; quality?: string } = {},
): Promise<string> {
  const cloudinary = await getCloudinary()
  const { width = 512, height = 512, quality = 'auto:good' } = options

  return cloudinary.url(publicId, {
    transformation: [
      {
        width,
        height,
        crop: 'limit',
        quality,
        fetch_format: 'auto',
      },
    ],
    secure: true,
  })!
}
