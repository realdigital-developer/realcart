/**
 * Route-level loading UI for /customer/* routes.
 *
 * Next.js shows this automatically when navigating between customer routes
 * (e.g., from /customer to /customer/dashboard) while the new route's
 * data/components are being fetched.
 *
 * Returns null (renders nothing visible) because:
 *   1. The branded splash screen in customer-layout-client.tsx already
 *      handles the initial app-load UX for the first visit.
 *   2. For subsequent client-side navigations, showing "Loading RealCart,
 *      Please wait a moment..." would be visually jarring and redundant —
 *      the layout (navbar, sidebar, etc.) stays mounted, so the user just
 *      sees the new page content appear smoothly.
 *
 * Returning null is safe — Next.js accepts any ReactNode (including null)
 * as the loading.tsx default export.
 */
export default function CustomerLoading() {
  return null
}
