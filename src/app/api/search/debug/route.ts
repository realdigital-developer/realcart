/**
 * GET /api/search/debug
 * ------------------------------------------------------------------
 * Debug endpoint that tests each provider (Jina, Pinecone, Groq) directly
 * and reports whether they're actually working (not just configured).
 *
 * This helps diagnose why image search returns poor results — e.g., if
 * Jina is configured but the API call fails, or Pinecone index is empty.
 *
 * No sensitive data is exposed — only pass/fail status + error messages.
 */

import { NextResponse } from 'next/server'
import { getImageSearchConfig } from '@/lib/image-search/config'
import { connectToDatabase } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function GET() {
  const config = getImageSearchConfig()
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    config: {
      groq: { available: config.groq.available, model: config.groq.model },
      jina: { available: config.jina.available, model: config.jina.model, dimension: config.jina.dimension },
      pinecone: { available: config.pinecone.available, indexName: config.pinecone.indexName },
      algolia: { available: config.algolia.available, indexName: config.algolia.indexName },
    },
  }

  // ── Test 1: Jina Embedding API (with REAL-sized image) ──
  if (config.jina.available) {
    try {
      // Create a realistic 400x400 red image (similar to actual search images)
      const sharp = (await import('sharp')).default
      const realImg = await sharp({
        create: { width: 400, height: 400, channels: 3, background: { r: 255, g: 0, b: 0 } }
      }).jpeg({ quality: 85 }).toBuffer()

      const base64 = realImg.toString('base64')
      const dataUrl = `data:image/jpeg;base64,${base64}`
      const payloadSize = JSON.stringify({
        model: config.jina.model,
        input: [dataUrl],
        embedding_type: 'float',
        normalized: true,
      }).length

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20_000)

      const res = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.jina.apiKey}`,
        },
        body: JSON.stringify({
          model: config.jina.model,
          input: [dataUrl],
          embedding_type: 'float',
          normalized: true,
        }),
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        results.jinaTest = {
          status: 'failed',
          httpStatus: res.status,
          error: text.slice(0, 500),
          payloadSizeKB: Math.round(payloadSize / 1024),
        }
      } else {
        const data = await res.json()
        const emb = data?.data?.[0]?.embedding
        results.jinaTest = {
          status: Array.isArray(emb) && emb.length > 0 ? 'success' : 'failed',
          embeddingDimension: Array.isArray(emb) ? emb.length : 0,
          responseKeys: Object.keys(data || {}),
          usage: data?.usage || null,
          payloadSizeKB: Math.round(payloadSize / 1024),
          imageSizeKB: Math.round(realImg.length / 1024),
          error: Array.isArray(emb) && emb.length > 0 ? null : 'No embedding in response',
        }
      }
    } catch (err: unknown) {
      results.jinaTest = {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  } else {
    results.jinaTest = { status: 'skipped', reason: 'JINA_API_KEY not configured' }
  }

  // ── Test 2: Pinecone Index ──
  if (config.pinecone.available) {
    try {
      const { Pinecone } = await import('@pinecone-database/pinecone')
      const pc = new Pinecone({ apiKey: config.pinecone.apiKey! })

      // List indexes to see if our index exists
      const indexes = await pc.listIndexes()
      const indexNames = (indexes?.indexes || []).map((i: any) => i.name)
      const indexExists = indexNames.includes(config.pinecone.indexName)

      results.pineconeTest = {
        status: indexExists ? 'index_exists' : 'index_missing',
        allIndexes: indexNames,
        targetIndex: config.pinecone.indexName,
      }

      // If index exists, check its stats
      if (indexExists) {
        try {
          const index = pc.index(config.pinecone.indexName)
          const stats = await index.describeIndexStats()
          results.pineconeTest.totalVectorCount = stats?.totalRecordCount ?? 'unknown'
          results.pineconeTest.dimension = stats?.dimension ?? 'unknown'
        } catch (e: unknown) {
          results.pineconeTest.statsError = e instanceof Error ? e.message : String(e)
        }
      }
    } catch (err: unknown) {
      results.pineconeTest = {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  } else {
    results.pineconeTest = { status: 'skipped', reason: 'PINECONE_API_KEY not configured' }
  }

  // ── Test 3: MongoDB product_embeddings count ──
  try {
    const { db } = await connectToDatabase()
    const count = await db.collection('product_embeddings').countDocuments()
    const productCount = await db.collection('products').countDocuments({
      status: 'Published', active: true,
      imageUrl: { $exists: true, $ne: '' },
    })
    results.mongoTest = {
      status: 'success',
      productEmbeddingsCount: count,
      publishedProductCount: productCount,
      indexed: count > 0,
      coverage: productCount > 0 ? `${Math.round((count / productCount) * 100)}%` : '0%',
    }
  } catch (err: unknown) {
    results.mongoTest = {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // ── Test 4: Groq Vision API ──
  if (config.groq.available) {
    try {
      const sharp = (await import('sharp')).default
      const tinyImg = await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } }
      }).jpeg().toBuffer()
      const dataUrl = `data:image/jpeg;base64,${tinyImg.toString('base64')}`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groq.apiKey}`,
        },
        body: JSON.stringify({
          model: config.groq.model,
          messages: [
            { role: 'system', content: 'Return JSON: {"color":"blue"}' },
            { role: 'user', content: [
              { type: 'text', text: 'What color?' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ]},
          ],
          temperature: 0.1,
          max_tokens: 50,
          response_format: { type: 'json_object' },
        }),
      })

      clearTimeout(timeout)

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        results.groqTest = { status: 'failed', httpStatus: res.status, error: text.slice(0, 300) }
      } else {
        const data = await res.json()
        const content = data?.choices?.[0]?.message?.content
        results.groqTest = { status: 'success', model: config.groq.model, response: content?.slice(0, 100) }
      }
    } catch (err: unknown) {
      results.groqTest = { status: 'error', error: err instanceof Error ? err.message : String(err) }
    }
  } else {
    results.groqTest = { status: 'skipped', reason: 'GROQ_API_KEY not configured' }
  }

  return NextResponse.json(results, { status: 200 })
}
