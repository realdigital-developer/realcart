/**
 * Upload Module — Cloudinary Only (Production-Ready)
 *
 * ALL image and file uploads go through Cloudinary exclusively.
 * No local filesystem storage is ever used for uploads.
 *
 * Cloudinary provides:
 *   - CDN-backed URLs for fast global delivery
 *   - Automatic format conversion (WebP, AVIF) and quality optimization
 *   - On-the-fly resizing and transformations via URL parameters
 *   - Secure, reliable cloud storage with 99.9% uptime SLA
 *   - Free tier: 25 GB storage, 25 GB bandwidth/month
 *
 * Robustness features:
 *   - Automatic retry with exponential backoff for transient failures
 *   - Upload timeout handling to prevent hanging requests
 *   - Connectivity verification API
 *   - Comprehensive error classification and reporting
 *   - Generic upload function for any resource type
 *   - MIME type and file size validation helpers
 *   - Clear error messages when Cloudinary is not configured
 *
 * Configuration (required in .env):
 *   CLOUDINARY_CLOUD_NAME  — Your Cloudinary cloud name
 *   CLOUDINARY_API_KEY     — Your Cloudinary API key
 *   CLOUDINARY_API_SECRET  — Your Cloudinary API secret
 */

import {
  isCloudinaryConfigured,
  getMissingConfigVars,
  getConfigStatus,
  uploadToCloudinary,
  uploadCategoryImage as cloudinaryUploadCategory,
  uploadLogo as cloudinaryUploadLogo,
  uploadHeroSlideImage as cloudinaryUploadHeroSlide,
  uploadProfileImage as cloudinaryUploadProfile,
  uploadReviewImage as cloudinaryUploadReview,
  uploadReviewVideo as cloudinaryUploadReviewVideo,
  uploadSellerDocument as cloudinaryUploadSellerDoc,
  deleteFromCloudinary,
  deleteCategoryImage as cloudinaryDeleteCategory,
  deleteLogo as cloudinaryDeleteLogo,
  verifyCloudinaryConnection,
  type CloudinaryUploadResult,
  type CloudinaryConfigStatus,
  type UploadOptions,
} from './cloudinary'

/* ------------------------------------------------------------------ */
/*  Re-exports for convenience                                          */
/* ------------------------------------------------------------------ */

export type { CloudinaryUploadResult, CloudinaryConfigStatus, UploadOptions }
export { verifyCloudinaryConnection, getConfigStatus }

/* ------------------------------------------------------------------ */
/*  Upload Result Type                                                  */
/* ------------------------------------------------------------------ */

export interface UploadResult {
  url: string
  publicId: string
  width: number
  height: number
  format: string
  size: number
}

/* ------------------------------------------------------------------ */
/*  Validation Helpers                                                  */
/* ------------------------------------------------------------------ */

/** Default allowed MIME types for image uploads */
export const DEFAULT_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

/** Default allowed MIME types for logo uploads (includes SVG) */
export const LOGO_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
])

/** Default max file size for images: 3.1 MB */
export const DEFAULT_MAX_IMAGE_SIZE = 3.1 * 1024 * 1024

/** Max file size for logos: 5 MB */
export const MAX_LOGO_SIZE = 5 * 1024 * 1024

/** Allowed MIME types for seller verification documents */
export const SELLER_DOCUMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
])

/** Max file size for seller documents: 5 MB */
export const MAX_SELLER_DOCUMENT_SIZE = 5 * 1024 * 1024

/** Valid seller document type identifiers */
export const SELLER_DOCUMENT_TYPE_IDS = [
  'gst_certificate',
  'pan_card',
  'cancel_cheque',
  'business_registration',
  'address_proof',
] as const

export type SellerDocumentTypeId = (typeof SELLER_DOCUMENT_TYPE_IDS)[number]

/**
 * Validate an image file before upload.
 * Returns an error message if validation fails, null if valid.
 */
export function validateImageFile(
  file: { type: string; size: number },
  allowedTypes: Set<string> = DEFAULT_IMAGE_TYPES,
  maxSize: number = DEFAULT_MAX_IMAGE_SIZE,
): string | null {
  if (!allowedTypes.has(file.type)) {
    const typeNames = Array.from(allowedTypes)
      .map((t) => t.replace('image/', '').toUpperCase())
      .join(', ')
    return `Invalid file type. Allowed: ${typeNames}`
  }

  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1)
    return `File too large. Maximum size: ${maxMB} MB`
  }

  return null
}

/* ------------------------------------------------------------------ */
/*  Configuration Check                                                 */
/* ------------------------------------------------------------------ */

/**
 * Check if Cloudinary is properly configured.
 * Returns true only if all required environment variables are set.
 */
export function isUploadConfigured(): boolean {
  return isCloudinaryConfigured()
}

/**
 * Alias for isUploadConfigured — checks if Cloudinary is ready.
 */
export function isCloudinaryReady(): boolean {
  return isCloudinaryConfigured()
}

/**
 * Get the missing configuration variables (if any).
 * Useful for displaying setup guidance in the admin UI.
 */
export function getMissingConfig(): string[] {
  return getMissingConfigVars()
}

/**
 * Build a descriptive error message when Cloudinary is not configured.
 * Includes which variables are missing and a signup link.
 */
function buildNotConfiguredError(): Error {
  const missing = getMissingConfigVars()
  return new Error(
    `Cloudinary is not configured. Missing: ${missing.join(', ')}. ` +
    `Please add these to your .env file. ` +
    `Sign up at cloudinary.com/users/register_free`
  )
}

/* ------------------------------------------------------------------ */
/*  Category Image Upload                                               */
/* ------------------------------------------------------------------ */

/**
 * Upload a category image to Cloudinary.
 * The image is stored in the "realcart/categories/" folder with automatic
 * format conversion and quality optimization.
 *
 * @param buffer - Image buffer
 * @param mimetype - MIME type of the image
 * @param categorySlug - Slug for the category (used in Cloudinary public_id)
 * @returns Upload result with CDN URL, publicId, and metadata
 * @throws Error if Cloudinary is not configured or upload fails after retries
 */
export async function uploadCategoryImage(
  buffer: Buffer,
  mimetype: string,
  categorySlug: string,
): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) {
    throw buildNotConfiguredError()
  }

  const result = await cloudinaryUploadCategory(buffer, mimetype, categorySlug)
  return {
    url: result.url,
    publicId: result.publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.size,
  }
}

/* ------------------------------------------------------------------ */
/*  Logo Upload                                                         */
/* ------------------------------------------------------------------ */

/**
 * Upload a site logo image to Cloudinary.
 * The logo is stored in the "realcart/" folder as "site-logo" with overwrite enabled.
 * Cloudinary handles automatic format conversion, quality optimization, and CDN delivery.
 *
 * @param buffer - Image buffer
 * @param mimetype - MIME type of the image
 * @returns Upload result with CDN URL, publicId, and metadata
 * @throws Error if Cloudinary is not configured or upload fails after retries
 */
export async function uploadLogoImage(
  buffer: Buffer,
  mimetype: string,
): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) {
    throw buildNotConfiguredError()
  }

  const result = await cloudinaryUploadLogo(buffer, mimetype)
  return {
    url: result.url,
    publicId: result.publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.size,
  }
}

/* ------------------------------------------------------------------ */
/*  Hero Slide Image Upload                                             */
/* ------------------------------------------------------------------ */

/**
 * Upload a hero slider image to Cloudinary.
 * The image is stored in the "realcart/hero-slides/" folder with a unique
 * public_id based on the slide slug. Hero slides are wide banners displayed
 * on the customer home page.
 *
 * @param buffer - Image buffer
 * @param mimetype - MIME type of the image
 * @param slideSlug - Slug for the slide (used in Cloudinary public_id)
 * @returns Upload result with CDN URL, publicId, and metadata
 * @throws Error if Cloudinary is not configured or upload fails after retries
 */
export async function uploadHeroSlideImage(
  buffer: Buffer,
  mimetype: string,
  slideSlug: string,
): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) {
    throw buildNotConfiguredError()
  }

  const result = await cloudinaryUploadHeroSlide(buffer, mimetype, slideSlug)
  return {
    url: result.url,
    publicId: result.publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.size,
  }
}

/* ------------------------------------------------------------------ */
/*  Profile Image Upload                                                */
/* ------------------------------------------------------------------ */

/**
 * Upload a customer profile image to Cloudinary.
 * The image is stored in the "realcart/profiles/" folder with automatic
 * format conversion, quality optimization, and square crop.
 *
 * @param buffer - Image buffer
 * @param mimetype - MIME type of the image
 * @param customerId - Customer ID (used in Cloudinary public_id)
 * @returns Upload result with CDN URL, publicId, and metadata
 * @throws Error if Cloudinary is not configured or upload fails after retries
 */
export async function uploadProfileImage(
  buffer: Buffer,
  mimetype: string,
  customerId: string,
): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) {
    throw buildNotConfiguredError()
  }

  const result = await cloudinaryUploadProfile(buffer, mimetype, customerId)
  return {
    url: result.url,
    publicId: result.publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.size,
  }
}

/* ------------------------------------------------------------------ */
/*  Review Image Upload                                                 */
/* ------------------------------------------------------------------ */

/** Max file size for review images: 5 MB */
export const MAX_REVIEW_IMAGE_SIZE = 5 * 1024 * 1024

/** Max number of images per review */
export const MAX_REVIEW_IMAGES = 10

/** Allowed image MIME types for review uploads */
export const REVIEW_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

/**
 * Upload a review image to Cloudinary.
 * The image is stored in the "realcart/reviews/" folder with automatic
 * format conversion and quality optimization.
 */
export async function uploadReviewImageFile(
  buffer: Buffer,
  mimetype: string,
  reviewId: string,
): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) {
    throw buildNotConfiguredError()
  }

  const result = await cloudinaryUploadReview(buffer, mimetype, reviewId)
  return {
    url: result.url,
    publicId: result.publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.size,
  }
}

/* ------------------------------------------------------------------ */
/*  Review Video Upload                                                 */
/* ------------------------------------------------------------------ */

/** Max file size for review videos: 30 MB */
export const MAX_REVIEW_VIDEO_SIZE = 30 * 1024 * 1024

/** Max number of videos per review */
export const MAX_REVIEW_VIDEOS = 5

/** Allowed video MIME types for review uploads */
export const REVIEW_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']

/**
 * Validate a video file before upload.
 * Returns an error message if validation fails, null if valid.
 */
export function validateVideoFile(
  file: { type: string; size: number },
  allowedTypes: Set<string> = new Set(REVIEW_VIDEO_TYPES),
  maxSize: number = MAX_REVIEW_VIDEO_SIZE,
): string | null {
  if (!allowedTypes.has(file.type)) {
    const typeNames = Array.from(allowedTypes)
      .map((t) => t.replace('video/', '').toUpperCase())
      .join(', ')
    return `Invalid video type. Allowed: ${typeNames}`
  }

  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(0)
    return `Video too large. Maximum size: ${maxMB} MB`
  }

  return null
}

/**
 * Upload a review video to Cloudinary.
 * The video is stored in the "realcart/reviews/videos/" folder.
 * Cloudinary handles automatic format conversion and optimization.
 */
export async function uploadReviewVideoFile(
  buffer: Buffer,
  mimetype: string,
  reviewId: string,
): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) {
    throw buildNotConfiguredError()
  }

  const result = await cloudinaryUploadReviewVideo(buffer, mimetype, reviewId)
  return {
    url: result.url,
    publicId: result.publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.size,
  }
}

/* ------------------------------------------------------------------ */
/*  Seller Document Upload                                              */
/* ------------------------------------------------------------------ */

/**
 * Validate a seller verification document before upload.
 * Accepts images (JPG, PNG, WebP) and PDFs up to 5 MB.
 * Returns an error message if validation fails, null if valid.
 */
export function validateDocumentFile(
  file: { type: string; size: number },
  allowedTypes: Set<string> = SELLER_DOCUMENT_TYPES,
  maxSize: number = MAX_SELLER_DOCUMENT_SIZE,
): string | null {
  if (!allowedTypes.has(file.type)) {
    const typeNames = Array.from(allowedTypes)
      .map((t) => t.includes('/') ? t.replace('image/', '').replace('application/', '').toUpperCase() : t)
      .join(', ')
    return `Invalid file type. Allowed: ${typeNames}`
  }

  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1)
    return `File too large. Maximum size: ${maxMB} MB`
  }

  return null
}

/**
 * Upload a seller verification document to Cloudinary.
 * The document is stored in the "realcart/seller-docs/{documentType}/" folder.
 * Supports both image and PDF documents.
 *
 * @param buffer - Document file buffer
 * @param mimetype - MIME type of the document
 * @param sellerId - Seller identifier (used in Cloudinary public_id and tagging)
 * @param documentType - Type of document (gst_certificate, pan_card, cancel_cheque, business_registration, address_proof)
 * @returns Upload result with CDN URL, publicId, and metadata
 * @throws Error if Cloudinary is not configured or upload fails after retries
 */
export async function uploadSellerDocument(
  buffer: Buffer,
  mimetype: string,
  sellerId: string,
  documentType: string,
): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) {
    throw buildNotConfiguredError()
  }

  const result = await cloudinaryUploadSellerDoc(buffer, mimetype, sellerId, documentType)
  return {
    url: result.url,
    publicId: result.publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.size,
  }
}

/* ------------------------------------------------------------------ */
/*  Generic Upload                                                      */
/* ------------------------------------------------------------------ */

/**
 * Generic upload function for any type of image or file.
 * Use this for seller product images, delivery documents, banners, etc.
 *
 * @param buffer - File buffer to upload
 * @param mimetype - MIME type of the file
 * @param options - Upload configuration (folder, publicId, etc.)
 * @returns Upload result with CDN URL, publicId, and metadata
 * @throws Error if Cloudinary is not configured or upload fails after retries
 */
export async function uploadFile(
  buffer: Buffer,
  mimetype: string,
  options: UploadOptions,
): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) {
    throw buildNotConfiguredError()
  }

  const result = await uploadToCloudinary(buffer, mimetype, options)
  return {
    url: result.url,
    publicId: result.publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    size: result.size,
  }
}

/* ------------------------------------------------------------------ */
/*  Delete Functions                                                    */
/* ------------------------------------------------------------------ */

/**
 * Delete a category image from Cloudinary by its public ID.
 * Silently ignores errors (image may have already been deleted).
 */
export async function deleteCategoryImageFile(publicId: string): Promise<void> {
  await cloudinaryDeleteCategory(publicId)
}

/**
 * Delete the site logo from Cloudinary by its public ID.
 * Silently ignores errors (image may have already been deleted).
 */
export async function deleteLogoImage(publicId: string): Promise<void> {
  await cloudinaryDeleteLogo(publicId)
}

/**
 * Delete any resource from Cloudinary by its public ID.
 * Use this for generic file deletion (product images, banners, etc.).
 * Silently ignores errors (resource may have already been deleted).
 */
export async function deleteFile(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
): Promise<void> {
  await deleteFromCloudinary(publicId, resourceType)
}
