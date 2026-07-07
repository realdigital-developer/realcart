/**
 * Provider: Algolia Metadata Filtering
 * ------------------------------------------------------------------
 * Uses Algolia to fetch a candidate set of product IDs matching the
 * extracted attributes (category, gender, color prioritized). This
 * candidate set is intersected with the vector-search results to
 * produce the final hybrid ranking.
 *
 * FALLBACK: When ALGOLIA_APP_ID/API_KEY is missing or the query fails,
 * we fall back to a MongoDB query on the products collection using the
 * same attribute filters. This keeps the pipeline working in the
 * sandbox without Algolia configured.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { getImageSearchConfig } from '../config'
import type { ImageAttributes } from '../types'

interface AlgoliaFilterResult {
  /** Product IDs matching the filters (unordered) */
  productIds: string[]
  available: boolean
  source: 'algolia' | 'fallback'
}

/** Lazy Algolia client holder. */
let algoliaClient: any = null
let algoliaIndex: any = null

async function getAlgoliaIndex(): Promise<any | null> {
  const config = getImageSearchConfig()
  if (!config.algolia.available) return null

  if (algoliaIndex) return algoliaIndex

  try {
    const { algoliasearch } = await import('algoliasearch')
    algoliaClient = algoliasearch(config.algolia.appId!, config.algolia.apiKey!)
    algoliaIndex = algoliaClient.initIndex(config.algolia.indexName)
    return algoliaIndex
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ImageSearch:Algolia] init failed: ${msg}`)
    return null
  }
}

/**
 * Query Algolia for product IDs matching the extracted attributes.
 *
 * Filter priority (per task spec):
 *   1. category  (exact)
 *   2. gender    (exact)
 *   3. color     (exact)
 * Plus a free-text search using clothingType + material + pattern.
 *
 * Returns up to `limit` IDs. If Algolia is unavailable, falls back to MongoDB.
 */
export async function filterByAttributes(
  attrs: ImageAttributes,
  limit: number,
): Promise<AlgoliaFilterResult> {
  const config = getImageSearchConfig()
  if (!config.algolia.available) {
    return mongoFallback(attrs, limit)
  }

  const index = await getAlgoliaIndex()
  if (!index) {
    return mongoFallback(attrs, limit)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)

  try {
    // Build Algolia facetFilters — prioritized category > gender > color
    const facetFilters: string[] = []
    if (attrs.category) facetFilters.push(`category:${attrs.category}`)
    if (attrs.gender) facetFilters.push(`gender:${attrs.gender}`)
    if (attrs.color) facetFilters.push(`color:${attrs.color}`)

    // Free-text query from secondary attributes
    const queryParts = [attrs.clothingType, attrs.material, attrs.pattern]
      .filter(Boolean)
      .join(' ')

    const result = await index.search({
      query: queryParts || '',
      hitsPerPage: limit,
      filters: facetFilters.length > 0 ? facetFilters.join(' AND ') : undefined,
      attributesToRetrieve: ['objectID'],
    })

    const ids = (result?.hits ?? [])
      .map((h: any) => String(h.objectID))
      .filter(Boolean)

    return { productIds: ids, available: true, source: 'algolia' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted')) {
      console.warn('[ImageSearch:Algolia] query timed out')
    } else {
      console.warn(`[ImageSearch:Algolia] query error: ${msg}`)
    }
    return mongoFallback(attrs, limit)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Save a product to Algolia (used by the batch indexer).
 */
export async function upsertAlgoliaObject(
  obj: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  const config = getImageSearchConfig()
  if (!config.algolia.available) return { ok: false }

  const index = await getAlgoliaIndex()
  if (!index) return { ok: false }

  try {
    await index.saveObject({ ...obj, objectID: obj.objectID })
    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ImageSearch:Algolia] upsert error: ${msg}`)
    return { ok: false }
  }
}

/* ------------------------------------------------------------------ */
/*  MongoDB Fallback                                                    */
/* ------------------------------------------------------------------ */

/**
 * MongoDB-based attribute filtering — used when Algolia is unavailable.
 *
 * Builds a case-insensitive regex query against the products collection
 * using category/gender/color (inferred from category name patterns).
 * Returns up to `limit` product ObjectIds as strings.
 */
async function mongoFallback(
  attrs: ImageAttributes,
  limit: number,
): Promise<AlgoliaFilterResult> {
  try {
    const { db } = await connectToDatabase()

    // Base filter — only Published + Active products
    const query: Record<string, unknown> = { status: 'Published', active: true }

    // Category filter — case-insensitive regex
    if (attrs.category) {
      const escaped = attrs.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.$or = [
        { category: { $regex: escaped, $options: 'i' } },
        { subcategory: { $regex: escaped, $options: 'i' } },
        { tags: { $in: [new RegExp(escaped, 'i')] } },
      ]
    }

    // Gender filter — check name/tags/description/category for gender keywords.
    // Uses the full keyword map so "women" also matches "ladies", "female", etc.
    if (attrs.gender) {
      const genderMap: Record<string, string[]> = {
        men: ['men', "men's", 'male', 'boy'],
        women: ['women', "women's", 'female', 'girl', 'ladies', 'lady'],
        kids: ['kid', 'child', 'boy', 'girl', 'junior'],
        unisex: ['unisex', 'neutral'],
      }
      const keywords = genderMap[attrs.gender] || [attrs.gender]
      const genderRegexes = keywords.map((kw) => new RegExp(`\\b${kw}\\b`, 'i'))
      const existingOr = query.$or
      const genderCond = {
        $or: [
          { name: { $in: genderRegexes } },
          { tags: { $in: genderRegexes } },
          { description: { $in: genderRegexes } },
          { category: { $in: genderRegexes } },
        ],
      }
      if (existingOr) {
        delete query.$or
        query.$and = [{ $or: existingOr }, genderCond]
      } else {
        Object.assign(query, genderCond)
      }
    }

    // Color filter — check name/tags/description for the color keyword
    if (attrs.color) {
      const escapedColor = attrs.color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const colorRe = new RegExp(`\\b${escapedColor}\\b`, 'i')
      const colorCond = {
        $or: [
          { name: { $regex: colorRe } },
          { tags: { $in: [colorRe] } },
          // Use string + $options here (not a RegExp object) because
          // MongoDB rejects { $regex: RegExp, $options: 'i' } — can't
          // have options when $regex is already a RegExp with its flags.
          { 'variants.attributes.Color': { $regex: escapedColor, $options: 'i' } },
        ],
      }
      if (query.$and) {
        query.$and.push(colorCond)
      } else if (query.$or) {
        const existing = query.$or
        delete query.$or
        query.$and = [{ $or: existing }, colorCond]
      } else {
        Object.assign(query, colorCond)
      }
    }

    const docs = await db
      .collection('products')
      .find(query)
      .limit(limit)
      .project({ _id: 1 })
      .toArray()

    const ids = docs.map((d) => d._id.toString())
    return { productIds: ids, available: ids.length > 0, source: 'fallback' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ImageSearch:Algolia-fallback] mongo query error: ${msg}`)
    return { productIds: [], available: false, source: 'fallback' }
  }
}
