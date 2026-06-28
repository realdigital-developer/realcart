import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { isDriveConnected } from '@/lib/google-drive'

/**
 * GET /api/admin/drive/status
 * Returns whether Google Drive is connected and account info.
 * Requires admin session.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const status = await isDriveConnected()
    return NextResponse.json(status)
  } catch (error) {
    console.error('[Drive Status Error]', error)
    return NextResponse.json({ connected: false })
  }
}
