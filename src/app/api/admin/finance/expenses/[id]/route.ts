/**
 * Admin Finance — Expense Detail API
 *
 * PATCH /api/admin/finance/expenses/[id]
 *   Body: { status: 'approved' | 'paid' | 'rejected' }
 *   Updates the status of an expense record.
 *   The [id] param is the MongoDB _id of the expense document.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'

const VALID_STATUSES = ['approved', 'paid', 'rejected'] as const
type UpdateStatus = (typeof VALID_STATUSES)[number]

function isUpdateStatus(value: string | null): value is UpdateStatus {
  return value !== null && (VALID_STATUSES as readonly string[]).includes(value)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid expense id' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { status } = body as { status?: string }
    if (!isUpdateStatus(status || null)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }

    const { db } = await connectToDatabase()
    const now = new Date()

    const updateFields: Record<string, unknown> = {
      status,
      updatedAt: now,
      updatedBy: session.id,
    }
    if (status === 'approved') updateFields.approvedAt = now
    if (status === 'paid') updateFields.paidAt = now

    const result = await db.collection('expenses').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields },
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, id, status })
  } catch (error) {
    console.error('[Admin Finance Expense PATCH Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to update expense', detail: message },
      { status: 500 },
    )
  }
}
