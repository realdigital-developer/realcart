/**
 * Hybrid Ranking Engine (Meesho-style)
 * ------------------------------------------------------------------
 * Combines multiple signals into a single finalScore per product:
 *
 *   finalScore = 0.45 * vectorSimilarity     (Jina CLIP v2 visual similarity)
 *              + 0.25 * attributeMatch        (category + color + gender)
 *              + 0.15 * popularityScore
 *              + 0.10 * priceScore
 *              + 0.05 * recencyScore
 *
 * KEY DESIGN DECISIONS (Meesho-style accuracy):
 *
 * 1. VISUAL SIMILARITY IS PRIMARY (45%): When Jina embeddings work,
 *    a men's red t-shirt will have HIGH visual similarity to a women's
 *    red t-shirt query image. This is the most reliable signal — two
 *    t-shirts look more alike than a t-shirt and a saree.
 *
 * 2. GENDER IS A SOFT SIGNAL, NOT A HARD FILTER: If we hard-exclude
 *    wrong-gender products, and the catalog has NO women's t-shirts,
 *    the user sees sarees (wrong category) instead of men's t-shirts
 *    (right category, wrong gender). Meesho shows the most VISUALLY
 *    SIMILAR products first, with gender as a tie-breaker.
 *    → Same gender: full score
 *    → Wrong gender: 50% penalty (not excluded)
 *    → Neutral (no gender): no penalty
 *
 * 3. CATEGORY SIMILARITY MAP: A t-shirt is similar to another t-shirt,
 *    shirt, or top — NOT to a saree. We use a category similarity map
 *    to penalize cross-category matches (e.g., saree for t-shirt query).
 *
 * 4. ATTRIBUTE MATCH uses BOTH stored embeddings AND live product data
 *    (name, category, tags) so products work even without indexing.
 */

import type { ImageAttributes, StoredProductEmbedding, VectorMatch } from './types'
import type { ProductListItem } from '@/lib/product-types'
import { hashDistance as computeHashDistance, isNearDuplicate } from './perceptual-hash'

export interface RankingInput {
  /** Vector matches from Pinecone / FAISS-flat */
  vectorMatches: VectorMatch[]
  /** Candidate IDs from Algolia / MongoDB attribute filter */
  filteredIds: Set<string>
  /** Product list items keyed by _id (for popularity/price/recency + LIVE attr matching) */
  productsById: Map<string, ProductListItem>
  /** Stored embeddings keyed by productId (for attribute snapshot) */
  embeddingsById: Map<string, StoredProductEmbedding>
  /** Attributes extracted from the query image */
  queryAttributes: ImageAttributes
  /** Whether the query embedding was real (Jina) or fallback (pseudo).
   *  When false, vector similarity scores are MEANINGLESS and should be
   *  ignored in favor of attribute matching. */
  embeddingIsReal?: boolean
  /** Perceptual hash of the query image (for exact-match detection) */
  queryImageHash?: string
}

/**
 * Match tier — indicates which priority level the product matched at.
 * Follows the Meesho Golden Rule priority order:
 *   1. EXACT   — same image / near-duplicate (Rank ~100)
 *   2. VARIANT — same product, different angle/color (Rank ~95)
 *   3. VISUAL  — highly similar visual embedding (Rank ~90)
 *   4. ATTRIBUTE — category + color + gender match (Rank ~70)
 *   5. CATEGORY  — broader category fallback (Rank ~50)
 */
export type MatchTier = 'exact' | 'variant' | 'visual' | 'attribute' | 'category'

export interface RankedHit {
  product: ProductListItem
  finalScore: number
  vectorSimilarity: number
  attributeMatch: number
  popularityScore: number
  priceScore: number
  recencyScore: number
  /** Debug: gender multiplier applied (1.0 = same, 0.5 = wrong gender) */
  genderMultiplier?: number
  /** Debug: category multiplier applied (1.0 = same group, 0.3 = different group) */
  categoryMultiplier?: number
  /** Debug: whether vector similarity was used */
  useVector?: boolean
  /** Match tier (for the Meesho-style priority system) */
  matchTier?: MatchTier
  /** Inventory: 1.0 = in stock, 0.5 = low stock, 0.0 = out of stock */
  inventoryScore?: number
  /** pHash distance to query image (0 = exact, <10 = near-duplicate) */
  hashDistance?: number
}

/* ------------------------------------------------------------------ */
/*  Weight constants                                                   */
/* ------------------------------------------------------------------ */

export const WEIGHTS = {
  vectorSimilarity: 0.45,
  attributeMatch: 0.25,
  popularity: 0.15,
  price: 0.10,
  recency: 0.05,
} as const

export const ATTRIBUTE_WEIGHTS = {
  category: 0.5, // high — category match is most important
  color: 0.25,   // medium
  gender: 0.25,  // medium
} as const

/* ------------------------------------------------------------------ */
/*  Category Similarity Map                                            */
/* ------------------------------------------------------------------ */

/**
 * Groups of similar product categories. Products in the SAME group are
 * considered "category-similar" (e.g., t-shirt ≈ shirt ≈ top).
 * Products in DIFFERENT groups are "category-different" (e.g., t-shirt ≠ saree).
 *
 * This prevents the pipeline from showing sarees for t-shirt queries —
 * a Meesho-style accuracy rule.
 */
const CATEGORY_GROUPS: string[][] = [
  // T-shirts only (tshirt, tee, polo shirt)
  // SEPARATE from shirts because a t-shirt search should NOT show formal shirts
  // and a shirt search should NOT show t-shirts.
  ['t-shirt', 'tshirt', 'tee', 'polo'],
  // Shirts only (formal/casual button-down shirts, dress shirts)
  // SEPARATE from t-shirts because they're a different garment type.
  ['shirt', 'dress shirt', 'formal shirt', 'casual shirt', 'button-down', 'button down'],
  // Tops, blouses, tanks (women's upper body wear that isn't a t-shirt or shirt)
  ['top', 'blouse', 'tank', 'camisole', 'crop top'],
  // Sweaters, hoodies, pullovers (warm upper body wear)
  ['sweater', 'pullover', 'hoodie', 'cardigan', 'sweatshirt'],
  // Ethnic / traditional wear (kurtas, sherwanis, panjabis, dhotis, nehru jackets)
  ['kurta', 'kurti', 'sherwani', 'panjabi', 'punjabi', 'dhoti', 'nehru', 'indo-western', 'indowestern', 'ethnic', 'lehenga'],
  // Lower body wear (jeans, pants, shorts)
  ['jeans', 'denim', 'trouser', 'pant', 'jogger', 'shorts', 'leggings', 'chinos', 'pyjama', 'track pant'],
  // Full body / traditional women's (sarees, dresses, gowns)
  ['saree', 'sari', 'gown', 'dress', 'frock', 'jumpsuit'],
  // Outerwear (jackets, blazers, coats)
  ['jacket', 'blazer', 'coat'],
  // Footwear
  ['shoe', 'shoes', 'sneaker', 'sneakers', 'sandal', 'sandals', 'boot', 'boots', 'flip-flop', 'flip-flops', 'slipper', 'slippers', 'footwear'],
  // Electronics
  ['headphone', 'headphones', 'earphone', 'earphones', 'earbuds', 'speaker', 'smartwatch', 'watch', 'mobile', 'laptop', 'camera'],
  // Accessories
  ['bag', 'handbag', 'backpack', 'wallet', 'belt', 'sunglasses', 'cap', 'hat'],
  // Home & Kitchen
  ['home', 'kitchen', 'furniture', 'mug', 'decor'],
  // Beauty & Personal Care
  ['beauty', 'personal care', 'cosmetic', 'skincare'],
]

/**
 * Get the category group index for a category string.
 * Returns -1 if the category doesn't match any group (uncategorized).
 *
 * Uses word-boundary matching to prevent false positives:
 *   - "tshirt" should NOT match the "shirt" keyword (different garment!)
 *   - "t-shirt" should NOT match the "shirt" keyword
 *   - "shirt" should NOT match the "t-shirt" keyword
 *
 * We check each keyword as a whole word (bounded by non-letter characters
 * or string start/end). This ensures "shirt" only matches when it appears
 * as a standalone word, not as a substring of "tshirt" or "t-shirt".
 */
function getCategoryGroup(category: string): number {
  // Normalize: lowercase, replace hyphens with nothing (so "t-shirt" → "tshirt",
  // "t-shirts" → "tshirts"), then pad with spaces for word-boundary matching.
  // This ensures "shirt" does NOT match inside "tshirt" or "tshirts".
  const lower = ' ' + category.toLowerCase().replace(/-/g, '') + ' '
  for (let i = 0; i < CATEGORY_GROUPS.length; i++) {
    for (const keyword of CATEGORY_GROUPS[i]) {
      // Normalize the keyword the same way (remove hyphens)
      const normalizedKeyword = keyword.toLowerCase().replace(/-/g, '')
      // Check if the keyword appears as a whole word (surrounded by non-letters)
      const regex = new RegExp(`(^|[^a-z])${escapeRegex(normalizedKeyword)}([^a-z]|$)`, 'i')
      if (regex.test(lower)) {
        return i
      }
    }
  }
  return -1
}

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if two categories are in the same similarity group.
 * Returns true if they're in the same group (or either is uncategorized).
 */
function isCategorySimilar(cat1: string | null | undefined, cat2: string | null | undefined): boolean {
  if (!cat1 || !cat2) return true // uncategorized = neutral (no penalty)
  const g1 = getCategoryGroup(cat1)
  const g2 = getCategoryGroup(cat2)
  if (g1 === -1 || g2 === -1) return true // uncategorized = neutral
  return g1 === g2
}

/* ------------------------------------------------------------------ */
/*  Main ranker                                                        */
/* ------------------------------------------------------------------ */

export function rankProducts(input: RankingInput): RankedHit[] {
  const { vectorMatches, filteredIds, productsById, embeddingsById, queryAttributes, embeddingIsReal, queryImageHash } = input

  // ── Dynamic weight selection ──
  const useVector = embeddingIsReal !== false && vectorMatches.length > 0
  const weights = useVector
    ? { vectorSimilarity: 0.50, attributeMatch: 0.30, popularity: 0.10, price: 0.05, recency: 0.05 }
    : { vectorSimilarity: 0.00, attributeMatch: 0.70, popularity: 0.15, price: 0.10, recency: 0.05 }

  // Build a vector-score map
  const vectorScores = new Map<string, number>()
  for (const m of vectorMatches) {
    if (filteredIds.size === 0 || filteredIds.has(m.productId)) {
      vectorScores.set(m.productId, m.score)
    } else {
      vectorScores.set(m.productId, m.score * 0.7)
    }
  }

  // Union of all candidate IDs
  const allIds = new Set<string>([...vectorScores.keys(), ...filteredIds])

  // Compute normalization bounds
  let maxPopularity = 0
  let minPrice = Infinity
  let maxPrice = 0
  const now = Date.now()
  let maxAge = 0
  for (const id of allIds) {
    const p = productsById.get(id)
    if (!p) continue
    const emb = embeddingsById.get(id)
    const pop = computePopularity(p, emb)
    if (pop > maxPopularity) maxPopularity = pop
    const price = p.effectivePrice || 0
    if (price > 0) {
      if (price < minPrice) minPrice = price
      if (price > maxPrice) maxPrice = price
    }
    const ageDays = (now - new Date(p.createdAt || now).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > maxAge) maxAge = ageDays
  }

  // ── Score every candidate ──
  const hits: RankedHit[] = []
  for (const id of allIds) {
    const product = productsById.get(id)
    if (!product) continue

    const emb = embeddingsById.get(id)
    const vectorSim = vectorScores.get(id) ?? 0

    // ── pHash exact/near-duplicate detection ──
    // Check the query hash against ALL stored image hashes for this product
    // (primary + secondary images). The user's search image might match any
    // image of the product, not just the primary one.
    let hashDist = -1
    let isExact = false
    let isNear = false
    if (queryImageHash) {
      // Check the primary image hash (backward compatibility)
      if (emb?.imageHash) {
        const d = computeHashDistance(queryImageHash, emb.imageHash)
        if (d >= 0 && (hashDist < 0 || d < hashDist)) hashDist = d
        if (d === 0) isExact = true
        else if (d > 0 && d < 10) isNear = true
      }
      // Check ALL image hashes (primary + secondary) — this is the key fix
      // for matching against any product image, not just the primary one.
      if (emb?.imageHashes && emb.imageHashes.length > 0) {
        for (const imgHash of emb.imageHashes) {
          if (imgHash.hash) {
            const d = computeHashDistance(queryImageHash, imgHash.hash)
            if (d >= 0 && (hashDist < 0 || d < hashDist)) hashDist = d
            if (d === 0) isExact = true
            else if (d > 0 && d < 10) isNear = true
          }
        }
      }
    }

    // ── Inventory awareness ──
    // In-stock: 1.0, Low stock (1-5): 0.7, Out of stock: 0.3
    let inventoryScore = 1.0
    if (!product.inStock || product.stock <= 0) {
      inventoryScore = 0.3
    } else if (product.stock <= 5) {
      inventoryScore = 0.7
    }

    // ── Gender penalty (soft) ──
    let genderMultiplier = 1.0
    if (queryAttributes.gender) {
      const productGender = detectProductGender(product)
      if (productGender && productGender !== queryAttributes.gender) {
        genderMultiplier = 0.5
      }
    }

    // ── Category similarity penalty ──
    let categoryMultiplier = 1.0
    if (queryAttributes.category) {
      const storedCat = emb?.attributes?.category
      const subcat = product.subcategory
      const name = product.name
      const candidates = [storedCat, subcat, name].filter(Boolean) as string[]
      let foundDifferentGroup = false
      for (const candidate of candidates) {
        if (!isCategorySimilar(queryAttributes.category, candidate)) {
          foundDifferentGroup = true
          break
        }
      }
      if (foundDifferentGroup) {
        categoryMultiplier = 0.3
      }
    }

    const attrMatch = computeAttributeMatch(queryAttributes, emb?.attributes, product)
    const popularity = maxPopularity > 0 ? computePopularity(product, emb) / maxPopularity : 0
    const price = computePriceScore(product.effectivePrice, minPrice, maxPrice)
    const recency = maxAge > 0
      ? 1 - ((now - new Date(product.createdAt || now).getTime()) / (1000 * 60 * 60 * 24)) / maxAge
      : 0.5

    // ── Base score (attribute + vector + popularity + price + recency) ──
    const baseScore =
      weights.vectorSimilarity * vectorSim +
      weights.attributeMatch * attrMatch +
      weights.popularity * clamp01(popularity) +
      weights.price * price +
      weights.recency * clamp01(recency)

    let finalScore = baseScore * genderMultiplier * categoryMultiplier

    // ── 5-TIER MATCH SYSTEM (Meesho Golden Rule) ──
    // Apply tier-based score boosts that override the base score for
    // high-confidence matches:
    //   Tier 1 (EXACT):   pHash distance = 0 → score = 1.0 (always #1)
    //   Tier 2 (VARIANT): pHash distance < 10 → score = 0.95
    //   Tier 3 (VISUAL):  vector similarity > 0.90 → score = 0.90
    //   Tier 4 (ATTRIBUTE): category + color + gender match → base score
    //   Tier 5 (CATEGORY):  broader category match → base score * 0.7
    let matchTier: MatchTier = 'attribute'
    if (isExact) {
      finalScore = 1.0
      matchTier = 'exact'
    } else if (isNear) {
      finalScore = Math.max(finalScore, 0.95)
      matchTier = 'variant'
    } else if (useVector && vectorSim > 0.90) {
      finalScore = Math.max(finalScore, 0.90)
      matchTier = 'visual'
    } else if (categoryMultiplier < 1.0) {
      // Different category group — tier 5 (broad fallback)
      matchTier = 'category'
      finalScore *= 0.7
    }

    // Apply inventory penalty (deprioritize out-of-stock, don't exclude)
    finalScore *= inventoryScore

    hits.push({
      product,
      finalScore: clamp01(finalScore),
      vectorSimilarity: vectorSim,
      attributeMatch: attrMatch,
      popularityScore: clamp01(popularity),
      priceScore: price,
      recencyScore: clamp01(recency),
      genderMultiplier,
      categoryMultiplier,
      useVector,
      matchTier,
      inventoryScore,
      hashDistance: hashDist >= 0 ? hashDist : undefined,
    })
  }

  // ── Sort by finalScore descending ──
  // Tie-break: exact > variant > visual > attribute > category, then popularity
  hits.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
    const tierOrder = { exact: 0, variant: 1, visual: 2, attribute: 3, category: 4 }
    const ta = tierOrder[a.matchTier || 'attribute']
    const tb = tierOrder[b.matchTier || 'attribute']
    if (ta !== tb) return ta - tb
    if (b.popularityScore !== a.popularityScore) return b.popularityScore - a.popularityScore
    return b.recencyScore - a.recencyScore
  })

  // De-duplicate by product _id
  const seen = new Set<string>()
  const deduped: RankedHit[] = []
  for (const h of hits) {
    if (seen.has(h.product._id)) continue
    seen.add(h.product._id)
    deduped.push(h)
  }

  // ── HARD CATEGORY FILTER (Meesho-style) ──
  // If we have same-category products, exclude different-category ones.
  // This uses a STRICTER check than just categoryMultiplier >= 1.0:
  // a product must have a CONFIRMED same-category match (not just "neutral"
  // because it was uncategorized). We verify by checking that the product's
  // name/subcategory/stored-category contains a keyword from the SAME
  // category group as the query.
  if (queryAttributes.category) {
    const queryGroup = getCategoryGroup(queryAttributes.category)
    if (queryGroup >= 0) {
      // Split into confirmed-same-category and everything else
      const sameCategory: RankedHit[] = []
      const differentCategory: RankedHit[] = []
      for (const h of deduped) {
        const product = h.product
        const emb = embeddingsById.get(product._id)
        // Check ALL category sources for this product
        const candidates = [
          emb?.attributes?.category,
          product.subcategory,
          product.name,
          product.category,
        ].filter(Boolean) as string[]

        // A product is "same category" if ANY candidate matches the query's
        // category group. If no candidate matches ANY group (all return -1),
        // the product is "uncategorized" — include it only if we have no
        // confirmed same-category products.
        let confirmedSame = false
        let anyCategorized = false
        for (const candidate of candidates) {
          const g = getCategoryGroup(candidate)
          if (g >= 0) {
            anyCategorized = true
            if (g === queryGroup) {
              confirmedSame = true
              break
            }
          }
        }
        if (confirmedSame) {
          sameCategory.push(h)
        } else if (!anyCategorized) {
          // Uncategorized product — keep it as a potential fallback
          sameCategory.push(h)
        } else {
          // Confirmed different category — exclude
          differentCategory.push(h)
        }
      }

      // If we have same-category products, apply gender filter and return
      if (sameCategory.length > 0) {
        // ── HARD GENDER FILTER (within same-category results) ──
        // Meesho behavior: a women's t-shirt search should NEVER show men's
        // t-shirts. If no women's t-shirts exist, show "No products found"
        // rather than men's t-shirts.
        //
        // EXCEPTION: If the query image is an EXACT pHash match with a product
        // (distance=0), always show that product regardless of gender — the user
        // is literally searching for that exact product.
        if (queryAttributes.gender) {
          const sameGender = sameCategory.filter((h) => {
            // Always keep exact pHash matches regardless of gender
            if (h.matchTier === 'exact' || h.matchTier === 'variant') return true
            const productGender = detectProductGender(h.product)
            // Keep products with NO gender signal (neutral products like mugs)
            // OR products matching the query gender
            return !productGender || productGender === queryAttributes.gender
          })
          if (sameGender.length > 0) {
            return sameGender
          }
          // No same-gender products in this category AND no exact matches.
          // Meesho behavior: return EMPTY results instead of wrong-gender products.
          // The UI will show "No products found" with a suggestion to try a
          // different image.
          return []
        }
        return sameCategory
      }

      // No same-category products found AND the query had a confirmed
      // category group. Meesho behavior: return EMPTY results instead of
      // showing wrong-category products. The UI will show "No products
      // found" with a suggestion to try a different image.
      //
      // EXCEPTION: If any product is an EXACT pHash match (distance=0),
      // always show it regardless of category — the user is searching for
      // that exact product.
      const exactMatches = deduped.filter(
        (h) => h.matchTier === 'exact' || h.matchTier === 'variant'
      )
      if (exactMatches.length > 0) {
        return exactMatches
      }
      return []
    }
  }

  return deduped
}

/* ------------------------------------------------------------------ */
/*  Component scorers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Compute attribute match score in [0, 1].
 * Category match = 0.5, color = 0.25, gender = 0.25 (per task spec).
 *
 * Checks BOTH the stored embedding attributes (from index time) AND the
 * live product's category/subcategory/tags/name. This ensures accurate
 * attribute scoring even for products that haven't been indexed.
 */
export function computeAttributeMatch(
  query: ImageAttributes,
  stored: ImageAttributes | undefined,
  product?: ProductListItem,
): number {
  if (!query.category && !query.color && !query.gender) {
    // No query attributes → neutral 0.5 so vector signal dominates
    return 0.5
  }

  let score = 0
  let totalWeight = 0

  // ── Category matching (with category similarity map) ──
  if (query.category) {
    totalWeight += ATTRIBUTE_WEIGHTS.category
    const qCat = query.category.toLowerCase()
    // Check stored embedding category
    const storedCat = stored?.category?.toLowerCase()
    // Check live product category/subcategory/tags
    const liveCat = product?.category?.toLowerCase()
    const liveSubcat = product?.subcategory?.toLowerCase()
    const liveTags = product?.tags?.map((t) => t.toLowerCase()) || []
    const liveName = product?.name?.toLowerCase() || ''

    // The product's best category representation (for similarity checking)
    const productCategoryForSimilarity = storedCat || liveSubcat || liveCat || liveName

    if (storedCat === qCat) {
      score += ATTRIBUTE_WEIGHTS.category
    } else if (storedCat && storedCat.includes(qCat)) {
      score += ATTRIBUTE_WEIGHTS.category * 0.6
    } else if (liveCat === qCat || liveSubcat === qCat) {
      // Exact live category match
      score += ATTRIBUTE_WEIGHTS.category
    } else if ((liveCat && liveCat.includes(qCat)) || (liveSubcat && liveSubcat.includes(qCat))) {
      // Partial live category match (e.g., query "shirt" vs subcategory "T-shirts")
      score += ATTRIBUTE_WEIGHTS.category * 0.6
    } else if (liveTags.some((t) => t === qCat)) {
      // Tag exact match
      score += ATTRIBUTE_WEIGHTS.category * 0.8
    } else if (liveTags.some((t) => t.includes(qCat))) {
      // Tag partial match
      score += ATTRIBUTE_WEIGHTS.category * 0.4
    } else if (liveName.includes(qCat)) {
      // Name contains the category word (e.g., "Men attractive cotton tshirt")
      score += ATTRIBUTE_WEIGHTS.category * 0.5
    } else if (!isCategorySimilar(qCat, productCategoryForSimilarity)) {
      // DIFFERENT category group (e.g., query "t-shirt" vs product "saree")
      // Give a small score (not 0) so the product still appears in results
      // if there's nothing better, but it ranks low.
      score += ATTRIBUTE_WEIGHTS.category * 0.1
    }
    // If none of the above and same category group → leave at 0 (will be
    // normalized by totalWeight). This is a weak match.
  }

  // ── Color matching ──
  if (query.color) {
    totalWeight += ATTRIBUTE_WEIGHTS.color
    const qColor = query.color.toLowerCase()
    const storedColor = stored?.color?.toLowerCase()

    if (storedColor === qColor) {
      score += ATTRIBUTE_WEIGHTS.color
    } else if (storedColor && storedColor.includes(qColor)) {
      score += ATTRIBUTE_WEIGHTS.color * 0.6
    } else if (product) {
      // Check live product name + tags + variant attributes for color
      const liveName = product.name?.toLowerCase() || ''
      const liveTags = product.tags?.map((t) => t.toLowerCase()) || []
      const variantColors = (product.variants || [])
        .map((v) => v.attributes?.Color || v.attributes?.Colour)
        .filter(Boolean)
        .map((c) => c.toLowerCase())

      if (liveName.includes(qColor) || liveTags.includes(qColor) || variantColors.includes(qColor)) {
        score += ATTRIBUTE_WEIGHTS.color
      } else if (
        liveTags.some((t) => t.includes(qColor)) ||
        variantColors.some((c) => c.includes(qColor))
      ) {
        score += ATTRIBUTE_WEIGHTS.color * 0.5
      }
    }
  }

  // ── Gender matching ──
  if (query.gender) {
    totalWeight += ATTRIBUTE_WEIGHTS.gender
    const qGender = query.gender.toLowerCase()
    const storedGender = stored?.gender?.toLowerCase()

    if (storedGender === qGender) {
      score += ATTRIBUTE_WEIGHTS.gender
    } else if (product) {
      // Check live product category/name/tags for gender keywords
      const genderMap: Record<string, string[]> = {
        men: ['men', "men's", 'male', 'boy'],
        women: ['women', "women's", 'female', 'girl', 'ladies', 'lady'],
        kids: ['kid', 'child', 'boy', 'girl', 'junior'],
        unisex: ['unisex', 'neutral'],
      }
      const keywords = genderMap[qGender] || [qGender]
      const haystack = [
        product.category?.toLowerCase() || '',
        product.subcategory?.toLowerCase() || '',
        product.name?.toLowerCase() || '',
        ...(product.tags?.map((t) => t.toLowerCase()) || []),
      ]
      const hasGender = keywords.some((kw) => haystack.some((h) => h.includes(kw)))
      if (hasGender) {
        score += ATTRIBUTE_WEIGHTS.gender
      }
    }
  }

  if (totalWeight === 0) return 0.5
  return clamp01(score / totalWeight)
}

/**
 * Compute a composite popularity score from sales, views, wishlists, ratings.
 */
export function computePopularity(
  product: ProductListItem,
  emb: StoredProductEmbedding | undefined,
): number {
  const totalSold = emb?.popularity?.totalSold ?? product.totalSold ?? 0
  const viewCount = emb?.popularity?.viewCount ?? 0
  const wishlistCount = emb?.popularity?.wishlistCount ?? 0
  const avgRating = emb?.popularity?.avgRating ?? product.avgRating ?? 0

  return (
    totalSold * 1.0 +
    avgRating * 5 +
    viewCount * 0.01 +
    wishlistCount * 0.5
  )
}

/**
 * Price score — favors lower-priced products slightly (more affordable =
 * higher score). Uses a gentle inverse normalization.
 */
export function computePriceScore(
  effectivePrice: number,
  minPrice: number,
  maxPrice: number,
): number {
  if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) return 0
  const range = maxPrice - minPrice
  if (range <= 0) return 0.5 // all same price
  const norm = (maxPrice - effectivePrice) / range
  return clamp01(norm)
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

/**
 * Detect the gender of a product from its name, category, subcategory, and tags.
 *
 * Returns 'men', 'women', 'kids', 'unisex', or null (neutral/unknown).
 *
 * Used by the HARD GENDER FILTER to exclude wrong-gender products from
 * image search results. This is the key Meesho-style accuracy rule:
 * a women's query must NEVER return men's products.
 *
 * Detection priority:
 *   1. Category (most reliable — "Men's Fashion" vs "Women's Fashion")
 *   2. Name (e.g., "Men attractive cotton tshirt")
 *   3. Tags
 *
 * Important: "women" is checked BEFORE "men" because "women" contains "men"
 * as a substring — if we checked "men" first, every women's product would
 * be misclassified as men's.
 */
function detectProductGender(product: ProductListItem): string | null {
  const category = (product.category || '').toLowerCase()
  const subcategory = (product.subcategory || '').toLowerCase()
  const name = (product.name || '').toLowerCase()
  const tags = (product.tags || []).map((t) => t.toLowerCase())

  // Combine all text fields for checking
  const allText = [category, subcategory, name, ...tags].join(' ')

  // Check women FIRST (because "women" contains "men" as a substring)
  if (/\b(women|women's|female|ladies|lady)\b/.test(allText)) {
    return 'women'
  }
  // Check men
  if (/\b(men|men's|male|gentlemen)\b/.test(allText)) {
    return 'men'
  }
  // Check kids
  if (/\b(kid|kids|child|children|boy|girl|junior|baby)\b/.test(allText)) {
    return 'kids'
  }
  // Check unisex
  if (/\b(unisex|neutral)\b/.test(allText)) {
    return 'unisex'
  }

  // No clear gender signal — return null (neutral product, kept in results)
  return null
}
