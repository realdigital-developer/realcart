import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyPassword, createSellerSessionResponse } from '@/lib/seller-auth'

const SELLERS_COLLECTION = 'sellers'

/**
 * POST /api/auth/seller/login
 * Login existing seller with email + password
 * Body: { email: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = (body.email || '').trim().toLowerCase()
    const password = body.password || ''

    if (!email) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 })
    }

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Find seller by email
    const seller = await db.collection(SELLERS_COLLECTION).findOne({ email })

    if (!seller) {
      return NextResponse.json(
        { error: 'No account found with this email. Please register first.' },
        { status: 404 }
      )
    }

    if (seller.status === 'Blocked') {
      return NextResponse.json(
        { error: 'Your account has been blocked. Please contact support.' },
        { status: 403 }
      )
    }

    if (seller.status === 'Rejected') {
      return NextResponse.json(
        { error: 'Your seller application has been rejected. Please contact support for more details.' },
        { status: 403 }
      )
    }

    // Verify password
    const isValid = await verifyPassword(password, seller.passwordHash)

    if (!isValid) {
      // Track failed attempts
      const failedAttempts = (seller.failedLoginAttempts || 0) + 1
      const updateData: Record<string, unknown> = {
        failedLoginAttempts: failedAttempts,
        lastFailedAttempt: new Date(),
      }

      // Block after 5 failed attempts
      if (failedAttempts >= 5) {
        updateData.status = 'Blocked'
        updateData.blockedAt = new Date()
        updateData.blockedReason = 'Too many failed login attempts'
      }

      await db.collection(SELLERS_COLLECTION).updateOne(
        { _id: seller._id },
        { $set: updateData }
      )

      const remaining = Math.max(0, 5 - failedAttempts)
      return NextResponse.json(
        {
          error: remaining > 0
            ? `Invalid password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Your account has been blocked due to too many failed attempts.',
        },
        { status: 401 }
      )
    }

    // Reset failed attempts on successful login
    await db.collection(SELLERS_COLLECTION).updateOne(
      { _id: seller._id },
      {
        $set: {
          failedLoginAttempts: 0,
          lastFailedAttempt: null,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      }
    )

    // Create session
    const response = await createSellerSessionResponse({
      id: seller._id.toString(),
      email: seller.email,
      name: seller.name,
      storeName: seller.storeName || '',
      role: 'seller',
    })

    return response
  } catch (error) {
    console.error('[Seller Login Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to login' },
      { status: 500 }
    )
  }
}
