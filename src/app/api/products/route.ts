import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { cacheOrCompute, cacheInvalidate } from '@/lib/server-cache'
import {
  productToListItem,
  computeRelevanceScore,
} from '@/lib/product-utils'
import type { ProductListItem, ProductFilters, SortOption } from '@/lib/product-types'

/* ------------------------------------------------------------------ */
/*  Search Helpers — Meesho-style strict word-boundary matching        */
/* ------------------------------------------------------------------ */

/**
 * Escape special regex characters in a string so it can be safely embedded
 * in a RegExp source. Without this, user input like "men.shirts" would be
 * treated as "men" + any char + "shirts".
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Normalize a query word for matching.
 *
 * Performs basic plural normalization by stripping a single trailing 's':
 *   - "shirts" → "shirt"   (both singular and plural forms then match via prefix)
 *   - "boxes"  → "boxe"    (imperfect, but "boxe" still prefix-matches "boxes")
 *   - "dress"  → "dress"   (preserved — words ending in 'ss' are not stripped)
 *   - "men"    → "men"     (preserved — short words ≤3 chars not stripped)
 *
 * This is intentionally simple — we don't do full Porter-stemming here.
 * The regex query uses prefix matching at word boundaries, so "shirt" will
 * match "shirts", "shirting", etc. in the database.
 */
function normalizeWord(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1)
  }
  return word
}

/* ------------------------------------------------------------------ */
/*  GET /api/products                                                   */
/*  Public endpoint — no auth required.                                 */
/*  Returns Published + Active products for the customer storefront.    */
/* ------------------------------------------------------------------ */

/**
 * Query params:
 *   page        — Page number (default: 1)
 *   limit       — Items per page (default: 20, max: 60)
 *   search      — Search term (Meesho-style strict word-boundary matching;
 *                 returns 0 results when no exact word matches exist)
 *   category    — Filter by category (comma-sep for multiple)
 *   subcategory — Filter by subcategory (comma-sep for multiple)
 *   minPrice    — Minimum effective price filter
 *   maxPrice    — Maximum effective price filter
 *   brands      — Comma-separated brand filter
 *   tags        — Comma-separated tag filter
 *   minRating   — Minimum avg rating filter
 *   inStock     — Only show in-stock products ('true')
 *   sort        — Sort order: 'relevance'|'newest'|'price-low'|'price-high'|
 *                 'rating'|'discount'|'popularity'|'name' (default: 'newest',
 *                 or 'relevance' when searching)
 *   filters     — Include filter metadata? 'true' (default) | 'false'
 */

// Next.js route-level cache: 60 seconds
export const revalidate = 60

/** Base query filter — only Published + Active products are customer-visible. */
const BASE_FILTER = { status: 'Published', active: true }

/**
 * Build a Meesho-style STRICT word-boundary regex query.
 *
 * Problem with naive substring search:
 *   A query like `{ name: { $regex: 'shirts', $options: 'i' } }` matches any
 *   name containing "shirts" as a substring — including "t-shirts". This
 *   produces WRONG results: searching "Men Shirts" returns t-shirts even
 *   when no actual shirts exist in the database.
 *
 * Meesho-style strict word-boundary matching:
 *   1. Split the query into individual words.
 *   2. Normalize each word (basic plural handling via normalizeWord).
 *   3. For each word, the product must contain that word as a "whole word"
 *      — i.e., the word appears at the START of a field value, OR immediately
 *      AFTER a whitespace character. Hyphens, underscores, and other
 *      non-whitespace characters are treated as part of the word, so:
 *        - "shirts"  matches "shirts", "Men Shirts", "Shirts for Men"
 *        - "shirts"  does NOT match "t-shirts"  (hyphen-delimited compound)
 *        - "shirts"  does NOT match "tshirt"    (different token)
 *        - "shirt"   matches "shirt", "shirts", "shirting" (prefix match)
 *   4. A product matches only if ALL query words are found across any fields
 *      (AND logic between words, OR logic between fields).
 *
 * This guarantees:
 *   - No false-positive substring matches (e.g., "shirts" → "t-shirts")
 *   - Multi-word AND logic ("red shirt" → products with both "red" AND "shirt")
 *   - Empty results when no exact word matches exist (Meesho behavior —
 *     no wrong results shown to the customer)
 *
 * Regex pattern used:  (?:^|\s)WORD
 *   - `(?:^|\s)`  non-capturing group matching start-of-string OR whitespace
 *   - `WORD`      the escaped, normalized query word
 * The word is matched as a prefix, so "shirt" naturally matches "shirts".
 */
function buildStrictRegexQuery(searchQuery: string): Record<string, unknown> {
  const queryWords = searchQuery
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 0)
    .map(escapeRegex)
    .map(normalizeWord)
    .filter(w => w.length > 0)

  // No valid words → match nothing (returns 0 results, like Meesho)
  // `_id: null` is impossible because MongoDB always assigns a non-null _id.
  if (queryWords.length === 0) {
    return { ...BASE_FILTER, _id: null }
  }

  // Build an $or condition for a single word, matching across all
  // searchable fields. The regex enforces a word boundary at the start
  // (start-of-string or whitespace), preventing false-positive matches
  // like "shirts" matching "t-shirts".
  const buildWordOr = (word: string): Record<string, unknown> => {
    const pattern = `(?:^|\\s)${word}`
    const re = new RegExp(pattern, 'i')
    return {
      $or: [
        { name: { $regex: pattern, $options: 'i' } },
        { brand: { $regex: pattern, $options: 'i' } },
        { category: { $regex: pattern, $options: 'i' } },
        { subcategory: { $regex: pattern, $options: 'i' } },
        { tags: { $in: [re] } },
        { highlights: { $in: [re] } },
        { 'seo.searchKeywords': { $in: [re] } },
        { description: { $regex: pattern, $options: 'i' } },
      ],
    }
  }

  // Single word: flatten to a simple $or query (no $and wrapper needed).
  if (queryWords.length === 1) {
    return { ...BASE_FILTER, ...buildWordOr(queryWords[0]) }
  }

  // Multi-word: every query word must match in at least one field (AND logic).
  return {
    ...BASE_FILTER,
    $and: queryWords.map(buildWordOr),
  }
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const limit = Math.min(60, Math.max(1, parseInt(sp.get('limit') || '20')))
    const search = sp.get('search')?.trim() || ''
    const category = sp.get('category') || ''
    const subcategory = sp.get('subcategory') || ''
    const minPrice = sp.get('minPrice')
    const maxPrice = sp.get('maxPrice')
    const brands = sp.get('brands') || ''
    const tags = sp.get('tags') || ''
    const minRating = sp.get('minRating')
    const inStock = sp.get('inStock') === 'true'
    const includeFilters = sp.get('filters') !== 'false'

    // Default sort: 'relevance' when searching, otherwise 'newest'
    const sort = (sp.get('sort') || (search ? 'relevance' : 'newest')) as SortOption

    // ── Step 1: Compute filter metadata (cached 10 min) ──

    let filterData: ProductFilters = {
      categories: [],
      subcategories: [],
      priceRange: { min: 0, max: 0 },
      brands: [],
      tags: [],
      ratingOptions: [],
    }

    if (includeFilters) {
      filterData = await cacheOrCompute('products:filters:v7', async () => {
        const [categories, subcategories, allTags, allBrands, priceRangeResult, ratingBuckets] =
          await Promise.all([
            db.collection('products')
              .distinct('category', { ...BASE_FILTER, category: { $ne: '' } }),
            db.collection('products')
              .distinct('subcategory', { ...BASE_FILTER, subcategory: { $ne: '' } }),
            db.collection('products')
              .distinct('tags', { ...BASE_FILTER, tags: { $ne: [] } }),
            db.collection('products')
              .distinct('brand', { ...BASE_FILTER, brand: { $ne: '' } }),
            // Price range based on sellingPrice (closest proxy to effectivePrice in MongoDB)
            db.collection('products').aggregate([
              { $match: BASE_FILTER },
              { $group: {
                _id: null,
                minPrice: { $min: '$sellingPrice' },
                maxPrice: { $max: '$sellingPrice' },
              } },
            ]).toArray(),
            // Rating distribution for filter options
            db.collection('product_rating_summary').aggregate([
              { $group: {
                _id: null,
                ratings: { $addToSet: { $floor: '$avgRating' } },
              } },
            ]).toArray(),
          ])

        const priceData = priceRangeResult[0]
        const minP = priceData?.minPrice ?? 0
        const maxP = priceData?.maxPrice ?? 0

        // Build rating options: [4, 3, 2, 1]
        const ratingSet = new Set<number>()
        if (ratingBuckets.length > 0 && ratingBuckets[0].ratings) {
          for (const r of ratingBuckets[0].ratings) {
            if (r >= 1) ratingSet.add(Math.floor(r))
          }
        }
        const ratingOptions = [4, 3, 2, 1].filter(r => ratingSet.has(r) || ratingSet.size === 0)

        return {
          categories: categories.filter(Boolean).sort(),
          subcategories: subcategories.filter(Boolean).sort(),
          priceRange: minP > 0 ? { min: Math.floor(minP), max: Math.ceil(maxP) } : { min: 0, max: 0 },
          brands: allBrands.filter(Boolean).sort(),
          tags: allTags.filter(Boolean).sort(),
          ratingOptions,
        }
      }, 600_000) // 10-minute TTL
    }

    // ── Step 2: Build MongoDB query ──

    let query: Record<string, unknown>
    let mongoSort: Record<string, unknown> = {}
    let useTextScoreSort = false
    let needsJsSort = false

    if (search) {
      // Meesho-style STRICT word-boundary search.
      // Uses `(?:^|\s)WORD` regex to match query words as whole words only,
      // preventing false positives like "shirts" matching "t-shirts".
      // Returns 0 results when no exact word matches exist (Meesho behavior).
      query = buildStrictRegexQuery(search)
      if (sort === 'relevance') {
        needsJsSort = true
      }
    } else {
      query = { ...BASE_FILTER }
    }

    // Category filter (supports comma-separated multiple categories).
    // Case-insensitive: category names may differ in case between the
    // categories collection ("T-Shirts") and product.category values
    // ("Men's Fashion"). Uses escaped regex to be case-insensitive + safe
    // against special characters (e.g., "Men's Fashion" has an apostrophe).
    if (category && category !== 'all') {
      const catList = category.split(',').map(c => c.trim()).filter(Boolean)
      if (catList.length === 1) {
        const escaped = catList[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        query.category = { $regex: `^${escaped}$`, $options: 'i' }
      } else if (catList.length > 1) {
        query.category = { $in: catList.map(c => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
      }
    }

    // Subcategory filter (case-insensitive for the same reason as above —
    // subcategory names in the categories collection ("T-Shirts") may differ
    // in case from product.subcategory values ("T-shirts")).
    if (subcategory && subcategory !== 'all') {
      const subcatList = subcategory.split(',').map(s => s.trim()).filter(Boolean)
      if (subcatList.length === 1) {
        const escaped = subcatList[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        query.subcategory = { $regex: `^${escaped}$`, $options: 'i' }
      } else if (subcatList.length > 1) {
        query.subcategory = { $in: subcatList.map(s => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
      }
    }

    // Tags filter
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
      if (tagList.length > 0) {
        query.tags = { $in: tagList }
      }
    }

    // Brands filter
    if (brands) {
      const brandList = brands.split(',').map(b => b.trim()).filter(Boolean)
      if (brandList.length > 0) {
        query.brand = { $in: brandList }
      }
    }

    // ── Step 3: Determine MongoDB sort ──

    if (!useTextScoreSort) {
      switch (sort) {
        case 'newest':
          mongoSort = { createdAt: -1 }
          break
        case 'price-low':
          mongoSort = { sellingPrice: 1 }
          break
        case 'price-high':
          mongoSort = { sellingPrice: -1 }
          break
        case 'name':
          mongoSort = { name: 1 }
          break
        case 'popularity':
          mongoSort = { totalSold: -1, viewCount: -1 }
          break
        case 'rating':
          mongoSort = { avgRating: -1 }
          break
        case 'discount':
        case 'relevance':
          // These need JS-side sorting since effectivePrice / relevance is computed
          mongoSort = { createdAt: -1 }
          needsJsSort = true
          break
        default:
          mongoSort = { createdAt: -1 }
      }
    }

    // ── Step 4: Fetch products ──

    // When price filtering is needed, over-fetch to compensate for JS-side filtering
    const needsPriceFilter = !!(minPrice || maxPrice)
    const fetchLimit = needsPriceFilter ? Math.min(limit * 3, 200) : limit

    // Get total count for pagination
    const total = await db.collection('products').countDocuments(query)

    // Fetch products — project all fields needed for list items
    const rawProducts = await db.collection('products')
      .find(query)
      .sort(mongoSort as Record<string, 1 | -1 | { $meta: string }>)
      .skip((page - 1) * fetchLimit)
      .limit(fetchLimit)
      .project({
        name: 1, slug: 1, description: 1, mrp: 1, sellingPrice: 1,
        specialPrice: 1, specialPriceStartDate: 1, specialPriceEndDate: 1,
        category: 1, subcategory: 1, brand: 1,
        images: 1, imageUrl: 1, stock: 1, tags: 1, highlights: 1,
        seller: 1, variants: 1, variantAttributes: 1, trackInventory: 1,
        shipping: 1, returnPolicy: 1, totalSold: 1, viewCount: 1,
        avgRating: 1, totalReviews: 1, seo: 1, createdAt: 1,
      })
      .toArray()

    // ── Step 5: Batch-fetch rating summaries ──

    const productIds = rawProducts.map(p => p._id.toString())
    const ratingSummaries = productIds.length > 0
      ? await db.collection('product_rating_summary')
          .find({ productId: { $in: productIds } })
          .project({ productId: 1, avgRating: 1, totalReviews: 1 })
          .toArray()
      : []
    const ratingMap = new Map<string, { avgRating: number; totalReviews: number }>()
    for (const rs of ratingSummaries) {
      ratingMap.set(rs.productId, { avgRating: rs.avgRating || 0, totalReviews: rs.totalReviews || 0 })
    }

    // ── Step 6: Transform to list items ──

    let listItems: (ProductListItem & { _relevanceScore?: number })[] = rawProducts.map(p => {
      const ratingData = ratingMap.get(p._id.toString())
      const item = productToListItem(p, ratingData) as ProductListItem & { _relevanceScore?: number }

      // Compute JS relevance score for fallback sorting
      if (sort === 'relevance' && search && !useTextScoreSort) {
        item._relevanceScore = computeRelevanceScore(p, search)
      }

      return item
    })

    // ── Step 7: Apply JS-side filters (effectivePrice-based) ──

    if (minPrice) {
      const min = Number(minPrice)
      listItems = listItems.filter(p => p.effectivePrice >= min)
    }
    if (maxPrice) {
      const max = Number(maxPrice)
      listItems = listItems.filter(p => p.effectivePrice <= max)
    }
    if (minRating) {
      const minR = Number(minRating)
      listItems = listItems.filter(p => p.avgRating >= minR)
    }
    if (inStock) {
      listItems = listItems.filter(p => p.inStock)
    }

    // ── Step 8: Apply JS-side sorts ──

    if (sort === 'relevance' && search && !useTextScoreSort) {
      listItems.sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0))
    } else if (sort === 'discount') {
      listItems.sort((a, b) => b.discountPercent - a.discountPercent)
    } else if (sort === 'price-low') {
      listItems.sort((a, b) => a.effectivePrice - b.effectivePrice)
    } else if (sort === 'price-high') {
      listItems.sort((a, b) => b.effectivePrice - a.effectivePrice)
    }

    // Remove internal _relevanceScore before sending
    const finalProducts = listItems.map(({ _relevanceScore, ...item }) => item)

    // Trim to requested limit (after over-fetch + filter)
    const pagedProducts = finalProducts.slice(0, limit)

    // ── Step 9: Best-effort viewCount increment ──
    // Incrementing here gives a rough popularity signal; errors are non-critical.
    if (pagedProducts.length > 0) {
      db.collection('products').updateMany(
        { _id: { $in: pagedProducts.map(p => new ObjectId(p._id)) } },
        { $inc: { viewCount: 1 } },
      ).catch(() => { /* best-effort */ })
    }

    return NextResponse.json({
      products: pagedProducts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      filters: filterData,
    })
  } catch (error) {
    console.error('[Public Products GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/products — Cache invalidation                             */
/* ------------------------------------------------------------------ */

/**
 * POST /api/products
 * Invalidate product caches after create/update/delete operations.
 */
export async function POST() {
  cacheInvalidate('products:')
  return NextResponse.json({ ok: true })
}
