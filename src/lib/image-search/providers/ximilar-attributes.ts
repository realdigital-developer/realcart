/**
 * Provider: Ximilar Fashion Attributes
 * ------------------------------------------------------------------
 * Extracts fashion-specific attributes from the image:
 *   clothingType, material, pattern, sleeveType
 *
 * Uses Ximilar's Fashion Tagging API.
 * Docs: https://docs.ximilar.com/
 *   - Endpoint: https://api.ximilar.com/tagging/fashion/v2/recognize
 *   - Auth: header "Authorization: Token <API_KEY>"  OR  "Authorization: Bearer <token>"
 *   - Free tier available at ximilar.com
 *
 * The response contains a `records[]._labels` object with categorized tags:
 *   - "Clothing" → clothingType
 *   - "Material" → material
 *   - "Pattern" → pattern
 *   - "Sleeve" → sleeveType
 *
 * FALLBACK: When XIMILAR_API_KEY is missing or the request fails, returns
 * neutral nulls. The pipeline still works — Groq now ALSO extracts these
 * fashion attributes (clothingType/material/pattern/sleeveType) as a
 * backup, so Ximilar is an enhancement, not a hard dependency.
 */

import { getImageSearchConfig } from '../config'
import type { ImageAttributes } from '../types'

interface XimilarOutput {
  clothingType: string | null
  material: string | null
  pattern: string | null
  sleeveType: string | null
}

/**
 * Call Ximilar's fashion recognition endpoint with a base64 image.
 * Tries both the newer and legacy endpoints for resilience.
 */
export async function analyzeWithXimilar(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ result: XimilarOutput; source: 'ximilar' | 'fallback' }> {
  const config = getImageSearchConfig()

  if (!config.ximilar.available) {
    return { result: neutralFallback(), source: 'fallback' }
  }

  const base64 = imageBuffer.toString('base64')

  // Ximilar has a few endpoint variants depending on the product tier.
  // Try them in order; the first one that succeeds wins.
  const endpoints = [
    'https://api.ximilar.com/tagging/fashion/v2/recognize',
    'https://api.ximilar.com/fashion/v2/recognize',
    config.ximilar.endpoint, // user-configured override (if any different)
  ]
  // Dedupe while preserving order
  const uniqueEndpoints = [...new Set(endpoints)]

  for (const endpoint of uniqueEndpoints) {
    const result = await tryXimilarEndpoint(endpoint, base64, config.ximilar.apiKey!)
    if (result) {
      return { result, source: 'ximilar' }
    }
  }

  return { result: neutralFallback(), source: 'fallback' }
}

/**
 * Try a single Ximilar endpoint. Returns the parsed result on success,
 * or null to try the next endpoint.
 */
async function tryXimilarEndpoint(
  endpoint: string,
  base64: string,
  apiKey: string,
): Promise<XimilarOutput | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // Ximilar supports both "Token" and "Bearer" auth schemes.
        // "Token" is the classic format shown in their docs.
        'Authorization': `Token ${apiKey}`,
      },
      body: JSON.stringify({
        // Ximilar accepts base64 (without the data: prefix) in `_base64`
        records: [{ _base64: base64 }],
        // Request all available tag categories
        // (some endpoints support `tags_to_return` for filtering)
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 404 || res.status === 405) {
        // Endpoint not found / method not allowed → try next endpoint
        return null
      }
      if (res.status === 401 || res.status === 403) {
        console.warn(`[ImageSearch:Ximilar] auth failed (${res.status}) — check XIMILAR_API_KEY`)
        return null
      }
      console.warn(`[ImageSearch:Ximilar] ${endpoint} HTTP ${res.status}: ${text.slice(0, 200)}`)
      return null
    }

    const data = await res.json()

    // Ximilar response shape varies by endpoint version. Handle both:
    //   v2:  { records: [{ _labels: { Clothing: [...], Material: [...], ... } }] }
    //   v1:  { labels: { Clothing: [...], ... } }
    //   alt: { tags: [{ name, confidence }] }
    const record = data?.records?.[0]
    const labelsObj = record?._labels ?? data?.labels ?? {}
    const allTags = extractAllTags(labelsObj, data)

    if (allTags.length === 0) {
      console.warn(`[ImageSearch:Ximilar] ${endpoint} returned no tags`)
      return null
    }

    const result: XimilarOutput = {
      clothingType: pickByKeywords(allTags, [
        'shirt', 't-shirt', 'tee', 'top', 'kurta', 'kurti', 'saree', 'sari',
        'dress', 'gown', 'jeans', 'denim', 'trouser', 'pant', 'jogger',
        'jacket', 'blazer', 'coat', 'hoodie', 'sweater', 'leggings',
        'skirt', 'shorts', 'jumpsuit', 'lehenga', 'sherwani',
      ]),
      material: pickByKeywords(allTags, [
        'cotton', 'silk', 'polyester', 'wool', 'woolen', 'linen', 'denim',
        'leather', 'rayon', 'nylon', 'chiffon', 'georgette', 'crepe',
        'satin', 'velvet', 'canvas', 'blend',
      ]),
      pattern: pickByKeywords(allTags, [
        'solid', 'plain', 'stripe', 'striped', 'floral', 'flower', 'check',
        'checked', 'plaid', 'print', 'printed', 'polka', 'geometric',
        'abstract', 'paisley', 'embroidered', 'embroidery',
      ]),
      sleeveType: pickByKeywords(allTags, [
        'full sleeve', 'long sleeve', 'half sleeve', '3/4 sleeve',
        'three quarter', 'short sleeve', 'sleeveless', 'cap sleeve',
        'roll-up sleeve',
      ]),
    }

    return result
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted')) {
      console.warn(`[ImageSearch:Ximilar] ${endpoint} timed out`)
    } else {
      console.warn(`[ImageSearch:Ximilar] ${endpoint} error: ${msg}`)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Extract all tag name strings from the various Ximilar response shapes.
 */
function extractAllTags(
  labelsObj: Record<string, unknown>,
  fullData: Record<string, unknown>,
): string[] {
  const tags: string[] = []

  // Shape 1: labelsObj is { Category: [{ name, confidence }, ...] }
  if (labelsObj && typeof labelsObj === 'object') {
    for (const category of Object.keys(labelsObj)) {
      const val = (labelsObj as Record<string, unknown>)[category]
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string') {
            tags.push(item)
          } else if (item && typeof item === 'object') {
            const name = (item as Record<string, unknown>).name
              || (item as Record<string, unknown>).name_str
              || (item as Record<string, unknown>).label
              || (item as Record<string, unknown>).id
            if (typeof name === 'string') tags.push(name)
          }
        }
      } else if (typeof val === 'string') {
        tags.push(val)
      }
    }
  }

  // Shape 2: fullData.tags is [{ name, confidence }]
  const topLevelTags = fullData.tags
  if (Array.isArray(topLevelTags)) {
    for (const item of topLevelTags) {
      if (typeof item === 'string') {
        tags.push(item)
      } else if (item && typeof item === 'object') {
        const name = (item as Record<string, unknown>).name
          || (item as Record<string, unknown>).label
        if (typeof name === 'string') tags.push(name)
      }
    }
  }

  return tags
}

function neutralFallback(): XimilarOutput {
  return { clothingType: null, material: null, pattern: null, sleeveType: null }
}

function pickByKeywords(tags: string[], keywords: string[]): string | null {
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    for (const kw of keywords) {
      if (lower.includes(kw)) return lower
    }
  }
  return null
}

/**
 * Build the partial ImageAttributes from Ximilar output.
 * (gender/category/color/style/ageGroup come from Groq.)
 */
export function ximilarToAttributes(out: XimilarOutput): Partial<ImageAttributes> {
  return {
    clothingType: out.clothingType,
    material: out.material,
    pattern: out.pattern,
    sleeveType: out.sleeveType,
  }
}
