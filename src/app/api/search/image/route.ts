/**
 * POST /api/search/image
 * ------------------------------------------------------------------
 * Hybrid image search endpoint (Meesho-style).
 *
 * Accepts multipart/form-data:
 *   - image: File (JPEG/PNG/WebP, max 2MB) — the product photo to search with
 *
 * Returns the SAME response shape as /api/products so the frontend can
 * reuse the existing product listing UI verbatim:
 *   {
 *     products: ProductListItem[],   // same shape as /api/products items
 *     total: number,
 *     attributes: { category, gender, color, ... },  // for the UI banner
 *     providers: { vision, attributes, embedding, vector, filter },
 *     durationMs: number,
 *     cached: boolean
 *   }
 *
 * The pipeline runs: Groq (vision) + Ximilar (attributes) → Jina (embedding)
 * → Pinecone (vector) with FAISS-flat fallback → Algolia (filter) with
 * MongoDB fallback → hybrid ranking. Every provider gracefully degrades.
 *
 * Vercel note: Uses request.formData() (Web standard, serverless-safe).
 * No multer, no temp files — the image stays in memory as a Buffer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getImageSearchConfig } from '@/lib/image-search/config'
import { processImage } from '@/lib/image-search/pipeline'

/** Allowed image MIME types. */
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

/** Vercel serverless body limit safety margin (we cap at 2MB client-side too). */
const MAX_SIZE_BYTES = 2 * 1024 * 1024

export const runtime = 'nodejs'
export const maxDuration = 60 // Pro plan allows 60s; hobby is 10s

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const config = getImageSearchConfig()

    // ── Parse multipart form ──
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request. Expected multipart/form-data with an "image" field.' },
        { status: 400 },
      )
    }

    const file = formData.get('image')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No image provided. Upload an image file in the "image" field.' },
        { status: 400 },
      )
    }

    // ── Validate file type ──
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type || 'unknown'}. Allowed: JPEG, PNG, WebP.`,
        },
        { status: 400 },
      )
    }

    // ── Validate file size ──
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 2MB.`,
        },
        { status: 413 },
      )
    }
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Image file is empty.' },
        { status: 400 },
      )
    }

    // ── Read into buffer ──
    const arrayBuffer = await file.arrayBuffer()
    const imageBuffer = Buffer.from(arrayBuffer)

    if (imageBuffer.length === 0) {
      return NextResponse.json(
        { error: 'Failed to read image data.' },
        { status: 400 },
      )
    }

    // ── Run the pipeline ──
    const result = await processImage(imageBuffer, file.type)

    // Check for debug query param to include scoring details
    const debugMode = request.nextUrl.searchParams.get('debug') === '1'

    return NextResponse.json({
      products: result.products,
      total: result.total,
      attributes: result.attributes,
      providers: result.providers,
      durationMs: result.durationMs,
      cached: result.cached,
      // Echo the config availability so the frontend can show a hint
      // if running in degraded mode (no API keys configured).
      degraded: {
        vision: result.providers.vision === 'fallback',
        attributes: result.providers.attributes === 'fallback',
        embedding: result.providers.embedding === 'fallback',
        vector: result.providers.vector === 'fallback',
        filter: result.providers.filter === 'fallback',
      },
      // Debug: include ranked scores to diagnose ranking issues
      ...(debugMode ? { debug: result.rankedHits } : {}),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/search/image] error:', msg)
    return NextResponse.json(
      {
        error: 'Image search failed. Please try again with a different image.',
        detail: msg,
        durationMs: Date.now() - startTime,
      },
      { status: 500 },
    )
  }
}

/**
 * GET /api/search/image
 * Returns the current provider configuration status + setup instructions.
 * No sensitive data is exposed — only availability flags.
 *
 * This endpoint helps you verify which providers are configured and what
 * env vars are missing. It also reports whether the system is running in
 * "enhanced" mode (real semantic search) or "fallback" mode (color-based
 * + attribute-based matching only).
 */
export async function GET() {
  const config = getImageSearchConfig()

  // "Enhanced" mode = at least Jina (for real embeddings) OR Groq (for
  // real attribute extraction) is configured. In enhanced mode, the
  // pipeline produces true semantic search results. In fallback mode,
  // it uses local color analysis + MongoDB attribute queries — still
  // useful but less accurate.
  const enhanced =
    config.groq.available ||
    config.jina.available ||
    config.pinecone.available

  const missing: string[] = []
  if (!config.groq.available) missing.push('GROQ_API_KEY')
  if (!config.jina.available) missing.push('JINA_API_KEY')
  if (!config.pinecone.available) missing.push('PINECONE_API_KEY')
  if (!config.algolia.available) {
    missing.push('ALGOLIA_APP_ID')
    missing.push('ALGOLIA_API_KEY')
  }
  // Ximilar is optional — Groq now extracts the same fashion attributes

  return NextResponse.json({
    mode: enhanced ? 'enhanced' : 'fallback',
    enhanced,
    providers: {
      groq: {
        available: config.groq.available,
        model: config.groq.model,
        freeTierUrl: 'https://console.groq.com/docs/api-keys',
        purpose: 'Vision analysis — extracts category, gender, color, style, material, pattern from the image',
      },
      ximilar: {
        available: config.ximilar.available,
        freeTierUrl: 'https://app.ximilar.com/',
        purpose: 'Fashion-specific attributes (clothing type, material, pattern, sleeve) — optional, Groq now provides these too',
      },
      jina: {
        available: config.jina.available,
        model: config.jina.model,
        dimension: config.jina.dimension,
        freeTierUrl: 'https://jina.ai/api-key/',
        purpose: 'Image embeddings (CLIP v2) — enables true semantic visual similarity search',
      },
      pinecone: {
        available: config.pinecone.available,
        indexName: config.pinecone.indexName,
        freeTierUrl: 'https://www.pinecone.io/pricing/',
        purpose: 'Cloud vector database — fast nearest-neighbor search at scale (FAISS-flat used as fallback)',
      },
      algolia: {
        available: config.algolia.available,
        indexName: config.algolia.indexName,
        freeTierUrl: 'https://www.algolia.com/pricing',
        purpose: 'Metadata filtering — fast attribute-based candidate filtering (MongoDB used as fallback)',
      },
    },
    missingEnvVars: missing,
    topK: config.topK,
    maxImageBytes: config.maxImageBytes,
    setupInstructions: enhanced
      ? undefined
      : {
          summary: 'Image search is running in FALLBACK mode (local color analysis + MongoDB attribute matching only). For Meesho-quality semantic results, add these free-tier API keys to your .env file:',
          steps: [
            '1. GROQ_API_KEY — Get a free key at https://console.groq.com/docs/api-keys (enables vision-based attribute extraction)',
            '2. JINA_API_KEY — Get a free key at https://jina.ai/api-key/ (enables real image embeddings for semantic search)',
            '3. (Optional) PINECONE_API_KEY — Get a free key at https://www.pinecone.io/pricing/ (cloud vector search at scale)',
            '4. (Optional) ALGOLIA_APP_ID + ALGOLIA_API_KEY — Get free keys at https://www.algolia.com/pricing (fast metadata filtering)',
            '5. After adding keys, restart the server and call POST /api/search/index with {"fullReindex": true} to index all products with real embeddings.',
          ],
        },
  })
}
