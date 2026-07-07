import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import {
  DEFAULT_DELIVERY_SETTINGS,
  parsePincodeList,
  sanitizeDeliverySettings,
  type DeliverySettings,
  type DeliverySlaConfig,
  type ZoneSla,
} from '@/lib/delivery-engine'

export const dynamic = 'force-dynamic'

/**
 * Admin Delivery Settings API
 * ----------------------------------------------------------
 * GET  /api/admin/delivery-settings      → fetch current settings
 * PUT  /api/admin/delivery-settings      → update settings (upsert)
 *
 * Stored in the `settings` collection with key='delivery', separate from
 * the existing key='tax' settings (which already holds delivery charge /
 * free-above for finance). This keeps delivery-estimation concerns isolated
 * while the tax settings remain the source of truth for finance/payouts.
 *
 * On GET, if no delivery settings exist yet, the admin tax-settings values
 * (freeDeliveryAbove, deliveryBaseCharge, codFee) are merged in as defaults
 * so the admin sees a consistent single view.
 */

const SLA_KEYS: (keyof DeliverySlaConfig)[] = [
  'sameCity',
  'sameState',
  'regional',
  'national',
  'expressSameCity',
  'expressSameState',
  'expressRegional',
  'expressNational',
]

function parseSlaValue(val: unknown, fallback: ZoneSla, fallbackSrc: ZoneSla): ZoneSla {
  const obj = (val && typeof val === 'object' ? val : {}) as Record<string, unknown>
  const min = Number(obj.min)
  const max = Number(obj.max)
  return {
    min: Number.isFinite(min) && min >= 0 ? Math.floor(min) : (fallbackSrc.min ?? fallback.min ?? 0),
    max: Number.isFinite(max) && max >= 0 ? Math.floor(max) : (fallbackSrc.max ?? fallback.max ?? 0),
  }
}

/* ------------------------------------------------------------------ */
/*  GET                                                                */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    const deliveryDoc = await db.collection('settings').findOne({ key: 'delivery' })
    const base = sanitizeDeliverySettings(deliveryDoc as Record<string, unknown> | null)

    // Merge in admin tax-settings defaults for the shared fields so the admin
    // sees a single consistent view. Delivery settings take priority.
    const taxDoc = await db.collection('settings').findOne({ key: 'tax' })
    const tax = (taxDoc as Record<string, unknown>) || {}

    const merged: DeliverySettings = {
      ...base,
      freeDeliveryAbove:
        typeof tax.freeDeliveryAbove === 'number' ? tax.freeDeliveryAbove : base.freeDeliveryAbove,
      deliveryBaseCharge:
        typeof tax.deliveryBaseCharge === 'number' ? tax.deliveryBaseCharge : base.deliveryBaseCharge,
      codFee: typeof tax.codFee === 'number' ? tax.codFee : base.codFee,
    }

    return NextResponse.json(merged)
  } catch (error) {
    console.error('[Admin Delivery Settings GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch delivery settings' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT                                                                */
/* ------------------------------------------------------------------ */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // --- Parse & validate scalars ---
    const freeDeliveryAbove = Number(body.freeDeliveryAbove)
    const deliveryBaseCharge = Number(body.deliveryBaseCharge)
    const codFee = Number(body.codFee)
    const expressSurcharge = Number(body.expressSurcharge)
    const defaultHandlingDays = Number(body.defaultHandlingDays)

    if (!Number.isFinite(freeDeliveryAbove) || freeDeliveryAbove < 0) {
      return NextResponse.json({ error: 'Free delivery threshold must be 0 or greater' }, { status: 400 })
    }
    if (!Number.isFinite(deliveryBaseCharge) || deliveryBaseCharge < 0) {
      return NextResponse.json({ error: 'Delivery base charge must be 0 or greater' }, { status: 400 })
    }
    if (!Number.isFinite(codFee) || codFee < 0) {
      return NextResponse.json({ error: 'COD fee must be 0 or greater' }, { status: 400 })
    }
    if (!Number.isFinite(expressSurcharge) || expressSurcharge < 0) {
      return NextResponse.json({ error: 'Express surcharge must be 0 or greater' }, { status: 400 })
    }
    if (!Number.isFinite(defaultHandlingDays) || defaultHandlingDays < 0 || defaultHandlingDays > 10) {
      return NextResponse.json({ error: 'Default handling days must be between 0 and 10' }, { status: 400 })
    }

    // --- Parse SLA config ---
    const inputSla = (body.sla && typeof body.sla === 'object' ? body.sla : {}) as Record<string, unknown>
    const sla: DeliverySlaConfig = { ...DEFAULT_DELIVERY_SETTINGS.sla }
    for (const key of SLA_KEYS) {
      const fallbackSrc = (DEFAULT_DELIVERY_SETTINGS.sla[key] ?? { min: 1, max: 2 }) as ZoneSla
      sla[key] = parseSlaValue(inputSla[key], fallbackSrc, fallbackSrc)
      // Sanity: min <= max
      if (sla[key]!.min > sla[key]!.max) {
        sla[key] = { min: sla[key]!.max, max: sla[key]!.max }
      }
    }

    // --- Parse pincode lists ---
    const blockedPincodes = parsePincodeList(String(body.blockedPincodesRaw || ''))
    const sameDayPincodes = parsePincodeList(String(body.sameDayPincodesRaw || ''))

    const updateDoc: DeliverySettings & { key: string; updatedAt: Date } = {
      key: 'delivery',
      freeDeliveryAbove,
      deliveryBaseCharge,
      codFee,
      expressEnabled: Boolean(body.expressEnabled),
      expressSurcharge,
      sameDayEnabled: Boolean(body.sameDayEnabled),
      sameDayPincodes,
      defaultHandlingDays,
      blockedPincodes,
      sla,
      updatedAt: new Date(),
    }

    const { db } = await connectToDatabase()
    await db.collection('settings').updateOne(
      { key: 'delivery' },
      { $set: updateDoc },
      { upsert: true },
    )

    // Also mirror the shared finance fields back into tax-settings so the
    // checkout / finance engine stays consistent. (Backward compatible —
    // only updates these 3 fields, leaves all other tax fields intact.)
    await db.collection('settings').updateOne(
      { key: 'tax' },
      {
        $set: {
          freeDeliveryAbove,
          deliveryBaseCharge,
          codFee,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    )

    return NextResponse.json({ success: true, ...updateDoc })
  } catch (error) {
    console.error('[Admin Delivery Settings PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update delivery settings' }, { status: 500 })
  }
}
