/**
 * Algolia Metadata Search.
 *
 * Uses Algolia to find products that match the extracted attributes
 * (category, gender, color). Algolia is excellent at faceted filtering
 * and typo-tolerant text search, so it complements the vector search:
 *
 *   - Vector search (Pinecone/FAISS) finds visually similar products.
 *   - Algolia search finds products matching the detected attributes,
 *     even if their visual features differ.
 *
 * The hybrid ranking engine then merges both result sets.
 *
 * When ALGOLIA_APP_ID / ALGOLIA_ADMIN_KEY are not set, this layer falls back
 * to a MongoDB query using the same attribute filters — so the pipeline
 * still returns attribute-matched results.
 *
 * The Algolia index is populated by the batch indexing script
 * (scripts/index-products.ts).
 *
 * No Z.ai tools are used — this uses the official `algoliasearch` SDK
 * with a dynamic import.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { ALGOLIA, HAS_ALGOLIA, DEBUG } from './config'
import { normalizeColor } from './color-utils'
import type { AlgoliaMatch, MergedAttributes } from './types'

/* ------------------------------------------------------------------ */
/*  Lazy SDK loader                                                    */
/* ------------------------------------------------------------------ */

let algoliaClient: any = null
let algoliaInitAttempted = false

async function getAlgolia(): Promise<any | null> {
  if (algoliaInitAttempted) return algoliaClient
  algoliaInitAttempted = true
  if (!HAS_ALGOLIA) return null

  try {
    const { algoliasearch } = await import('algoliasearch')
    algoliaClient = algoliasearch(ALGOLIA.appId, ALGOLIA.adminKey)
    return algoliaClient
  } catch (err) {
    console.warn('[image-search] Algolia SDK load failed:', (err as Error).message)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Build Algolia filter expression from extracted attributes          */
/*  Algolia uses a string-based filter syntax:                         */
/*    "category:Shirts AND gender:men AND color:red"                  */
/* ------------------------------------------------------------------ */

function escapeAlgoliaValue(v: string): string {
  // Algolia requires values to be quoted if they contain spaces or special chars
  const clean = v.replace(/"/g, '\\"')
  return `"${clean}"`
}

function buildAlgoliaFilter(attrs: MergedAttributes): string | undefined {
  const parts: string[] = []

  if (attrs.category) {
    parts.push(`category:${escapeAlgoliaValue(attrs.category)}`)
  }
  if (attrs.gender && attrs.gender !== 'unisex') {
    // Match either the specific gender OR unisex
    parts.push(`(gender:${escapeAlgoliaValue(attrs.gender)} OR gender:"unisex")`)
  }
  if (attrs.color) {
    const normalized = normalizeColor(attrs.color)
    if (normalized) {
      parts.push(`color:${escapeAlgoliaValue(normalized)}`)
    }
  }

  return parts.length > 0 ? parts.join(' AND ') : undefined
}

/* ------------------------------------------------------------------ */
/*  Algolia query                                                      */
/* ------------------------------------------------------------------ */

async function queryAlgoliaIndex(
  attrs: MergedAttributes,
  topK: number,
): Promise<{ matches: AlgoliaMatch[]; used: boolean }> {
  const client = await getAlgolia()
  if (!client) {
    if (DEBUG) console.log('[image-search] Algolia skipped (no API key) — using MongoDB fallback')
    return mongoFallback(attrs, topK)
  }

  try {
    const filter = buildAlgoliaFilter(attrs)
    const result = await client.searchSingleIndex({
      indexName: ALGOLIA.indexName,
      searchParams: {
        query: attrs.description || attrs.category || '',
        hitsPerPage: topK,
        filters: filter,
        attributesToRetrieve: ['objectID', 'category', 'gender', 'color'],
      },
    })

    const matches: AlgoliaMatch[] = (result?.hits || []).map((hit: any) => ({
      productId: String(hit.objectID),
      // Algolia doesn't return a match score directly; use 1.0 for all hits
      // and let the attribute-match scorer compute the real ratio from metadata.
      matchRatio: 1.0,
    }))

    if (DEBUG) console.log(`[image-search] Algolia returned ${matches.length} matches (filter: ${filter || 'none'})`)
    return { matches, used: true }
  } catch (err) {
    console.warn('[image-search] Algolia query failed, using MongoDB fallback:', (err as Error).message)
    return mongoFallback(attrs, topK)
  }
}

/* ------------------------------------------------------------------ */
/*  MongoDB fallback (used when Algolia isn't configured or fails)     */
/* ------------------------------------------------------------------ */

async function mongoFallback(
  attrs: MergedAttributes,
  topK: number,
): Promise<{ matches: AlgoliaMatch[]; used: boolean }> {
  try {
    const { db } = await connectToDatabase()

    // Build a MongoDB query mirroring the Algolia filter
    const query: Record<string, unknown> = { status: 'Published', active: true }
    const orParts: Record<string, unknown>[] = []

    if (attrs.category) {
      // Case-insensitive category match
      orParts.push({ category: { $regex: `^${escapeRegex(attrs.category)}$`, $options: 'i' } })
      orParts.push({ subcategory: { $regex: `^${escapeRegex(attrs.category)}$`, $options: 'i' } })
      orParts.push({ tags: { $in: [new RegExp(escapeRegex(attrs.category), 'i')] } })
    }
    if (attrs.gender && attrs.gender !== 'unisex') {
      // Match gender in tags/highlights OR unisex items
      orParts.push({ tags: { $in: [new RegExp(escapeRegex(attrs.gender), 'i')] } })
      orParts.push({ highlights: { $in: [new RegExp(escapeRegex(attrs.gender), 'i')] } })
    }
    if (attrs.color) {
      const normalized = normalizeColor(attrs.color)
      if (normalized) {
        orParts.push({ tags: { $in: [new RegExp(escapeRegex(normalized), 'i')] } })
        orParts.push({ highlights: { $in: [new RegExp(escapeRegex(normalized), 'i')] } })
      }
    }

    if (orParts.length > 0) {
      query.$or = orParts
    } else {
      // No attributes → return empty so we don't dump the whole catalog
      return { matches: [], used: false }
    }

    const docs = await db.collection('products')
      .find(query, { projection: { _id: 1, category: 1, tags: 1, highlights: 1 } })
      .limit(topK)
      .toArray()

    const matches: AlgoliaMatch[] = docs.map(d => ({
      productId: d._id.toString(),
      matchRatio: 1.0,
    }))

    if (DEBUG) console.log(`[image-search] MongoDB fallback returned ${matches.length} matches`)
    return { matches, used: false } // `used: false` because Algolia wasn't actually used
  } catch (err) {
    console.warn('[image-search] MongoDB fallback failed:', (err as Error).message)
    return { matches: [], used: false }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function queryAlgolia(
  attrs: MergedAttributes,
  topK: number,
): Promise<{ matches: AlgoliaMatch[]; used: boolean }> {
  return queryAlgoliaIndex(attrs, topK)
}

/* ------------------------------------------------------------------ */
/*  Upsert (used by the indexing script)                               */
/* ------------------------------------------------------------------ */

export async function upsertToAlgolia(
  objects: Array<Record<string, unknown> & { objectID: string }>,
): Promise<boolean> {
  const client = await getAlgolia()
  if (!client) return false

  try {
    await client.partialUpdateObjects({
      indexName: ALGOLIA.indexName,
      objects,
      createIfNotExists: true,
    })
    return true
  } catch (err) {
    console.warn('[image-search] Algolia upsert failed:', (err as Error).message)
    return false
  }
}

/** Clear the Algolia index — used when re-indexing from scratch. */
export async function clearAlgoliaIndex(): Promise<boolean> {
  const client = await getAlgolia()
  if (!client) return false
  try {
    await client.clearObjects({ indexName: ALGOLIA.indexName })
    return true
  } catch (err) {
    console.warn('[image-search] Algolia clear failed:', (err as Error).message)
    return false
  }
}
