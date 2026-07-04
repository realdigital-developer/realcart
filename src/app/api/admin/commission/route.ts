import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { DEFAULT_CATEGORY_COMMISSIONS, type CategoryCommission } from '@/lib/finance-engine'

/* ------------------------------------------------------------------ */
/*  Default commission settings                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_COMMISSION = {
  commissionRate: 10,
  deliveryFee: 49,
  pickupFee: 30,
  rtoCharge: 50,
  returnWindowDays: 7,
  autoCancelHours: 48,
  categoryCommissions: DEFAULT_CATEGORY_COMMISSIONS,
}

/* ------------------------------------------------------------------ */
/*  GET /api/admin/commission                                           */
/*  Returns current commission settings from the `settings` collection  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const settings = await db.collection('settings').findOne({ key: 'commission' })

    if (!settings) {
      return NextResponse.json({
        ...DEFAULT_COMMISSION,
        _id: null,
        updatedAt: null,
      })
    }

    // Return settings with defaults for any missing fields
    return NextResponse.json({
      commissionRate: settings.commissionRate ?? DEFAULT_COMMISSION.commissionRate,
      deliveryFee: settings.deliveryFee ?? DEFAULT_COMMISSION.deliveryFee,
      pickupFee: settings.pickupFee ?? DEFAULT_COMMISSION.pickupFee,
      rtoCharge: settings.rtoCharge ?? DEFAULT_COMMISSION.rtoCharge,
      returnWindowDays: settings.returnWindowDays ?? DEFAULT_COMMISSION.returnWindowDays,
      autoCancelHours: settings.autoCancelHours ?? DEFAULT_COMMISSION.autoCancelHours,
      categoryCommissions: settings.categoryCommissions ?? DEFAULT_COMMISSION.categoryCommissions,
      updatedAt: settings.updatedAt,
    })
  } catch (error) {
    console.error('[Commission GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch commission settings' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT /api/admin/commission                                           */
/*  Update commission settings (admin only)                             */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    // Auth check
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate and sanitize input
    const commissionRate = Number(body.commissionRate)
    const deliveryFee = Number(body.deliveryFee)
    const pickupFee = Number(body.pickupFee)
    const rtoCharge = Number(body.rtoCharge)
    const returnWindowDays = Number(body.returnWindowDays)
    const autoCancelHours = Number(body.autoCancelHours)

    // Validate ranges
    if (isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 })
    }
    if (isNaN(deliveryFee) || deliveryFee < 0) {
      return NextResponse.json({ error: 'Delivery fee must be 0 or greater' }, { status: 400 })
    }
    if (isNaN(pickupFee) || pickupFee < 0) {
      return NextResponse.json({ error: 'Return pickup fee must be 0 or greater' }, { status: 400 })
    }
    if (isNaN(rtoCharge) || rtoCharge < 0) {
      return NextResponse.json({ error: 'RTO charge must be 0 or greater' }, { status: 400 })
    }
    if (isNaN(returnWindowDays) || returnWindowDays < 1 || returnWindowDays > 365) {
      return NextResponse.json({ error: 'Return window must be between 1 and 365 days' }, { status: 400 })
    }
    if (isNaN(autoCancelHours) || autoCancelHours < 1 || autoCancelHours > 720) {
      return NextResponse.json({ error: 'Auto-cancel window must be between 1 and 720 hours' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const updateDoc = {
      key: 'commission',
      commissionRate,
      deliveryFee,
      pickupFee,
      rtoCharge,
      returnWindowDays,
      autoCancelHours,
      categoryCommissions: Array.isArray(body.categoryCommissions) ? body.categoryCommissions : DEFAULT_COMMISSION.categoryCommissions,
      updatedAt: new Date(),
    }

    await db.collection('settings').updateOne(
      { key: 'commission' },
      { $set: updateDoc },
      { upsert: true }
    )

    return NextResponse.json({
      success: true,
      commissionRate,
      deliveryFee,
      pickupFee,
      rtoCharge,
      returnWindowDays,
      autoCancelHours,
      categoryCommissions: updateDoc.categoryCommissions,
      updatedAt: updateDoc.updatedAt,
    })
  } catch (error) {
    console.error('[Commission PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update commission settings' }, { status: 500 })
  }
}
