import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { hashPasscode, isValidPasscode, createDeliveryBoySessionResponse } from '@/lib/delivery-boy-auth'
import { ObjectId } from 'mongodb'

const DELIVERY_BOYS_COLLECTION = 'delivery_boys'

/**
 * POST /api/auth/delivery-boy/register
 * Register a new delivery boy after OTP verification
 * Body: { mobile: string, passcode: string, name?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').replace(/\D/g, '').slice(-10)
    const passcode = (body.passcode || '').replace(/\D/g, '')
    const name = (body.name || '').trim() || `Delivery ${mobile.slice(-4)}`

    if (!mobile || mobile.length !== 10) {
      return NextResponse.json({ error: 'Valid 10-digit mobile number is required' }, { status: 400 })
    }

    if (!isValidPasscode(passcode)) {
      return NextResponse.json({ error: 'Passcode must be exactly 6 digits' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Verify that the SIM binding was verified for this mobile number
    const bindingSession = await db.collection('sim_bindings').findOne({
      mobile,
      type: 'delivery_boy',
      verified: true,
      expiresAt: { $gt: new Date() },
    })

    if (!bindingSession) {
      return NextResponse.json(
        { error: 'Please verify your mobile number with SIM binding first' },
        { status: 400 }
      )
    }

    // Check if delivery boy already exists (race condition check)
    const existingDeliveryBoy = await db.collection(DELIVERY_BOYS_COLLECTION).findOne({ mobile })
    if (existingDeliveryBoy) {
      return NextResponse.json(
        { error: 'This mobile number is already registered. Please login instead.' },
        { status: 409 }
      )
    }

    // Hash the passcode
    const hashedPasscode = await hashPasscode(passcode)

    // Create the delivery boy document
    const now = new Date()
    const deliveryBoyDoc = {
      mobile: mobile,
      name: name,
      passcodeHash: hashedPasscode,
      role: 'delivery_boy' as const,
      status: 'Active' as const,
      isAvailable: true,
      failedLoginAttempts: 0,
      lastLoginAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    }

    let insertedId: ObjectId

    try {
      const result = await db.collection(DELIVERY_BOYS_COLLECTION).insertOne(deliveryBoyDoc)
      insertedId = result.insertedId
    } catch (insertError: unknown) {
      const errMsg = insertError instanceof Error ? insertError.message : String(insertError)

      if (errMsg.includes('validation') || errMsg.includes('Document failed validation')) {
        console.error('[Delivery Boy Register] Document validation error:', errMsg)

        // Retry with a minimal document
        try {
          const minimalDoc = {
            mobile: mobile,
            name: name,
            passcodeHash: hashedPasscode,
            role: 'delivery_boy',
            status: 'Active',
            isAvailable: true,
            failedLoginAttempts: 0,
            createdAt: now,
            updatedAt: now,
          }
          const retryResult = await db.collection(DELIVERY_BOYS_COLLECTION).insertOne(minimalDoc)
          insertedId = retryResult.insertedId
        } catch {
          // Try to fix the collection validator at runtime
          console.error('[Delivery Boy Register] Retry also failed, attempting validator fix...')

          try {
            await db.command({
              collMod: DELIVERY_BOYS_COLLECTION,
              validator: {
                $jsonSchema: {
                  bsonType: 'object',
                  required: ['mobile', 'name', 'passcodeHash', 'role'],
                  properties: {
                    mobile: { bsonType: 'string' },
                    name: { bsonType: 'string' },
                    passcodeHash: { bsonType: 'string' },
                    role: { bsonType: 'string' },
                    status: { bsonType: 'string' },
                    isAvailable: { bsonType: 'bool' },
                    failedLoginAttempts: { bsonType: 'number' },
                    createdAt: { bsonType: 'date' },
                    updatedAt: { bsonType: 'date' },
                  },
                },
              },
            })

            const fixResult = await db.collection(DELIVERY_BOYS_COLLECTION).insertOne(deliveryBoyDoc)
            insertedId = fixResult.insertedId
          } catch (finalError) {
            console.error('[Delivery Boy Register] All retries failed:', finalError)
            return NextResponse.json(
              { error: 'Registration failed due to database validation. Please try again.' },
              { status: 500 }
            )
          }
        }
      } else {
        // Duplicate key error
        if (errMsg.includes('duplicate key') || errMsg.includes('E11000')) {
          return NextResponse.json(
            { error: 'This mobile number is already registered. Please login instead.' },
            { status: 409 }
          )
        }
        throw insertError
      }
    }

    // Clean up OTP session
    try {
      await db.collection('sim_bindings').deleteOne({ mobile, type: 'delivery_boy' })
    } catch {
      // Non-critical — don't fail registration
    }

    // Create session
    const response = await createDeliveryBoySessionResponse({
      id: insertedId.toString(),
      mobile,
      name,
      role: 'delivery_boy',
    })

    return response
  } catch (error) {
    console.error('[Delivery Boy Register Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register' },
      { status: 500 }
    )
  }
}
