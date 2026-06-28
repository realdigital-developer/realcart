/* ------------------------------------------------------------------ */
/*  Admin Products Bulk Operations API                                 */
/*  Allows admin to perform bulk actions on multiple products at once: */
/*  approve, reject, delete, publish, suspend, activate               */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { cacheInvalidate } from '@/lib/server-cache'
import { deleteFile } from '@/lib/upload'
import type { ProductStatus } from '@/lib/product-types'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  Valid bulk actions                                                  */
/* ------------------------------------------------------------------ */

type BulkAction = 'approve' | 'reject' | 'delete' | 'publish' | 'suspend' | 'activate'

const VALID_ACTIONS: BulkAction[] = ['approve', 'reject', 'delete', 'publish', 'suspend', 'activate']

/* ------------------------------------------------------------------ */
/*  POST /api/admin/products/bulk                                      */
/*  Body: { action, ids, reason? }                                    */
/*  Returns: { success, processed, failed, errors }                   */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()

    const { action, ids, reason } = body

    // ── Validate action ──
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 },
      )
    }

    // ── Validate ids ──
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids must be a non-empty array of product IDs' },
        { status: 400 },
      )
    }

    // Validate all IDs are valid ObjectIds
    const invalidIds = ids.filter((id: string) => !ObjectId.isValid(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Invalid product IDs: ${invalidIds.join(', ')}` },
        { status: 400 },
      )
    }

    // ── Validate rejection requires reason ──
    if (action === 'reject' && !reason?.trim()) {
      return NextResponse.json(
        { error: 'Reason (approvalNotes) is required when rejecting products' },
        { status: 400 },
      )
    }

    // ── Verify all IDs exist in the database ──
    const objectIds = ids.map((id: string) => new ObjectId(id))
    const existingProducts = await db.collection('products')
      .find({ _id: { $in: objectIds } })
      .project({ _id: 1, images: 1, imageUrl: 1 })
      .toArray()

    const existingIds = new Set(existingProducts.map(p => p._id.toString()))
    const missingIds = ids.filter((id: string) => !existingIds.has(id))

    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Products not found: ${missingIds.join(', ')}` },
        { status: 400 },
      )
    }

    // ── Execute bulk action ──
    const now = new Date()
    let processed = 0
    let failed = 0
    const errors: Array<{ id: string; error: string }> = []

    switch (action as BulkAction) {
      case 'approve': {
        const result = await db.collection('products').updateMany(
          { _id: { $in: objectIds } },
          { $set: { status: 'Approved' as ProductStatus, approvedAt: now, updatedAt: now } },
        )
        processed = result.modifiedCount
        break
      }

      case 'reject': {
        const result = await db.collection('products').updateMany(
          { _id: { $in: objectIds } },
          { $set: { status: 'Rejected' as ProductStatus, approvalNotes: reason.trim(), updatedAt: now } },
        )
        processed = result.modifiedCount
        break
      }

      case 'delete': {
        // Delete images from Cloudinary first (best-effort)
        for (const product of existingProducts) {
          const images = product.images as Array<{ publicId?: string }> | undefined
          if (Array.isArray(images)) {
            for (const img of images) {
              if (img.publicId) {
                try {
                  await deleteFile(img.publicId, 'image')
                } catch (deleteError) {
                  console.warn(
                    `[Bulk DELETE] Failed to delete image ${img.publicId}:`,
                    deleteError,
                  )
                }
              }
            }
          }

          // Also try to delete legacy imageUrl
          if (product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.includes('cloudinary')) {
            try {
              const urlParts = product.imageUrl.split('/')
              const uploadIdx = urlParts.indexOf('upload')
              if (uploadIdx >= 0 && urlParts.length > uploadIdx + 2) {
                const publicIdParts = urlParts.slice(uploadIdx + 2)
                const lastPart = publicIdParts.join('/')
                const publicId = lastPart.replace(/\.[^.]+$/, '')
                if (publicId) await deleteFile(publicId, 'image')
              }
            } catch {
              // Best-effort
            }
          }
        }

        const result = await db.collection('products').deleteMany({
          _id: { $in: objectIds },
        })
        processed = result.deletedCount
        break
      }

      case 'publish': {
        const result = await db.collection('products').updateMany(
          { _id: { $in: objectIds } },
          {
            $set: {
              status: 'Published' as ProductStatus,
              publishedAt: now,
              updatedAt: now,
              // Also set approvedAt if not already set
            },
          },
        )
        processed = result.modifiedCount

        // Ensure approvedAt is set for any products that don't have it yet
        await db.collection('products').updateMany(
          { _id: { $in: objectIds }, approvedAt: null },
          { $set: { approvedAt: now } },
        )
        break
      }

      case 'suspend': {
        const result = await db.collection('products').updateMany(
          { _id: { $in: objectIds } },
          { $set: { status: 'Suspended' as ProductStatus, updatedAt: now } },
        )
        processed = result.modifiedCount
        break
      }

      case 'activate': {
        const result = await db.collection('products').updateMany(
          { _id: { $in: objectIds } },
          { $set: { active: true, updatedAt: now } },
        )
        processed = result.modifiedCount
        break
      }
    }

    // ── Invalidate product caches ──
    cacheInvalidate('products:')
    cacheInvalidate('admin:products:')

    return NextResponse.json({
      success: true,
      action,
      processed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('[Admin Products Bulk POST Error]', error)
    return NextResponse.json({ error: 'Failed to perform bulk action' }, { status: 500 })
  }
}
