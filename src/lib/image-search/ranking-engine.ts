/**
 * Hybrid Ranking Engine.
 *
 * Combines multiple signals into a single final score per product:
 *
 *   finalScore =
 *       (0.50 * vectorSimilarity)   // Pinecone / FAISS cosine similarity
 *     + (0.20 * attributeMatch)     // category, gender, color match
 *     + (0.15 * popularityScore)    // totalSold, viewCount, rating
 *     + (0.10 * priceScore)         // price proximity to median
 *     + (0.05 * recencyScore)       // newer products get a small boost
 *
 * Attribute scoring weights (within the 0.20 bucket):
 *   - Exact category match = highest (0.45)
 *   - Gender match         = medium  (0.25)
 *   - Color match          = medium  (0.20)
 *   - Style match          = low     (0.05)
 *   - Age group match      = low     (0.05)
 *
 * All sub-scores are normalized to [0, 1] before weighting.
 */

import { PIPELINE } from './config'
import { normalizeColor, colorSimilarity } from './color-utils'
import type {
  MergedAttributes,
  VectorMatch,
  AlgoliaMatch,
  ProductRankingMeta,
  RankedProduct,
} from './types'

/* ------------------------------------------------------------------ */
/*  Attribute match score (0..1)                                       */
/* ------------------------------------------------------------------ */

function computeAttributeScore(
  product: ProductRankingMeta,
  query: MergedAttributes,
): number {
  const w = PIPELINE.attributeWeights
  let score = 0
  let totalWeight = 0

  // Category — exact match (case-insensitive) gets full credit
  if (query.category) {
    totalWeight += w.category
    const qCat = query.category.toLowerCase()
    const pCat = product.category?.toLowerCase() || ''
    const pSub = product.subcategory?.toLowerCase() || ''
    if (pCat === qCat || pSub === qCat) {
      score += w.category
    } else if (pCat.includes(qCat) || qCat.includes(pCat) || pSub.includes(qCat)) {
      // Partial credit for substring match (e.g., "shirt" in "t-shirts")
      score += w.category * 0.5
    } else if (product.tags?.some(t => t.toLowerCase().includes(qCat))) {
      // Tag match gives partial credit
      score += w.category * 0.3
    }
  }

  // Gender — match against tags/highlights (products don't have a dedicated gender field)
  if (query.gender && query.gender !== 'unisex') {
    totalWeight += w.gender
    const qGender = query.gender.toLowerCase()
    const tagStr = (product.tags || []).join(' ').toLowerCase()
    const hasGender = tagStr.includes(qGender) || tagStr.includes('unisex')
    if (hasGender) score += w.gender
  }

  // Color — use the similarity function (handles synonyms + families)
  if (query.color && product.color) {
    totalWeight += w.color
    score += w.color * colorSimilarity(query.color, product.color)
  } else if (query.color) {
    // Product has no stored color — check tags
    const qColor = normalizeColor(query.color)
    if (qColor) {
      totalWeight += w.color
      const tagStr = (product.tags || []).join(' ').toLowerCase()
      if (tagStr.includes(qColor)) score += w.color * 0.7
    }
  }

  // Style — light-weight tag match
  if (query.style) {
    totalWeight += w.style
    const qStyle = query.style.toLowerCase()
    const tagStr = (product.tags || []).join(' ').toLowerCase()
    if (tagStr.includes(qStyle)) score += w.style
  }

  // Age group — light-weight tag match
  if (query.ageGroup) {
    totalWeight += w.ageGroup
    const qAge = query.ageGroup.toLowerCase()
    const tagStr = (product.tags || []).join(' ').toLowerCase()
    if (tagStr.includes(qAge)) score += w.ageGroup
  }

  // Normalize by the total weight actually used (so missing query attributes
  // don't unfairly penalize products that would have matched)
  return totalWeight > 0 ? score / totalWeight : 0
}

/* ------------------------------------------------------------------ */
/*  Popularity score (0..1)                                            */
/* ------------------------------------------------------------------ */

function computePopularityScore(product: ProductRankingMeta): number {
  // Use pre-computed popularityScore if the indexing script set one.
  // Otherwise derive from totalSold + viewCount + avgRating.
  if (typeof product.popularityScore === 'number') {
    return Math.max(0, Math.min(1, product.popularityScore))
  }

  const sold = product.totalSold || 0
  const views = product.viewCount || 0
  const rating = product.avgRating || 0
  const reviews = product.totalReviews || 0

  // Log-scaled to handle huge outliers (a product with 10k sales shouldn't
  // dominate one with 100 sales by 100x)
  const soldScore = Math.log10(sold + 1) / 4   // 1 sale → 0.25, 1000 → 0.75, 10000 → 1.0
  const viewScore = Math.log10(views + 1) / 5  // 1 view → 0.2, 10000 → 0.8
  const ratingScore = (rating / 5) * Math.min(1, reviews / 10) // rating weighted by review count

  const combined = 0.5 * Math.min(1, soldScore) + 0.3 * Math.min(1, viewScore) + 0.2 * Math.min(1, ratingScore)
  return Math.max(0, Math.min(1, combined))
}

/* ------------------------------------------------------------------ */
/*  Price score (0..1)                                                 */
/*  Products priced near the catalog median get a higher score.        */
/*  This prevents extreme outliers (very cheap or very expensive)      */
/*  from dominating results purely on visual similarity.               */
/* ------------------------------------------------------------------ */

function computePriceScore(
  product: ProductRankingMeta,
  medianPrice: number,
): number {
  if (!medianPrice || !product.sellingPrice) return 0.5
  const ratio = product.sellingPrice / medianPrice
  // Gaussian-like falloff: 1.0 at ratio=1, 0.5 at ratio 0.5 or 2.0, ~0 at ratio 4+
  const diff = Math.log(ratio)
  return Math.max(0, Math.exp(-diff * diff))
}

/* ------------------------------------------------------------------ */
/*  Recency score (0..1)                                               */
/*  Newer products get a small boost so fresh inventory surfaces.      */
/* ------------------------------------------------------------------ */

function computeRecencyScore(createdAt: string | Date): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  if (isNaN(created.getTime())) return 0.5
  const ageDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
  // Full score for < 7 days, decays to 0 over ~180 days
  if (ageDays <= 7) return 1.0
  if (ageDays >= 180) return 0.0
  return 1.0 - (ageDays - 7) / (180 - 7)
}

/* ------------------------------------------------------------------ */
/*  Main hybrid rank function                                          */
/* ------------------------------------------------------------------ */

export interface HybridRankInput {
  vectorMatches: VectorMatch[]
  algoliaMatches: AlgoliaMatch[]
  products: Map<string, ProductRankingMeta>
  queryAttributes: MergedAttributes
}

/**
 * Combine vector + algolia + metadata signals into a single ranked list.
 *
 * Returns products sorted by finalScore descending, with no duplicates.
 */
export function hybridRank(input: HybridRankInput): RankedProduct[] {
  const { vectorMatches, algoliaMatches, products, queryAttributes } = input
  const w = PIPELINE.weights

  // Merge product IDs from both sources (deduplicated)
  const allIds = new Set<string>()
  for (const m of vectorMatches) allIds.add(m.productId)
  for (const m of algoliaMatches) allIds.add(m.productId)

  if (allIds.size === 0) return []

  // Build lookup maps for fast access
  const vectorMap = new Map<string, number>()
  for (const m of vectorMatches) vectorMap.set(m.productId, m.score)

  const algoliaSet = new Set<string>()
  for (const m of algoliaMatches) algoliaSet.add(m.productId)

  // Compute median price across the candidate set (for price scoring)
  const prices: number[] = []
  for (const id of allIds) {
    const p = products.get(id)
    if (p && p.sellingPrice > 0) prices.push(p.sellingPrice)
  }
  prices.sort((a, b) => a - b)
  const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0

  // Score every candidate
  const ranked: RankedProduct[] = []

  for (const productId of allIds) {
    const product = products.get(productId)
    if (!product) continue // skip — product may have been deleted

    const vectorSim = vectorMap.get(productId) ?? 0
    const attrScore = computeAttributeScore(product, queryAttributes)
    const popScore = computePopularityScore(product)
    const priceScore = computePriceScore(product, medianPrice)
    const recencyScore = computeRecencyScore(product.createdAt)

    // Algolia match gives a small bonus to the attribute score
    const algoliaBoost = algoliaSet.has(productId) ? 0.1 : 0

    const finalScore =
      w.vectorSimilarity * vectorSim +
      w.attributeMatch * Math.min(1, attrScore + algoliaBoost) +
      w.popularity * popScore +
      w.price * priceScore +
      w.recency * recencyScore

    ranked.push({
      productId,
      finalScore,
      scores: {
        vectorSimilarity: vectorSim,
        attributeMatch: attrScore,
        popularity: popScore,
        price: priceScore,
        recency: recencyScore,
      },
    })
  }

  // Sort by final score descending
  ranked.sort((a, b) => b.finalScore - a.finalScore)

  return ranked
}
