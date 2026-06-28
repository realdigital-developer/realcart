'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useSiteLogo } from '@/hooks/use-site-logo'

/**
 * CustomerSplashScreen
 * --------------------
 * Shows a branded splash screen overlay when the customer app first loads.
 *
 * Behavior:
 * - Displays for SPLASH_DURATION_MS (3500ms = extended splash duration)
 * - Fades out over FADE_DURATION_MS (400ms)
 * - Shows only ONCE per browser session (tracked via sessionStorage)
 * - Does NOT re-trigger on client-side navigation (layout persists in App Router)
 * - Does NOT re-trigger on page refresh within the same session
 *
 * Logo resolution (3-layer resilience):
 * 1. Brand logo from /api/admin/logo (Cloudinary-hosted, fetched via useSiteLogo hook)
 * 2. Static /logo.svg fallback (if API fails or no logo configured)
 * 3. Gradient icon fallback (if even the SVG fails to load)
 *
 * SSR safety:
 * - Initial state `visible=true` matches on server and client (no hydration mismatch)
 * - All timing logic runs in useEffect (client-only)
 * - sessionStorage access is wrapped in try/catch (private mode / SSR safety)
 *
 * Accessibility:
 * - Respects prefers-reduced-motion (animations disabled via CSS media query)
 * - Splash is aria-hidden (decorative, not content)
 * - pointer-events: none during fade-out so users can interact with content immediately
 *
 * Non-blocking:
 * - Splash is position:fixed z-[9999] — content loads behind it
 * - Children render normally; splash sits on top until it fades out
 * - Providers (auth, cart, wishlist) initialize in parallel behind the splash
 */

const SPLASH_DURATION_MS = 3500 // extended splash display duration (3.5s)
const FADE_DURATION_MS = 400 // fade-out duration
const STORAGE_KEY = 'realcart-customer-splash-shown'

export function CustomerSplashScreen({ children }: { children: ReactNode }) {
  // visible=true on both server and client initial render → no hydration mismatch.
  // useEffect (client-only) may set this to false if splash was already shown this session.
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  // Fetch the brand logo (non-blocking; has 8s timeout built into the hook)
  const { logo, loading: logoLoading } = useSiteLogo()

  useEffect(() => {
    // Check if splash was already shown this session.
    // Wrapped in try/catch because sessionStorage can throw in:
    // - Safari private mode
    // - SSR (though this effect only runs on client)
    // - Cross-origin embedded iframes
    let alreadyShown = false
    try {
      alreadyShown = sessionStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      // Treat as not shown — splash will display (safer than skipping)
    }

    if (alreadyShown) {
      // Already shown this session — skip splash entirely
      setVisible(false)
      return
    }

    // Start fade-out after SPLASH_DURATION_MS
    const fadeTimer = window.setTimeout(() => {
      setFading(true)
    }, SPLASH_DURATION_MS)

    // Remove from DOM after fade completes
    const hideTimer = window.setTimeout(() => {
      setVisible(false)
      try {
        sessionStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // Ignore — splash will just show again next session, which is fine
      }
    }, SPLASH_DURATION_MS + FADE_DURATION_MS)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  // Once splash is done, just render children normally
  if (!visible) {
    return <>{children}</>
  }

  return (
    <>
      {/* Children render behind the splash so they're ready when it fades out */}
      {children}

      {/* Splash overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-gray-950"
        style={{
          opacity: fading ? 0 : 1,
          pointerEvents: fading ? 'none' : 'auto',
          transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
        }}
      >
        <div className="flex flex-col items-center gap-5 px-6">
          {/* ── Logo ── */}
          <div className="splash-logo relative" style={{ animation: 'splash-logo-enter 600ms ease-out both' }}>
            {logoLoading ? (
              // Placeholder skeleton while logo API is fetching (same 80px size as logo)
              <div className="h-20 w-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ) : logo ? (
              // Brand logo from Cloudinary (fetched via useSiteLogo hook)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo.url}
                alt=""
                className="h-20 w-20 rounded-2xl object-cover shadow-xl shadow-emerald-500/20 ring-1 ring-black/5"
                draggable={false}
              />
            ) : (
              // Fallback: static /logo.svg from public/ (Z.ai logo, has built-in breathe animation)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/logo.svg"
                alt=""
                className="h-20 w-20 rounded-2xl object-contain bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-2 shadow-xl shadow-gray-500/10 ring-1 ring-black/5"
                draggable={false}
              />
            )}
          </div>

          {/* ── Brand name + tagline ── */}
          <div
            className="splash-text text-center"
            style={{ animation: 'splash-text-enter 500ms ease-out 200ms both' }}
          >
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              RealCart
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Shop Smarter, Live Better
            </p>
          </div>

          {/* ── Progress bar ── */}
          <div className="splash-progress h-1 w-32 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
              style={{
                animation: `splash-progress-fill ${SPLASH_DURATION_MS}ms linear forwards`,
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
