/**
 * Admin Inventory Alerts API
 *
 * GET /api/admin/inventory/alerts
 *   List platform-wide inventory alerts.
 *
 *   Query params:
 *     - status (active | acknowledged | resolved | all, default active)
 *     - type (low_stock | out_of_stock | reorder)
 *     - sellerId
 *     - page (default 1)
 *     - limit (default 50, max 200)
 *
 *   Returns: { alerts, total, page, totalPages }
 *
 * POST /api/admin/inventory/alerts
 *   Acknowledge or resolve one or many alerts.
 *
 *   Body:
 *     - action: 'acknowledge' | 'resolve' | 'bulk_acknowledge' | 'bulk_resolve'
 *     - alertId?: string   (for acknowledge / resolve)
 *     - alertIds?: string[] (for bulk_acknowledge / bulk_resolve)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { acknowledgeAlert, resolveAlert } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = new Set(['active', 'acknowledged', 'resolved', 'all'])
const ALLOWED_TYPES = new Set(['low_stock', 'out_of_stock', 'reorder'])

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status') || 'active'
    const status = ALLOWED_STATUSES.has(statusParam) ? statusParam : 'active'
    const type = searchParams.get('type') || ''
    const sellerId = searchParams.get('sellerId') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const { db } = await connectToDatabase()
    const query: any = {}
    if (status !== 'all') query.status = status
    if (type && ALLOWED_TYPES.has(type)) query.type = type
    if (sellerId) {
      query.$or = [
        { sellerId },
        { seller: sellerId },
        { sellerName: sellerId },
      ]
    }

    const total = await db.collection('inventory_alerts').countDocuments(query)
    const alerts = await db.collection('inventory_alerts')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    return NextResponse.json({
      alerts: alerts.map((a) => ({ ...a, _id: a._id.toString() })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Admin Inventory Alerts GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch alerts', message: (error as Error).message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const { action, alertId, alertIds } = body as {
      action?: string
      alertId?: string
      alertIds?: string[]
    }

    const adminName = session.name || session.email || 'Admin'

    if (action === 'acknowledge') {
      if (!alertId) {
        return NextResponse.json(
          { success: false, message: 'alertId is required for acknowledge' },
          { status: 400 },
        )
      }
      const result = await acknowledgeAlert(alertId, adminName)
      return NextResponse.json(result, { status: result.success ? 200 : 400 })
    }

    if (action === 'resolve') {
      if (!alertId) {
        return NextResponse.json(
          { success: false, message: 'alertId is required for resolve' },
          { status: 400 },
        )
      }
      const result = await resolveAlert(alertId, adminName)
      return NextResponse.json(result, { status: result.success ? 200 : 400 })
    }

    if (action === 'bulk_acknowledge' || action === 'bulk_resolve') {
      if (!Array.isArray(alertIds) || alertIds.length === 0) {
        return NextResponse.json(
          { success: false, message: 'alertIds (non-empty array) is required for bulk actions' },
          { status: 400 },
        )
      }
      const fn = action === 'bulk_acknowledge' ? acknowledgeAlert : resolveAlert
      const errors: string[] = []
      let succeeded = 0
      for (const id of alertIds) {
        if (typeof id !== 'string' || !id) {
          errors.push(`${id}: invalid alertId`)
          continue
        }
        const r = await fn(id, adminName)
        if (r.success) {
          succeeded++
        } else {
          errors.push(`${id}: ${r.message}`)
        }
      }
      return NextResponse.json({
        success: true,
        message: `${succeeded} alert(s) ${action === 'bulk_acknowledge' ? 'acknowledged' : 'resolved'}, ${errors.length} failed`,
        action,
        processed: alertIds.length,
        succeeded,
        failed: errors.length,
        errors,
      })
    }

    return NextResponse.json(
      {
        success: false,
        message: "Invalid action. Must be 'acknowledge', 'resolve', 'bulk_acknowledge', or 'bulk_resolve'.",
      },
      { status: 400 },
    )
  } catch (error) {
    console.error('[Admin Inventory Alerts POST] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process alert action',
        message: (error as Error).message,
      },
      { status: 500 },
    )
  }
}
