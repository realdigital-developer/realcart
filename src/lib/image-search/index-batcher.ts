/**
 * Image Search — Batch Indexer
 * ------------------------------------------------------------------
 * Generates embeddings + attributes for ALL published products and stores
 * them in:
 *   - MongoDB `product_embeddings` collection (always — primary store)
 *   - Pinecone index (if configured)
 *   - Algolia index (if configured)
 *
 * Features:
 *   - RESUMABLE: tracks progress in MongoDB `image_search_index_status`.
 *     A failed/interrupted run can be resumed by calling runIndexBatch()
 *     again — it picks up from the last processed ID.
 *   - HANDLES FAILURES: per-product errors are logged but don't abort
 *     the batch. Failed products are skipped and counted.
 *   - NON-BLOCKING: designed to be invoked from a background API route
 *     (POST /api/search/index) which fires-and-forgets. Each run processes
 *     a bounded batch and re-schedules itself if more products remain.
 *
 * Vercel note: Vercel serverless functions have a timeout (10s hobby,
 * 60s pro). The indexer is designed to process a small batch per
 * invocation (default 25 products) and rely on the status doc to resume.
 * A cron or external scheduler can call POST /api/search/index repeatedly
 * until the state reaches 'completed'. For self-hosted deployments, a
 * single long-running invocation can set a higher batch size.
 */

import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { productToListItem } from '@/lib/product-utils'
import type { ImageAttributes, StoredProductEmbedding } from './types'
import { getImageSearchConfig } from './config'
import { analyzeWithGroq, groqToAttributes } from './providers/groq-vision'
import { analyzeWithXimilar, ximilarToAttributes } from './providers/ximilar-attributes'
import { embedImageWithJina } from './providers/jina-embedding'
import { analyzeImageColors } from './providers/local-color'
import { computeImageHash } from './perceptual-hash'
import { mergeAttributes, normalizeAttributes } from './normalize'
import { buildEmbeddingDoc, ensureEmbeddingsCollection, saveEmbeddingsBulk } from './embedding-store'
import { upsertPinecone } from './providers/pinecone-vector'
import { upsertAlgoliaObject } from './providers/algolia-search'
import { invalidateFlatIndexCache } from './providers/faiss-flat'

const STATUS_COLLECTION = 'image_search_index_status'
const STATUS_DOC_ID = 'global' // single status doc for the whole catalog

export interface IndexBatchOptions {
  /** Max products to process in this invocation (default 25) */
  batchSize?: number
  /** Whether to force a full re-index (resets progress) */
  fullReindex?: boolean
}

export interface IndexBatchResult {
  state: 'running' | 'paused' | 'completed' | 'failed'
  processed: number
  failed: number
  total: number
  batchProcessed: number
  batchFailed: number
  lastProcessedId: string | null
  lastError: string | null
  finished: boolean
}

/**
 * Run one batch of the indexer.
 *
 * Returns the updated status. Call this repeatedly until `finished === true`.
 */
export async function runIndexBatch(
  opts: IndexBatchOptions = {},
): Promise<IndexBatchResult> {
  const { batchSize = 25, fullReindex = false } = opts
  await ensureEmbeddingsCollection()
  const { db } = await connectToDatabase()

  // ── Load / initialize status doc ──
  if (fullReindex) {
    await db.collection(STATUS_COLLECTION).updateOne(
      { _id: STATUS_DOC_ID },
      { $set: { state: 'running', processed: 0, failed: 0, startedAt: new Date().toISOString(), finishedAt: null, lastError: null, lastProcessedId: null } },
      { upsert: true },
    )
  }

  const status = (await db.collection(STATUS_COLLECTION).findOne({ _id: STATUS_DOC_ID })) as Record<string, unknown> | null
  let state = (status?.state as string) || 'idle'
  let processed = (status?.processed as number) || 0
  let failed = (status?.failed as number) || 0
  let lastProcessedId: string | null = (status?.lastProcessedId as string) || null
  let lastError: string | null = (status?.lastError as string) || null

  // ── Count total products to index ──
  const total = await db.collection('products').countDocuments({
    status: 'Published',
    active: true,
    imageUrl: { $exists: true, $ne: '' },
  })

  if (total === 0) {
    await updateStatus(db, { state: 'completed', total: 0, finishedAt: new Date().toISOString() })
    return { state: 'completed', processed: 0, failed: 0, total: 0, batchProcessed: 0, batchFailed: 0, lastProcessedId: null, lastError: null, finished: true }
  }

  // Mark as running
  if (state !== 'running') {
    state = 'running'
    await updateStatus(db, { state: 'running', startedAt: new Date().toISOString(), total })
  } else {
    await updateStatus(db, { total })
  }

  // ── Fetch the next batch of products to process ──
  // Resume from lastProcessedId by fetching products with _id > lastProcessedId.
  const query: Record<string, unknown> = {
    status: 'Published',
    active: true,
    imageUrl: { $exists: true, $ne: '' },
  }
  if (lastProcessedId) {
    // Use ObjectId comparison for resumability
    try {
      if (ObjectId.isValid(lastProcessedId)) {
        query._id = { $gt: new ObjectId(lastProcessedId) }
      }
    } catch {
      // If lastProcessedId isn't a valid ObjectId, skip resumability
    }
  }

  const batch = await db
    .collection('products')
    .find(query)
    .sort({ _id: 1 })
    .limit(batchSize)
    .toArray()

  if (batch.length === 0) {
    // No more products — mark complete
    await updateStatus(db, { state: 'completed', finishedAt: new Date().toISOString() })
    return { state: 'completed', processed, failed, total, batchProcessed: 0, batchFailed: 0, lastProcessedId, lastError, finished: true }
  }

  // ── Process each product in the batch ──
  const embeddingsToSave: StoredProductEmbedding[] = []
  const pineconeVectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }> = []
  const algoliaObjects: Record<string, unknown>[] = []
  let batchProcessed = 0
  let batchFailed = 0

  for (const product of batch) {
    try {
      const id = product._id.toString()
      const imageUrl = (product.imageUrl as string) || ''
      if (!imageUrl) {
        // Skip products without an image URL
        lastProcessedId = id
        continue
      }

      // Build a list item to get canonical price/popularity fields
      const listItem = productToListItem(product, {
        avgRating: (product.avgRating as number) || 0,
        totalReviews: (product.totalReviews as number) || 0,
      })

      // ── Extract attributes + embedding from the product image ──
      // Fetch the image once, reuse for both Groq + Ximilar + Jina
      const imageBuffer = await fetchImageBuffer(imageUrl)
      const mimeType = 'image/jpeg' // default; Cloudinary/picsum serve jpeg

      const [groqRes, ximilarRes, embeddingRes, localColorRes, imageHash] = await Promise.all([
        analyzeWithGroq(imageBuffer, mimeType),
        analyzeWithXimilar(imageBuffer, mimeType),
        embedImageWithJina(imageBuffer, mimeType),
        analyzeImageColors(imageBuffer),
        computeImageHash(imageBuffer),
      ])

      // ── Compute pHash for ALL product images (not just primary) ──
      // A product has multiple images (front, back, side, etc.). The user's
      // search image might match ANY of these — not just the primary. We
      // compute a pHash for every image URL and store them all.
      const allImageUrls = new Set<string>()
      if (imageUrl) allImageUrls.add(imageUrl)
      if (Array.isArray(product.images)) {
        for (const img of product.images) {
          const url = typeof img === 'string' ? img : (img as Record<string, unknown>)?.url as string
          if (url && typeof url === 'string') allImageUrls.add(url)
        }
      }
      const imageHashes: Array<{ hash: string; url: string; isPrimary: boolean }> = []
      // Compute hash for each image (limit to 6 to avoid timeouts)
      const urlList = [...allImageUrls].slice(0, 6)
      for (const imgUrl of urlList) {
        try {
          const imgBuf = await fetchImageBuffer(imgUrl)
          const h = await computeImageHash(imgBuf)
          if (h) {
            imageHashes.push({ hash: h, url: imgUrl, isPrimary: imgUrl === imageUrl })
          }
        } catch {
          // Skip images that fail to fetch/process
        }
      }

      const merged = mergeAttributes(
        groqToAttributes(groqRes.result),
        ximilarToAttributes(ximilarRes.result),
      )
      // Fill in missing color from local analysis
      if (!merged.color && localColorRes.color) {
        merged.color = localColorRes.color
      }
      const attributes: ImageAttributes = normalizeAttributes(merged)

      // Wishlist count — fetch from wishlist collection if it exists
      let wishlistCount = 0
      try {
        wishlistCount = await db.collection('wishlists').countDocuments({ productId: id })
      } catch {
        // collection may not exist — ignore
      }

      const embeddingDoc = buildEmbeddingDoc({
        productId: id,
        embedding: embeddingRes.embedding,
        attributes,
        popularity: {
          totalSold: listItem.totalSold || 0,
          viewCount: (product.viewCount as number) || 0,
          wishlistCount,
          avgRating: listItem.avgRating || 0,
        },
        price: {
          effectivePrice: listItem.effectivePrice,
          mrp: listItem.mrp,
        },
        metadata: {
          category: listItem.category,
          gender: attributes.gender,
          color: attributes.color,
          brand: listItem.brand,
          createdAt: listItem.createdAt || new Date().toISOString(),
        },
        providers: {
          embedding: embeddingRes.source,
          attributes: ximilarRes.source,
          vision: groqRes.source,
        },
        imageHash: imageHash || undefined,
        imageHashes: imageHashes.length > 0 ? imageHashes : undefined,
      })

      embeddingsToSave.push(embeddingDoc)

      // Pinecone upsert payload
      pineconeVectors.push({
        id,
        values: embeddingRes.embedding,
        metadata: {
          category: listItem.category,
          gender: attributes.gender || '',
          color: attributes.color || '',
          brand: listItem.brand,
        },
      })

      // Algolia object
      algoliaObjects.push({
        objectID: id,
        category: listItem.category,
        gender: attributes.gender || '',
        color: attributes.color || '',
        brand: listItem.brand,
        price: listItem.effectivePrice,
        popularity: listItem.totalSold || 0,
        name: listItem.name,
        imageUrl: listItem.imageUrl,
      })

      batchProcessed++
      processed++
      lastProcessedId = id
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[ImageSearch:Indexer] failed product ${product._id}: ${msg}`)
      lastError = msg
      batchFailed++
      failed++
      // Still advance lastProcessedId so we don't get stuck on a bad product
      lastProcessedId = product._id.toString()
    }
  }

  // ── Persist embeddings to MongoDB ──
  if (embeddingsToSave.length > 0) {
    await saveEmbeddingsBulk(embeddingsToSave)
  }

  // ── Upsert to Pinecone (best-effort) ──
  if (pineconeVectors.length > 0) {
    await upsertPinecone(pineconeVectors)
  }

  // ── Upsert to Algolia (best-effort, one by one) ──
  for (const obj of algoliaObjects) {
    await upsertAlgoliaObject(obj)
  }

  // Invalidate the FAISS-flat cache so the next query picks up new embeddings
  invalidateFlatIndexCache()

  // ── Determine if we're done ──
  const finished = batch.length < batchSize
  const newState: 'running' | 'completed' | 'paused' = finished ? 'completed' : 'running'
  await updateStatus(db, {
    state: newState,
    processed,
    failed,
    lastProcessedId,
    lastError,
    finishedAt: finished ? new Date().toISOString() : null,
  })

  return {
    state: newState,
    processed,
    failed,
    total,
    batchProcessed,
    batchFailed,
    lastProcessedId,
    lastError,
    finished,
  }
}

/**
 * Get the current index status (for the GET /api/search/index endpoint).
 */
export async function getIndexStatus(): Promise<IndexBatchResult> {
  const { db } = await connectToDatabase()
  const status = (await db.collection(STATUS_COLLECTION).findOne({ _id: STATUS_DOC_ID })) as Record<string, unknown> | null
  const total = await db.collection('products').countDocuments({
    status: 'Published',
    active: true,
    imageUrl: { $exists: true, $ne: '' },
  })

  return {
    state: ((status?.state as string) || 'idle') as 'running' | 'paused' | 'completed' | 'failed',
    processed: (status?.processed as number) || 0,
    failed: (status?.failed as number) || 0,
    total,
    batchProcessed: 0,
    batchFailed: 0,
    lastProcessedId: (status?.lastProcessedId as string) || null,
    lastError: (status?.lastError as string) || null,
    finished: (status?.state as string) === 'completed',
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

async function updateStatus(db: Awaited<ReturnType<typeof connectToDatabase>>['db'], patch: Record<string, unknown>): Promise<void> {
  await db.collection(STATUS_COLLECTION).updateOne(
    { _id: STATUS_DOC_ID },
    { $set: patch },
    { upsert: true },
  )
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timeout)
  }
}

// Re-export embedImageWithJina so the indexer module is self-contained
