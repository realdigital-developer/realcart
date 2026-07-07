/**
 * Ximilar Fashion Attributes.
 *
 * Calls Ximilar's Fashion v2 recognition endpoint to extract fine-grained
 * apparel attributes:
 *   - clothing type, material, pattern, sleeve type
 *
 * Ximilar only returns useful data for apparel. For non-apparel (electronics,
 * home goods, etc.) it returns null fields, which is fine — the merged
 * attribute set simply carries nulls and the ranking engine ignores them.
 *
 * When XIMILAR_API_KEY is not set, this stage is skipped entirely (returns
 * all-null attributes) so the pipeline still works.
 *
 * No Z.ai tools are used — this is a direct HTTP call to Ximilar's REST API.
 */

import { XIMILAR, HAS_XIMILAR, DEBUG } from './config'
import type { FashionAttributes } from './types'

/* ------------------------------------------------------------------ */
/*  Null result (used when API key is missing or call fails)           */
/* ------------------------------------------------------------------ */

const NULL_RESULT: FashionAttributes = {
  clothingType: null,
  material: null,
  pattern: null,
  sleeveType: null,
}

/* ------------------------------------------------------------------ */
/*  Ximilar API call                                                   */
/* ------------------------------------------------------------------ */

interface XimilarTag {
  name: string
  probability: number
  id?: number
}

interface XimilarResponse {
  status?: { code?: number; text?: string }
  task_id?: string
  // Ximilar's fashion endpoint returns multiple possible result shapes.
  // We defensively probe for the common ones.
  result?: {
    tags?: XimilarTag[]
    products?: Array<{ tags?: XimilarTag[] }>
  }
  // Some Ximilar endpoints return a top-level `objects` array of categorized tags
  objects?: Array<{
    class?: string
    name?: string
    tags?: XimilarTag[]
  }>
}

/**
 * Map a raw tag name to one of our canonical attribute values.
 * Ximilar returns strings like "sleeve: short", "pattern: striped" — we split
 * on the colon when present, otherwise return the cleaned name.
 */
function mapTag(name: string): string {
  const clean = name.replace(/_/g, ' ').toLowerCase().trim()
  const idx = clean.indexOf(':')
  return idx >= 0 ? clean.slice(idx + 1).trim() : clean
}

async function callXimilar(buffer: Buffer, mimeType: string): Promise<FashionAttributes> {
  const base64 = buffer.toString('base64')
  const body = {
    // Ximilar accepts records with base64-encoded image data
    records: [{ _base64: base64, _mimetype: mimeType }],
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch(XIMILAR.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${XIMILAR.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ximilar ${res.status}: ${text.slice(0, 200)}`)
    }

    const json: XimilarResponse = await res.json()

    // Collect all tags from every possible location in the response
    const allTags: XimilarTag[] = []
    if (json.result?.tags) allTags.push(...json.result.tags)
    if (json.result?.products) {
      for (const p of json.result.products) if (p.tags) allTags.push(...p.tags)
    }
    if (json.objects) {
      for (const obj of json.objects) if (obj.tags) allTags.push(...obj.tags)
    }

    // Classify each tag into our attribute buckets by name keyword
    let clothingType: string | null = null
    let material: string | null = null
    let pattern: string | null = null
    let sleeveType: string | null = null

    for (const tag of allTags) {
      const mapped = mapTag(tag.name)
      const lower = mapped.toLowerCase()
      if (/(sleeve|sleeveless)/.test(lower) && !sleeveType) sleeveType = mapped
      else if (/(cotton|polyester|denim|silk|wool|leather|linen|rayon|nylon|fabric|material)/.test(lower) && !material) material = mapped
      else if (/(striped|floral|checkered|solid|printed|plaid|polka|geometric|pattern)/.test(lower) && !pattern) pattern = mapped
      else if (!clothingType) clothingType = mapped // first remaining tag → clothing type
    }

    return { clothingType, material, pattern, sleeveType }
  } finally {
    clearTimeout(timeout)
  }
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function analyzeWithXimilar(buffer: Buffer, mimeType: string): Promise<FashionAttributes> {
  if (!HAS_XIMILAR) {
    if (DEBUG) console.log('[image-search] Ximilar skipped (no API key)')
    return { ...NULL_RESULT }
  }

  try {
    const result = await callXimilar(buffer, mimeType)
    if (DEBUG) console.log('[image-search] Ximilar result:', JSON.stringify(result))
    return result
  } catch (err) {
    console.warn('[image-search] Ximilar call failed:', (err as Error).message)
    return { ...NULL_RESULT }
  }
}
