'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Admin Error]', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-red-500/25">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Admin Panel Error</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An error occurred in the admin panel. Please try again or check your connection.
          </p>
        </div>
        <Button
          onClick={reset}
          className="rounded-xl"
          variant="destructive"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    </div>
  )
}
