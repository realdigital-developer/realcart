'use client'

/**
 * Image Search Dialog — Customer Panel
 * ------------------------------------------------------------------
 * Modern, attractive modal that lets the customer search products by image.
 *
 * UX flow (streamlined — auto-processes on image select):
 *   1. User taps the camera icon on the dedicated search page.
 *   2. Dialog opens with two beautiful options: Camera | Gallery.
 *   3. User picks an image → it's compressed client-side → the search
 *      API is called automatically (NO separate "Search" button click).
 *   4. While the search runs, an elegant animated loader is shown.
 *   5. On success, the dialog closes and the parent navigates to the
 *      products page with the results.
 *   6. On error, a friendly retry UI is shown.
 *
 * Design:
 *   - Glassmorphic gradient header with a soft glow.
 *   - Two large, tappable option cards (Camera + Gallery) with icons,
 *     labels, and subtle hover/press animations.
 *   - Smooth phase transitions via Framer Motion.
 *   - Compact loading state with a pulsing image thumbnail + progress
 *     text + animated dots.
 *   - Reuses existing shadcn/ui Dialog primitives — no new UI library.
 *
 * The dialog is PRESENTATIONAL only — it does NOT render product results.
 * On success, it calls onSuccess(products, attributes, providers) and the
 * parent navigates to the existing ProductsPage with initialImageProducts.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, ImageIcon, X, Loader2, AlertCircle, RefreshCw, Zap } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { Product } from './types'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ImageSearchAttributes {
  category?: string | null
  color?: string | null
  gender?: string | null
}

export interface ImageSearchProviders {
  vision: 'groq' | 'fallback'
  attributes: 'ximilar' | 'fallback'
  embedding: 'jina' | 'fallback'
  vector: 'pinecone' | 'faiss' | 'fallback'
  filter: 'algolia' | 'fallback'
}

export interface ImageSearchDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: (result: {
    products: Product[]
    attributes: ImageSearchAttributes
    providers: ImageSearchProviders
    durationMs: number
    previewUrl: string
  }) => void
}

type Phase = 'idle' | 'processing' | 'error'

interface ErrorState {
  message: string
  retryable: boolean
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_DIMENSION = 1024
const JPEG_QUALITY = 0.82
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ImageSearchDialog({ open, onClose, onSuccess }: ImageSearchDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<ErrorState | null>(null)
  const [progress, setProgress] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)

  // ── Cleanup object URLs on unmount/close to avoid memory leaks ──
  const revokePreview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      revokePreview()
      setPhase('idle')
      setPreviewUrl(null)
      setError(null)
      setProgress('')
    }
  }, [open, revokePreview])

  useEffect(() => () => revokePreview(), [revokePreview])

  // ── Core: handle a selected file → compress → auto-upload ──
  // This is the KEY change: selecting an image automatically triggers the
  // search. No separate "Search Products" button click required.
  const handleFileSelect = useCallback(async (file: File) => {
    setError(null)

    // Validate type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError({
        message: 'Unsupported file type. Please use a JPEG, PNG, or WebP image.',
        retryable: false,
      })
      setPhase('error')
      return
    }

    // Validate size (pre-compression)
    if (file.size > MAX_FILE_BYTES) {
      setError({
        message: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Please choose an image under 5MB.`,
        retryable: false,
      })
      setPhase('error')
      return
    }

    // Immediately enter processing phase — the user sees the loader
    // while we compress + upload in the background.
    setPhase('processing')
    setProgress('Preparing image…')

    try {
      // ── Compress client-side ──
      const compressed = await compressImage(file, MAX_DIMENSION, JPEG_QUALITY)

      // Create preview URL from the compressed blob
      revokePreview()
      const url = URL.createObjectURL(compressed)
      objectUrlRef.current = url
      setPreviewUrl(url)

      // ── Auto-upload immediately (no button click) ──
      setProgress('Analyzing image…')
      const formData = new FormData()
      formData.append('image', compressed, `search-${Date.now()}.jpg`)

      setProgress('Searching products…')
      const res = await fetch('/api/search/image', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        let message = `Search failed (HTTP ${res.status})`
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          // ignore parse error
        }
        setError({ message, retryable: true })
        setPhase('error')
        setProgress('')
        return
      }

      const data = await res.json()
      const products: Product[] = (data.products || []).map((p: Record<string, unknown>) => ({
        _id: String(p._id || ''),
        name: String(p.name || ''),
        description: String(p.description || ''),
        mrp: Number(p.mrp || 0),
        sellingPrice: Number(p.sellingPrice || 0),
        effectivePrice: Number(p.effectivePrice || 0),
        hasDiscount: Boolean(p.hasDiscount),
        discountPercent: Number(p.discountPercent || 0),
        category: String(p.category || ''),
        brand: String(p.brand || ''),
        imageUrl: String(p.imageUrl || ''),
        stock: Number(p.stock || 0),
        tags: Array.isArray(p.tags) ? p.tags : [],
        seller: String(p.seller || ''),
        inStock: Boolean(p.inStock),
        avgRating: typeof p.avgRating === 'number' ? p.avgRating : undefined,
        totalReviews: typeof p.totalReviews === 'number' ? p.totalReviews : undefined,
        totalSold: typeof p.totalSold === 'number' ? p.totalSold : undefined,
        highlights: Array.isArray(p.highlights) ? p.highlights : undefined,
        subcategory: typeof p.subcategory === 'string' ? p.subcategory : undefined,
        returnPolicy: typeof p.returnPolicy === 'string' ? p.returnPolicy : undefined,
        freeDelivery: typeof p.freeDelivery === 'boolean' ? p.freeDelivery : undefined,
        variantAttributes: Array.isArray(p.variantAttributes) ? p.variantAttributes : undefined,
        variants: Array.isArray(p.variants) ? p.variants : undefined,
      }))

      const attributes: ImageSearchAttributes = {
        category: data.attributes?.category ?? null,
        color: data.attributes?.color ?? null,
        gender: data.attributes?.gender ?? null,
      }

      const providers: ImageSearchProviders = data.providers || {
        vision: 'fallback',
        attributes: 'fallback',
        embedding: 'fallback',
        vector: 'fallback',
        filter: 'fallback',
      }

      // Keep the preview URL alive — the parent uses it in the navbar avatar.
      // Detach our ref so we don't revoke it on close (parent owns it now).
      const keptUrl = previewUrl || url || ''
      objectUrlRef.current = null

      onSuccess({
        products,
        attributes,
        providers,
        durationMs: data.durationMs || 0,
        previewUrl: keptUrl,
      })
    } catch (err) {
      console.error('[ImageSearch] processing error:', err)
      const msg = err instanceof Error ? err.message : 'Network error. Please check your connection.'
      setError({ message: msg, retryable: true })
      setPhase('error')
      setProgress('')
    }
  }, [revokePreview, previewUrl, onSuccess])

  // ── Retry from the beginning ──
  const handleRetry = useCallback(() => {
    setError(null)
    setPhase('idle')
    setPreviewUrl(null)
    revokePreview()
  }, [revokePreview])

  // ── Trigger file inputs ──
  const openGallery = () => fileInputRef.current?.click()
  const openCamera = () => cameraInputRef.current?.click()

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className="max-w-[400px] p-0 overflow-hidden rounded-3xl gap-0 border-0 bg-white dark:bg-gray-900 shadow-2xl"
        showCloseButton={false}
      >
        {/* Visually-hidden title + description for screen reader accessibility
            (Radix Dialog requires these; we hide them visually because the
            custom gradient header provides the visible title). */}
        <DialogTitle className="sr-only">Visual Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search products by uploading or capturing a photo
        </DialogDescription>

        {/* ── Header: glassmorphic gradient with glow ── */}
        <div className="relative overflow-hidden px-6 pt-6 pb-5 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500">
          {/* Decorative blurred orbs for depth */}
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/30">
              <Camera className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Visual Search</h2>
              <p className="text-[11px] text-white/80 leading-tight mt-0.5">Find products with your camera</p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-5">
          <AnimatePresence mode="wait">
            {/* ── Idle: two attractive option cards ── */}
            {phase === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                <p className="text-center text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Choose an option below to start searching
                </p>

                {/* Camera option card */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={openCamera}
                  className="w-full relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200/50 dark:border-emerald-800/30 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/30 group-hover:scale-105 transition-transform flex-shrink-0">
                      <Camera className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Take Photo</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Use your camera to capture a product</p>
                    </div>
                    <Zap className="h-4 w-4 text-emerald-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.button>

                {/* Gallery option card */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={openGallery}
                  className="w-full relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200/50 dark:border-violet-800/30 hover:border-violet-400 dark:hover:border-violet-600 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/30 group-hover:scale-105 transition-transform flex-shrink-0">
                      <ImageIcon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Choose from Gallery</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Select an existing photo from your device</p>
                    </div>
                    <Zap className="h-4 w-4 text-violet-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.button>

                {/* Hidden file inputs — gallery + camera capture */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(',')}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFileSelect(f)
                    e.target.value = '' // reset so selecting the same file again still fires
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFileSelect(f)
                    e.target.value = ''
                  }}
                />
              </motion.div>
            )}

            {/* ── Processing: elegant animated loader ── */}
            {phase === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-6"
              >
                {/* Pulsing image thumbnail (if preview is ready) */}
                <div className="relative mb-5">
                  {previewUrl ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="relative"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Searching"
                        className="h-24 w-24 rounded-2xl object-cover shadow-lg"
                      />
                      {/* Pulsing ring */}
                      <motion.div
                        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute inset-0 rounded-2xl ring-2 ring-emerald-400"
                      />
                    </motion.div>
                  ) : (
                    <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                      <Camera className="h-10 w-10 text-white" />
                    </div>
                  )}
                </div>

                {/* Spinner + progress text */}
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {progress || 'Processing…'}
                  </p>
                </div>

                {/* Animated dots */}
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
                      className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                    />
                  ))}
                </div>

                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-4 text-center">
                  Finding the best matches for your image
                </p>
              </motion.div>
            )}

            {/* ── Error state ── */}
            {phase === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-4 text-center space-y-4"
              >
                <div className="h-16 w-16 mx-auto rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Search failed</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-4">{error?.message || 'Something went wrong.'}</p>
                </div>
                {error?.retryable && (
                  <div className="flex gap-2 justify-center pt-1">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleRetry}
                      className="px-4 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Try Again
                    </motion.button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Image compression helper (client-side, canvas-based)               */
/* ------------------------------------------------------------------ */

/**
 * Compress an image file by drawing it onto a canvas at a reduced size
 * and re-encoding as JPEG. This reduces upload size (faster on low-end
 * devices / slow networks) and ensures Vercel's 4.5MB serverless body
 * limit is never hit.
 *
 * Returns a Blob (always JPEG).
 */
async function compressImage(
  file: File,
  maxDimension: number,
  quality: number,
): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)

    let { width, height } = img
    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round((height * maxDimension) / width)
        width = maxDimension
      } else {
        width = Math.round((width * maxDimension) / height)
        height = maxDimension
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context not available')

    // White background so transparent PNGs don't become black on JPEG export
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })

    if (!blob) throw new Error('Failed to compress image')
    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Load an Image from a URL, resolving when it's decoded. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}
