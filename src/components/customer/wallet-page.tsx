'use client'

/**
 * Customer RealCart Balance Page — Meesho-style wallet
 * ------------------------------------------------------------------
 * Meesho behavior: customers CANNOT manually add/load money to their
 * wallet. The balance only grows from:
 *   - Referral rewards (when a referred friend's first order is delivered)
 *   - Promotional cashback / bonuses (admin-issued)
 *   - Refunds (when an order is cancelled or returned)
 *
 * The balance can be SPENT at checkout (RealCart Balance appears as a
 * payment method). It is non-transferable and cannot be withdrawn.
 *
 * Sections:
 *   1. Balance hero card (gradient, balance display)
 *   2. "How you earn balance" guide (referral / promotion / refund)
 *   3. Quick stats (total credited / total spent)
 *   4. Transaction history (credit/debit list with icons + filters)
 */

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  ShoppingBag,
  RefreshCw,
  TrendingUp,
  Info,
  AlertCircle,
  Sparkles,
  Users,
  Tag,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from './page-header'

interface WalletTransaction {
  id: string
  type: 'credit' | 'debit'
  source: string
  amount: number
  description: string
  orderId: string | null
  referralId: string | null
  status: string
  createdAt: string
}

interface WalletPageProps {
  onBack?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function WalletPage({ onBack, onNavigate }: WalletPageProps) {
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/customer/wallet')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setBalance(data.balance || 0)
      setTransactions(data.transactions || [])
      setError(null)
    } catch {
      setError('Failed to load wallet data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return ''
    }
  }

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const formatPrice = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  const filteredTxns = transactions.filter((t) => filter === 'all' || t.type === filter)

  // Total Credited / Total Spent — Meesho-style smart calculation.
  //
  // Total Credited: Only GENUINE income counts — referral rewards, cashback,
  //   bonuses, topups. Refunds are EXCLUDED because they simply reverse a
  //   prior purchase (the money went out and came back — not real income).
  //
  // Total Spent: Only GENUINE spending counts — purchases that were NOT
  //   refunded. When a purchase is refunded, the net spending for that order
  //   is zero, so we subtract refunds from total purchases. This ensures
  //   that refunded orders don't inflate the "total spent" figure.
  //   Example: 3 purchases of ₹50 (₹150 total) + 2 refunds of ₹50 (₹100)
  //   → Total Spent = ₹150 − ₹100 = ₹50 (only the non-refunded purchase).
  //
  // This matches Meesho/Flipkart wallet behavior where refunds net out
  // the corresponding purchases in the spending total.
  const totalCredited = transactions
    .filter((t) => t.type === 'credit' && t.source !== 'refund')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalPurchases = transactions
    .filter((t) => t.type === 'debit' && t.source === 'purchase')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalRefunds = transactions
    .filter((t) => t.type === 'credit' && t.source === 'refund')
    .reduce((sum, t) => sum + t.amount, 0)
  // Net spending = purchases − refunds (refunded purchases are netted out)
  const totalDebited = Math.max(0, totalPurchases - totalRefunds)

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader
        title="RealCart Balance"
        onBack={onBack}
        onNavigate={onNavigate}
        headerExtra={
          <button onClick={fetchData} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4 text-gray-500', loading && 'animate-spin')} />
          </button>
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-4">
            <div className="h-44 bg-white dark:bg-gray-900 rounded-3xl animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-20 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
              <div className="h-20 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
            </div>
            <div className="h-64 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{error}</p>
            <button onClick={fetchData} className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-500 hover:bg-emerald-600">Retry</button>
          </div>
        ) : (
          <div className="p-4 space-y-4 pb-8">
            {/* ── Balance Hero Card ── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-5 text-white shadow-lg"
            >
              {/* Decorative circles */}
              <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10" />
              <div className="absolute -bottom-16 -left-8 h-32 w-32 rounded-full bg-white/10" />

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-white/90 uppercase tracking-wider">RealCart Balance</span>
                </div>
                <p className="text-3xl font-black tracking-tight">{formatPrice(balance)}</p>
                <p className="text-[11px] text-white/70 mt-1">Available to spend on your next order</p>
              </div>
            </motion.div>

            {/* ── How you earn balance (Meesho-style: no manual top-up) ── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                How You Earn Balance
              </h3>
              <div className="space-y-2.5">
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 flex-shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Referral Rewards</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">Earn rewards when friends you invite place their first order</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
                    <Tag className="h-4 w-4" />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Promotions & Cashback</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">Get cashback and bonuses from promotional offers</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                    <RotateCcw className="h-4 w-4" />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Refunds</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">Cancelled or returned order refunds are credited here</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Shop & Pay</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">Use your balance at checkout for instant, hassle-free payments</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Quick Stats ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 border border-gray-100 dark:border-gray-800">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200 leading-none">{formatPrice(totalCredited)}</p>
                <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">Total Credited</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 border border-gray-100 dark:border-gray-800">
                <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-2">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200 leading-none">{formatPrice(totalDebited)}</p>
                <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">Total Spent</p>
              </div>
            </div>

            {/* ── Transaction History ── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-50 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Transaction History
                </h3>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  {(['all', 'credit', 'debit'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors capitalize',
                        filter === f
                          ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400'
                      )}
                    >
                      {f === 'all' ? 'All' : f === 'credit' ? 'In' : 'Out'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTxns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                    <Wallet className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {filter === 'all' ? 'No transactions yet' : filter === 'credit' ? 'No credits yet' : 'No debits yet'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {filter === 'all'
                      ? 'Earn referral rewards or get refunds to build your balance'
                      : 'Transactions will appear here'}
                  </p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                  {filteredTxns.map((txn, idx) => (
                    <TransactionRow
                      key={txn.id}
                      txn={txn}
                      formatDate={formatDate}
                      formatTime={formatTime}
                      formatPrice={formatPrice}
                      index={idx}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Info note ── */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/20">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 dark:text-blue-400 leading-relaxed">
                RealCart Balance is earned through referral rewards, promotional cashback, and refunds — it cannot be loaded manually. Use it for purchases at checkout. Balance is non-transferable and cannot be withdrawn to bank accounts.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Transaction Row sub-component ──
function TransactionRow({
  txn,
  formatDate,
  formatTime,
  formatPrice,
  index,
}: {
  txn: WalletTransaction
  formatDate: (iso: string) => string
  formatTime: (iso: string) => string
  formatPrice: (n: number) => string
  index: number
}) {
  const isCredit = txn.type === 'credit'

  // Icon + color based on source
  const getIcon = () => {
    switch (txn.source) {
      case 'referral':
        return <Users className="h-4 w-4" />
      case 'purchase':
        return <ShoppingBag className="h-4 w-4" />
      case 'refund':
        return <RotateCcw className="h-4 w-4" />
      case 'cashback':
        return <Tag className="h-4 w-4" />
      case 'bonus':
        return <Gift className="h-4 w-4" />
      case 'adjustment':
        return <RefreshCw className="h-4 w-4" />
      default:
        return isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />
    }
  }

  const iconBg = isCredit
    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
    : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="flex items-center gap-3 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
    >
      <div className={cn('h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0', iconBg)}>
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{txn.description}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {formatDate(txn.createdAt)} • {formatTime(txn.createdAt)}
          {txn.orderId && <span className="ml-1">• {txn.orderId}</span>}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={cn(
          'text-sm font-bold',
          isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
        )}>
          {isCredit ? '+' : '−'}{formatPrice(txn.amount)}
        </p>
        <p className="text-[9px] text-gray-400 uppercase tracking-wide">{txn.source}</p>
      </div>
    </motion.div>
  )
}
