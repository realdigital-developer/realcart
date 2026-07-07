import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/customer/delivery/location
 * ----------------------------------------------------------
 * Returns the authenticated customer's saved delivery location
 * (pincode + state). This is stored on the customer document so it
 * is truly per-customer and syncs across devices/browsers — exactly
 * like Flipkart / Amazon / Meesho where your "Deliver to" location
 * follows your account, not the browser.
 *
 * Response:
 *   {
 *     location: { pincode: string, state?: string, updatedAt?: string } | null
 *   }
 */
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    // Try _id first, then mobile fallback (mirrors profile API pattern)
    let customerDoc: Record<string, unknown> | null = null
    try {
      customerDoc = await db.collection('customers').findOne({ _id: new ObjectId(customer.id) })
    } catch {
      // invalid ObjectId format — fall through to mobile lookup
    }
    if (!customerDoc) {
      customerDoc = await db.collection('customers').findOne({ mobile: customer.mobile })
    }

    const loc = (customerDoc?.deliveryLocation as Record<string, unknown> | undefined) || null

    if (loc && typeof loc.pincode === 'string' && /^\d{6}$/.test(loc.pincode)) {
      return NextResponse.json({
        location: {
          pincode: loc.pincode as string,
          state: typeof loc.state === 'string' ? loc.state : undefined,
          updatedAt: loc.updatedAt ? new Date(loc.updatedAt as Date).toISOString() : undefined,
        },
      })
    }

    // No saved location yet
    return NextResponse.json({ location: null })
  } catch (error) {
    console.error('[Delivery Location GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch delivery location' }, { status: 500 })
  }
}

/**
 * PUT /api/customer/delivery/location
 * ----------------------------------------------------------
 * Saves / updates the authenticated customer's delivery location.
 *
 * Body:
 *   { pincode: string, state?: string }
 *
 * This is fire-and-forget from the client side — the DeliveryChecker
 * calls it whenever the customer checks a new pincode so that the
 * location persists across devices and browsers (per-account, not
 * per-browser). Exactly mirrors how Flipkart remembers your delivery
 * pincode after you log in on a new device.
 */
export async function PUT(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const pincode = String(body.pincode || '').trim()
    const state = body.state ? String(body.state).trim().slice(0, 60) : undefined

    if (!pincode) {
      return NextResponse.json({ error: 'Pincode is required' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(pincode)) {
      return NextResponse.json({ error: 'Please enter a valid 6-digit pincode' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const deliveryLocation = {
      pincode,
      state: state || null,
      updatedAt: new Date(),
    }

    // Try _id first, then mobile fallback
    let updateResult = { matchedCount: 0 }
    try {
      updateResult = await db.collection('customers').updateOne(
        { _id: new ObjectId(customer.id) },
        { $set: { deliveryLocation, updatedAt: new Date() } },
      )
    } catch {
      // invalid ObjectId — fall through to mobile lookup
    }
    if (updateResult.matchedCount === 0) {
      await db.collection('customers').updateOne(
        { mobile: customer.mobile },
        { $set: { deliveryLocation, updatedAt: new Date() } },
      )
    }

    return NextResponse.json({
      success: true,
      location: {
        pincode: deliveryLocation.pincode,
        state: deliveryLocation.state || undefined,
        updatedAt: deliveryLocation.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[Delivery Location PUT Error]', error)
    return NextResponse.json({ error: 'Failed to save delivery location' }, { status: 500 })
  }
}
