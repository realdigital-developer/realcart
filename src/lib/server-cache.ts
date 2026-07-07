/**
 * Lightweight LRU-like in-memory cache for server-side API routes.
 *
 * WHY: Every `/api/products` call was running 5 MongoDB operations (including
 * 2 heavy aggregation pipelines and 3 `distinct()` calls) even when the client
 * only needed a simple product list. This cache stores filter metadata
 * (categories, tags, brands, price range) so we skip those expensive queries
 * on most requests.
 *
 * IMPROVEMENTS over simple Map cache:
 * - Max entries limit (100) to prevent unbounded memory growth
 * - Periodic cleanup of expired entries
 * - Size-aware eviction when limit is reached
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number // epoch ms
  createdAt: number // epoch ms — for LRU eviction
}

const MAX_ENTRIES = 100
const store = new Map<string, CacheEntry<unknown>>()

/** Evict oldest entries when the cache exceeds MAX_ENTRIES. */
function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return

  // Sort by creation time and remove the oldest 20% of entries
  const entries = Array.from(store.entries())
    .sort((a, b) => a[1].createdAt - b[1].createdAt)

  const toRemove = Math.ceil(MAX_ENTRIES * 0.2) // Remove 20 oldest
  for (let i = 0; i < toRemove && i < entries.length; i++) {
    store.delete(entries[i][0])
  }
}

/** Get a cached value, or undefined if missing/expired. */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.data as T
}

/** Set a cached value with an optional TTL (default 120 s). */
export function cacheSet<T>(key: string, data: T, ttlMs = 120_000): void {
  store.delete(key) // reset position
  store.set(key, { data, expiresAt: Date.now() + ttlMs, createdAt: Date.now() })
  evictIfNeeded()
}

/** Get-or-compute helper — the most common pattern. */
export async function cacheOrCompute<T>(
  key: string,
  compute: () => Promise<T>,
  ttlMs = 120_000,
): Promise<T> {
  const cached = cacheGet<T>(key)
  if (cached !== undefined) return cached
  const data = await compute()
  cacheSet(key, data, ttlMs)
  return data
}

/** Evict all entries for a given prefix (e.g. when a product is updated). */
export function cacheInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Periodic cleanup of expired entries — runs every 60 s. */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) store.delete(key)
    }
  }, 60_000).unref?.() // don't prevent Node.js exit
}
