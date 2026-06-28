import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import {
  getDeliveryEstimate,
  getDeliveryOptions,
  resolveDeliveryOption,
  sanitizeDeliverySettings,
  sanitizeSellerDeliverySettings,
  DEFAULT_DELIVERY_SETTINGS,
  type DeliverySettings,
  type SellerDeliverySettings,
  type DeliveryEstimate,
  type DeliveryOptionSnapshot,
} from '@/lib/delivery-engine'

export const dynamic = 'force-dynamic'

/**
 * POST /api/customer/delivery/check
 * ----------------------------------------------------------
 * Estimate delivery for a product (or cart) to a given pincode.
 *
 * Body:
 *   {
 *     pincode: string,            // 6-digit destination pincode (required)
 *     state?: string,             // destination state (improves zoning accuracy)
 *     productId?: string,         // single-product estimate (product page)
 *     items?: Array<{             // cart estimate (cart / checkout)
 *       productId: string,
 *       quantity: number,
 *       effectivePrice?: number,
 *     }>,
 *     option?: 'standard' | 'express',  // optional — pre-select an option
 *   }
 *
 * Response:
 *   {
 *     estimate: DeliveryEstimate,           // full engine estimate (legacy)
 *     options: DeliveryOptionSnapshot[],    // UI-ready list for radio selector
 *     selected: {                           // resolved option (matches `option`
 *                                          //   param, or first available)
 *       option, label, charge, isFree, dateMin, dateMax, etaLabel
 *     },
 *     pincode: string,
 *     state?: string,
 *   }
 *
 * Public: works for both logged-in customers and guests (no auth required)
 * so the product-page pincode checker works before login, exactly like
 * Flipkart / Amazon.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const pincode = String(body.pincode || '').trim()
    const state = body.state ? String(body.state).trim() : undefined
    const productId = body.productId ? String(body.productId) : undefined
    const items = Array.isArray(body.items) ? body.items : undefined

    if (!pincode) {
      return NextResponse.json({ error: 'Pincode is required' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(pincode)) {
      return NextResponse.json({ error: 'Please enter a valid 6-digit pincode' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // --- Load platform delivery settings ---
    const settingsDoc = await db.collection('settings').findOne({ key: 'delivery' })
    const settings: DeliverySettings = sanitizeDeliverySettings(settingsDoc as Record<string, unknown> | null)

    // --- Resolve product(s) to get seller + shipping overrides ---
    let cartTotal = 0
    let productFreeDelivery: boolean | undefined
    let productDeliveryCharge: number | undefined
    let productFreeDeliveryAbove: number | undefined
    let sellerId: string | undefined
    let sellerShipsFromPincode: string | undefined
    let sellerShipsFromState: string | undefined

    const productIds: string[] = []
    if (productId) productIds.push(productId)
    if (items && items.length > 0) {
      for (const it of items as Array<{ productId: string }>) {
        if (it.productId) productIds.push(String(it.productId))
      }
    }

    if (productIds.length > 0) {
      // Convert to ObjectId where possible (fall back to raw string for legacy)
      const objectIds: ObjectId[] = []
      const stringIds: string[] = []
      for (const id of productIds) {
        try {
          objectIds.push(new ObjectId(id))
        } catch {
          stringIds.push(id)
        }
      }
      const findFilter = {
        $or: [
          ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : []),
          ...(stringIds.length > 0 ? [{ _id: { $in: stringIds } }] : []),
        ],
      }

      const products = await db.collection('products').find(findFilter).toArray()

      // Aggregate cart total + capture the FIRST product's shipping overrides
      // (for single-product checks this is exact; for cart checks we use the
      // total and the dominant product's overrides as a reasonable estimate).
      for (const p of products) {
        const qty = items
          ? (items as Array<{ productId: string; quantity: number; effectivePrice?: number }>).find(
              (i) => String(i.productId) === String(p._id),
            )?.quantity || 1
          : 1
        const eff =
          items
            ? (items as Array<{ productId: string; quantity: number; effectivePrice?: number }>).find(
                (i) => String(i.productId) === String(p._id),
              )?.effectivePrice
            : undefined
        const price = eff ?? (p.effectivePrice as number) ?? (p.sellingPrice as number) ?? 0
        cartTotal += price * qty

        // Capture first product's overrides + sellerId
        if (productFreeDelivery === undefined) {
          productFreeDelivery = Boolean(p.freeDelivery)
          const shipping = p.shipping as Record<string, unknown> | undefined
          productDeliveryCharge =
            typeof shipping?.deliveryCharge === 'number' ? (shipping.deliveryCharge as number) : undefined
          productFreeDeliveryAbove =
            typeof shipping?.freeDeliveryAbove === 'number' ? (shipping.freeDeliveryAbove as number) : undefined
          sellerId = (p.sellerId as string) || (p.seller as string) || undefined
        }
      }
    }

    // --- Load seller delivery settings (if sellerId resolved) ---
    let sellerSettings: SellerDeliverySettings | undefined
    if (sellerId) {
      // Try to load the seller doc for ships-from info + delivery settings
      let sellerDoc: Record<string, unknown> | null = null
      try {
        sellerDoc = (await db.collection('sellers').findOne({ _id: new ObjectId(sellerId) })) as Record<string, unknown> | null
      } catch {
        sellerDoc = (await db.collection('sellers').findOne({ _id: sellerId as unknown as string })) as Record<string, unknown> | null
      }
      if (sellerDoc) {
        // Seller delivery settings (nested under deliverySettings) or fallback to pickup address
        const nested = (sellerDoc.deliverySettings as Record<string, unknown>) || undefined
        sellerSettings = sanitizeSellerDeliverySettings(nested || null)

        // If seller hasn't configured ships-from pincode/state, fall back to
        // their pickupAddress or registered address.
        const pickup = (sellerDoc.pickupAddress as Record<string, unknown>) || undefined
        const addr = (sellerDoc.address as Record<string, unknown> | string) || undefined
        if (!sellerSettings.shipsFromPincode) {
          sellerSettings.shipsFromPincode =
            (pickup?.pincode as string) ||
            (typeof addr === 'object' && addr ? (addr.pincode as string) : undefined) ||
            undefined
        }
        if (!sellerSettings.shipsFromState) {
          sellerSettings.shipsFromState =
            (pickup?.state as string) ||
            (typeof addr === 'object' && addr ? (addr.state as string) : undefined) ||
            undefined
        }
      }
    }

    // --- Compute estimate ---
    const estimate = getDeliveryEstimate({
      customerPincode: pincode,
      customerState: state,
      seller: sellerSettings,
      cartTotal,
      productFreeDelivery,
      productDeliveryCharge,
      productFreeDeliveryAbove,
      settings,
    })

    // --- Build UI-ready options + resolve the selected option ---
    // `options` is a UI-ready list (standard always present; express only
    // when the engine determined it's actually faster and available).
    // `selected` is the authoritative resolution of the requested option
    // (falls back to standard if express was requested but not available).
    const options: DeliveryOptionSnapshot[] = getDeliveryOptions(estimate)
    const requestedOption =
      body.option === 'express' || body.option === 'standard'
        ? (body.option as 'standard' | 'express')
        : 'standard'
    const resolved = resolveDeliveryOption(estimate, requestedOption)

    // Best-effort city hint: if we know the customer's state we return it;
    // a full pincode→city DB is intentionally not bundled (keeps the feature
    // self-contained). The UI shows "Deliver to {pincode}" + state if known.
    return NextResponse.json({
      estimate,
      options,
      selected: {
        option: resolved.option,
        label: resolved.label,
        charge: resolved.charge,
        isFree: resolved.isFree,
        dateMin: resolved.dateMin,
        dateMax: resolved.dateMax,
        etaLabel:
          options.find((o) => o.id === resolved.option)?.etaLabel || '',
      },
      pincode,
      state,
    })
  } catch (error) {
    console.error('[Delivery Check POST Error]', error)
    return NextResponse.json(
      { error: 'Failed to check delivery. Please try again.' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/customer/delivery/check?pincode=XXXXXX&state=...
 * ----------------------------------------------------------
 * Lightweight lookup — returns just serviceability + zone + a default
 * estimate using platform settings (no product context). Used by the
 * product page to pre-fill the checker when the customer is logged in.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pincode = (searchParams.get('pincode') || '').trim()
    const state = searchParams.get('state') || undefined

    if (!pincode) {
      return NextResponse.json({ error: 'Pincode is required' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(pincode)) {
      return NextResponse.json({ error: 'Please enter a valid 6-digit pincode' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const settingsDoc = await db.collection('settings').findOne({ key: 'delivery' })
    const settings = sanitizeDeliverySettings(settingsDoc as Record<string, unknown> | null)

    // No seller context here — use defaults (1-day handling, no ships-from).
    const estimate = getDeliveryEstimate({
      customerPincode: pincode,
      customerState: state,
      cartTotal: 0,
      settings,
    })

    return NextResponse.json({ estimate, pincode, state })
  } catch (error) {
    console.error('[Delivery Check GET Error]', error)
    // Fallback to defaults so the UI never breaks even if DB is unreachable
    const fallback = getDeliveryEstimate({
      customerPincode: '',
      cartTotal: 0,
      settings: { ...DEFAULT_DELIVERY_SETTINGS },
    })
    return NextResponse.json({ estimate: fallback, error: 'Lookup failed' }, { status: 500 })
  }
}
