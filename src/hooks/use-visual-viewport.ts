'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Tracks the visual viewport height and keyboard offset, returning
 * both as React state so consumers can use them in inline styles.
 *
 * ── Why this hook exists ──
 *
 * The vaul Drawer component manages drawer height internally by
 * setting `style.height` directly on the DOM element when the
 * virtual keyboard opens.  When the keyboard closes, vaul's cached
 * `initialDrawerHeight` can be stale, causing the drawer to stay
 * permanently short.  Our fix disables vaul's built-in keyboard
 * handling (`repositionInputs={false}`) and manages height ourselves
 * using `maxHeight` + `bottom` via React inline styles, which
 * re-render correctly every time.
 *
 * ── What it returns ──
 *
 * - `viewportHeight`: current `visualViewport.height` in px.
 *   Shrinks when the keyboard opens, grows when it closes.
 *
 * - `keyboardOffset`: `window.innerHeight - visualViewport.height`.
 *   Represents the space taken by the virtual keyboard (0 when
 *   keyboard is closed).  Used to set `bottom` on the drawer so
 *   it sits above the keyboard.
 *
 * The hook is idempotent — calling it from multiple components is
 * safe because it always writes to the same CSS variable on `<html>`.
 */
export function useVisualViewport() {
  const [viewportHeight, setViewportHeight] = useState(0)
  const [keyboardOffset, setKeyboardOffset] = useState(0)

  // Track the full layout viewport height as a ref so we can
  // compute keyboard offset on every visual viewport change.
  const update = useCallback(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return

    const html = document.documentElement
    const vh = window.visualViewport.height
    const innerH = window.innerHeight

    // Update CSS variable (fallback for any CSS-class-based consumers)
    html.style.setProperty('--vvh', `${vh}px`)

    // Update React state for inline styles
    setViewportHeight(vh)
    setKeyboardOffset(Math.max(innerH - vh, 0))
  }, [])

  useEffect(() => {
    function handleOrientationChange() {
      // Use multiple delayed updates to ensure the browser has
      // finished the rotation animation and reports final dimensions.
      requestAnimationFrame(update)
      setTimeout(update, 100)
      setTimeout(update, 300)
    }

    // Initial measurement (deferred to avoid synchronous setState in effect)
    requestAnimationFrame(update)

    // Visual viewport events — fire on keyboard open/close
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    }

    // Window resize as fallback for orientation changes
    window.addEventListener('resize', update)

    // Orientation change detection — modern + legacy APIs
    if (screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationChange)
    }
    window.addEventListener('orientationchange', handleOrientationChange)

    return () => {
      if (vv) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
      window.removeEventListener('resize', update)
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', handleOrientationChange)
      }
      window.removeEventListener('orientationchange', handleOrientationChange)
    }
  }, [update])

  return { viewportHeight, keyboardOffset }
}
