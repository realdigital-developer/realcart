/**
 * Customer Credit Note API — /api/customer/credit-notes/[orderId]
 *
 * A credit note is the GST-compliant document issued to REVERSE a tax invoice
 * when an order (or part of an order) is cancelled. It is generated
 * automatically when an order is cancelled and emailed to the customer.
 *
 * Endpoints:
 *   GET /                  — Get the latest credit note data (JSON)
 *   GET /?format=html      — Get the credit note as HTML (for in-app preview)
 *   GET /?action=download  — Download the credit note as a PDF
 *   GET /?cn=CN-XXXX       — Get a specific credit note (by number)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { buildCreditNoteData, generateCreditNotePDF, generateCreditNoteHTML } from '@/lib/invoice-engine'
import type { Order, CreditNoteRecord } from '@/lib/order-types'

/**
 * Fetch platform settings for credit note branding.
 */
async function getPlatformInfo() {
  let platformName = 'ShopHub'
  let platformGstin = ''
  let platformAddress: string | undefined
  try {
    const { db } = await connectToDatabase()
    const [siteSettings, taxSettings] = await Promise.all([
      db.collection('settings').findOne({ key: 'site' }),
      db.collection('settings').findOne({ key: 'tax' }),
    ])
    if (siteSettings?.siteName) platformName = siteSettings.siteName
    if (taxSettings?.platformGstin) platformGstin = taxSettings.platformGstin
    if (taxSettings?.platformAddress) platformAddress = taxSettings.platformAddress
  } catch { /* use defaults */ }
  return { platformName, platformGstin, platformAddress }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const session = await getCustomerSession(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orderId } = await params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') // 'html' | 'json' (default)
    const action = searchParams.get('action') // 'download' for PDF
    const requestedCnNumber = searchParams.get('cn') // specific credit note number

    const { db } = await connectToDatabase()

    // Find the order — verify it belongs to this customer
    const order = await db.collection('orders').findOne({
      orderId,
      customerId: session.id,
    }) as unknown as Order | null

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Check that this order has at least one credit note
    const creditNotes: CreditNoteRecord[] = (order.creditNotes as CreditNoteRecord[] | undefined) || []
    if (creditNotes.length === 0) {
      return NextResponse.json({
        error: 'No credit note available for this order. Credit notes are generated when an order is cancelled.',
      }, { status: 404 })
    }

    // Select the credit note: specific (by number) or latest (last in array)
    const creditNote = requestedCnNumber
      ? creditNotes.find((cn) => cn.number === requestedCnNumber)
      : creditNotes[creditNotes.length - 1]

    if (!creditNote) {
      return NextResponse.json({
        error: `Credit note ${requestedCnNumber} not found for this order.`,
      }, { status: 404 })
    }

    // Get platform info
    const platformInfo = await getPlatformInfo()

    // Build credit note data — restricts items to those covered by this credit note
    const creditNoteData = await buildCreditNoteData(order, {
      ...platformInfo,
      itemIds: creditNote.itemIds,
      reason: creditNote.reason,
      cancelledBy: creditNote.cancelledBy,
      reasonType: creditNote.reasonType || 'cancellation',
    })
    // Override with the stored credit note number + date
    creditNoteData.creditNoteNumber = creditNote.number
    creditNoteData.creditNoteDate = creditNote.issuedAt
    creditNoteData.cancelledAt = creditNote.issuedAt
    // Use stored refund details if available (more accurate than recomputed)
    if (creditNote.refundId) creditNoteData.refundId = creditNote.refundId
    if (creditNote.refundedAt) creditNoteData.refundedAt = creditNote.refundedAt
    if (creditNote.refundStatus) creditNoteData.refundStatus = creditNote.refundStatus

    // === PDF Download ===
    if (action === 'download') {
      try {
        const pdfBuffer = await generateCreditNotePDF(creditNoteData)
        const filename = `CreditNote-${creditNote.number}.pdf`
        return new NextResponse(pdfBuffer as unknown as BodyInit, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': pdfBuffer.length.toString(),
            'Cache-Control': 'private, no-cache',
          },
        })
      } catch (pdfErr) {
        console.error('[Credit Note PDF Generation Error]', pdfErr)
        return NextResponse.json({ error: 'Failed to generate credit note PDF' }, { status: 500 })
      }
    }

    // === HTML format (for in-app preview) ===
    if (format === 'html') {
      const html = generateCreditNoteHTML(creditNoteData)
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    // === JSON format (default — credit note data for custom rendering) ===
    return NextResponse.json({
      success: true,
      creditNote: creditNoteData,
      // Include a summary list of all credit notes for this order (for UI selector)
      allCreditNotes: creditNotes.map((cn) => ({
        number: cn.number,
        issuedAt: cn.issuedAt,
        reason: cn.reason,
        cancelledBy: cn.cancelledBy,
        amount: cn.amount,
        refundStatus: cn.refundStatus,
        reasonType: cn.reasonType || 'cancellation',
      })),
    })
  } catch (error) {
    console.error('[Customer Credit Note GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch credit note' }, { status: 500 })
  }
}
