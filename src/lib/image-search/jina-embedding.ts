/**
 * Jina Image Embeddings.
 *
 * Calls Jina's /v1/embeddings endpoint with the jina-clip-v2 multimodal model
 * to produce a 1024-dimensional vector representing the image's visual semantics.
 *
 * When JINA_API_KEY is not set, we generate a deterministic pseudo-embedding
 * derived from the image's color histogram + aspect ratio + brightness. This
 * pseudo-embedding is NOT semantically meaningful, but it is deterministic
 * (same image → same vector) so the caching layer still works, and it lets
 * the pipeline return *some* results in environments without the API key.
 *
 * No Z.ai tools are used — this is a direct HTTP call to Jina's REST API.
 */

import { JINA, HAS_JINA, DEBUG } from './config'
import { classifyColor } from './color-utils'

/* ------------------------------------------------------------------ */
/*  Local fallback — deterministic pseudo-embedding from image stats   */
/* ------------------------------------------------------------------ */

/**
 * Build a 64-dimensional pseudo-embedding from image statistics.
 * The vector is padded with zeros to JINA.dimensions so the shape is
 * compatible with the Pinecone index.
 *
 * Dimensions 0..15:   16 color buckets (histogram)
 * Dimension 16:       normalized brightness
 * Dimension 17:       normalized aspect ratio
 * Dimension 18:       normalized saturation
 * Dimensions 19..63:  zeros (placeholder for semantic content)
 */
async function localFallback(buffer: Buffer): Promise<number[]> {
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(buffer)
      .resize(64, 64, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const channels = info.channels
    const pixelCount = info.width * info.height

    // 16 color buckets
    const buckets = new Array(16).fill(0)
    let totalBrightness = 0
    let totalSaturation = 0

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i]
      const g = data[i + 1] || 0
      const b = data[i + 2] || 0
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const brightness = (max + min) / 2
      const saturation = max === 0 ? 0 : (max - min) / max
      totalBrightness += brightness
      totalSaturation += saturation

      // Bucket by hue + brightness — gives a coarse but stable signature
      const colorName = classifyColor(r, g, b)
      const bucketMap: Record<string, number> = {
        black: 0, white: 1, grey: 2, red: 3, maroon: 4, pink: 5,
        orange: 6, yellow: 7, green: 8, teal: 9, blue: 10, navy: 11,
        purple: 12, brown: 13, beige: 14,
      }
      const idx = bucketMap[colorName] ?? 15
      buckets[idx]++
    }

    // Normalize buckets to 0..1
    const hist = buckets.map(b => b / pixelCount)
    const avgBrightness = (totalBrightness / pixelCount) / 255
    const avgSaturation = totalSaturation / pixelCount
    const aspectRatio = info.width / info.height
    const normalizedAspect = Math.min(1, aspectRatio / 2) // cap at 2:1

    // Assemble the 64-dim vector
    const vec = [
      ...hist,
      avgBrightness,
      normalizedAspect,
      avgSaturation,
      ...new Array(45).fill(0),
    ]

    // Pad or trim to JINA.dimensions
    while (vec.length < JINA.dimensions) vec.push(0)
    if (vec.length > JINA.dimensions) vec.length = JINA.dimensions

    // L2 normalize — so cosine similarity works correctly downstream
    let norm = 0
    for (const v of vec) norm += v * v
    norm = Math.sqrt(norm) || 1
    const normalized = vec.map(v => v / norm)

    if (DEBUG) console.log('[image-search] Jina fallback — pseudo-embedding dim:', normalized.length)
    return normalized
  } catch (err) {
    console.warn('[image-search] Jina local fallback failed:', (err as Error).message)
    // Last-resort: deterministic hash-based vector
    const { createHash } = await import('crypto')
    const hash = createHash('sha256').update(buffer).digest()
    const vec: number[] = []
    for (let i = 0; i < JINA.dimensions; i++) {
      vec.push((hash[i % hash.length] - 128) / 128)
    }
    let norm = 0
    for (const v of vec) norm += v * v
    norm = Math.sqrt(norm) || 1
    return vec.map(v => v / norm)
  }
}

/* ------------------------------------------------------------------ */
/*  Jina API call                                                      */
/* ------------------------------------------------------------------ */

interface JinaEmbeddingResponse {
  model?: string
  usage?: { total_tokens?: number }
  data?: Array<{ object_index?: number; embedding?: number[] }>
}

async function callJina(buffer: Buffer, mimeType: string): Promise<number[]> {
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  const body = {
    model: JINA.model,
    input: [dataUrl],
    input_type: 'image',
    embedding_type: 'float',
    dimensions: JINA.dimensions,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  try {
    const res = await fetch(JINA.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JINA.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Jina ${res.status}: ${text.slice(0, 200)}`)
    }

    const json: JinaEmbeddingResponse = await res.json()
    const embedding = json.data?.[0]?.embedding
    if (!embedding || embedding.length === 0) {
      throw new Error('Jina returned empty embedding')
    }

    // L2 normalize the embedding so cosine similarity = dot product
    let norm = 0
    for (const v of embedding) norm += v * v
    norm = Math.sqrt(norm) || 1
    return embedding.map(v => v / norm)
  } finally {
    clearTimeout(timeout)
  }
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function embedWithJina(buffer: Buffer, mimeType: string): Promise<number[]> {
  if (!HAS_JINA) {
    if (DEBUG) console.log('[image-search] Jina skipped (no API key) — using local fallback')
    return localFallback(buffer)
  }

  try {
    const result = await callJina(buffer, mimeType)
    if (DEBUG) console.log('[image-search] Jina embedding dim:', result.length)
    return result
  } catch (err) {
    console.warn('[image-search] Jina call failed, falling back to local:', (err as Error).message)
    return localFallback(buffer)
  }
}

/* ------------------------------------------------------------------ */
/*  Text embedding (used by the indexing script for products without   */
/*  a usable primary image — e.g. broken CDN URLs).                    */
/* ------------------------------------------------------------------ */

export async function embedTextWithJina(text: string): Promise<number[]> {
  if (!HAS_JINA) {
    // Deterministic hash fallback
    const { createHash } = await import('crypto')
    const hash = createHash('sha256').update(text).digest()
    const vec: number[] = []
    for (let i = 0; i < JINA.dimensions; i++) {
      vec.push((hash[i % hash.length] - 128) / 128)
    }
    let norm = 0
    for (const v of vec) norm += v * v
    norm = Math.sqrt(norm) || 1
    return vec.map(v => v / norm)
  }

  try {
    const res = await fetch(JINA.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JINA.apiKey}`,
      },
      body: JSON.stringify({
        model: JINA.model,
        input: [text.slice(0, 500)], // truncate to avoid token limits
        input_type: 'text',
        embedding_type: 'float',
        dimensions: JINA.dimensions,
      }),
    })
    if (!res.ok) throw new Error(`Jina text ${res.status}`)
    const json: JinaEmbeddingResponse = await res.json()
    const embedding = json.data?.[0]?.embedding || []
    let norm = 0
    for (const v of embedding) norm += v * v
    norm = Math.sqrt(norm) || 1
    return embedding.map(v => v / norm)
  } catch (err) {
    console.warn('[image-search] Jina text embed failed:', (err as Error).message)
    // Fall back to hash
    const { createHash } = await import('crypto')
    const hash = createHash('sha256').update(text).digest()
    const vec: number[] = []
    for (let i = 0; i < JINA.dimensions; i++) {
      vec.push((hash[i % hash.length] - 128) / 128)
    }
    let norm = 0
    for (const v of vec) norm += v * v
    norm = Math.sqrt(norm) || 1
    return vec.map(v => v / norm)
  }
}
