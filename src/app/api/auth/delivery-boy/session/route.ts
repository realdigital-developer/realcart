import { NextRequest, NextResponse } from 'next/server'
import { getDeliveryBoySession } from '@/lib/delivery-boy-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

/**
 * GET /api/auth/delivery-boy/session
 * Check if the delivery boy is authenticated and return profile info
 *
 * Response codes:
 * - authenticated: true + user data  → session is valid
 * - authenticated: false, no errorCode → JWT missing/invalid/expired (truly not logged in)
 * - authenticated: false, errorCode: 'SESSION_CHECK_ERROR' → transient server error
 *   (client should NOT de-authenticate — just retry later)
 */
export async function GET(request: NextRequest) {
  // Step 1: Verify JWT cookie
  let deliveryBoy
  try {
    deliveryBoy = await getDeliveryBoySession(request)
  } catch {
    // JWT verification itself failed unexpectedly — treat as transient
    return NextResponse.json({
      authenticated: false,
      user: null,
      errorCode: 'SESSION_CHECK_ERROR',
    })
  }

  if (!deliveryBoy) {
    // No JWT cookie or JWT is invalid/expired — user is truly not authenticated
    return NextResponse.json({ authenticated: false, user: null })
  }

  // Step 2: Fetch the latest profile data from DB (name may have changed since JWT was created)
  let isAvailable = true
  let status = 'Active'
  let name = deliveryBoy.name // fallback to JWT name
  let profileImage = ''

  try {
    const { db } = await connectToDatabase()
    let profile: any = null
    try {
      profile = await db.collection('delivery_boys').findOne(
        { _id: new ObjectId(deliveryBoy.id) },
        { projection: { isAvailable: 1, status: 1, name: 1, profileImage: 1 } },
      )
    } catch {
      profile = await db.collection('delivery_boys').findOne(
        { mobile: deliveryBoy.mobile },
        { projection: { isAvailable: 1, status: 1, name: 1, profileImage: 1 } },
      )
    }
    if (profile) {
      isAvailable = profile.isAvailable !== false
      status = profile.status || 'Active'
      // Use DB name (which may have been updated after JWT was created)
      if (profile.name) name = profile.name
      // Extract profile image URL from either string or object format
      if (profile.profileImage) {
        if (typeof profile.profileImage === 'string') {
          profileImage = profile.profileImage
        } else if (typeof profile.profileImage === 'object' && profile.profileImage.url) {
          profileImage = profile.profileImage.url
        }
      }
    }
    // If profile is null (DB lookup returned no match), still return authenticated
    // with JWT data — the delivery boy exists in the JWT, DB might just be slow
  } catch {
    // DB fetch failed — this is a transient error, NOT an auth failure.
    // Still return authenticated:true with JWT data so the client doesn't
    // de-authenticate on a transient DB outage.
    // The profile data (isAvailable, name, profileImage) will just be stale
    // from the JWT, which is acceptable.
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: deliveryBoy.id,
      mobile: deliveryBoy.mobile,
      name, // from DB, not stale JWT
      role: deliveryBoy.role,
      isAvailable,
      status,
      profileImage,
    },
  })
}
