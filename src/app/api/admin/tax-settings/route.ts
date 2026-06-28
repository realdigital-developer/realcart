import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  Default tax settings                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_TAX_SETTINGS = {
  isTaxInclusive: true,
  defaultGstRate: 18,
  platformGstin: '',
  enableGstInvoice: true,
  tdsRate: 1,
  tcsRate: 1,
  gstOnCommissionRate: 18,
  codFee: 40,
  platformFee: 5,
  deliveryBaseCharge: 49,
  freeDeliveryAbove: 499,
  deliveryPer500g: 20,
  deliveryBaseWeight: 500,
}

/* ------------------------------------------------------------------ */
/*  GET /api/admin/tax-settings                                        */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const settings = await db.collection('settings').findOne({ key: 'tax' })

    if (!settings) {
      return NextResponse.json({
        ...DEFAULT_TAX_SETTINGS,
        _id: null,
        updatedAt: null,
      })
    }

    return NextResponse.json({
      isTaxInclusive: settings.isTaxInclusive ?? DEFAULT_TAX_SETTINGS.isTaxInclusive,
      defaultGstRate: settings.defaultGstRate ?? DEFAULT_TAX_SETTINGS.defaultGstRate,
      platformGstin: settings.platformGstin ?? DEFAULT_TAX_SETTINGS.platformGstin,
      enableGstInvoice: settings.enableGstInvoice ?? DEFAULT_TAX_SETTINGS.enableGstInvoice,
      tdsRate: settings.tdsRate ?? DEFAULT_TAX_SETTINGS.tdsRate,
      tcsRate: settings.tcsRate ?? DEFAULT_TAX_SETTINGS.tcsRate,
      gstOnCommissionRate: settings.gstOnCommissionRate ?? DEFAULT_TAX_SETTINGS.gstOnCommissionRate,
      codFee: settings.codFee ?? DEFAULT_TAX_SETTINGS.codFee,
      platformFee: settings.platformFee ?? DEFAULT_TAX_SETTINGS.platformFee,
      deliveryBaseCharge: settings.deliveryBaseCharge ?? DEFAULT_TAX_SETTINGS.deliveryBaseCharge,
      freeDeliveryAbove: settings.freeDeliveryAbove ?? DEFAULT_TAX_SETTINGS.freeDeliveryAbove,
      deliveryPer500g: settings.deliveryPer500g ?? DEFAULT_TAX_SETTINGS.deliveryPer500g,
      deliveryBaseWeight: settings.deliveryBaseWeight ?? DEFAULT_TAX_SETTINGS.deliveryBaseWeight,
      updatedAt: settings.updatedAt,
    })
  } catch (error) {
    console.error('[Tax Settings GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch tax settings' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT /api/admin/tax-settings                                        */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const isTaxInclusive = body.isTaxInclusive !== undefined ? Boolean(body.isTaxInclusive) : DEFAULT_TAX_SETTINGS.isTaxInclusive
    const defaultGstRate = Number(body.defaultGstRate)
    const platformGstin = String(body.platformGstin || '').trim().toUpperCase()
    const enableGstInvoice = body.enableGstInvoice !== undefined ? Boolean(body.enableGstInvoice) : DEFAULT_TAX_SETTINGS.enableGstInvoice
    const tdsRate = Number(body.tdsRate)
    const tcsRate = Number(body.tcsRate)
    const gstOnCommissionRate = Number(body.gstOnCommissionRate)
    const codFee = Number(body.codFee)
    const platformFee = Number(body.platformFee)
    const deliveryBaseCharge = Number(body.deliveryBaseCharge)
    const freeDeliveryAbove = Number(body.freeDeliveryAbove)
    const deliveryPer500g = Number(body.deliveryPer500g)
    const deliveryBaseWeight = Number(body.deliveryBaseWeight)

    if (isNaN(defaultGstRate) || ![0, 0.25, 5, 12, 18, 28].includes(defaultGstRate)) {
      return NextResponse.json({ error: 'Default GST rate must be 0, 0.25, 5, 12, 18, or 28' }, { status: 400 })
    }
    if (platformGstin && (platformGstin.length !== 15 || !/^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(platformGstin))) {
      return NextResponse.json({ error: 'Invalid GSTIN format' }, { status: 400 })
    }
    if (isNaN(tdsRate) || tdsRate < 0 || tdsRate > 5) {
      return NextResponse.json({ error: 'TDS rate must be between 0 and 5%' }, { status: 400 })
    }
    if (isNaN(tcsRate) || tcsRate < 0 || tcsRate > 5) {
      return NextResponse.json({ error: 'TCS rate must be between 0 and 5%' }, { status: 400 })
    }
    if (isNaN(gstOnCommissionRate) || gstOnCommissionRate < 0 || gstOnCommissionRate > 28) {
      return NextResponse.json({ error: 'GST on commission rate must be between 0 and 28%' }, { status: 400 })
    }
    if (isNaN(codFee) || codFee < 0) {
      return NextResponse.json({ error: 'COD fee must be 0 or greater' }, { status: 400 })
    }
    if (isNaN(platformFee) || platformFee < 0) {
      return NextResponse.json({ error: 'Platform fee must be 0 or greater' }, { status: 400 })
    }
    if (isNaN(deliveryBaseCharge) || deliveryBaseCharge < 0) {
      return NextResponse.json({ error: 'Delivery base charge must be 0 or greater' }, { status: 400 })
    }
    if (isNaN(freeDeliveryAbove) || freeDeliveryAbove < 0) {
      return NextResponse.json({ error: 'Free delivery threshold must be 0 or greater' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const updateDoc = {
      key: 'tax',
      isTaxInclusive,
      defaultGstRate,
      platformGstin,
      enableGstInvoice,
      tdsRate,
      tcsRate,
      gstOnCommissionRate,
      codFee,
      platformFee,
      deliveryBaseCharge,
      freeDeliveryAbove,
      deliveryPer500g,
      deliveryBaseWeight,
      updatedAt: new Date(),
    }

    await db.collection('settings').updateOne(
      { key: 'tax' },
      { $set: updateDoc },
      { upsert: true }
    )

    return NextResponse.json({
      success: true,
      ...updateDoc,
    })
  } catch (error) {
    console.error('[Tax Settings PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update tax settings' }, { status: 500 })
  }
}
