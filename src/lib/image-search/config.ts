/**
 * Image Search — Configuration
 * ------------------------------------------------------------------
 * Centralizes all provider configuration and availability checks.
 *
 * Every provider is OPTIONAL. When its env vars are missing, the pipeline
 * uses a deterministic fallback so the feature still works (degraded).
 * This makes the image-search feature safe to deploy to Vercel without
 * requiring all 5 external services to be configured upfront.
 */

export interface ImageSearchConfig {
  groq: {
    apiKey: string | null
    model: string
    available: boolean
  }
  ximilar: {
    apiKey: string | null
    endpoint: string
    available: boolean
  }
  jina: {
    apiKey: string | null
    model: string
    /** Embedding dimension (Jina CLIP v2 = 1024; fallback = 512) */
    dimension: number
    available: boolean
  }
  pinecone: {
    apiKey: string | null
    indexName: string
    available: boolean
  }
  algolia: {
    appId: string | null
    apiKey: string | null
    indexName: string
    available: boolean
  }
  /** Top-K vector candidates to fetch before hybrid re-ranking */
  topK: number
  /** Max image upload size (bytes) — Vercel serverless body limit aware */
  maxImageBytes: number
}

const ENV = (k: string): string | null => {
  const v = process.env[k]
  return v && v.trim() ? v.trim() : null
}

let cachedConfig: ImageSearchConfig | null = null

/**
 * Get the resolved image-search configuration. Cached per process.
 */
export function getImageSearchConfig(): ImageSearchConfig {
  if (cachedConfig) return cachedConfig

  const groqApiKey = ENV('GROQ_API_KEY')
  const ximilarApiKey = ENV('XIMILAR_API_KEY')
  const jinaApiKey = ENV('JINA_API_KEY')
  const pineconeApiKey = ENV('PINECONE_API_KEY')
  const algoliaAppId = ENV('ALGOLIA_APP_ID')
  const algoliaApiKey = ENV('ALGOLIA_API_KEY')

  // Embedding dimension: Jina CLIP v2 returns 1024-dim. Fallback
  // pseudo-embedding is 512-dim (deterministic hash-based).
  const jinaModel = ENV('JINA_EMBEDDING_MODEL') || 'jina-clip-v2'
  const jinaDimension = jinaApiKey ? 1024 : 512

  cachedConfig = {
    groq: {
      apiKey: groqApiKey,
      // Default to llama-4-scout — the current free-tier vision model.
      // The old llama-3.2-11b-vision-preview is deprecated (returns 404).
      // Override with GROQ_VISION_MODEL env var if needed.
      model: ENV('GROQ_VISION_MODEL') || 'meta-llama/llama-4-scout-17b-16e-instruct',
      available: !!groqApiKey,
    },
    ximilar: {
      apiKey: ximilarApiKey,
      endpoint: ENV('XIMILAR_ENDPOINT') || 'https://api.ximilar.com/fashion/v2/recognize',
      available: !!ximilarApiKey,
    },
    jina: {
      apiKey: jinaApiKey,
      model: jinaModel,
      dimension: jinaDimension,
      available: !!jinaApiKey,
    },
    pinecone: {
      apiKey: pineconeApiKey,
      indexName: ENV('PINECONE_INDEX_NAME') || 'realcart-image-search',
      available: !!pineconeApiKey,
    },
    algolia: {
      appId: algoliaAppId,
      apiKey: algoliaApiKey,
      indexName: ENV('ALGOLIA_INDEX_NAME') || 'realcart_products',
      available: !!(algoliaAppId && algoliaApiKey),
    },
    topK: parseInt(ENV('IMAGE_SEARCH_TOP_K') || '100', 10),
    maxImageBytes: parseInt(ENV('IMAGE_SEARCH_MAX_BYTES') || String(2 * 1024 * 1024), 10),
  }

  return cachedConfig
}

/**
 * Whether any vector backend (Pinecone or the in-memory flat index) is usable.
 * The flat index is ALWAYS usable as long as MongoDB has embedding docs.
 */
export function hasVectorBackend(): boolean {
  const c = getImageSearchConfig()
  return c.pinecone.available || true // flat index always available as fallback
}
