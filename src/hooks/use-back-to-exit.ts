'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

/**
 * useBackToExit
 * -------------
 * Implements the "press back again to exit" pattern on the customer home
 * page (/customer?tab=home). This is the standard mobile-app pattern where:
 *
 *   1. User presses the browser/Android back button while on the home tab
 *   2. A soft toast appears: "Press again to exit"
 *   3. If the user presses back again within EXIT_WINDOW_MS (2.5s), the
 *      app exits (window.close() or redirect to about:blank)
 *   4. If the user does NOT press back again within the window, the toast
 *      hides and the pattern resets — next back press shows the toast again
 *
 * Why this is needed:
 *   The customer panel is a multi-tab SPA. Pressing back on the home tab
 *   would normally navigate away from the app entirely (to whatever page
 *   the user was on before /customer, or close the tab). The "press again
 *   to exit" pattern gives users a chance to cancel accidental back
 *   presses — a common UX pattern on Android apps and mobile web apps.
 *
 * How it works:
 *   - On mount (when `enabled` is true): pushes a "soft back" entry into
 *     the browser history stack via history.pushState(). This creates a
 *     "buffer" state so the first back press doesn't leave the app.
 *   - Listens for `popstate` events (fires when the user presses back)
 *   - On first popstate: shows the toast, re-pushes the buffer state
 *     (so there's still a buffer for a potential second back press),
 *     starts a 2.5s timer.
 *   - On second popstate within the window: calls exitApp().
 *   - If the timer expires without a second press: hides the toast,
 *     resets the state. (The buffer state remains, so the pattern
 *     repeats on the next back press.)
 *
 * Exit mechanism:
 *   - Primary: window.close() — works for tabs/windows opened via
 *     window.open() (e.g., PWA installed apps, tabs opened from links
 *     in other apps).
 *   - Fallback: redirect to about:blank — effectively exits the app
 *     context for tabs the user opened normally. Some browsers also
 *     close the tab when navigating to about:blank.
 *   - On mobile (especially Android Chrome PWA), window.close() is
 *     the most reliable way to exit an installed PWA.
 *
 * Parameters:
 *   - enabled: boolean — only active when true. The caller should pass
 *     true only when the user is on the home tab (activeTab === 'home')
 *     AND authenticated. When enabled flips to false, the hook cleans
 *     up its listeners and buffer state.
 *
 * Returns:
 *   - showExitToast: boolean — whether the "press again to exit" toast
 *     should be visible. The caller renders the toast based on this.
 *
 * Robustness:
 *   - SSR-safe: all logic in useEffect (client-only). Returns false
 *     during SSR.
 *   - Cleans up listeners and timers on unmount.
 *   - When `enabled` flips to false, immediately hides toast and resets.
 *   - Uses a ref for the "first back pressed" flag to avoid stale
 *     closures in the popstate handler.
 *   - try/catch around window.close() (some browsers throw if not
 *     allowed to close).
 *   - Doesn't interfere with the browser's normal back navigation when
 *     disabled — the buffer state is only pushed when enabled.
 */

const EXIT_WINDOW_MS = 2500 // how long the "press again" window stays open
const BUFFER_STATE_KEY = 'realcart-back-to-exit-buffer'

export function useBackToExit(enabled: boolean): { showExitToast: boolean } {
  const [showExitToast, setShowExitToast] = useState(false)
  const firstBackPressedRef = useRef(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Exit the app — try window.close() first, fall back to about:blank redirect
  const exitApp = useCallback(() => {
    try {
      // Primary: try to close the window/tab. Works for:
      // - PWAs installed on mobile (Android Chrome, iOS Safari)
      // - Tabs opened via window.open()
      window.close()
    } catch {
      // Ignore — some browsers throw if not allowed to close
    }
    // Fallback: if window.close() didn't work (tab still open after a
    // brief delay), redirect to about:blank. This effectively exits the
    // app context — the user sees a blank page and can close the tab
    // manually. On some browsers, navigating to about:blank also closes
    // the tab automatically.
    setTimeout(() => {
      if (!window.closed) {
        window.location.href = 'about:blank'
      }
    }, 100)
  }, [])

  // Main effect: set up the buffer state + popstate listener
  useEffect(() => {
    if (!enabled) {
      // When disabled, ensure toast is hidden and any pending timer is cleared
      setShowExitToast(false)
      firstBackPressedRef.current = false
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      return
    }

    // Push a buffer state so the first back press doesn't leave the app.
    // We tag it with a custom key so we can detect it if needed.
    // Only push if we're not already on a buffer state (avoids stacking
    // buffer states on re-renders).
    if (!history.state || history.state[BUFFER_STATE_KEY] !== true) {
      history.pushState({ [BUFFER_STATE_KEY]: true }, '')
    }

    const handlePopState = () => {
      if (!firstBackPressedRef.current) {
        // First back press — show toast, re-push buffer state, start timer
        firstBackPressedRef.current = true
        setShowExitToast(true)

        // Re-push the buffer state so there's still a buffer for a
        // potential second back press
        history.pushState({ [BUFFER_STATE_KEY]: true }, '')

        // Start the exit window timer
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
        exitTimerRef.current = setTimeout(() => {
          // Timer expired — reset the pattern, hide toast
          firstBackPressedRef.current = false
          setShowExitToast(false)
          exitTimerRef.current = null
        }, EXIT_WINDOW_MS)
      } else {
        // Second back press within the window — exit the app
        if (exitTimerRef.current) {
          clearTimeout(exitTimerRef.current)
          exitTimerRef.current = null
        }
        setShowExitToast(false)
        firstBackPressedRef.current = false
        exitApp()
      }
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      // Reset state on cleanup
      firstBackPressedRef.current = false
      setShowExitToast(false)
    }
  }, [enabled, exitApp])

  return { showExitToast }
}
