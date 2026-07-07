/**
 * Invoice Engine — Production-Level GST Invoice Generation
 *
 * Generates tax-compliant invoices for Indian multi-vendor e-commerce,
 * following the standards used by Flipkart, Meesho, and Amazon India.
 *
 * Features:
 *   - GST invoice with HSN codes, CGST/SGST/IGST breakup
 *   - Tax-inclusive price breakdown (taxable value extraction)
 *   - Per-seller invoice sections (multi-vendor)
 *   - PDF generation (server-side, pure JS via pdfkit)
 *   - HTML invoice for email body and in-app preview
 *   - Invoice number, date, place of supply
 *   - Platform GSTIN, seller GSTIN
 *   - Total payable amount (round-off absorbed, not displayed — matches Flipkart/Amazon/Meesho UX)
 *
 * All functions are safe to call server-side only.
 */

import PDFDocument from 'pdfkit'
import { join } from 'path'
import type { Order, OrderItem } from './order-types'
import { DEFAULT_BRAND_NAME, getLogoUrlWithBgRemoval } from './brand-settings'

/* ------------------------------------------------------------------ */
/*  Font Registration — DejaVu Sans supports ₹ (U+20B9)                */
/*  PDFKit's built-in Helvetica does NOT include the ₹ glyph.           */
/*  We embed DejaVu Sans (regular + bold) for proper ₹ rendering.      */
/* ------------------------------------------------------------------ */

/**
 * Register DejaVu Sans fonts on a PDFKit document instance.
 * Must be called on EVERY new PDFDocument — registerFont is per-instance,
 * not global. A shared flag would cause the second PDF to fail with ENOENT.
 */
function registerFonts(doc: InstanceType<typeof PDFDocument>) {
  try {
    const regularPath = join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf')
    const boldPath = join(process.cwd(), 'public', 'fonts', 'DejaVuSans-Bold.ttf')
    doc.registerFont('DejaVuSans', regularPath)
    doc.registerFont('DejaVuSans-Bold', boldPath)
  } catch {
    // Fonts not available — fall back to Helvetica (₹ won't render)
  }
}

/** Font names that support the ₹ symbol */
const FONT_REGULAR = 'DejaVuSans'
const FONT_BOLD = 'DejaVuSans-Bold'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface InvoiceLineItem {
  description: string
  hsnCode: string
  quantity: number
  unitPrice: number        // effective price per unit (tax-inclusive)
  taxableValue: number     // taxable value total (excl. GST)
  gstRate: number          // GST rate (%)
  cgst: number
  sgst: number
  igst: number
  totalTax: number
  total: number            // total including GST
  variant?: string
}

export interface InvoiceSellerGroup {
  sellerName: string
  sellerStoreName: string
  sellerGstin?: string
  items: InvoiceLineItem[]
  subtotal: number         // sum of unit prices × qty
  totalTaxableValue: number
  totalCgst: number
  totalSgst: number
  totalIgst: number
  totalTax: number
  total: number
}

export interface InvoiceData {
  invoiceNumber: string
  invoiceDate: string
  orderId: string
  orderDate: string

  // Customer
  customerName: string
  customerPhone: string
  customerEmail?: string

  // Shipping address (Bill To / Ship To)
  shipToName: string
  shipToPhone: string
  shipToAddress: string
  shipToCity: string
  shipToState: string
  shipToPincode: string

  // Place of supply (customer state)
  placeOfSupply: string

  // Platform details
  platformName: string
  platformGstin: string
  platformAddress?: string
  logoUrl?: string  // Brand logo URL (from settings.site.logo.url)

  // Seller groups
  sellers: InvoiceSellerGroup[]

  // Totals
  totalTaxableValue: number
  totalCgst: number
  totalSgst: number
  totalIgst: number
  totalGst: number
  subtotal: number         // MRP total
  productDiscount: number
  /** Special-offer portion of the product discount (limited-time specialPrice) */
  specialOfferDiscount: number
  deliveryFee: number
  codFee: number
  platformFee: number
  couponDiscount: number
  roundOff: number
  totalAmount: number
  /** RealCart Balance portion (Meesho-style split payment). When > 0,
   *  the online payment only covered the remainder. */
  walletAppliedAmount: number

  // Payment
  paymentMethod: string
  paymentStatus: string

  isIntraState: boolean

  // Delivery option (added for the Standard vs Express feature).
  // Optional for backward compat with invoices generated before the feature.
  deliveryOption?: 'standard' | 'express'
  deliveryOptionLabel?: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatCurrency(amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100
  return `₹${rounded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCurrencyShort(amount: number): string {
  const rounded = Math.round(amount)
  return `₹${rounded.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function safe(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** Format variant for invoice display */
function formatVariantDisplay(variant: string | Record<string, unknown> | undefined): string {
  if (!variant) return ''
  if (typeof variant === 'string') return variant
  if (typeof variant === 'object') {
    const entries = Object.entries(variant).filter(([, v]) => v != null && v !== '')
    if (entries.length === 0) return ''
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ')
  }
  return String(variant)
}

/* ------------------------------------------------------------------ */
/*  Invoice Data Builder                                                */
/* ------------------------------------------------------------------ */

/**
 * Build structured invoice data from an Order document.
 * Reads platform settings from the database for GSTIN/platform name.
 */
export async function buildInvoiceData(
  order: Order,
  options?: {
    platformName?: string
    platformGstin?: string
    platformAddress?: string
    logoUrl?: string
  },
): Promise<InvoiceData> {
  // Group items by seller (like Flipkart — each seller gets a section)
  const sellerMap = new Map<string, InvoiceSellerGroup>()

  for (const item of order.items) {
    const sellerKey = item.sellerId || 'unknown'
    let group = sellerMap.get(sellerKey)
    if (!group) {
      group = {
        sellerName: item.sellerName || 'Seller',
        sellerStoreName: item.sellerStoreName || item.sellerName || 'Seller',
        sellerGstin: item.sellerGstin || undefined,
        items: [],
        subtotal: 0,
        totalTaxableValue: 0,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalTax: 0,
        total: 0,
      }
      sellerMap.set(sellerKey, group)
    }

    const effectivePrice = item.effectivePrice ?? item.price
    const taxableValue = item.taxableValue ?? effectivePrice * item.quantity
    const cgst = item.cgst ?? 0
    const sgst = item.sgst ?? 0
    const igst = item.igst ?? 0
    const taxAmount = item.taxAmount ?? (cgst + sgst + igst)
    const itemTotal = item.total ?? effectivePrice * item.quantity

    const lineItem: InvoiceLineItem = {
      description: item.productName || 'Product',
      hsnCode: item.hsnCode || '',
      quantity: item.quantity,
      unitPrice: effectivePrice,
      taxableValue,
      gstRate: item.gstRate ?? 0,
      cgst,
      sgst,
      igst,
      totalTax: taxAmount,
      total: itemTotal,
      variant: formatVariantDisplay(item.variant),
    }

    group.items.push(lineItem)
    group.subtotal += effectivePrice * item.quantity
    group.totalTaxableValue += taxableValue
    group.totalCgst += cgst
    group.totalSgst += sgst
    group.totalIgst += igst
    group.totalTax += taxAmount
    group.total += itemTotal
  }

  // Round seller group totals
  for (const group of sellerMap.values()) {
    group.subtotal = Math.round(group.subtotal * 100) / 100
    group.totalTaxableValue = Math.round(group.totalTaxableValue * 100) / 100
    group.totalCgst = Math.round(group.totalCgst * 100) / 100
    group.totalSgst = Math.round(group.totalSgst * 100) / 100
    group.totalIgst = Math.round(group.totalIgst * 100) / 100
    group.totalTax = Math.round(group.totalTax * 100) / 100
    group.total = Math.round(group.total * 100) / 100
  }

  const paymentMethodLabel = order.paymentMethod === 'cod'
    ? 'Cash on Delivery'
    : order.paymentMethodDetail
      ? order.paymentMethodDetail === 'upi' ? 'UPI'
        : order.paymentMethodDetail === 'card' ? 'Credit/Debit Card'
          : order.paymentMethodDetail === 'netbanking' ? 'Net Banking'
            : order.paymentMethodDetail === 'wallet' ? 'Wallet'
              : 'Online Payment'
      : 'Online Payment'

  const addr = order.shippingAddress
  const shipToAddress = [addr.addressLine1, addr.addressLine2].filter(Boolean).join(', ')

  const invoiceData: InvoiceData = {
    invoiceNumber: order.invoiceNumber || `INV-${order.orderId}`,
    invoiceDate: order.createdAt,
    orderId: order.orderId,
    orderDate: order.createdAt,

    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    customerEmail: order.customerEmail || undefined,

    shipToName: addr.name || order.customerName || '',
    shipToPhone: addr.phone || order.customerPhone || '',
    shipToAddress,
    shipToCity: addr.city || '',
    shipToState: addr.state || '',
    shipToPincode: addr.pincode || '',

    placeOfSupply: addr.state || '',

    platformName: options?.platformName || DEFAULT_BRAND_NAME,
    platformGstin: options?.platformGstin || '',
    platformAddress: options?.platformAddress,
    logoUrl: options?.logoUrl,

    sellers: Array.from(sellerMap.values()),

    totalTaxableValue: order.totalTaxableValue ?? 0,
    totalCgst: order.totalCgst ?? 0,
    totalSgst: order.totalSgst ?? 0,
    totalIgst: order.totalIgst ?? 0,
    totalGst: order.totalGst ?? 0,
    subtotal: order.subtotal ?? 0,
    productDiscount: order.productDiscount ?? 0,
    specialOfferDiscount: order.specialOfferDiscount ?? 0,
    deliveryFee: order.deliveryFee ?? 0,
    codFee: order.codFee ?? 0,
    platformFee: order.platformFee ?? 0,
    couponDiscount: order.couponDiscount ?? 0,
    roundOff: order.roundOff ?? 0,
    totalAmount: order.totalAmount ?? 0,
    walletAppliedAmount: order.walletAppliedAmount ?? 0,

    paymentMethod: paymentMethodLabel,
    paymentStatus: order.paymentStatus || 'pending',

    isIntraState: order.isIntraState ?? true,

    // Delivery option (Standard vs Express) — optional, only present on
    // orders placed after this feature shipped.
    deliveryOption: order.deliveryOption,
    deliveryOptionLabel: order.deliveryOptionLabel,
  }

  return invoiceData
}

/* ------------------------------------------------------------------ */
/*  PDF Generation (pdfkit)                                             */
/* ------------------------------------------------------------------ */

/**
 * Generate a PDF invoice buffer using pdfkit.
 * Produces a professional, GST-compliant invoice document.
 */
export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
        info: {
          Title: `Invoice ${data.invoiceNumber}`,
          Author: data.platformName,
          Subject: `Invoice for Order ${data.orderId}`,
        },
      })

      // Register DejaVu Sans fonts for ₹ symbol support
      registerFonts(doc)

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width
      const contentWidth = pageWidth - 80 // 40px margins both sides

      // ===== HEADER =====
      // Logo (left) — dynamically fetch and embed the brand logo.
      // The logo URL is transformed with Cloudinary's native e_make_transparent
      // effect so any solid background is removed (transparent PNG), giving a
      // clean, professional look on the white invoice. Non-Cloudinary URLs
      // (e.g. SVG) are returned unchanged by the helper.
      let logoEmbedded = false
      const invoiceLogoUrl = getLogoUrlWithBgRemoval(data.logoUrl)
      if (invoiceLogoUrl) {
        try {
          const logoRes = await fetch(invoiceLogoUrl)
          if (logoRes.ok) {
            const logoBuffer = Buffer.from(await logoRes.arrayBuffer())
            // Embed logo at top-left, max height 40px, auto-scale width
            doc.image(logoBuffer, 40, 35, { fit: [140, 40] })
            logoEmbedded = true
          }
        } catch {
          // Logo fetch failed — fall back to text
        }
      }

      // Platform name (left) — below logo or at top if no logo
      const nameY = logoEmbedded ? 80 : 40
      doc.font(FONT_BOLD)
      doc.fontSize(logoEmbedded ? 14 : 20)
      doc.fillColor('#059669')
      doc.text(data.platformName, 40, nameY, { width: 300 })

      doc.font(FONT_REGULAR)
      doc.fontSize(9)
      doc.fillColor('#666666')
      const addrY = logoEmbedded ? 98 : 68
      if (data.platformAddress) {
        doc.text(data.platformAddress, 40, addrY, { width: 300 })
      }
      if (data.platformGstin) {
        doc.text(`GSTIN: ${data.platformGstin}`, 40, data.platformAddress ? addrY + 15 : addrY, { width: 300 })
      }

      // "TAX INVOICE" (right)
      doc.font(FONT_BOLD)
      doc.fontSize(16)
      doc.fillColor('#1f2937')
      doc.text('TAX INVOICE', 0, 45, {
        width: pageWidth - 40,
        align: 'right',
      })

      doc.font(FONT_REGULAR)
      doc.fontSize(9)
      doc.fillColor('#666666')
      doc.text(`Invoice No: ${data.invoiceNumber}`, 0, 68, {
        width: pageWidth - 40,
        align: 'right',
      })

      const invoiceDateStr = new Date(data.invoiceDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      doc.text(`Invoice Date: ${invoiceDateStr}`, 0, 82, {
        width: pageWidth - 40,
        align: 'right',
      })

      // Separator line
      let y = 110
      doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor('#e5e7eb').lineWidth(1).stroke()
      y += 15

      // ===== BILL TO / SHIP TO / ORDER INFO =====
      const colWidth = contentWidth / 3

      // Bill To
      doc.font(FONT_BOLD)
      doc.fontSize(9)
      doc.fillColor('#9ca3af')
      doc.text('BILL TO', 40, y)

      doc.font(FONT_BOLD)
      doc.fontSize(10)
      doc.fillColor('#1f2937')
      doc.text(data.customerName || 'Customer', 40, y + 14)

      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#4b5563')
      let billY = y + 28
      if (data.customerPhone) {
        doc.text(`Phone: +91 ${data.customerPhone}`, 40, billY)
        billY += 12
      }
      if (data.customerEmail) {
        doc.text(`Email: ${data.customerEmail}`, 40, billY, { width: colWidth - 10 })
        billY += 12
      }

      // Ship To
      doc.font(FONT_BOLD)
      doc.fontSize(9)
      doc.fillColor('#9ca3af')
      doc.text('SHIP TO', 40 + colWidth, y)

      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#4b5563')
      let shipY = y + 14
      doc.text(data.shipToName, 40 + colWidth, shipY, { width: colWidth - 10 })
      shipY += 12
      if (data.shipToPhone) {
        doc.text(`Phone: +91 ${data.shipToPhone}`, 40 + colWidth, shipY, { width: colWidth - 10 })
        shipY += 12
      }
      if (data.shipToAddress) {
        doc.text(data.shipToAddress, 40 + colWidth, shipY, { width: colWidth - 10 })
        shipY += 12
      }
      doc.text(`${data.shipToCity}, ${data.shipToState} - ${data.shipToPincode}`, 40 + colWidth, shipY, { width: colWidth - 10 })

      // Order Info
      doc.font(FONT_BOLD)
      doc.fontSize(9)
      doc.fillColor('#9ca3af')
      doc.text('ORDER DETAILS', 40 + colWidth * 2, y)

      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#4b5563')
      let orderY = y + 14
      doc.text(`Order No: ${data.orderId}`, 40 + colWidth * 2, orderY, { width: colWidth - 10 })
      orderY += 12
      const orderDateStr = new Date(data.orderDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      doc.text(`Order Date: ${orderDateStr}`, 40 + colWidth * 2, orderY, { width: colWidth - 10 })
      orderY += 12
      doc.text(`Payment: ${data.paymentMethod}`, 40 + colWidth * 2, orderY, { width: colWidth - 10 })
      orderY += 12
      doc.text(`Place of Supply: ${data.placeOfSupply}`, 40 + colWidth * 2, orderY, { width: colWidth - 10 })

      y = Math.max(billY, shipY + 24, orderY + 12) + 10

      // Separator
      doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor('#e5e7eb').lineWidth(1).stroke()
      y += 15

      // ===== ITEMS TABLE (per seller) =====
      for (const seller of data.sellers) {
        // Check if we need a new page
        if (y > doc.page.height - 250) {
          doc.addPage()
          y = 40
        }

        // Seller header — use border + dark text instead of filled background
        // (filled backgrounds don't print by default in most PDF viewers)
        doc.font(FONT_BOLD)
        doc.fontSize(9)
        doc.fillColor('#1f2937')
        doc.rect(40, y, contentWidth, 18).fillColor('#f0fdf4').fill()
        doc.strokeColor('#059669').lineWidth(1).rect(40, y, contentWidth, 18).stroke()
        doc.fillColor('#065f46')
        doc.text(`Seller: ${seller.sellerStoreName}${seller.sellerGstin ? `  |  GSTIN: ${seller.sellerGstin}` : ''}`, 45, y + 4, { width: contentWidth - 10 })
        y += 18

        // Table header
        const colX = {
          desc: 40,
          hsn: 40 + contentWidth * 0.40,
          qty: 40 + contentWidth * 0.50,
          rate: 40 + contentWidth * 0.58,
          taxable: 40 + contentWidth * 0.70,
          gst: 40 + contentWidth * 0.82,
          total: 40 + contentWidth * 0.92,
        }

        doc.font(FONT_BOLD)
        doc.fontSize(8)
        doc.fillColor('#6b7280')
        doc.rect(40, y, contentWidth, 16).fill('#f9fafb')
        doc.fillColor('#6b7280')
        doc.text('DESCRIPTION', colX.desc + 4, y + 5)
        doc.text('HSN', colX.hsn, y + 5, { width: contentWidth * 0.08, align: 'left' })
        doc.text('QTY', colX.qty, y + 5, { width: contentWidth * 0.07, align: 'center' })
        doc.text('RATE', colX.rate, y + 5, { width: contentWidth * 0.10, align: 'right' })
        doc.text('TAXABLE', colX.taxable, y + 5, { width: contentWidth * 0.12, align: 'right' })
        doc.text('GST%', colX.gst, y + 5, { width: contentWidth * 0.10, align: 'right' })
        doc.text('TOTAL', colX.total, y + 5, { width: contentWidth * 0.08, align: 'right' })
        y += 16

        // Items
        doc.font(FONT_REGULAR)
        doc.fontSize(8.5)
        doc.fillColor('#1f2937')
        for (const item of seller.items) {
          if (y > doc.page.height - 60) {
            doc.addPage()
            y = 40
          }

          const descY = y
          doc.fillColor('#1f2937')
          doc.font(FONT_BOLD)
          doc.text(item.description, colX.desc + 4, descY, { width: contentWidth * 0.38 })
          if (item.variant) {
            // Place variant text AFTER the description (which may wrap to multiple lines).
            // Using doc.y ensures the variant doesn't overlap with wrapped description text.
            doc.font(FONT_REGULAR)
            doc.fontSize(8.5)
            doc.fillColor('#6b7280')
            doc.text(item.variant, colX.desc + 4, doc.y, { width: contentWidth * 0.38, lineBreak: false })
            doc.fontSize(8.5)
          }

          doc.font(FONT_REGULAR)
          doc.fillColor('#4b5563')
          doc.text(item.hsnCode || '-', colX.hsn, y + 2, { width: contentWidth * 0.08 })
          doc.text(String(item.quantity), colX.qty, y + 2, { width: contentWidth * 0.07, align: 'center' })
          doc.text(formatCurrencyShort(item.unitPrice), colX.rate, y + 2, { width: contentWidth * 0.10, align: 'right' })
          doc.text(formatCurrencyShort(item.taxableValue), colX.taxable, y + 2, { width: contentWidth * 0.12, align: 'right' })
          doc.text(`${item.gstRate}%`, colX.gst, y + 2, { width: contentWidth * 0.10, align: 'right' })
          doc.fillColor('#1f2937')
          doc.font(FONT_BOLD)
          doc.text(formatCurrencyShort(item.total), colX.total, y + 2, { width: contentWidth * 0.08, align: 'right' })

          y += 26
        }

        // Seller subtotal
        doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
        y += 6
        doc.font(FONT_BOLD)
        doc.fontSize(8)
        doc.fillColor('#374151')
        doc.text('Seller Subtotal', 40, y, { width: contentWidth * 0.70, align: 'right' })
        doc.text(formatCurrencyShort(seller.total), 40 + contentWidth * 0.70, y, { width: contentWidth * 0.30, align: 'right' })
        y += 18
      }

      // ===== TAX SUMMARY & TOTALS =====
      if (y > doc.page.height - 200) {
        doc.addPage()
        y = 40
      }

      // Two columns: Tax Summary (left) and Amount Summary (right)
      const summaryY = y + 10
      const leftColWidth = contentWidth * 0.48
      const rightColX = 40 + contentWidth * 0.52

      // Tax Summary box
      doc.rect(40, summaryY, leftColWidth, 110).fillColor('#f9fafb').fill()
      doc.strokeColor('#e5e7eb').lineWidth(0.5).rect(40, summaryY, leftColWidth, 110).stroke()

      doc.font(FONT_BOLD)
      doc.fontSize(8)
      doc.fillColor('#1f2937')  // re-set text color after rect fill
      doc.text('TAX SUMMARY', 48, summaryY + 8)

      doc.font(FONT_REGULAR)
      doc.fontSize(8.5)
      doc.fillColor('#4b5563')
      let taxY = summaryY + 24
      // Tax summary amounts: X=48 (left padding), width=leftColWidth-16 (right-aligned within left column)
      // Previous bug: X was 40+leftColWidth-8 which caused the text box to overflow into the right column
      const taxAmtWidth = leftColWidth - 16
      doc.text('Total Taxable Value', 48, taxY)
      doc.text(formatCurrency(data.totalTaxableValue), 48, taxY, { width: taxAmtWidth, align: 'right' })
      taxY += 14
      if (data.isIntraState) {
        doc.text('CGST', 48, taxY)
        doc.text(formatCurrency(data.totalCgst), 48, taxY, { width: taxAmtWidth, align: 'right' })
        taxY += 14
        doc.text('SGST', 48, taxY)
        doc.text(formatCurrency(data.totalSgst), 48, taxY, { width: taxAmtWidth, align: 'right' })
        taxY += 14
      } else {
        doc.text('IGST', 48, taxY)
        doc.text(formatCurrency(data.totalIgst), 48, taxY, { width: taxAmtWidth, align: 'right' })
        taxY += 14
      }
      doc.moveTo(48, taxY).lineTo(40 + leftColWidth - 8, taxY).strokeColor('#d1d5db').lineWidth(0.5).stroke()
      taxY += 5
      doc.font(FONT_BOLD)
      doc.fillColor('#1f2937')
      doc.text('Total GST', 48, taxY)
      doc.text(formatCurrency(data.totalGst), 48, taxY, { width: taxAmtWidth, align: 'right' })

      // Amount Summary box (right)
      const rightColWidth = contentWidth * 0.48
      doc.rect(rightColX, summaryY, rightColWidth, 110).fillColor('#f9fafb').fill()
      doc.strokeColor('#e5e7eb').lineWidth(0.5).rect(rightColX, summaryY, rightColWidth, 110).stroke()

      doc.font(FONT_BOLD)
      doc.fontSize(8)
      doc.fillColor('#1f2937')  // re-set text color after rect fill
      doc.text('AMOUNT SUMMARY', rightColX + 8, summaryY + 8)

      doc.font(FONT_REGULAR)
      doc.fontSize(8.5)
      doc.fillColor('#4b5563')
      let amtY = summaryY + 24
      doc.text('Subtotal (MRP)', rightColX + 8, amtY)
      doc.text(formatCurrencyShort(data.subtotal), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
      amtY += 13
      // Split product discount: regular markdown + special offer (matches order details page)
      const pdfSpecialDisc = data.specialOfferDiscount > 0 ? data.specialOfferDiscount : 0
      const pdfRegularDisc = Math.max(0, data.productDiscount - pdfSpecialDisc)
      if (pdfRegularDisc > 0) {
        doc.fillColor('#059669')
        doc.text('Product Discount', rightColX + 8, amtY)
        doc.text(`- ${formatCurrencyShort(pdfRegularDisc)}`, rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      if (pdfSpecialDisc > 0) {
        doc.fillColor('#d97706')
        doc.text('Special Offer', rightColX + 8, amtY)
        doc.text(`- ${formatCurrencyShort(pdfSpecialDisc)}`, rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      doc.fillColor('#4b5563')
      doc.text(
        data.deliveryOptionLabel ? `Delivery Fee (${data.deliveryOptionLabel})` : 'Delivery Fee',
        rightColX + 8,
        amtY,
      )
      doc.text(data.deliveryFee === 0 ? 'FREE' : formatCurrencyShort(data.deliveryFee), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
      amtY += 13
      if (data.codFee > 0) {
        doc.text('COD Fee', rightColX + 8, amtY)
        doc.text(formatCurrencyShort(data.codFee), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      if (data.platformFee > 0) {
        doc.text('Platform Fee', rightColX + 8, amtY)
        doc.text(formatCurrencyShort(data.platformFee), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      if (data.couponDiscount > 0) {
        doc.fillColor('#059669')
        doc.text('Coupon Discount', rightColX + 8, amtY)
        doc.text(`- ${formatCurrencyShort(data.couponDiscount)}`, rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      // Total Savings summary
      const pdfTotalSavings = data.productDiscount + (data.couponDiscount || 0)
      if (pdfTotalSavings > 0) {
        doc.fillColor('#059669')
        doc.font(FONT_BOLD)
        doc.text('Total Savings', rightColX + 8, amtY)
        doc.text(`- ${formatCurrencyShort(pdfTotalSavings)}`, rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
        doc.font(FONT_REGULAR)
      }
      // Note: Round Off is intentionally NOT shown in the invoice — matching
      // the production behavior of Flipkart / Amazon / Meesho. The total amount
      // is rounded to the nearest rupee for payment processing, but the small
      // paise adjustment is absorbed and not displayed as a separate line.

      // Total Payable — use border + dark text instead of white-on-green fill
      y = summaryY + 110 + 10
      doc.rect(40, y, contentWidth, 24).fillColor('#f0fdf4').fill()
      doc.strokeColor('#059669').lineWidth(1.5).rect(40, y, contentWidth, 24).stroke()
      doc.font(FONT_BOLD)
      doc.fontSize(11)
      doc.fillColor('#065f46')
      doc.text('TOTAL PAYABLE', 48, y + 7)
      doc.text(formatCurrencyShort(data.totalAmount), 40, y + 7, { width: contentWidth - 16, align: 'right' })
      y += 30

      // RealCart Balance + Amount Paid Online (split payment breakdown)
      if ((data.walletAppliedAmount || 0) > 0) {
        doc.fillColor('#7c3aed')
        doc.font(FONT_REGULAR)
        doc.fontSize(8)
        doc.text('RealCart Balance', 48, y)
        doc.text(`- ${formatCurrencyShort(data.walletAppliedAmount)}`, 40, y, { width: contentWidth - 16, align: 'right' })
        y += 14
        doc.fillColor('#1f2937')
        doc.font(FONT_BOLD)
        doc.text('Amount Paid Online', 48, y)
        doc.text(formatCurrencyShort(data.totalAmount - (data.walletAppliedAmount || 0)), 40, y, { width: contentWidth - 16, align: 'right' })
        y += 16
      }

      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#9ca3af')
      doc.text('All prices are inclusive of applicable taxes.', 40, y, { width: contentWidth, align: 'center' })
      y += 14

      // Payment status
      doc.font(FONT_BOLD)
      doc.fontSize(8)
      doc.fillColor(data.paymentStatus === 'paid' ? '#059669' : data.paymentStatus === 'refunded' ? '#d97706' : '#9ca3af')
      doc.text(
        `Payment Status: ${data.paymentStatus === 'paid' ? 'PAID' : data.paymentStatus === 'refunded' ? 'REFUNDED' : 'PENDING'}`,
        40,
        y,
        { width: contentWidth, align: 'center' },
      )
      y += 20

      // ===== FOOTER =====
      // Dynamic footer position — placed after content, not at fixed page bottom
      // This prevents overlap with content on multi-page invoices
      y += 10
      if (y > doc.page.height - 50) {
        doc.addPage()
        y = 40
      }
      doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
      y += 8
      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#9ca3af')
      doc.text(
        `This is a computer-generated invoice and does not require a physical signature. For queries, contact support at ${data.platformName}.`,
        40,
        y,
        { width: contentWidth, align: 'center' },
      )
      y += 12
      doc.text(`Thank you for shopping with ${data.platformName}!`, 40, y, { width: contentWidth, align: 'center' })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/* ------------------------------------------------------------------ */
/*  HTML Invoice (for email + in-app preview)                           */
/* ------------------------------------------------------------------ */

/**
 * Generate a full HTML invoice document for email body and in-app preview.
 * Uses inline styles for email client compatibility.
 */
export function generateInvoiceHTML(data: InvoiceData): string {
  const invoiceDateStr = new Date(data.invoiceDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const orderDateStr = new Date(data.orderDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const sellerSections = data.sellers.map((seller, sIdx) => {
    const itemRows = seller.items.map((item) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;">
          <div style="font-weight:600;color:#1f2937;font-size:12px;">${escapeHtml(item.description)}</div>
          ${item.variant ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">${escapeHtml(item.variant)}</div>` : ''}
        </td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:11px;color:#4b5563;">${escapeHtml(item.hsnCode) || '-'}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:11px;color:#4b5563;">${item.quantity}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:11px;color:#4b5563;">${formatCurrencyShort(item.unitPrice)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:11px;color:#4b5563;">${formatCurrencyShort(item.taxableValue)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:11px;color:#4b5563;">${item.gstRate}%</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:11px;font-weight:600;color:#1f2937;">${formatCurrencyShort(item.total)}</td>
      </tr>
    `).join('')

    return `
      <div style="margin-top:16px;">
        <div style="background:#059669;color:#fff;padding:8px 12px;border-radius:6px 6px 0 0;font-size:12px;font-weight:600;">
          Seller: ${escapeHtml(seller.sellerStoreName)}${seller.sellerGstin ? ` &nbsp;|&nbsp; GSTIN: ${escapeHtml(seller.sellerGstin)}` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 6px;text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Description</th>
              <th style="padding:8px 6px;text-align:center;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">HSN</th>
              <th style="padding:8px 6px;text-align:center;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
              <th style="padding:8px 6px;text-align:right;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Rate</th>
              <th style="padding:8px 6px;text-align:right;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Taxable</th>
              <th style="padding:8px 6px;text-align:right;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">GST</th>
              <th style="padding:8px 6px;text-align:right;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
        <div style="background:#f9fafb;padding:6px 12px;border-radius:0 0 6px 6px;text-align:right;font-size:11px;font-weight:600;color:#374151;">
          Seller Subtotal: ${formatCurrencyShort(seller.total)}
        </div>
      </div>
    `
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:800px;margin:0 auto;background:#fff;padding:32px 24px;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #059669;margin-bottom:20px;flex-wrap:wrap;gap:16px;">
      <div>
        ${(() => {
          const htmlLogoUrl = getLogoUrlWithBgRemoval(data.logoUrl)
          return htmlLogoUrl
            ? `<img src="${escapeHtml(htmlLogoUrl)}" alt="${escapeHtml(data.platformName)}" style="max-height:48px;max-width:180px;margin-bottom:8px;" />`
            : ''
        })()}
        <h1 style="font-size:24px;color:#059669;margin:0 0 4px 0;font-weight:700;">${escapeHtml(data.platformName)}</h1>
        ${data.platformAddress ? `<p style="font-size:11px;color:#6b7280;margin:0;">${escapeHtml(data.platformAddress)}</p>` : ''}
        ${data.platformGstin ? `<p style="font-size:11px;color:#6b7280;margin:4px 0 0 0;">GSTIN: <strong>${escapeHtml(data.platformGstin)}</strong></p>` : ''}
      </div>
      <div style="text-align:right;">
        <h2 style="font-size:18px;color:#1f2937;margin:0;font-weight:700;">TAX INVOICE</h2>
        <p style="font-size:11px;color:#6b7280;margin:4px 0;">Invoice No: <strong style="color:#1f2937;">${escapeHtml(data.invoiceNumber)}</strong></p>
        <p style="font-size:11px;color:#6b7280;margin:4px 0;">Date: <strong style="color:#1f2937;">${invoiceDateStr}</strong></p>
      </div>
    </div>

    <!-- Bill To / Ship To / Order Info -->
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
      <div style="flex:1;min-width:200px;">
        <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600;margin:0 0 6px 0;letter-spacing:0.5px;">Bill To</p>
        <p style="font-size:13px;font-weight:700;color:#1f2937;margin:0;">${escapeHtml(data.customerName)}</p>
        ${data.customerPhone ? `<p style="font-size:11px;color:#4b5563;margin:2px 0;">+91 ${escapeHtml(data.customerPhone)}</p>` : ''}
        ${data.customerEmail ? `<p style="font-size:11px;color:#4b5563;margin:2px 0;">${escapeHtml(data.customerEmail)}</p>` : ''}
      </div>
      <div style="flex:1;min-width:200px;">
        <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600;margin:0 0 6px 0;letter-spacing:0.5px;">Ship To</p>
        <p style="font-size:12px;font-weight:600;color:#1f2937;margin:0;">${escapeHtml(data.shipToName)}</p>
        ${data.shipToPhone ? `<p style="font-size:11px;color:#4b5563;margin:2px 0;">+91 ${escapeHtml(data.shipToPhone)}</p>` : ''}
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">${escapeHtml(data.shipToAddress)}</p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">${escapeHtml(data.shipToCity)}, ${escapeHtml(data.shipToState)} - ${escapeHtml(data.shipToPincode)}</p>
      </div>
      <div style="flex:1;min-width:200px;">
        <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600;margin:0 0 6px 0;letter-spacing:0.5px;">Order Details</p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">Order No: <strong style="color:#1f2937;">${escapeHtml(data.orderId)}</strong></p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">Order Date: ${orderDateStr}</p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">Payment: ${escapeHtml(data.paymentMethod)}</p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">Place of Supply: ${escapeHtml(data.placeOfSupply)}</p>
      </div>
    </div>

    <!-- Items per seller -->
    ${sellerSections}

    <!-- Summary -->
    <div style="display:flex;gap:16px;margin-top:20px;flex-wrap:wrap;">
      <!-- Tax Summary -->
      <div style="flex:1;min-width:280px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <h3 style="font-size:12px;color:#1f2937;margin:0 0 10px 0;font-weight:700;">Tax Summary</h3>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:6px;">
          <span>Total Taxable Value</span>
          <span>${formatCurrency(data.totalTaxableValue)}</span>
        </div>
        ${data.isIntraState ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:6px;">
            <span>CGST</span>
            <span>${formatCurrency(data.totalCgst)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:6px;">
            <span>SGST</span>
            <span>${formatCurrency(data.totalSgst)}</span>
          </div>
        ` : `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:6px;">
            <span>IGST</span>
            <span>${formatCurrency(data.totalIgst)}</span>
          </div>
        `}
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#1f2937;border-top:1px solid #d1d5db;padding-top:6px;margin-top:4px;">
          <span>Total GST</span>
          <span>${formatCurrency(data.totalGst)}</span>
        </div>
      </div>

      <!-- Amount Summary -->
      <div style="flex:1;min-width:280px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <h3 style="font-size:12px;color:#1f2937;margin:0 0 10px 0;font-weight:700;">Amount Summary</h3>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:6px;">
          <span>Subtotal (MRP)</span>
          <span>${formatCurrencyShort(data.subtotal)}</span>
        </div>
        ${(() => {
          // Split product discount into regular markdown + special offer
          // (matches the order details page breakdown exactly)
          const specialDisc = data.specialOfferDiscount > 0 ? data.specialOfferDiscount : 0
          const regularDisc = Math.max(0, data.productDiscount - specialDisc)
          const totalSavings = regularDisc + specialDisc + (data.couponDiscount || 0)
          // Price After Discount = stored tax-inclusive items total
          const priceAfterDiscount = (data.totalTaxableValue || 0) + (data.totalGst || 0) > 0
            ? (data.totalTaxableValue || 0) + (data.totalGst || 0)
            : Math.max(0, data.subtotal - totalSavings)
          return ''
        })()}
        ${data.productDiscount - (data.specialOfferDiscount || 0) > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#059669;margin-bottom:6px;">
            <span>Product Discount</span>
            <span>- ${formatCurrencyShort(data.productDiscount - (data.specialOfferDiscount || 0))}</span>
          </div>
        ` : ''}
        ${(data.specialOfferDiscount || 0) > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#d97706;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:4px 8px;margin-bottom:6px;">
            <span>✨ Special Offer</span>
            <span>- ${formatCurrencyShort(data.specialOfferDiscount)}</span>
          </div>
        ` : ''}
        ${data.couponDiscount > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#059669;margin-bottom:6px;">
            <span>Coupon Discount</span>
            <span>- ${formatCurrencyShort(data.couponDiscount)}</span>
          </div>
        ` : ''}
        ${(data.productDiscount + (data.couponDiscount || 0)) > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#059669;background:#d1fae5;border:1px solid #a7f3d0;border-radius:4px;padding:4px 8px;margin-bottom:6px;">
            <strong>Total Savings</strong>
            <strong>- ${formatCurrencyShort(data.productDiscount + (data.couponDiscount || 0))}</strong>
          </div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;border-top:1px dashed #e5e7eb;padding-top:6px;margin-bottom:6px;">
          <span>Price After Discount</span>
          <span>${formatCurrencyShort(((data.totalTaxableValue || 0) + (data.totalGst || 0)) > 0 ? ((data.totalTaxableValue || 0) + (data.totalGst || 0)) : Math.max(0, data.subtotal - (data.productDiscount + (data.couponDiscount || 0))))}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:6px;">
          <span>${data.deliveryOptionLabel ? `Delivery Fee (${data.deliveryOptionLabel})` : 'Delivery Fee'}</span>
          <span>${data.deliveryFee === 0 ? '<strong style="color:#059669;">FREE</strong>' : formatCurrencyShort(data.deliveryFee)}</span>
        </div>
        ${data.codFee > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:6px;">
            <span>COD Fee</span>
            <span>${formatCurrencyShort(data.codFee)}</span>
          </div>
        ` : ''}
        ${data.platformFee > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:6px;">
            <span>Platform Fee</span>
            <span>${formatCurrencyShort(data.platformFee)}</span>
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Total Payable + split payment breakdown -->
    <div style="background:#059669;color:#fff;padding:14px 20px;border-radius:8px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:14px;font-weight:700;">TOTAL PAYABLE</span>
      <span style="font-size:20px;font-weight:800;">${formatCurrencyShort(data.totalAmount)}</span>
    </div>
    ${(data.walletAppliedAmount || 0) > 0 ? `
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#7c3aed;padding:6px 12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;">
          <span>RealCart Balance</span>
          <span>- ${formatCurrencyShort(data.walletAppliedAmount)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#1f2937;padding:8px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;font-weight:700;">
          <span>Amount Paid Online</span>
          <span>${formatCurrencyShort(data.totalAmount - (data.walletAppliedAmount || 0))}</span>
        </div>
      </div>
    ` : ''}
    <p style="font-size:10px;color:#9ca3af;text-align:center;margin:8px 0 0 0;">
      All prices are inclusive of applicable taxes.
    </p>

    <!-- Payment Status -->
    <div style="text-align:center;margin-top:16px;">
      <span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:11px;font-weight:700;${
        data.paymentStatus === 'paid'
          ? 'background:#d1fae5;color:#059669;'
          : data.paymentStatus === 'refunded'
            ? 'background:#fef3c7;color:#d97706;'
            : 'background:#f3f4f6;color:#6b7280;'
      }">
        Payment ${data.paymentStatus === 'paid' ? 'PAID' : data.paymentStatus === 'refunded' ? 'REFUNDED' : 'PENDING'}
      </span>
    </div>

    <!-- Footer -->
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="font-size:10px;color:#9ca3af;margin:0;">
        This is a computer-generated invoice and does not require a physical signature.
      </p>
      <p style="font-size:11px;color:#6b7280;margin:6px 0 0 0;font-weight:600;">
        Thank you for shopping with ${escapeHtml(data.platformName)}!
      </p>
    </div>
  </div>
</body>
</html>`
}

/* ------------------------------------------------------------------ */
/*  Email Template (wrapper around HTML invoice)                        */
/* ------------------------------------------------------------------ */

/**
 * Generate the email HTML with a header message and the invoice below.
 */
export function generateInvoiceEmailHTML(data: InvoiceData): string {
  const greeting = `Dear ${data.customerName || 'Customer'},`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:800px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <!-- Email Header -->
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:24px;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;font-weight:700;">Order Invoice</h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:6px 0 0 0;">Your order has been placed successfully!</p>
      </div>

      <!-- Greeting -->
      <div style="padding:20px 24px 0 24px;">
        <p style="font-size:14px;color:#1f2937;margin:0;">${escapeHtml(greeting)}</p>
        <p style="font-size:13px;color:#4b5563;margin:8px 0 0 0;line-height:1.6;">
          Thank you for your order! Your invoice for order <strong style="color:#1f2937;">${escapeHtml(data.orderId)}</strong> is attached to this email and also shown below. Please find the complete tax invoice with all details including GST breakup, HSN codes, and payment summary.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin:12px 0;">
          <p style="font-size:12px;color:#059669;margin:0;">
            <strong>Invoice Number:</strong> ${escapeHtml(data.invoiceNumber)}<br>
            <strong>Order ID:</strong> ${escapeHtml(data.orderId)}<br>
            <strong>Total Amount:</strong> ${formatCurrencyShort(data.totalAmount)}<br>
            <strong>Payment:</strong> ${escapeHtml(data.paymentMethod)} (${data.paymentStatus === 'paid' ? 'Paid' : 'Pending'})
          </p>
        </div>
      </div>

      <!-- Invoice -->
      <div style="padding:0 24px 24px 24px;">
        ${generateInvoiceHTML(data).replace('<!DOCTYPE html>', '').replace(/<\/?html[^>]*>/g, '').replace(/<\/?head>[\s\S]*?<\/head>/g, '').replace(/<\/?body[^>]*>/g, '')}
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0;">
      This is an automated email. Please do not reply. For support, contact your seller or platform support.
    </p>
  </div>
</body>
</html>`
}

/* ------------------------------------------------------------------ */
/*  Utility                                                             */
/* ------------------------------------------------------------------ */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Re-export for use in other modules */
export { safe, formatCurrency, formatCurrencyShort }

/* ------------------------------------------------------------------ */
/*  CREDIT NOTE ENGINE                                                  */
/*  ------------------------------------------------------------------ */
/*  A credit note is the GST-compliant document issued to REVERSE a     */
/*  tax invoice when an order (or part of an order) is cancelled.       */
/*  Under GST Rule 16 (CGST Rules 2017), the supplier must issue a      */
/*  credit note to reverse the tax charged on the original invoice.     */
/*  This mirrors the practice of Flipkart / Amazon / Meesho India.      */
/* -------------------------------------------------------------------- */

export interface CreditNoteData {
  creditNoteNumber: string
  creditNoteDate: string
  /** Original invoice number being reversed */
  originalInvoiceNumber: string
  /** Original invoice date */
  originalInvoiceDate: string
  orderId: string
  orderDate: string

  // Customer
  customerName: string
  customerPhone: string
  customerEmail?: string

  // Shipping address
  shipToName: string
  shipToPhone: string
  shipToAddress: string
  shipToCity: string
  shipToState: string
  shipToPincode: string

  placeOfSupply: string

  // Platform details
  platformName: string
  platformGstin: string
  platformAddress?: string
  logoUrl?: string  // Brand logo URL (from settings.site.logo.url)

  // Seller groups (only the cancelled items — amounts are NEGATIVE)
  sellers: InvoiceSellerGroup[]

  // Totals (all NEGATIVE — reversal of original invoice)
  totalTaxableValue: number
  totalCgst: number
  totalSgst: number
  totalIgst: number
  totalGst: number
  subtotal: number
  productDiscount: number
  deliveryFee: number
  codFee: number
  /** Platform fee — always 0 in a credit note because the platform/handling
   *  fee is NON-REFUNDABLE per standard e-commerce policy (Amazon, Flipkart,
   *  Meesho). The original platform fee charged on the invoice is preserved
   *  in `nonRefundablePlatformFee` for transparency. */
  platformFee: number
  /** Original platform fee from the order that is NOT being refunded.
   *  Shown on the credit note for transparency so the customer understands
   *  why the refund amount excludes this fee. */
  nonRefundablePlatformFee: number
  couponDiscount: number
  roundOff: number
  /** Total amount reversed (negative number).
   *  = -(items effective total + reversed delivery + reversed COD - reversed coupon)
   *  Platform fee is NOT included (non-refundable). */
  totalAmount: number

  // Cancellation details
  cancellationReason: string
  cancelledBy: 'customer' | 'seller' | 'system'
  cancelledAt: string
  /**
   * What kind of reversal this credit note represents.
   * - 'cancellation' (default) — order/item was cancelled before delivery.
   * - 'return' — item was delivered then returned; credit note reverses
   *   the original tax invoice for the returned item(s).
   * Controls the banner text and labels shown on the PDF/HTML.
   */
  reasonType: 'cancellation' | 'return'

  // Refund details
  /** Amount refunded to customer (POSITIVE number for display) */
  refundAmount: number
  /** Human-readable refund method label */
  refundMethod: string
  /** 'processed' | 'pending' | 'not_applicable' */
  refundStatus: 'processed' | 'pending' | 'not_applicable'
  refundId?: string
  refundedAt?: string

  // Payment
  paymentMethod: string
  paymentStatus: string

  isIntraState: boolean
}

/**
 * Build structured credit note data from an Order document, restricted to the
 * cancelled item(s). Accepts an optional list of itemIds to include — when
 * omitted, all items with status 'Cancelled' are included (whole-order case).
 */
export async function buildCreditNoteData(
  order: Order,
  options?: {
    platformName?: string
    platformGstin?: string
    platformAddress?: string
    logoUrl?: string
    /** Specific item IDs to include in the credit note. If omitted, all
     *  items with status 'Cancelled' are included. */
    itemIds?: string[]
    /** Cancellation reason (defaults to order.cancellationReason) */
    reason?: string
    /** Who cancelled (defaults to order.cancelledBy or 'system') */
    cancelledBy?: 'customer' | 'seller' | 'system'
    /** What kind of reversal this is — 'cancellation' (default) or 'return'.
     *  Controls the banner text and labels shown on the PDF/HTML. */
    reasonType?: 'cancellation' | 'return'
  },
): Promise<CreditNoteData> {
  // Determine which items to include in this credit note
  const targetIds = options?.itemIds && options.itemIds.length > 0
    ? new Set(options.itemIds)
    : null

  const sellerMap = new Map<string, InvoiceSellerGroup>()

  for (const item of order.items) {
    const itemId = (item as { _id?: string; id?: string })._id?.toString()
      || (item as { id?: string }).id?.toString()
      || ''
    // Include item if: (a) specific itemIds provided and this item matches,
    // OR (b) no specific itemIds and this item's status is 'Cancelled'
    const include = targetIds
      ? targetIds.has(itemId)
      : normalizeItemStatus(item.status) === 'Cancelled'
    if (!include) continue

    const sellerKey = item.sellerId || 'unknown'
    let group = sellerMap.get(sellerKey)
    if (!group) {
      group = {
        sellerName: item.sellerName || 'Seller',
        sellerStoreName: item.sellerStoreName || item.sellerName || 'Seller',
        sellerGstin: item.sellerGstin || undefined,
        items: [],
        subtotal: 0,
        totalTaxableValue: 0,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalTax: 0,
        total: 0,
      }
      sellerMap.set(sellerKey, group)
    }

    const effectivePrice = item.effectivePrice ?? item.price
    const taxableValue = item.taxableValue ?? effectivePrice * item.quantity
    const cgst = item.cgst ?? 0
    const sgst = item.sgst ?? 0
    const igst = item.igst ?? 0
    const taxAmount = item.taxAmount ?? (cgst + sgst + igst)
    const itemTotal = item.total ?? effectivePrice * item.quantity

    const lineItem: InvoiceLineItem = {
      description: item.productName || 'Product',
      hsnCode: item.hsnCode || '',
      quantity: item.quantity,
      unitPrice: effectivePrice,
      taxableValue,
      gstRate: item.gstRate ?? 0,
      cgst,
      sgst,
      igst,
      totalTax: taxAmount,
      total: itemTotal,
      variant: formatVariantDisplay(item.variant),
    }

    group.items.push(lineItem)
    group.subtotal += effectivePrice * item.quantity
    group.totalTaxableValue += taxableValue
    group.totalCgst += cgst
    group.totalSgst += sgst
    group.totalIgst += igst
    group.totalTax += taxAmount
    group.total += itemTotal
  }

  // Round seller group totals
  for (const group of sellerMap.values()) {
    group.subtotal = Math.round(group.subtotal * 100) / 100
    group.totalTaxableValue = Math.round(group.totalTaxableValue * 100) / 100
    group.totalCgst = Math.round(group.totalCgst * 100) / 100
    group.totalSgst = Math.round(group.totalSgst * 100) / 100
    group.totalIgst = Math.round(group.totalIgst * 100) / 100
    group.totalTax = Math.round(group.totalTax * 100) / 100
    group.total = Math.round(group.total * 100) / 100
  }

  // Compute totals from the included seller groups (not the whole order)
  const sellers = Array.from(sellerMap.values())
  const totals = sellers.reduce(
    (acc, g) => {
      acc.totalTaxableValue += g.totalTaxableValue
      acc.totalCgst += g.totalCgst
      acc.totalSgst += g.totalSgst
      acc.totalIgst += g.totalIgst
      acc.totalGst += g.totalTax
      acc.subtotal += g.subtotal
      acc.total += g.total
      return acc
    },
    {
      totalTaxableValue: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0,
      totalGst: 0, subtotal: 0, total: 0,
    },
  )

  /* ----------------------------------------------------------------
   *  PRICING-MISMATCH FIX + NON-REFUNDABLE PLATFORM FEE
   * ----------------------------------------------------------------
   *  Previously the credit note negated the WHOLE ORDER's delivery fee,
   *  COD fee, platform fee, and discounts — even when only some items
   *  were cancelled. This caused the displayed components to not add up
   *  to the total reversed amount.
   *
   *  Production-standard behaviour (Amazon / Flipkart / Meesho):
   *
   *  1. PLATFORM / HANDLING FEE is NON-REFUNDABLE. It is never reversed
   *     in the credit note, even for whole-order cancellation. The
   *     original fee is shown for transparency with a "Non-refundable"
   *     label so the customer understands why the refund excludes it.
   *
   *  2. DELIVERY FEE & COD FEE are reversed ONLY when the ENTIRE order
   *     is cancelled (whole-order cancellation). For partial item
   *     cancellation the order still ships, so these fees are NOT
   *     reversed — matching Flipkart / Amazon.
   *
   *  3. PRODUCT DISCOUNT & COUPON DISCOUNT are reversed proportionally
   *     to the cancelled items. For whole-order cancellation the full
   *     discount is reversed; for partial cancellation only the
   *     cancelled items' own discount is reversed.
   *
   *  4. TOTAL REVERSED = items effective total + reversed delivery +
   *     reversed COD − reversed coupon discount. Platform fee is NOT
   *     included. This makes the displayed components mathematically
   *     add up to the total — fixing the mismatch.
   * ---------------------------------------------------------------- */

  // --- Determine if this is a whole-order or partial cancellation ---
  // Whole-order = all items in the order are included in this credit note.
  const allItemIds = (order.items || []).map((i) =>
    String((i as { _id?: string; id?: string })._id?.toString()
      || (i as { id?: string }).id?.toString()
      || ''),
  ).filter(Boolean)
  const cancelledIdSet = targetIds
    ? targetIds
    : new Set(allItemIds) // no specific IDs = all cancelled items
  const isWholeOrder = allItemIds.length > 0 && allItemIds.every((id) => cancelledIdSet.has(id))

  // --- Compute item-level product discount for cancelled items ---
  // (price − effectivePrice) × quantity, summed over cancelled items.
  // This is the discount attributable to the cancelled items only.
  let cancelledMrpSubtotal = 0 // sum of (price × qty) — original MRP for cancelled items
  for (const item of order.items) {
    const itemId = String((item as { _id?: string; id?: string })._id?.toString()
      || (item as { id?: string }).id?.toString()
      || '')
    if (!cancelledIdSet.has(itemId)) continue
    const price = item.price ?? 0
    const qty = item.quantity ?? 1
    cancelledMrpSubtotal += price * qty
  }
  // Item-level product discount for cancelled items = MRP subtotal − effective subtotal
  const cancelledEffectiveSubtotal = Math.round(totals.subtotal * 100) / 100
  const cancelledProductDiscount = Math.max(0, Math.round((cancelledMrpSubtotal - cancelledEffectiveSubtotal) * 100) / 100)

  // --- Fees to reverse (depends on whole-order vs partial) ---
  // Whole-order: reverse full delivery + COD + coupon discount.
  // Partial: only reverse the cancelled items' own product discount (above);
  //          delivery / COD / coupon are NOT reversed (order still ships).
  const reversedDeliveryFee = isWholeOrder ? (order.deliveryFee ?? 0) : 0
  const reversedCodFee = isWholeOrder ? (order.codFee ?? 0) : 0
  const reversedCouponDiscount = isWholeOrder ? (order.couponDiscount ?? 0) : 0

  // Platform fee is ALWAYS non-refundable (both whole-order and partial).
  const originalPlatformFee = order.platformFee ?? 0
  const reversedPlatformFee = 0 // never reversed

  // --- Compute the TOTAL REVERSED amount (the actual refundable value) ---
  // = items effective total + reversed delivery + reversed COD − reversed coupon
  // Platform fee is NOT included (non-refundable).
  // Product discount is already factored into the effective total (item.total
  // = effectivePrice × qty), so we do NOT subtract it again here. It is shown
  // in the display for transparency (Subtotal MRP − Product Discount = effective).
  const reversedItemsTotal = Math.round(totals.total * 100) / 100
  const totalReversedRaw = reversedItemsTotal + reversedDeliveryFee + reversedCodFee - reversedCouponDiscount
  const totalReversed = -Math.round(totalReversedRaw * 100) / 100 // negative for credit note

  // --- Determine refund details ---
  const isOnline = order.paymentMethod === 'online'
  const wasPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'refunded' || isOnline
  // refundAmount = the actual amount refunded to the customer (POSITIVE for display).
  // = |totalReversed| (excludes non-refundable platform fee).
  // For COD (not paid), refundAmount is still the reversed value but refundStatus
  // is 'not_applicable' — no actual payment was captured so no refund is processed.
  const refundAmount = Math.abs(totalReversed)
  const refundStatus: 'processed' | 'pending' | 'not_applicable' = !wasPaid
    ? 'not_applicable'
    : (order.paymentStatus === 'refunded' || !!order.refundId)
      ? 'processed'
      : 'pending'

  const refundMethod = !wasPaid
    ? 'N/A (Cash on Delivery — no payment was captured)'
    : order.paymentMethodDetail
      ? `${paymentMethodLabelFor(order.paymentMethodDetail)} — refund to original payment method`
      : 'Original payment method'

  const paymentMethodLabel = order.paymentMethod === 'cod'
    ? 'Cash on Delivery'
    : order.paymentMethodDetail
      ? paymentMethodLabelFor(order.paymentMethodDetail)
      : 'Online Payment'

  const addr = order.shippingAddress
  const shipToAddress = [addr.addressLine1, addr.addressLine2].filter(Boolean).join(', ')

  return {
    creditNoteNumber: '', // filled by caller
    creditNoteDate: order.cancelledAt || new Date().toISOString(),
    originalInvoiceNumber: order.invoiceNumber || `INV-${order.orderId}`,
    originalInvoiceDate: order.createdAt,
    orderId: order.orderId,
    orderDate: order.createdAt,

    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    customerEmail: order.customerEmail || undefined,

    shipToName: addr.name || order.customerName || '',
    shipToPhone: addr.phone || order.customerPhone || '',
    shipToAddress,
    shipToCity: addr.city || '',
    shipToState: addr.state || '',
    shipToPincode: addr.pincode || '',

    placeOfSupply: addr.state || '',

    platformName: options?.platformName || DEFAULT_BRAND_NAME,
    platformGstin: options?.platformGstin || '',
    platformAddress: options?.platformAddress,
    logoUrl: options?.logoUrl,

    sellers,

    // Negate all totals (credit note reverses the invoice)
    totalTaxableValue: -Math.round(totals.totalTaxableValue * 100) / 100,
    totalCgst: -Math.round(totals.totalCgst * 100) / 100,
    totalSgst: -Math.round(totals.totalSgst * 100) / 100,
    totalIgst: -Math.round(totals.totalIgst * 100) / 100,
    totalGst: -Math.round(totals.totalGst * 100) / 100,
    // Subtotal shown as the MRP subtotal (original price × qty), matching the
    // invoice's "Subtotal (MRP)" line. The product discount is shown separately.
    subtotal: -Math.round(cancelledMrpSubtotal * 100) / 100,
    // Product discount attributable to the cancelled items (not the whole order)
    productDiscount: -Math.round(cancelledProductDiscount * 100) / 100,
    // Delivery fee: reversed ONLY for whole-order cancellation
    deliveryFee: -Math.round(reversedDeliveryFee * 100) / 100,
    // COD fee: reversed ONLY for whole-order cancellation
    codFee: -Math.round(reversedCodFee * 100) / 100,
    // Platform fee: ALWAYS 0 (non-refundable). Original fee shown separately.
    platformFee: reversedPlatformFee,
    nonRefundablePlatformFee: Math.round(originalPlatformFee * 100) / 100,
    // Coupon discount: reversed ONLY for whole-order cancellation
    couponDiscount: -Math.round(reversedCouponDiscount * 100) / 100,
    roundOff: 0,
    // Total reversed = items + delivery + COD − coupon (NO platform fee).
    // This makes the displayed components add up to the total — fixing the
    // previous mismatch where the sum of components ≠ totalAmount.
    totalAmount: totalReversed,

    cancellationReason: options?.reason || order.cancellationReason || 'Order cancelled',
    cancelledBy: options?.cancelledBy || order.cancelledBy || 'system',
    cancelledAt: order.cancelledAt || new Date().toISOString(),
    reasonType: options?.reasonType || 'cancellation',

    refundAmount,
    refundMethod,
    refundStatus,
    refundId: order.refundId,
    refundedAt: order.refundedAt,

    paymentMethod: paymentMethodLabel,
    paymentStatus: order.paymentStatus || 'pending',

    isIntraState: order.isIntraState ?? true,
  }
}

/** Normalize an item status string to the OrderStatus union (defensive). */
function normalizeItemStatus(status: unknown): string {
  if (!status || typeof status !== 'string') return ''
  return status
}

/** Map a payment method detail code to a human-readable label. */
function paymentMethodLabelFor(detail: string): string {
  switch (detail) {
    case 'upi': return 'UPI'
    case 'card': return 'Credit/Debit Card'
    case 'netbanking': return 'Net Banking'
    case 'wallet': return 'Wallet'
    case 'emi': return 'EMI'
    default: return 'Online Payment'
  }
}

/**
 * Generate a credit note PDF buffer using pdfkit.
 * Produces a professional, GST-compliant credit note document with an amber
 * theme to visually distinguish it from the green tax invoice.
 */
export async function generateCreditNotePDF(data: CreditNoteData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
        info: {
          Title: `Credit Note ${data.creditNoteNumber}`,
          Author: data.platformName,
          Subject: `Credit Note for Order ${data.orderId} (reverses ${data.originalInvoiceNumber})`,
        },
      })

      // Register DejaVu Sans fonts for ₹ symbol support
      registerFonts(doc)

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width
      const contentWidth = pageWidth - 80

      // ===== HEADER =====
      // Logo (left) — dynamically fetch and embed the brand logo.
      // Background removed via Cloudinary e_make_transparent (see brand-settings.ts).
      let logoEmbedded = false
      const cnLogoUrl = getLogoUrlWithBgRemoval(data.logoUrl)
      if (cnLogoUrl) {
        try {
          const logoRes = await fetch(cnLogoUrl)
          if (logoRes.ok) {
            const logoBuffer = Buffer.from(await logoRes.arrayBuffer())
            doc.image(logoBuffer, 40, 35, { fit: [140, 40] })
            logoEmbedded = true
          }
        } catch {
          // Logo fetch failed — fall back to text
        }
      }

      const cnNameY = logoEmbedded ? 80 : 40
      doc.font(FONT_BOLD)
      doc.fontSize(logoEmbedded ? 14 : 20)
      doc.fillColor('#d97706')
      doc.text(data.platformName, 40, cnNameY, { width: 300 })

      doc.font(FONT_REGULAR)
      doc.fontSize(9)
      doc.fillColor('#666666')
      const cnAddrY = logoEmbedded ? 98 : 68
      if (data.platformAddress) {
        doc.text(data.platformAddress, 40, cnAddrY, { width: 300 })
      }
      if (data.platformGstin) {
        doc.text(`GSTIN: ${data.platformGstin}`, 40, data.platformAddress ? cnAddrY + 15 : cnAddrY, { width: 300 })
      }

      // "CREDIT NOTE" (right) — amber theme
      doc.font(FONT_BOLD)
      doc.fontSize(16)
      doc.fillColor('#d97706')
      doc.text('CREDIT NOTE', 0, 45, {
        width: pageWidth - 40,
        align: 'right',
      })

      doc.font(FONT_REGULAR)
      doc.fontSize(9)
      doc.fillColor('#666666')
      doc.text(`Credit Note No: ${data.creditNoteNumber}`, 0, 68, {
        width: pageWidth - 40,
        align: 'right',
      })

      const cnDateStr = new Date(data.creditNoteDate).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
      doc.text(`Date: ${cnDateStr}`, 0, 82, {
        width: pageWidth - 40,
        align: 'right',
      })

      // Reference to original invoice
      doc.fillColor('#9ca3af')
      doc.text(`Against Invoice: ${data.originalInvoiceNumber}`, 0, 96, {
        width: pageWidth - 40,
        align: 'right',
      })

      // Separator line
      let y = 120
      doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor('#fcd34d').lineWidth(1).stroke()
      y += 15

      // ===== BILL TO / SHIP TO / ORDER INFO =====
      const colWidth = contentWidth / 3

      doc.font(FONT_BOLD)
      doc.fontSize(9)
      doc.fillColor('#9ca3af')
      doc.text('BILL TO', 40, y)

      doc.font(FONT_BOLD)
      doc.fontSize(10)
      doc.fillColor('#1f2937')
      doc.text(data.customerName || 'Customer', 40, y + 14)

      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#4b5563')
      let billY = y + 28
      if (data.customerPhone) {
        doc.text(`Phone: +91 ${data.customerPhone}`, 40, billY)
        billY += 12
      }
      if (data.customerEmail) {
        doc.text(`Email: ${data.customerEmail}`, 40, billY, { width: colWidth - 10 })
        billY += 12
      }

      doc.font(FONT_BOLD)
      doc.fontSize(9)
      doc.fillColor('#9ca3af')
      doc.text('SHIP TO', 40 + colWidth, y)

      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#4b5563')
      let shipY = y + 14
      doc.text(data.shipToName, 40 + colWidth, shipY, { width: colWidth - 10 })
      shipY += 12
      if (data.shipToPhone) {
        doc.text(`Phone: +91 ${data.shipToPhone}`, 40 + colWidth, shipY, { width: colWidth - 10 })
        shipY += 12
      }
      if (data.shipToAddress) {
        doc.text(data.shipToAddress, 40 + colWidth, shipY, { width: colWidth - 10 })
        shipY += 12
      }
      doc.text(`${data.shipToCity}, ${data.shipToState} - ${data.shipToPincode}`, 40 + colWidth, shipY, { width: colWidth - 10 })

      doc.font(FONT_BOLD)
      doc.fontSize(9)
      doc.fillColor('#9ca3af')
      doc.text('ORDER DETAILS', 40 + colWidth * 2, y)

      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#4b5563')
      let orderY = y + 14
      doc.text(`Order No: ${data.orderId}`, 40 + colWidth * 2, orderY, { width: colWidth - 10 })
      orderY += 12
      const orderDateStr = new Date(data.orderDate).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
      doc.text(`Order Date: ${orderDateStr}`, 40 + colWidth * 2, orderY, { width: colWidth - 10 })
      orderY += 12
      doc.text(`Payment: ${data.paymentMethod}`, 40 + colWidth * 2, orderY, { width: colWidth - 10 })
      orderY += 12
      doc.text(`Place of Supply: ${data.placeOfSupply}`, 40 + colWidth * 2, orderY, { width: colWidth - 10 })

      y = Math.max(billY, shipY + 24, orderY + 12) + 10

      doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor('#fcd34d').lineWidth(1).stroke()
      y += 15

      // ===== CANCELLATION INFO BOX =====
      doc.rect(40, y, contentWidth, 52).fillColor('#fffbeb').fill()
      doc.strokeColor('#fcd34d').lineWidth(0.5).rect(40, y, contentWidth, 52).stroke()

      doc.font(FONT_BOLD)
      doc.fontSize(8)
      doc.fillColor('#d97706')
      doc.text(data.reasonType === 'return' ? 'RETURN DETAILS' : 'CANCELLATION DETAILS', 48, y + 8)

      doc.font(FONT_REGULAR)
      doc.fontSize(8.5)
      doc.fillColor('#92400e')
      const cancelDateStr = new Date(data.cancelledAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
      const actionLabel = data.reasonType === 'return' ? 'Returned On' : 'Cancelled On'
      const actorLabel = data.reasonType === 'return' ? 'Returned By' : 'Cancelled By'
      doc.text(`${actionLabel}: ${cancelDateStr}`, 48, y + 22)
      doc.text(`${actorLabel}: ${data.cancelledBy.charAt(0).toUpperCase() + data.cancelledBy.slice(1)}`, 48, y + 34)
      const reasonText = `Reason: ${data.cancellationReason}`
      doc.text(reasonText, 220, y + 22, { width: contentWidth - 240 })

      y += 62

      // ===== ITEMS TABLE (per seller) =====
      for (const seller of data.sellers) {
        if (y > doc.page.height - 250) {
          doc.addPage()
          y = 40
        }

        doc.font(FONT_BOLD)
        doc.fontSize(9)
        doc.fillColor('#1f2937')
        doc.rect(40, y, contentWidth, 18).fillColor('#fffbeb').fill()
        doc.strokeColor('#d97706').lineWidth(1).rect(40, y, contentWidth, 18).stroke()
        doc.fillColor('#92400e')
        doc.text(`Seller: ${seller.sellerStoreName}${seller.sellerGstin ? `  |  GSTIN: ${seller.sellerGstin}` : ''}`, 45, y + 4, { width: contentWidth - 10 })
        y += 18

        const colX = {
          desc: 40,
          hsn: 40 + contentWidth * 0.40,
          qty: 40 + contentWidth * 0.50,
          rate: 40 + contentWidth * 0.58,
          taxable: 40 + contentWidth * 0.70,
          gst: 40 + contentWidth * 0.82,
          total: 40 + contentWidth * 0.92,
        }

        doc.font(FONT_BOLD)
        doc.fontSize(8)
        doc.fillColor('#6b7280')
        doc.rect(40, y, contentWidth, 16).fill('#fffbeb')
        doc.fillColor('#6b7280')
        doc.text('DESCRIPTION', colX.desc + 4, y + 5)
        doc.text('HSN', colX.hsn, y + 5, { width: contentWidth * 0.08, align: 'left' })
        doc.text('QTY', colX.qty, y + 5, { width: contentWidth * 0.07, align: 'center' })
        doc.text('RATE', colX.rate, y + 5, { width: contentWidth * 0.10, align: 'right' })
        doc.text('TAXABLE', colX.taxable, y + 5, { width: contentWidth * 0.12, align: 'right' })
        doc.text('GST%', colX.gst, y + 5, { width: contentWidth * 0.10, align: 'right' })
        doc.text('TOTAL', colX.total, y + 5, { width: contentWidth * 0.08, align: 'right' })
        y += 16

        doc.font(FONT_REGULAR)
        doc.fontSize(8.5)
        doc.fillColor('#1f2937')
        for (const item of seller.items) {
          if (y > doc.page.height - 60) {
            doc.addPage()
            y = 40
          }

          const descY = y
          doc.fillColor('#1f2937')
          doc.font(FONT_BOLD)
          doc.text(item.description, colX.desc + 4, descY, { width: contentWidth * 0.38 })
          if (item.variant) {
            // Place variant text AFTER the description (which may wrap to multiple lines).
            // Using doc.y ensures the variant doesn't overlap with wrapped description text.
            doc.font(FONT_REGULAR)
            doc.fontSize(8.5)
            doc.fillColor('#6b7280')
            doc.text(item.variant, colX.desc + 4, doc.y, { width: contentWidth * 0.38, lineBreak: false })
            doc.fontSize(8.5)
          }

          doc.font(FONT_REGULAR)
          doc.fillColor('#4b5563')
          doc.text(item.hsnCode || '-', colX.hsn, y + 2, { width: contentWidth * 0.08 })
          doc.text(String(item.quantity), colX.qty, y + 2, { width: contentWidth * 0.07, align: 'center' })
          doc.text(formatCurrencyShort(item.unitPrice), colX.rate, y + 2, { width: contentWidth * 0.10, align: 'right' })
          doc.text(formatCurrencyShort(item.taxableValue), colX.taxable, y + 2, { width: contentWidth * 0.12, align: 'right' })
          doc.text(`${item.gstRate}%`, colX.gst, y + 2, { width: contentWidth * 0.10, align: 'right' })
          // Negative total (reversal)
          doc.fillColor('#b45309')
          doc.font(FONT_BOLD)
          doc.text(`- ${formatCurrencyShort(item.total)}`, colX.total, y + 2, { width: contentWidth * 0.08, align: 'right' })

          y += 26
        }

        doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor('#fcd34d').lineWidth(0.5).stroke()
        y += 6
        doc.font(FONT_BOLD)
        doc.fontSize(8)
        doc.fillColor('#92400e')
        doc.text('Seller Subtotal (Reversed)', 40, y, { width: contentWidth * 0.70, align: 'right' })
        doc.text(`- ${formatCurrencyShort(seller.total)}`, 40 + contentWidth * 0.70, y, { width: contentWidth * 0.30, align: 'right' })
        y += 18
      }

      // ===== TAX SUMMARY & TOTALS =====
      if (y > doc.page.height - 200) {
        doc.addPage()
        y = 40
      }

      const summaryY = y + 10
      const leftColWidth = contentWidth * 0.48
      const rightColX = 40 + contentWidth * 0.52

      // Tax Summary box
      doc.rect(40, summaryY, leftColWidth, 110).fillColor('#fffbeb').fill()
      doc.strokeColor('#fcd34d').lineWidth(0.5).rect(40, summaryY, leftColWidth, 110).stroke()

      doc.font(FONT_BOLD)
      doc.fontSize(8)
      doc.fillColor('#1f2937')
      doc.text('TAX REVERSAL SUMMARY', 48, summaryY + 8)

      doc.font(FONT_REGULAR)
      doc.fontSize(8.5)
      doc.fillColor('#92400e')
      let taxY = summaryY + 24
      // Tax summary amounts: X=48, width=leftColWidth-16 (right-aligned within left column)
      const taxAmtWidth = leftColWidth - 16
      doc.text('Taxable Value (Reversed)', 48, taxY)
      doc.text(formatCurrency(data.totalTaxableValue), 48, taxY, { width: taxAmtWidth, align: 'right' })
      taxY += 14
      if (data.isIntraState) {
        doc.text('CGST (Reversed)', 48, taxY)
        doc.text(formatCurrency(data.totalCgst), 48, taxY, { width: taxAmtWidth, align: 'right' })
        taxY += 14
        doc.text('SGST (Reversed)', 48, taxY)
        doc.text(formatCurrency(data.totalSgst), 48, taxY, { width: taxAmtWidth, align: 'right' })
        taxY += 14
      } else {
        doc.text('IGST (Reversed)', 48, taxY)
        doc.text(formatCurrency(data.totalIgst), 48, taxY, { width: taxAmtWidth, align: 'right' })
        taxY += 14
      }
      doc.moveTo(48, taxY).lineTo(40 + leftColWidth - 8, taxY).strokeColor('#fcd34d').lineWidth(0.5).stroke()
      taxY += 5
      doc.font(FONT_BOLD)
      doc.fillColor('#1f2937')
      doc.text('Total GST (Reversed)', 48, taxY)
      doc.text(formatCurrency(data.totalGst), 48, taxY, { width: taxAmtWidth, align: 'right' })

      // Refund Summary box (right) — replaces the invoice's "Amount Summary"
      const rightColWidth = contentWidth * 0.48
      doc.rect(rightColX, summaryY, rightColWidth, 110).fillColor('#fffbeb').fill()
      doc.strokeColor('#fcd34d').lineWidth(0.5).rect(rightColX, summaryY, rightColWidth, 110).stroke()

      doc.font(FONT_BOLD)
      doc.fontSize(8)
      doc.fillColor('#1f2937')
      doc.text('REFUND SUMMARY', rightColX + 8, summaryY + 8)

      doc.font(FONT_REGULAR)
      doc.fontSize(8.5)
      doc.fillColor('#92400e')
      let amtY = summaryY + 24
      doc.text('Subtotal (Reversed)', rightColX + 8, amtY)
      doc.text(formatCurrencyShort(data.subtotal), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
      amtY += 13
      if (data.productDiscount !== 0) {
        doc.fillColor('#059669')
        doc.text('Product Discount (Reversed)', rightColX + 8, amtY)
        doc.text(formatCurrencyShort(data.productDiscount), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      doc.fillColor('#92400e')
      if (data.deliveryFee !== 0) {
        doc.text('Delivery Fee (Reversed)', rightColX + 8, amtY)
        doc.text(formatCurrencyShort(data.deliveryFee), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      if (data.codFee !== 0) {
        doc.text('COD Fee (Reversed)', rightColX + 8, amtY)
        doc.text(formatCurrencyShort(data.codFee), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      // Platform Fee — NON-REFUNDABLE. Always shown (even if 0 original fee)
      // so the customer understands why it's not part of the refund.
      if (data.nonRefundablePlatformFee > 0) {
        doc.fillColor('#6b7280')
        doc.text('Platform Fee (Non-refundable)', rightColX + 8, amtY)
        doc.text('Not Reversed', rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      if (data.couponDiscount !== 0) {
        doc.fillColor('#059669')
        doc.text('Coupon Discount (Reversed)', rightColX + 8, amtY)
        doc.text(formatCurrencyShort(data.couponDiscount), rightColX + 8, amtY, { width: rightColWidth - 16, align: 'right' })
        amtY += 13
      }
      // Refund status line
      doc.font(FONT_BOLD)
      doc.fillColor(
        data.refundStatus === 'processed' ? '#059669'
          : data.refundStatus === 'pending' ? '#d97706'
            : '#6b7280',
      )
      doc.text(
        `Refund: ${data.refundStatus === 'processed' ? 'PROCESSED' : data.refundStatus === 'pending' ? 'PENDING' : 'N/A'}`,
        rightColX + 8, amtY,
      )
      amtY += 13

      // Total Reversed — use border + dark text instead of white-on-orange fill
      y = summaryY + 110 + 10
      doc.rect(40, y, contentWidth, 24).fillColor('#fffbeb').fill()
      doc.strokeColor('#d97706').lineWidth(1.5).rect(40, y, contentWidth, 24).stroke()
      doc.font(FONT_BOLD)
      doc.fontSize(11)
      doc.fillColor('#92400e')
      doc.text('TOTAL REVERSED', 48, y + 7)
      doc.text(formatCurrencyShort(data.totalAmount), 40, y + 7, { width: contentWidth - 16, align: 'right' })
      y += 30

      // Refund amount + method note
      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#4b5563')
      if (data.refundStatus !== 'not_applicable') {
        doc.text(
          `Refund of ${formatCurrencyShort(data.refundAmount)} will be credited to: ${data.refundMethod}`,
          40, y, { width: contentWidth, align: 'center' },
        )
      } else {
        doc.text(
          'No refund applicable — order was Cash on Delivery and no payment was captured.',
          40, y, { width: contentWidth, align: 'center' },
        )
      }
      y += 14

      if (data.refundStatus === 'pending') {
        doc.font(FONT_BOLD)
        doc.fontSize(8)
        doc.fillColor('#d97706')
        doc.text(
          'Refund will be processed to the original payment method within 5-7 business days.',
          40, y, { width: contentWidth, align: 'center' },
        )
        y += 14
      }

      // GST note
      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#9ca3af')
      const gstNoteText = data.reasonType === 'return'
        ? 'This credit note reverses the tax invoice issued for the returned supply, as per GST Rule 16 (CGST Rules 2017).'
        : 'This credit note reverses the tax invoice issued for the cancelled supply, as per GST Rule 16 (CGST Rules 2017).'
      doc.text(
        gstNoteText,
        40, y, { width: contentWidth, align: 'center' },
      )
      y += 14

      // ===== FOOTER =====
      // Dynamic footer position — placed after content, not at fixed page bottom
      y += 10
      if (y > doc.page.height - 50) {
        doc.addPage()
        y = 40
      }
      doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor('#fcd34d').lineWidth(0.5).stroke()
      y += 8
      doc.font(FONT_REGULAR)
      doc.fontSize(8)
      doc.fillColor('#9ca3af')
      doc.text(
        `This is a computer-generated credit note and does not require a physical signature. For queries, contact support at ${data.platformName}.`,
        40, y, { width: contentWidth, align: 'center' },
      )
      y += 12
      doc.text(`Original Invoice: ${data.originalInvoiceNumber}  |  Order: ${data.orderId}`, 40, y, { width: contentWidth, align: 'center' })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Generate a full HTML credit note document for email body and in-app preview.
 * Uses inline styles for email client compatibility. Amber theme.
 */
export function generateCreditNoteHTML(data: CreditNoteData): string {
  const cnDateStr = new Date(data.creditNoteDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const orderDateStr = new Date(data.orderDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const cancelDateStr = new Date(data.cancelledAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  const sellerSections = data.sellers.map((seller) => {
    const itemRows = seller.items.map((item) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #fef3c7;">
          <div style="font-weight:600;color:#1f2937;font-size:12px;">${escapeHtml(item.description)}</div>
          ${item.variant ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">${escapeHtml(item.variant)}</div>` : ''}
        </td>
        <td style="padding:8px 6px;border-bottom:1px solid #fef3c7;text-align:center;font-size:11px;color:#4b5563;">${escapeHtml(item.hsnCode) || '-'}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #fef3c7;text-align:center;font-size:11px;color:#4b5563;">${item.quantity}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #fef3c7;text-align:right;font-size:11px;color:#4b5563;">${formatCurrencyShort(item.unitPrice)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #fef3c7;text-align:right;font-size:11px;color:#4b5563;">${formatCurrencyShort(item.taxableValue)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #fef3c7;text-align:right;font-size:11px;color:#4b5563;">${item.gstRate}%</td>
        <td style="padding:8px 6px;border-bottom:1px solid #fef3c7;text-align:right;font-size:11px;font-weight:600;color:#b45309;">- ${formatCurrencyShort(item.total)}</td>
      </tr>
    `).join('')

    return `
      <div style="margin-top:16px;">
        <div style="background:#d97706;color:#fff;padding:8px 12px;border-radius:6px 6px 0 0;font-size:12px;font-weight:600;">
          Seller: ${escapeHtml(seller.sellerStoreName)}${seller.sellerGstin ? ` &nbsp;|&nbsp; GSTIN: ${escapeHtml(seller.sellerGstin)}` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;">
          <thead>
            <tr style="background:#fffbeb;">
              <th style="padding:8px 6px;text-align:left;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Description</th>
              <th style="padding:8px 6px;text-align:center;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">HSN</th>
              <th style="padding:8px 6px;text-align:center;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
              <th style="padding:8px 6px;text-align:right;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Rate</th>
              <th style="padding:8px 6px;text-align:right;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Taxable</th>
              <th style="padding:8px 6px;text-align:right;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">GST</th>
              <th style="padding:8px 6px;text-align:right;font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
        <div style="background:#fffbeb;padding:6px 12px;border-radius:0 0 6px 6px;text-align:right;font-size:11px;font-weight:600;color:#92400e;">
          Seller Subtotal (Reversed): - ${formatCurrencyShort(seller.total)}
        </div>
      </div>
    `
  }).join('')

  const refundBadgeColor = data.refundStatus === 'processed'
    ? 'background:#d1fae5;color:#059669;'
    : data.refundStatus === 'pending'
      ? 'background:#fef3c7;color:#d97706;'
      : 'background:#f3f4f6;color:#6b7280;'
  const refundBadgeText = data.refundStatus === 'processed'
    ? 'REFUND PROCESSED'
    : data.refundStatus === 'pending'
      ? 'REFUND PENDING'
      : 'NO REFUND (COD)'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Credit Note ${escapeHtml(data.creditNoteNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:800px;margin:0 auto;background:#fff;padding:32px 24px;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #d97706;margin-bottom:20px;flex-wrap:wrap;gap:16px;">
      <div>
        ${(() => {
          const cnHtmlLogoUrl = getLogoUrlWithBgRemoval(data.logoUrl)
          return cnHtmlLogoUrl
            ? `<img src="${escapeHtml(cnHtmlLogoUrl)}" alt="${escapeHtml(data.platformName)}" style="max-height:48px;max-width:180px;margin-bottom:8px;" />`
            : ''
        })()}
        <h1 style="font-size:24px;color:#d97706;margin:0 0 4px 0;font-weight:700;">${escapeHtml(data.platformName)}</h1>
        ${data.platformAddress ? `<p style="font-size:11px;color:#6b7280;margin:0;">${escapeHtml(data.platformAddress)}</p>` : ''}
        ${data.platformGstin ? `<p style="font-size:11px;color:#6b7280;margin:4px 0 0 0;">GSTIN: <strong>${escapeHtml(data.platformGstin)}</strong></p>` : ''}
      </div>
      <div style="text-align:right;">
        <h2 style="font-size:18px;color:#d97706;margin:0;font-weight:700;">CREDIT NOTE</h2>
        <p style="font-size:11px;color:#6b7280;margin:4px 0;">Credit Note No: <strong style="color:#1f2937;">${escapeHtml(data.creditNoteNumber)}</strong></p>
        <p style="font-size:11px;color:#6b7280;margin:4px 0;">Date: <strong style="color:#1f2937;">${cnDateStr}</strong></p>
        <p style="font-size:11px;color:#9ca3af;margin:4px 0;">Against Invoice: ${escapeHtml(data.originalInvoiceNumber)}</p>
      </div>
    </div>

    <!-- Cancellation/Return Notice Banner -->
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="font-size:13px;color:#92400e;margin:0;font-weight:600;">
        ${data.reasonType === 'return'
          ? 'Return Completed — This credit note reverses the original tax invoice for the returned item(s).'
          : 'Order Cancelled — This credit note reverses the original tax invoice.'}
      </p>
      <p style="font-size:11px;color:#92400e;margin:6px 0 0 0;">
        <strong>${data.reasonType === 'return' ? 'Returned On' : 'Cancelled On'}:</strong> ${cancelDateStr} &nbsp;|&nbsp;
        <strong>${data.reasonType === 'return' ? 'Returned By' : 'Cancelled By'}:</strong> ${escapeHtml(data.cancelledBy.charAt(0).toUpperCase() + data.cancelledBy.slice(1))}<br>
        <strong>Reason:</strong> ${escapeHtml(data.cancellationReason)}
      </p>
    </div>

    <!-- Bill To / Ship To / Order Info -->
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
      <div style="flex:1;min-width:200px;">
        <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600;margin:0 0 6px 0;letter-spacing:0.5px;">Bill To</p>
        <p style="font-size:13px;font-weight:700;color:#1f2937;margin:0;">${escapeHtml(data.customerName)}</p>
        ${data.customerPhone ? `<p style="font-size:11px;color:#4b5563;margin:2px 0;">+91 ${escapeHtml(data.customerPhone)}</p>` : ''}
        ${data.customerEmail ? `<p style="font-size:11px;color:#4b5563;margin:2px 0;">${escapeHtml(data.customerEmail)}</p>` : ''}
      </div>
      <div style="flex:1;min-width:200px;">
        <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600;margin:0 0 6px 0;letter-spacing:0.5px;">Ship To</p>
        <p style="font-size:12px;font-weight:600;color:#1f2937;margin:0;">${escapeHtml(data.shipToName)}</p>
        ${data.shipToPhone ? `<p style="font-size:11px;color:#4b5563;margin:2px 0;">+91 ${escapeHtml(data.shipToPhone)}</p>` : ''}
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">${escapeHtml(data.shipToAddress)}</p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">${escapeHtml(data.shipToCity)}, ${escapeHtml(data.shipToState)} - ${escapeHtml(data.shipToPincode)}</p>
      </div>
      <div style="flex:1;min-width:200px;">
        <p style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600;margin:0 0 6px 0;letter-spacing:0.5px;">Order Details</p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">Order No: <strong style="color:#1f2937;">${escapeHtml(data.orderId)}</strong></p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">Order Date: ${orderDateStr}</p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">Payment: ${escapeHtml(data.paymentMethod)}</p>
        <p style="font-size:11px;color:#4b5563;margin:2px 0;">Place of Supply: ${escapeHtml(data.placeOfSupply)}</p>
      </div>
    </div>

    <!-- Items per seller -->
    ${sellerSections}

    <!-- Summary -->
    <div style="display:flex;gap:16px;margin-top:20px;flex-wrap:wrap;">
      <!-- Tax Reversal Summary -->
      <div style="flex:1;min-width:280px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;">
        <h3 style="font-size:12px;color:#1f2937;margin:0 0 10px 0;font-weight:700;">Tax Reversal Summary</h3>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px;">
          <span>Taxable Value (Reversed)</span>
          <span>${formatCurrency(data.totalTaxableValue)}</span>
        </div>
        ${data.isIntraState ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px;">
            <span>CGST (Reversed)</span>
            <span>${formatCurrency(data.totalCgst)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px;">
            <span>SGST (Reversed)</span>
            <span>${formatCurrency(data.totalSgst)}</span>
          </div>
        ` : `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px;">
            <span>IGST (Reversed)</span>
            <span>${formatCurrency(data.totalIgst)}</span>
          </div>
        `}
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#1f2937;border-top:1px solid #fcd34d;padding-top:6px;margin-top:4px;">
          <span>Total GST (Reversed)</span>
          <span>${formatCurrency(data.totalGst)}</span>
        </div>
      </div>

      <!-- Refund Summary -->
      <div style="flex:1;min-width:280px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;">
        <h3 style="font-size:12px;color:#1f2937;margin:0 0 10px 0;font-weight:700;">Refund Summary</h3>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px;">
          <span>Subtotal (Reversed)</span>
          <span>${formatCurrencyShort(data.subtotal)}</span>
        </div>
        ${data.productDiscount !== 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#059669;margin-bottom:6px;">
            <span>Product Discount (Reversed)</span>
            <span>${formatCurrencyShort(data.productDiscount)}</span>
          </div>
        ` : ''}
        ${data.deliveryFee !== 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px;">
            <span>Delivery Fee (Reversed)</span>
            <span>${formatCurrencyShort(data.deliveryFee)}</span>
          </div>
        ` : ''}
        ${data.codFee !== 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px;">
            <span>COD Fee (Reversed)</span>
            <span>${formatCurrencyShort(data.codFee)}</span>
          </div>
        ` : ''}
        ${data.nonRefundablePlatformFee > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:6px;">
            <span>Platform Fee (Non-refundable)</span>
            <span style="font-style:italic;">Not Reversed</span>
          </div>
        ` : ''}
        ${data.couponDiscount !== 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#059669;margin-bottom:6px;">
            <span>Coupon Discount (Reversed)</span>
            <span>${formatCurrencyShort(data.couponDiscount)}</span>
          </div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#92400e;margin-bottom:6px;">
          <span>Refund Method</span>
          <span style="text-align:right;font-size:10px;">${escapeHtml(data.refundMethod)}</span>
        </div>
      </div>
    </div>

    <!-- Total Reversed -->
    <div style="background:#d97706;color:#fff;padding:14px 20px;border-radius:8px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:14px;font-weight:700;">TOTAL REVERSED</span>
      <span style="font-size:20px;font-weight:800;">${formatCurrencyShort(data.totalAmount)}</span>
    </div>

    <!-- Refund status + note -->
    <div style="text-align:center;margin-top:16px;">
      <span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:11px;font-weight:700;${refundBadgeColor}">
        ${refundBadgeText}
      </span>
    </div>
    <p style="font-size:11px;color:#4b5563;text-align:center;margin:10px 0 0 0;">
      ${data.refundStatus === 'not_applicable'
        ? 'No refund applicable — order was Cash on Delivery and no payment was captured.'
        : `A refund of <strong>${formatCurrencyShort(data.refundAmount)}</strong> will be credited to your original payment method${data.refundStatus === 'pending' ? ' within 5-7 business days.' : '.'}`}
    </p>

    <!-- GST note -->
    <p style="font-size:10px;color:#9ca3af;text-align:center;margin:8px 0 0 0;">
      This credit note reverses the tax invoice issued for the cancelled supply, as per GST Rule 16 (CGST Rules 2017).
    </p>

    <!-- Footer -->
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #fcd34d;text-align:center;">
      <p style="font-size:10px;color:#9ca3af;margin:0;">
        This is a computer-generated credit note and does not require a physical signature.
      </p>
      <p style="font-size:11px;color:#6b7280;margin:6px 0 0 0;font-weight:600;">
        Original Invoice: ${escapeHtml(data.originalInvoiceNumber)} &nbsp;|&nbsp; Order: ${escapeHtml(data.orderId)}
      </p>
    </div>
  </div>
</body>
</html>`
}

/**
 * Generate the credit note email HTML with a header message and the credit note below.
 */
export function generateCreditNoteEmailHTML(data: CreditNoteData): string {
  const greeting = `Dear ${data.customerName || 'Customer'},`
  const cancelDateStr = new Date(data.cancelledAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const isReturn = data.reasonType === 'return'
  const emailHeaderTitle = isReturn ? 'Return Completed — Credit Note' : 'Order Cancelled — Credit Note'
  const emailHeaderSubtitle = isReturn
    ? 'Your return has been completed and a credit note has been issued.'
    : 'Your order has been cancelled as requested.'
  const emailBodyIntro = isReturn
    ? `Your return for order <strong style="color:#1f2937;">${escapeHtml(data.orderId)}</strong> has been completed. A credit note has been generated to reverse the original tax invoice for the returned item(s), as per GST regulations. The credit note is attached to this email and also shown below.`
    : `Your order <strong style="color:#1f2937;">${escapeHtml(data.orderId)}</strong> has been cancelled. A credit note has been generated to reverse the original tax invoice, as per GST regulations. The credit note is attached to this email and also shown below.`
  const actionLabel = isReturn ? 'Returned On' : 'Cancelled On'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:800px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <!-- Email Header -->
      <div style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:24px;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;font-weight:700;">${emailHeaderTitle}</h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:6px 0 0 0;">${emailHeaderSubtitle}</p>
      </div>

      <!-- Greeting -->
      <div style="padding:20px 24px 0 24px;">
        <p style="font-size:14px;color:#1f2937;margin:0;">${escapeHtml(greeting)}</p>
        <p style="font-size:13px;color:#4b5563;margin:8px 0 0 0;line-height:1.6;">
          ${emailBodyIntro}
        </p>
        <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin:12px 0;">
          <p style="font-size:12px;color:#92400e;margin:0;">
            <strong>Credit Note Number:</strong> ${escapeHtml(data.creditNoteNumber)}<br>
            <strong>Order ID:</strong> ${escapeHtml(data.orderId)}<br>
            <strong>${actionLabel}:</strong> ${cancelDateStr}<br>
            <strong>Reason:</strong> ${escapeHtml(data.cancellationReason)}<br>
            <strong>Total Reversed:</strong> ${formatCurrencyShort(data.totalAmount)}<br>
            <strong>Refund:</strong> ${data.refundStatus === 'processed'
              ? 'Processed to original payment method'
              : data.refundStatus === 'pending'
                ? 'Will be processed within 5-7 business days'
                : 'Not applicable (Cash on Delivery)'}
          </p>
        </div>
      </div>

      <!-- Credit Note -->
      <div style="padding:0 24px 24px 24px;">
        ${generateCreditNoteHTML(data).replace('<!DOCTYPE html>', '').replace(/<\/?html[^>]*>/g, '').replace(/<\/?head>[\s\S]*?<\/head>/g, '').replace(/<\/?body[^>]*>/g, '')}
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0;">
      This is an automated email. Please do not reply. For support, contact your seller or platform support.
    </p>
  </div>
</body>
</html>`
}
