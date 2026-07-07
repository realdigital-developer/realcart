'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  const [showDetails, setShowDetails] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    console.error('[App Error]', error)
  }, [error])

  // Auto-retry up to 2 times for chunk/loading errors
  useEffect(() => {
    const isChunkError = error?.message?.includes('Loading chunk') ||
      error?.message?.includes('ChunkLoadError') ||
      error?.message?.includes('dynamically imported module')
    if (isChunkError && retryCount < 2) {
      const timer = setTimeout(() => {
        setRetryCount(prev => prev + 1)
        reset()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [error, retryCount, reset])

  const handleGoHome = () => {
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An error occurred while loading this page. This might be a temporary issue — please try again.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <Button
            onClick={() => { setRetryCount(prev => prev + 1); reset() }}
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/25"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button
            onClick={handleGoHome}
            variant="outline"
            className="w-full sm:w-auto rounded-xl"
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          <Bug className="h-3 w-3" />
          {showDetails ? 'Hide' : 'Show'} error details
        </button>
        {showDetails && (
          <div className="w-full p-3 rounded-xl bg-muted/50 border border-border/50 text-left">
            <p className="text-xs font-mono text-destructive break-all">
              {error?.message || 'Unknown error'}
            </p>
            {error?.digest && (
              <p className="text-[10px] text-muted-foreground mt-1">Error ID: {error.digest}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
