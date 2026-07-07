import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession, CUSTOMER_COOKIE_NAME } from '@/lib/customer-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

/**
 * GET /api/auth/customer/session
 * Check if the customer is authenticated and return user info including profile image.
 *
 * IMPORTANT: This route verifies BOTH the JWT cookie AND that the customer still
 * exists in the database. If an admin deletes the customer from MongoDB, the
 * JWT cookie (which is valid for 30 days) becomes orphaned. In that case, this
 * route clears the session cookie and returns `authenticated: false` so the
 * frontend logs the customer out.
 *
 * The DB-not-found case is distinguished from a transient DB error:
 *   - Customer NOT FOUND in DB (deleted) → clear cookie, return authenticated: false
 *   - DB lookup THROWS (transient outage) → keep session, use JWT data as fallback
 */
export async function GET(request: NextRequest) {
  try {
    const customer = await getCustomerSession(request)

    if (!customer) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    // ── Fetch FRESH customer details from DB ──────────────────────────
    // The JWT cookie bakes in name/mobile at login/registration time.
    // If the customer later updates their name/email via the profile page,
    // the JWT would be stale. To ensure the frontend ALWAYS shows the
    // latest data, we fetch the current name, email, and profileImage from
    // the DB on every session check. The JWT is only used for authentication
    // (proving the customer is logged in), not as a source of display data.
    //
    // CRITICAL: We also use this lookup to verify the customer still EXISTS
    // in the database. If the admin deletes the customer, the DB lookup
    // returns null and we must log them out (clear cookie + authenticated: false).
    let profileImageUrl: string | null = null
    let freshName = customer.name
    let freshEmail: string | null = null
    let customerExists = false

    try {
      const { db } = await connectToDatabase()
      let filter: Record<string, unknown>
      try {
        filter = { _id: new ObjectId(customer.id) }
      } catch {
        filter = { mobile: customer.mobile }
      }
      const doc = await db.collection('customers').findOne(filter, {
        projection: { name: 1, email: 1, profileImage: 1, status: 1 }
      })

      if (doc) {
        customerExists = true
        // Use DB name if it exists and is non-empty (DB is authoritative)
        if (doc.name && String(doc.name).trim()) {
          freshName = String(doc.name).trim()
        }
        freshEmail = doc.email || null
        if (doc.profileImage?.url) {
          profileImageUrl = doc.profileImage.url
        }

        // Check if the customer has been blocked since login
        if (doc.status === 'Blocked') {
          const blockedResponse = NextResponse.json({
            authenticated: false,
            user: null,
            error: 'Your account has been blocked. Please contact support.',
          })
          blockedResponse.cookies.set(CUSTOMER_COOKIE_NAME, '', {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 0,
            path: '/',
          })
          return blockedResponse
        }
      }
      // If doc is null, the customer was deleted from the DB.
      // We handle this below (customerExists === false).
    } catch {
      // DB lookup THREW an error — this is a transient issue (DB down, network
      // error), NOT a deletion. In this case, keep the session alive using JWT
      // data so the customer doesn't get logged out due to a transient outage.
      // The profile data will just be stale from the JWT, which is acceptable.
      customerExists = true // assume exists — don't log out on transient errors
    }

    // ── If the customer was NOT found in the DB, they have been deleted ──
    // Clear the session cookie and return authenticated: false so the
    // frontend shows the login screen.
    if (!customerExists) {
      const deletedResponse = NextResponse.json({
        authenticated: false,
        user: null,
        error: 'Your account no longer exists. Please contact support if this is unexpected.',
      })
      deletedResponse.cookies.set(CUSTOMER_COOKIE_NAME, '', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
      return deletedResponse
    }

    // ── Profile completion flag ──────────────────────────────────────────
    // A customer is considered "new" (profile incomplete) if they have no
    // email set. New customers just registered with mobile + passcode only,
    // so they're redirected to the profile page to complete their details
    // (name, email, profile image). Once they set an email, profileComplete
    // becomes true and the redirect no longer triggers.
    const profileComplete = !!(freshEmail && freshEmail.trim().length > 0)

    return NextResponse.json({
      authenticated: true,
      user: {
        id: customer.id,
        mobile: customer.mobile,
        name: freshName,
        email: freshEmail,
        role: customer.role,
        profileImage: profileImageUrl,
        profileComplete,
      },
    })
  } catch (error) {
    console.error('[Customer Session Error]', error)
    return NextResponse.json({ authenticated: false, user: null })
  }
}
