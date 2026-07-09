import { NextRequest, NextResponse } from 'next/server'
import { verifyInboundSms } from '@/lib/sms-otp'

/**
 * POST /api/sms/inbound
 *
 * Webhook for inbound SMS gateways (MSG91, Twilio, SMSHorizon, etc.).
 *
 * When a user sends an SMS from their phone to the server's SIM binding number,
 * the SMS gateway forwards it to this webhook. The webhook:
 *   1. Authenticates the request (using INBOUND_SMS_WEBHOOK_SECRET)
 *   2. Extracts the sender phone number + code from the SMS body
 *   3. Calls verifyInboundSms() to find and verify the matching pending binding
 *   4. Returns success/failure
 *
 * The request body format is flexible — this endpoint accepts:
 *   { sender, code, secret }                    — simple format
 *   { from, body, secret }                      — Twilio-like format
 *   { sender, message, secret }                 — MSG91-like format
 *   { mobile, text, secret }                    — generic format
 *
 * The "secret" field must match INBOUND_SMS_WEBHOOK_SECRET env var.
 * In dev mode (no secret configured), the secret check is skipped.
 *
 * Supported query params for gateway callback URLs:
 *   /api/sms/inbound?secret=xxx
 */
export async function POST(request: NextRequest) {
  try {
    // Handle both JSON and form-encoded bodies (gateways vary)
    let body: Record<string, unknown> = {}
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => ({}))
    } else {
      // Form-encoded (Twilio/MSG91 style)
      const formData = await request.formData().catch(() => null)
      if (formData) {
        formData.forEach((value, key) => {
          body[key] = value
        })
      }
    }

    // Also check query params for the secret (some gateways pass it in the URL)
    const url = new URL(request.url)
    const querySecret = url.searchParams.get('secret')

    // Extract the webhook secret (from body or query)
    const providedSecret =
      (body.secret as string) || querySecret || ''
    const expectedSecret = process.env.INBOUND_SMS_WEBHOOK_SECRET || ''

    // In production, verify the secret. In dev mode (no secret configured),
    // skip the check for testing.
    if (expectedSecret && providedSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid webhook secret' },
        { status: 401 },
      )
    }

    // Extract sender phone + code from various possible field names
    const sender =
      (body.sender as string) ||
      (body.from as string) ||
      (body.mobile as string) ||
      (body.phone as string) ||
      ''

    const messageBody =
      (body.code as string) ||
      (body.body as string) ||
      (body.message as string) ||
      (body.text as string) ||
      ''

    // If the message body is the full SMS text, extract the 6-digit code
    // (the code is typically the only numeric sequence in the message)
    let code = messageBody
    if (messageBody.length > 6) {
      const match = messageBody.match(/\b(\d{6})\b/)
      if (match) {
        code = match[1]
      }
    }

    if (!sender || !code) {
      return NextResponse.json(
        { error: 'Missing sender or code' },
        { status: 400 },
      )
    }

    // Verify the inbound SMS — find matching pending binding + mark verified
    const verified = await verifyInboundSms(sender, code)

    if (verified) {
      return NextResponse.json({
        success: true,
        message: 'SIM binding verified successfully',
      })
    }

    return NextResponse.json(
      {
        success: false,
        message: 'No matching pending SIM binding found for this sender/code',
      },
      { status: 404 },
    )
  } catch (error) {
    console.error('[Inbound SMS Webhook Error]', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to process inbound SMS',
      },
      { status: 500 },
    )
  }
}

/**
 * GET /api/sms/inbound
 * Health check endpoint for the webhook URL.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/sms/inbound',
    message: 'SIM binding inbound SMS webhook is active',
  })
}
