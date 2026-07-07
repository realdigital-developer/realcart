/**
 * Admin Finance — Refunds API
 *
 * GET  /api/admin/finance/refunds
 *   Query params:
 *     - status   (optional: initiated | processed | failed | pending)
 *     - orderId  (optional)
 *     - page     (default 1)
 *     - limit    (default 20)
 *   Returns { refunds, total, page, limit } sorted by createdAt desc.
 *   Each refund is enriched with the customer name (joined from orders).
 *
 * POST /api/admin/finance/refunds
 *   Body: { orderId, orderItemId?, amount, reason }
 *   Manually initiates a refund as the admin.
 *   Calls processRefund({ ..., initiatedBy: 'admin', initiatedByUserId: adminId }).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { processRefund } from '@/lib/finance-management'

const VALID_STATUSES = ['initiated', 'processed', 'failed', 'pending'] as const
type RefundStatus = (typeof VALID_STATUSES)[number]

function isRefundStatus(value: string | null): value is RefundStatus {
  return value !== null && (VALID_STATUSES as readonly string[]).includes(value)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const orderId = searchParams.get('orderId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))

    const filter: Record<string, unknown> = {}
    if (isRefundStatus(status)) {
      filter.status = status
    }
    if (orderId) {
      filter.orderId = orderId
    }

    const { db } = await connectToDatabase()

    const total = await db.collection('refunds').countDocuments(filter)

    const refundsRaw = await db.collection('refunds')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    // Batch-fetch customer names from orders for all refunds in the page
    const orderIds = Array.from(
      new Set(refundsRaw.map((r) => r.orderId).filter(Boolean) as string[]),
    )
    const orderMap = new Map<string, { customerName: string; customerPhone?: string }>()
    if (orderIds.length > 0) {
      const orders = await db.collection('orders')
        .find({ orderId: { $in: orderIds } })
        .project({ orderId: 1, 'shippingAddress.name': 1, 'customer.phone': 1, customerPhone: 1 })
        .toArray()
      for (const o of orders) {
        orderMap.set(o.orderId, {
          customerName: o.shippingAddress?.name || o.customer?.name || 'Unknown',
          customerPhone: o.customerPhone || o.customer?.phone,
        })
      }
    }

    const refunds = refundsRaw.map((r) => {
      const order = orderMap.get(r.orderId)
      return {
        ...r,
        _id: r._id.toString(),
        customerName: order?.customerName ?? 'Unknown',
        customerPhone: order?.customerPhone,
      }
    })

    return NextResponse.json({ refunds, total, page, limit })
  } catch (error) {
    console.error('[Admin Finance Refunds GET Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to fetch refunds', detail: message },
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
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { orderId, orderItemId, amount, reason } = body as {
      orderId?: string
      orderItemId?: string
      amount?: number
      reason?: string
    }

    if (!orderId || typeof orderId !== 'string' || orderId.trim().length === 0) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const result = await processRefund({
      orderId: orderId.trim(),
      orderItemId:
        typeof orderItemId === 'string' && orderItemId.trim().length > 0
          ? orderItemId.trim()
          : undefined,
      amount: Math.round(amount * 100) / 100,
      reason: reason.trim(),
      initiatedBy: 'admin',
      initiatedByUserId: session.id,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process refund' },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        refundId: result.refundId,
        gatewayRefundId: result.gatewayRefundId,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[Admin Finance Refunds POST Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to process refund', detail: message },
      { status: 500 },
    )
  }
}
