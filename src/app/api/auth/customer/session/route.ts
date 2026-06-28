import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

/**
 * GET /api/auth/customer/session
 * Check if the customer is authenticated and return user info including profile image
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
    // latest data (fixes "user 4132" showing even after name change),
    // we fetch the current name, email, and profileImage from the DB on
    // every session check. The JWT is only used for authentication
    // (proving the customer is logged in), not as a source of display data.
    let profileImageUrl: string | null = null
    let freshName = customer.name
    let freshEmail: string | null = null
    try {
      const { db } = await connectToDatabase()
      let filter: Record<string, unknown>
      try {
        filter = { _id: new ObjectId(customer.id) }
      } catch {
        filter = { mobile: customer.mobile }
      }
      const doc = await db.collection('customers').findOne(filter, {
        projection: { name: 1, email: 1, profileImage: 1 }
      })
      if (doc) {
        // Use DB name if it exists and is non-empty (DB is authoritative)
        if (doc.name && String(doc.name).trim()) {
          freshName = String(doc.name).trim()
        }
        freshEmail = doc.email || null
        if (doc.profileImage?.url) {
          profileImageUrl = doc.profileImage.url
        }
      }
    } catch {
      // DB lookup is optional — session still works with JWT data
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: customer.id,
        mobile: customer.mobile,
        name: freshName,
        email: freshEmail,
        role: customer.role,
        profileImage: profileImageUrl,
      },
    })
  } catch (error) {
    console.error('[Customer Session Error]', error)
    return NextResponse.json({ authenticated: false, user: null })
  }
}
