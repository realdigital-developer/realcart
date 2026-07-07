'use client'

import React, { ReactNode, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useVisualViewport } from '@/hooks/use-visual-viewport'
import { listAnimations } from '@/components/admin/list-view'

/* ====================================================================== */
/*  Types                                                                  */
/* ====================================================================== */

/**
 * Modal type determines the visual style and default behavior:
 * - "form"  → Create/Edit forms with scrollable body
 * - "view"  → Read-only detail views
 * - "delete" → Confirmation dialog with warning styling
 */
export type AdminModalType = 'form' | 'view' | 'delete'

/**
 * Modal size maps to max-width on desktop:
 * - "sm"  → 400px (simple forms, delete confirmations)
 * - "md"  → 520px (standard forms)
 * - "lg"  → 600px (complex forms with images/grid)
 * - "xl"  → 640px (detail views with lots of content)
 * - "2xl" → 800px (product forms with many sections)
 */
export type AdminModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

export interface AdminModalProps {
  /** Controlled open state */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void

  /** Modal type - affects styling and layout */
  type?: AdminModalType

  /** Modal size - affects max-width on desktop */
  size?: AdminModalSize

  /** Modal title (required for accessibility) */
  title: string

  /** Optional subtitle/description below the title */
  description?: string

  /** Content rendered in the body (scrollable) */
  children: ReactNode

  /** Optional extra content in the header (e.g., status dropdown) */
  headerExtra?: ReactNode

  /** Optional footer content (action buttons) */
  footer?: ReactNode

  /** Whether to show the built-in close button (default: true for "view", false for "form") */
  showCloseButton?: boolean

  /** Additional class for the content area */
  className?: string

  /** Whether the modal content is currently submitting */
  submitting?: boolean

  /**
   * Raw mode: renders children directly without built-in header/body/footer.
   * Use this when the content has its own custom layout (e.g., detail views
   * in AdminListPage). The title is still rendered as sr-only for accessibility.
   */
  raw?: boolean
}

/* ====================================================================== */
/*  Size Mapping                                                           */
/* ====================================================================== */

const SIZE_MAP: Record<AdminModalSize, string> = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[520px]',
  lg: 'sm:max-w-[600px]',
  xl: 'sm:max-w-[640px]',
  '2xl': 'sm:max-w-[800px]',
}

/* ====================================================================== */
/*  Sub-components for layout slots                                        */
/* ====================================================================== */

/** Header section of the modal */
function ModalHeader({
  title,
  description,
  headerExtra,
  type,
  onClose,
}: {
  title: string
  description?: string
  headerExtra?: ReactNode
  type: AdminModalType
  onClose?: () => void
}) {
  return (
    <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border/40 shrink-0">
      <div className="flex-1 min-w-0">
        <h2 className={cn(
          'font-semibold',
          type === 'delete' ? 'text-base' : 'text-lg',
        )}>
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {headerExtra}
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Scrollable body section.
 *
 * Uses flex-1 + min-h-0 so the body fills remaining space inside a
 * flex-col parent and scrolls when content overflows.
 */
function ModalBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('px-5 sm:px-6 py-5 overflow-y-auto flex-1 min-h-0', className)}>
      {children}
    </div>
  )
}

/** Footer section with action buttons */
function ModalFooter({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  if (!children) return null
  return (
    <div className={cn(
      'px-5 sm:px-6 py-4 border-t border-border/40 flex justify-end gap-2 shrink-0',
      className,
    )}>
      {children}
    </div>
  )
}

/* ====================================================================== */
/*  Pre-built Button Components                                            */
/* ====================================================================== */

/** Cancel button for modal footer */
export function ModalCancelButton({
  onClick,
  disabled,
  children = 'Cancel',
}: {
  onClick: () => void
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg min-w-[80px]"
    >
      {children}
    </Button>
  )
}

/** Primary action button (Create/Update/Save) */
export function ModalSubmitButton({
  onClick,
  disabled,
  submitting,
  icon: Icon,
  children = 'Submit',
}: {
  onClick: () => void
  disabled?: boolean
  submitting?: boolean
  icon?: React.ElementType
  children?: ReactNode
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || submitting}
      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg min-w-[100px]"
    >
      {submitting ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
      ) : Icon ? (
        <Icon className="h-4 w-4 mr-1" />
      ) : null}
      {children}
    </Button>
  )
}

/** Delete confirmation button */
export function ModalDeleteButton({
  onClick,
  disabled,
  submitting,
  children = 'Delete',
}: {
  onClick: () => void
  disabled?: boolean
  submitting?: boolean
  children?: ReactNode
}) {
  return (
    <Button
      variant="destructive"
      onClick={onClick}
      disabled={disabled || submitting}
      className="rounded-lg min-w-[100px]"
    >
      {submitting ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
      ) : null}
      {children}
    </Button>
  )
}

/* ====================================================================== */
/*  Delete Confirmation Content                                            */
/* ====================================================================== */

export interface DeleteConfirmProps {
  name: string
  itemName?: string
  warningText?: string
}

/** Pre-built delete confirmation body content */
export function DeleteConfirmContent({
  name,
  itemName = 'item',
  warningText,
}: DeleteConfirmProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 shrink-0 mt-0.5">
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-medium">
          Are you sure you want to delete &quot;{name}&quot;?
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {warningText || `This action cannot be undone. The ${itemName} will be permanently removed.`}
        </p>
      </div>
    </div>
  )
}

/* ====================================================================== */
/*  Mobile: scroll focused input into view                                 */
/* ====================================================================== */

/**
 * On mobile, when the virtual keyboard opens the modal body may
 * extend above the visible viewport.  This hook listens for
 * `focusin` events on the container and manually scrolls the
 * focused input into view inside the scrollable modal body.
 */
function useMobileInputScroll(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement
      if (!target.matches('input, textarea, select, [contenteditable]')) return

      // Find the scrollable modal body inside this container
      const scrollBody = container.querySelector('.overflow-y-auto') as HTMLElement | null
      if (!scrollBody) return

      // Delay to let the keyboard open animation begin and
      // the browser settle on the new viewport dimensions.
      setTimeout(() => {
        const targetRect = target.getBoundingClientRect()
        const bodyRect = scrollBody.getBoundingClientRect()
        const padding = 24 // px of breathing room above/below the input

        if (targetRect.top < bodyRect.top + padding) {
          // Input is above the visible body area — scroll up
          scrollBody.scrollTop -= (bodyRect.top + padding - targetRect.top)
        } else if (targetRect.bottom > bodyRect.bottom - padding) {
          // Input is below the visible body area — scroll down
          scrollBody.scrollTop += (targetRect.bottom - bodyRect.bottom + padding)
        }
      }, 300)
    }

    container.addEventListener('focusin', handleFocusIn)
    return () => container.removeEventListener('focusin', handleFocusIn)
  }, [containerRef])
}

/* ====================================================================== */
/*  Desktop Dialog Implementation                                          */
/* ====================================================================== */

function DesktopModal({
  open,
  onOpenChange,
  type,
  size,
  title,
  description,
  children,
  headerExtra,
  footer,
  showCloseButton,
  className,
  raw,
  viewportHeight,
}: AdminModalProps & { viewportHeight: number; keyboardOffset: number }) {
  const shouldShowClose = showCloseButton ?? (type === 'view')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden rounded-xl',
          SIZE_MAP[size || 'md'],
          className,
        )}
        showCloseButton={shouldShowClose}
        style={{
          display: 'flex',
          flexDirection: 'column' as const,
          maxHeight: viewportHeight
            ? `${viewportHeight * 0.9}px`
            : '90dvh',
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description || `${type === 'delete' ? 'Confirm deletion' : type === 'view' ? 'View details' : 'Form dialog'}`}</DialogDescription>
        {raw ? (
          <>{children}</>
        ) : (
          <motion.div
            variants={listAnimations.modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col min-h-0 flex-1 overflow-hidden"
          >
            <ModalHeader
              title={title}
              description={description}
              headerExtra={headerExtra}
              type={type || 'form'}
              onClose={!shouldShowClose ? () => onOpenChange(false) : undefined}
            />
            <ModalBody>{children}</ModalBody>
            <ModalFooter>{footer}</ModalFooter>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ====================================================================== */
/*  Mobile Drawer Implementation                                           */
/* ====================================================================== */

/**
 * Mobile drawer that handles virtual keyboard correctly.
 *
 * ── The Problem ──
 *
 * The vaul Drawer component manages keyboard behavior internally
 * by setting `style.height` directly on the drawer DOM element.
 * When the keyboard opens, vaul shrinks `style.height`.  When the
 * keyboard closes, vaul tries to restore `style.height` using a
 * cached `initialDrawerHeight` value — but this value can be stale
 * or wrong, causing the drawer to stay permanently short.
 *
 * Our inline `maxHeight` style is ignored because `height` takes
 * precedence over `max-height` when both are set.
 *
 * ── The Fix ──
 *
 * 1. `repositionInputs={false}` — completely disables vaul's
 *    internal `style.height` / `style.bottom` management so it
 *    never touches the drawer's height.
 *
 * 2. We manage the drawer height ourselves using `maxHeight` and
 *    `bottom` inline styles driven by React state:
 *    - `maxHeight = viewportHeight * 0.92` — shrinks when keyboard
 *      opens (viewport shrinks), grows back when keyboard closes
 *    - `bottom = keyboardOffset` — pushes drawer above keyboard
 *      on browsers where `position: fixed; bottom: 0` doesn't
 *      automatically adjust for the keyboard
 *
 * 3. Because we use `maxHeight` (not `height`), the drawer's
 *    actual height is `min(contentHeight, maxHeight)`.  When the
 *    keyboard closes and `maxHeight` increases, the content
 *    naturally expands — no cached height to go stale.
 *
 * 4. `useMobileInputScroll` scrolls focused inputs into view
 *    within the scrollable modal body.
 */
function MobileModal({
  open,
  onOpenChange,
  type,
  title,
  description,
  children,
  headerExtra,
  footer,
  className,
  raw,
  viewportHeight,
  keyboardOffset,
}: AdminModalProps & { viewportHeight: number; keyboardOffset: number }) {
  const drawerRef = useRef<HTMLDivElement>(null)

  // Scroll focused inputs into view when the keyboard opens
  useMobileInputScroll(drawerRef)

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction="bottom"
      shouldScaleBackground={false}
      repositionInputs={false}
    >
      <DrawerContent
        ref={drawerRef}
        className={cn('rounded-t-2xl', className)}
        style={{
          // maxHeight constrains the drawer to 92% of the visual
          // viewport.  When the keyboard opens the viewport shrinks
          // → maxHeight shrinks → drawer shrinks.  When the keyboard
          // closes the viewport grows → maxHeight grows → drawer
          // recovers.  No `style.height` is ever set, so there's
          // no cached height that can go stale.
          maxHeight: viewportHeight
            ? `${viewportHeight * 0.92}px`
            : '92dvh',
          // On some browsers (e.g. Chrome/Android), `position: fixed;
          // bottom: 0` positions relative to the layout viewport, not
          // the visual viewport.  When the keyboard opens, the drawer
          // stays behind the keyboard.  Setting `bottom` to the
          // keyboard offset pushes the drawer up above the keyboard.
          // When the keyboard closes, offset goes back to 0 and the
          // CSS class `bottom-0` takes effect.
          ...(keyboardOffset > 0 ? { bottom: `${keyboardOffset}px` } : {}),
        }}
      >
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">{description || `${type === 'delete' ? 'Confirm deletion' : type === 'view' ? 'View details' : 'Form dialog'}`}</DrawerDescription>
        {raw ? (
          <>{children}</>
        ) : (
          <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
            <ModalHeader
              title={title}
              description={description}
              headerExtra={headerExtra}
              type={type || 'form'}
              onClose={() => onOpenChange(false)}
            />
            <ModalBody>{children}</ModalBody>
            <ModalFooter>{footer}</ModalFooter>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/* ====================================================================== */
/*  Main AdminModal Component                                              */
/* ====================================================================== */

/**
 * Responsive modal component for the admin panel.
 *
 * - On desktop (≥768px): Renders as a centered Dialog
 * - On mobile (<768px): Renders as a bottom Drawer
 *
 * Uses flex-based layout internally so the body fills remaining space
 * and scrolls naturally.
 *
 * ── Viewport / keyboard handling (mobile) ──
 *
 * `useVisualViewport()` returns the real `visualViewport.height` and
 * the keyboard offset as React state.  These drive inline `maxHeight`
 * and `bottom` styles on the Drawer content.
 *
 * Crucially, `repositionInputs={false}` is set on the vaul Drawer to
 * disable its built-in keyboard handling.  Vaul manages keyboard
 * behavior by setting `style.height` directly on the DOM element,
 * which overrides our `maxHeight` and caches a stale height value —
 * the drawer stays short after the keyboard closes.
 *
 * By disabling vaul's handling and using `maxHeight` instead of
 * `height`, the drawer's actual height is always
 * `min(contentHeight, maxHeight)`.  When the keyboard closes,
 * `maxHeight` increases via React state → the drawer naturally
 * expands.  No cached height, no recovery bug.
 *
 * Usage:
 * ```tsx
 * <AdminModal
 *   open={createOpen}
 *   onOpenChange={setCreateOpen}
 *   type="form"
 *   size="md"
 *   title="Create Tag"
 *   description="Add a new product tag"
 *   footer={
 *     <>
 *       <ModalCancelButton onClick={() => setCreateOpen(false)} />
 *       <ModalSubmitButton onClick={handleCreate} submitting={submitting} icon={Plus}>
 *         Create
 *       </ModalSubmitButton>
 *     </>
 *   }
 * >
 *   {/* Form fields *\/}
 * </AdminModal>
 * ```
 */
export default function AdminModal(props: AdminModalProps) {
  const isMobile = useIsMobile()

  // useVisualViewport returns the visual viewport height and keyboard
  // offset as React state, AND sets the --vvh CSS variable on <html>
  // as a fallback for any CSS-class-based consumers.
  const { viewportHeight, keyboardOffset } = useVisualViewport()

  if (isMobile) {
    return <MobileModal {...props} viewportHeight={viewportHeight} keyboardOffset={keyboardOffset} />
  }

  return <DesktopModal {...props} viewportHeight={viewportHeight} keyboardOffset={keyboardOffset} />
}

/* ====================================================================== */
/*  Convenience Wrapper: AdminDeleteModal                                  */
/* ====================================================================== */

export interface AdminDeleteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  itemName: string
  name: string
  warningText?: string
  submitting?: boolean
  onDelete: () => void
  onCancel: () => void
}

/**
 * Pre-built delete confirmation modal.
 * Includes the warning icon, message, and Cancel/Delete buttons.
 */
export function AdminDeleteModal({
  open,
  onOpenChange,
  title,
  itemName,
  name,
  warningText,
  submitting,
  onDelete,
  onCancel,
}: AdminDeleteModalProps) {
  return (
    <AdminModal
      open={open}
      onOpenChange={onOpenChange}
      type="delete"
      size="sm"
      title={title || `Delete ${itemName}`}
      footer={
        <>
          <ModalCancelButton onClick={onCancel} disabled={submitting} />
          <ModalDeleteButton onClick={onDelete} submitting={submitting} />
        </>
      }
    >
      <DeleteConfirmContent
        name={name}
        itemName={itemName}
        warningText={warningText}
      />
    </AdminModal>
  )
}
