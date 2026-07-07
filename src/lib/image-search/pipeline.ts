/**
 * Image Search — Pipeline Orchestrator
 * ------------------------------------------------------------------
 * The main `processImage()` function that runs the full hybrid pipeline:
 *
 *   image  →  Groq (vision)  ┐
 *                             ├→  merge attributes  →  Jina (embedding)
 *   image  →  Ximilar (attr) ┘                         ↓
 *                                       Pinecone (vector) ──→ topK matches
 *                                                  ↘ (fallback) FAISS-flat
 *                          Algolia (attribute filter) ──→ candidate IDs
 *                                                  ↘ (fallback) MongoDB attr query
 *                          Hybrid Ranking Engine ──→ sorted products
 *
 * IMPROVEMENTS over the original:
 *   1. AUTO-INDEXING: If the product_embeddings collection is empty (fresh
 *      deployment), the pipeline kicks off a background indexing job for
 *      the first batch so subsequent searches have real vectors to match.
 *   2. REAL-TIME ATTRIBUTE QUERY: Even when vector search returns nothing,
 *      the pipeline runs a MongoDB query using the Groq-extracted attributes
 *      (category, color, gender) to find matching products. This means
 *      accurate results from the FIRST search, before any indexing.
 *   3. LIVE ATTRIBUTE MATCHING: The ranker now matches query attributes
 *      against BOTH stored embeddings AND the live product's category/
 *      subcategory/tags/name (parsed for color keywords). This means
 *      products that haven't been indexed still get accurate attribute
 *      scores based on their catalog data.
 *   4. SMARTER FALLBACK: When all signals fail, returns products from the
 *      SAME category as the detected image category (not just "recent").
 *
 * Every provider has a graceful fallback so the pipeline ALWAYS returns
 * results.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { productToListItem } from '@/lib/product-utils'
import type { ProductListItem } from '@/lib/product-types'
import type {
  ImageAttributes,
  ImageSearchResponse,
  StoredProductEmbedding,
  VectorMatch,
} from './types'
import { getImageSearchConfig } from './config'
import { mergeAttributes, normalizeAttributes } from './normalize'
import { analyzeWithGroq, groqToAttributes } from './providers/groq-vision'
import { analyzeWithXimilar, ximilarToAttributes } from './providers/ximilar-attributes'
import { embedImageWithJina } from './providers/jina-embedding'
import { analyzeImageColors, localColorToAttributes } from './providers/local-color'
import { queryPinecone } from './providers/pinecone-vector'
import { queryFlatIndex } from './providers/faiss-flat'
import { filterByAttributes } from './providers/algolia-search'
import { rankProducts } from './ranking'
import { computeImageHash } from './perceptual-hash'
import { getCachedSearch, setCachedSearch } from './cache'

/**
 * Run the full image-search pipeline on an uploaded image buffer.
 */
export async function processImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ImageSearchResponse> {
  const startTime = Date.now()
  const config = getImageSearchConfig()

  // ── Cache check (content-addressed) ──
  const cached = getCachedSearch(imageBuffer)
  if (cached) {
    const products = await fetchProductsByIds(cached.productIds)
    return {
      products,
      total: products.length,
      providers: cached.providers,
      attributes: cached.attributes,
      durationMs: Date.now() - startTime,
      cached: true,
      rankedHits: undefined,
    }
  }

  // ── Step A+B+C+D: Vision analysis + local color + pHash (all in parallel) ──
  // The perceptual hash is computed for exact-match/near-duplicate detection
  // (Tier 1 & 2 of the Meesho Golden Rule). It's fast (<100ms with sharp).
  const [groqResult, ximilarResult, localColorResult, queryImageHash] = await Promise.all([
    analyzeWithGroq(imageBuffer, mimeType),
    analyzeWithXimilar(imageBuffer, mimeType),
    analyzeImageColors(imageBuffer),
    computeImageHash(imageBuffer),
  ])

  // ── Merge + normalize attributes ──
  // Merge Groq + Ximilar first (the authoritative providers).
  // If the merged result has NO color (e.g., Groq was unavailable or
  // couldn't detect color), fall back to the local color analysis.
  const merged = mergeAttributes(
    groqToAttributes(groqResult.result),
    ximilarToAttributes(ximilarResult.result),
  )
  // Fill in missing color from local analysis
  if (!merged.color && localColorResult.color) {
    merged.color = localColorResult.color
  }
  const attributes = normalizeAttributes(merged)

  // ── Step D: Generate embedding (Jina) ──
  // Run in parallel with the attribute-based product query so we don't
  // block on Jina if it's slow.
  const embeddingPromise = embedImageWithJina(imageBuffer, mimeType)

  // ── Step E: Attribute-based product query (runs in parallel with Jina) ──
  // This queries MongoDB DIRECTLY using the extracted attributes. It gives
  // us accurate results even when:
  //   - Vector search is empty (no embeddings indexed yet)
  //   - Jina/Pinecone are unavailable (no API keys)
  // This is the KEY fix for "results not as good as Meesho" — we now use
  // the vision-extracted attributes to find matching products in real time.
  const attributeQueryPromise = queryProductsByAttributes(attributes, config.topK)

  const [embeddingResult, attributeQueryResult] = await Promise.all([
    embeddingPromise,
    attributeQueryPromise,
  ])

  // ── Step F: Vector search — Pinecone primary, FAISS-flat fallback ──
  let vectorMatches: VectorMatch[] = []
  let vectorSource: 'pinecone' | 'faiss' | 'fallback' = 'fallback'

  const pineconeResult = await queryPinecone(embeddingResult.embedding, config.topK)
  if (pineconeResult.available && pineconeResult.matches.length > 0) {
    vectorMatches = pineconeResult.matches
    vectorSource = 'pinecone'
  } else {
    const flatResult = await queryFlatIndex(embeddingResult.embedding, config.topK)
    if (flatResult.available && flatResult.matches.length > 0) {
      vectorMatches = flatResult.matches
      vectorSource = 'faiss'
    }
  }

  // ── Step G: Merge attribute-filter results ──
  // filterByAttributes (Algolia/MongoDB) + attributeQueryResult (direct
  // MongoDB query) — combine both ID sets.
  const filterResult = await filterByAttributes(attributes, config.topK)
  const filteredIds = new Set<string>([
    ...filterResult.productIds,
    ...attributeQueryResult.productIds,
  ])
  const filterSource: 'algolia' | 'fallback' = filterResult.source

  // ── Step H: Resolve candidate IDs to full products ──
  const candidateIds = new Set<string>([
    ...vectorMatches.map((m) => m.productId),
    ...filteredIds,
  ])

  let productsById: Map<string, ProductListItem>
  let embeddingsById: Map<string, StoredProductEmbedding>
  if (candidateIds.size === 0) {
    // Ultimate fallback: if we detected a category, get products from it;
    // otherwise return recent products. This is the "graceful degradation"
    // path — still returns relevant-ish products.
    const fallback = await fetchFallbackProducts(40, attributes.category, attributes.gender)
    productsById = new Map(fallback.map((p) => [p._id, p]))
    embeddingsById = new Map()
  } else {
    const products = await fetchProductsByIds([...candidateIds])
    productsById = new Map(products.map((p) => [p._id, p]))
    embeddingsById = await fetchEmbeddings([...candidateIds])
  }

  // ── Step I: Hybrid ranking ──
  // Pass embeddingIsReal so the ranker knows whether to trust vector
  // similarity scores. When the embedding is a pseudo-embedding (Jina
  // failed/unavailable), vector scores are meaningless and the ranker
  // switches to attribute-only mode (70% attributeMatch weight).
  const ranked = rankProducts({
    vectorMatches,
    filteredIds,
    productsById,
    embeddingsById,
    queryAttributes: attributes,
    embeddingIsReal: embeddingResult.source === 'jina',
    queryImageHash,
  })

  const products = ranked.map((h) => h.product)

  // Include ranked hits in the response for debugging (the API route
  // only exposes this when ?debug=1 is passed)
  const rankedHits = ranked.map((h) => ({
    product: h.product,
    finalScore: h.finalScore,
    vectorSimilarity: h.vectorSimilarity,
    attributeMatch: h.attributeMatch,
    popularityScore: h.popularityScore,
    priceScore: h.priceScore,
    recencyScore: h.recencyScore,
    genderMultiplier: h.genderMultiplier,
    categoryMultiplier: h.categoryMultiplier,
    useVector: h.useVector,
    matchTier: h.matchTier,
    inventoryScore: h.inventoryScore,
    hashDistance: h.hashDistance,
  }))

  // ── Step J: Auto-index trigger (background, non-blocking) ──
  // If the embeddings collection is empty AND we have API keys configured,
  // kick off a background indexing job so future searches get real vector
  // matching. We don't await this — it runs in the background.
  maybeTriggerAutoIndexing().catch((err) => {
    console.warn('[ImageSearch] auto-indexing trigger failed:', err)
  })

  // ── Cache the result ──
  setCachedSearch(imageBuffer, {
    productIds: products.map((p) => p._id),
    attributes,
    providers: {
      vision: groqResult.source,
      attributes: ximilarResult.source,
      embedding: embeddingResult.source,
      vector: vectorSource,
      filter: filterSource,
    },
    durationMs: Date.now() - startTime,
  })

  return {
    products,
    total: products.length,
    providers: {
      vision: groqResult.source,
      attributes: ximilarResult.source,
      embedding: embeddingResult.source,
      vector: vectorSource,
      filter: filterSource,
    },
    attributes,
    durationMs: Date.now() - startTime,
    cached: false,
    rankedHits,
  }
}

/* ------------------------------------------------------------------ */
/*  Direct attribute-based product query (NEW — key accuracy fix)      */
/* ------------------------------------------------------------------ */

/**
 * Query MongoDB directly for products matching the extracted attributes.
 *
 * This is the REAL-TIME attribute matching that gives Meesho-quality
 * results from the very first search, BEFORE any product embeddings are
 * indexed. It uses:
 *   - category (exact, case-insensitive) — highest priority
 *   - gender (from product name/tags/description)
 *   - color (from product name/tags/variant attributes)
 *
 * Returns product IDs matching ALL available attributes (AND logic when
 * multiple attributes are present, OR fallback to category-only if the
 * AND query returns too few results).
 */
async function queryProductsByAttributes(
  attrs: ImageAttributes,
  limit: number,
): Promise<{ productIds: string[]; available: boolean }> {
  // If we have NO attributes at all, skip this — it would return ALL products.
  if (!attrs.category && !attrs.gender && !attrs.color) {
    return { productIds: [], available: false }
  }

  try {
    const { db } = await connectToDatabase()
    const baseFilter = { status: 'Published', active: true }

    // ── Build the category filter (case-insensitive regex) ──
    let categoryQuery: Record<string, unknown> | null = null
    if (attrs.category) {
      const escaped = attrs.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      categoryQuery = {
        $or: [
          { category: { $regex: escaped, $options: 'i' } },
          { subcategory: { $regex: escaped, $options: 'i' } },
          { tags: { $in: [new RegExp(escaped, 'i')] } },
          { name: { $regex: escaped, $options: 'i' } },
        ],
      }
    }

    // ── Build the gender filter ──
    let genderQuery: Record<string, unknown> | null = null
    if (attrs.gender) {
      const genderMap: Record<string, string[]> = {
        men: ['men', "men's", 'male', 'boy'],
        women: ['women', "women's", 'female', 'girl', 'ladies', 'lady'],
        kids: ['kid', 'child', 'boy', 'girl', 'junior'],
        unisex: ['unisex', 'neutral'],
      }
      const keywords = genderMap[attrs.gender] || [attrs.gender]
      const genderRegex = keywords.map((kw) => new RegExp(`\\b${kw}\\b`, 'i'))
      genderQuery = {
        $or: [
          { name: { $in: genderRegex } },
          { tags: { $in: genderRegex } },
          { description: { $in: genderRegex } },
          { category: { $in: genderRegex } },
        ],
      }
    }

    // ── Build the color filter ──
    let colorQuery: Record<string, unknown> | null = null
    if (attrs.color) {
      const escaped = attrs.color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const colorRe = new RegExp(`\\b${escaped}\\b`, 'i')
      colorQuery = {
        $or: [
          { name: { $regex: colorRe } },
          { tags: { $in: [colorRe] } },
          { 'variants.attributes.Color': { $regex: escaped, $options: 'i' } },
          { 'variants.attributes.Colour': { $regex: escaped, $options: 'i' } },
        ],
      }
    }

    // ── Strategy: UNION all attribute strategies + vector matches ──
    //
    // Meesho-style accuracy: we want to give the ranker the BROADEST set of
    // candidates so it can pick the best ones using visual similarity +
    // attribute matching. Instead of "first strategy that returns results",
    // we UNION all strategies so the ranker gets:
    //   - Same-gender + same-category products (best match)
    //   - Same-gender + different-category products (sarees for women)
    //   - Different-gender + same-category products (men's t-shirts)
    //   - Same-color products
    //
    // The ranker then uses:
    //   - Visual similarity (Jina CLIP v2) as the PRIMARY signal (45%)
    //   - Category similarity penalty (t-shirt ≠ saree → 70% penalty)
    //   - Gender penalty (wrong gender → 50% penalty, NOT exclusion)
    //   - Attribute match (category + color + gender)
    //
    // This means a men's red t-shirt (high visual similarity, gender penalty)
    // can rank HIGHER than a women's saree (low visual similarity, category
    // penalty) for a women's red t-shirt query — which is the correct
    // Meesho behavior.

    const strategies: Record<string, unknown>[] = []

    // Strategy 1: category AND gender AND color (exact match)
    if (categoryQuery && genderQuery && colorQuery) {
      strategies.push({
        ...baseFilter,
        $and: [categoryQuery, genderQuery, colorQuery],
      })
    }
    // Strategy 2: category AND gender
    if (categoryQuery && genderQuery) {
      strategies.push({
        ...baseFilter,
        $and: [categoryQuery, genderQuery],
      })
    }
    // Strategy 3: category AND color (may include wrong gender, but right
    // category + color — e.g., men's red t-shirts for a women's red t-shirt query.
    // The ranker will penalize the gender but keep them because they're
    // visually similar.)
    if (categoryQuery && colorQuery) {
      strategies.push({
        ...baseFilter,
        $and: [categoryQuery, colorQuery],
      })
    }
    // Strategy 4: category only (all t-shirts regardless of gender/color)
    if (categoryQuery) {
      strategies.push({ ...baseFilter, ...categoryQuery })
    }
    // Strategy 5: gender AND color
    if (genderQuery && colorQuery) {
      strategies.push({
        ...baseFilter,
        $and: [genderQuery, colorQuery],
      })
    }
    // Strategy 6: gender only
    if (genderQuery) {
      strategies.push({ ...baseFilter, ...genderQuery })
    }
    // Strategy 7: color only
    if (colorQuery) {
      strategies.push({ ...baseFilter, ...colorQuery })
    }

    // ── UNION all strategies: collect ALL matching product IDs ──
    // We run ALL strategies (not just the first that returns results) so the
    // ranker gets the broadest candidate set. The ranker will sort them by
    // visual similarity + attribute match + penalties.
    const allIds = new Set<string>()
    for (const query of strategies) {
      try {
        const docs = await db
          .collection('products')
          .find(query)
          .limit(limit)
          .project({ _id: 1 })
          .toArray()
        for (const doc of docs) {
          allIds.add(doc._id.toString())
        }
      } catch {
        // Skip failed strategies — continue with others
      }
    }

    return {
      productIds: [...allIds],
      available: allIds.size > 0,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ImageSearch:AttrQuery] error: ${msg}`)
    return { productIds: [], available: false }
  }
}

/* ------------------------------------------------------------------ */
/*  Auto-indexing trigger                                              */
/* ------------------------------------------------------------------ */

let autoIndexTriggered = false

/**
 * If the embeddings collection is empty AND we have at least one provider
 * configured (Jina or Groq), kick off a single batch of background indexing.
 *
 * This is NON-BLOCKING — we don't await it in the pipeline. The first
 * search still returns attribute-based results; subsequent searches (after
 * the background batch completes) will get real vector matching.
 *
 * The `autoIndexTriggered` flag ensures we only trigger once per process
 * lifetime to avoid spawning multiple concurrent indexing jobs.
 */
async function maybeTriggerAutoIndexing(): Promise<void> {
  if (autoIndexTriggered) return
  const config = getImageSearchConfig()
  // Only auto-index if at least Jina OR Groq is configured (otherwise
  // indexing produces low-quality pseudo-embeddings that don't help).
  if (!config.jina.available && !config.groq.available) return

  autoIndexTriggered = true
  try {
    const { db } = await connectToDatabase()
    const count = await db.collection('product_embeddings').countDocuments()
    if (count === 0) {
      console.log('[ImageSearch] embeddings collection empty — triggering background auto-indexing (1 batch)')
      // Dynamic import to avoid circular dependency at module load
      const { runIndexBatch } = await import('./index-batcher')
      runIndexBatch({ batchSize: 10 }).catch((err) => {
        console.warn('[ImageSearch] background auto-indexing failed:', err)
      })
    }
  } catch (err) {
    console.warn('[ImageSearch] auto-indexing check failed:', err)
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Fetch full product list items for a set of product IDs.
 * Reuses the existing `productToListItem` helper so the response shape
 * EXACTLY matches /api/products.
 */
async function fetchProductsByIds(ids: string[]): Promise<ProductListItem[]> {
  if (ids.length === 0) return []
  const { db } = await connectToDatabase()

  const validObjectIds = ids.filter((id) => ObjectId.isValid(id) && id.length === 24).map((id) => new ObjectId(id))
  const stringIds = ids.filter((id) => !ObjectId.isValid(id) || id.length !== 24)

  const orClauses: unknown[] = []
  if (validObjectIds.length > 0) orClauses.push({ _id: { $in: validObjectIds } })
  if (stringIds.length > 0) orClauses.push({ _id: { $in: stringIds } })
  if (orClauses.length === 0) return []

  const rawProducts = await db
    .collection('products')
    .find({ $or: orClauses })
    .toArray()

  if (rawProducts.length === 0) return []

  const productIds = rawProducts.map((p) => p._id.toString())
  const ratingSummaries = productIds.length > 0
    ? await db
        .collection('product_rating_summary')
        .find({ productId: { $in: productIds } })
        .project({ productId: 1, avgRating: 1, totalReviews: 1 })
        .toArray()
    : []
  const ratingMap = new Map<string, { avgRating: number; totalReviews: number }>()
  for (const rs of ratingSummaries) {
    ratingMap.set(rs.productId, { avgRating: rs.avgRating || 0, totalReviews: rs.totalReviews || 0 })
  }

  const byId = new Map<string, ProductListItem>()
  for (const p of rawProducts) {
    const id = p._id.toString()
    byId.set(id, productToListItem(p, ratingMap.get(id)))
  }
  return ids.map((id) => byId.get(id)).filter((p): p is ProductListItem => !!p)
}

/**
 * Fetch stored embedding docs for a set of product IDs.
 */
async function fetchEmbeddings(ids: string[]): Promise<Map<string, StoredProductEmbedding>> {
  if (ids.length === 0) return new Map()
  const result = new Map<string, StoredProductEmbedding>()
  const { db } = await connectToDatabase()
  const docs = await db
    .collection('product_embeddings')
    .find({ productId: { $in: ids } })
    .toArray()
  for (const doc of docs) {
    result.set(doc.productId, doc as unknown as StoredProductEmbedding)
  }
  return result
}

/**
 * Fetch fallback products. If a category is detected, prefer products from
 * that category; otherwise return recent products.
 */
async function fetchFallbackProducts(
  limit: number,
  category?: string | null,
  gender?: string | null,
): Promise<ProductListItem[]> {
  const { db } = await connectToDatabase()

  // Build a gender-aware fallback query. When gender is detected, we
  // prefer same-gender products even in the fallback path — Meesho never
  // shows the wrong gender.
  const baseFilter: Record<string, unknown> = { status: 'Published', active: true }

  // Build gender filter
  let genderFilter: Record<string, unknown> | null = null
  if (gender) {
    const genderMap: Record<string, string[]> = {
      men: ['men', "men's", 'male', 'boy'],
      women: ['women', "women's", 'female', 'girl', 'ladies', 'lady'],
      kids: ['kid', 'child', 'boy', 'girl', 'junior'],
      unisex: ['unisex', 'neutral'],
    }
    const keywords = genderMap[gender] || [gender]
    const genderRegex = keywords.map((kw) => new RegExp(`\\b${kw}\\b`, 'i'))
    genderFilter = {
      $or: [
        { name: { $in: genderRegex } },
        { tags: { $in: genderRegex } },
        { description: { $in: genderRegex } },
        { category: { $in: genderRegex } },
      ],
    }
  }

  // Build category filter
  let categoryFilter: Record<string, unknown> | null = null
  if (category) {
    const escaped = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    categoryFilter = {
      $or: [
        { category: { $regex: escaped, $options: 'i' } },
        { subcategory: { $regex: escaped, $options: 'i' } },
        { tags: { $in: [new RegExp(escaped, 'i')] } },
      ],
    }
  }

  // Use $or to get BOTH category matches AND gender matches.
  // The ranker will sort them by visual similarity + penalties.
  // This ensures we get men's t-shirts (category match) AND women's
  // products (gender match) so the ranker can pick the best.
  let query: Record<string, unknown>
  if (categoryFilter && genderFilter) {
    query = { ...baseFilter, $or: [categoryFilter, genderFilter] }
  } else if (genderFilter) {
    query = { ...baseFilter, ...genderFilter }
  } else if (categoryFilter) {
    query = { ...baseFilter, ...categoryFilter }
  } else {
    query = baseFilter
  }

  const rawProducts = await db
    .collection('products')
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()

  if (rawProducts.length === 0) return []

  const productIds = rawProducts.map((p) => p._id.toString())
  const ratingSummaries = await db
    .collection('product_rating_summary')
    .find({ productId: { $in: productIds } })
    .project({ productId: 1, avgRating: 1, totalReviews: 1 })
    .toArray()
  const ratingMap = new Map<string, { avgRating: number; totalReviews: number }>()
  for (const rs of ratingSummaries) {
    ratingMap.set(rs.productId, { avgRating: rs.avgRating || 0, totalReviews: rs.totalReviews || 0 })
  }

  return rawProducts.map((p) => {
    const id = p._id.toString()
    return productToListItem(p, ratingMap.get(id))
  })
}
