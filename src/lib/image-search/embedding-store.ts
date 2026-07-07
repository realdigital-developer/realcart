/**
 * Embedding Store — MongoDB-backed persistence for product embeddings.
 * ------------------------------------------------------------------
 * Stores per-product: embedding vector, normalized attributes, popularity
 * and price snapshots, and which providers produced them.
 *
 * Used by:
 *   - The batch indexer (writes)
 *   - The FAISS-flat index loader (reads)
 *   - The ranking engine (reads attribute + popularity snapshots for
 *     hybrid scoring, avoiding extra MongoDB product lookups)
 */

import { connectToDatabase } from '@/lib/mongodb'
import type { ImageAttributes, StoredProductEmbedding } from './types'

/**
 * Ensure the product_embeddings collection exists with proper indexes.
 * Called once on pipeline initialization. Safe to call repeatedly.
 */
export async function ensureEmbeddingsCollection(): Promise<void> {
  const { db } = await connectToDatabase()
  const cols = await db.listCollections({ name: 'product_embeddings' }).toArray()
  if (cols.length === 0) {
    await db.createCollection('product_embeddings')
  }
  // Unique index on productId — upserts replace existing embeddings
  await db.collection('product_embeddings').createIndex(
    { productId: 1 },
    { unique: true },
  )
  // Index on metadata.category for fast attribute-based fallback queries
  await db.collection('product_embeddings').createIndex(
    { 'metadata.category': 1 },
  )
}

/**
 * Save (upsert) a product embedding document.
 */
export async function saveEmbedding(doc: StoredProductEmbedding): Promise<void> {
  const { db } = await connectToDatabase()
  await db.collection('product_embeddings').updateOne(
    { productId: doc.productId },
    { $set: { ...doc, updatedAt: new Date().toISOString() } },
    { upsert: true },
  )
}

/**
 * Bulk save embeddings (used by the batch indexer).
 * Uses unordered bulkWrite so one bad doc doesn't fail the whole batch.
 */
export async function saveEmbeddingsBulk(
  docs: StoredProductEmbedding[],
): Promise<{ upserted: number; errors: number }> {
  if (docs.length === 0) return { upserted: 0, errors: 0 }
  const { db } = await connectToDatabase()

  let upserted = 0
  let errors = 0
  // Process in chunks of 100 to avoid huge bulk writes
  const chunkSize = 100
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize)
    try {
      const ops = chunk.map((doc) => ({
        updateOne: {
          filter: { productId: doc.productId },
          update: { $set: { ...doc, updatedAt: new Date().toISOString() } },
          upsert: true,
        },
      }))
      const result = await db.collection('product_embeddings').bulkWrite(ops, {
        ordered: false,
      })
      upserted += (result.upsertedCount || 0) + (result.modifiedCount || 0)
    } catch {
      errors += chunk.length
    }
  }
  return { upserted, errors }
}

/**
 * Fetch a single product's embedding (used by the indexer for re-processing).
 */
export async function getEmbedding(
  productId: string,
): Promise<StoredProductEmbedding | null> {
  const { db } = await connectToDatabase()
  const doc = await db.collection('product_embeddings').findOne({ productId })
  return doc as StoredProductEmbedding | null
}

/**
 * Count indexed products.
 */
export async function countEmbeddings(): Promise<number> {
  const { db } = await connectToDatabase()
  return db.collection('product_embeddings').countDocuments()
}

/**
 * Fetch all stored embeddings (used by the FAISS-flat index loader).
 * Streams in batches to avoid loading everything into memory at once.
 */
export async function* streamEmbeddings(
  batchSize = 500,
): AsyncGenerator<StoredProductEmbedding> {
  const { db } = await connectToDatabase()
  const cursor = db.collection('product_embeddings').find({})
  while (await cursor.hasNext()) {
    const doc = (await cursor.next()) as StoredProductEmbedding | null
    if (doc) yield doc
  }
  await cursor.close()
}

/**
 * Build a StoredProductEmbedding from raw components.
 * Centralizes the document shape so the batch indexer and the live
 * indexer (for new products) produce identical docs.
 */
export function buildEmbeddingDoc(args: {
  productId: string
  embedding: number[]
  attributes: ImageAttributes
  popularity: { totalSold: number; viewCount: number; wishlistCount: number; avgRating: number }
  price: { effectivePrice: number; mrp: number }
  metadata: { category: string; gender: string | null; color: string | null; brand: string; createdAt: string }
  providers: { embedding: 'jina' | 'fallback'; attributes: 'ximilar' | 'fallback'; vision: 'groq' | 'fallback' }
  imageHash?: string
  imageHashes?: Array<{ hash: string; url: string; isPrimary: boolean }>
}): StoredProductEmbedding {
  return {
    productId: args.productId,
    embedding: args.embedding,
    dimension: args.embedding.length,
    attributes: args.attributes,
    popularity: args.popularity,
    price: args.price,
    metadata: args.metadata,
    providers: args.providers,
    imageHash: args.imageHash,
    imageHashes: args.imageHashes,
    updatedAt: new Date().toISOString(),
  }
}
