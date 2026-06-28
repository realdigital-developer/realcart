/**
 * Image Search — Result Cache
 * ------------------------------------------------------------------
 * Caches the final ranked product IDs for a given image so that repeat
 * uploads of the same image return instantly.
 *
 * Key:  SHA-256 hash of the image bytes (content-addressed).
 * TTL:  10 minutes (configurable).
 *
 * Uses the existing process-local server-cache (LRU-like, 100 entries).
 * On Vercel this means warm instances cache recent searches; cold starts
 * recompute. This is sufficient for typical traffic patterns.
 *
 * The cache stores ONLY product IDs + attributes + providers — not the
 * full product list items — so it stays small and the pipeline can still
 * re-fetch fresh product data on a cache hit (in case prices/stock changed).
 */

import { createHash } from 'crypto'
import { cacheGet, cacheSet } from '@/lib/server-cache'
import type { ImageAttributes } from './types'

export interface CachedImageSearch {
  productIds: string[]
  attributes: ImageAttributes
  providers: {
    vision: 'groq' | 'fallback'
    attributes: 'ximilar' | 'fallback'
    embedding: 'jina' | 'fallback'
    vector: 'pinecone' | 'faiss' | 'fallback'
    filter: 'algolia' | 'fallback'
  }
  durationMs: number
  createdAt: number
}

const CACHE_PREFIX = 'image-search:result:'
const DEFAULT_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Compute a stable content-hash key for an image buffer.
 */
export function imageCacheKey(buffer: Buffer): string {
  const hash = createHash('sha256').update(buffer).digest('hex')
  return `${CACHE_PREFIX}${hash}`
}

/**
 * Look up a cached search result by image hash.
 */
export function getCachedSearch(buffer: Buffer): CachedImageSearch | undefined {
  return cacheGet<CachedImageSearch>(imageCacheKey(buffer))
}

/**
 * Store a search result in the cache.
 */
export function setCachedSearch(
  buffer: Buffer,
  result: Omit<CachedImageSearch, 'createdAt'>,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  cacheSet<CachedImageSearch>(
    imageCacheKey(buffer),
    { ...result, createdAt: Date.now() },
    ttlMs,
  )
}
