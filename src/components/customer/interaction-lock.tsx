'use client'

import { useEffect } from 'react'

/**
 * CustomerInteractionLock
 * -----------------------
 * Applies 4 interaction restrictions to the customer panel ONLY:
 *
 * 1. Hides scrollbars (scrolling still works, just no visible bar)
 *    — CSS class `customer-interaction-lock` on <html> triggers the
 *      scrollbar-hiding rules in globals.css.
 *
 * 2. Disables zoom (pinch-zoom, ctrl+wheel, ctrl+keyboard, trackpad pinch)
 *    — JS event listeners preventDefault on:
 *      * wheel + ctrl/meta key (desktop ctrl+scroll zoom)
 *      * keydown + ctrl/meta + +/-/0 (desktop keyboard zoom)
 *      * gesturestart/gesturechange/gestureend (Mac trackpad pinch)
 *      * touchmove with 2+ touches (mobile pinch-zoom — backup for
 *        browsers that ignore the viewport meta)
 *    — Mobile pinch-zoom is primarily prevented by the viewport meta
 *      in customer/layout.tsx (maximumScale=1, userScalable=false).
 *      This JS listener is a belt-and-suspenders backup.
 *
 * 3. Disables copy / cut / context menu (right-click)
 *    — JS event listeners preventDefault on copy, cut, contextmenu
 *    — EXCEPT in input/textarea fields (users need paste/copy in forms)
 *
 * 4. Disables text selection
 *    — CSS `user-select: none` on body (via the CSS class)
 *    — JS `selectstart` listener as backup
 *    — EXCEPT in input/textarea/[contenteditable] (essential for form UX)
 *
 * Scope:
 *   This component is mounted ONLY in customer-layout-client.tsx. When
 *   the user navigates to /admin, /seller, or /delivery, this component
 *   unmounts, the CSS class is removed, and all event listeners are
 *   cleaned up — those panels keep full default behavior (scrollbars,
 *   zoom, copy, selection).
 *
 * Robustness:
 *   - SSR-safe: does nothing during SSR (no document access). All work
 *     happens in useEffect (client-only).
 *   - Cleanup on unmount: removes the CSS class and all event listeners.
 *   - Form-field exceptions: inputs, textareas, and contenteditable
 *     elements keep user-select, copy, and context-menu so forms work.
 *   - passive:false on wheel/touchmove/gesture listeners so preventDefault
 *     actually works (passive listeners can't preventDefault).
 *   - touchmove only prevented when 2+ touches (pinch) — single-touch
 *     scrolling is allowed.
 *
 * Accessibility note:
 *   Disabling zoom and text selection is generally discouraged for
 *   accessibility. This is implemented per the project owner's explicit
 *   request for the customer panel (storefront) only. Admin/seller/delivery
 *   panels keep default browser behavior.
 */

const LOCK_CLASS = 'customer-interaction-lock'

// Helper: check if an event target is a form field that should keep
// default selection/copy/context-menu behavior
function isFormField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if (target.isContentEditable) return true
  return false
}

export function CustomerInteractionLock() {
  useEffect(() => {
    const html = document.documentElement

    // ── 1. Add CSS class (triggers scrollbar hiding + user-select disable) ──
    html.classList.add(LOCK_CLASS)

    // ── 2. Zoom prevention (desktop) ──

    // Ctrl/Cmd + wheel = browser zoom → prevent
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }

    // Ctrl/Cmd + +/-/0 = browser zoom → prevent
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
        e.preventDefault()
      }
    }

    // Mac trackpad pinch gesture → prevent
    const preventGesture = (e: Event) => {
      e.preventDefault()
    }

    // ── 2b. Zoom prevention (mobile — backup for viewport meta) ──

    // Multi-touch move = pinch-zoom → prevent (but allow single-touch scroll)
    const preventTouchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }

    // ── 3. Copy / cut / context-menu prevention ──

    const preventCopy = (e: ClipboardEvent) => {
      // Allow copy/cut in form fields (users may want to copy OTP codes, etc.)
      if (isFormField(e.target)) return
      e.preventDefault()
    }

    const preventContextMenu = (e: MouseEvent) => {
      // Allow context menu in form fields (for paste, spell-check, etc.)
      if (isFormField(e.target)) return
      e.preventDefault()
    }

    // ── 4. Text selection prevention (JS backup for CSS user-select:none) ──

    const preventSelectStart = (e: Event) => {
      if (isFormField(e.target)) return
      e.preventDefault()
    }

    // ── Register all listeners ──
    // passive:false is REQUIRED for preventDefault to work on wheel/touchmove/gesture
    document.addEventListener('wheel', preventWheelZoom, { passive: false })
    document.addEventListener('keydown', preventKeyboardZoom)
    document.addEventListener('gesturestart', preventGesture, { passive: false })
    document.addEventListener('gesturechange', preventGesture, { passive: false })
    document.addEventListener('gestureend', preventGesture, { passive: false })
    document.addEventListener('touchmove', preventTouchZoom, { passive: false })
    document.addEventListener('copy', preventCopy)
    document.addEventListener('cut', preventCopy)
    document.addEventListener('contextmenu', preventContextMenu)
    document.addEventListener('selectstart', preventSelectStart)

    // ── Cleanup on unmount ──
    return () => {
      html.classList.remove(LOCK_CLASS)
      document.removeEventListener('wheel', preventWheelZoom)
      document.removeEventListener('keydown', preventKeyboardZoom)
      document.removeEventListener('gesturestart', preventGesture)
      document.removeEventListener('gesturechange', preventGesture)
      document.removeEventListener('gestureend', preventGesture)
      document.removeEventListener('touchmove', preventTouchZoom)
      document.removeEventListener('copy', preventCopy)
      document.removeEventListener('cut', preventCopy)
      document.removeEventListener('contextmenu', preventContextMenu)
      document.removeEventListener('selectstart', preventSelectStart)
    }
  }, [])

  // This component renders nothing — it's a pure side-effect lock
  return null
}
