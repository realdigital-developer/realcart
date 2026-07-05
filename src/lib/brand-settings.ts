/**
 * Brand Settings — Shared helper for invoice / email / credit-note branding.
 *
 * This module is the SINGLE SOURCE OF TRUTH for:
 *   1. The default brand name used across the project ("RealCart").
 *   2. Fetching the dynamically-configured brand name + logo from the
 *      `settings.site` MongoDB document (set by the admin in Settings → Branding).
 *   3. Transforming a Cloudinary logo URL so its background is removed
 *      on-the-fly (NO z.ai tools — uses Cloudinary's native `e_make_transparent`
 *      URL transformation, which is a built-in Cloudinary feature).
 *
 * Why a shared helper?
 *   - Previously every invoice / credit-note / email route duplicated the
 *     platform-info fetch with a "ShopHub" fallback that did not match the
 *     actual project brand ("RealCart"). Centralising the logic guarantees a
 *     single, correct fallback and consistent behaviour everywhere.
 *
 * Server-side only (imports mongodb). Do NOT import from client components.
 */

import type { Db } from 'mongodb'

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/**
 * The brand name used throughout the RealCart project.
 * Used as the fallback when no custom brand name is configured in the DB.
 */
export const DEFAULT_BRAND_NAME = 'RealCart'

/** MongoDB collection that stores site/brand settings (key: 'site'). */
const SETTINGS_COLLECTION = 'settings'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface BrandSettings {
  /** Display brand name (e.g. "RealCart"). Falls back to DEFAULT_BRAND_NAME. */
  platformName: string
  /** Platform GSTIN for tax invoices. Empty string if not configured. */
  platformGstin: string
  /** Platform address line shown on invoices. Undefined if not configured. */
  platformAddress?: string
  /** Brand logo URL (Cloudinary). Undefined if no logo uploaded. */
  logoUrl?: string
}

/* ------------------------------------------------------------------ */
/*  Brand settings fetcher                                              */
/* ------------------------------------------------------------------ */

/**
 * Fetch brand settings from the database.
 *
 * Reads from two settings documents:
 *   - `{ key: 'site' }`  → siteName, logo.url
 *   - `{ key: 'tax' }`   → platformGstin, platformAddress
 *
 * Returns sensible defaults (brand = "RealCart") if the DB is unavailable
 * or the documents are missing. This makes the function safe to call even
 * during DB outages — invoices still generate with the correct brand name.
 *
 * @param db - A connected MongoDB Db instance (from connectToDatabase()).
 */
export async function getBrandSettings(db: Db): Promise<BrandSettings> {
  let platformName = DEFAULT_BRAND_NAME
  let platformGstin = ''
  let platformAddress: string | undefined
  let logoUrl: string | undefined

  try {
    const [siteSettings, taxSettings] = await Promise.all([
      db.collection(SETTINGS_COLLECTION).findOne({ key: 'site' }),
      db.collection(SETTINGS_COLLECTION).findOne({ key: 'tax' }),
    ])

    // Brand name — must be a non-empty trimmed string, else fall back.
    const rawName = siteSettings?.siteName
    if (typeof rawName === 'string' && rawName.trim().length > 0) {
      platformName = rawName.trim()
    }

    // Logo URL — only accept non-empty strings.
    const rawLogoUrl = siteSettings?.logo?.url
    if (typeof rawLogoUrl === 'string' && rawLogoUrl.length > 0) {
      logoUrl = rawLogoUrl
    }

    if (taxSettings?.platformGstin) {
      platformGstin = String(taxSettings.platformGstin)
    }
    if (taxSettings?.platformAddress) {
      platformAddress = String(taxSettings.platformAddress)
    }
  } catch {
    // DB read failed — return defaults. Invoices must still generate.
  }

  return { platformName, platformGstin, platformAddress, logoUrl }
}

/* ------------------------------------------------------------------ */
/*  Logo background-removal URL transformer (Cloudinary native)         */
/* ------------------------------------------------------------------ */
/*  Uses Cloudinary's built-in `e_make_transparent` effect — a native   */
/*  Cloudinary URL transformation that makes pixels similar to the      */
/*  corner colour transparent. It is designed exactly for logos with    */
/*  solid/flat backgrounds and works on-the-fly (no re-upload needed).  */
/*                                                                      */
/*  This is NOT a z.ai tool. It is a standard Cloudinary feature        */
/*  available on all Cloudinary accounts, applied purely via the URL.   */
/*                                                                      */
/*  Example:                                                            */
/*    in:  https://res.cloudinary.com/demo/image/upload/v123/rc/logo.png*/
/*    out: https://res.cloudinary.com/demo/image/upload/e_make_transparent:20/v123/rc/logo.png */
/*                                                                      */
/*  Robustness:                                                         */
/*    - Only transforms Cloudinary URLs (other URLs returned as-is).    */
/*    - Skips SVGs (vector — already have transparency or defined bg).  */
/*    - Skips URLs that already contain e_make_transparent (idempotent).*/
/*    - Preserves query strings / cache-busters.                        */
/*    - Never throws — on any parse issue returns the original URL.     */
/* ------------------------------------------------------------------ */

/**
 * Default colour-similarity tolerance for `e_make_transparent` (0–100).
 * 20 is a sweet-spot for logos: wide enough to catch anti-aliased edges,
 * narrow enough to never eat into the logo's own colours.
 */
const BG_REMOVAL_TOLERANCE = 20

/**
 * Transform a Cloudinary image URL so its solid background becomes
 * transparent, using Cloudinary's native `e_make_transparent` effect.
 *
 * - Non-Cloudinary URLs are returned unchanged (e.g. local SVG, external CDN).
 * - SVG Cloudinary URLs are returned unchanged (vector already transparent).
 * - Already-transformed URLs are returned unchanged (idempotent).
 * - On any error, the original URL is returned (never throws).
 *
 * @param url - The original logo image URL.
 * @returns A URL that, when fetched, returns the logo with a transparent background.
 */
export function getLogoUrlWithBgRemoval(url: string | undefined | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined

  try {
    // Only transform Cloudinary delivery URLs.
    // Match: https://res.cloudinary.com/<cloud>/image/upload/<rest>
    const cloudinaryMatch = url.match(
      /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload)\/(.+)$/,
    )
    if (!cloudinaryMatch) {
      // Not a Cloudinary URL — return as-is (could be SVG, local, external).
      return url
    }

    const [, baseUrl, rest] = cloudinaryMatch

    // SVGs are vector and already transparent — skip transformation.
    // Strip any query string before checking the extension so URLs like
    // "v123/logo.svg?t=1" are correctly detected as SVG.
    const restNoQuery = rest.split('?')[0].split('#')[0].toLowerCase()
    if (restNoQuery.endsWith('.svg')) {
      return url
    }

    // Idempotent: if e_make_transparent already present, don't double-apply.
    if (rest.includes('e_make_transparent')) {
      return url
    }

    // Split the "rest" into the transformation segment and the asset path.
    // Cloudinary URL structure after /upload/ is:
    //   [transformations]/v[version]/public_id.ext   OR
    //   [transformations]/public_id.ext
    // Transformations are slash-separated groups like "q_auto,w_300".
    //
    // We need to PREPEND our e_make_transparent transformation so it runs
    // before any existing transformations (bg removal should happen first
    // so subsequent resize/quality ops work on the transparent result).
    //
    // IMPORTANT: We also force PNG output (`f_png`) because JPEG does NOT
    // support an alpha channel. Without `f_png`, Cloudinary would apply the
    // bg-removal but then deliver a JPEG with a solid (white) background —
    // defeating the purpose. PNG preserves the transparency.
    const transformation = `e_make_transparent:${BG_REMOVAL_TOLERANCE},f_png`

    // Check if "rest" starts with a version segment (v1234) or a public_id.
    // If the first segment looks like a transformation (contains _ or : but
    // doesn't start with "v" followed by digits), prepend ours with a slash.
    // Simplest robust approach: prepend our transformation to the front of
    // "rest" with a slash separator. Cloudinary composes transformations
    // left-to-right, so prepending runs bg-removal first.
    return `${baseUrl}/${transformation}/${rest}`
  } catch {
    // Any parse error — return original URL, never break invoice generation.
    return url
  }
}
