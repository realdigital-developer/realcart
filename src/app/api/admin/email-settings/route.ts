import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { connectToDatabase } from '@/lib/mongodb'
import { invalidateSmtpCache, isSmtpConfigured, flushEmailQueue } from '@/lib/email-service'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  Default email settings (all empty = not configured)                 */
/* ------------------------------------------------------------------ */

const DEFAULT_EMAIL_SETTINGS = {
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '', // NEVER returned to the frontend (write-only)
  smtpFrom: '',
}

/* ------------------------------------------------------------------ */
/*  Port↔Secure normalization helper                                    */
/*                                                                      */
/*  The wrong port/secure combination is the #1 cause of SMTP failures  */
/*  (e.g. "wrong version number" TLS errors with Gmail). We normalize   */
/*  here on save so the admin can't persist a broken config:            */
/*    • Port 465  → secure: true  (direct TLS)                          */
/*    • Port 587  → secure: false (STARTTLS)                            */
/*    • Port 25   → secure: false (STARTTLS)                            */
/*    • Port 2525 → secure: false (STARTTLS)                            */
/* ------------------------------------------------------------------ */

function normalizePortSecure(port: number, userSecure: boolean): { port: number; secure: boolean; corrected: boolean } {
  if (port === 465 && !userSecure) {
    return { port, secure: true, corrected: true }
  }
  if ((port === 587 || port === 25 || port === 2525) && userSecure) {
    return { port, secure: false, corrected: true }
  }
  return { port, secure: userSecure, corrected: false }
}

/* ------------------------------------------------------------------ */
/*  GET /api/admin/email-settings                                       */
/*                                                                      */
/*  Returns the current SMTP configuration. The SMTP password is        */
/*  NEVER returned to the frontend — only a boolean "isSet" flag        */
/*  indicating whether a password has been stored.                      */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const doc = await db.collection('settings').findOne({ key: 'email' })

    const configured = await isSmtpConfigured()

    if (!doc) {
      return NextResponse.json({
        ...DEFAULT_EMAIL_SETTINGS,
        smtpPassSet: false,
        configured,
        configuredVia: configured ? 'env' : 'none',
        updatedAt: null,
      })
    }

    return NextResponse.json({
      smtpHost: doc.smtpHost || '',
      smtpPort: doc.smtpPort ?? 587,
      smtpSecure: doc.smtpSecure ?? false,
      smtpUser: doc.smtpUser || '',
      smtpPass: '', // Never return the actual password
      smtpPassSet: !!(doc.smtpPass && String(doc.smtpPass).length > 0),
      smtpFrom: doc.smtpFrom || '',
      configured,
      configuredVia: doc.smtpHost && doc.smtpUser && doc.smtpPass
        ? 'database'
        : configured
          ? 'env'
          : 'none',
      updatedAt: doc.updatedAt,
    })
  } catch (error) {
    console.error('[Email Settings GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch email settings' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT /api/admin/email-settings                                       */
/*                                                                      */
/*  Saves SMTP configuration to the DB. The SMTP password is write-only */
/*  — if the client sends an empty smtpPass, the existing password is   */
/*  preserved (so the admin can update other fields without re-entering */
/*  the password). Send smtpPass: null to explicitly clear it.          */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    let smtpHost = String(body.smtpHost || '').trim()
    let smtpPort = parseInt(String(body.smtpPort || '587'), 10) || 587
    let smtpSecure = Boolean(body.smtpSecure)
    const smtpUser = String(body.smtpUser || '').trim()
    const smtpFrom = String(body.smtpFrom || '').trim()
    // smtpPass: empty string = keep existing, null = clear, non-empty = update
    const smtpPassRaw = body.smtpPass

    // ── Normalize port↔secure combo ───────────────────────────────────
    // The wrong combo (e.g. secure=true on port 587) is the #1 cause of
    // "wrong version number" TLS errors. Auto-correct on save so the admin
    // can't persist a broken config. The email-service ALSO does this
    // normalization at runtime as defense-in-depth.
    const normalized = normalizePortSecure(smtpPort, smtpSecure)
    if (normalized.corrected) {
      console.warn(
        `[EmailSettings] Auto-corrected port/secure mismatch: ` +
        `port=${smtpPort}, secure=${smtpSecure} → secure=${normalized.secure}`
      )
    }
    smtpPort = normalized.port
    smtpSecure = normalized.secure

    // Validate required fields when host is provided
    if (smtpHost && (!smtpUser || !smtpPassRaw)) {
      // If host is set, user and pass are required (unless keeping existing pass)
      const { db } = await connectToDatabase()
      const existing = await db.collection('settings').findOne({ key: 'email' })
      const hasExistingPass = !!(existing?.smtpPass && String(existing.smtpPass).length > 0)

      if (smtpHost && !smtpUser) {
        return NextResponse.json({ error: 'SMTP username is required when host is set' }, { status: 400 })
      }
      if (smtpHost && !smtpPassRaw && !hasExistingPass) {
        return NextResponse.json({ error: 'SMTP password is required when host is set' }, { status: 400 })
      }
    }

    // Validate port
    if (smtpPort < 1 || smtpPort > 65535) {
      return NextResponse.json({ error: 'SMTP port must be between 1 and 65535' }, { status: 400 })
    }

    // Validate from email format if provided.
    // Accepts both "user@example.com" and "Display Name <user@example.com>"
    if (smtpFrom) {
      const plainEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const displayFormatPattern = /^.+\s<[^\s@]+@[^\s@]+\.[^\s@]+>$/
      if (!plainEmailPattern.test(smtpFrom) && !displayFormatPattern.test(smtpFrom)) {
        return NextResponse.json({ error: 'From email address is invalid (use "email@example.com" or "Name <email@example.com>")' }, { status: 400 })
      }
    }

    const { db } = await connectToDatabase()

    // Build the update document
    const updateDoc: Record<string, unknown> = {
      key: 'email',
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpFrom,
      updatedAt: new Date(),
    }

    // Handle password: empty string = keep existing, null = clear, string = update
    if (smtpPassRaw === null) {
      updateDoc.smtpPass = ''
    } else if (typeof smtpPassRaw === 'string' && smtpPassRaw.length > 0) {
      updateDoc.smtpPass = smtpPassRaw
    }
    // If smtpPassRaw is '' (empty string), we DON'T include smtpPass in the
    // update, so the existing password is preserved.

    // If smtpPass is not in the update (because empty string was sent), we
    // need to use $set with only the fields we want to update. But since
    // we're using upsert with $set, we need to be careful.
    //
    // Actually, let's use a simpler approach: if smtpPass is not in updateDoc,
    // fetch the existing one to preserve it.
    if (!('smtpPass' in updateDoc)) {
      const existing = await db.collection('settings').findOne({ key: 'email' })
      updateDoc.smtpPass = existing?.smtpPass || ''
    }

    await db.collection('settings').updateOne(
      { key: 'email' },
      { $set: updateDoc },
      { upsert: true }
    )

    // Invalidate the SMTP cache so the new config takes effect immediately
    invalidateSmtpCache()

    // ── Auto-flush the email queue ───────────────────────────────────
    // When SMTP is now configured (or re-configured), immediately attempt
    // to deliver any emails that were queued while SMTP was broken (e.g.
    // order confirmations, invoices, credit notes, delivery/return emails).
    // This is fire-and-forget — failures are logged but don't block the
    // save response. We use a short timeout via Promise.race so the admin
    // doesn't wait too long.
    let flushResult: { processed: number; sent: number; failed: number } | null = null
    if (smtpHost && smtpUser && updateDoc.smtpPass) {
      try {
        // Give flush up to 30s — most queues will drain faster than that.
        // If it times out, the queue is still being processed in the
        // background; the admin just won't see counts in the response.
        const flushP = flushEmailQueue(200)
        const timeoutP = new Promise<typeof flushResult>(resolve => {
          setTimeout(() => resolve(null), 30000)
        })
        flushResult = await Promise.race([flushP, timeoutP])
      } catch (flushErr) {
        console.warn('[EmailSettings] Auto-flush error (non-fatal):', flushErr)
      }
    }

    const messageParts = [
      'Email settings saved.',
      normalized.corrected
        ? ` Port/secure auto-corrected: port ${smtpPort} → secure=${smtpSecure}.`
        : '',
      flushResult && flushResult.processed > 0
        ? ` Queued emails flushed: ${flushResult.sent} sent, ${flushResult.failed} failed of ${flushResult.processed} processed.`
        : '',
    ].filter(Boolean)

    return NextResponse.json({
      success: true,
      message: messageParts.join(''),
      autoCorrected: normalized.corrected,
      flush: flushResult,
    })
  } catch (error) {
    console.error('[Email Settings PUT Error]', error)
    return NextResponse.json({ error: 'Failed to save email settings' }, { status: 500 })
  }
}
