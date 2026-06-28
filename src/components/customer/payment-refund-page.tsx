'use client'

/**
 * Payment & Refund Page — Customer Panel
 * ------------------------------------------------------------------
 * Shows all payment transactions and refunds for the logged-in customer.
 * Clicking a payment card opens a detail dialog showing full order +
 * payment info (items, transaction IDs, payment method, amounts).
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, RotateCcw, RefreshCw, Package, CheckCircle2, Clock, XCircle, Banknote, Smartphone, Wallet, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import AdminModal from '@/components/admin/admin-modal'
import { PageHeader } from './page-header'

interface PaymentItem {
  name: string
  imageUrl: string
  quantity: number
}

interface Payment {
  id: string
  paymentOrderId: string
  razorpayOrderId: string
  razorpayPaymentId: string
  orderId: string
  orderNumber: string
  amount: number
  currency: string
  method: string
  status: string
  bank: string
  wallet: string
  vpa: string
  cardNetwork: string
  cardLast4: string
  createdAt: string
  paidAt: string | null
  failedAt: string | null
  failureReason: string | null
  items: PaymentItem[]
}

interface Refund {
  id: string
  refundId: string
  orderId: string
  orderNumber: string
  amount: number
  reason: string
  status: string
  refundType: string
  paymentMethod: string
  initiatedBy: string
  gatewayRefundId: string
  createdAt: string
  processedAt: string | null
  failureReason: string | null
  items: PaymentItem[]
}

interface PaymentRefundPageProps {
  onBack?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function PaymentRefundPage({ onBack, onNavigate }: PaymentRefundPageProps) {
  const [activeTab, setActiveTab] = useState<'payments' | 'refunds'>('payments')
  const [payments, setPayments] = useState<Payment[]>([])
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [summary, setSummary] = useState({ totalSpent: 0, totalRefunded: 0, paymentCount: 0, refundCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/customer/payments')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        if (!cancelled) {
          setPayments(data.payments || [])
          setRefunds(data.refunds || [])
          setSummary(data.summary || { totalSpent: 0, totalRefunded: 0, paymentCount: 0, refundCount: 0 })
          setError(null)
        }
      } catch {
        if (!cancelled) setError('Failed to load payment data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const formatPrice = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' }
  }
  const formatDateTime = (iso: string) => {
    try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
  }

  const getMethodIcon = (method: string) => {
    const m = method.toLowerCase()
    if (m === 'cod' || m === 'cash') return <Banknote className="h-4 w-4" />
    if (m === 'upi') return <Smartphone className="h-4 w-4" />
    if (m === 'card') return <CreditCard className="h-4 w-4" />
    if (m === 'wallet') return <Wallet className="h-4 w-4" />
    if (m === 'netbanking') return <Banknote className="h-4 w-4" />
    return <CreditCard className="h-4 w-4" />
  }

  const getMethodLabel = (p: Payment) => {
    const m = p.method.toLowerCase()
    if (m === 'cod') return 'Cash on Delivery'
    if (m === 'upi') return `UPI${p.vpa ? ' • ' + p.vpa : ''}`
    if (m === 'card') return `Card${p.cardNetwork ? ' • ' + p.cardNetwork : ''}${p.cardLast4 ? ' ****' + p.cardLast4 : ''}`
    if (m === 'wallet') return `Wallet${p.wallet ? ' • ' + p.wallet : ''}`
    if (m === 'netbanking') return `Net Banking${p.bank ? ' • ' + p.bank : ''}`
    return p.method || 'Online Payment'
  }

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase()
    if (s === 'paid' || s === 'processed' || s === 'completed')
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> Success</span>
    if (s === 'pending' || s === 'initiated' || s === 'created')
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full"><Clock className="h-3 w-3" /> Pending</span>
    if (s === 'failed' || s === 'rejected')
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" /> Failed</span>
    if (s === 'refunded')
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full"><RotateCcw className="h-3 w-3" /> Refunded</span>
    return <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full capitalize">{status}</span>
  }

  // ── Detail row helper for the dialog ──
  const DetailRow = ({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) => {
    if (!value || value === '—') return null
    return (
      <div className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
        <span className="text-[11px] text-gray-400 flex-shrink-0">{label}</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate text-right">{value}</span>
          {copyable && (
            <button
              onClick={() => navigator.clipboard?.writeText(value)}
              className="text-emerald-500 hover:text-emerald-600 flex-shrink-0"
              aria-label="Copy"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h4a2 2 0 002-2M8 5a2 2 0 012-2h4a2 2 0 012 2m0 0h2a2 2 0 012 2v3" /></svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader title="Payment & Refund" onBack={onBack} onNavigate={onNavigate} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 bg-white dark:bg-gray-900 rounded-xl animate-pulse border border-gray-100 dark:border-gray-800" />)}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white dark:bg-gray-900 rounded-2xl animate-pulse border border-gray-100 dark:border-gray-800" />)}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="px-4 pt-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Total Spent</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-1">{formatPrice(summary.totalSpent)}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Total Refunded</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatPrice(summary.totalRefunded)}</p>
                </div>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="px-4 pt-4">
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                <button onClick={() => setActiveTab('payments')} className={cn('flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5', activeTab === 'payments' ? 'bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400')}>
                  <CreditCard className="h-3.5 w-3.5" /> Payments ({payments.length})
                </button>
                <button onClick={() => setActiveTab('refunds')} className={cn('flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5', activeTab === 'refunds' ? 'bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400')}>
                  <RotateCcw className="h-3.5 w-3.5" /> Refunds ({refunds.length})
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className="p-4">
              <AnimatePresence mode="wait">
                {activeTab === 'payments' ? (
                  <motion.div key="payments" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-3">
                    {payments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4"><CreditCard className="h-8 w-8 text-gray-300 dark:text-gray-600" /></div>
                        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">No payments yet</p>
                        <p className="text-xs text-gray-400 mt-1">Your payment history will appear here</p>
                      </div>
                    ) : (
                      payments.map((payment, i) => (
                        <motion.div
                          key={payment.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.03 }}
                          onClick={() => setSelectedPayment(payment)}
                          className="bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-sm transition-all cursor-pointer"
                        >
                          {/* Top row: product image avatar + product name + order ID + status */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="h-10 w-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                                {payment.items[0]?.imageUrl ? <img src={payment.items[0].imageUrl} alt={payment.items[0].name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-5 w-5 text-gray-300" /></div>}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-1">{payment.items.length > 0 ? payment.items.map(it => it.name).join(', ') : getMethodLabel(payment)}</p>
                                {payment.orderNumber && <p className="text-[10px] text-gray-400">Order: {payment.orderNumber}</p>}
                              </div>
                            </div>
                            {getStatusBadge(payment.status)}
                          </div>
                          {/* Bottom row: method + transaction ID + amount + date */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-gray-800">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">{getMethodIcon(payment.method)}</span>
                              <span className="text-[10px] text-gray-400 truncate">{payment.razorpayPaymentId || payment.paymentOrderId || getMethodLabel(payment)}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatPrice(payment.amount)}</span>
                              <span className="text-[10px] text-gray-400">{formatDate(payment.createdAt)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="refunds" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-3">
                    {refunds.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4"><RotateCcw className="h-8 w-8 text-gray-300 dark:text-gray-600" /></div>
                        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">No refunds yet</p>
                        <p className="text-xs text-gray-400 mt-1">Your refund history will appear here</p>
                      </div>
                    ) : (
                      refunds.map((refund, i) => (
                        <motion.div
                          key={refund.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.03 }}
                          onClick={() => setSelectedRefund(refund)}
                          className="bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 hover:border-amber-200 dark:hover:border-amber-800 hover:shadow-sm transition-all cursor-pointer"
                        >
                          {/* Top row: product image avatar + refund reason + order ID + status */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {/* Product image avatar — same as payment card */}
                              <div className="h-10 w-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                                {refund.items[0]?.imageUrl ? (
                                  <img src={refund.items[0].imageUrl} alt={refund.items[0].name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Package className="h-5 w-5 text-gray-300" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                {/* Refund reason as heading */}
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-1">
                                  {refund.reason || refund.refundId || 'Refund'}
                                </p>
                                {/* Order ID as subheading */}
                                {refund.orderNumber && (
                                  <p className="text-[10px] text-gray-400">Order: {refund.orderNumber}</p>
                                )}
                              </div>
                            </div>
                            {getStatusBadge(refund.status)}
                          </div>

                          {/* Bottom row: refund icon + refund ID + amount + date */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-gray-800">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-amber-600 dark:text-amber-400 flex-shrink-0"><RotateCcw className="h-4 w-4" /></span>
                              <span className="text-[10px] text-gray-400 truncate">{refund.refundId || refund.gatewayRefundId || 'Refund'}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">-{formatPrice(refund.amount)}</span>
                              <span className="text-[10px] text-gray-400">{formatDate(refund.createdAt)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* ── Payment Detail Modal (using existing reusable AdminModal) ──
          Opens when a payment card is clicked. Shows full order + payment
          details: items, transaction IDs, payment method, amounts, dates.
          Uses the same AdminModal component that's used everywhere in the
          admin panel — responsive (Drawer on mobile, Dialog on desktop). */}
      <AdminModal
        open={!!selectedPayment}
        onOpenChange={(o) => { if (!o) setSelectedPayment(null) }}
        type="view"
        size="sm"
        title="Payment Details"
        description={selectedPayment ? `${getMethodLabel(selectedPayment)} • ${formatPrice(selectedPayment.amount)}` : 'View payment and order details'}
        headerExtra={selectedPayment ? (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              {getMethodIcon(selectedPayment.method)}
            </div>
            {getStatusBadge(selectedPayment.status)}
          </div>
        ) : null}
      >
        {selectedPayment && (
          <div className="space-y-4">
            {/* Order items */}
            {selectedPayment.items.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <ShoppingBag className="h-3 w-3" /> Items ({selectedPayment.items.length})
                </p>
                <div className="space-y-2">
                  {selectedPayment.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 text-gray-300 m-2.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{item.name}</p>
                        <p className="text-[10px] text-gray-400">Qty: {item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment details */}
            <div>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <CreditCard className="h-3 w-3" /> Payment Details
              </p>
              <DetailRow label="Order Number" value={selectedPayment.orderNumber || '—'} copyable />
              <DetailRow label="Transaction ID" value={selectedPayment.razorpayPaymentId || '—'} copyable />
              <DetailRow label="Payment Order ID" value={selectedPayment.paymentOrderId || '—'} copyable />
              <DetailRow label="Razorpay Order ID" value={selectedPayment.razorpayOrderId || '—'} copyable />
              <DetailRow label="Payment Method" value={getMethodLabel(selectedPayment)} />
              {selectedPayment.vpa && <DetailRow label="UPI ID" value={selectedPayment.vpa} copyable />}
              {selectedPayment.cardNetwork && <DetailRow label="Card Network" value={selectedPayment.cardNetwork} />}
              {selectedPayment.cardLast4 && <DetailRow label="Card Last 4" value={'**** ' + selectedPayment.cardLast4} />}
              {selectedPayment.bank && <DetailRow label="Bank" value={selectedPayment.bank} />}
              {selectedPayment.wallet && <DetailRow label="Wallet" value={selectedPayment.wallet} />}
              <DetailRow label="Amount" value={formatPrice(selectedPayment.amount)} />
              <DetailRow label="Status" value={selectedPayment.status} />
              <DetailRow label="Date" value={formatDateTime(selectedPayment.createdAt)} />
              {selectedPayment.paidAt && <DetailRow label="Paid At" value={formatDateTime(selectedPayment.paidAt)} />}
              {selectedPayment.failureReason && <DetailRow label="Failure Reason" value={selectedPayment.failureReason} />}
            </div>
          </div>
        )}
      </AdminModal>

      {/* ── Refund Detail Modal (same AdminModal pattern) ── */}
      <AdminModal
        open={!!selectedRefund}
        onOpenChange={(o) => { if (!o) setSelectedRefund(null) }}
        type="view"
        size="sm"
        title="Refund Details"
        description={selectedRefund ? `${selectedRefund.refundType} refund • ${formatPrice(selectedRefund.amount)}` : 'View refund details'}
        headerExtra={selectedRefund ? (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <RotateCcw className="h-4 w-4" />
            </div>
            {getStatusBadge(selectedRefund.status)}
          </div>
        ) : null}
      >
        {selectedRefund && (
          <div className="space-y-4">
            {/* Order items */}
            {selectedRefund.items.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <ShoppingBag className="h-3 w-3" /> Items ({selectedRefund.items.length})
                </p>
                <div className="space-y-2">
                  {selectedRefund.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 text-gray-300 m-2.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{item.name}</p>
                        <p className="text-[10px] text-gray-400">Qty: {item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Refund details */}
            <div>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3" /> Refund Details
              </p>
              <DetailRow label="Refund ID" value={selectedRefund.refundId || '—'} copyable />
              <DetailRow label="Order Number" value={selectedRefund.orderNumber || '—'} copyable />
              {selectedRefund.gatewayRefundId && <DetailRow label="Gateway Refund ID" value={selectedRefund.gatewayRefundId} copyable />}
              <DetailRow label="Refund Type" value={selectedRefund.refundType} />
              <DetailRow label="Payment Method" value={selectedRefund.paymentMethod === 'cod' ? 'Cash on Delivery' : selectedRefund.paymentMethod} />
              {selectedRefund.reason && <DetailRow label="Reason" value={selectedRefund.reason} />}
              <DetailRow label="Amount" value={`-${formatPrice(selectedRefund.amount)}`} />
              <DetailRow label="Status" value={selectedRefund.status} />
              {selectedRefund.initiatedBy && <DetailRow label="Initiated By" value={selectedRefund.initiatedBy} />}
              <DetailRow label="Date" value={formatDateTime(selectedRefund.createdAt)} />
              {selectedRefund.processedAt && <DetailRow label="Processed At" value={formatDateTime(selectedRefund.processedAt)} />}
              {selectedRefund.failureReason && <DetailRow label="Failure Reason" value={selectedRefund.failureReason} />}
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  )
}
