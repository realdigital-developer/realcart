import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { ObjectId } from 'mongodb'
import {
  DEFAULT_SELLER_DELIVERY_SETTINGS,
  parsePincodeList,
  sanitizeSellerDeliverySettings,
  type SellerDeliverySettings,
  type DeliverySlaConfig,
  type ZoneSla,
} from '@/lib/delivery-engine'

export const dynamic = 'force-dynamic'

/**
 * Seller Delivery Settings API
 * ----------------------------------------------------------
 * GET  /api/seller/delivery-settings   → fetch this seller's settings
 * PUT  /api/seller/delivery-settings   → update this seller's settings
 *
 * Stored as a nested `deliverySettings` object on the seller document.
 * This keeps it co-located with the seller and lets the delivery engine
 * read both ships-from info and SLA overrides in a single seller lookup.
 *
 * The seller's shipsFromPincode / shipsFromState are auto-populated from
 * their pickupAddress (or registered address) on first GET if not set,
 * so sellers get a sensible default without manual configuration.
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

function parseSlaValue(val: unknown, fallback: ZoneSla): ZoneSla | undefined {
  if (!val || typeof val !== 'object') return undefined
  const obj = val as Record<string, unknown>
  const min = Number(obj.min)
  const max = Number(obj.max)
  if (!Number.isFinite(min) && !Number.isFinite(max)) return undefined
  return {
    min: Number.isFinite(min) && min >= 0 ? Math.floor(min) : fallback.min,
    max: Number.isFinite(max) && max >= 0 ? Math.floor(max) : fallback.max,
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: resolve seller filter                                     */
/* ------------------------------------------------------------------ */
async function getSellerFilter(sessionId: string) {
  try {
    return { _id: new ObjectId(sessionId) }
  } catch {
    return { _id: sessionId as unknown as string }
  }
}

/* ------------------------------------------------------------------ */
/*  GET                                                                */
/* ------------------------------------------------------------------ */
export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const filter = await getSellerFilter(session.id)
    const seller = (await db.collection('sellers').findOne(filter, {
      projection: { pickupAddress: 1, address: 1, deliverySettings: 1 },
    })) as Record<string, unknown> | null

    if (!seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
    }

    const nested = (seller.deliverySettings as Record<string, unknown>) || null
    const settings = sanitizeSellerDeliverySettings(nested)

    // Auto-populate ships-from from pickupAddress / address if missing
    const pickup = (seller.pickupAddress as Record<string, unknown>) || undefined
    const addr = seller.address
    const addrObj = typeof addr === 'object' && addr ? (addr as Record<string, unknown>) : undefined

    if (!settings.shipsFromPincode) {
      settings.shipsFromPincode =
        (pickup?.pincode as string) || (addrObj?.pincode as string) || undefined
    }
    if (!settings.shipsFromState) {
      settings.shipsFromState =
        (pickup?.state as string) || (addrObj?.state as string) || undefined
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('[Seller Delivery Settings GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch delivery settings' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT                                                                */
/* ------------------------------------------------------------------ */
export async function PUT(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const body = await request.json()

    // --- Validate scalars ---
    const shipsFromPincode = String(body.shipsFromPincode || '').trim()
    const shipsFromState = String(body.shipsFromState || '').trim()
    const handlingDays = Number(body.handlingDays)
    const codAvailable = Boolean(body.codAvailable)
    const expressAvailable = Boolean(body.expressAvailable)

    if (shipsFromPincode && !/^\d{6}$/.test(shipsFromPincode)) {
      return NextResponse.json({ error: 'Ships-from pincode must be 6 digits' }, { status: 400 })
    }
    if (!Number.isFinite(handlingDays) || handlingDays < 0 || handlingDays > 14) {
      return NextResponse.json({ error: 'Handling time must be between 0 and 14 days' }, { status: 400 })
    }

    // --- Parse optional per-zone custom SLA overrides ---
    const inputSla = (body.customSla && typeof body.customSla === 'object' ? body.customSla : {}) as Record<string, unknown>
    const customSla: Partial<DeliverySlaConfig> = {}
    for (const key of SLA_KEYS) {
      const fallback = DEFAULT_SELLER_DELIVERY_SETTINGS
      // Use platform defaults as the reference fallback for validation
      const ref: ZoneSla = { min: 1, max: 2 }
      const parsed = parseSlaValue(inputSla[key], ref)
      if (parsed) {
        // Sanity: min <= max
        if (parsed.min > parsed.max) {
          customSla[key] = { min: parsed.max, max: parsed.max }
        } else {
          customSla[key] = parsed
        }
      }
    }
    // Only store customSla if at least one zone was provided
    const customSlaToStore = Object.keys(customSla).length > 0 ? customSla : undefined

    // Ignore sameDayPincodes input from sellers (that's admin-only).

    const updateDoc: SellerDeliverySettings = {
      shipsFromPincode: shipsFromPincode || undefined,
      shipsFromState: shipsFromState || undefined,
      handlingDays: Math.floor(handlingDays),
      codAvailable,
      expressAvailable,
      customSla: customSlaToStore,
      updatedAt: new Date().toISOString(),
    }

    const { db } = await connectToDatabase()
    const filter = await getSellerFilter(session.id)

    await db.collection('sellers').updateOne(filter, {
      $set: { deliverySettings: updateDoc, updatedAt: new Date() },
    })

    return NextResponse.json({ success: true, settings: updateDoc })
  } catch (error) {
    console.error('[Seller Delivery Settings PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update delivery settings' }, { status: 500 })
  }
}
