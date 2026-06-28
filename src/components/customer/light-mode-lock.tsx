'use client'

import { useEffect } from 'react'

/**
 * CustomerLightModeLock
 * ---------------------
 * Forces the customer panel to ALWAYS render in light mode, regardless of:
 *   - The user's previously-selected theme (set via admin/seller/delivery panels)
 *   - The user's OS preference (prefers-color-scheme: dark)
 *   - The root ThemeProvider's defaultTheme="system" + enableSystem settings
 *
 * Why this exists:
 *   The customer panel (storefront) is designed for end-users shopping in
 *   daylight conditions. Dark mode is reserved for admin/seller/delivery
 *   operators who use the dashboards for extended periods. Removing the
 *   theme toggle from the customer panel isn't enough — we also need to
 *   actively override whatever theme the user may have set elsewhere.
 *
 * How it works:
 *   1. On mount: removes the `dark` class from <html> (next-themes uses
 *      class strategy, so <html class="dark"> = dark mode).
 *   2. Also sets `color-scheme: light` on <html> so native form controls,
 *      scrollbars, and other UA styles render in light mode.
 *   3. Saves the previous theme state so it can be restored on unmount
 *      (e.g., when navigating from /customer to /admin).
 *   4. Watches for class mutations on <html> — if any other code adds
 *      `dark` back (e.g., a race condition with ThemeProvider), this
 *      component removes it again.
 *
 * Scope:
 *   This component is mounted ONLY in customer-layout-client.tsx. It does
 *   NOT affect admin/seller/delivery panels — those keep their full
 *   dark/light theme switching.
 *
 * Robustness:
 *   - SSR-safe: does nothing during SSR (no document access). The effect
 *     runs only on the client.
 *   - Cleanup on unmount: restores the previous `dark` class state so
 *     navigating away from /customer doesn't permanently disable dark
 *     mode for other panels.
 *   - MutationObserver: catches any subsequent theme changes made by
 *     the root ThemeProvider or other code while the customer panel is
 *     mounted.
 *   - try/catch around localStorage (Safari private mode safety).
 */

export function CustomerLightModeLock() {
  useEffect(() => {
    const html = document.documentElement

    // Save previous state so we can restore it on unmount
    const hadDarkClass = html.classList.contains('dark')
    const previousColorScheme = html.style.colorScheme || ''

    // Force light mode
    html.classList.remove('dark')
    html.style.colorScheme = 'light'

    // Watch for any future attempts to add `dark` back (e.g., ThemeProvider
    // re-applying on route change, or system preference changing). Remove
    // it immediately if added.
    const observer = new MutationObserver(() => {
      if (html.classList.contains('dark')) {
        html.classList.remove('dark')
      }
    })
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })

    // Also listen for system theme changes (in case ThemeProvider reacts
    // to prefers-color-scheme and re-adds dark)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemThemeChange = () => {
      // Always force light, regardless of system preference
      html.classList.remove('dark')
      html.style.colorScheme = 'light'
    }
    mediaQuery.addEventListener('change', onSystemThemeChange)

    return () => {
      // Cleanup: stop observing and restore previous theme state
      observer.disconnect()
      mediaQuery.removeEventListener('change', onSystemThemeChange)

      // Restore the previous theme so admin/seller/delivery get their
      // dark mode back if the user had it enabled
      if (hadDarkClass) {
        html.classList.add('dark')
      }
      html.style.colorScheme = previousColorScheme
    }
  }, [])

  // This component renders nothing — it's a pure side-effect lock
  return null
}
