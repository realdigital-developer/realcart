import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyPasscode, createCustomerSessionResponse } from '@/lib/customer-auth'

const CUSTOMERS_COLLECTION = 'customers'

/**
 * POST /api/auth/customer/login
 * Login existing customer with mobile + passcode
 * Body: { mobile: string, passcode: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').replace(/\D/g, '').slice(-10)
    const passcode = (body.passcode || '').replace(/\D/g, '')

    if (!mobile || mobile.length !== 10) {
      return NextResponse.json({ error: 'Valid 10-digit mobile number is required' }, { status: 400 })
    }

    if (!passcode || passcode.length !== 6) {
      return NextResponse.json({ error: '6-digit passcode is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Find customer by mobile
    const customer = await db.collection(CUSTOMERS_COLLECTION).findOne({ mobile })

    if (!customer) {
      return NextResponse.json(
        { error: 'No account found with this mobile number. Please register first.' },
        { status: 404 }
      )
    }

    if (customer.status === 'Blocked') {
      return NextResponse.json(
        { error: 'Your account has been blocked. Please contact support.' },
        { status: 403 }
      )
    }

    // Verify passcode
    const isValid = await verifyPasscode(passcode, customer.passcodeHash)

    if (!isValid) {
      // Track failed attempts
      const failedAttempts = (customer.failedLoginAttempts || 0) + 1
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

      await db.collection(CUSTOMERS_COLLECTION).updateOne(
        { _id: customer._id },
        { $set: updateData }
      )

      const remaining = Math.max(0, 5 - failedAttempts)
      return NextResponse.json(
        {
          error: remaining > 0
            ? `Invalid passcode. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Your account has been blocked due to too many failed attempts.',
        },
        { status: 401 }
      )
    }

    // Reset failed attempts on successful login
    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: customer._id },
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
    const response = await createCustomerSessionResponse({
      id: customer._id.toString(),
      mobile: customer.mobile,
      name: customer.name,
      role: 'customer',
    })

    return response
  } catch (error) {
    console.error('[Customer Login Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to login' },
      { status: 500 }
    )
  }
}
