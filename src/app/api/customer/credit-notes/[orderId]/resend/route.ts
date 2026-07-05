/**
 * Customer Credit Note Resend API — /api/customer/credit-notes/[orderId]/resend
 *
 * POST / — Resend the credit note email to the customer's registered email.
 * Useful when the original email was lost, bounced, or the customer added an
 * email address after the cancellation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { buildCreditNoteData, generateCreditNotePDF, generateCreditNoteEmailHTML } from '@/lib/invoice-engine'
import { sendCreditNoteEmail } from '@/lib/email-service'
import type { Order, CreditNoteRecord } from '@/lib/order-types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orderId } = await params
    const { db } = await connectToDatabase()

    // Find the order — verify ownership
    const order = await db.collection('orders').findOne({
      orderId,
      customerId: session.id,
    }) as unknown as Order | null

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Check for credit notes
    const creditNotes: CreditNoteRecord[] = (order.creditNotes as CreditNoteRecord[] | undefined) || []
    if (creditNotes.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No credit note available for this order.',
      }, { status: 400 })
    }

    // Use the latest credit note (or a specific one if ?cn= is provided)
    const { searchParams } = new URL(request.url)
    const requestedCnNumber = searchParams.get('cn')
    const creditNote = requestedCnNumber
      ? creditNotes.find((cn) => cn.number === requestedCnNumber)
      : creditNotes[creditNotes.length - 1]

    if (!creditNote) {
      return NextResponse.json({
        success: false,
        error: `Credit note ${requestedCnNumber} not found.`,
      }, { status: 404 })
    }

    // Get customer email
    let customerEmail = order.customerEmail
    if (!customerEmail) {
      try {
        const customer = await db.collection('customers').findOne({ _id: new ObjectId(session.id) })
        customerEmail = customer?.email || undefined
      } catch {
        const customer = await db.collection('customers').findOne({ mobile: order.customerPhone })
        customerEmail = customer?.email || undefined
      }
    }

    if (!customerEmail) {
      return NextResponse.json({
        success: false,
        error: 'No email address on file. Please add an email in your profile to receive credit notes.',
      }, { status: 400 })
    }

    // Get platform info
    let platformName = 'ShopHub'
    let platformGstin = ''
    let platformAddress: string | undefined
    let logoUrl: string | undefined
    try {
      const [siteSettings, taxSettings] = await Promise.all([
        db.collection('settings').findOne({ key: 'site' }),
        db.collection('settings').findOne({ key: 'tax' }),
      ])
      if (siteSettings?.siteName) platformName = siteSettings.siteName
      if (siteSettings?.logo?.url) logoUrl = siteSettings.logo.url
      if (taxSettings?.platformGstin) platformGstin = taxSettings.platformGstin
      if (taxSettings?.platformAddress) platformAddress = taxSettings.platformAddress
    } catch { /* use defaults */ }

    // Build credit note data
    const creditNoteData = await buildCreditNoteData(order, {
      platformName,
      platformGstin,
      platformAddress,
      logoUrl,
      itemIds: creditNote.itemIds,
      reason: creditNote.reason,
      cancelledBy: creditNote.cancelledBy,
    })
    creditNoteData.creditNoteNumber = creditNote.number
    creditNoteData.creditNoteDate = creditNote.issuedAt
    creditNoteData.cancelledAt = creditNote.issuedAt
    if (creditNote.refundId) creditNoteData.refundId = creditNote.refundId
    if (creditNote.refundedAt) creditNoteData.refundedAt = creditNote.refundedAt
    if (creditNote.refundStatus) creditNoteData.refundStatus = creditNote.refundStatus

    // Generate PDF + email HTML
    const [pdfBuffer, emailHTML] = await Promise.all([
      generateCreditNotePDF(creditNoteData),
      Promise.resolve(generateCreditNoteEmailHTML(creditNoteData)),
    ])

    // Send email
    const result = await sendCreditNoteEmail({
      to: customerEmail,
      customerName: order.customerName || 'Customer',
      orderId: order.orderId,
      creditNoteNumber: creditNote.number,
      originalInvoiceNumber: creditNoteData.originalInvoiceNumber,
      cancellationReason: creditNote.reason,
      refundStatus: creditNoteData.refundStatus,
      refundAmount: creditNoteData.refundAmount,
      creditNoteHTML: emailHTML,
      pdfBuffer,
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Credit note sent to ${customerEmail}`,
      })
    } else if (result.queued) {
      return NextResponse.json({
        success: true,
        queued: true,
        message: `Credit note queued for delivery to ${customerEmail}. It will be sent when email service is available.`,
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to send credit note email',
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[Credit Note Resend Error]', error)
    return NextResponse.json({ error: 'Failed to resend credit note' }, { status: 500 })
  }
}
