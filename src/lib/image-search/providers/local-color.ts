/**
 * Provider: Local Color Analysis (fallback for when Groq is unavailable)
 * ------------------------------------------------------------------
 * A pure-JavaScript image color analyzer that extracts the dominant color
 * from an image buffer WITHOUT any external API.
 *
 * How it works:
 *   1. Decodes the JPEG/PNG/WebP bytes using `sharp` (already a dependency)
 *      to get raw RGB pixel data at a small resolution (32x32 = 1024 px).
 *   2. Quantizes each pixel to the nearest canonical color bucket.
 *   3. Returns the most frequent bucket as the dominant color.
 *
 * This gives a REAL color signal even when no vision API is configured,
 * so the attribute-based MongoDB query can filter by color — dramatically
 * improving result quality for the "no API keys" case.
 *
 * This is NOT a replacement for Groq (which also extracts category, gender,
 * style, etc.) — it only extracts COLOR. But color alone is a strong signal
 * for product matching (e.g., "red t-shirt" → red products).
 */

import sharp from 'sharp'
import { normalizeColor } from '../normalize'

export interface LocalColorResult {
  /** Canonical color name (e.g., "red", "navy blue") or null */
  color: string | null
  /** Top 3 dominant colors (canonical names) by pixel count */
  dominantColors: string[]
  /** Whether the image is mostly light or dark (for contrast matching) */
  brightness: 'light' | 'medium' | 'dark'
  source: 'local' | 'fallback'
}

/**
 * Analyze an image buffer to extract the dominant color.
 *
 * Uses sharp to decode + resize to 32x32, then counts pixel colors.
 * Fast (<50ms) and works on Vercel serverless.
 */
export async function analyzeImageColors(
  imageBuffer: Buffer,
): Promise<LocalColorResult> {
  try {
    // Resize to 48x48 (2304 pixels) — enough for accurate color detection,
    // small enough to be fast (<50ms). Convert to raw RGB (no alpha).
    const { data, info } = await sharp(imageBuffer)
      .resize(48, 48, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const channels = info.channels // 3 for RGB
    const pixelCount = data.length / channels

    // Count pixels per canonical color bucket
    const colorCounts = new Map<string, number>()
    let totalBrightness = 0

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      totalBrightness += (r + g + b) / 3

      const canonical = rgbToCanonicalColor(r, g, b)
      if (canonical) {
        colorCounts.set(canonical, (colorCounts.get(canonical) || 0) + 1)
      }
    }

    const avgBrightness = totalBrightness / pixelCount
    const brightness: 'light' | 'medium' | 'dark' =
      avgBrightness > 170 ? 'light' : avgBrightness < 85 ? 'dark' : 'medium'

    if (colorCounts.size === 0) {
      return { color: null, dominantColors: [], brightness, source: 'fallback' }
    }

    // Sort by count descending
    const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1])
    const dominantColors = sorted.slice(0, 3).map(([c]) => c)

    // The dominant color must cover at least 10% of the image to be
    // considered reliable. Otherwise, return null (mixed/multicolor).
    // 10% threshold allows soft-pattern fabrics (florals, prints) to
    // still detect their base color.
    const topColor = sorted[0]
    const topColorRatio = topColor[1] / pixelCount

    let color: string | null = null
    if (topColorRatio >= 0.10) {
      color = topColor[0]
    }

    // SMART FALLBACK: If the top color is a neutral (white/grey/black)
    // but there's a colored secondary color with >= 8% presence, use the
    // secondary color instead. This handles patterned fabrics (floral
    // sarees, printed t-shirts) where the background is white/grey but
    // the product's identity color is in the pattern.
    const neutrals = new Set(['white', 'grey', 'black'])
    if (!color || neutrals.has(color)) {
      for (const [candColor, candCount] of sorted) {
        if (!neutrals.has(candColor) && (candCount / pixelCount) >= 0.08) {
          color = candColor
          break
        }
      }
    }

    return { color, dominantColors, brightness, source: 'local' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ImageSearch:LocalColor] analysis failed: ${msg}`)
    return { color: null, dominantColors: [], brightness: 'medium', source: 'fallback' }
  }
}

/**
 * Map an RGB value to a canonical color name.
 *
 * Uses HSV-style hue detection with brightness/saturation thresholds.
 * Returns the canonical name (matching the normalize.ts COLOR_MAP) or null
 * for near-white/near-black/near-gray (which we treat as "no dominant color").
 */
function rgbToCanonicalColor(r: number, g: number, b: number): string | null {
  // Convert to 0-1 range
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  // Brightness (value)
  const v = max
  // Saturation
  const s = max === 0 ? 0 : delta / max

  // Near-white / near-black / near-gray → no dominant color
  if (v > 0.92 && s < 0.08) return 'white'
  if (v < 0.08) return 'black'
  // Lower saturation threshold (0.08) so soft/pastel colors like emerald
  // green chiffon, blush pink, etc. are still detected as colored (not grey).
  if (s < 0.08) {
    // Gray scale — classify by brightness
    if (v > 0.6) return 'grey'
    if (v > 0.3) return 'grey'
    return 'black'
  }

  // Hue calculation
  let h = 0
  if (delta === 0) {
    h = 0
  } else if (max === rn) {
    h = ((gn - bn) / delta) % 6
  } else if (max === gn) {
    h = (bn - rn) / delta + 2
  } else {
    h = (rn - gn) / delta + 4
  }
  h = h * 60
  if (h < 0) h += 360

  // Classify by hue + saturation + brightness into canonical color names
  // matching the normalize.ts COLOR_MAP
  if (h < 15 || h >= 345) {
    // Red — but check if it's maroon (dark red) or pink (light red)
    if (v < 0.4) return 'maroon'
    if (v > 0.75 && s < 0.5) return 'pink'
    return 'red'
  }
  if (h < 30) return v < 0.4 ? 'maroon' : 'coral'
  if (h < 45) return 'orange'
  if (h < 65) return v < 0.5 ? 'mustard' : 'yellow'
  if (h < 90) return 'olive'
  if (h < 150) return 'green'
  if (h < 180) return 'teal'
  if (h < 210) return v < 0.35 ? 'navy blue' : 'sky blue'
  if (h < 250) return v < 0.35 ? 'navy blue' : 'blue'
  if (h < 275) return v < 0.35 ? 'navy blue' : 'denim blue'
  if (h < 300) return 'purple'
  if (h < 330) return 'lavender'
  // 330-345 — pink/magenta range
  return 'pink'
}

/**
 * Build a partial ImageAttributes from the local color analysis.
 * Only the `color` field is populated; all others are null.
 */
export function localColorToAttributes(result: LocalColorResult): Partial<import('../types').ImageAttributes> {
  return {
    color: normalizeColor(result.color),
  }
}
