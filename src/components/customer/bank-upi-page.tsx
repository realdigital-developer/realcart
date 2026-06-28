'use client'

/**
 * Bank & UPI Details Page — Customer Panel
 * ------------------------------------------------------------------
 * Shows all saved bank accounts and UPI IDs for the customer.
 * Meesho-style UI with:
 *   - Tabs: Bank Accounts | UPI IDs
 *   - Add new bank account / UPI ID (via AdminModal)
 *   - Set default payment method
 *   - Delete payment method (with confirmation)
 *   - Loading skeleton + empty states
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Banknote, Smartphone, Star, Trash2, CheckCircle2, Landmark, X, CreditCard, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import AdminModal from '@/components/admin/admin-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from './page-header'
import { useLanguage } from '@/components/providers/language-provider'

interface PaymentMethod {
  id: string
  type: 'bank' | 'upi' | 'card' | 'netbanking' | 'wallet'
  accountNumber: string
  ifscCode: string
  bankName: string
  accountHolderName: string
  accountType: string
  bankCode: string
  upiId: string
  upiName: string
  cardLast4: string
  cardNetwork: string
  cardType: string
  nickname: string
  walletProvider: string
  label: string
  isDefault: boolean
  createdAt: string
}

interface BankUpiPageProps {
  onBack?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function BankUpiPage({ onBack, onNavigate }: BankUpiPageProps) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'bank' | 'upi' | 'card' | 'netbanking' | 'wallet'>('bank')
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addType, setAddType] = useState<'bank' | 'upi' | 'card' | 'netbanking' | 'wallet'>('bank')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form state
  const [accountNumber, setAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountType, setAccountType] = useState('savings')
  const [upiId, setUpiId] = useState('')
  const [upiName, setUpiName] = useState('')

  useEffect(() => {
    fetchMethods()
  }, [])

  const fetchMethods = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/customer/bank-upi')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setMethods(data.paymentMethods || [])
      setError(null)
    } catch {
      setError('Failed to load payment methods')
    } finally {
      setLoading(false)
    }
  }

  const bankAccounts = methods.filter((m) => m.type === 'bank')
  const upiIds = methods.filter((m) => m.type === 'upi')
  const cards = methods.filter((m) => m.type === 'card')
  const netbankingMethods = methods.filter((m) => m.type === 'netbanking')
  const wallets = methods.filter((m) => m.type === 'wallet')

  const handleOpenAdd = (type: 'bank' | 'upi' | 'card' | 'netbanking' | 'wallet') => {
    setAddType(type)
    setFormError(null)
    setAccountNumber('')
    setIfscCode('')
    setBankName('')
    setAccountHolderName('')
    setAccountType('savings')
    setUpiId('')
    setUpiName('')
    setAddModalOpen(true)
  }

  const handleAdd = async () => {
    setSubmitting(true)
    setFormError(null)
    try {
      const body: Record<string, unknown> = { type: addType }
      if (addType === 'bank') {
        body.accountNumber = accountNumber
        body.ifscCode = ifscCode
        body.bankName = bankName
        body.accountHolderName = accountHolderName
        body.accountType = accountType
      } else {
        body.upiId = upiId
        body.upiName = upiName
      }

      const res = await fetch('/api/customer/bank-upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to add')
        setSubmitting(false)
        return
      }
      setAddModalOpen(false)
      await fetchMethods()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await fetch('/api/customer/bank-upi', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'setDefault' }),
      })
      await fetchMethods()
    } catch {
      // ignore
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await fetch(`/api/customer/bank-upi?id=${deleteId}`, { method: 'DELETE' })
      setDeleteId(null)
      await fetchMethods()
    } catch {
      // ignore
    }
  }

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' }
  }

  // ── Bank account card ──
  const BankCard = ({ method }: { method: PaymentMethod }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 relative"
    >
      {method.isDefault && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
          <Star className="h-2.5 w-2.5 fill-emerald-500" /> {t('common.default')}
        </span>
      )}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
          <Landmark className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{method.bankName || 'Bank Account'}</p>
          <p className="text-[11px] text-gray-400">****{method.accountNumber.slice(-4)}</p>
        </div>
      </div>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between"><span className="text-gray-400">Account Holder</span><span className="text-gray-700 dark:text-gray-300 font-medium">{method.accountHolderName}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Account Number</span><span className="text-gray-700 dark:text-gray-300 font-medium">{method.accountNumber}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">IFSC Code</span><span className="text-gray-700 dark:text-gray-300 font-medium">{method.ifscCode}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Account Type</span><span className="text-gray-700 dark:text-gray-300 font-medium capitalize">{method.accountType}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Added</span><span className="text-gray-500">{formatDate(method.createdAt)}</span></div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
        {!method.isDefault && (
          <button onClick={() => handleSetDefault(method.id)} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1">
            <Star className="h-3 w-3" /> {t('common.setDefault')}
          </button>
        )}
        <button onClick={() => setDeleteId(method.id)} className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex items-center gap-1 ml-auto">
          <Trash2 className="h-3 w-3" /> {t('common.remove')}
        </button>
      </div>
    </motion.div>
  )

  // ── UPI card ──
  const UpiCard = ({ method }: { method: PaymentMethod }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 relative"
    >
      {method.isDefault && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
          <Star className="h-2.5 w-2.5 fill-emerald-500" /> {t('common.default')}
        </span>
      )}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center text-violet-600 dark:text-violet-400 flex-shrink-0">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{method.upiId}</p>
          {method.upiName && <p className="text-[11px] text-gray-400">{method.upiName}</p>}
        </div>
      </div>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between"><span className="text-gray-400">UPI ID</span><span className="text-gray-700 dark:text-gray-300 font-medium">{method.upiId}</span></div>
        {method.upiName && <div className="flex justify-between"><span className="text-gray-400">Name</span><span className="text-gray-700 dark:text-gray-300 font-medium">{method.upiName}</span></div>}
        <div className="flex justify-between"><span className="text-gray-400">Added</span><span className="text-gray-500">{formatDate(method.createdAt)}</span></div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
        {!method.isDefault && (
          <button onClick={() => handleSetDefault(method.id)} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1">
            <Star className="h-3 w-3" /> {t('common.setDefault')}
          </button>
        )}
        <button onClick={() => setDeleteId(method.id)} className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex items-center gap-1 ml-auto">
          <Trash2 className="h-3 w-3" /> {t('common.remove')}
        </button>
      </div>
    </motion.div>
  )

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader title={t('bankUpi.title')} onBack={onBack} onNavigate={onNavigate} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-2xl animate-pulse border border-gray-100 dark:border-gray-800" />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{error}</p>
            <button onClick={fetchMethods} className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-500 hover:bg-emerald-600">{t('common.retry')}</button>
          </div>
        ) : (
          <>
            {/* Tab switcher — horizontal scrollable for 5 tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-4 overflow-x-auto scrollbar-none">
              <button onClick={() => setActiveTab('bank')} className={cn('py-2 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap', activeTab === 'bank' ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400')}>
                <Landmark className="h-3.5 w-3.5" /> {t('bankUpi.tabBank')} ({bankAccounts.length})
              </button>
              <button onClick={() => setActiveTab('upi')} className={cn('py-2 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap', activeTab === 'upi' ? 'bg-white dark:bg-gray-900 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-gray-500 dark:text-gray-400')}>
                <Smartphone className="h-3.5 w-3.5" /> {t('bankUpi.tabUpi')} ({upiIds.length})
              </button>
              <button onClick={() => setActiveTab('card')} className={cn('py-2 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap', activeTab === 'card' ? 'bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400')}>
                <CreditCard className="h-3.5 w-3.5" /> {t('bankUpi.tabCards')} ({cards.length})
              </button>
              <button onClick={() => setActiveTab('netbanking')} className={cn('py-2 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap', activeTab === 'netbanking' ? 'bg-white dark:bg-gray-900 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-gray-500 dark:text-gray-400')}>
                <Landmark className="h-3.5 w-3.5" /> {t('bankUpi.tabNetBanking')} ({netbankingMethods.length})
              </button>
              <button onClick={() => setActiveTab('wallet')} className={cn('py-2 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap', activeTab === 'wallet' ? 'bg-white dark:bg-gray-900 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-gray-500 dark:text-gray-400')}>
                <Wallet className="h-3.5 w-3.5" /> {t('bankUpi.tabWallets')} ({wallets.length})
              </button>
            </div>

            {/* Add button */}
            <button
              onClick={() => handleOpenAdd(activeTab)}
              className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Add {activeTab === 'bank' ? 'Bank Account' : activeTab === 'upi' ? 'UPI ID' : activeTab === 'card' ? 'Card' : activeTab === 'netbanking' ? 'Bank (Net Banking)' : 'Wallet'}
            </button>

            <AnimatePresence mode="wait">
              {activeTab === 'bank' && (
                <motion.div key="bank" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-3">
                  {bankAccounts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4"><Landmark className="h-8 w-8 text-gray-300 dark:text-gray-600" /></div>
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t('bankUpi.noBank')}</p>
                      <p className="text-xs text-gray-400 mt-1">{t('bankUpi.noBankDesc')}</p>
                    </div>
                  ) : (
                    bankAccounts.map((method) => <BankCard key={method.id} method={method} />)
                  )}
                </motion.div>
              )}
              {activeTab === 'upi' && (
                <motion.div key="upi" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-3">
                  {upiIds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4"><Smartphone className="h-8 w-8 text-gray-300 dark:text-gray-600" /></div>
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t('bankUpi.noUpi')}</p>
                      <p className="text-xs text-gray-400 mt-1">{t('bankUpi.noUpiDesc')}</p>
                    </div>
                  ) : (
                    upiIds.map((method) => <UpiCard key={method.id} method={method} />)
                  )}
                </motion.div>
              )}
              {activeTab === 'card' && (
                <motion.div key="card" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-3">
                  {cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4"><CreditCard className="h-8 w-8 text-gray-300 dark:text-gray-600" /></div>
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t('bankUpi.noCards')}</p>
                      <p className="text-xs text-gray-400 mt-1">{t('bankUpi.noCardsDesc')}</p>
                    </div>
                  ) : (
                    cards.map((method) => (
                      <motion.div key={method.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 relative">
                        {method.isDefault && <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full"><Star className="h-2.5 w-2.5 fill-emerald-500" /> {t('common.default')}</span>}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0"><CreditCard className="h-5 w-5" /></div>
                          <div>
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">{method.cardNetwork} {method.cardType}</p>
                            <p className="text-[11px] text-gray-400">****{method.cardLast4}</p>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mb-3">Saved automatically during checkout (RBI-compliant — only last 4 digits stored)</p>
                        <div className="flex items-center gap-2 pt-3 border-t border-gray-50 dark:border-gray-800">
                          {!method.isDefault && <button onClick={() => handleSetDefault(method.id)} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1"><Star className="h-3 w-3" /> {t('common.setDefault')}</button>}
                          <button onClick={() => setDeleteId(method.id)} className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex items-center gap-1 ml-auto"><Trash2 className="h-3 w-3" /> {t('common.remove')}</button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </motion.div>
              )}
              {activeTab === 'netbanking' && (
                <motion.div key="netbanking" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-3">
                  {netbankingMethods.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4"><Landmark className="h-8 w-8 text-gray-300 dark:text-gray-600" /></div>
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t('bankUpi.noNetBanking')}</p>
                      <p className="text-xs text-gray-400 mt-1">{t('bankUpi.noNetBankingDesc')}</p>
                    </div>
                  ) : (
                    netbankingMethods.map((method) => (
                      <motion.div key={method.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 relative">
                        {method.isDefault && <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full"><Star className="h-2.5 w-2.5 fill-emerald-500" /> {t('common.default')}</span>}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-10 w-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400 flex-shrink-0"><Landmark className="h-5 w-5" /></div>
                          <div>
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{method.bankName}</p>
                            <p className="text-[11px] text-gray-400">Net Banking</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-3 border-t border-gray-50 dark:border-gray-800">
                          {!method.isDefault && <button onClick={() => handleSetDefault(method.id)} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1"><Star className="h-3 w-3" /> {t('common.setDefault')}</button>}
                          <button onClick={() => setDeleteId(method.id)} className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex items-center gap-1 ml-auto"><Trash2 className="h-3 w-3" /> {t('common.remove')}</button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </motion.div>
              )}
              {activeTab === 'wallet' && (
                <motion.div key="wallet" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-3">
                  {wallets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4"><Wallet className="h-8 w-8 text-gray-300 dark:text-gray-600" /></div>
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t('bankUpi.noWallets')}</p>
                      <p className="text-xs text-gray-400 mt-1">{t('bankUpi.noWalletsDesc')}</p>
                    </div>
                  ) : (
                    wallets.map((method) => (
                      <motion.div key={method.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 relative">
                        {method.isDefault && <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full"><Star className="h-2.5 w-2.5 fill-emerald-500" /> {t('common.default')}</span>}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-10 w-10 rounded-xl bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center text-pink-600 dark:text-pink-400 flex-shrink-0"><Wallet className="h-5 w-5" /></div>
                          <div>
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{method.walletProvider}</p>
                            <p className="text-[11px] text-gray-400">Wallet</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-3 border-t border-gray-50 dark:border-gray-800">
                          {!method.isDefault && <button onClick={() => handleSetDefault(method.id)} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1"><Star className="h-3 w-3" /> {t('common.setDefault')}</button>}
                          <button onClick={() => setDeleteId(method.id)} className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex items-center gap-1 ml-auto"><Trash2 className="h-3 w-3" /> {t('common.remove')}</button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* ── Add Modal (AdminModal) ── */}
      <AdminModal
        open={addModalOpen}
        onOpenChange={(o) => setAddModalOpen(o)}
        type="form"
        size="sm"
        title={addType === 'bank' ? 'Add Bank Account' : addType === 'upi' ? 'Add UPI ID' : addType === 'card' ? 'Add Card' : addType === 'netbanking' ? 'Add Bank (Net Banking)' : 'Add Wallet'}
        description={addType === 'bank' ? 'Add a bank account for refunds' : addType === 'upi' ? 'Add a UPI ID for quick payments' : addType === 'card' ? 'Save card details (RBI-compliant)' : addType === 'netbanking' ? 'Save your bank for net banking' : 'Save your wallet provider'}
        submitting={submitting}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddModalOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
            <Button onClick={handleAdd} disabled={submitting} className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white">
              {submitting ? t('common.adding') : t('common.add')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
              <p className="text-[11px] text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}
          {addType === 'bank' ? (
            <>
              <div>
                <Label className="text-xs">Account Holder Name *</Label>
                <Input value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} placeholder="Enter account holder name" className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-xs">Account Number *</Label>
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))} placeholder="Enter account number" className="mt-1 h-10" inputMode="numeric" />
              </div>
              <div>
                <Label className="text-xs">IFSC Code *</Label>
                <Input value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} placeholder="e.g., HDFC0001234" className="mt-1 h-10" style={{ textTransform: 'uppercase' }} />
              </div>
              <div>
                <Label className="text-xs">Bank Name</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g., HDFC Bank" className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-xs">Account Type</Label>
                <select value={accountType} onChange={(e) => setAccountType(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm">
                  <option value="savings">{t('bankUpi.savings')}</option>
                  <option value="current">{t('bankUpi.current')}</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs">UPI ID *</Label>
                <Input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g., name@paytm" className="mt-1 h-10" />
              </div>
              <div>
                <Label className="text-xs">Name (optional)</Label>
                <Input value={upiName} onChange={(e) => setUpiName(e.target.value)} placeholder="e.g., John Doe" className="mt-1 h-10" />
              </div>
            </>
          )}
        </div>
      </AdminModal>

      {/* ── Delete Confirmation Modal ── */}
      <AdminModal
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null) }}
        type="delete"
        size="sm"
        title="Remove Payment Method"
        description="Are you sure you want to remove this payment method?"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="rounded-xl">{t('common.cancel')}</Button>
            <Button onClick={handleDelete} className="rounded-xl bg-red-500 hover:bg-red-600 text-white">{t('common.remove')}</Button>
          </>
        }
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone. The payment method will be permanently removed from your account.</p>
      </AdminModal>
    </div>
  )
}
