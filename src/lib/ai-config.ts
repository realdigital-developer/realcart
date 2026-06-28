import ZAI from 'z-ai-web-dev-sdk'

/* ------------------------------------------------------------------ */
/*  AI Configuration — single source of truth for the ZAI SDK          */
/*                                                                     */
/*  Change AI_MODEL here to switch the underlying LLM used by every    */
/*  API route in the project. Both /api/admin/products/suggest-        */
/*  highlights and /api/seller/products/suggest-highlights import      */
/*  from this file, so the model only needs to be updated in ONE place. */
/* ------------------------------------------------------------------ */

/**
 * The model identifier sent to the ZAI chat-completions API.
 *
 * Currently set to `glm-5.2` (upgraded from the previous default).
 * All chat.completions.create() calls in the project pass this value
 * in the request body's `model` field so the request is explicitly
 * routed to the chosen model instead of relying on the server default.
 */
export const AI_MODEL = 'glm-5.2'

// ── Shared singleton ZAI instance ──────────────────────────────────
// Reusing a single instance avoids re-creating the SDK client on every
// request. The SDK's create() reads the .z-ai-config file once; after
// that the instance is stateless and safe to share across hot requests.
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

/**
 * Get the shared ZAI SDK instance (created lazily on first use).
 * Safe to call from any API route — the instance is cached for the
 * lifetime of the process.
 */
export async function getZAI(): Promise<Awaited<ReturnType<typeof ZAI.create>>> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}
