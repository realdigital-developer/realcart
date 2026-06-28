/**
 * processImage() — the main image-search pipeline orchestrator.
 *
 * Stages:
 *   A. Vision Analysis (Groq)  → gender, category, color, style, ageGroup
 *   B. Fashion Attributes      → clothingType, material, pattern, sleeveType
 *   C. Merge & Normalize       → single MergedAttributes object
 *   D. Embedding (Jina)        → 1024-dim vector
 *   E. Vector Search           → Pinecone (primary) + FAISS (fallback)
 *   F. Algolia Filter          → attribute-matched product IDs
 *   G. Hybrid Ranking          → weighted final score per product
 *
 * The result includes the ranked product IDs + the extracted attributes
 * (for display in the UI) + which providers were actually used.
 *
 * Caching: the entire pipeline result is cached by the image content hash,
 * so identical images return instantly for PIPELINE.cacheTtlMs (default 5 min).
 */

import { connectToDatabase } from '@/lib/mongodb'
import { PIPELINE, DEBUG } from './config'
import { cacheGet, cacheSet, hashImage } from './cache'
import { analyzeWithGroq } from './groq-vision'
import { analyzeWithXimilar } from './ximilar-attributes'
import { embedWithJina } from './jina-embedding'
import { queryPinecone } from './pinecone-vector-store'
import { queryFaiss } from './faiss-vector-store'
import { queryAlgolia } from './algolia-search'
import { hybridRank } from './ranking-engine'
import { mergeAttributes, buildTextQuery } from './attribute-merger'
import type {
  ProcessImageResult,
  MergedAttributes,
  ProductRankingMeta,
  RankedProduct,
} from './types'

/* ------------------------------------------------------------------ */
/*  Fetch product metadata for the candidate IDs from MongoDB          */
/*  We need price, popularity, createdAt, etc. for the ranking engine. */
/* ------------------------------------------------------------------ */

async function fetchProductMetadata(productIds: string[]): Promise<Map<string, ProductRankingMeta>> {
  const map = new Map<string, ProductRankingMeta>()
  if (productIds.length === 0) return map

  try {
    const { ObjectId } = await import('mongodb')
    const { db } = await connectToDatabase()

    const objectIds = productIds
      .map(id => { try { return new ObjectId(id) } catch { return null } })
      .filter((x): x is InstanceType<typeof ObjectId> => x !== null)

    if (objectIds.length === 0) return map

    const docs = await db.collection('products')
      .find({ _id: { $in: objectIds } }, {
        projection: {
          category: 1, subcategory: 1, brand: 1, tags: 1,
          sellingPrice: 1, mrp: 1, totalSold: 1, viewCount: 1,
          avgRating: 1, totalReviews: 1, createdAt: 1,
        },
      })
      .toArray()

    // Also fetch indexed attributes from the product_embeddings collection
    // (these were extracted during indexing and include color/gender/popularityScore)
    const embeddings = await db.collection('product_embeddings')
      .find({ productId: { $in: productIds } }, {
        projection: { productId: 1, attributes: 1, popularityScore: 1 },
      })
      .toArray()

    const embMap = new Map<string, any>()
    for (const e of embeddings) embMap.set(String(e.productId), e)

    for (const doc of docs) {
      const id = doc._id.toString()
      const emb = embMap.get(id)
      map.set(id, {
        _id: id,
        category: doc.category || '',
        subcategory: doc.subcategory || '',
        brand: doc.brand || '',
        tags: doc.tags || [],
        sellingPrice: doc.sellingPrice || 0,
        mrp: doc.mrp || 0,
        totalSold: doc.totalSold || 0,
        viewCount: doc.viewCount || 0,
        avgRating: doc.avgRating || 0,
        totalReviews: doc.totalReviews || 0,
        createdAt: doc.createdAt || new Date().toISOString(),
        popularityScore: emb?.popularityScore,
        color: emb?.attributes?.color,
        gender: emb?.attributes?.gender,
      })
    }
  } catch (err) {
    console.warn('[image-search] fetchProductMetadata failed:', (err as Error).message)
  }

  return map
}

/* ------------------------------------------------------------------ */
/*  Last-resort text search fallback                                   */
/*  If both vector and Algolia return nothing, use the extracted       */
/*  attributes as a text query against MongoDB.                        */
/* ------------------------------------------------------------------ */

async function textSearchFallback(attrs: MergedAttributes, topK: number): Promise<string[]> {
  const query = buildTextQuery(attrs)
  if (!query) return []

  try {
    const { db } = await connectToDatabase()
    const docs = await db.collection('products')
      .find(
        {
          status: 'Published',
          active: true,
          $text: { $search: query },
        },
        { projection: { _id: 1, score: { $meta: 'textScore' } } },
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(topK)
      .toArray()

    return docs.map(d => d._id.toString())
  } catch (err) {
    console.warn('[image-search] text fallback failed:', (err as Error).message)
    return []
  }
}

/* ------------------------------------------------------------------ */
/*  Main pipeline                                                      */
/* ------------------------------------------------------------------ */

export async function processImage(buffer: Buffer, mimeType: string): Promise<ProcessImageResult> {
  const startTime = Date.now()
  const cacheKey = `imgsearch:${hashImage(buffer)}`

  // ── Check cache ──
  const cached = await cacheGet<ProcessImageResult>(cacheKey)
  if (cached) {
    if (DEBUG) console.log(`[image-search] Cache HIT (key=${cacheKey.slice(0, 24)}...)`)
    return cached
  }

  // ── Stage A: Groq Vision ──
  const visionAttrs = await analyzeWithGroq(buffer, mimeType)

  // ── Stage B: Ximilar Fashion ──
  const fashionAttrs = await analyzeWithXimilar(buffer, mimeType)

  // ── Stage C: Merge & Normalize ──
  const merged = mergeAttributes(visionAttrs, fashionAttrs)
  if (DEBUG) console.log('[image-search] Merged attributes:', JSON.stringify(merged))

  // ── Stage D: Jina Embedding ──
  const embedding = await embedWithJina(buffer, mimeType)

  // ── Stage E: Vector Search (Pinecone primary, FAISS fallback) ──
  const topK = PIPELINE.topK
  const pineconeResult = await queryPinecone(embedding, topK, merged)

  let vectorMatches = pineconeResult.matches
  let faissUsed = false

  // If Pinecone returned too few results, supplement with FAISS
  if (vectorMatches.length < topK / 2) {
    const faissResult = await queryFaiss(embedding, topK)
    faissUsed = faissResult.used
    // Merge FAISS results, avoiding duplicates
    const seen = new Set(vectorMatches.map(m => m.productId))
    for (const m of faissResult.matches) {
      if (!seen.has(m.productId)) {
        vectorMatches.push(m)
        seen.add(m.productId)
      }
    }
  } else if (!pineconeResult.used) {
    // Pinecone wasn't available at all — use FAISS as the sole vector source
    const faissResult = await queryFaiss(embedding, topK)
    faissUsed = faissResult.used
    vectorMatches = faissResult.matches
  }

  // ── Stage F: Algolia filter search ──
  const algoliaResult = await queryAlgolia(merged, topK)

  // ── Last-resort text fallback (only if both vector & algolia are empty) ──
  if (vectorMatches.length === 0 && algoliaResult.matches.length === 0) {
    if (DEBUG) console.log('[image-search] No vector/algolia matches — trying text fallback')
    const fallbackIds = await textSearchFallback(merged, topK)
    // Treat these as low-confidence vector matches (score 0.1)
    vectorMatches = fallbackIds.map(id => ({ productId: id, score: 0.1 }))
  }

  // ── Collect all candidate IDs ──
  const candidateIds = new Set<string>()
  for (const m of vectorMatches) candidateIds.add(m.productId)
  for (const m of algoliaResult.matches) candidateIds.add(m.productId)

  // ── Fetch metadata for all candidates ──
  const products = await fetchProductMetadata(Array.from(candidateIds))

  // ── Stage G: Hybrid Ranking ──
  const ranked: RankedProduct[] = hybridRank({
    vectorMatches,
    algoliaMatches: algoliaResult.matches,
    products,
    queryAttributes: merged,
  })

  // Limit to max results
  const topRanked = ranked.slice(0, PIPELINE.maxResults)
  const rankedProductIds = topRanked.map(r => r.productId)

  const result: ProcessImageResult = {
    attributes: merged,
    embedding,
    rankedProductIds,
    rankedProducts: topRanked,
    providersUsed: {
      groq: visionAttrs.color !== null || visionAttrs.category !== null,
      ximilar: fashionAttrs.clothingType !== null || fashionAttrs.material !== null,
      jina: true, // embedding is always produced (real or fallback)
      pinecone: pineconeResult.used,
      faiss: faissUsed,
      algolia: algoliaResult.used,
    },
    durationMs: Date.now() - startTime,
  }

  if (DEBUG) {
    console.log(`[image-search] Pipeline complete in ${result.durationMs}ms — ${topRanked.length} results`)
    console.log('[image-search] Providers used:', JSON.stringify(result.providersUsed))
  }

  // ── Cache the result ──
  await cacheSet(cacheKey, result, PIPELINE.cacheTtlMs)

  return result
}
