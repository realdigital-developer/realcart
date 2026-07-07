import { NextRequest, NextResponse } from 'next/server'
import { uploadSellerDocument, validateDocumentFile, SELLER_DOCUMENT_TYPE_IDS } from '@/lib/upload'
import { deleteFromCloudinary } from '@/lib/cloudinary'
import { connectToDatabase } from '@/lib/mongodb'
import { getSellerSession } from '@/lib/seller-auth'
import { ObjectId } from 'mongodb'

/**
 * POST /api/seller/documents
 *
 * Upload a seller verification document to Cloudinary.
 * Used during registration (with temp ID) and after registration (with seller session).
 *
 * Form Data:
 *   - file: File (image or PDF, max 5MB)
 *   - documentType: 'gst_certificate' | 'pan_card' | 'cancel_cheque' | 'business_registration' | 'address_proof'
 *   - tempSellerId?: string (for pre-registration uploads, optional)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const documentType = formData.get('documentType') as string | null
    const tempSellerId = formData.get('tempSellerId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!documentType || !SELLER_DOCUMENT_TYPE_IDS.includes(documentType as any)) {
      return NextResponse.json(
        { error: `Invalid document type. Allowed: ${SELLER_DOCUMENT_TYPE_IDS.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate file
    const validationError = validateDocumentFile({
      type: file.type,
      size: file.size,
    })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Determine seller ID: use temp ID or authenticated session
    let sellerId = tempSellerId || ''

    if (!tempSellerId) {
      const session = await getSellerSession(request)
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      sellerId = session.id
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Upload to Cloudinary
    const result = await uploadSellerDocument(
      buffer,
      file.type,
      sellerId,
      documentType,
    )

    // If seller is authenticated, update the seller document in DB
    if (!tempSellerId && sellerId) {
      try {
        const { db } = await connectToDatabase()
        const docField = `documents.${documentType}`

        // Get existing document to delete old file from Cloudinary
        const seller = await db.collection('sellers').findOne(
          { _id: new ObjectId(sellerId) },
          { projection: { documents: 1 } }
        )

        const existingDoc = seller?.documents?.[documentType]
        if (existingDoc?.publicId) {
          // Delete old document from Cloudinary (best effort)
          deleteFromCloudinary(existingDoc.publicId, existingDoc.url?.endsWith('.pdf') ? 'raw' : 'image').catch(() => {})
        }

        await db.collection('sellers').updateOne(
          { _id: new ObjectId(sellerId) },
          {
            $set: {
              [docField]: {
                url: result.url,
                publicId: result.publicId,
                uploadedAt: new Date(),
                verified: false,
                verifiedAt: null,
                verifiedBy: null,
                rejectionReason: null,
              },
              updatedAt: new Date(),
            },
          }
        )
      } catch (dbError) {
        console.error('[Seller Documents POST DB Error]', dbError)
        // Don't fail the upload if DB update fails — return the URL anyway
      }
    }

    return NextResponse.json({
      success: true,
      document: {
        url: result.url,
        publicId: result.publicId,
        documentType,
        uploadedAt: new Date().toISOString(),
        format: result.format,
        size: result.size,
      },
    })
  } catch (error) {
    console.error('[Seller Documents POST Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload document' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/seller/documents
 *
 * Delete a seller verification document.
 * Requires authenticated seller session.
 *
 * Body: { documentType: string, publicId: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSellerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { documentType, publicId } = body

    if (!documentType || !SELLER_DOCUMENT_TYPE_IDS.includes(documentType as any)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }

    if (!publicId) {
      return NextResponse.json({ error: 'Public ID is required' }, { status: 400 })
    }

    // Delete from Cloudinary
    const isPdf = publicId.includes('.pdf') || documentType === 'gst_certificate'
    await deleteFromCloudinary(publicId, isPdf ? 'raw' : 'image')

    // Remove from seller document in DB
    const { db } = await connectToDatabase()
    const docField = `documents.${documentType}`

    await db.collection('sellers').updateOne(
      { _id: new ObjectId(session.id) },
      {
        $unset: { [docField]: '' },
        $set: { updatedAt: new Date() },
      }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Seller Documents DELETE Error]', error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
}
