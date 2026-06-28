'use client'

import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingBag,
  Truck,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Zap,
  Clock,
  Tag,
  Lock,
  RotateCcw,
  HeadphonesIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * CustomerOnboardingScreen (Redesigned — Premium Glassmorphic)
 * ------------------------------------------------------------
 * Shows an attractive 3-phase onboarding flow the FIRST time a user opens
 * the customer app on a given device/browser. After completing (or skipping),
 * it never shows again — the user goes straight to the normal flow
 * (splash → login → home) on subsequent visits.
 *
 * Trigger condition:
 * - Uses localStorage (NOT sessionStorage) so the "onboarding completed"
 *   flag persists across sessions. This is the web equivalent of "first
 *   install on the device" — it only fires once per browser, ever.
 *
 * Sequence in the customer panel:
 *   1. Splash screen (3.5s, fades out) — handled by CustomerSplashScreen
 *   2. Onboarding screen (3 phases, user-driven) — handled by THIS component
 *   3. Normal flow: AuthGate (login) or HomeContentWrapper (if logged in)
 *
 * Design (premium glassmorphic):
 * - Each phase has its own rich full-bleed gradient background with a
 *   distinct color personality (Sunset, Ocean, Twilight).
 * - Glassmorphic content card with backdrop-blur sits on top of the
 *   gradient, holding the title, description, and feature cards.
 * - Large gradient orb holds the phase icon, surrounded by slowly
 *   rotating decorative rings.
 * - Floating particles drift upward in the background for depth.
 * - Feature cards (not pills) — 3 horizontal glassmorphic cards with
 *   mini-icons, stacked vertically. Much more premium than pills.
 * - Step counter + Back/Next/Get Started + Skip link at the bottom.
 *
 * The 3 phases:
 *   Phase 0: "Shop Smarter" — Sunset (rose → orange → amber)
 *   Phase 1: "Fast & Free Delivery" — Ocean (cyan → blue → indigo)
 *   Phase 2: "Secure & Trusted" — Twilight (violet → purple → fuchsia)
 *
 * Robustness:
 * - SSR-safe: initial visible=false (no localStorage during SSR).
 *   useEffect reads localStorage on the client and flips to true if needed.
 * - localStorage wrapped in try/catch (Safari private mode, SSR safety)
 * - Skip link at the bottom of every phase (except the last) — users can
 *   dismiss instantly. Keyboard Esc also skips.
 * - "Get Started" CTA on the last phase
 * - Step counter ("Step 1 of 3") at the bottom provides progress context
 *   (the story-style indicator at the top was removed per design request)
 * - Respects prefers-reduced-motion (CSS handles this)
 * - pointer-events: none during fade-out so users can interact immediately
 *
 * Non-blocking:
 * - Like the splash, children render behind the onboarding overlay.
 *   Providers (auth, cart, wishlist) initialize in parallel.
 */

const STORAGE_KEY = 'realcart-customer-onboarding-completed'
const FADE_DURATION_MS = 400

interface FeatureItem {
  icon: LucideIcon
  label: string
}

interface OnboardingPhase {
  icon: LucideIcon
  title: string
  subtitle: string
  description: string
  features: FeatureItem[]
  // Tailwind gradient classes for the full-bleed background
  bgGradient: string
  // Tailwind gradient classes for the orb (icon container)
  orbGradient: string
  // RGBA glow color for the orb's pulsing shadow
  orbGlow: string
  // Tailwind gradient classes for the title text fill
  titleGradient: string
  // Accent color (hex/rgba) for the story indicator active segment
  indicatorColor: string
  // Accent color for the "Get Started" button gradient
  buttonGradient: string
}

const PHASES: OnboardingPhase[] = [
  {
    icon: ShoppingBag,
    title: 'Shop Smarter',
    subtitle: 'Welcome to RealCart',
    description: 'Browse millions of products at unbeatable prices — from electronics to fashion, home essentials to groceries, all in one app.',
    features: [
      { icon: Tag, label: '10L+ Products' },
      { icon: Sparkles, label: 'Top Brands' },
      { icon: ShoppingBag, label: 'Best Prices' },
    ],
    // Sunset: warm rose → orange → amber
    bgGradient: 'from-rose-500 via-orange-500 to-amber-500',
    orbGradient: 'from-rose-400 via-orange-400 to-amber-400',
    orbGlow: 'rgba(251, 146, 60, 0.6)',
    titleGradient: 'from-rose-50 via-orange-100 to-amber-50',
    indicatorColor: 'rgba(251, 146, 60, 0.95)',
    buttonGradient: 'from-rose-500 to-orange-600',
  },
  {
    icon: Truck,
    title: 'Fast & Free Delivery',
    subtitle: 'Delivered to your doorstep',
    description: 'Free delivery on orders over ₹499. Lightning-fast shipping with real-time order tracking — delivered in as little as 24 hours.',
    features: [
      { icon: Tag, label: 'Free over ₹499' },
      { icon: Zap, label: '24h Delivery' },
      { icon: Clock, label: 'Live Tracking' },
    ],
    // Ocean: cyan → blue → indigo
    bgGradient: 'from-cyan-500 via-blue-500 to-indigo-600',
    orbGradient: 'from-cyan-300 via-sky-400 to-blue-400',
    orbGlow: 'rgba(56, 189, 248, 0.6)',
    titleGradient: 'from-cyan-50 via-sky-100 to-blue-100',
    indicatorColor: 'rgba(56, 189, 248, 0.95)',
    buttonGradient: 'from-cyan-500 to-blue-600',
  },
  {
    icon: ShieldCheck,
    title: 'Secure & Trusted',
    subtitle: 'Shop with confidence',
    description: '100% secure payments, easy 7-day returns, and 24/7 customer support. Your satisfaction is our top priority, every single time.',
    features: [
      { icon: Lock, label: 'Secure Payments' },
      { icon: RotateCcw, label: '7-Day Returns' },
      { icon: HeadphonesIcon, label: '24/7 Support' },
    ],
    // Twilight: violet → purple → fuchsia
    bgGradient: 'from-violet-600 via-purple-600 to-fuchsia-600',
    orbGradient: 'from-violet-400 via-purple-400 to-fuchsia-400',
    orbGlow: 'rgba(192, 132, 252, 0.6)',
    titleGradient: 'from-violet-50 via-purple-100 to-fuchsia-100',
    indicatorColor: 'rgba(192, 132, 252, 0.95)',
    buttonGradient: 'from-violet-600 to-fuchsia-600',
  },
]

// Stable particle positions (generated once, not on every render — avoids
// re-randomization on each phase change which would look jittery)
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  left: `${(i * 8.3 + 5) % 100}%`,
  size: `${4 + (i % 3) * 2}px`,
  delay: `${(i * 0.7) % 6}s`,
  duration: `${8 + (i % 4) * 2}s`,
  drift: `${(i % 2 === 0 ? 1 : -1) * (10 + (i % 3) * 8)}px`,
}))

export function CustomerOnboardingScreen({ children }: { children: ReactNode }) {
  // SSR-safe: start hidden. useEffect (client-only) will set visible=true
  // if onboarding hasn't been completed yet on this device.
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const [phase, setPhase] = useState(0)

  // Check on mount whether onboarding should show
  useEffect(() => {
    let alreadyCompleted = false
    try {
      alreadyCompleted = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      // localStorage unavailable (private mode / SSR) — treat as not completed
      // so the user sees onboarding at least once. Safe fallback.
    }

    if (!alreadyCompleted) {
      // Small delay (300ms) so the splash screen has time to fade out first
      // and the user perceives a clean splash → onboarding transition.
      const showTimer = window.setTimeout(() => {
        setVisible(true)
      }, 300)
      return () => window.clearTimeout(showTimer)
    }
  }, [])

  const dismiss = useCallback(() => {
    setFading(true)
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Ignore — onboarding will just show again next time, which is fine
    }
    window.setTimeout(() => {
      setVisible(false)
      setFading(false)
    }, FADE_DURATION_MS)
  }, [])

  const goNext = useCallback(() => {
    if (phase < PHASES.length - 1) {
      setPhase(p => p + 1)
    } else {
      dismiss()
    }
  }, [phase, dismiss])

  const goBack = useCallback(() => {
    if (phase > 0) {
      setPhase(p => p - 1)
    }
  }, [phase])

  // Keyboard navigation (← → Enter Esc)
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goBack()
      else if (e.key === 'Enter') goNext()
      else if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, goNext, goBack, dismiss])

  // Once onboarding is done (or was already done), just render children normally
  if (!visible) {
    return <>{children}</>
  }

  const currentPhase = PHASES[phase]
  const isLastPhase = phase === PHASES.length - 1
  const Icon = currentPhase.icon

  return (
    <>
      {/* Children render behind the onboarding overlay so they're ready when it fades out */}
      {children}

      {/* Onboarding overlay — full-bleed gradient background per phase.
          The overlay has a solid dark fallback background (bg-gray-900) so that
          even during phase transitions there is NEVER a transparent gap that
          would let the login screen show through. */}
      <div
        aria-hidden="false"
        role="dialog"
        aria-modal="true"
        aria-label={`Welcome to RealCart — phase ${phase + 1} of ${PHASES.length}`}
        className="fixed inset-0 z-[9998] flex flex-col overflow-hidden bg-gray-900"
        style={{
          opacity: fading ? 0 : 1,
          pointerEvents: fading ? 'none' : 'auto',
          transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
        }}
      >
        {/* ── Stacked gradient backgrounds (one per phase, all rendered simultaneously).
            Crossfade via opacity. This approach guarantees there is NEVER a gap
            during transitions — at any moment, at least one background is at or
            near full opacity. The previous AnimatePresence mode="wait" approach
            had a gap between exit-complete and enter-start where the background
            was fully transparent, letting the login screen show through. */}
        {PHASES.map((p, i) => (
          <div
            key={`bg-${i}`}
            className={cn(
              'onboarding-bg-drift absolute inset-0 bg-gradient-to-br transition-opacity duration-700 ease-in-out',
              p.bgGradient
            )}
            style={{
              opacity: i === phase ? 1 : 0,
              animation: 'onboarding-bg-drift 20s ease-in-out infinite',
              // Delay the drift animation differently per phase so they don't sync
              animationDelay: `${i * -7}s`,
            }}
          />
        ))}

        {/* ── Floating particles (depth & life) ── */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {PARTICLES.map((p) => (
            <div
              key={p.id}
              className="onboarding-particle absolute bottom-0 rounded-full bg-white/40"
              style={{
                left: p.left,
                width: p.size,
                height: p.size,
                animation: `onboarding-particle-float ${p.duration} linear infinite`,
                animationDelay: p.delay,
                ['--particle-drift' as string]: p.drift,
              }}
            />
          ))}
        </div>

        {/* ── Soft radial glow behind the orb ── */}
        <div
          className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full blur-3xl opacity-30"
          style={{ background: currentPhase.orbGlow }}
        />

        {/* Story-style progress indicator removed per design requirement.
            The step counter at the bottom ("Step 1 of 3") provides
            sufficient progress context. */}

        {/* ── Main content area ── */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 sm:px-12 py-10 sm:py-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex flex-col items-center text-center max-w-md mx-auto w-full"
            >
              {/* ── Icon orb with rotating decorative rings ── */}
              <div className="relative mb-10 flex items-center justify-center">
                {/* Outer rotating ring (dashed) */}
                <div
                  className="onboarding-ring absolute -inset-6 rounded-full border-2 border-dashed border-white/30"
                  style={{ animation: 'onboarding-ring-rotate 20s linear infinite' }}
                />
                {/* Middle rotating ring (solid, opposite direction) */}
                <div
                  className="onboarding-ring absolute -inset-3 rounded-full border border-white/20"
                  style={{ animation: 'onboarding-ring-rotate 14s linear infinite reverse' }}
                />
                {/* Glow halo */}
                <div
                  className="absolute inset-0 rounded-full blur-2xl opacity-60"
                  style={{ background: currentPhase.orbGlow }}
                />
                {/* The orb itself — gradient circle with icon */}
                <div
                  className={cn(
                    'onboarding-orb relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br',
                    currentPhase.orbGradient
                  )}
                  style={{
                    animation: 'onboarding-orb-pulse 3.5s ease-in-out infinite',
                    ['--orb-glow' as string]: currentPhase.orbGlow,
                  }}
                >
                  {/* Inner highlight (glassmorphism) */}
                  <div className="absolute inset-1 rounded-full bg-gradient-to-br from-white/40 via-transparent to-transparent" />
                  <Icon className="relative h-14 w-14 text-white drop-shadow-lg" strokeWidth={1.8} />
                </div>
              </div>

              {/* ── Subtitle (small uppercase) ── */}
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="text-xs font-bold uppercase tracking-[0.2em] text-white/80 mb-3"
              >
                {currentPhase.subtitle}
              </motion.p>

              {/* ── Title (gradient text fill, animated shimmer) ── */}
              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className={cn(
                  'onboarding-title text-4xl sm:text-5xl font-extrabold tracking-tight mb-5 bg-gradient-to-r bg-clip-text text-transparent',
                  currentPhase.titleGradient
                )}
                style={{
                  backgroundSize: '200% auto',
                  animation: 'onboarding-title-shimmer 4s ease-in-out infinite',
                }}
              >
                {currentPhase.title}
              </motion.h2>

              {/* ── Description ── */}
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="text-base text-white/85 leading-relaxed mb-8 max-w-sm drop-shadow-sm"
              >
                {currentPhase.description}
              </motion.p>

              {/* ── Feature cards (glassmorphic, stacked) ── */}
              <div className="w-full max-w-xs space-y-2.5">
                {currentPhase.features.map((feature, idx) => {
                  const FeatureIcon = feature.icon
                  return (
                    <motion.div
                      key={feature.label}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 + idx * 0.1, duration: 0.4 }}
                      className="onboarding-feature flex items-center gap-3 rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md px-4 py-3 text-left shadow-lg shadow-black/5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/25 backdrop-blur-sm">
                        <FeatureIcon className="h-4 w-4 text-white" strokeWidth={2} />
                      </div>
                      <span className="text-sm font-semibold text-white drop-shadow-sm">
                        {feature.label}
                      </span>
                      <Check className="ml-auto h-4 w-4 text-white/70" strokeWidth={3} />
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Bottom controls: step counter + nav buttons + skip ── */}
        <div className="relative z-10 px-6 sm:px-12 pb-8 sm:pb-12">
          {/* Step counter */}
          <div className="flex items-center justify-center mb-5">
            <span className="text-xs font-bold tracking-[0.15em] text-white/70 uppercase">
              Step <span className="text-white">{phase + 1}</span> of {PHASES.length}
            </span>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
            {/* Back button (hidden on first phase) — glassmorphic */}
            <button
              onClick={goBack}
              disabled={phase === 0}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-2xl border border-white/25 bg-white/10 backdrop-blur-md px-5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/20',
                phase === 0 && 'opacity-0 pointer-events-none'
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {/* Next / Get Started button — solid gradient, pops against the bg */}
            <button
              onClick={goNext}
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-sm font-bold text-white shadow-2xl transition-all hover:scale-[1.03] active:scale-[0.98] bg-gradient-to-r',
                currentPhase.buttonGradient
              )}
              style={{ boxShadow: `0 10px 30px -8px ${currentPhase.orbGlow}` }}
            >
              {isLastPhase ? (
                <>
                  Get Started
                  <Check className="h-4 w-4" strokeWidth={3} />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {/* Skip link — subtle, bottom-center, phases 1-2 only (hidden on last phase).
              Keyboard Esc also skips. */}
          {!isLastPhase && (
            <div className="flex justify-center mt-5">
              <button
                onClick={dismiss}
                className="text-xs font-medium text-white/60 hover:text-white transition-colors underline-offset-4 hover:underline"
              >
                Skip onboarding
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
