'use client'

import { useState, useEffect, useCallback } from 'react'

interface SiteLogo {
  url: string
  publicId: string
  width: number
  height: number
  format: string
  uploadedAt: string
  size: number
}

interface UseSiteLogoReturn {
  logo: SiteLogo | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Custom hook to fetch the current site logo.
 * Cloudinary URLs are already versioned/unique, but we add
 * a cache-buster based on upload time for extra safety.
 *
 * KEY FIX: Added timeout and better error handling to prevent
 * the hook from blocking the UI if the API is unreachable.
 */
export function useSiteLogo(): UseSiteLogoReturn {
  const [logo, setLogo] = useState<SiteLogo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogo = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8s timeout

      const res = await fetch('/api/admin/logo', {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        // Non-OK response — don't throw, just set logo to null
        setLogo(null)
        return
      }

      const data = await res.json()
      if (data.logo) {
        // Cloudinary URLs include version tokens, but add a cache-buster
        // based on upload time for extra freshness guarantee
        const separator = data.logo.url.includes('?') ? '&' : '?'
        const cacheBuster = `${separator}t=${new Date(data.logo.uploadedAt).getTime()}`
        setLogo({
          ...data.logo,
          url: data.logo.url + cacheBuster,
        })
      } else {
        setLogo(null)
      }
    } catch (err) {
      // Silently handle errors — logo is non-critical
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useSiteLogo] Failed to fetch:', err instanceof Error ? err.message : 'Unknown error')
      }
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLogo(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchLogo()
  }, [fetchLogo])

  return { logo, loading, error, refetch: fetchLogo }
}
