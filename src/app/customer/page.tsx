'use client'

import { useState, useEffect, Suspense, Component } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/*  Loading Screen                                                      */
/*                                                                     */
/*  Returns null (renders nothing visible). The branded splash screen  */
/*  in customer-layout-client.tsx already handles the initial app-load */
/*  UX, so showing "Loading RealCart, Please wait a moment..." here    */
/*  would be redundant and visually jarring right after the splash     */
/*  fades out.                                                         */
/*                                                                     */
/*  We keep the function (instead of deleting it) because it's used    */
/*  as the fallback for:                                               */
/*    - dynamic(..., { ssr: false, loading: () => <LoadingScreen /> }) */
/*    - <Suspense fallback={<LoadingScreen />}>                        */
/*    - the mounted/loading check in CustomerHomeInner                 */
/*                                                                     */
/*  Returning null satisfies all three contracts without rendering     */
/*  any visible UI.                                                    */
/* ------------------------------------------------------------------ */

function LoadingScreen() {
  return null
}

/* ------------------------------------------------------------------ */
/*  Dynamic imports — ssr: false to avoid SSR issues with localStorage */
/* ------------------------------------------------------------------ */

const AuthGate = dynamic(() => import('@/components/customer/auth-gate').then(m => ({ default: m.AuthGate })), {
  ssr: false,
  loading: () => <LoadingScreen />,
})
const HomeContentWrapper = dynamic(() => import('@/components/customer/home-content-wrapper').then(m => ({ default: m.HomeContentWrapper })), {
  ssr: false,
  loading: () => <LoadingScreen />,
})

/* ------------------------------------------------------------------ */
/*  Inline Error Boundary — catches dynamic import failures and         */
/*  component crashes with a clear retry UI                             */
/* ------------------------------------------------------------------ */

class InlineErrorBoundary extends Component<{
  children: ReactNode
}, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[InlineErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      // Use inline styles for the fallback to avoid dependency on
      // any component that might also be broken
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
              width: '56px', height: '56px', borderRadius: '16px',
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', margin: '0 auto 20px', fontSize: '24px',
              boxShadow: '0 10px 25px rgba(249,115,22,0.25)',
            }}>
              !
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px', lineHeight: 1.5 }}>
              A component failed to load. This might be a temporary issue.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              style={{
                padding: '10px 24px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg, #10b981, #14b8a6)',
                color: 'white', fontWeight: 600, cursor: 'pointer',
                fontSize: '14px', boxShadow: '0 8px 20px rgba(16,185,129,0.25)',
              }}
            >
              Try Again
            </button>
            {this.state.error && (
              <p style={{ marginTop: '16px', fontSize: '12px', color: '#9ca3af',
                fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: '280px',
                margin: '16px auto 0' }}>
                {this.state.error.message}
              </p>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ------------------------------------------------------------------ */
/*  Customer Home Inner — handles auth state and routing               */
/*                                                                     */
/*  Simpler than before: just check loading and authenticated,         */
/*  no complex timeout/slow-loading tracking that could cause          */
/*  render-during-render issues.                                       */
/* ------------------------------------------------------------------ */

function CustomerHomeInner() {
  const { authenticated, loading, isNewCustomer } = useCustomerAuth()
  const searchParams = useSearchParams()

  // Track client-side mount to avoid hydration mismatches
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, []) // eslint-disable-line react-hooks/set-state-in-effect

  // ── New-customer redirect ────────────────────────────────────────────
  // When a new customer just registered (profileComplete = false), redirect
  // them to the profile page to complete their profile (name, email, image).
  // The redirect happens ONLY if there's no explicit tab in the URL (so we
  // don't override intentional navigation like ?tab=orders). Once they save
  // their profile (email gets set), profileComplete becomes true and this
  // redirect no longer triggers.
  //
  // We use a HARD navigation (window.location.href) instead of replaceState
  // because HomeContentWrapper initializes its navHistory state from initialTab
  // only ONCE on mount. A soft URL change wouldn't remount it, so the customer
  // would stay on the home tab. A hard navigation forces a full remount with
  // the correct initialTab='profile'.
  useEffect(() => {
    if (!mounted || !authenticated || !isNewCustomer) return
    // Don't redirect if the user is already on a specific tab (intentional nav)
    const currentTab = searchParams.get('tab')
    if (currentTab && currentTab !== 'home') return
    // Hard redirect to the profile tab — forces a full page remount so
    // HomeContentWrapper picks up initialTab='profile' from the URL.
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'profile')
    window.location.href = url.toString()
  }, [mounted, authenticated, isNewCustomer, searchParams])

  // Show loading until client-side hydration is complete
  if (!mounted || loading) {
    return <LoadingScreen />
  }

  if (!authenticated) {
    return (
      <InlineErrorBoundary>
        <AuthGate />
      </InlineErrorBoundary>
    )
  }

  // Pass URL search params to HomeContentWrapper.
  // For new customers, force the profile tab so they complete their profile.
  const tab = isNewCustomer && (!searchParams.get('tab') || searchParams.get('tab') === 'home')
    ? 'profile'
    : searchParams.get('tab')
  const search = searchParams.get('search')
  const category = searchParams.get('category')
  const subcategory = searchParams.get('subcategory')

  return (
    <InlineErrorBoundary>
      <HomeContentWrapper initialTab={tab} initialSearch={search} initialCategory={category} initialSubcategory={subcategory} />
    </InlineErrorBoundary>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page Export                                                    */
/* ------------------------------------------------------------------ */

export default function CustomerHomePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <InlineErrorBoundary>
        <CustomerHomeInner />
      </InlineErrorBoundary>
    </Suspense>
  )
}
