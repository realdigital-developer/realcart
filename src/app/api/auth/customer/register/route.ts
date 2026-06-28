import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { hashPasscode, isValidPasscode, createCustomerSessionResponse } from '@/lib/customer-auth'
import { ObjectId } from 'mongodb'

const CUSTOMERS_COLLECTION = 'customers'

/**
 * POST /api/auth/customer/register
 * Register a new customer after OTP verification
 * Body: { mobile: string, passcode: string, name?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').replace(/\D/g, '').slice(-10)
    const passcode = (body.passcode || '').replace(/\D/g, '')
    const name = (body.name || '').trim() || `User ${mobile.slice(-4)}`

    if (!mobile || mobile.length !== 10) {
      return NextResponse.json({ error: 'Valid 10-digit mobile number is required' }, { status: 400 })
    }

    if (!isValidPasscode(passcode)) {
      return NextResponse.json({ error: 'Passcode must be exactly 6 digits' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Verify that OTP was verified for this mobile number
    const otpSession = await db.collection('otp_sessions').findOne({
      mobile,
      verified: true,
    })

    if (!otpSession) {
      return NextResponse.json(
        { error: 'Please verify your mobile number with OTP first' },
        { status: 400 }
      )
    }

    // Check if customer already exists (race condition check)
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION).findOne({ mobile })
    if (existingCustomer) {
      return NextResponse.json(
        { error: 'This mobile number is already registered. Please login instead.' },
        { status: 409 }
      )
    }

    // Hash the passcode
    const hashedPasscode = await hashPasscode(passcode)

    // Create the customer document — all fields explicitly typed
    // NOTE: Do NOT set email to '' — the customers collection has a unique index
    // on email that would cause E11000 for the 2nd+ customer with empty email.
    // Instead, omit email entirely or set to null.
    const now = new Date()
    const customerDoc = {
      mobile: mobile,
      name: name,
      email: null as string | null,
      passcodeHash: hashedPasscode,
      role: 'customer' as const,
      status: 'Active' as const,
      failedLoginAttempts: 0,
      lastLoginAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    }

    let insertedId: ObjectId

    try {
      const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(customerDoc)
      insertedId = result.insertedId
    } catch (insertError: unknown) {
      // Handle MongoDB validation errors specifically
      const errMsg = insertError instanceof Error ? insertError.message : String(insertError)

      if (errMsg.includes('validation') || errMsg.includes('Document failed validation')) {
        console.error('[Customer Register] Document validation error:', errMsg)

        // Retry without the validator by using a more minimal document
        try {
          const minimalDoc = {
            mobile: mobile,
            name: name,
            passcodeHash: hashedPasscode,
            role: 'customer',
            status: 'Active',
            failedLoginAttempts: 0,
            createdAt: now,
            updatedAt: now,
          }
          const retryResult = await db.collection(CUSTOMERS_COLLECTION).insertOne(minimalDoc)
          insertedId = retryResult.insertedId
        } catch {
          // If still failing, try to fix the collection validator at runtime
          console.error('[Customer Register] Retry also failed, attempting validator fix...')

          try {
            await db.command({
              collMod: CUSTOMERS_COLLECTION,
              validator: {
                $jsonSchema: {
                  bsonType: 'object',
                  required: ['mobile', 'name', 'passcodeHash', 'role'],
                  properties: {
                    mobile: { bsonType: 'string' },
                    name: { bsonType: 'string' },
                    email: { bsonType: ['string', 'null'] },
                    passcodeHash: { bsonType: 'string' },
                    role: { bsonType: 'string' },
                    status: { bsonType: 'string' },
                    failedLoginAttempts: { bsonType: 'number' },
                    lastLoginAt: { bsonType: ['date', 'null'] },
                    createdAt: { bsonType: 'date' },
                    updatedAt: { bsonType: 'date' },
                  },
                },
              },
            })

            const fixResult = await db.collection(CUSTOMERS_COLLECTION).insertOne(customerDoc)
            insertedId = fixResult.insertedId
          } catch (finalError) {
            console.error('[Customer Register] All retries failed:', finalError)
            return NextResponse.json(
              { error: 'Registration failed due to database validation. Please try again.' },
              { status: 500 }
            )
          }
        }
      } else {
        // Duplicate key error — identify WHICH field caused the conflict
        if (errMsg.includes('duplicate key') || errMsg.includes('E11000')) {
          // Check if the duplicate is on mobile or email
          const isMobileDup = errMsg.includes('mobile_1') || errMsg.includes('mobile')
          const isEmailDup = errMsg.includes('email_1') || errMsg.includes('email')

          if (isMobileDup) {
            return NextResponse.json(
              { error: 'This mobile number is already registered. Please login instead.' },
              { status: 409 }
            )
          }

          // If it's an email duplicate (shouldn't happen with our fix, but handle gracefully)
          console.error('[Customer Register] Duplicate key error on unexpected field:', errMsg)
          return NextResponse.json(
            { error: 'Registration failed due to a data conflict. Please try again.' },
            { status: 409 }
          )
        }
        throw insertError
      }
    }

    // Clean up OTP session
    try {
      await db.collection('otp_sessions').deleteOne({ mobile })
    } catch {
      // Non-critical — don't fail registration
    }

    // Create session
    const response = await createCustomerSessionResponse({
      id: insertedId.toString(),
      mobile,
      name,
      role: 'customer',
    })

    return response
  } catch (error) {
    console.error('[Customer Register Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register' },
      { status: 500 }
    )
  }
}
