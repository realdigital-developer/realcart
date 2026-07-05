/**
 * Email Service — Production Email Delivery with Graceful Fallback
 *
 * Uses nodemailer for SMTP email delivery. When SMTP is not configured
 * (common in sandbox/dev environments), emails are stored in an `email_queue`
 * MongoDB collection for later retry and the content is logged.
 *
 * This ensures that:
 *   1. Order creation NEVER fails due to email issues
 *   2. Invoices are always generated and available for download
 *   3. Emails are sent when SMTP is available
 *   4. The email queue can be flushed later when SMTP is configured
 *
 * Configuration (via environment variables):
 *   SMTP_HOST       — SMTP server hostname (e.g., smtp.gmail.com)
 *   SMTP_PORT       — SMTP port (e.g., 587, 465)
 *   SMTP_USER       — SMTP username
 *   SMTP_PASS       — SMTP password / app password
 *   SMTP_FROM       — From email address (e.g., "ShopHub <noreply@shophub.com>")
 *   SMTP_SECURE     — "true" for port 465 (TLS), "false" for 587 (STARTTLS)
 *
 * If SMTP_HOST is not set, all emails go to the email_queue collection.
 */

import nodemailer, { type Transporter } from 'nodemailer'
import { connectToDatabase } from '@/lib/mongodb'

/* ------------------------------------------------------------------ */
/*  Types & DB-backed SMTP config                                       */
/* ------------------------------------------------------------------ */

export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
  attachments?: EmailAttachment[]
}

export interface EmailResult {
  success: boolean
  messageId?: string
  queued: boolean
  error?: string
}

/* ------------------------------------------------------------------ */
/*  DB-backed SMTP configuration                                        */
/*                                                                     */
/*  SMTP credentials can be configured in TWO ways (checked in order): */
/*    1. Database  — settings collection { key: 'email', ... }          */
/*       (configured via Admin → Settings → Email/SMTP)                 */
/*    2. Env vars  — SMTP_HOST / SMTP_USER / SMTP_PASS / ...            */
/*       (legacy / .env file fallback)                                  */
/*                                                                     */
/*  This dual approach means the admin can configure SMTP from the UI  */
/*  without needing to edit .env or restart the server, while still     */
/*  supporting the env-var workflow for backward compatibility.         */
/* ------------------------------------------------------------------ */

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  requireTLS: boolean
  user: string
  pass: string
  from: string
}

/**
 * Normalize the port/secure/requireTLS relationship.
 *
 *  - Port 465  → direct TLS from connection start → secure: true,  requireTLS: false
 *  - Port 587  → plain text → STARTTLS upgrade     → secure: false, requireTLS: true
 *  - Port 25   → plain text → STARTTLS (if supported) → secure: false, requireTLS: true
 *  - Other     → plain text → STARTTLS upgrade     → secure: false, requireTLS: true
 *
 * We intentionally OVERRIDE the user-set `smtpSecure` flag when the port
 * doesn't match. The wrong combo (e.g. `secure: true` on port 587) is the
 * #1 cause of "wrong version number" TLS errors with Gmail / Outlook /
 * Amazon SES. Auto-correcting here means the admin can't accidentally
 * misconfigure SMTP via the UI toggle — the port dictates the correct mode.
 */
function normalizeSecureFlags(port: number, userSecure: boolean): { secure: boolean; requireTLS: boolean } {
  if (port === 465) {
    return { secure: true, requireTLS: false }
  }
  if (port === 587 || port === 25 || port === 2525) {
    return { secure: false, requireTLS: true }
  }
  // Unknown port — respect user's secure flag, but enable requireTLS as a
  // safety net for the common STARTTLS case.
  return { secure: userSecure, requireTLS: !userSecure }
}

/** In-memory cache of DB SMTP config (refreshed every 60s). */
let dbSmtpCache: SmtpConfig | null = null
let dbSmtpCacheAt = 0
let dbSmtpChecked = false // set true after first DB lookup attempt
const DB_SMTP_CACHE_TTL = 60_000 // 60 seconds

/**
 * Load SMTP configuration from the database `settings` collection.
 * Returns null if not configured in DB.
 *
 * Cached for 60 seconds to avoid a DB hit on every email send.
 */
async function loadDbSmtpConfig(): Promise<SmtpConfig | null> {
  const now = Date.now()
  if (dbSmtpChecked && now - dbSmtpCacheAt < DB_SMTP_CACHE_TTL) {
    return dbSmtpCache
  }

  dbSmtpChecked = true
  dbSmtpCacheAt = now

  try {
    const { db } = await connectToDatabase()
    const doc = await db.collection('settings').findOne({ key: 'email' })
    if (!doc) {
      dbSmtpCache = null
      return null
    }

    const host = String(doc.smtpHost || '').trim()
    const user = String(doc.smtpUser || '').trim()
    const pass = String(doc.smtpPass || '').trim()

    // All three are required for SMTP to work
    if (!host || !user || !pass) {
      dbSmtpCache = null
      return null
    }

    const port = parseInt(String(doc.smtpPort || '587'), 10) || 587
    // CRITICAL: Auto-correct the secure flag based on port. The user-set
    // `smtpSecure` flag in the DB may be wrong (e.g. `true` with port 587),
    // which causes "wrong version number" TLS handshake failures. The port
    // dictates the correct mode: 465 → direct TLS (secure:true), 587/25/2525
    // → STARTTLS (secure:false + requireTLS:true).
    const userSecure = doc.smtpSecure === true || doc.smtpSecure === 'true'
    const { secure, requireTLS } = normalizeSecureFlags(port, userSecure)
    if (userSecure !== secure) {
      console.warn(
        `[EmailService] Auto-correcting SMTP secure flag: port ${port} requires secure=${secure} (was ${userSecure}). ` +
        `This fixes "wrong version number" TLS errors. requireTLS=${requireTLS}.`
      )
    }
    const from = String(doc.smtpFrom || '').trim() || user

    dbSmtpCache = { host, port, secure, requireTLS, user, pass, from }
    return dbSmtpCache
  } catch {
    // DB error — fall back to env vars
    dbSmtpCache = null
    return null
  }
}

/**
 * Force a refresh of the cached DB SMTP config. Called by the admin
 * email-settings PUT route so changes take effect immediately.
 */
export function invalidateSmtpCache(): void {
  dbSmtpCache = null
  dbSmtpChecked = false
  dbSmtpCacheAt = 0
  // Also reset the transporter so it's recreated with new credentials
  transporter = null
  transporterInitFailed = false
}

/* ------------------------------------------------------------------ */
/*  Singleton Transporter                                               */
/* ------------------------------------------------------------------ */

let transporter: Transporter | null = null
let transporterInitFailed = false

/**
 * Check if SMTP is configured (in DB or env vars).
 * Checks DB first (cached), then falls back to env vars.
 */
export async function isSmtpConfigured(): Promise<boolean> {
  // 1. Check DB settings (admin-configurable via UI)
  const dbConfig = await loadDbSmtpConfig()
  if (dbConfig) return true

  // 2. Fall back to env vars (legacy / .env file)
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

/**
 * Synchronous check — only checks env vars (no DB hit).
 * Used in contexts where an async DB lookup isn't feasible.
 * Prefer isSmtpConfigured() (async) whenever possible.
 */
export function isSmtpConfiguredSync(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

/**
 * Get or create the nodemailer transporter (singleton).
 * Checks DB SMTP config first, then env vars. Returns null if neither
 * is configured.
 */
async function getTransporter(): Promise<Transporter | null> {
  if (transporterInitFailed) return null
  if (transporter) return transporter

  // 1. Try DB config first (admin-configurable via UI)
  const dbConfig = await loadDbSmtpConfig()
  if (dbConfig) {
    try {
      transporter = nodemailer.createTransport({
        host: dbConfig.host,
        port: dbConfig.port,
        secure: dbConfig.secure,
        requireTLS: dbConfig.requireTLS,
        auth: {
          user: dbConfig.user,
          pass: dbConfig.pass,
        },
        // CRITICAL: Force IPv4. Many sandbox / cloud / container environments
        // lack IPv6 connectivity, but Node.js's default Happy Eyeballs
        // implementation prefers IPv6 (AAAA records) when available.
        // For Gmail (smtp.gmail.com resolves to both A and AAAA records),
        // this causes `connect ENETUNREACH <ipv6>:587 - Local (:::0)`.
        // Forcing family:4 makes Node.js connect via IPv4 only.
        family: 4,
        // Generous timeouts — SMTP servers can be slow to greet, especially
        // when there's network latency or greylisting.
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 30000,
        // Disable pooled connections — each email uses a fresh connection
        // to avoid stale-connection issues that can occur in serverless
        // environments.
        pool: false,
      } as nodemailer.TransportOptions)
      console.log(
        `[EmailService] Transporter created from DB config: ${dbConfig.host}:${dbConfig.port} ` +
        `(secure=${dbConfig.secure}, requireTLS=${dbConfig.requireTLS}, ipv4-only)`
      )
      return transporter
    } catch (err) {
      console.error('[EmailService] Failed to create transporter from DB config:', err)
      // Fall through to env-var check
    }
  }

  // 2. Fall back to env vars
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null
  }

  try {
    const port = parseInt(process.env.SMTP_PORT || '587', 10)
    const userSecureEnv = process.env.SMTP_SECURE === 'true'
    const { secure, requireTLS } = normalizeSecureFlags(port, userSecureEnv)

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      requireTLS,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      family: 4, // Force IPv4 (see comment above)
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 30000,
      pool: false,
    } as nodemailer.TransportOptions)

    console.log(
      `[EmailService] Transporter created from env vars: ${process.env.SMTP_HOST}:${port} ` +
      `(secure=${secure}, requireTLS=${requireTLS}, ipv4-only)`
    )
    return transporter
  } catch (err) {
    console.error('[EmailService] Failed to create transporter from env vars:', err)
    transporterInitFailed = true
    return null
  }
}

/**
 * Get the "from" address for outgoing emails.
 * Checks DB config first, then env vars, then falls back to a default.
 */
async function getFromAddress(): Promise<string> {
  const dbConfig = await loadDbSmtpConfig()
  if (dbConfig) return dbConfig.from
  return process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@shophub.com'
}

/* ------------------------------------------------------------------ */
/*  Email Queue (fallback when SMTP not configured)                     */
/* ------------------------------------------------------------------ */

/**
 * Store an email in the email_queue collection for later delivery.
 */
async function queueEmail(params: SendEmailParams): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    await db.collection('email_queue').insertOne({
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || '',
      attachments: (params.attachments || []).map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content.toString('base64'),
        encoding: 'base64',
      })),
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      lastAttemptAt: null,
    })
  } catch (err) {
    // Even the queue failed — log it but don't throw
    console.error('[EmailService] Failed to queue email:', err)
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Send an email. If SMTP is not configured, the email is queued.
 *
 * This function NEVER throws — it always returns an EmailResult.
 * This is critical because email should never block order creation.
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  // Validate recipient
  if (!params.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.to)) {
    console.warn(`[EmailService] Invalid recipient email: "${params.to}"`)
    return {
      success: false,
      queued: false,
      error: 'Invalid recipient email address',
    }
  }

  const transport = await getTransporter()

  // No SMTP configured — queue for later
  if (!transport) {
    console.log(`[EmailService] SMTP not configured. Queuing email to ${params.to} (subject: "${params.subject}")`)
    await queueEmail(params)
    return {
      success: false,
      queued: true,
      error: 'SMTP not configured — email queued for later delivery',
    }
  }

  // Send via SMTP
  try {
    const fromAddress = await getFromAddress()

    const info = await transport.sendMail({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || '',
      attachments: (params.attachments || []).map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    })

    console.log(`[EmailService] Email sent to ${params.to}: ${info.messageId} (subject: "${params.subject}")`)
    return {
      success: true,
      messageId: info.messageId,
      queued: false,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    // Provide actionable hints for common SMTP errors
    let hint = ''
    if (/ENETUNREACH|ECONNREFUSED|ETIMEDOUT/.test(errorMsg)) {
      hint = ' [Hint: Network unreachable — the SMTP server may be blocked or unreachable from this host. If using Gmail, ensure IPv4 is forced and port 587/465 is open.]'
    } else if (/wrong version number|SSL routines/.test(errorMsg)) {
      hint = ' [Hint: TLS mismatch — port 587 requires STARTTLS (secure=false), port 465 requires direct TLS (secure=true). The system auto-corrects this; if you still see this error, verify the SMTP host is correct.]'
    } else if (/Invalid login|Authentication failed|535|534/.test(errorMsg)) {
      hint = ' [Hint: SMTP authentication failed — check the username and password/app-password. For Gmail, use a 16-char App Password, not your account password.]'
    } else if (/EENVELOPE|550|553|Sender rejected/.test(errorMsg)) {
      hint = ' [Hint: The "From" address was rejected by the SMTP server. For Gmail, the From address must match the SMTP username (or be a verified alias).]'
    }
    console.error(`[EmailService] Failed to send email to ${params.to} (subject: "${params.subject}"):${hint}\n  Error: ${errorMsg}`)

    // Queue for retry
    await queueEmail(params)

    return {
      success: false,
      queued: true,
      error: errorMsg + hint,
    }
  }
}

/**
 * Send an invoice email to the customer.
 * Wrapper around sendEmail with invoice-specific defaults.
 */
export async function sendInvoiceEmail(params: {
  to: string
  customerName: string
  orderId: string
  invoiceNumber: string
  invoiceHTML: string
  pdfBuffer: Buffer
}): Promise<EmailResult> {
  const subject = `Invoice ${params.invoiceNumber} for Order ${params.orderId}`

  // Plain text fallback
  const text = `Dear ${params.customerName},

Thank you for your order! Your invoice is attached to this email.

Invoice Number: ${params.invoiceNumber}
Order ID: ${params.orderId}

Please find the detailed tax invoice in the attached PDF.

Thank you for shopping with us!`

  return sendEmail({
    to: params.to,
    subject,
    html: params.invoiceHTML,
    text,
    attachments: [
      {
        filename: `Invoice-${params.invoiceNumber}.pdf`,
        content: params.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  })
}

/**
 * Send a credit note email to the customer when an order is cancelled OR
 * when a return is completed.
 *
 * A credit note is the GST-compliant document that reverses the original tax
 * invoice. This email informs the customer that their order has been cancelled
 * (or their return completed), includes the reason, refund details, and
 * attaches the credit note PDF. Mirrors the practice of Flipkart / Amazon /
 * Meesho India.
 *
 * `reasonType` controls the email subject/body wording:
 *   - 'cancellation' (default) — order cancelled before delivery
 *   - 'return' — item was delivered, then returned and return completed
 */
export async function sendCreditNoteEmail(params: {
  to: string
  customerName: string
  orderId: string
  creditNoteNumber: string
  originalInvoiceNumber: string
  cancellationReason: string
  refundStatus: 'processed' | 'pending' | 'not_applicable'
  refundAmount: number
  creditNoteHTML: string
  pdfBuffer: Buffer
  reasonType?: 'cancellation' | 'return'
}): Promise<EmailResult> {
  const isReturn = params.reasonType === 'return'
  const subject = isReturn
    ? `Return Completed — Credit Note ${params.creditNoteNumber} for Order ${params.orderId}`
    : `Order Cancelled — Credit Note ${params.creditNoteNumber} for Order ${params.orderId}`

  const refundText = params.refundStatus === 'not_applicable'
    ? 'No refund is applicable as this was a Cash on Delivery order and no payment was captured.'
    : params.refundStatus === 'processed'
      ? `A refund of Rs. ${params.refundAmount} has been processed to your original payment method.`
      : `A refund of Rs. ${params.refundAmount} will be credited to your original payment method within 5-7 business days.`

  const text = isReturn
    ? `Dear ${params.customerName},

Your return for order ${params.orderId} has been completed.

Return Reason: ${params.cancellationReason}

A credit note (${params.creditNoteNumber}) has been generated to reverse the original tax invoice (${params.originalInvoiceNumber}) for the returned item(s). The credit note is attached to this email as a PDF.

${refundText}

If you have any questions, please contact our support team.

Thank you for shopping with us!`
    : `Dear ${params.customerName},

Your order ${params.orderId} has been cancelled.

Cancellation Reason: ${params.cancellationReason}

A credit note (${params.creditNoteNumber}) has been generated to reverse the original tax invoice (${params.originalInvoiceNumber}). The credit note is attached to this email as a PDF.

${refundText}

If you did not request this cancellation or have any questions, please contact our support team.

Thank you for shopping with us!`

  return sendEmail({
    to: params.to,
    subject,
    html: params.creditNoteHTML,
    text,
    attachments: [
      {
        filename: `CreditNote-${params.creditNoteNumber}.pdf`,
        content: params.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  })
}

/**
 * Send an "Order Delivered" confirmation email to the customer.
 *
 * Mirrors Flipkart / Amazon / Meesho practice of sending a delivery
 * confirmation email when an order is marked Delivered. The email includes
 * the order ID, delivery date, and a reminder that the invoice is available
 * in the customer panel. No PDF attachment (invoice already emailed at order
 * placement and available in the panel).
 */
export async function sendOrderDeliveredEmail(params: {
  to: string
  customerName: string
  orderId: string
  invoiceNumber?: string
  deliveredAt: string
  itemsSummary: string
  platformName?: string
}): Promise<EmailResult> {
  const platformName = params.platformName || 'RealCart'
  const deliveredDateStr = new Date(params.deliveredAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const subject = `Order Delivered — ${params.orderId}`

  const text = `Dear ${params.customerName},

Great news! Your order ${params.orderId} has been delivered successfully on ${deliveredDateStr}.

Items in this order:
${params.itemsSummary}

${params.invoiceNumber ? `Invoice Number: ${params.invoiceNumber}\n` : ''}You can view and download your invoice from the "My Orders" section in your account.

We hope you love your purchase! If you're not satisfied, you can request a return from your order details page within the return window.

Thank you for shopping with ${platformName}!`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:24px;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;font-weight:700;">Order Delivered!</h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:6px 0 0 0;">Your order has arrived.</p>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#1f2937;margin:0;">Dear ${escapeHtmlSimple(params.customerName)},</p>
        <p style="font-size:13px;color:#4b5563;margin:8px 0 0 0;line-height:1.6;">
          Great news! Your order <strong style="color:#1f2937;">${escapeHtmlSimple(params.orderId)}</strong> has been delivered successfully on <strong>${deliveredDateStr}</strong>.
        </p>
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px;margin:16px 0;">
          <p style="font-size:12px;color:#065f46;margin:0;">
            <strong>Order ID:</strong> ${escapeHtmlSimple(params.orderId)}<br>
            <strong>Delivered On:</strong> ${deliveredDateStr}<br>
            ${params.invoiceNumber ? `<strong>Invoice Number:</strong> ${escapeHtmlSimple(params.invoiceNumber)}<br>` : ''}
          </p>
        </div>
        <p style="font-size:13px;color:#4b5563;margin:12px 0 0 0;line-height:1.6;">
          <strong>Items delivered:</strong>
        </p>
        <p style="font-size:12px;color:#4b5563;margin:4px 0 0 0;line-height:1.6;white-space:pre-line;">${escapeHtmlSimple(params.itemsSummary)}</p>
        <p style="font-size:13px;color:#4b5563;margin:16px 0 0 0;line-height:1.6;">
          You can view and download your invoice from the "My Orders" section in your account. If you're not satisfied with your purchase, you can request a return from your order details page within the return window.
        </p>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0;">
      This is an automated email. Please do not reply. For support, contact our customer care.
    </p>
  </div>
</body>
</html>`

  return sendEmail({ to: params.to, subject, html, text })
}

/**
 * Send a "Return Request Accepted" email to the customer.
 *
 * Fires when a seller approves the customer's return request (order item
 * status transitions from 'Return Requested' to 'Return Approved'). The email
 * confirms the approval and informs the customer that pickup will be scheduled
 * soon. Mirrors Flipkart / Amazon / Meesho practice.
 */
export async function sendReturnRequestAcceptedEmail(params: {
  to: string
  customerName: string
  orderId: string
  returnId?: string
  returnReason: string
  itemsSummary: string
  approvedAt: string
  platformName?: string
}): Promise<EmailResult> {
  const platformName = params.platformName || 'RealCart'
  const approvedDateStr = new Date(params.approvedAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const subject = `Return Request Accepted — ${params.orderId}`

  const text = `Dear ${params.customerName},

Good news! Your return request for order ${params.orderId} has been accepted by the seller on ${approvedDateStr}.

${params.returnId ? `Return ID: ${params.returnId}\n` : ''}Return Reason: ${params.returnReason}

Items approved for return:
${params.itemsSummary}

A delivery executive will be assigned to pick up the item(s) shortly. You will receive a pickup OTP when the return is out for pickup. Please keep the item(s) ready in their original packaging with all accessories.

Once the pickup is completed and verified, a credit note will be issued to reverse the original tax invoice, and your refund (if applicable) will be processed.

Thank you for shopping with ${platformName}!`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#d97706,#f59e0b);padding:24px;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;font-weight:700;">Return Request Accepted</h1>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:6px 0 0 0;">Pickup will be scheduled soon.</p>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#1f2937;margin:0;">Dear ${escapeHtmlSimple(params.customerName)},</p>
        <p style="font-size:13px;color:#4b5563;margin:8px 0 0 0;line-height:1.6;">
          Good news! Your return request for order <strong style="color:#1f2937;">${escapeHtmlSimple(params.orderId)}</strong> has been accepted by the seller on <strong>${approvedDateStr}</strong>.
        </p>
        <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin:16px 0;">
          <p style="font-size:12px;color:#92400e;margin:0;">
            <strong>Order ID:</strong> ${escapeHtmlSimple(params.orderId)}<br>
            ${params.returnId ? `<strong>Return ID:</strong> ${escapeHtmlSimple(params.returnId)}<br>` : ''}
            <strong>Approved On:</strong> ${approvedDateStr}<br>
            <strong>Return Reason:</strong> ${escapeHtmlSimple(params.returnReason)}
          </p>
        </div>
        <p style="font-size:13px;color:#4b5563;margin:12px 0 0 0;line-height:1.6;">
          <strong>Items approved for return:</strong>
        </p>
        <p style="font-size:12px;color:#4b5563;margin:4px 0 0 0;line-height:1.6;white-space:pre-line;">${escapeHtmlSimple(params.itemsSummary)}</p>
        <p style="font-size:13px;color:#4b5563;margin:16px 0 0 0;line-height:1.6;">
          A delivery executive will be assigned to pick up the item(s) shortly. You will receive a pickup OTP when the return is out for pickup. Please keep the item(s) ready in their original packaging with all accessories.
        </p>
        <p style="font-size:13px;color:#4b5563;margin:12px 0 0 0;line-height:1.6;">
          Once the pickup is completed and verified, a credit note will be issued to reverse the original tax invoice, and your refund (if applicable) will be processed to your original payment method.
        </p>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0;">
      This is an automated email. Please do not reply. For support, contact our customer care.
    </p>
  </div>
</body>
</html>`

  return sendEmail({ to: params.to, subject, html, text })
}

/**
 * Send a "Return Completed" email to the customer.
 *
 * Fires when a delivery boy completes the return pickup (status transitions
 * to 'Return Completed'). The email confirms the return is complete, includes
 * refund details, and ATTACHES the credit note PDF that reverses the original
 * tax invoice for the returned item(s). Mirrors Flipkart / Amazon / Meesho
 * practice. The credit note HTML is rendered inline (in the email body) and
 * the PDF is attached.
 */
export async function sendReturnCompletedEmail(params: {
  to: string
  customerName: string
  orderId: string
  returnId?: string
  returnReason: string
  completedAt: string
  creditNoteNumber: string
  originalInvoiceNumber: string
  refundStatus: 'processed' | 'pending' | 'not_applicable'
  refundAmount: number
  creditNoteHTML: string
  pdfBuffer: Buffer
}): Promise<EmailResult> {
  const subject = `Return Completed — Credit Note ${params.creditNoteNumber} for Order ${params.orderId}`

  const refundText = params.refundStatus === 'not_applicable'
    ? 'No refund is applicable as this was a Cash on Delivery order and no payment was captured.'
    : params.refundStatus === 'processed'
      ? `A refund of Rs. ${params.refundAmount} has been processed to your original payment method.`
      : `A refund of Rs. ${params.refundAmount} will be credited to your original payment method within 5-7 business days.`

  const text = `Dear ${params.customerName},

Your return for order ${params.orderId} has been completed successfully.

${params.returnId ? `Return ID: ${params.returnId}\n` : ''}Return Reason: ${params.returnReason}

A credit note (${params.creditNoteNumber}) has been generated to reverse the original tax invoice (${params.originalInvoiceNumber}) for the returned item(s). The credit note is attached to this email as a PDF.

${refundText}

If you have any questions, please contact our support team.

Thank you for shopping with us!`

  return sendEmail({
    to: params.to,
    subject,
    html: params.creditNoteHTML,
    text,
    attachments: [
      {
        filename: `CreditNote-${params.creditNoteNumber}.pdf`,
        content: params.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  })
}

/** Minimal HTML escaper for inline email content (kept local to avoid
 *  pulling a dependency into email-service.ts). */
function escapeHtmlSimple(s: string | undefined | null): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Flush the email queue — attempts to send all pending emails.
 * Can be called by a cron job or admin action.
 *
 * Also retries previously-failed emails (status='failed' with < 5 attempts)
 * so the admin can re-flush after fixing SMTP issues to deliver previously-
 * stuck order confirmations and invoices.
 */
export async function flushEmailQueue(limit: number = 50): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const transport = await getTransporter()
  if (!transport) {
    console.log('[EmailService] Flush skipped — SMTP not configured')
    return { processed: 0, sent: 0, failed: 0 }
  }

  try {
    const { db } = await connectToDatabase()
    // Pick up both 'pending' emails AND 'failed' emails that haven't exhausted
    // their retry budget (max 5 attempts). This lets the admin recover emails
    // that were queued while SMTP was misconfigured.
    const queuedEmails = await db.collection('email_queue')
      .find({
        $or: [
          { status: 'pending' },
          { status: 'failed', attempts: { $lt: 5 } },
        ],
      })
      .sort({ createdAt: 1 }) // oldest first — order confirmations before later emails
      .limit(limit)
      .toArray()

    if (queuedEmails.length === 0) {
      console.log('[EmailService] Flush: queue is empty')
      return { processed: 0, sent: 0, failed: 0 }
    }

    console.log(`[EmailService] Flush: processing ${queuedEmails.length} email(s)`)
    let sent = 0
    let failed = 0
    const fromAddress = await getFromAddress()

    for (const email of queuedEmails) {
      try {
        const info = await transport.sendMail({
          from: fromAddress,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text || '',
          attachments: (email.attachments || []).map((a: { filename: string; contentType: string; content: string }) => ({
            filename: a.filename,
            content: Buffer.from(a.content, 'base64'),
            contentType: a.contentType,
          })),
        })

        await db.collection('email_queue').updateOne(
          { _id: email._id },
          { $set: { status: 'sent', sentAt: new Date(), messageId: info.messageId, lastError: null } },
        )
        console.log(`[EmailService] Queue flush: sent "${email.subject}" to ${email.to} (${info.messageId})`)
        sent++
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[EmailService] Queue flush failed for ${email._id} (${email.subject} → ${email.to}):`, errorMsg)
        await db.collection('email_queue').updateOne(
          { _id: email._id },
          {
            $set: {
              status: 'failed',
              lastAttemptAt: new Date(),
              lastError: errorMsg,
            },
            $inc: { attempts: 1 },
          },
        )
        failed++
      }
    }

    console.log(`[EmailService] Flush complete: ${sent} sent, ${failed} failed of ${queuedEmails.length} processed`)
    return { processed: queuedEmails.length, sent, failed }
  } catch (err) {
    console.error('[EmailService] Queue flush error:', err)
    return { processed: 0, sent: 0, failed: 0 }
  }
}
