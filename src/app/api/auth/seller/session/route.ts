import { NextRequest, NextResponse } from 'next/server'
import { getSellerSession } from '@/lib/seller-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

/**
 * GET /api/auth/seller/session
 * Check if the seller is authenticated and not blocked/rejected.
 * Verifies both JWT signature AND database record.
 * Returns status field so frontend can show Pending/Active state.
 */
export async function GET(request: NextRequest) {
  try {
    // First, check if there's a valid JWT cookie
    const session = await getSellerSession(request)

    if (!session) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    // Now verify the seller still exists in the DB and is not blocked
    const { db } = await connectToDatabase()

    let seller: any = null
    try {
      seller = await db.collection('sellers').findOne(
        { _id: new ObjectId(session.id) },
        { projection: { status: 1, name: 1, storeName: 1, email: 1, role: 1, isVerified: 1, businessType: 1 } },
      )
    } catch {
      // _id might be stored as a string, not an ObjectId
    }
    if (!seller) {
      seller = await db.collection('sellers').findOne(
        { _id: session.id as any },
        { projection: { status: 1, name: 1, storeName: 1, email: 1, role: 1, isVerified: 1, businessType: 1 } },
      )
    }

    if (!seller || seller.status === 'Blocked' || seller.status === 'Rejected') {
      // Seller doesn't exist or is blocked/rejected — clear the session cookie
      const response = NextResponse.json({ authenticated: false, user: null })
      response.cookies.set('seller-session', '', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
      return response
    }

    // Seller is valid — return authenticated user info with status
    // Use the DB name/storeName as source of truth (in case they were updated)
    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.id,
        email: seller.email || session.email,
        name: seller.name || session.name,
        storeName: seller.storeName || session.storeName,
        role: seller.role || session.role,
        status: seller.status || 'Active',
        isVerified: seller.isVerified || false,
        businessType: seller.businessType || '',
      },
    })
  } catch (error) {
    console.error('[Seller Session Error]', error)
    return NextResponse.json({ authenticated: false, user: null })
  }
}
