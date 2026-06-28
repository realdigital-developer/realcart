'use client'

import { Component, ReactNode } from 'react'
import { CustomerAuthProvider } from '@/components/providers/customer-auth-provider'
import { CartProvider } from '@/components/providers/cart-provider'
import { WishlistProvider } from '@/components/providers/wishlist-provider'
import { LanguageProvider } from '@/components/providers/language-provider'
import { CustomerSplashScreen } from '@/components/customer/splash-screen'
import { CustomerOnboardingScreen } from '@/components/customer/onboarding-screen'
import { CustomerLightModeLock } from '@/components/customer/light-mode-lock'
import { CustomerInteractionLock } from '@/components/customer/interaction-lock'

/* ------------------------------------------------------------------ */
/*  Provider Error Boundary                                             */
/*                                                                     */
/*  When a provider crashes, we render a safe fallback UI instead      */
/*  of trying to re-render the children (which would include the       */
/*  crashing provider, causing an infinite error loop).                */
/*                                                                     */
/*  Previous approach (rendering children with a "degraded context")   */
/*  was broken because DegradedCustomerAuthContext was a DIFFERENT     */
/*  context object than CustomerAuthContext, so useCustomerAuth()      */
/*  would still read from the original context with loading:true.      */
/* ------------------------------------------------------------------ */

class ProviderErrorBoundary extends Component<{
  children: ReactNode
  name: string
}, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode; name: string }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ProviderErrorBoundary:${this.props.name}]`, error, info)
  }

  render() {
    if (this.state.hasError) {
      // Show a minimal fallback — do NOT render this.props.children
      // because they include the crashing provider
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '320px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', margin: '0 auto 16px', fontSize: '20px',
            }}>
              !
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
              The {this.props.name} service failed to load. Please refresh the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              style={{
                padding: '8px 20px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #10b981, #14b8a6)',
                color: 'white', fontWeight: 600, cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function CustomerLayoutClient({ children }: { children: React.ReactNode }) {
  // Layering order (outermost → innermost):
  //   1. CustomerLightModeLock — forces light mode (renders null, pure side-effect)
  //   2. CustomerInteractionLock — hides scrollbars, disables zoom/copy/selection
  //      (renders null, pure side-effect)
  //   3. CustomerSplashScreen — branded splash, 3.5s, sessionStorage (per-session)
  //   4. CustomerOnboardingScreen — 3-phase onboarding, localStorage (first visit ever)
  //   5. Provider tree (CustomerAuth, Cart, Wishlist) + children
  //
  // Theme policy:
  //   The customer panel is ALWAYS light mode. Dark mode is reserved for
  //   admin/seller/delivery panels. CustomerLightModeLock removes the
  //   `dark` class from <html> on mount, watches for re-additions via
  //   MutationObserver, and restores the previous theme on unmount so
  //   navigating to admin/seller/delivery brings back the user's chosen
  //   theme.
  //
  // Interaction policy:
  //   The customer panel hides scrollbars, disables zoom (pinch + ctrl+wheel
  //   + ctrl+keyboard + trackpad gestures), disables copy/cut/context-menu,
  //   and disables text selection — EXCEPT in form fields (inputs,
  //   textareas, contenteditable) which keep default behavior for UX.
  //   CustomerInteractionLock adds the `customer-interaction-lock` CSS class
  //   to <html> and registers JS event listeners. On unmount, everything is
  //   cleaned up so admin/seller/delivery panels keep full default behavior.
  //
  // On a first-time visit (fresh browser), the user sees:
  //   splash (3.5s) → fades out → onboarding (user-driven) → dismiss → login/home
  //
  // On subsequent visits (same browser), the user sees:
  //   splash (3.5s) → fades out → login/home (onboarding is skipped)
  //
  // On refresh within the same session, even the splash is skipped:
  //   login/home (no splash, no onboarding)
  return (
    <>
      <CustomerLightModeLock />
      <CustomerInteractionLock />
      <LanguageProvider>
        <CustomerSplashScreen>
          <CustomerOnboardingScreen>
            <ProviderErrorBoundary name="CustomerAuth">
              <CustomerAuthProvider>
                <ProviderErrorBoundary name="Cart">
                  <CartProvider>
                    <ProviderErrorBoundary name="Wishlist">
                      <WishlistProvider>
                        {children}
                      </WishlistProvider>
                    </ProviderErrorBoundary>
                  </CartProvider>
                </ProviderErrorBoundary>
              </CustomerAuthProvider>
            </ProviderErrorBoundary>
          </CustomerOnboardingScreen>
        </CustomerSplashScreen>
      </LanguageProvider>
    </>
  )
}
