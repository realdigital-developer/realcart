/**
 * Customer Invoice API — /api/customer/invoices/[orderId]
 *
 * Endpoints:
 *   GET /                  — Get invoice data (JSON) or invoice HTML (?format=html)
 *   GET /?action=download  — Download invoice as PDF
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCustomerSession } from '@/lib/customer-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { buildInvoiceData, generateInvoicePDF, generateInvoiceHTML } from '@/lib/invoice-engine'
import { getBrandSettings } from '@/lib/brand-settings'
import type { Order } from '@/lib/order-types'

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

    const { db } = await connectToDatabase()

    // Find the order — verify it belongs to this customer
    const order = await db.collection('orders').findOne({
      orderId,
      customerId: session.id,
    }) as unknown as Order | null

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Get platform info (brand name + logo + GSTIN + address) — falls back
    // to "RealCart" when not configured. Single source of truth: brand-settings.ts.
    const platformInfo = await getBrandSettings(db)

    // Build invoice data
    const invoiceData = await buildInvoiceData(order, platformInfo)

    // === PDF Download ===
    if (action === 'download') {
      try {
        const pdfBuffer = await generateInvoicePDF(invoiceData)
        const filename = `Invoice-${invoiceData.invoiceNumber}.pdf`
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
        console.error('[Invoice PDF Generation Error]', pdfErr)
        return NextResponse.json({ error: 'Failed to generate PDF invoice' }, { status: 500 })
      }
    }

    // === HTML format (for in-app preview) ===
    if (format === 'html') {
      const html = generateInvoiceHTML(invoiceData)
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    // === JSON format (default — invoice data for custom rendering) ===
    return NextResponse.json({
      success: true,
      invoice: invoiceData,
    })
  } catch (error) {
    console.error('[Customer Invoice GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
  }
}
