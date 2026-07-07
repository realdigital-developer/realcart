import { NextRequest, NextResponse } from 'next/server'
import { getDeliveryBoySession } from '@/lib/delivery-boy-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

const DELIVERY_BOY_COOKIE_NAME = 'delivery-boy-session'

/**
 * GET /api/auth/delivery-boy/session
 * Check if the delivery boy is authenticated and return profile info.
 *
 * IMPORTANT: This route verifies BOTH the JWT cookie AND that the delivery boy
 * still exists in the database. If an admin deletes the delivery boy from
 * MongoDB, the JWT cookie becomes orphaned. In that case, this route clears
 * the session cookie and returns `authenticated: false` so the frontend logs
 * the delivery boy out.
 *
 * The DB-not-found case is distinguished from a transient DB error:
 *   - Delivery boy NOT FOUND in DB (deleted) → clear cookie, return authenticated: false
 *   - DB lookup THROWS (transient outage) → keep session, use JWT data as fallback
 *
 * Response codes:
 * - authenticated: true + user data  → session is valid
 * - authenticated: false, no errorCode → JWT missing/invalid/expired OR account deleted/blocked
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
  // CRITICAL: This also verifies the delivery boy still EXISTS in the database.
  // If an admin deleted them, the DB lookup returns null and we must log them out.
  let isAvailable = true
  let status = 'Active'
  let name = deliveryBoy.name // fallback to JWT name
  let profileImage = ''
  let deliveryBoyExists = false

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
      deliveryBoyExists = true
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

      // Check if the delivery boy has been blocked since login
      if (status === 'Blocked') {
        const blockedResponse = NextResponse.json({
          authenticated: false,
          user: null,
          error: 'Your account has been blocked. Please contact support.',
        })
        blockedResponse.cookies.set(DELIVERY_BOY_COOKIE_NAME, '', {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 0,
          path: '/',
        })
        return blockedResponse
      }
    }
    // If profile is null, the delivery boy was deleted from the DB.
    // We handle this below (deliveryBoyExists === false).
  } catch {
    // DB fetch THREW — this is a transient error, NOT a deletion.
    // Keep the session alive using JWT data so the client doesn't
    // de-authenticate on a transient DB outage.
    deliveryBoyExists = true // assume exists — don't log out on transient errors
  }

  // ── If the delivery boy was NOT found in the DB, they have been deleted ──
  // Clear the session cookie and return authenticated: false so the
  // frontend shows the login screen.
  if (!deliveryBoyExists) {
    const deletedResponse = NextResponse.json({
      authenticated: false,
      user: null,
      error: 'Your account no longer exists. Please contact support if this is unexpected.',
    })
    deletedResponse.cookies.set(DELIVERY_BOY_COOKIE_NAME, '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
    return deletedResponse
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
