/**
 * Admin Finance — Seller Payout Detail API
 *
 * PATCH /api/admin/finance/payouts/[id]
 *   Body: { action: 'process' | 'complete', transactionRef?: string }
 *   - action: 'process' → mark payout as processed (bank transfer initiated)
 *   - action: 'complete' → mark payout as paid (bank transfer completed)
 *   The [id] param is the payoutId string (e.g. PAY-20260101-XXXX), not _id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { processPayout, completePayout } from '@/lib/finance-management'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: payoutId } = await params
    if (!payoutId || payoutId.trim().length === 0) {
      return NextResponse.json({ error: 'Payout id is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { action, transactionRef } = body as {
      action?: string
      transactionRef?: string
    }

    if (action !== 'process' && action !== 'complete') {
      return NextResponse.json(
        { error: "action must be 'process' or 'complete'" },
        { status: 400 },
      )
    }

    const txnRef =
      typeof transactionRef === 'string' && transactionRef.trim().length > 0
        ? transactionRef.trim()
        : undefined

    const result =
      action === 'process'
        ? await processPayout(payoutId, txnRef)
        : await completePayout(payoutId, txnRef)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update payout' },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, payoutId, action })
  } catch (error) {
    console.error('[Admin Finance Payout PATCH Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to update payout', detail: message },
      { status: 500 },
    )
  }
}
