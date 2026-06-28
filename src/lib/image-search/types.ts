/**
 * Image Search — Shared Types
 * ------------------------------------------------------------------
 * Production-grade hybrid image search pipeline (Meesho-style).
 *
 * Pipeline:  image  →  Groq (vision)  →  Ximilar (fashion attrs)
 *           →  Jina (embedding)  →  Pinecone (vector)  →  Algolia (filter)
 *           →  Hybrid Ranking  →  sorted product list
 *
 * Every external provider has a graceful fallback so the pipeline ALWAYS
 * returns results (degraded but functional) even when API keys are missing
 * or a provider is down. This makes the feature safe to ship to production
 * on Vercel serverless without hard external dependencies.
 */

/* ------------------------------------------------------------------ */
/*  Extracted Attributes                                                */
/* ------------------------------------------------------------------ */

/**
 * Attributes extracted from the uploaded image by the vision providers.
 * All values are normalized (lowercase, canonical naming) by `normalize.ts`.
 */
export interface ImageAttributes {
  /** "men" | "women" | "kids" | "unisex" | null */
  gender: string | null
  /** "shirt" | "saree" | "headphones" | ... | null */
  category: string | null
  /** Canonical color name, e.g. "red", "navy blue" | null */
  color: string | null
  /** "casual" | "formal" | "sporty" | "ethnic" | ... | null */
  style: string | null
  /** "adult" | "kids" | "teen" | "senior" | null */
  ageGroup: string | null
  // ── Ximilar fashion-specific attributes ──
  /** "t-shirt" | "kurta" | "jeans" | ... | null */
  clothingType: string | null
  /** "cotton" | "polyester" | "silk" | ... | null */
  material: string | null
  /** "solid" | "striped" | "floral" | "checked" | ... | null */
  pattern: string | null
  /** "full" | "half" | "sleeveless" | null */
  sleeveType: string | null
}

/* ------------------------------------------------------------------ */
/*  Vector Match                                                        */
/* ------------------------------------------------------------------ */

export interface VectorMatch {
  /** Product ObjectId as string */
  productId: string
  /** Cosine similarity in [0, 1] (1 = identical) */
  score: number
  /** Which vector backend produced this match */
  source: 'pinecone' | 'faiss' | 'fallback'
}

/* ------------------------------------------------------------------ */
/*  Pipeline Result                                                     */
/* ------------------------------------------------------------------ */

export interface ImageSearchHit {
  /** Product list item — SAME shape as /api/products response items */
  product: import('@/lib/product-types').ProductListItem
  /** Final hybrid score in [0, 1] */
  finalScore: number
  /** Vector similarity component [0, 1] */
  vectorSimilarity: number
  /** Attribute match component [0, 1] */
  attributeMatch: number
  /** Popularity component [0, 1] */
  popularityScore: number
  /** Price component [0, 1] */
  priceScore: number
  /** Recency component [0, 1] */
  recencyScore: number
}

export interface ImageSearchResponse {
  /** Sorted product list (same shape as /api/products items) */
  products: import('@/lib/product-types').ProductListItem[]
  total: number
  /** Which providers were used (for the UI banner + debugging) */
  providers: {
    vision: 'groq' | 'fallback'
    attributes: 'ximilar' | 'fallback'
    embedding: 'jina' | 'fallback'
    vector: 'pinecone' | 'faiss' | 'fallback'
    filter: 'algolia' | 'fallback'
  }
  /** Normalized attributes detected from the image */
  attributes: ImageAttributes
  /** Total pipeline duration in ms */
  durationMs: number
  /** Whether the result came from cache */
  cached: boolean
  /** Debug: ranked hits with scores (only populated when debug=1) */
  rankedHits?: ImageSearchHit[]
}

/* ------------------------------------------------------------------ */
/*  Provider Status (for /api/search/index status reporting)           */
/* ------------------------------------------------------------------ */

export interface IndexBatchStatus {
  state: 'idle' | 'running' | 'paused' | 'completed' | 'failed'
  total: number
  processed: number
  failed: number
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
  lastProcessedId: string | null
}

/* ------------------------------------------------------------------ */
/*  Stored Product Embedding (MongoDB document shape)                  */
/* ------------------------------------------------------------------ */

export interface StoredProductEmbedding {
  productId: string
  /** Jina embedding (or fallback pseudo-embedding) */
  embedding: number[]
  /** Dimension of the embedding */
  dimension: number
  /** Normalized attributes extracted at index time */
  attributes: ImageAttributes
  /** Popularity snapshot at index time */
  popularity: {
    totalSold: number
    viewCount: number
    wishlistCount: number
    avgRating: number
  }
  /** Price snapshot at index time */
  price: {
    effectivePrice: number
    mrp: number
  }
  /** Product metadata snapshot for filtering (Algolia-equivalent) */
  metadata: {
    category: string
    gender: string | null
    color: string | null
    brand: string
    createdAt: string
  }
  /** Which providers produced this embedding */
  providers: {
    embedding: 'jina' | 'fallback'
    attributes: 'ximilar' | 'fallback'
    vision: 'groq' | 'fallback'
  }
  /** Perceptual hash of the PRIMARY product image (for exact-match detection) */
  imageHash?: string
  /** Perceptual hashes of ALL product images (primary + secondary).
   *  Each entry is { hash, url } so we can match against any image of
   *  the product, not just the primary one. */
  imageHashes?: Array<{ hash: string; url: string; isPrimary: boolean }>
  updatedAt: string
}
