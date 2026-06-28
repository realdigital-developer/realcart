'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Download,
  Mail,
  Loader2,
  FileText,
  CheckCircle,
  AlertCircle,
  Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/* ------------------------------------------------------------------ */
/*  Credit Note Dialog — Full-screen credit note viewer                 */
/*  ------------------------------------------------------------------ */
/*  A credit note is the GST-compliant document that REVERSES a tax     */
/*  invoice when an order is cancelled. This dialog lets the customer   */
/*  view, download (PDF), print, and resend the credit note email.      */
/* -------------------------------------------------------------------- */

interface CreditNoteDialogProps {
  isOpen: boolean
  onClose: () => void
  orderId: string
  creditNoteNumber?: string
  customerEmail?: string
}

export function CreditNoteDialog({
  isOpen,
  onClose,
  orderId,
  creditNoteNumber,
  customerEmail,
}: CreditNoteDialogProps) {
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [iframeRef, setIframeRef] = useState<HTMLIFrameElement | null>(null)
  const printRef = useRef<HTMLIFrameElement | null>(null)

  // Load credit note HTML into iframe
  useEffect(() => {
    if (!isOpen || !orderId) return

    setLoading(true)
    setError('')
    setSuccess('')

    // Use a timestamp to avoid cache
    const url = `/api/customer/credit-notes/${orderId}?format=html&_t=${Date.now()}`

    // Fetch the HTML and inject into iframe via srcdoc (works better for cross-origin)
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load credit note')
        }
        const html = await res.text()
        if (iframeRef) {
          iframeRef.srcdoc = html
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Credit note load error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load credit note. Please try again.')
        setLoading(false)
      })
  }, [isOpen, orderId, iframeRef])

  const handleDownload = async () => {
    setDownloading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/customer/credit-notes/${orderId}?action=download&_t=${Date.now()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to download credit note')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CreditNote-${creditNoteNumber || orderId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess('Credit note downloaded successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Credit note download error:', err)
      setError(err instanceof Error ? err.message : 'Failed to download credit note. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const handleResendEmail = async () => {
    setSending(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/customer/credit-notes/${orderId}/resend`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email')
      }
      setSuccess(data.message || 'Credit note sent to your email')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send email'
      setError(msg)
      setTimeout(() => setError(''), 4000)
    } finally {
      setSending(false)
    }
  }

  const handlePrint = () => {
    if (printRef.current?.contentWindow) {
      try {
        printRef.current.contentWindow.focus()
        printRef.current.contentWindow.print()
      } catch (err) {
        console.error('Print error:', err)
        setError('Unable to print. Please use the Download button instead.')
      }
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 flex flex-col"
      >
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex-shrink-0 safe-top"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-500" />
                Credit Note
              </h2>
              {creditNoteNumber && (
                <p className="text-[11px] font-mono text-gray-400 truncate">{creditNoteNumber}</p>
              )}
            </div>
          </div>

          {/* Success / Error messages */}
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/20"
              >
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-xs text-green-700 dark:text-green-400">{success}</span>
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20"
              >
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Credit note content */}
        <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900 relative">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <p className="text-sm text-gray-500">Loading credit note...</p>
            </div>
          )}
          <iframe
            ref={(el) => {
              setIframeRef(el)
              printRef.current = el
            }}
            title="Credit Note"
            className="w-full h-full border-0 bg-white"
            style={{ minHeight: '100%' }}
          />
        </div>

        {/* Action footer */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 px-4 py-3 flex-shrink-0 safe-bottom"
        >
          <div className="flex gap-2 max-w-3xl mx-auto">
            <Button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white h-11"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="ml-1.5 font-semibold text-sm">Download PDF</span>
            </Button>
            <Button
              onClick={handleResendEmail}
              disabled={sending}
              variant="outline"
              className="h-11 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span className="ml-1.5 font-semibold text-sm hidden sm:inline">
                {customerEmail ? 'Resend' : 'Email'}
              </span>
            </Button>
            <Button
              onClick={handlePrint}
              variant="outline"
              className="h-11 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 px-3"
              title="Print"
            >
              <Printer className="h-4 w-4" />
            </Button>
          </div>
          {customerEmail && (
            <p className="text-center text-[10px] text-gray-400 mt-2">
              Credit note will be sent to <span className="font-medium text-gray-500">{customerEmail}</span>
            </p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Credit Note Button — Small button to open the credit note dialog    */
/* ------------------------------------------------------------------ */

interface CreditNoteButtonProps {
  orderId: string
  creditNoteNumber?: string
  customerEmail?: string
  variant?: 'full' | 'compact' | 'icon'
  className?: string
}

export function CreditNoteButton({
  orderId,
  creditNoteNumber,
  customerEmail,
  variant = 'compact',
  className,
}: CreditNoteButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'full' && (
        <Button
          onClick={() => setOpen(true)}
          variant="outline"
          className={cn(
            'flex-1 border-amber-200 dark:border-amber-800 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 h-11',
            className,
          )}
        >
          <FileText className="h-4 w-4" />
          <span className="ml-1.5 font-semibold text-sm">View Credit Note</span>
        </Button>
      )}
      {variant === 'compact' && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'flex items-center gap-1.5 text-amber-600 hover:text-amber-700 text-xs font-semibold transition-colors px-2 py-1 rounded',
            className,
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          Credit Note
        </button>
      )}
      {variant === 'icon' && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'h-8 w-8 flex items-center justify-center rounded-full text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors',
            className,
          )}
          title="View Credit Note"
        >
          <FileText className="h-4 w-4" />
        </button>
      )}
      <CreditNoteDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        orderId={orderId}
        creditNoteNumber={creditNoteNumber}
        customerEmail={customerEmail}
      />
    </>
  )
}
