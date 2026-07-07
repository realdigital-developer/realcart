import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, saveTokens } from '@/lib/google-drive'

/**
 * GET /api/auth/google/callback
 * OAuth 2.0 callback — exchanges the authorization code for tokens,
 * saves them to MongoDB, and redirects back to the Settings page.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    // User denied consent
    if (error) {
      return NextResponse.redirect(
        new URL(`/admin/settings?google_error=${encodeURIComponent(error)}`, request.url),
      )
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/admin/settings?google_error=missing_code', request.url),
      )
    }

    // Pass request.headers so the redirect URI used during token exchange
    // matches the one used during the initial auth request.
    const tokens = await exchangeCodeForTokens(code, request.headers)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL('/admin/settings?google_error=no_refresh_token', request.url),
      )
    }

    // Save tokens to MongoDB
    await saveTokens(tokens)

    // Redirect back to settings with success indicator
    return NextResponse.redirect(
      new URL('/admin/settings?google_connected=true', request.url),
    )
  } catch (error) {
    console.error('[Google OAuth Callback Error]', error)
    const message = error instanceof Error ? error.message : 'OAuth callback failed'
    return NextResponse.redirect(
      new URL(`/admin/settings?google_error=${encodeURIComponent(message)}`, request.url),
    )
  }
}
