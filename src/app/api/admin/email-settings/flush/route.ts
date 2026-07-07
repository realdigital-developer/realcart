import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { flushEmailQueue, invalidateSmtpCache } from '@/lib/email-service'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  POST /api/admin/email-settings/flush                                */
/*                                                                      */
/*  Flushes the email queue — attempts to send all pending emails       */
/*  that were queued while SMTP was not configured.                     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Invalidate cache so we use the latest SMTP config
    invalidateSmtpCache()

    const result = await flushEmailQueue(200)

    return NextResponse.json({
      success: true,
      message: `Processed ${result.processed} queued email(s): ${result.sent} sent, ${result.failed} failed.`,
      ...result,
    })
  } catch (error) {
    console.error('[Email Queue Flush Error]', error)
    return NextResponse.json(
      { error: 'Failed to flush email queue' },
      { status: 500 }
    )
  }
}
