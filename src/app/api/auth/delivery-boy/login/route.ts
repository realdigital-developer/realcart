import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyPasscode, createDeliveryBoySessionResponse } from '@/lib/delivery-boy-auth'

const DELIVERY_BOYS_COLLECTION = 'delivery_boys'

/**
 * POST /api/auth/delivery-boy/login
 * Login existing delivery boy with mobile + passcode
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

    // Find delivery boy by mobile
    const deliveryBoy = await db.collection(DELIVERY_BOYS_COLLECTION).findOne({ mobile })

    if (!deliveryBoy) {
      return NextResponse.json(
        { error: 'No account found with this mobile number. Please register first.' },
        { status: 404 }
      )
    }

    if (deliveryBoy.status === 'Blocked') {
      return NextResponse.json(
        { error: 'Your account has been blocked. Please contact support.' },
        { status: 403 }
      )
    }

    // Verify passcode
    const isValid = await verifyPasscode(passcode, deliveryBoy.passcodeHash)

    if (!isValid) {
      // Track failed attempts
      const failedAttempts = (deliveryBoy.failedLoginAttempts || 0) + 1
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

      await db.collection(DELIVERY_BOYS_COLLECTION).updateOne(
        { _id: deliveryBoy._id },
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
    await db.collection(DELIVERY_BOYS_COLLECTION).updateOne(
      { _id: deliveryBoy._id },
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
    const response = await createDeliveryBoySessionResponse({
      id: deliveryBoy._id.toString(),
      mobile: deliveryBoy.mobile,
      name: deliveryBoy.name,
      role: 'delivery_boy',
    })

    return response
  } catch (error) {
    console.error('[Delivery Boy Login Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to login' },
      { status: 500 }
    )
  }
}
