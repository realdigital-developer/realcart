'use client'

/**
 * Reusable Modal Component — Customer Panel
 * ------------------------------------------------------------------
 * A common modal/dialog wrapper built on top of shadcn/ui Dialog.
 * Provides consistent styling across the app:
 *   - Rounded-3xl corners, no border, shadow-2xl
 *   - Optional gradient header with title, subtitle, and close button
 *   - Scrollable body (max-h-[90dvh])
 *   - sr-only title + description for accessibility
 *   - showCloseButton prop (defaults to false — custom close in header)
 *
 * Usage:
 *   <Modal
 *     open={isOpen}
 *     onClose={() => setOpen(false)}
 *     title="Payment Details"
 *     description="View payment info"
 *     headerGradient="from-emerald-500 to-teal-500"
 *     headerIcon={<CreditCard className="h-4 w-4 text-white" />}
 *     headerTitle="UPI • name@upi"
 *     headerSubtitle="₹499"
 *   >
 *     {/* body content *\/}
 *   </Modal>
 */

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  /** sr-only title for accessibility (required by Radix Dialog) */
  title: string
  /** sr-only description for accessibility */
  description?: string
  /** Show the default close button in the top-right (default: false) */
  showDefaultClose?: boolean
  /** Max width class (default: max-w-[400px]) */
  maxWidth?: string
  children: ReactNode
  /** Optional header content (rendered above the body with a gradient bg) */
  header?: ReactNode
  /** Header gradient classes (e.g., "from-emerald-500 to-teal-500") */
  headerGradient?: string
}

export function Modal({
  open,
  onClose,
  title,
  description,
  showDefaultClose = false,
  maxWidth = 'max-w-[400px]',
  children,
  header,
  headerGradient,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className={cn(
          'p-0 overflow-hidden rounded-3xl gap-0 border-0 bg-white dark:bg-gray-900 shadow-2xl',
          'max-h-[90dvh] overflow-y-auto',
          maxWidth,
        )}
        showCloseButton={showDefaultClose}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {description && <DialogDescription className="sr-only">{description}</DialogDescription>}

        {/* Optional gradient header */}
        {header && (
          <div className={cn(
            'relative overflow-hidden px-5 pt-5 pb-4',
            headerGradient && `bg-gradient-to-br ${headerGradient}`,
          )}>
            {/* Custom close button (top-right) */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors z-10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {header}
          </div>
        )}

        {/* Body */}
        {children}
      </DialogContent>
    </Dialog>
  )
}
