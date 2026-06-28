'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Slide Data — fetched from /api/hero-slides (admin-managed)         */
/*  Falls back to an empty state if the API returns no slides.         */
/*                                                                     */
/*  Each slide is a high-resolution predesigned banner image uploaded  */
/*  by the admin. The customer sees the image as-is — no text overlay, */
/*  no gradient, no icon. Clicking the slide navigates to the admin-   */
/*  assigned redirect URL.                                            */
/* ------------------------------------------------------------------ */

export interface HeroSlide {
  _id: string
  title: string
  imageUrl: string | null
  redirectUrl: string
}

/* ------------------------------------------------------------------ */
/*  Auto-play progress hook (rAF-based, resets on slide change)        */
/* ------------------------------------------------------------------ */

function useAutoplayProgress(duration: number, paused: boolean, slideIndex: number) {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    if (paused) {
      setProgress(0) // eslint-disable-line react-hooks/set-state-in-effect
      return
    }

    startTimeRef.current = performance.now()
    setProgress(0)

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current
      const pct = Math.min(elapsed / duration, 1)
      setProgress(pct)
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [duration, paused, slideIndex])

  return progress
}

/* ------------------------------------------------------------------ */
/*  Auto-play tick hook                                                */
/* ------------------------------------------------------------------ */

function useAutoplayTick(interval: number, paused: boolean) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setTick((t) => t + 1), interval)
    return () => clearInterval(id)
  }, [interval, paused])
  return tick
}

/* ------------------------------------------------------------------ */
/*  Hero Slider Component                                              */
/* ------------------------------------------------------------------ */

interface HeroSliderProps {
  /**
   * Cached slides from the parent (HomeContentWrapper). When provided,
   * the slider renders them instantly WITHOUT fetching — this is what
   * makes the home tab feel "real-time" on re-visits because the data
   * persists across tab switches at the parent level.
   *
   * When omitted (undefined), the slider falls back to its own internal
   * fetch — keeping it backward-compatible for any other usage.
   */
  slides?: HeroSlide[]
  /**
   * Loading flag from the parent. Only meaningful when `slides` is
   * provided. When `slides` is provided AND `loading` is false, the
   * loading spinner is hidden and the data is shown immediately.
   */
  loading?: boolean
}

export function HeroSlider({ slides: propSlides, loading: propLoading }: HeroSliderProps = {}) {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isPaused, setIsPaused] = useState(false)
  const [isTouching, setIsTouching] = useState(false)
  // Local state — only used when no cached props are provided (fallback mode)
  const [localSlides, setLocalSlides] = useState<HeroSlide[]>([])
  const [localLoading, setLocalLoading] = useState(true)

  const AUTOPLAY_INTERVAL = 4000

  // ── Fallback fetch — only runs when the parent does NOT supply cached data ──
  useEffect(() => {
    // If the parent is managing slides, skip the internal fetch entirely
    if (propSlides !== undefined) return

    let cancelled = false
    async function fetchSlides() {
      try {
        // cache: 'no-store' ensures the browser always fetches fresh data
        // so admin changes appear immediately on the customer home page.
        const res = await fetch('/api/hero-slides', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        const fetched: HeroSlide[] = Array.isArray(data.slides) ? data.slides : []
        setLocalSlides(fetched)
      } catch {
        // Non-fatal — leave slides empty, the slider won't render
        if (!cancelled) setLocalSlides([])
      } finally {
        if (!cancelled) setLocalLoading(false)
      }
    }
    fetchSlides()
    return () => { cancelled = true }
  }, [propSlides])

  // Resolve which data + loading state to use:
  //   • Parent-managed mode (propSlides !== undefined) → use props directly
  //   • Fallback mode → use local state
  const useParentCache = propSlides !== undefined
  const slides = useParentCache ? propSlides! : localSlides
  const loading = useParentCache ? (propLoading ?? false) : localLoading

  const totalSlides = slides.length

  const paused = isPaused || isTouching || loading

  // Auto-advance
  const tick = useAutoplayTick(AUTOPLAY_INTERVAL, paused)

  useEffect(() => {
    if (paused || totalSlides === 0) return
    setDirection(1) // eslint-disable-line react-hooks/set-state-in-effect
    setCurrent((prev) => (prev + 1) % totalSlides)
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Progress tracking for active indicator fill animation
  const progress = useAutoplayProgress(AUTOPLAY_INTERVAL, paused, current)

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > current ? 1 : -1)
      setCurrent(index)
    },
    [current]
  )

  const goNext = useCallback(() => {
    setDirection(1)
    setCurrent((prev) => (prev + 1) % totalSlides)
  }, [totalSlides])

  const goPrev = useCallback(() => {
    setDirection(-1)
    setCurrent((prev) => (prev - 1 + totalSlides) % totalSlides)
  }, [totalSlides])

  // Touch / swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
    setIsTouching(true)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) {
      setIsTouching(false)
      return
    }
    const diff = touchStart - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) {
      if (diff > 0) goNext()
      else goPrev()
    }
    setTouchStart(null)
    setTimeout(() => setIsTouching(false), 800)
  }

  // ── Handle slide click — navigate to the admin-assigned redirect URL ──
  const handleSlideClick = (slide: HeroSlide) => {
    if (!slide.redirectUrl) return
    // Internal links (starting with /) navigate within the app
    if (slide.redirectUrl.startsWith('/')) {
      window.location.href = slide.redirectUrl
    } else if (slide.redirectUrl.startsWith('http')) {
      // External URLs open in a new tab
      window.open(slide.redirectUrl, '_blank')
    }
  }

  // Slide animation variants — smooth horizontal slide
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? '100%' : '-100%',
      opacity: 1,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: {
        x: { type: 'tween', duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
      },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? '-100%' : '100%',
      opacity: 1,
      transition: {
        x: { type: 'tween', duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
      },
    }),
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="w-full py-3 sm:py-4 bg-[#f7f6f4]">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div
            className="rounded-2xl sm:rounded-3xl bg-[#f7f6f4] animate-pulse flex items-center justify-center"
            style={{ aspectRatio: '2.1 / 1' }}
          >
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state — no slides created by admin, render nothing ──
  if (totalSlides === 0) return null

  const slide = slides[current]

  return (
    <div
      className="w-full py-3 sm:py-4 bg-[#f7f6f4]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        {/* ───────── Slider Container ───────── */}
        <div
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl"
          style={{ aspectRatio: '2.1 / 1' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Slides — full-bleed image, clickable */}
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={slide._id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className={cn(
                'absolute inset-0 overflow-hidden',
                // Show pointer cursor only when there's a redirect URL
                slide.redirectUrl && 'cursor-pointer',
              )}
              onClick={() => handleSlideClick(slide)}
            >
              {slide.imageUrl ? (
                <img
                  src={slide.imageUrl}
                  alt={slide.title}
                  className="w-full h-full object-cover select-none"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                  <span className="text-white/50 text-sm">No image</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Dot Indicators (below slider — pill-shaped with animated fill) ── */}
        {totalSlides > 1 && (
          <div
            className="flex items-center justify-center mt-2.5"
            style={{ gap: '4px' }}
          >
            {slides.map((s, i) => {
              const isVisited = i < current
              const isActive = i === current

              return (
                <button
                  key={s._id}
                  onClick={() => goTo(i)}
                  className="relative rounded-full cursor-pointer overflow-hidden
                    transition-all duration-200
                    bg-gray-300 dark:bg-gray-600
                    hover:bg-gray-400 dark:hover:bg-gray-500"
                  style={{
                    width: isActive ? '20px' : '8px',
                    height: '4px',
                    minWidth: isActive ? '20px' : '8px',
                    minHeight: '4px',
                  }}
                  aria-label={`Go to slide ${i + 1}`}
                >
                  {/* Visited dot — fully filled */}
                  {isVisited && (
                    <div className="absolute inset-0 rounded-full bg-gray-800 dark:bg-white" />
                  )}

                  {/* Active dot — white fill animates left-to-right with auto-play timer */}
                  {isActive && (
                    <div
                      className="absolute inset-0 rounded-full bg-gray-800 dark:bg-white origin-left"
                      style={{ transform: `scaleX(${progress})` }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
