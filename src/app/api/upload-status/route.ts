import { NextResponse } from 'next/server'
import {
  isCloudinaryConfigured,
  getMissingConfigVars,
  getCloudinaryConfig,
  getConfigStatus,
} from '@/lib/cloudinary-config'

/**
 * GET /api/upload-status
 *
 * PUBLIC endpoint (no auth required) that returns whether Cloudinary
 * is properly configured. This is intentionally separate from
 * /api/admin/cloudinary so that any page can check upload readiness
 * without needing an admin session cookie.
 *
 * Uses the cloudinary-config module which includes the full fallback chain:
 *   1. Runtime override
 *   2. process.env
 *   3. Hardcoded fallback values
 *
 * So even if .env is empty, Cloudinary may still be "configured" via fallbacks.
 *
 * Only exposes: configured (boolean), cloudName, and whether keys are set.
 * NEVER exposes actual API key or secret values.
 */
export async function GET() {
  try {
    const configured = isCloudinaryConfigured()
    const missingEnvVars = getMissingConfigVars()
    const config = getCloudinaryConfig()
    const status = getConfigStatus()

    return NextResponse.json({
      configured,
      missingVars: configured ? [] : missingEnvVars,
      cloudName: config.cloudName,
      apiKeySet: !!config.apiKey,
      apiSecretSet: !!config.apiSecret,
      // Include source info so the UI can show "using fallback" warnings
      usingFallback: status.usingFallback,
      sources: status.sources,
    })
  } catch (error) {
    console.error('[Upload Status Error]', error)
    return NextResponse.json(
      { configured: false, missingVars: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'], cloudName: null, apiKeySet: false, apiSecretSet: false },
      { status: 200 }, // Still 200 — the status itself is valid, just not configured
    )
  }
}
