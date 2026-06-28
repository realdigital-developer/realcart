/**
 * Provider: Jina Image Embeddings
 * ------------------------------------------------------------------
 * Generates a dense vector embedding of the image using Jina AI's
 * CLIP v2 multimodal embedding model.
 *
 * Jina CLIP v2 API (https://api.jina.ai/v1/embeddings):
 *   - Supports BOTH text and image inputs in the SAME embedding space
 *   - Image input format: data URL (data:image/jpeg;base64,...)
 *   - Returns 1024-dimensional float vectors
 *   - Vectors are L2-normalized (cosine similarity = dot product)
 *   - Free tier: 1M tokens/month
 *
 * CRITICAL: The image must be passed as a data URL in the `input` array.
 * Jina auto-detects image vs text from the URL scheme. The previous
 * implementation used the same format but Jina's API has subtle requirements:
 *   - The data URL MUST include the MIME type
 *   - The model name must be exactly "jina-clip-v2"
 *   - `embedding_type: "float"` is required (default is base64)
 *
 * FALLBACK: When JINA_API_KEY is missing or the request fails, we generate
 * a DETERMINISTIC 512-dimensional pseudo-embedding. This is NOT semantic
 * — it's a stable hash-based vector so the pipeline doesn't crash.
 * For real visual similarity, configure JINA_API_KEY (free at jina.ai).
 */

import { getImageSearchConfig } from '../config'

interface JinaEmbeddingResult {
  embedding: number[]
  dimension: number
  source: 'jina' | 'fallback'
}

/**
 * Generate an image embedding via Jina's CLIP v2 API.
 *
 * @param imageBuffer  Raw image bytes
 * @param mimeType     Image MIME type (image/jpeg, image/png, image/webp)
 */
export async function embedImageWithJina(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<JinaEmbeddingResult> {
  const config = getImageSearchConfig()

  if (!config.jina.available) {
    return pseudoEmbedding(imageBuffer)
  }

  // Jina accepts up to ~20MB images but recommends <2MB. Our upload route
  // already caps at 2MB, so we're fine.
  const base64 = imageBuffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  // Try up to 2 times with a short delay (handles transient 429/503)
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    try {
      const res = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.jina.apiKey}`,
        },
        body: JSON.stringify({
          model: config.jina.model,
          // Jina CLIP v2: pass image as data URL in the input array.
          // The API auto-detects image vs text from the data: scheme.
          input: [dataUrl],
          // CRITICAL: must request float (default is base64-encoded)
          embedding_type: 'float',
          // normalized: true is the default for CLIP v2, but be explicit
          normalized: true,
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        // 429 = rate limit — wait and retry once
        if (res.status === 429 && attempt === 0) {
          console.warn('[ImageSearch:Jina] rate limited, retrying in 1s…')
          clearTimeout(timeout)
          await sleep(1000)
          continue
        }
        // 503 = service unavailable — retry once
        if (res.status === 503 && attempt === 0) {
          console.warn('[ImageSearch:Jina] service unavailable, retrying…')
          clearTimeout(timeout)
          await sleep(500)
          continue
        }
        console.warn(`[ImageSearch:Jina] HTTP ${res.status}: ${text.slice(0, 300)}`)
        return pseudoEmbedding(imageBuffer)
      }

      const data = await res.json()

      // Jina response shape: { data: [{ embedding: number[] }], model, usage }
      const embedding: number[] | undefined = data?.data?.[0]?.embedding
      if (!Array.isArray(embedding) || embedding.length === 0) {
        console.warn('[ImageSearch:Jina] no embedding in response:', JSON.stringify(data).slice(0, 200))
        return pseudoEmbedding(imageBuffer)
      }

      return {
        embedding,
        dimension: embedding.length,
        source: 'jina',
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('aborted')) {
        console.warn(`[ImageSearch:Jina] attempt ${attempt + 1} timed out`)
      } else {
        console.warn(`[ImageSearch:Jina] attempt ${attempt + 1} error: ${msg}`)
      }
      if (attempt === 0) {
        clearTimeout(timeout)
        await sleep(500)
        continue
      }
      return pseudoEmbedding(imageBuffer)
    } finally {
      clearTimeout(timeout)
    }
  }

  return pseudoEmbedding(imageBuffer)
}

/**
 * Generate an embedding for a TEXT query (used for hybrid text+image search).
 * Jina CLIP v2 shares the same embedding space for text and images, so a
 * text query like "red cotton t-shirt" can match against image embeddings.
 */
export async function embedTextWithJina(text: string): Promise<JinaEmbeddingResult> {
  const config = getImageSearchConfig()

  if (!config.jina.available) {
    return pseudoEmbedding(Buffer.from(text, 'utf-8'))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.jina.apiKey}`,
      },
      body: JSON.stringify({
        model: config.jina.model,
        input: [text],
        embedding_type: 'float',
        normalized: true,
      }),
    })

    if (!res.ok) {
      const text2 = await res.text().catch(() => '')
      console.warn(`[ImageSearch:Jina-text] HTTP ${res.status}: ${text2.slice(0, 200)}`)
      return pseudoEmbedding(Buffer.from(text, 'utf-8'))
    }

    const data = await res.json()
    const embedding: number[] | undefined = data?.data?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return pseudoEmbedding(Buffer.from(text, 'utf-8'))
    }

    return { embedding, dimension: embedding.length, source: 'jina' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ImageSearch:Jina-text] error: ${msg}`)
    return pseudoEmbedding(Buffer.from(text, 'utf-8'))
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Generate a deterministic pseudo-embedding from image bytes.
 *
 * This is a FALLBACK ONLY — it is NOT a true semantic embedding. It
 * produces a stable 512-dim vector derived from the image's color
 * distribution and byte hash. This ensures:
 *   1. The pipeline never crashes when Jina is unavailable
 *   2. The same image always gets the same vector (cacheable)
 *   3. Images with similar color distributions get slightly higher
 *      similarity (very rough proxy — NOT real visual similarity)
 *
 * For production-quality visual search, set JINA_API_KEY (free at jina.ai).
 */
function pseudoEmbedding(buffer: Buffer): JinaEmbeddingResult {
  const config = getImageSearchConfig()
  const dim = config.jina.dimension // 512 in fallback mode

  const embedding = new Array<number>(dim).fill(0)
  if (buffer.length === 0) {
    return { embedding, dimension: dim, source: 'fallback' }
  }

  // Mix 1: byte-value histogram (256 bins) normalized → first 256 dims
  // This captures the overall brightness/contrast distribution.
  const histogram = new Array<number>(256).fill(0)
  for (let i = 0; i < buffer.length; i++) {
    histogram[buffer[i]] += 1
  }
  const total = buffer.length
  for (let i = 0; i < 256 && i < dim; i++) {
    embedding[i] = histogram[i] / total
  }

  // Mix 2: hash-derived projection for the remaining dims.
  // Deterministic per-image so the same image → same vector (cacheable).
  let seed = 2166136261 // FNV offset
  for (let i = 0; i < buffer.length; i += 7) {
    seed ^= buffer[i]
    seed = Math.imul(seed, 16777619) >>> 0
  }
  const sampleCount = Math.min(buffer.length, 1024)
  for (let d = 256; d < dim; d++) {
    let sum = 0
    for (let s = 0; s < sampleCount; s++) {
      const byte = buffer[s % buffer.length]
      seed = (seed * 1103515245 + 12345) >>> 0
      const direction = ((seed % 1000) / 500) - 1
      sum += byte * direction
    }
    embedding[d] = sum / (sampleCount * 128)
  }

  // L2-normalize so cosine similarity = dot product
  let norm = 0
  for (let i = 0; i < dim; i++) norm += embedding[i] * embedding[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < dim; i++) embedding[i] /= norm

  return { embedding, dimension: dim, source: 'fallback' }
}

/**
 * Generate an embedding for a product IMAGE URL (used by the batch indexer).
 * Fetches the image, then reuses embedImageWithJina.
 */
export async function embedImageUrl(
  imageUrl: string,
): Promise<JinaEmbeddingResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(imageUrl, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = res.headers.get('content-type') || 'image/jpeg'
    return embedImageWithJina(buf, mime)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ImageSearch:Jina] could not fetch ${imageUrl}: ${msg}`)
    return pseudoEmbedding(Buffer.from(imageUrl, 'utf-8'))
  } finally {
    clearTimeout(timeout)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
