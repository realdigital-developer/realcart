/**
 * Cloudinary Configuration Module — Robust & Self-Healing
 *
 * This module is the SINGLE SOURCE OF TRUTH for all Cloudinary configuration.
 * It implements a multi-layered resolution strategy to ensure Cloudinary
 * NEVER goes missing:
 *
 * Resolution order:
 *   1. process.env (standard Next.js .env loading)
 *   2. Hardcoded fallback values (below) — ensures Cloudinary works even
 *      if .env is missing, corrupted, or reset
 *   3. Runtime override via configureCloudinary() — for dynamic setup
 *
 * WHY THIS EXISTS:
 *   The .env file has been observed to lose its Cloudinary variables
 *   repeatedly. This module provides a safety net so that even if the
 *   .env file is completely empty, Cloudinary will still function using
 *   the fallback values.
 *
 * SECURITY NOTE:
 *   The fallback values are embedded in source code. This is acceptable
 *   for a development/demo project. For production, ALWAYS use environment
 *   variables and remove the fallback values.
 */

/* ------------------------------------------------------------------ */
/*  Fallback Configuration                                              */
/* ------------------------------------------------------------------ */

/**
 * Hardcoded fallback values — used when environment variables are missing.
 * These ensure Cloudinary ALWAYS works regardless of .env state.
 *
 * ⚠️  For production deployments, set environment variables and
 *     remove the fallback values below for security.
 */
const FALLBACK_CLOUD_NAME = 'dw4rztuom'
const FALLBACK_API_KEY = '823481787927553'
const FALLBACK_API_SECRET = 'mEPPYRN5qPjByPF4s7Q3kOpCzmQ'

/* ------------------------------------------------------------------ */
/*  Runtime Override Storage                                            */
/* ------------------------------------------------------------------ */

let _runtimeConfig: {
  cloudName?: string
  apiKey?: string
  apiSecret?: string
} | null = null

/* ------------------------------------------------------------------ */
/*  Configuration Resolution                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolve a single Cloudinary config value with the full fallback chain:
 *   1. Runtime override (highest priority)
 *   2. process.env
 *   3. Hardcoded fallback (lowest priority, always available)
 */
function resolveConfigValue(
  envKey: string,
  runtimeKey: keyof typeof _runtimeConfig,
  fallback: string,
): string {
  // Layer 1: Runtime override
  if (_runtimeConfig && _runtimeConfig[runtimeKey]) {
    return _runtimeConfig[runtimeKey]!
  }

  // Layer 2: Environment variable
  const envValue = process.env[envKey]
  if (envValue && envValue.trim() !== '') {
    return envValue.trim()
  }

  // Layer 3: Hardcoded fallback
  return fallback
}

export interface ResolvedCloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
  /** Which source was used for each value: 'runtime' | 'env' | 'fallback' */
  sources: {
    cloudName: 'runtime' | 'env' | 'fallback'
    apiKey: 'runtime' | 'env' | 'fallback'
    apiSecret: 'runtime' | 'env' | 'fallback'
  }
}

/**
 * Get the fully resolved Cloudinary configuration.
 * This will NEVER return empty/undefined values — it always falls back
 * to hardcoded defaults.
 */
export function getCloudinaryConfig(): ResolvedCloudinaryConfig {
  const getEnvValue = (key: string): string | undefined => {
    const val = process.env[key]
    return val && val.trim() !== '' ? val.trim() : undefined
  }

  const cloudNameFromRuntime = _runtimeConfig?.cloudName
  const apiKeyFromRuntime = _runtimeConfig?.apiKey
  const apiSecretFromRuntime = _runtimeConfig?.apiSecret

  const cloudNameFromEnv = getEnvValue('CLOUDINARY_CLOUD_NAME')
  const apiKeyFromEnv = getEnvValue('CLOUDINARY_API_KEY')
  const apiSecretFromEnv = getEnvValue('CLOUDINARY_API_SECRET')

  const cloudName = cloudNameFromRuntime || cloudNameFromEnv || FALLBACK_CLOUD_NAME
  const apiKey = apiKeyFromRuntime || apiKeyFromEnv || FALLBACK_API_KEY
  const apiSecret = apiSecretFromRuntime || apiSecretFromEnv || FALLBACK_API_SECRET

  return {
    cloudName,
    apiKey,
    apiSecret,
    sources: {
      cloudName: cloudNameFromRuntime ? 'runtime' : cloudNameFromEnv ? 'env' : 'fallback',
      apiKey: apiKeyFromRuntime ? 'runtime' : apiKeyFromEnv ? 'env' : 'fallback',
      apiSecret: apiSecretFromRuntime ? 'runtime' : apiSecretFromEnv ? 'env' : 'fallback',
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Configuration Status & Validation                                   */
/* ------------------------------------------------------------------ */

export interface CloudinaryConfigStatus {
  configured: boolean
  missingVars: string[]
  cloudName: string | null
  apiKeySet: boolean
  apiSecretSet: boolean
  /** Whether fallback values are being used (informational) */
  usingFallback: boolean
  /** Which source is being used for each value */
  sources: ResolvedCloudinaryConfig['sources']
}

/**
 * Check if Cloudinary is properly configured.
 * With the fallback system, this ALWAYS returns true unless
 * even the fallback values are somehow missing (should never happen).
 */
export function isCloudinaryConfigured(): boolean {
  const config = getCloudinaryConfig()
  return !!(
    config.cloudName &&
    config.apiKey &&
    config.apiSecret
  )
}

/**
 * Get the list of missing Cloudinary environment variables.
 * Note: Even if env vars are "missing", Cloudinary may still work
 * via the fallback values.
 */
export function getMissingConfigVars(): string[] {
  const missing: string[] = []
  if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME.trim() === '') {
    missing.push('CLOUDINARY_CLOUD_NAME')
  }
  if (!process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY.trim() === '') {
    missing.push('CLOUDINARY_API_KEY')
  }
  if (!process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET.trim() === '') {
    missing.push('CLOUDINARY_API_SECRET')
  }
  return missing
}

/**
 * Get the full configuration status for the admin UI.
 * Includes whether Cloudinary is working and which sources are being used.
 */
export function getConfigStatus(): CloudinaryConfigStatus {
  const config = getCloudinaryConfig()
  const configured = isCloudinaryConfigured()
  const missingEnvVars = getMissingConfigVars()
  const usingFallback =
    config.sources.cloudName === 'fallback' ||
    config.sources.apiKey === 'fallback' ||
    config.sources.apiSecret === 'fallback'

  return {
    configured,
    missingVars: configured ? [] : missingEnvVars,
    cloudName: config.cloudName || null,
    apiKeySet: !!config.apiKey,
    apiSecretSet: !!config.apiSecret,
    usingFallback,
    sources: config.sources,
  }
}

/* ------------------------------------------------------------------ */
/*  Runtime Configuration Override                                      */
/* ------------------------------------------------------------------ */

/**
 * Override Cloudinary configuration at runtime.
 * This takes the HIGHEST priority — even above environment variables.
 *
 * Use this for:
 *   - Dynamic configuration from a database
 *   - Testing with different credentials
 *   - Temporary credential rotation
 */
export function configureCloudinary(config: {
  cloudName?: string
  apiKey?: string
  apiSecret?: string
}): void {
  _runtimeConfig = {
    ..._runtimeConfig,
    ...config,
  }
  console.log('[Cloudinary Config] Runtime override applied:', {
    cloudName: config.cloudName ? '***set***' : undefined,
    apiKey: config.apiKey ? '***set***' : undefined,
    apiSecret: config.apiSecret ? '***set***' : undefined,
  })
}

/**
 * Clear any runtime configuration overrides.
 * Falls back to environment variables and then hardcoded defaults.
 */
export function clearRuntimeConfig(): void {
  _runtimeConfig = null
  console.log('[Cloudinary Config] Runtime override cleared')
}

/* ------------------------------------------------------------------ */
/*  Startup Validation & Logging                                        */
/* ------------------------------------------------------------------ */

let _startupValidated = false

/**
 * Validate and log Cloudinary configuration status.
 * Should be called once during server startup.
 *
 * This provides clear, actionable output about the config state.
 */
export function validateCloudinaryStartup(): {
  valid: boolean
  message: string
  config: ResolvedCloudinaryConfig
} {
  if (_startupValidated) {
    // Only run once to avoid spamming logs
    const config = getCloudinaryConfig()
    return {
      valid: isCloudinaryConfigured(),
      message: 'Already validated',
      config,
    }
  }

  _startupValidated = true
  const config = getCloudinaryConfig()
  const configured = isCloudinaryConfigured()
  const missingEnvVars = getMissingConfigVars()

  if (configured) {
    const allFromEnv = config.sources.cloudName === 'env' && config.sources.apiKey === 'env' && config.sources.apiSecret === 'env'
    const anyFallback = config.sources.cloudName === 'fallback' || config.sources.apiKey === 'fallback' || config.sources.apiSecret === 'fallback'

    if (allFromEnv) {
      console.log('[Cloudinary Config] ✅ Fully configured via environment variables')
      console.log(`[Cloudinary Config]    Cloud name: ${config.cloudName}`)
    } else if (anyFallback) {
      console.warn('[Cloudinary Config] ⚠️  Working, but using FALLBACK values (env vars missing)')
      console.warn(`[Cloudinary Config]    Missing env vars: ${missingEnvVars.join(', ')}`)
      console.warn('[Cloudinary Config]    Cloudinary will function, but add these to .env for production:')
      missingEnvVars.forEach(v => console.warn(`[Cloudinary Config]      ${v}=<value>`))
      console.log(`[Cloudinary Config]    Cloud name: ${config.cloudName} (source: ${config.sources.cloudName})`)
    } else {
      console.log('[Cloudinary Config] ✅ Configured (cloud name from: ' + config.sources.cloudName + ')')
    }

    return {
      valid: true,
      message: anyFallback
        ? `Configured via fallback. Missing env vars: ${missingEnvVars.join(', ')}`
        : 'Fully configured via environment variables',
      config,
    }
  } else {
    console.error('[Cloudinary Config] ❌ NOT configured — no env vars AND no fallback values!')
    console.error('[Cloudinary Config]    Add to .env:')
    console.error('[Cloudinary Config]      CLOUDINARY_CLOUD_NAME=<your-cloud-name>')
    console.error('[Cloudinary Config]      CLOUDINARY_API_KEY=<your-api-key>')
    console.error('[Cloudinary Config]      CLOUDINARY_API_SECRET=<your-api-secret>')

    return {
      valid: false,
      message: 'Not configured — all sources failed',
      config,
    }
  }
}

/**
 * Force re-validation on next call (useful after env changes).
 */
export function resetStartupValidation(): void {
  _startupValidated = false
}
