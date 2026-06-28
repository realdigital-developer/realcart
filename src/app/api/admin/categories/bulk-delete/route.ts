import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { deleteCategoryImageFile } from '@/lib/upload'
import { ObjectId } from 'mongodb'

const CATEGORIES_COLLECTION = 'categories'

/**
 * POST /api/admin/categories/bulk-delete
 * Delete multiple categories by IDs.
 * Also removes associated images from Cloudinary.
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
      return NextResponse.json({ error: 'Category IDs are required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const objectIds = ids.map((id: string) => {
      try {
        return new ObjectId(id)
      } catch {
        return null
      }
    }).filter(Boolean)

    // Find the categories first to get their Cloudinary public IDs for cleanup
    const categoriesToDelete = await db.collection(CATEGORIES_COLLECTION)
      .find({ _id: { $in: objectIds } })
      .toArray()

    // Delete images from Cloudinary for each category that has one
    for (const cat of categoriesToDelete) {
      if (cat.imagePublicId) {
        await deleteCategoryImageFile(cat.imagePublicId)
      }
    }

    // Delete from MongoDB
    const result = await db.collection(CATEGORIES_COLLECTION).deleteMany({
      _id: { $in: objectIds },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    console.error('[Categories Bulk Delete Error]', error)
    return NextResponse.json({ error: 'Failed to delete categories' }, { status: 500 })
  }
}
