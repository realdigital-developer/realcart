import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getDeliveryBoySession, DeliveryBoyPayload } from '@/lib/delivery-boy-auth'
import { ObjectId } from 'mongodb'

/* ------------------------------------------------------------------ */
/*  Shared Delivery Boy Authentication Helper                           */
/*  Used by all /api/delivery-boy/* routes to verify session + active  */
/* ------------------------------------------------------------------ */

export interface DeliveryBoyAuthResult {
  error: NextResponse | null
  session: DeliveryBoyPayload | null
}

/**
 * Authenticate a delivery boy request by:
 * 1. Verifying the JWT session cookie
 * 2. Checking the delivery boy exists and is not blocked/inactive
 *
 * Returns `{ error, session }` — if `error` is not null, return it
 * immediately from the route handler.
 *
 * Error codes:
 * - 401: No valid JWT cookie (session expired or never logged in)
 * - 500: Database connectivity issue (transient — client should retry)
 * - 403: Account is blocked or not found in the database
 */
export async function authenticateDeliveryBoy(request: NextRequest): Promise<DeliveryBoyAuthResult> {
  const session = await getDeliveryBoySession(request)
  if (!session) {
    return {
      error: NextResponse.json({ error: 'Unauthorized', code: 'SESSION_EXPIRED' }, { status: 401 }),
      session: null,
    }
  }

  let deliveryBoy: Record<string, unknown> | null = null
  let dbError = false

  try {
    const { db } = await connectToDatabase()

    // Try ObjectId lookup first (most common path)
    try {
      deliveryBoy = await db.collection('delivery_boys').findOne(
        { _id: new ObjectId(session.id) },
        { projection: { status: 1, name: 1, mobile: 1, isAvailable: 1 } },
      )
    } catch {
      // ObjectId might be stored as a string — fallback to mobile lookup
    }

    // Fallback: lookup by mobile number
    if (!deliveryBoy) {
      try {
        deliveryBoy = await db.collection('delivery_boys').findOne(
          { mobile: session.mobile },
          { projection: { status: 1, name: 1, mobile: 1, isAvailable: 1 } },
        )
      } catch {
        // DB lookup by mobile also failed — likely a transient DB error
        dbError = true
      }
    }
  } catch {
    // connectToDatabase() failed — transient DB connectivity issue
    dbError = true
  }

  // If we had a DB connectivity error, return 500 so the client knows to retry
  // (instead of 403 which would imply the account is blocked)
  if (dbError && !deliveryBoy) {
    return {
      error: NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again.', code: 'DB_ERROR' },
        { status: 500 },
      ),
      session: null,
    }
  }

  if (!deliveryBoy || deliveryBoy.status === 'Blocked') {
    return {
      error: NextResponse.json(
        { error: 'Account is blocked or inactive. Contact support.', code: 'ACCOUNT_BLOCKED' },
        { status: 403 },
      ),
      session: null,
    }
  }

  // Return session with latest DB name (JWT may have stale name after profile update)
  return {
    error: null,
    session: {
      ...session,
      name: (deliveryBoy.name as string) || session.name,
    },
  }
}
