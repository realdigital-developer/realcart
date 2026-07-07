/**
 * Pinecone Vector Store.
 *
 * Queries the Pinecone index for the top-K most similar product vectors.
 * Returns product IDs + cosine similarity scores.
 *
 * When PINECONE_API_KEY / PINECONE_INDEX are not set, this layer returns an
 * empty array — the pipeline then falls back to FAISS (local) and/or
 * Algolia (metadata) results.
 *
 * The Pinecone index is populated by the batch indexing script
 * (scripts/index-products.ts). Each vector is stored with metadata:
 *   { productId, category, gender, color, brand, price, popularity, createdAt }
 *
 * No Z.ai tools are used — this uses the official @pinecone-database/pinecone
 * SDK with a dynamic import so it's only loaded when actually needed.
 */

import { PINECONE, HAS_PINECONE, DEBUG } from './config'
import type { VectorMatch, MergedAttributes } from './types'

/* ------------------------------------------------------------------ */
/*  Lazy SDK loader (keeps cold-start fast when Pinecone isn't used)   */
/* ------------------------------------------------------------------ */

let pineconeClient: any = null
let pineconeInitAttempted = false

async function getPinecone(): Promise<any | null> {
  if (pineconeInitAttempted) return pineconeClient
  pineconeInitAttempted = true
  if (!HAS_PINECONE) return null

  try {
    const { Pinecone } = await import('@pinecone-database/pinecone')
    pineconeClient = new Pinecone({ apiKey: PINECONE.apiKey })
    return pineconeClient
  } catch (err) {
    console.warn('[image-search] Pinecone SDK load failed:', (err as Error).message)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Build metadata filter from extracted attributes                    */
/*  Pinecone supports $eq, $in, $gte, $lte on metadata fields.        */
/* ------------------------------------------------------------------ */

function buildMetadataFilter(attrs: MergedAttributes): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {}

  if (attrs.category) {
    filter.category = { $in: [attrs.category, attrs.category.toLowerCase()] }
  }
  if (attrs.gender) {
    filter.gender = { $in: [attrs.gender, 'unisex'] }
  }
  if (attrs.color) {
    filter.color = { $in: [attrs.color, attrs.color.toLowerCase()] }
  }

  return Object.keys(filter).length > 0 ? filter : undefined
}

/* ------------------------------------------------------------------ */
/*  Query                                                              */
/* ------------------------------------------------------------------ */

export async function queryPinecone(
  vector: number[],
  topK: number,
  attrs: MergedAttributes,
): Promise<{ matches: VectorMatch[]; used: boolean }> {
  const client = await getPinecone()
  if (!client) {
    if (DEBUG) console.log('[image-search] Pinecone skipped (no API key)')
    return { matches: [], used: false }
  }

  try {
    const index = client.index(PINECONE.index).namespace(PINECONE.namespace)
    const filter = buildMetadataFilter(attrs)

    const result = await index.query({
      vector,
      topK,
      includeMetadata: false,
      includeValues: false,
      filter,
    })

    const matches: VectorMatch[] = (result?.matches || []).map((m: any) => ({
      productId: String(m.id),
      // Pinecone returns score in [0,1] for cosine; some plans return -1..1.
      // Clamp to [0,1] for the ranking engine.
      score: Math.max(0, Math.min(1, m.score ?? 0)),
    }))

    if (DEBUG) console.log(`[image-search] Pinecone returned ${matches.length} matches`)
    return { matches, used: true }
  } catch (err) {
    console.warn('[image-search] Pinecone query failed:', (err as Error).message)
    return { matches: [], used: false }
  }
}

/* ------------------------------------------------------------------ */
/*  Upsert (used by the indexing script)                               */
/* ------------------------------------------------------------------ */

export async function upsertToPinecone(
  vectors: Array<{
    id: string
    values: number[]
    metadata: Record<string, unknown>
  }>,
): Promise<boolean> {
  const client = await getPinecone()
  if (!client) return false

  try {
    const index = client.index(PINECONE.index).namespace(PINECONE.namespace)
    // Pinecone recommends upserting in batches of 100 max
    const batchSize = 100
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize)
      await index.upsert(batch)
    }
    return true
  } catch (err) {
    console.warn('[image-search] Pinecone upsert failed:', (err as Error).message)
    return false
  }
}

/** Delete all vectors in the namespace — used when re-indexing from scratch. */
export async function clearPineconeNamespace(): Promise<boolean> {
  const client = await getPinecone()
  if (!client) return false
  try {
    const index = client.index(PINECONE.index)
    await index.namespace(PINECONE.namespace).deleteAll()
    return true
  } catch (err) {
    console.warn('[image-search] Pinecone clear failed:', (err as Error).message)
    return false
  }
}
