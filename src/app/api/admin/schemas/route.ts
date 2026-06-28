import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { cacheOrCompute } from '@/lib/server-cache'

// Cache this route for 60 seconds at the Next.js level
export const revalidate = 60

/**
 * GET /api/admin/schemas
 * Database schema documentation — cached for 10 minutes since schemas rarely change.
 */
export async function GET() {
  try {
    const result = await cacheOrCompute('admin:schemas:v1', async () => {
      const { db } = await connectToDatabase()
      const schemas = await db.collection('dbschemas').find().sort({ collection: 1 }).limit(100).toArray()

      // Get live collection stats SEQUENTIALLY (not in batches) to avoid
      // concurrent cursor buffers that spike memory
      const collections = await db.listCollections().toArray()
      const stats = []

      for (const col of collections) {
        try {
          const count = await db.collection(col.name).estimatedDocumentCount()
          stats.push({ name: col.name, count, type: col.type })
        } catch {
          stats.push({ name: col.name, count: 0, type: col.type })
        }
      }

      return {
        schemas: schemas.map(s => ({ ...s, _id: s._id.toString() })),
        collectionStats: stats,
      }
    }, 600_000) // 10-minute cache (increased from 5 min — schemas rarely change)

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
