/**
 * Provider: Pinecone Vector Search
 * ------------------------------------------------------------------
 * Queries the Pinecone index for the top-K nearest product embeddings.
 *
 * FALLBACK: When PINECONE_API_KEY is missing or the query fails, returns
 * an empty array. The pipeline then falls back to the in-memory FAISS-flat
 * index (which loads embeddings from MongoDB).
 *
 * The Pinecone client is lazily instantiated (and only when configured)
 * so importing this module never crashes in the sandbox without keys.
 */

import { getImageSearchConfig } from '../config'
import type { VectorMatch } from '../types'

/** Lazy Pinecone client holder — avoids requiring the SDK when unconfigured. */
let pineconeClient: any = null
let pineconeIndex: any = null
let initPromise: Promise<any> | null = null

async function getIndex(): Promise<any | null> {
  const config = getImageSearchConfig()
  if (!config.pinecone.available) return null

  if (pineconeIndex) return pineconeIndex
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      // Dynamic import so the SDK is only loaded when actually needed.
      // This keeps cold-start fast in the sandbox without Pinecone configured.
      const { Pinecone } = await import('@pinecone-database/pinecone')
      pineconeClient = new Pinecone({ apiKey: config.pinecone.apiKey! })
      pineconeIndex = pineconeClient.index(config.pinecone.indexName)
      return pineconeIndex
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[ImageSearch:Pinecone] init failed: ${msg}`)
      return null
    }
  })()

  return initPromise
}

/**
 * Query Pinecone for the top-K nearest product embeddings.
 * Returns cosine-similarity scores in [0, 1].
 */
export async function queryPinecone(
  embedding: number[],
  topK: number,
): Promise<{ matches: VectorMatch[]; available: boolean }> {
  const config = getImageSearchConfig()
  if (!config.pinecone.available) {
    return { matches: [], available: false }
  }

  const index = await getIndex()
  if (!index) {
    return { matches: [], available: false }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const result = await index.query({
      vector: embedding,
      topK,
      includeMetadata: false,
      // We don't filter by namespace — all products live in the default ns.
    })

    const matches: VectorMatch[] = (result?.matches ?? []).map((m: any) => ({
      productId: String(m.id),
      // Pinecone returns scores that depend on the index metric. For
      // cosine, scores are already in [-1, 1]; we clip to [0, 1].
      score: clamp01(Number(m.score ?? 0)),
      source: 'pinecone' as const,
    }))

    return { matches, available: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted')) {
      console.warn('[ImageSearch:Pinecone] query timed out')
    } else {
      console.warn(`[ImageSearch:Pinecone] query error: ${msg}`)
    }
    return { matches: [], available: false }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Upsert product embeddings into Pinecone (used by the batch indexer).
 */
export async function upsertPinecone(
  vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>,
): Promise<{ ok: boolean; upserted: number }> {
  const config = getImageSearchConfig()
  if (!config.pinecone.available || vectors.length === 0) {
    return { ok: false, upserted: 0 }
  }

  const index = await getIndex()
  if (!index) return { ok: false, upserted: 0 }

  try {
    await index.upsert(vectors)
    return { ok: true, upserted: vectors.length }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ImageSearch:Pinecone] upsert error: ${msg}`)
    return { ok: false, upserted: 0 }
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}
