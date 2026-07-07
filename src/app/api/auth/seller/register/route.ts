import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { hashPassword, isValidPassword, createSellerSessionResponse } from '@/lib/seller-auth'
import { ObjectId } from 'mongodb'

const SELLERS_COLLECTION = 'sellers'

/**
 * POST /api/auth/seller/register
 *
 * Production-level seller registration matching Flipkart/Amazon/Meesho flows.
 *
 * Body: {
 *   // Step 1: Mobile verification
 *   phone: string,
 *
 *   // Step 2: Account details
 *   name: string,
 *   email: string,
 *   password: string,
 *
 *   // Step 3: Business details
 *   storeName: string,
 *   businessType: 'individual' | 'proprietorship' | 'partnership' | 'llp' | 'pvt_ltd' | 'other',
 *   gstNumber?: string,
 *   panNumber?: string,
 *
 *   // Step 4: Bank details
 *   bankAccountName: string,
 *   bankAccountNumber: string,
 *   bankIfsc: string,
 *   bankName: string,
 *
 *   // Step 5: Document uploads (Cloudinary URLs from prior upload)
 *   documents?: {
 *     gst_certificate?: { url: string, publicId: string },
 *     pan_card?: { url: string, publicId: string },
 *     cancel_cheque?: { url: string, publicId: string },
 *     business_registration?: { url: string, publicId: string },
 *     address_proof?: { url: string, publicId: string },
 *   },
 *
 *   // Step 6: Pickup address
 *   pickupAddress: {
 *     fullName: string,
 *     phone: string,
 *     addressLine1: string,
 *     addressLine2?: string,
 *     city: string,
 *     state: string,
 *     pincode: string,
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    /* ------------------------------------------------------------------ */
    /*  Extract & trim fields                                               */
    /* ------------------------------------------------------------------ */

    const name = (body.name || '').trim()
    const email = (body.email || '').trim().toLowerCase()
    const password = body.password || ''
    const storeName = (body.storeName || '').trim()
    const phone = (body.phone || '').trim()
    const businessType = (body.businessType || '').trim()
    const gstNumber = (body.gstNumber || '').trim()
    const panNumber = (body.panNumber || '').trim()

    // Bank details
    const bankAccountName = (body.bankAccountName || '').trim()
    const bankAccountNumber = (body.bankAccountNumber || '').trim()
    const bankIfsc = (body.bankIfsc || '').trim().toUpperCase()
    const bankName = (body.bankName || '').trim()

    // Pickup address
    const pickupAddress = body.pickupAddress || {}

    // Documents (Cloudinary URLs from prior uploads)
    const documents = body.documents || {}

    // Keep backward compatibility with old address string field
    const address = (body.address || '').trim()

    /* ------------------------------------------------------------------ */
    /*  Validate required fields                                            */
    /* ------------------------------------------------------------------ */

    // Step 1: Mobile
    if (!phone || phone.length < 10) {
      return NextResponse.json({ error: 'Valid phone number is required' }, { status: 400 })
    }

    // Step 2: Account
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Full name is required (min 2 characters)' }, { status: 400 })
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 })
    }

    if (!isValidPassword(password)) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters with at least 1 letter and 1 number' },
        { status: 400 }
      )
    }

    // Step 3: Business details
    if (!storeName || storeName.length < 2) {
      return NextResponse.json({ error: 'Store name is required (min 2 characters)' }, { status: 400 })
    }

    const validBusinessTypes = ['individual', 'proprietorship', 'partnership', 'llp', 'pvt_ltd', 'other']
    if (!businessType || !validBusinessTypes.includes(businessType)) {
      return NextResponse.json({ error: 'Please select a valid business type' }, { status: 400 })
    }

    // GST validation (if provided - mandatory for non-individual)
    if (businessType !== 'individual' && !gstNumber) {
      return NextResponse.json(
        { error: 'GST number is required for non-individual business types' },
        { status: 400 }
      )
    }

    if (gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstNumber.toUpperCase())) {
      return NextResponse.json({ error: 'Invalid GST number format' }, { status: 400 })
    }

    // PAN validation (if provided)
    if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.toUpperCase())) {
      return NextResponse.json({ error: 'Invalid PAN number format' }, { status: 400 })
    }

    // Step 4: Bank details
    if (!bankAccountName || bankAccountName.length < 2) {
      return NextResponse.json({ error: 'Bank account holder name is required' }, { status: 400 })
    }

    if (!bankAccountNumber || bankAccountNumber.length < 8) {
      return NextResponse.json({ error: 'Valid bank account number is required' }, { status: 400 })
    }

    if (!bankIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc)) {
      return NextResponse.json({ error: 'Valid IFSC code is required' }, { status: 400 })
    }

    if (!bankName || bankName.length < 2) {
      return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
    }

    // Step 5: Pickup address
    if (!pickupAddress.fullName || pickupAddress.fullName.length < 2) {
      return NextResponse.json({ error: 'Full name in pickup address is required' }, { status: 400 })
    }

    if (!pickupAddress.phone || pickupAddress.phone.length < 10) {
      return NextResponse.json({ error: 'Phone number in pickup address is required' }, { status: 400 })
    }

    if (!pickupAddress.addressLine1 || pickupAddress.addressLine1.length < 5) {
      return NextResponse.json({ error: 'Address line 1 is required' }, { status: 400 })
    }

    if (!pickupAddress.city || pickupAddress.city.length < 2) {
      return NextResponse.json({ error: 'City is required' }, { status: 400 })
    }

    if (!pickupAddress.state || pickupAddress.state.length < 2) {
      return NextResponse.json({ error: 'State is required' }, { status: 400 })
    }

    if (!pickupAddress.pincode || !/^[1-9][0-9]{5}$/.test(pickupAddress.pincode)) {
      return NextResponse.json({ error: 'Valid 6-digit pincode is required' }, { status: 400 })
    }

    /* ------------------------------------------------------------------ */
    /*  Check duplicates                                                    */
    /* ------------------------------------------------------------------ */

    const { db } = await connectToDatabase()

    // Check if phone already exists
    const existingPhone = await db.collection(SELLERS_COLLECTION).findOne({ phone })
    if (existingPhone) {
      return NextResponse.json(
        { error: 'This phone number is already registered. Please login instead.' },
        { status: 409 }
      )
    }

    // ── OTP verification gate (security parity with customer/delivery-boy) ──
    // The frontend verifies the phone via Firebase Phone Auth, then the
    // /verify-otp endpoint upserts otp_sessions.verified = true. This gate
    // ensures the phone was actually verified before allowing registration.
    // Without it, anyone could POST to /register without a real OTP.
    const cleanMobile = phone.replace(/\D/g, '').slice(-10)
    const otpSession = await db.collection('otp_sessions').findOne({
      mobile: cleanMobile,
      type: 'seller',
      verified: true,
      expiresAt: { $gt: new Date() },
    })
    if (!otpSession) {
      return NextResponse.json(
        { error: 'Please verify your mobile number with OTP first.' },
        { status: 400 },
      )
    }

    // Check if email already exists
    const existingSeller = await db.collection(SELLERS_COLLECTION).findOne({ email })
    if (existingSeller) {
      return NextResponse.json(
        { error: 'This email is already registered. Please login instead.' },
        { status: 409 }
      )
    }

    // Check if store name already taken
    const existingStore = await db.collection(SELLERS_COLLECTION).findOne({ storeName })
    if (existingStore) {
      return NextResponse.json(
        { error: 'This store name is already taken. Please choose a different one.' },
        { status: 409 }
      )
    }

    // Check if GST already registered (if provided)
    if (gstNumber) {
      const existingGst = await db.collection(SELLERS_COLLECTION).findOne({ gstNumber })
      if (existingGst) {
        return NextResponse.json(
          { error: 'This GST number is already registered with another seller account.' },
          { status: 409 }
        )
      }
    }

    // Check if PAN already registered (if provided)
    if (panNumber) {
      const existingPan = await db.collection(SELLERS_COLLECTION).findOne({ panNumber })
      if (existingPan) {
        return NextResponse.json(
          { error: 'This PAN number is already registered with another seller account.' },
          { status: 409 }
        )
      }
    }

    /* ------------------------------------------------------------------ */
    /*  Create seller document                                              */
    /* ------------------------------------------------------------------ */

    const hashedPassword = await hashPassword(password)
    const now = new Date()

    const sellerDoc = {
      // Account
      name,
      email,
      passwordHash: hashedPassword,
      phone,
      role: 'seller' as const,

      // Business
      storeName,
      businessType,
      gstNumber: gstNumber || '',
      panNumber: panNumber || '',

      // Bank details
      bankDetails: {
        accountName: bankAccountName,
        accountNumber: bankAccountNumber,
        ifsc: bankIfsc,
        bankName,
        verified: false,
      },

      // Documents with verification status
      documents: buildDocumentsObject(documents, businessType),

      // Pickup address (structured)
      pickupAddress: {
        fullName: pickupAddress.fullName.trim(),
        phone: pickupAddress.phone.trim(),
        addressLine1: pickupAddress.addressLine1.trim(),
        addressLine2: (pickupAddress.addressLine2 || '').trim(),
        city: pickupAddress.city.trim(),
        state: pickupAddress.state.trim(),
        pincode: pickupAddress.pincode.trim(),
      },

      // Backward compatibility: address string (derived from pickupAddress)
      address: address || `${pickupAddress.addressLine1}, ${pickupAddress.city}, ${pickupAddress.state} - ${pickupAddress.pincode}`,

      // Status
      status: 'Pending' as const,  // New sellers start as Pending until admin verifies
      isVerified: false,
      verificationStatus: 'pending' as const,  // Document verification status
      verificationNotes: [] as Array<{ note: string; addedBy: string; addedAt: Date; type: string }>,
      failedLoginAttempts: 0,
      lastLoginAt: null as Date | null,

      // Timestamps
      createdAt: now,
      updatedAt: now,
    }

    let insertedId: ObjectId

    try {
      const result = await db.collection(SELLERS_COLLECTION).insertOne(sellerDoc)
      insertedId = result.insertedId
    } catch (insertError: unknown) {
      const errMsg = insertError instanceof Error ? insertError.message : String(insertError)

      if (errMsg.includes('duplicate key') || errMsg.includes('E11000')) {
        return NextResponse.json(
          { error: 'This email, phone, or store name is already registered.' },
          { status: 409 }
        )
      }

      // Retry with minimal doc
      try {
        const minimalDoc = {
          name, email, passwordHash: hashedPassword, storeName, phone,
          businessType, gstNumber, panNumber,
          bankDetails: sellerDoc.bankDetails,
          documents: sellerDoc.documents,
          pickupAddress: sellerDoc.pickupAddress,
          address: sellerDoc.address,
          role: 'seller', status: 'Pending', isVerified: false,
          verificationStatus: 'pending',
          verificationNotes: [],
          failedLoginAttempts: 0, createdAt: now, updatedAt: now,
        }
        const retryResult = await db.collection(SELLERS_COLLECTION).insertOne(minimalDoc)
        insertedId = retryResult.insertedId
      } catch {
        return NextResponse.json(
          { error: 'Registration failed. Please try again.' },
          { status: 500 }
        )
      }
    }

    // ── Clean up the OTP session (one-time use) ──
    try {
      await db.collection('otp_sessions').deleteOne({ _id: otpSession._id })
    } catch {
      // non-fatal — the session has an expiry anyway
    }

    // Create session — allow login even with 'Pending' status for first-time
    const response = await createSellerSessionResponse({
      id: insertedId.toString(),
      email,
      name,
      storeName,
      role: 'seller',
    })

    return response
  } catch (error) {
    console.error('[Seller Register Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register' },
      { status: 500 }
    )
  }
}

/**
 * Build the documents object for the seller document.
 * Each uploaded document gets a verification status track.
 * Required documents are determined by business type.
 */
function buildDocumentsObject(
  documents: Record<string, { url?: string; publicId?: string }>,
  businessType: string,
): Record<string, {
  url: string;
  publicId: string;
  uploadedAt: Date;
  verified: boolean;
  verifiedAt: null;
  verifiedBy: null;
  rejectionReason: null;
} | null> {
  const result: Record<string, any> = {}

  const allDocTypes = ['gst_certificate', 'pan_card', 'cancel_cheque', 'business_registration', 'address_proof']

  for (const docType of allDocTypes) {
    const doc = documents[docType]
    if (doc?.url && doc?.publicId) {
      result[docType] = {
        url: doc.url,
        publicId: doc.publicId,
        uploadedAt: new Date(),
        verified: false,
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
      }
    } else {
      // Mark as null — document not uploaded yet
      // For individual business type, gst_certificate and business_registration are optional
      if (businessType === 'individual' && (docType === 'gst_certificate' || docType === 'business_registration')) {
        // Optional for individuals
        continue
      }
      result[docType] = null
    }
  }

  return result
}
