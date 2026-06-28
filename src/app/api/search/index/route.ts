/**
 * POST /api/search/index — Run one batch of the image-search indexer
 * GET  /api/search/index — Get current index status
 * DELETE /api/search/index — Reset index status (forces full re-index next run)
 *
 * The indexer generates embeddings + attributes for all published products
 * and stores them in MongoDB, Pinecone, and Algolia.
 *
 * It is RESUMABLE: each invocation processes up to `batchSize` products
 * (default 25) and records progress in the `image_search_index_status`
 * collection. Repeated calls resume from the last processed ID until the
 * state reaches 'completed'.
 *
 * This endpoint is fire-and-forget — it returns the status after one
 * batch. A scheduler (cron, external) calls it repeatedly until done.
 *
 * Vercel note: Each invocation must complete within the serverless timeout
 * (10s hobby / 60s pro). The batch size is tuned to fit comfortably.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runIndexBatch, getIndexStatus } from '@/lib/image-search/index-batcher'
import { connectToDatabase } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST — run one batch.
 * Body (optional JSON):
 *   { batchSize?: number, fullReindex?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    let batchSize = 25
    let fullReindex = false

    // Parse optional JSON body (ignore parse errors — defaults are fine)
    try {
      const text = await request.text()
      if (text) {
        const body = JSON.parse(text)
        if (typeof body.batchSize === 'number' && body.batchSize > 0 && body.batchSize <= 200) {
          batchSize = Math.floor(body.batchSize)
        }
        if (typeof body.fullReindex === 'boolean') {
          fullReindex = body.fullReindex
        }
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    const result = await runIndexBatch({ batchSize, fullReindex })

    return NextResponse.json({
      ...result,
      message: result.finished
        ? 'Indexing complete.'
        : `Processed ${result.batchProcessed} products this batch. Call again to continue.`,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/search/index] error:', msg)
    return NextResponse.json(
      { error: 'Indexing batch failed.', detail: msg },
      { status: 500 },
    )
  }
}

/**
 * GET — current index status.
 */
export async function GET() {
  try {
    const status = await getIndexStatus()
    return NextResponse.json(status)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/search/index] error:', msg)
    return NextResponse.json(
      { error: 'Failed to fetch index status.', detail: msg },
      { status: 500 },
    )
  }
}

/**
 * DELETE — reset index status (forces full re-index on next POST).
 */
export async function DELETE() {
  try {
    const { db } = await connectToDatabase()
    await db.collection('image_search_index_status').updateOne(
      { _id: 'global' },
      {
        $set: {
          state: 'idle',
          processed: 0,
          failed: 0,
          startedAt: null,
          finishedAt: null,
          lastError: null,
          lastProcessedId: null,
          total: 0,
        },
      },
      { upsert: true },
    )
    return NextResponse.json({ ok: true, message: 'Index status reset. Next POST will start a full re-index.' })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[DELETE /api/search/index] error:', msg)
    return NextResponse.json(
      { error: 'Failed to reset index status.', detail: msg },
      { status: 500 },
    )
  }
}
