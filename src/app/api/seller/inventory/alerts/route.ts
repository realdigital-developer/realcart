/**
 * Seller Inventory Alerts API
 *
 * GET /api/seller/inventory/alerts
 *   Returns the seller's inventory alerts (low stock / out of stock).
 *   Query params:
 *     - status (default 'active'; pass 'all' to fetch every status)
 *
 * POST /api/seller/inventory/alerts
 *   Body: { action, alertId? | alertIds? }
 *   Supported actions:
 *     - 'acknowledge'    : acknowledge a single alert (alertId required)
 *     - 'resolve'        : resolve a single alert (alertId required)
 *     - 'bulk_acknowledge': acknowledge many alerts (alertIds: string[] required)
 *     - 'bulk_resolve'   : resolve many alerts (alertIds: string[] required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { acknowledgeAlert, resolveAlert } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'

    const { db } = await connectToDatabase()
    const query: any = {
      $or: [{ sellerId: { $in: sellerIds } }, { sellerName: { $in: sellerIds } }],
    }
    if (status !== 'all') query.status = status

    const alerts = await db.collection('inventory_alerts')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray()

    return NextResponse.json({
      alerts: alerts.map((a) => ({ ...a, _id: a._id.toString() })),
      total: alerts.length,
    })
  } catch (error) {
    console.error('[Seller Inventory Alerts GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch alerts', message: (error as Error).message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const body = await request.json()
    const { action, alertId, alertIds } = body || {}

    const validActions = ['acknowledge', 'resolve', 'bulk_acknowledge', 'bulk_resolve']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(', ')}` },
        { status: 400 },
      )
    }

    const isBulk = action === 'bulk_acknowledge' || action === 'bulk_resolve'

    if (isBulk) {
      if (!Array.isArray(alertIds) || alertIds.length === 0) {
        return NextResponse.json(
          { error: 'alertIds must be a non-empty array for bulk actions' },
          { status: 400 },
        )
      }
      if (alertIds.length > 500) {
        return NextResponse.json(
          { error: 'Cannot process more than 500 alerts at once' },
          { status: 400 },
        )
      }

      const fn = action === 'bulk_acknowledge' ? acknowledgeAlert : resolveAlert
      let updated = 0
      let failed = 0
      const errors: string[] = []
      for (const id of alertIds) {
        const res = await fn(String(id), session.id)
        if (res.success) {
          updated++
        } else {
          failed++
          errors.push(`${id}: ${res.message}`)
        }
      }
      return NextResponse.json({
        success: true,
        action,
        updated,
        failed,
        errors,
      })
    }

    // Single-action path
    if (!alertId) {
      return NextResponse.json(
        { error: 'alertId is required for acknowledge / resolve actions' },
        { status: 400 },
      )
    }
    const fn = action === 'acknowledge' ? acknowledgeAlert : resolveAlert
    const res = await fn(String(alertId), session.id)
    if (!res.success) {
      return NextResponse.json({ error: res.message }, { status: 404 })
    }
    return NextResponse.json({ success: true, action, message: res.message })
  } catch (error) {
    console.error('[Seller Inventory Alerts POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process alert action', message: (error as Error).message },
      { status: 500 },
    )
  }
}
