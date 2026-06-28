import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSellerSession, SellerPayload } from '@/lib/seller-auth'
import { ObjectId } from 'mongodb'

/* ------------------------------------------------------------------ */
/*  Shared Seller Authentication Helper                                  */
/*  Used by all /api/seller/* routes to verify session + not blocked    */
/* ------------------------------------------------------------------ */

export interface AuthResult {
  error: NextResponse | null
  session: (SellerPayload & { sellerAliases: string[] }) | null
}

/**
 * Authenticate a seller request by:
 * 1. Verifying the JWT session cookie
 * 2. Checking the seller exists and is not blocked
 *
 * Returns `{ error, session }` — if `error` is not null, return it
 * immediately from the route handler.
 */
export async function authenticateSeller(request: NextRequest): Promise<AuthResult> {
  const session = await getSellerSession(request)
  if (!session) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
    }
  }

  const { db } = await connectToDatabase()
  let seller: any = null
  try {
    seller = await db.collection('sellers').findOne(
      { _id: new ObjectId(session.id) },
      { projection: { status: 1, name: 1, storeName: 1 } },
    )
  } catch {
    // _id might be stored as a string, not an ObjectId
  }
  if (!seller) {
    seller = await db.collection('sellers').findOne(
      { _id: session.id as any },
      { projection: { status: 1, name: 1, storeName: 1 } },
    )
  }

  if (!seller || seller.status === 'Blocked') {
    return {
      error: NextResponse.json(
        { error: 'Account is blocked. Contact support.' },
        { status: 403 },
      ),
      session: null,
    }
  }

  // Build seller aliases for querying — both storeName and personal name
  // This handles the case where products have seller = "Person Name" vs "Store Name"
  const sellerAliases = [session.storeName]
  if (seller.name && seller.name !== session.storeName) {
    sellerAliases.push(seller.name)
  }

  return { error: null, session: { ...session, sellerAliases } }
}
