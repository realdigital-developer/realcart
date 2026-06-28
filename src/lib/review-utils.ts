/**
 * Review Utility Functions
 *
 * Shared helpers for review media processing across API routes.
 */

/**
 * Generate a thumbnail URL from a full-size Cloudinary media URL.
 *
 * Handles:
 *  - Cloudinary image URLs  → w_200,h_200,c_thumb
 *  - Cloudinary video URLs  → w_200,h_200,c_thumb,vs_2,f_jpg (forces jpg output)
 *  - Non-Cloudinary URLs    → returns null (caller should use full URL as fallback)
 *
 * Cloudinary video URLs often don't end with a file extension (e.g.
 * `https://res.cloudinary.com/demo/video/upload/v1234/folder/sample`).
 * The `f_jpg` transformation parameter already forces image output,
 * so we only need to append `.jpg` when the URL has a known video extension.
 */
export function generateThumbnailUrl(
  mediaUrl: string,
  mediaType: 'image' | 'video'
): string | null {
  if (!mediaUrl) return null

  // Only Cloudinary URLs support server-side thumbnail transformations
  if (!mediaUrl.includes('/upload/')) return null

  if (mediaType === 'video') {
    // Cloudinary video thumbnail: pick frame at 2s, force jpg output
    let thumb = mediaUrl.replace('/upload/', '/upload/w_200,h_200,c_thumb,vs_2,f_jpg/')

    // If URL ends with a known video extension, replace it with .jpg
    // so the browser <img> tag can display it
    thumb = thumb.replace(/\.(mp4|webm|mov|avi|mkv|m4v|flv|wmv|3gp)($|\?)/i, '.jpg$2')

    // If no extension was replaced and URL doesn't end with an image extension,
    // Cloudinary's f_jpg param will handle the output format, but some
    // browsers may not render without an extension — append .jpg as fallback
    if (!thumb.match(/\.(jpe?g|png|gif|webp|bmp)($|\?)/i) && !thumb.endsWith('.jpg')) {
      thumb = thumb + '.jpg'
    }

    return thumb
  }

  // Image thumbnail
  return mediaUrl.replace('/upload/', '/upload/w_200,h_200,c_thumb/')
}
