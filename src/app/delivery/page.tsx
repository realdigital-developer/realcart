'use client'

import { useState, useEffect, Suspense, Component } from 'react'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'
import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/*  Loading Screen                                                      */
/* ------------------------------------------------------------------ */

function LoadingScreen() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-xl shadow-orange-500/25">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="m7 17 9.2-9.2M17 17V7H7"/></svg>
          </div>
          <div className="absolute -bottom-1 -right-1 h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Loading RealCart Delivery</p>
          <p className="text-xs text-muted-foreground mt-1">Please wait a moment...</p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dynamic imports with ssr: false                                     */
/* ------------------------------------------------------------------ */

const DeliveryBoyAuthGate = dynamic(
  () => import('@/components/delivery-boy/auth-gate').then(m => ({ default: m.DeliveryBoyAuthGate })),
  { ssr: false, loading: () => <LoadingScreen /> }
)

/* ------------------------------------------------------------------ */
/*  Error Boundary — inline styles to avoid component dependencies      */
/* ------------------------------------------------------------------ */

class DeliveryErrorBoundary extends Component<{
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
    console.error('[DeliveryErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: '320px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', margin: '0 auto 20px', fontSize: '24px' }}>!</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Something went wrong</h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>A component failed to load. Please try again.</p>
            <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #f97316, #f59e0b)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>Try Again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ------------------------------------------------------------------ */
/*  Main Page — Shows auth gate when not authenticated                 */
/*  When authenticated, layout.tsx handles the bottom navbar + routing */
/* ------------------------------------------------------------------ */

export default function DeliveryPage() {
  const { authenticated, loading } = useDeliveryBoyAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, []) // eslint-disable-line react-hooks/set-state-in-effect

  // Show loading screen while mounting or checking auth
  if (!mounted || loading) {
    return <LoadingScreen />
  }

  // When authenticated, the layout.tsx will show the bottom navbar + redirect to dashboard
  // When not authenticated, show the auth gate
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DeliveryErrorBoundary>
        {!authenticated && <DeliveryBoyAuthGate />}
        {authenticated && (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
            </div>
          </div>
        )}
      </DeliveryErrorBoundary>
    </Suspense>
  )
}
