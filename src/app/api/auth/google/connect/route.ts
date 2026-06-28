import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getAuthUrl } from '@/lib/google-drive'

/**
 * GET /api/auth/google/connect
 * Generates the Google OAuth consent URL and redirects the admin there.
 * Requires admin session.
 */
export async function GET(request: NextRequest) {
  // Auth check — only logged-in admins can connect Google Drive
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Pass request.headers directly so getAuthUrl can detect the correct
  // redirect URI from x-forwarded-host / x-forwarded-proto / host headers.
  // This is more reliable than using next/headers context.
  const authUrl = getAuthUrl(request.headers)
  return NextResponse.redirect(authUrl)
}
