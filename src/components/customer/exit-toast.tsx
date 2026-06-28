'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { useLanguage } from '@/components/providers/language-provider'

/**
 * ExitToast
 * ---------
 * A soft, smooth toast that appears at the bottom of the screen when the
 * user presses the back button on the customer home tab. Shows the message
 * "Press back again to exit" with a subtle icon and auto-fades out.
 *
 * This is a CUSTOM toast — separate from the shadcn/ui Toaster (which is
 * used for app notifications like "Item added to cart"). Using a custom
 * toast keeps the exit-prompt visually distinct and avoids conflicts with
 * the notification system.
 *
 * Props:
 *   - visible: boolean — whether the toast should be shown
 *
 * Animation:
 *   - Enter: slides up from bottom + fades in (200ms, spring)
 *   - Exit: slides down + fades out (200ms, ease-out)
 *   - Uses framer-motion for smooth, GPU-accelerated transitions
 *
 * Styling:
 *   - Glassmorphic dark pill (works on any background — the customer panel
 *     has various gradients and light backgrounds)
 *   - Centered at the bottom, above the bottom navbar (bottom-24 = 96px)
 *   - Pointer-events: none so it doesn't block interaction with content
 *     behind it
 *
 * Accessibility:
 *   - role="status" so screen readers announce the message
 *   - aria-live="polite" so the announcement doesn't interrupt
 *   - The icon is decorative (aria-hidden)
 */
export function ExitToast({ visible }: { visible: boolean }) {
  const { t } = useLanguage()
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{
            type: 'spring',
            stiffness: 350,
            damping: 28,
            duration: 0.2,
          }}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 rounded-full bg-gray-900/90 backdrop-blur-md px-5 py-3 shadow-2xl shadow-black/20 border border-white/10"
        >
          <LogOut className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" strokeWidth={2.5} />
          <span className="text-sm font-medium text-white whitespace-nowrap">
            {t('exitToast.pressBackAgain')}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
