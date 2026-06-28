/**
 * Admin Finance — Expenses API
 *
 * GET  /api/admin/finance/expenses
 *   Query params:
 *     - category (optional: operations | marketing | logistics | technology |
 *                          salaries | refunds | payment_gateway | cloud_infra |
 *                          legal | office | other)
 *     - status   (optional: pending | approved | paid | rejected)
 *     - page     (default 1)
 *     - limit    (default 20)
 *   Returns { expenses, total, page, limit } sorted by createdAt desc.
 *
 * POST /api/admin/finance/expenses
 *   Body: { category, description, amount, gstAmount?, vendor?,
 *           invoiceNumber?, date?, paymentMethod?, notes? }
 *   Creates a new expense with status: 'pending' and createdBy: adminId.
 *   Uses generateExpenseId() for the human-readable expenseId.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { generateExpenseId, type ExpenseRecord } from '@/lib/finance-management'

const VALID_CATEGORIES = [
  'operations',
  'marketing',
  'logistics',
  'technology',
  'salaries',
  'refunds',
  'payment_gateway',
  'cloud_infra',
  'legal',
  'office',
  'other',
] as const
type ExpenseCategory = (typeof VALID_CATEGORIES)[number]

const VALID_STATUSES = ['pending', 'approved', 'paid', 'rejected'] as const
type ExpenseStatus = (typeof VALID_STATUSES)[number]

const VALID_PAYMENT_METHODS = ['bank_transfer', 'upi', 'card', 'cash', 'cheque'] as const
type PaymentMethod = (typeof VALID_PAYMENT_METHODS)[number]

function isCategory(value: string | null): value is ExpenseCategory {
  return value !== null && (VALID_CATEGORIES as readonly string[]).includes(value)
}
function isStatus(value: string | null): value is ExpenseStatus {
  return value !== null && (VALID_STATUSES as readonly string[]).includes(value)
}
function isPaymentMethod(value: string | null): value is PaymentMethod {
  return value !== null && (VALID_PAYMENT_METHODS as readonly string[]).includes(value)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))

    const filter: Record<string, unknown> = {}
    if (isCategory(category)) {
      filter.category = category
    }
    if (isStatus(status)) {
      filter.status = status
    }

    const { db } = await connectToDatabase()

    const total = await db.collection('expenses').countDocuments(filter)

    const expensesRaw = await db.collection('expenses')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const expenses = expensesRaw.map((e) => {
      const { _id, ...rest } = e as Record<string, unknown>
      if (typeof rest.amount === 'number') {
        rest.amount = Math.round((rest.amount as number) * 100) / 100
      }
      if (typeof rest.gstAmount === 'number') {
        rest.gstAmount = Math.round((rest.gstAmount as number) * 100) / 100
      }
      return {
        ...rest,
        _id: (_id as { toString(): string }).toString(),
      }
    })

    return NextResponse.json({ expenses, total, page, limit })
  } catch (error) {
    console.error('[Admin Finance Expenses GET Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to fetch expenses', detail: message },
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

    const {
      category,
      description,
      amount,
      gstAmount,
      vendor,
      invoiceNumber,
      date,
      paymentMethod,
      notes,
    } = body as {
      category?: string
      description?: string
      amount?: number
      gstAmount?: number
      vendor?: string
      invoiceNumber?: string
      date?: string
      paymentMethod?: string
      notes?: string
    }

    if (!isCategory(category || null)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 },
      )
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    if (gstAmount !== undefined && gstAmount !== null) {
      if (typeof gstAmount !== 'number' || !isFinite(gstAmount) || gstAmount < 0) {
        return NextResponse.json(
          { error: 'gstAmount must be a non-negative number' },
          { status: 400 },
        )
      }
    }

    if (paymentMethod !== undefined && paymentMethod !== null && !isPaymentMethod(paymentMethod)) {
      return NextResponse.json(
        { error: `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` },
        { status: 400 },
      )
    }

    let expenseDate: Date
    if (date) {
      expenseDate = new Date(date)
      if (isNaN(expenseDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date format. Expected ISO string.' }, { status: 400 })
      }
    } else {
      expenseDate = new Date()
    }

    const now = new Date()
    const expense: ExpenseRecord = {
      expenseId: generateExpenseId(),
      category,
      description: description.trim(),
      amount: Math.round(amount * 100) / 100,
      gstAmount:
        typeof gstAmount === 'number'
          ? Math.round(gstAmount * 100) / 100
          : undefined,
      vendor: typeof vendor === 'string' && vendor.trim().length > 0 ? vendor.trim() : undefined,
      invoiceNumber:
        typeof invoiceNumber === 'string' && invoiceNumber.trim().length > 0
          ? invoiceNumber.trim()
          : undefined,
      date: expenseDate,
      paymentMethod: isPaymentMethod(paymentMethod || null) ? (paymentMethod as PaymentMethod) : undefined,
      status: 'pending',
      createdBy: session.id,
      notes: typeof notes === 'string' && notes.trim().length > 0 ? notes.trim() : undefined,
      createdAt: now,
      updatedAt: now,
    }

    const { db } = await connectToDatabase()
    const insertResult = await db.collection('expenses').insertOne(expense)

    return NextResponse.json(
      {
        success: true,
        expense: {
          ...expense,
          _id: insertResult.insertedId.toString(),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[Admin Finance Expenses POST Error]', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to create expense', detail: message },
      { status: 500 },
    )
  }
}
