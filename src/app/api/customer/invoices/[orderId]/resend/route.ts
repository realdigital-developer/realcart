/**
 * Customer Invoice Resend API — /api/customer/invoices/[orderId]/resend
 *
 * POST / — Resend the invoice email to the customer's registered email
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { buildInvoiceData, generateInvoicePDF, generateInvoiceEmailHTML } from '@/lib/invoice-engine'
import { sendInvoiceEmail } from '@/lib/email-service'
import type { Order } from '@/lib/order-types'

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
        error: 'No email address on file. Please add an email in your profile to receive invoices.',
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

    // Build invoice data
    const invoiceData = await buildInvoiceData(order, {
      platformName,
      platformGstin,
      platformAddress,
      logoUrl,
    })

    // Generate PDF + email HTML
    const [pdfBuffer, emailHTML] = await Promise.all([
      generateInvoicePDF(invoiceData),
      Promise.resolve(generateInvoiceEmailHTML(invoiceData)),
    ])

    // Send email
    const result = await sendInvoiceEmail({
      to: customerEmail,
      customerName: order.customerName || 'Customer',
      orderId: order.orderId,
      invoiceNumber: invoiceData.invoiceNumber,
      invoiceHTML: emailHTML,
      pdfBuffer,
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Invoice sent to ${customerEmail}`,
      })
    } else if (result.queued) {
      return NextResponse.json({
        success: true,
        queued: true,
        message: `Invoice queued for delivery to ${customerEmail}. It will be sent when email service is available.`,
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to send invoice email',
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[Invoice Resend Error]', error)
    return NextResponse.json({ error: 'Failed to resend invoice' }, { status: 500 })
  }
}
