import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { ObjectId } from 'mongodb'

const HIGHLIGHTS_COLLECTION = 'highlights'

/**
 * POST /api/admin/highlights/bulk-delete
 * Delete multiple highlights by IDs.
 * Body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Highlight IDs are required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const objectIds = ids.map((id: string) => {
      try {
        return new ObjectId(id)
      } catch {
        return null
      }
    }).filter(Boolean)

    // Delete from MongoDB
    const result = await db.collection(HIGHLIGHTS_COLLECTION).deleteMany({
      _id: { $in: objectIds },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    console.error('[Highlights Bulk Delete Error]', error)
    return NextResponse.json({ error: 'Failed to delete highlights' }, { status: 500 })
  }
}
