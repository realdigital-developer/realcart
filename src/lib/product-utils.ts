/* ------------------------------------------------------------------ */
/*  Production-Level Product Utilities                                  */
/*  Following Flipkart/Meesho/Amazon product management patterns        */
/* ------------------------------------------------------------------ */

import type {
  ProductDocument,
  ProductListItem,
  ProductVariant,
  ProductSEO,
  ProductImage,
  SizeChart,
} from './product-types'

/* ------------------------------------------------------------------ */
/*  Product Image Normalization                                         */
/*  Handles legacy seed data (string[]) and missing images (fallback    */
/*  to imageUrl) so images always display in the UI.                    */
/* ------------------------------------------------------------------ */

/**
 * Normalize product images from the database into a consistent ProductImage[].
 *
 * The database may contain images in three formats:
 *   1. ProductImage[] — the correct format from the seller/admin forms
 *   2. string[]       — legacy seed data storing plain URL strings
 *   3. []             — empty array (only imageUrl is available)
 *
 * This function handles all three cases and also falls back to the product's
 * `imageUrl` field when the images array is empty.
 *
 * @param rawImages  - The raw `images` field from the database document
 * @param imageUrl   - The product's `imageUrl` field (single URL string)
 * @param productName - Product name used for alt text fallback
 * @returns A properly typed ProductImage[] with at least one image if any URL exists
 */
export function normalizeProductImages(
  rawImages: unknown,
  imageUrl?: unknown,
  productName?: string,
): ProductImage[] {
  const name = (productName as string) || 'Product'
  const result: ProductImage[] = []

  // 1. Process the images array — could be ProductImage[], string[], or anything
  if (Array.isArray(rawImages)) {
    for (let i = 0; i < rawImages.length; i++) {
      const item = rawImages[i]
      if (!item) continue

      if (typeof item === 'string') {
        // Legacy seed data: plain URL string
        const url = item.trim()
        if (url) {
          result.push({
            url,
            alt: name,
            publicId: '',
            isPrimary: result.length === 0,
          })
        }
      } else if (typeof item === 'object' && item !== null) {
        // Proper ProductImage object
        const obj = item as Record<string, unknown>
        const url = typeof obj.url === 'string' ? obj.url.trim() : ''
        if (url) {
          result.push({
            url,
            alt: typeof obj.alt === 'string' ? obj.alt : name,
            publicId: typeof obj.publicId === 'string' ? obj.publicId : '',
            isPrimary: typeof obj.isPrimary === 'boolean' ? obj.isPrimary : result.length === 0,
          })
        }
      }
    }
  }

  // 2. If no valid images found, fall back to imageUrl
  if (result.length === 0 && typeof imageUrl === 'string' && imageUrl.trim()) {
    result.push({
      url: imageUrl.trim(),
      alt: name,
      publicId: '',
      isPrimary: true,
    })
  }

  // 3. Ensure at least one image is marked as primary
  if (result.length > 0 && !result.some(img => img.isPrimary)) {
    result[0].isPrimary = true
  }

  return result
}

/* ------------------------------------------------------------------ */
/*  Slug Generation (SEO-Friendly)                                      */
/* ------------------------------------------------------------------ */

/**
 * Generate a URL-friendly slug from a product name.
 * Same algorithm used by Flipkart/Amazon for product URLs.
 * Example: "Samsung Galaxy S24 Ultra 256GB" → "samsung-galaxy-s24-ultra-256gb"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')     // Remove special characters
    .replace(/[\s_]+/g, '-')       // Replace spaces/underscores with hyphens
    .replace(/-+/g, '-')           // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
    .substring(0, 200)             // Limit length
}

/**
 * Generate a unique slug by appending a short hash if needed.
 */
export function generateUniqueSlug(name: string, existingSlugs?: Set<string>): string {
  const baseSlug = generateSlug(name)
  if (!existingSlugs || !existingSlugs.has(baseSlug)) return baseSlug

  let suffix = 1
  let slug = `${baseSlug}-${suffix}`
  while (existingSlugs.has(slug)) {
    suffix++
    slug = `${baseSlug}-${suffix}`
  }
  return slug
}

/* ------------------------------------------------------------------ */
/*  Price Computation (Flipkart/Amazon Style)                           */
/* ------------------------------------------------------------------ */

export interface PriceInfo {
  mrp: number
  sellingPrice: number
  effectivePrice: number
  specialPrice: number
  hasDiscount: boolean
  discountPercent: number
  discountAmount: number
  isSpecialPriceActive: boolean
  /** Tax-inclusive breakdown (Indian GST) */
  tax: {
    /** GST rate applied (%) */
    gstRate: number
    /** Whether the price is tax-inclusive */
    isTaxInclusive: boolean
    /** Taxable value (base price before GST) */
    taxableValue: number
    /** Total GST amount */
    gstAmount: number
    /** CGST amount (intra-state) */
    cgst: number
    /** SGST amount (intra-state) */
    sgst: number
    /** IGST amount (inter-state) */
    igst: number
    /** Price including GST */
    priceWithTax: number
  }
}

/**
 * Compute effective price and discount info from a product document.
 * Follows Flipkart/Amazon pricing logic:
 * 1. If special price is active (within date range), use it
 * 2. If sellingPrice < mrp, discount = mrp - sellingPrice
 * 3. Otherwise no discount
 * 4. Calculate GST breakdown (Indian e-commerce: tax-inclusive pricing by default)
 */
export function computePriceInfo(product: {
  mrp?: number
  sellingPrice?: number
  specialPrice?: number
  specialPriceStartDate?: string | null
  specialPriceEndDate?: string | null
  /** HSN code for GST rate lookup */
  hsnCode?: string
  /** GST rate override from product (%) */
  gstRate?: number
  /** Whether price is tax-inclusive (default: true for Indian e-commerce) */
  isTaxInclusive?: boolean
}): PriceInfo {
  const mrp = Math.max(0, product.mrp || 0)
  const sellingPrice = Math.max(0, product.sellingPrice || mrp)
  const specialPrice = product.specialPrice || 0

  // Check if special price is currently active
  let isSpecialPriceActive = false
  let effectivePrice = sellingPrice

  if (specialPrice > 0 && specialPrice < sellingPrice) {
    const now = new Date()
    const startDate = product.specialPriceStartDate ? new Date(product.specialPriceStartDate) : null
    const endDate = product.specialPriceEndDate ? new Date(product.specialPriceEndDate) : null

    // Active if no date restrictions, or within the date range
    if ((!startDate || now >= startDate) && (!endDate || now <= endDate)) {
      isSpecialPriceActive = true
      effectivePrice = specialPrice
    }
  }

  // If no special price, use selling price
  if (!isSpecialPriceActive) {
    effectivePrice = sellingPrice
  }

  // Calculate discount
  const hasDiscount = mrp > 0 && effectivePrice < mrp
  const discountPercent = hasDiscount ? Math.round(((mrp - effectivePrice) / mrp) * 100) : 0
  const discountAmount = hasDiscount ? mrp - effectivePrice : 0

  // Calculate GST breakdown
  // Default: Indian e-commerce uses tax-inclusive pricing
  const isTaxInclusive = product.isTaxInclusive ?? true
  const gstRate = product.gstRate !== undefined && product.gstRate >= 0
    ? product.gstRate
    : lookupGstRateSafe(product.hsnCode || '')
  let taxableValue = effectivePrice
  let gstAmount = 0
  let cgst = 0
  let sgst = 0
  let igst = 0
  let priceWithTax = effectivePrice

  if (isTaxInclusive && gstRate > 0) {
    // Price includes tax — extract taxable value
    const divisor = 100 + gstRate
    taxableValue = Math.round((effectivePrice * 100 / divisor) * 100) / 100
    gstAmount = Math.round((taxableValue * gstRate / 100) * 100) / 100
    cgst = Math.round((gstAmount / 2) * 100) / 100
    sgst = Math.round((gstAmount / 2) * 100) / 100
    priceWithTax = effectivePrice
  } else if (gstRate > 0) {
    // Price excludes tax — add tax on top
    taxableValue = effectivePrice
    gstAmount = Math.round((taxableValue * gstRate / 100) * 100) / 100
    cgst = Math.round((gstAmount / 2) * 100) / 100
    sgst = Math.round((gstAmount / 2) * 100) / 100
    priceWithTax = Math.round((effectivePrice + gstAmount) * 100) / 100
  }

  return {
    mrp,
    sellingPrice,
    effectivePrice,
    specialPrice,
    hasDiscount,
    discountPercent,
    discountAmount,
    isSpecialPriceActive,
    tax: {
      gstRate,
      isTaxInclusive,
      taxableValue,
      gstAmount,
      cgst,
      sgst,
      igst,
      priceWithTax,
    },
  }
}

/**
 * Safe GST rate lookup that doesn't throw.
 * Falls back to 18% (most common rate) if HSN code not found.
 */
function lookupGstRateSafe(hsnCode: string): number {
  // Inline the common HSN lookup logic to avoid circular/async imports
  // The full lookup table is in tax-engine.ts
  const HSN_MAP: Record<string, number> = {
    '3004': 5, '6101': 5, '6102': 5, '6109': 5, '6110': 5,
    '6201': 5, '6202': 5, '6209': 5, '6403': 5, '6404': 5,
    '6103': 12, '6104': 12, '6105': 12, '6106': 12, '6111': 12,
    '6203': 12, '6204': 12, '6205': 12, '6206': 12,
    '8517': 18, '8528': 18, '8525': 18, '8471': 18,
    '8703': 28,
  }
  if (!hsnCode) return 18
  const hsn4 = hsnCode.replace(/\s/g, '').substring(0, 4)
  return HSN_MAP[hsn4] ?? 18
}

/**
 * Compute total stock from variants (if variants exist) or return the product stock.
 */
export function computeTotalStock(product: {
  stock?: number
  variants?: ProductVariant[]
  trackInventory?: boolean
}): number {
  if (!product.trackInventory) return 999 // Unlimited stock display

  if (product.variants && product.variants.length > 0) {
    return product.variants
      .filter(v => v.isActive)
      .reduce((sum, v) => sum + (v.stock || 0), 0)
  }

  return product.stock || 0
}

/* ------------------------------------------------------------------ */
/*  SEO Auto-Generation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Auto-generate SEO fields from product data.
 * Follows Flipkart/Amazon meta title/description patterns.
 */
export function generateSEO(product: {
  name: string
  brand?: string
  category?: string
  subcategory?: string
  description?: string
  sellingPrice?: number
  highlights?: string[]
}): ProductSEO {
  const parts: string[] = []

  // Meta title: "Product Name - Brand | Category | RealCart"
  if (product.name) parts.push(product.name)
  if (product.brand) parts.push(`- ${product.brand}`)
  const metaTitle = parts.length > 0
    ? `${parts.join(' ')} | RealCart`.substring(0, 70)
    : 'Product | RealCart'

  // Meta description: First 160 chars of description + highlights
  let metaDescription = ''
  if (product.description) {
    metaDescription = product.description.substring(0, 140)
  } else if (product.highlights && product.highlights.length > 0) {
    metaDescription = product.highlights.join(', ').substring(0, 140)
  }
  if (metaDescription.length >= 140) {
    metaDescription = metaDescription.substring(0, 157) + '...'
  } else if (metaDescription) {
    metaDescription += ` Buy now at RealCart.`
  }
  if (!metaDescription) {
    metaDescription = `Buy ${product.name} online at best prices on RealCart.`
  }
  metaDescription = metaDescription.substring(0, 160)

  // Search keywords from name, brand, category
  const searchKeywords: string[] = []
  if (product.name) {
    searchKeywords.push(...product.name.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  }
  if (product.brand) searchKeywords.push(product.brand.toLowerCase())
  if (product.category) searchKeywords.push(product.category.toLowerCase())
  if (product.subcategory) searchKeywords.push(product.subcategory.toLowerCase())

  // Remove duplicates
  const uniqueKeywords = [...new Set(searchKeywords)].slice(0, 20)

  // Canonical URL
  const slug = generateSlug(product.name)
  const canonicalUrl = `/product/${slug}`

  return {
    metaTitle,
    metaDescription,
    searchKeywords: uniqueKeywords,
    canonicalUrl,
  }
}

/* ------------------------------------------------------------------ */
/*  JSON-LD Structured Data (for SEO)                                   */
/* ------------------------------------------------------------------ */

export function generateProductStructuredData(product: {
  name: string
  description?: string
  brand?: string
  mrp?: number
  sellingPrice?: number
  effectivePrice?: number
  imageUrl?: string
  images?: ProductImage[]
  avgRating?: number
  totalReviews?: number
  seller?: string
  category?: string
  slug?: string
}): object {
  const bestImage = product.images?.find(img => img.isPrimary)?.url
    || product.images?.[0]?.url
    || product.imageUrl
    || ''

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || '',
    image: bestImage,
    brand: product.brand ? {
      '@type': 'Brand',
      name: product.brand,
    } : undefined,
    offers: {
      '@type': 'Offer',
      url: `/product/${product.slug || ''}`,
      priceCurrency: 'INR',
      price: product.effectivePrice || product.sellingPrice || product.mrp || 0,
      availability: 'https://schema.org/InStock',
      seller: product.seller ? {
        '@type': 'Organization',
        name: product.seller,
      } : undefined,
    },
    aggregateRating: (product.avgRating && product.totalReviews)
      ? {
          '@type': 'AggregateRating',
          ratingValue: product.avgRating,
          reviewCount: product.totalReviews,
        }
      : undefined,
  }
}

/* ------------------------------------------------------------------ */
/*  Search Relevance Scoring                                            */
/*  Flipkart/Amazon-style relevance algorithm                           */
/* ------------------------------------------------------------------ */

/**
 * Compute a relevance score for a product against a search query.
 * Higher score = more relevant.
 *
 * Scoring weights (inspired by Flipkart/Amazon):
 * - Name match: 100 (exact) / 60 (partial)
 * - Brand match: 40
 * - Category match: 30
 * - Tag match: 20
 * - Highlight match: 15
 * - Search keyword match: 10
 * - Popularity boost: up to 25 (based on totalSold)
 * - Rating boost: up to 15 (based on avgRating)
 * - Freshness boost: up to 10 (newer products)
 */
export function computeRelevanceScore(
  product: {
    name?: string
    brand?: string
    category?: string
    subcategory?: string
    tags?: string[]
    highlights?: string[]
    seo?: { searchKeywords?: string[] }
    totalSold?: number
    avgRating?: number
    createdAt?: string | Date
  },
  searchQuery: string,
): number {
  if (!searchQuery.trim()) return 0

  const query = searchQuery.toLowerCase().trim()
  const queryWords = query.split(/\s+/).filter(w => w.length > 0)

  let score = 0

  // ── Name match (highest weight — like Meesho) ──
  const nameLower = (product.name || '').toLowerCase()
  const nameWords = nameLower.split(/\s+/).filter(w => w.length > 0)

  if (nameLower === query) {
    score += 100 // Exact full name match
  } else if (nameLower.startsWith(query)) {
    score += 85 // Name starts with the full query
  } else if (nameLower.includes(query)) {
    score += 70 // Name contains the full query as a phrase
  } else {
    // Word-level matching (Meesho-style):
    // For each query word, check if it matches any name word as:
    //   - Exact word match (highest)
    //   - Word starts with query word (prefix match — "shi" matches "shirt")
    //   - Word contains query word (substring match)
    let totalWordScore = 0
    for (const qWord of queryWords) {
      let bestWordScore = 0
      for (const nWord of nameWords) {
        if (nWord === qWord) {
          bestWordScore = Math.max(bestWordScore, 50) // Exact word match
        } else if (nWord.startsWith(qWord)) {
          bestWordScore = Math.max(bestWordScore, 40) // Prefix match (partial word)
        } else if (nWord.includes(qWord)) {
          bestWordScore = Math.max(bestWordScore, 30) // Contains match
        }
      }
      totalWordScore += bestWordScore
    }
    // Average word score normalized by number of query words
    score += (totalWordScore / queryWords.length) * 0.8
  }

  // ── Brand match ──
  const brandLower = (product.brand || '').toLowerCase()
  if (brandLower === query) {
    score += 45
  } else if (brandLower.includes(query)) {
    score += 30
  } else {
    for (const word of queryWords) {
      if (brandLower.includes(word)) score += 12
    }
  }

  // ── Category/Subcategory match ──
  const catLower = (product.category || '').toLowerCase()
  const subcatLower = (product.subcategory || '').toLowerCase()
  if (catLower.includes(query) || subcatLower.includes(query)) {
    score += 35
  } else {
    for (const word of queryWords) {
      if (catLower.includes(word) || subcatLower.includes(word)) score += 15
    }
  }

  // ── Tag match (word-level) ──
  if (product.tags && product.tags.length > 0) {
    for (const tag of product.tags) {
      const tagLower = tag.toLowerCase()
      if (tagLower === query) {
        score += 25
        break
      } else if (tagLower.includes(query)) {
        score += 20
        break
      } else {
        // Word-level tag matching
        let tagMatched = false
        for (const word of queryWords) {
          if (tagLower.includes(word)) {
            score += 12
            tagMatched = true
          }
        }
        if (tagMatched) break
      }
    }
  }

  // ── Highlight match (word-level) ──
  if (product.highlights && product.highlights.length > 0) {
    for (const hl of product.highlights) {
      const hlLower = hl.toLowerCase()
      if (hlLower.includes(query)) {
        score += 18
        break
      } else {
        let hlMatched = false
        for (const word of queryWords) {
          if (hlLower.includes(word)) {
            score += 10
            hlMatched = true
          }
        }
        if (hlMatched) break
      }
    }
  }

  // ── SEO search keywords match ──
  if (product.seo?.searchKeywords) {
    for (const kw of product.seo.searchKeywords) {
      const kwLower = kw.toLowerCase()
      if (kwLower.includes(query) || query.includes(kwLower)) {
        score += 15
        break
      } else {
        let kwMatched = false
        for (const word of queryWords) {
          if (kwLower.includes(word)) {
            score += 8
            kwMatched = true
          }
        }
        if (kwMatched) break
      }
    }
  }

  // ── Popularity boost (logarithmic scale — like Meesho's best-seller boost) ──
  const totalSold = product.totalSold || 0
  if (totalSold > 0) {
    score += Math.min(25, Math.log10(totalSold + 1) * 8)
  }

  // ── Rating boost ──
  const avgRating = product.avgRating || 0
  if (avgRating > 0) {
    score += Math.min(15, avgRating * 3)
  }

  // ── Freshness boost (newer products get a small boost) ──
  if (product.createdAt) {
    const createdDate = new Date(product.createdAt)
    const daysSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceCreation < 7) score += 10
    else if (daysSinceCreation < 30) score += 5
    else if (daysSinceCreation < 90) score += 2
  }

  // ── Multi-word coverage bonus (Meesho-style: products matching MORE query words rank higher) ──
  if (queryWords.length > 1) {
    let matchedWords = 0
    const allText = `${nameLower} ${brandLower} ${catLower} ${subcatLower} ${(product.tags || []).join(' ')} ${(product.highlights || []).join(' ')}`.toLowerCase()
    for (const word of queryWords) {
      if (allText.includes(word)) matchedWords++
    }
    // Bonus proportional to coverage: matching 3/3 words gets +15, matching 2/3 gets +10
    const coverage = matchedWords / queryWords.length
    score += coverage * 15
  }

  return score
}

/* ------------------------------------------------------------------ */
/*  Product Document → List Item Transform                              */
/* ------------------------------------------------------------------ */

/**
 * Transform a full product document into a lightweight list item
 * for search results, category pages, etc.
 */
export function productToListItem(
  product: Record<string, unknown>,
  ratingData?: { avgRating: number; totalReviews: number },
): ProductListItem {
  const shipping = product.shipping as Record<string, unknown> | undefined
  const priceInfo = computePriceInfo({
    mrp: product.mrp as number | undefined,
    sellingPrice: product.sellingPrice as number | undefined,
    specialPrice: product.specialPrice as number | undefined,
    specialPriceStartDate: product.specialPriceStartDate as string | null | undefined,
    specialPriceEndDate: product.specialPriceEndDate as string | null | undefined,
    hsnCode: shipping?.hsnCode as string | undefined,
    gstRate: shipping?.gstRate as number | undefined,
  })

  // Get primary image — use normalization to handle string[] and empty arrays
  const normalizedImages = normalizeProductImages(product.images, product.imageUrl, product.name as string)
  const primaryImage = normalizedImages.find(img => img.isPrimary)?.url
    || normalizedImages[0]?.url
    || (product.imageUrl as string)
    || ''

  const stock = computeTotalStock({
    stock: product.stock as number | undefined,
    variants: product.variants as ProductVariant[] | undefined,
    trackInventory: product.trackInventory as boolean | undefined,
  })

  const freeDelivery = shipping
    ? (shipping.freeDeliveryAbove as number || 0) <= priceInfo.effectivePrice || (shipping.deliveryCharge as number || 0) === 0
    : false

  return {
    _id: (product._id as { toString(): string }).toString(),
    name: (product.name as string) || '',
    slug: (product.slug as string) || '',
    description: (product.description as string) || '',
    mrp: priceInfo.mrp,
    sellingPrice: priceInfo.sellingPrice,
    effectivePrice: priceInfo.effectivePrice,
    hasDiscount: priceInfo.hasDiscount,
    discountPercent: priceInfo.discountPercent,
    category: (product.category as string) || '',
    subcategory: (product.subcategory as string) || '',
    brand: (product.brand as string) || '',
    imageUrl: primaryImage,
    stock,
    inStock: stock > 0,
    highlights: (product.highlights as string[]) || [],
    tags: (product.tags as string[]) || [],
    seller: (product.seller as string) || '',
    avgRating: ratingData?.avgRating || (product.avgRating as number) || 0,
    totalReviews: ratingData?.totalReviews || (product.totalReviews as number) || 0,
    totalSold: (product.totalSold as number) || 0,
    returnPolicy: (product.returnPolicy as string) || '',
    freeDelivery,
    variantAttributes: (product.variantAttributes as string[]) || [],
    variants: (product.variants as ProductVariant[]) || [],
    createdAt: product.createdAt as string || '',
  }
}

/* ------------------------------------------------------------------ */
/*  Validation Helpers                                                  */
/* ------------------------------------------------------------------ */

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate product data before creation/update.
 * Returns validation result with any errors.
 * Robust against unexpected data types (e.g., numbers instead of strings).
 */
export function validateProductData(data: Partial<ProductDocument>): ValidationResult {
  const errors: string[] = []

  // Coerce and validate name — must be a non-empty string
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  if (!name) {
    errors.push('Product name is required')
  } else if (name.length < 3) {
    errors.push('Product name must be at least 3 characters')
  }

  // Coerce numeric fields — accept both numbers and numeric strings
  const mrp = typeof data.mrp === 'number' ? data.mrp : (data.mrp !== undefined && data.mrp !== null && !isNaN(Number(data.mrp)) ? Number(data.mrp) : undefined)
  const sellingPrice = typeof data.sellingPrice === 'number' ? data.sellingPrice : (data.sellingPrice !== undefined && data.sellingPrice !== null && !isNaN(Number(data.sellingPrice)) ? Number(data.sellingPrice) : undefined)

  if (mrp === undefined || mrp === null || mrp < 0) {
    errors.push('MRP (Maximum Retail Price) is required and must be non-negative')
  }

  if (sellingPrice === undefined || sellingPrice === null || sellingPrice < 0) {
    errors.push('Selling price is required and must be non-negative')
  }

  if (mrp && sellingPrice && sellingPrice > mrp) {
    errors.push('Selling price cannot be higher than MRP')
  }

  const specialPrice = typeof data.specialPrice === 'number' ? data.specialPrice : (data.specialPrice !== undefined && data.specialPrice !== null && !isNaN(Number(data.specialPrice)) ? Number(data.specialPrice) : 0)
  if (specialPrice && mrp && specialPrice > mrp) {
    errors.push('Special price cannot be higher than MRP')
  }

  if (specialPrice && specialPrice < 0) {
    errors.push('Special price must be non-negative')
  }

  // Category must be a non-empty string
  const category = typeof data.category === 'string' ? data.category.trim() : ''
  if (!category) {
    errors.push('Category is required')
  }

  // Validate variants if present
  if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
    const skus = new Set<string>()
    for (const variant of data.variants) {
      if (!variant || typeof variant.sku !== 'string' || !variant.sku.trim()) {
        errors.push('All variants must have a SKU')
      } else {
        if (skus.has(variant.sku)) {
          errors.push(`Duplicate SKU: ${variant.sku}`)
        }
        skus.add(variant.sku)
        if (variant.sellingPrice === undefined || variant.sellingPrice < 0) {
          errors.push(`Variant "${variant.sku}" must have a valid selling price`)
        }
        if (variant.mrp === undefined || variant.mrp < 0) {
          errors.push(`Variant "${variant.sku}" must have a valid MRP`)
        }
        if (variant.stock === undefined || variant.stock < 0) {
          errors.push(`Variant "${variant.sku}" must have a valid stock count`)
        }
      }
    }
  }

  // Validate stock if no variants
  if ((!data.variants || !Array.isArray(data.variants) || data.variants.length === 0) && data.stock !== undefined && data.stock < 0) {
    errors.push('Stock cannot be negative')
  }

  // Validate images if present
  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    const hasPrimary = data.images.some(img => img && typeof img === 'object' && img.isPrimary)
    if (!hasPrimary) {
      errors.push('At least one image must be marked as primary')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/* ------------------------------------------------------------------ */
/*  Size Chart Validation                                               */
/* ------------------------------------------------------------------ */

/**
 * Validate size chart data structure before saving.
 * Ensures the dynamic size chart is properly structured.
 */
export function validateSizeChartData(sizeChart: unknown): { valid: boolean; sanitized: SizeChart | null; errors: string[] } {
  const errors: string[] = []

  // Null/undefined is valid (size chart is optional)
  if (sizeChart === null || sizeChart === undefined) {
    return { valid: true, sanitized: null, errors: [] }
  }

  // Must be an object
  if (typeof sizeChart !== 'object' || Array.isArray(sizeChart)) {
    return { valid: false, sanitized: null, errors: ['Size chart must be an object'] }
  }

  const chart = sizeChart as Record<string, unknown>

  // Validate headers
  let headers: string[] = []
  if (!chart.headers || !Array.isArray(chart.headers)) {
    errors.push('Size chart headers must be an array')
  } else {
    headers = chart.headers
      .filter((h: unknown) => typeof h === 'string' && (h as string).trim())
      .map((h: string) => (h as string).trim())
    if (headers.length === 0) {
      errors.push('Size chart must have at least one header')
    }
  }

  // Validate rows
  let rows: Record<string, string>[] = []
  if (!chart.rows || !Array.isArray(chart.rows)) {
    errors.push('Size chart rows must be an array')
  } else {
    rows = chart.rows
      .filter((row: unknown) => row && typeof row === 'object' && !Array.isArray(row))
      .map((row: Record<string, unknown>) => {
        const sanitizedRow: Record<string, string> = {}
        for (const [key, value] of Object.entries(row)) {
          sanitizedRow[key] = typeof value === 'string' ? value : String(value ?? '')
        }
        return sanitizedRow
      })
  }

  // Validate unit
  let unit: 'metric' | 'imperial' | 'both' = 'imperial'
  if (chart.unit) {
    if (['metric', 'imperial', 'both'].includes(chart.unit as string)) {
      unit = chart.unit as 'metric' | 'imperial' | 'both'
    } else {
      errors.push('Size chart unit must be "metric", "imperial", or "both"')
    }
  }

  // Validate imageUrl
  let imageUrl: string | undefined
  if (chart.imageUrl) {
    if (typeof chart.imageUrl === 'string' && chart.imageUrl.trim()) {
      imageUrl = chart.imageUrl.trim()
    } else if (chart.imageUrl) {
      errors.push('Size chart image URL must be a valid string')
    }
  }

  // Validate howToMeasure
  let howToMeasure: string[] | undefined
  if (chart.howToMeasure) {
    if (Array.isArray(chart.howToMeasure)) {
      howToMeasure = chart.howToMeasure
        .filter((tip: unknown) => typeof tip === 'string' && (tip as string).trim())
        .map((tip: string) => (tip as string).trim())
    } else {
      errors.push('Size chart "how to measure" must be an array of strings')
    }
  }

  if (errors.length > 0) {
    return { valid: false, sanitized: null, errors }
  }

  const sanitized: SizeChart = {
    headers,
    rows,
    unit,
  }
  if (imageUrl) sanitized.imageUrl = imageUrl
  if (howToMeasure && howToMeasure.length > 0) sanitized.howToMeasure = howToMeasure

  return { valid: true, sanitized, errors: [] }
}

/* ------------------------------------------------------------------ */
/*  Get Best Image URL                                                  */
/* ------------------------------------------------------------------ */

export function getBestImageUrl(product: {
  images?: ProductImage[]
  imageUrl?: string
}): string {
  if (product.images && product.images.length > 0) {
    const primary = product.images.find(img => img.isPrimary)
    if (primary?.url) return primary.url
    return product.images[0]?.url || ''
  }
  return product.imageUrl || ''
}
