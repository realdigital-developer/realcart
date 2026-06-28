import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/admin/drive/debug
 * Debug endpoint to verify what redirect URI the server computes.
 * This helps diagnose redirect_uri_mismatch issues.
 */
export async function GET(request: NextRequest) {
  const reqHeaders = request.headers

  const debug: Record<string, any> = {
    // ── Environment variables ──
    env_GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '(not set)',
    env_NEXTAUTH_URL: process.env.NEXTAUTH_URL || '(not set)',
    env_GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.slice(0, 25)}...` : '(not set)',

    // ── Incoming request headers ──
    incoming_headers: {
      host: reqHeaders.get('host'),
      'x-forwarded-host': reqHeaders.get('x-forwarded-host'),
      'x-forwarded-proto': reqHeaders.get('x-forwarded-proto'),
      'x-forwarded-for': reqHeaders.get('x-forwarded-for'),
      'x-original-url': reqHeaders.get('x-original-url'),
      origin: reqHeaders.get('origin'),
      referer: reqHeaders.get('referer'),
    },

    // ── Resolution chain (what the code would do) ──
    resolution_chain: [] as string[],
  }

  // Simulate the resolveRedirectUri logic step by step
  const chain = debug.resolution_chain

  // Layer 1: GOOGLE_REDIRECT_URI
  const explicitUri = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (explicitUri) {
    chain.push(`Layer 1 (GOOGLE_REDIRECT_URI env): ${explicitUri} ← SELECTED`)
    debug.final_redirect_uri = explicitUri
  } else {
    chain.push('Layer 1 (GOOGLE_REDIRECT_URI env): (not set)')

    // Layer 2: Request headers
    const forwardedHost = reqHeaders.get('x-forwarded-host')
    const forwardedProto = reqHeaders.get('x-forwarded-proto')
    const host = reqHeaders.get('host')
    const detectedHost = forwardedHost || host

    if (detectedHost) {
      const protocol = forwardedProto || (detectedHost.startsWith('localhost') ? 'http' : 'https')
      const derived = `${protocol}://${detectedHost}/api/auth/google/callback`
      chain.push(`Layer 2 (request headers): ${derived} ← SELECTED (forwardedHost=${forwardedHost}, host=${host}, proto=${forwardedProto})`)
      debug.final_redirect_uri = derived
    } else {
      chain.push('Layer 2 (request headers): no host detected')

      // Layer 3: NEXTAUTH_URL
      const nextauthUrl = process.env.NEXTAUTH_URL?.trim()
      if (nextauthUrl) {
        const derived = `${nextauthUrl.replace(/\/+$/, '')}/api/auth/google/callback`
        chain.push(`Layer 3 (NEXTAUTH_URL env): ${derived} ← SELECTED`)
        debug.final_redirect_uri = derived
      } else {
        chain.push('Layer 3 (NEXTAUTH_URL env): (not set)')
        chain.push('Layer 4 (fallback): http://localhost:3000/api/auth/google/callback ← SELECTED')
        debug.final_redirect_uri = 'http://localhost:3000/api/auth/google/callback'
      }
    }
  }

  debug.required_in_google_console = [
    'The final_redirect_uri MUST be added to Google Cloud Console →',
    'APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs',
  ]

  return NextResponse.json(debug, { status: 200 })
}
