import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

/**
 * POST /api/admin/sellers/verify
 *
 * Admin document verification actions for a seller.
 *
 * Body: {
 *   sellerId: string,
 *   action: 'approve_all' | 'approve_document' | 'reject_document' | 'request_resubmission' | 'reject_all',
 *   documentType?: string,          // Required for approve_document / reject_document
 *   rejectionReason?: string,       // Required for reject_document / reject_all / request_resubmission
 *   notes?: string,                 // Optional admin notes
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sellerId, action, documentType, rejectionReason, notes } = body

    if (!sellerId) {
      return NextResponse.json({ error: 'Seller ID is required' }, { status: 400 })
    }

    const validActions = ['approve_all', 'approve_document', 'reject_document', 'request_resubmission', 'reject_all']
    if (!action || !validActions.includes(action)) {
      return NextResponse.json({ error: `Invalid action. Allowed: ${validActions.join(', ')}` }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Fetch the seller
    const seller = await db.collection('sellers').findOne({ _id: new ObjectId(sellerId) })
    if (!seller) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
    }

    const now = new Date()
    const updateData: Record<string, unknown> = { updatedAt: now }

    // Initialize documents object if it doesn't exist
    if (!seller.documents) {
      updateData.documents = {}
    }

    switch (action) {
      case 'approve_all': {
        // Approve all uploaded documents and mark seller as verified + active
        const documents = seller.documents || {}
        const updatedDocuments: Record<string, unknown> = {}

        for (const [docType, docData] of Object.entries(documents)) {
          const doc = docData as Record<string, unknown>
          if (doc?.url) {
            updatedDocuments[docType] = {
              ...doc,
              verified: true,
              verifiedAt: now,
              verifiedBy: 'admin',
              rejectionReason: null,
            }
          }
        }

        updateData.documents = updatedDocuments
        updateData.isVerified = true
        updateData.status = 'Active'
        updateData.verificationStatus = 'verified'

        // Add verification note
        const verificationNote = {
          note: notes || 'All documents verified and approved',
          addedBy: 'admin',
          addedAt: now,
          type: 'approval',
        }
        updateData.$push = { verificationNotes: verificationNote }

        break
      }

      case 'approve_document': {
        if (!documentType) {
          return NextResponse.json({ error: 'Document type is required for approve_document' }, { status: 400 })
        }

        const docField = `documents.${documentType}`
        const existingDoc = seller.documents?.[documentType]

        if (!existingDoc?.url) {
          return NextResponse.json({ error: 'Document not found or not uploaded' }, { status: 400 })
        }

        updateData[docField] = {
          ...existingDoc,
          verified: true,
          verifiedAt: now,
          verifiedBy: 'admin',
          rejectionReason: null,
        }

        // Check if all required documents are now verified
        const documents = seller.documents || {}
        const requiredDocs = getRequiredDocuments(seller.businessType)
        const allVerified = requiredDocs.every((dt) => {
          const doc = dt === documentType
            ? { ...existingDoc, verified: true, verifiedAt: now, verifiedBy: 'admin', rejectionReason: null }
            : documents[dt]
          return doc?.url && doc?.verified
        })

        if (allVerified) {
          updateData.isVerified = true
          updateData.status = 'Active'
          updateData.verificationStatus = 'verified'
        }

        // Add verification note
        const verificationNote = {
          note: notes || `Document "${documentType}" approved`,
          addedBy: 'admin',
          addedAt: now,
          type: 'approval',
        }
        updateData.$push = { verificationNotes: verificationNote }

        break
      }

      case 'reject_document': {
        if (!documentType) {
          return NextResponse.json({ error: 'Document type is required for reject_document' }, { status: 400 })
        }

        if (!rejectionReason) {
          return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
        }

        const docField = `documents.${documentType}`
        const existingDoc = seller.documents?.[documentType]

        if (!existingDoc?.url) {
          return NextResponse.json({ error: 'Document not found or not uploaded' }, { status: 400 })
        }

        updateData[docField] = {
          ...existingDoc,
          verified: false,
          verifiedAt: now,
          verifiedBy: 'admin',
          rejectionReason,
        }

        updateData.verificationStatus = 'rejected'

        // Add verification note
        const verificationNote = {
          note: notes || `Document "${documentType}" rejected: ${rejectionReason}`,
          addedBy: 'admin',
          addedAt: now,
          type: 'rejection',
        }
        updateData.$push = { verificationNotes: verificationNote }

        break
      }

      case 'request_resubmission': {
        if (!rejectionReason) {
          return NextResponse.json({ error: 'Reason for resubmission is required' }, { status: 400 })
        }

        // Mark specific or all documents for resubmission
        if (documentType) {
          const docField = `documents.${documentType}`
          const existingDoc = seller.documents?.[documentType]

          if (existingDoc?.url) {
            updateData[docField] = {
              ...existingDoc,
              verified: false,
              verifiedAt: now,
              verifiedBy: 'admin',
              rejectionReason,
            }
          }
        } else {
          // Request resubmission for all documents
          const documents = seller.documents || {}
          const updatedDocuments: Record<string, unknown> = {}

          for (const [dt, docData] of Object.entries(documents)) {
            const doc = docData as Record<string, unknown>
            if (doc?.url) {
              updatedDocuments[dt] = {
                ...doc,
                verified: false,
                verifiedAt: now,
                verifiedBy: 'admin',
                rejectionReason,
              }
            }
          }
          updateData.documents = updatedDocuments
        }

        updateData.verificationStatus = 'resubmission_requested'
        updateData.status = 'Pending'

        // Add verification note
        const verificationNote = {
          note: notes || `Resubmission requested: ${rejectionReason}`,
          addedBy: 'admin',
          addedAt: now,
          type: 'resubmission',
        }
        updateData.$push = { verificationNotes: verificationNote }

        break
      }

      case 'reject_all': {
        if (!rejectionReason) {
          return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
        }

        // Reject all documents and the seller application
        const documents = seller.documents || {}
        const updatedDocuments: Record<string, unknown> = {}

        for (const [dt, docData] of Object.entries(documents)) {
          const doc = docData as Record<string, unknown>
          if (doc?.url) {
            updatedDocuments[dt] = {
              ...doc,
              verified: false,
              verifiedAt: now,
              verifiedBy: 'admin',
              rejectionReason,
            }
          }
        }

        updateData.documents = updatedDocuments
        updateData.isVerified = false
        updateData.status = 'Rejected'
        updateData.verificationStatus = 'rejected'

        // Add verification note
        const verificationNote = {
          note: notes || `Application rejected: ${rejectionReason}`,
          addedBy: 'admin',
          addedAt: now,
          type: 'rejection',
        }
        updateData.$push = { verificationNotes: verificationNote }

        break
      }
    }

    // Build the update query
    const { $push, ...setFields } = updateData
    const updateQuery: Record<string, unknown> = { $set: setFields }
    if ($push) {
      updateQuery.$push = $push
    }

    await db.collection('sellers').updateOne(
      { _id: new ObjectId(sellerId) },
      updateQuery
    )

    // Fetch updated seller for response
    const updatedSeller = await db.collection('sellers').findOne(
      { _id: new ObjectId(sellerId) },
      { projection: { passwordHash: 0 } }
    )

    return NextResponse.json({
      success: true,
      seller: { ...updatedSeller, _id: updatedSeller?._id.toString() },
    })
  } catch (error) {
    console.error('[Admin Sellers Verify Error]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    )
  }
}

/**
 * Get the required document types based on business type.
 * Individual sellers need fewer documents than registered businesses.
 */
function getRequiredDocuments(businessType: string): string[] {
  const baseDocs = ['pan_card', 'cancel_cheque']

  if (businessType === 'individual') {
    return [...baseDocs, 'address_proof']
  }

  // Non-individual businesses also need GST certificate and business registration
  return [...baseDocs, 'gst_certificate', 'business_registration', 'address_proof']
}
