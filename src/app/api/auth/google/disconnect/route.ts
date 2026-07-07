import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { revokeAndDeleteTokens } from '@/lib/google-drive'

/**
 * POST /api/auth/google/disconnect
 * Revokes Google OAuth tokens and removes them from MongoDB.
 * Requires admin session.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await revokeAndDeleteTokens()
    return NextResponse.json({ success: true, message: 'Google Drive disconnected successfully.' })
  } catch (error) {
    console.error('[Google Disconnect Error]', error)
    return NextResponse.json(
      { error: 'Failed to disconnect Google Drive. Please try again.' },
      { status: 500 },
    )
  }
}
