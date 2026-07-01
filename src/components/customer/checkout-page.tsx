'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  MapPin,
  Plus,
  Check,
  ChevronRight,
  ShoppingBag,
  Truck,
  ShieldCheck,
  Package,
  Home,
  Building2,
  Briefcase,
  CreditCard,
  Banknote,
  X,
  Edit3,
  Trash2,
  Loader2,
  Tag,
  Smartphone,
  Landmark,
  Wallet,
  AlertCircle,
  Lock,
  Sparkles,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCart } from '@/components/providers/cart-provider'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useLanguage } from '@/components/providers/language-provider'
import { Address } from './types'
import { CartDeliveryEstimate } from '@/components/customer/delivery-checker'

function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/* ------------------------------------------------------------------ */
/*  Delivery Option Type (mirrors backend DeliveryOptionSnapshot)      */
/* ------------------------------------------------------------------ */
interface DeliveryOption {
  id: 'standard' | 'express'
  label: string
  tagline: string
  charge: number
  isFree: boolean
  dateMin: string
  dateMax: string
  etaLabel: string
  available: boolean
  unavailableReason?: string
}

/* ------------------------------------------------------------------ */
/*  Saved Payment Method (RBI-compliant — no full card numbers)        */
/* ------------------------------------------------------------------ */
interface SavedPaymentMethod {
  id: string
  type: 'bank' | 'upi' | 'card' | 'netbanking' | 'wallet'
  upiId: string
  upiName: string
  cardLast4: string
  cardNetwork: string
  cardType: string
  nickname: string
  bankName: string
  bankCode: string
  walletProvider: string
  label: string
  isDefault: boolean
  createdAt: string
}

/** Bank list — mirrors the Net Banking tab grid. Used to resolve full
 *  bank names from saved bank codes (e.g. "SBIN" → "State Bank of India"). */
const BANK_LIST = [
  { name: 'SBI', code: 'SBIN', fullName: 'State Bank of India' },
  { name: 'HDFC', code: 'HDFC', fullName: 'HDFC Bank' },
  { name: 'ICICI', code: 'ICIC', fullName: 'ICICI Bank' },
  { name: 'Axis', code: 'UTIB', fullName: 'Axis Bank' },
  { name: 'Kotak', code: 'KKBK', fullName: 'Kotak Mahindra Bank' },
  { name: 'PNB', code: 'PUNB', fullName: 'Punjab National Bank' },
  { name: 'BoB', code: 'BARB_R', fullName: 'Bank of Baroda' },
  { name: 'Canara', code: 'CNRB', fullName: 'Canara Bank' },
]

/** Wallet list — mirrors the Wallet tab grid. Used to resolve display
 *  names from saved wallet codes (e.g. "paytm" → "Paytm Wallet"). */
const WALLET_LIST = [
  { name: 'Paytm Wallet', code: 'paytm' },
  { name: 'Mobikwik', code: 'mobikwik' },
  { name: 'Airtel Money', code: 'airtelmoney' },
  { name: 'Ola Money', code: 'olamoney' },
  { name: 'FreeCharge', code: 'freecharge' },
  { name: 'JioMoney', code: 'jiomoney' },
]

function getBankFullName(codeOrName: string): string {
  const bank = BANK_LIST.find((b) => b.code === codeOrName || b.name === codeOrName)
  return bank ? bank.fullName : codeOrName
}

function getWalletDisplayName(code: string): string {
  const wallet = WALLET_LIST.find((w) => w.code === code)
  return wallet ? wallet.name : code
}

/* ------------------------------------------------------------------ */
/*  Address Form Modal                                                   */
/* ------------------------------------------------------------------ */

function AddressFormModal({ isOpen, onClose, onSave, editAddress }: {
  isOpen: boolean
  onClose: () => void
  onSave: (address: Omit<Address, '_id'>) => void
  editAddress?: Address | null
}) {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    landmark: '',
    type: 'home' as 'home' | 'work' | 'other',
    isDefault: false,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editAddress) {
      setForm({
        name: editAddress.name || '',
        mobile: editAddress.mobile || '',
        addressLine1: editAddress.addressLine1 || '',
        addressLine2: editAddress.addressLine2 || '',
        city: editAddress.city || '',
        state: editAddress.state || '',
        pincode: editAddress.pincode || '',
        landmark: editAddress.landmark || '',
        type: editAddress.type || 'home',
        isDefault: editAddress.isDefault || false,
      })
    } else {
      setForm({ name: '', mobile: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', landmark: '', type: 'home', isDefault: false })
    }
  }, [editAddress, isOpen])

  const handleSave = async () => {
    if (!form.name || !form.mobile || !form.addressLine1 || !form.city || !form.state || !form.pincode) return
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          className="bg-white dark:bg-gray-950 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">
              {editAddress ? t('addresses.editAddress') : t('addresses.addNewAddress')}
            </h2>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-3">
            {/* Address Type */}
            <div className="flex gap-2">
              {([
                { id: 'home', label: t('addresses.home'), icon: Home },
                { id: 'work', label: t('addresses.work'), icon: Building2 },
                { id: 'other', label: t('common.other'), icon: Briefcase },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setForm(f => ({ ...f, type: id }))}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                    form.type === id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Name + Mobile */}
            <div className="flex gap-3">
              <input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('addresses.fullNamePlaceholder')}
                className="flex-1 h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-500"
              />
              <input
                value={form.mobile}
                onChange={(e) => setForm(f => ({ ...f, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder={t('addresses.mobileNumberPlaceholder')}
                className="flex-1 h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Address Line 1 */}
            <input
              value={form.addressLine1}
              onChange={(e) => setForm(f => ({ ...f, addressLine1: e.target.value }))}
              placeholder={t('addresses.addressLine1Placeholder')}
              className="w-full h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-500"
            />

            {/* Address Line 2 */}
            <input
              value={form.addressLine2}
              onChange={(e) => setForm(f => ({ ...f, addressLine2: e.target.value }))}
              placeholder={t('addresses.addressLine2Placeholder')}
              className="w-full h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-500"
            />

            {/* City + State */}
            <div className="flex gap-3">
              <input
                value={form.city}
                onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder={t('addresses.cityPlaceholder')}
                className="flex-1 h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-500"
              />
              <input
                value={form.state}
                onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))}
                placeholder={t('addresses.statePlaceholder')}
                className="flex-1 h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Pincode + Landmark */}
            <div className="flex gap-3">
              <input
                value={form.pincode}
                onChange={(e) => setForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                placeholder={t('addresses.pincodePlaceholder')}
                className="flex-1 h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-500"
              />
              <input
                value={form.landmark}
                onChange={(e) => setForm(f => ({ ...f, landmark: e.target.value }))}
                placeholder={t('addresses.landmarkPlaceholder')}
                className="flex-1 h-11 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Default checkbox */}
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <div className={cn(
                'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                form.isDefault
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-gray-300 dark:border-gray-600'
              )}>
                {form.isDefault && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('addresses.setAsDefault')}</span>
            </label>
          </div>

          {/* Save Button */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-950">
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.mobile || !form.addressLine1 || !form.city || !form.state || !form.pincode}
              className={cn(
                'w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors',
                !saving && form.name && form.mobile && form.addressLine1 && form.city && form.state && form.pincode
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editAddress ? t('addresses.updateAddress') : t('addresses.saveAddress')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Address Card                                                         */
/* ------------------------------------------------------------------ */

function AddressCard({ address, isSelected, onSelect, onDelete, onEdit }: {
  address: Address
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const { t } = useLanguage()
  const typeIcon = address.type === 'home' ? Home : address.type === 'work' ? Building2 : Briefcase

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative p-3 rounded-xl border-2 cursor-pointer transition-all',
        isSelected
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300'
      )}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </div>
      )}

      <div className="flex items-start gap-2">
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
          isSelected ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-800'
        )}>
          {(() => { const Icon = typeIcon; return <Icon className={cn('h-3.5 w-3.5', isSelected ? 'text-emerald-600' : 'text-gray-400')} /> })()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{address.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 uppercase font-medium">{address.type === 'home' ? t('addresses.home') : address.type === 'work' ? t('addresses.work') : t('common.other')}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{address.mobile}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            {address.addressLine1}
            {address.addressLine2 ? `, ${address.addressLine2}` : ''}
            {address.landmark ? t('addresses.nearLandmark', { landmark: address.landmark }) : ''}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {address.city}, {address.state} - {address.pincode}
          </p>

          <div className="flex items-center gap-3 mt-2">
            <button onClick={(e) => { e.stopPropagation(); onEdit() }} className="text-[11px] font-semibold text-blue-500 hover:text-blue-600">
              {t('addresses.edit')}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-[11px] font-semibold text-red-500 hover:text-red-600">
              {t('addresses.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Checkout Page                                                   */
/* ------------------------------------------------------------------ */

type CheckoutStep = 'address' | 'summary' | 'payment' | 'success'

/** Steps that are safe to restore from URL (success is terminal — handled specially). */
type RestorableStep = 'address' | 'summary' | 'payment'

export function CheckoutPage({
  onClose,
  initialStep,
  onStepChange,
}: {
  onClose: () => void
  /** Optional initial step — used to restore checkout state after a page refresh. */
  initialStep?: RestorableStep
  /** Optional callback fired whenever the step changes — used to sync the URL. */
  onStepChange?: (step: CheckoutStep) => void
}) {
  const router = useRouter()
  const { user, authenticated } = useCustomerAuth()
  const { items, totalPrice, totalSavings, clearCart } = useCart()
  const { t } = useLanguage()

  const [step, setStep] = useState<CheckoutStep>(initialStep || 'address')

  // Notify parent whenever the step changes so it can sync the URL.
  // This enables refresh-resilient checkout: on refresh, the URL's `step`
  // param is read by the parent and passed back as `initialStep`.
  useEffect(() => {
    onStepChange?.(step)
  }, [step, onStepChange])

  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [isCod, setIsCod] = useState(false)
  const [paymentSubMethod, setPaymentSubMethod] = useState<'upi' | 'card' | 'netbanking' | 'wallet'>('upi')
  const [upiId, setUpiId] = useState('')
  const [selectedBank, setSelectedBank] = useState('')
  const [selectedWallet, setSelectedWallet] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [orderNumber, setOrderNumber] = useState('')
  const [error, setError] = useState('')
  const [paymentProcessing, setPaymentProcessing] = useState(false)
  const [paymentMethodName, setPaymentMethodName] = useState<string>('')
  const [upiPolling, setUpiPolling] = useState(false)
  const [upiPollingOrderId, setUpiPollingOrderId] = useState('')
  const upiPollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // === Delivery option state (Standard vs Express) ===
  // Mirrors Flipkart / Amazon / Meesho: the customer picks a delivery
  // option at checkout. The list is fetched server-side from the delivery
  // engine for the selected shipping address — so express only appears
  // when it's actually faster AND the seller offers it AND the platform
  // has express enabled.
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([])
  const [deliveryOptionLoading, setDeliveryOptionLoading] = useState(false)
  const [selectedDeliveryOption, setSelectedDeliveryOption] = useState<'standard' | 'express'>('standard')
  // Tracks whether the customer has manually chosen an option. If false,
  // we auto-select the first available option (standard by default).
  const [deliveryOptionManuallyPicked, setDeliveryOptionManuallyPicked] = useState(false)

  // Save payment method for next time (RBI-compliant)
  const [savePaymentMethod, setSavePaymentMethod] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardExpiry, setCardExpiry] = useState('') // Format: MM/YY
  const [cardCvv, setCardCvv] = useState('')

  // === Saved payment methods (Meesho/Flipkart-style quick select) ===
  // Fetched from customer_payment_methods when the customer reaches the
  // payment step. Lets them reuse a previously-saved UPI / card / netbanking
  // / wallet without re-entering details (RBI-compliant — cards are
  // tokenized, only last 4 + network are stored).
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>([])
  const [savedMethodsLoading, setSavedMethodsLoading] = useState(false)
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState('')
  const [savedCardCvv, setSavedCardCvv] = useState('')
  const [useNewMethod, setUseNewMethod] = useState(false)

  // === RealCart Balance (wallet) payment option ===
  // Fetched when the customer reaches the payment step. If they have
  // balance >= order total, they can pay instantly from their wallet
  // (no Razorpay involved — debited server-side atomically).
  // Meesho-style: the wallet toggle is NOT mutually exclusive with other
  // payment methods. If the wallet covers only part of the order, the
  // remainder is paid via UPI/Card/Net Banking (split payment).
  const [walletBalance, setWalletBalance] = useState(0)
  const [walletLoading, setWalletLoading] = useState(false)
  const [useWalletBalance, setUseWalletBalance] = useState(false)

  // Derived values (walletAppliedAmount, amountPayable, walletCoversFull)
  // are declared AFTER finalTotal (see below) to avoid TDZ errors.

  // Coupon state
  const [couponCode, setCouponCode] = useState('')
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  // Available coupons list (shown in a collapsible drawer under the coupon input)
  const [availableCoupons, setAvailableCoupons] = useState<Array<{
    coupon: { _id: string; code: string; title?: string; displayText?: string; discountType: string; discountValue: number; maxDiscount: number; minOrderAmount: number; scope: string; sellerStoreName?: string | null; featured?: boolean; firstOrderOnly?: boolean; endDate?: string | null }
    applicable: boolean
    reason?: string
    discount: number
  }>>([])
  const [showAvailableCoupons, setShowAvailableCoupons] = useState(false)
  const [availableCouponsLoading, setAvailableCouponsLoading] = useState(false)

  // Fetch addresses
  useEffect(() => {
    if (!authenticated) return
    fetch('/api/customer/addresses')
      .then(res => res.ok ? res.json() : { addresses: [] })
      .then(data => {
        const addrs = data.addresses || []
        setAddresses(addrs)
        const defaultAddr = addrs.find((a: Address) => a.isDefault)
        if (defaultAddr) setSelectedAddressId(defaultAddr._id!)
        else if (addrs.length > 0) setSelectedAddressId(addrs[0]._id!)
      })
      .catch(() => {})
  }, [authenticated])

  // === Fetch saved payment methods when entering the payment step ===
  // Pulls the customer's saved UPI IDs, cards (tokenized), net banking
  // banks, and wallets so they can be shown as quick-select options at
  // checkout (like Meesho / Flipkart / Amazon). Bank accounts are excluded
  // — they're for refunds, not online payment.
  useEffect(() => {
    if (!authenticated || step !== 'payment') return
    let cancelled = false
    setSavedMethodsLoading(true)
    fetch('/api/customer/bank-upi')
      .then((res) => (res.ok ? res.json() : { paymentMethods: [] }))
      .then((data) => {
        if (cancelled) return
        const all: SavedPaymentMethod[] = data.paymentMethods || []
        const usable = all.filter((m) =>
          ['upi', 'card', 'netbanking', 'wallet'].includes(m.type),
        )
        setSavedMethods(usable)
        // Auto-select the default saved method (if any) for the fastest
        // checkout — exactly like Meesho pre-selects your last-used method.
        const def = usable.find((m) => m.isDefault)
        if (def) {
          applySavedMethod(def)
        }
      })
      .catch(() => {
        // Non-critical — checkout still works with manual entry
      })
      .finally(() => {
        if (!cancelled) setSavedMethodsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, step])

  // === Fetch RealCart Balance (wallet) when entering the payment step ===
  // Shows the customer's wallet balance so they can pay instantly if they
  // have enough balance (no Razorpay involved — debited server-side).
  useEffect(() => {
    if (!authenticated || step !== 'payment') return
    let cancelled = false
    setWalletLoading(true)
    fetch('/api/customer/wallet')
      .then((res) => (res.ok ? res.json() : { balance: 0 }))
      .then((data) => {
        if (cancelled) return
        setWalletBalance(data.balance || 0)
      })
      .catch(() => {
        // Non-critical — checkout still works with other methods
      })
      .finally(() => {
        if (!cancelled) setWalletLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, step])

  // === Fetch delivery options (standard + express) for the selected address ===
  // Hits the delivery engine every time the selected address OR cart contents
  // change. Returns a UI-ready list of options with ETA + charge for each.
  // Auto-selects 'standard' on first load; preserves a manual customer pick
  // across refetches (e.g. when they switch addresses after picking express).
  useEffect(() => {
    const addr = addresses.find((a) => a._id === selectedAddressId)
    // Need a valid pincode + at least one item to compute an estimate
    if (!addr || !/^\d{6}$/.test(addr.pincode || '') || items.length === 0) {
      setDeliveryOptions([])
      return
    }

    let cancelled = false
    setDeliveryOptionLoading(true)

    const body = {
      pincode: addr.pincode,
      state: addr.state,
      option: selectedDeliveryOption,
      items: items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        effectivePrice: it.effectivePrice,
      })),
    }

    fetch('/api/customer/delivery/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const opts: DeliveryOption[] = Array.isArray(data.options) ? data.options : []
        setDeliveryOptions(opts)

        // If the customer hasn't manually picked yet OR their previous pick
        // is no longer in the available list (e.g. express not offered for
        // the new address), fall back to the engine's `selected.option`.
        const stillAvailable = opts.some((o) => o.id === selectedDeliveryOption && o.available)
        if (!deliveryOptionManuallyPicked || !stillAvailable) {
          const fallback = opts.find((o) => o.available)
          if (fallback) {
            setSelectedDeliveryOption(fallback.id)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setDeliveryOptions([])
      })
      .finally(() => {
        if (!cancelled) setDeliveryOptionLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddressId, items])

  // The currently-selected option snapshot (looked up from deliveryOptions).
  // Falls back to a sensible default if the API hasn't responded yet.
  const selectedOptionSnapshot: DeliveryOption | null = useMemo(() => {
    if (deliveryOptions.length === 0) return null
    return (
      deliveryOptions.find((o) => o.id === selectedDeliveryOption && o.available) ||
      deliveryOptions.find((o) => o.available) ||
      null
    )
  }, [deliveryOptions, selectedDeliveryOption])

  // ── Delivery availability guard for "Continue to Payment" ──────────
  // Determines whether the customer is allowed to proceed to the payment
  // step. The button is BLOCKED when:
  //   1. No address is selected yet.
  //   2. Delivery options are still loading (checking serviceability).
  //   3. The selected address has an invalid pincode (no options returned).
  //   4. The pincode is not serviceable — all returned options have
  //      `available: false` (e.g. blocked pincode).
  // `deliveryBlockReason` holds a user-friendly message explaining WHY
  // the button is disabled, so the customer knows what to fix.
  const { canContinueToPayment, deliveryBlockReason } = useMemo(() => {
    // No address selected
    if (!selectedAddressId) {
      return { canContinueToPayment: false, deliveryBlockReason: t('checkout.pleaseSelectAddress') }
    }
    // Still checking delivery serviceability
    if (deliveryOptionLoading) {
      return { canContinueToPayment: false, deliveryBlockReason: t('checkout.checkingDelivery') }
    }
    // Address selected but no options returned (invalid pincode or empty cart)
    if (deliveryOptions.length === 0) {
      return { canContinueToPayment: false, deliveryBlockReason: t('checkout.selectValidAddress') }
    }
    // Options returned but NONE are serviceable (blocked / non-serviceable pincode)
    const hasServiceableOption = deliveryOptions.some((o) => o.available)
    if (!hasServiceableOption) {
      const unavailableOpt = deliveryOptions.find((o) => !o.available)
      return {
        canContinueToPayment: false,
        deliveryBlockReason: unavailableOpt?.unavailableReason || t('checkout.selectValidAddress'),
      }
    }
    // All checks passed — delivery is available
    return { canContinueToPayment: true, deliveryBlockReason: null }
  }, [selectedAddressId, deliveryOptionLoading, deliveryOptions, t])

  // Cleanup UPI polling interval on unmount
  useEffect(() => {
    return () => {
      if (upiPollIntervalRef.current) {
        clearInterval(upiPollIntervalRef.current)
      }
    }
  }, [])

  // Save address
  const handleSaveAddress = async (addr: Omit<Address, '_id'>) => {
    try {
      if (editingAddress?._id) {
        await fetch('/api/customer/addresses', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _id: editingAddress._id, ...addr }),
        })
      } else {
        const res = await fetch('/api/customer/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(addr),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.address?._id && !selectedAddressId) {
            setSelectedAddressId(data.address._id)
          }
        }
      }

      // Refresh addresses
      const res = await fetch('/api/customer/addresses')
      if (res.ok) {
        const data = await res.json()
        setAddresses(data.addresses || [])
      }
    } catch (err) {
      console.error('Save address error:', err)
    }
  }

  // Delete address
  const handleDeleteAddress = async (id: string) => {
    try {
      await fetch('/api/customer/addresses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressId: id }),
      })
      setAddresses(prev => prev.filter(a => a._id !== id))
      if (selectedAddressId === id) {
        const remaining = addresses.filter(a => a._id !== id)
        if (remaining.length > 0) setSelectedAddressId(remaining[0]._id!)
        else setSelectedAddressId('')
      }
    } catch (err) {
      console.error('Delete address error:', err)
    }
  }

  // Build the cart-items payload for coupon validation/availability checks.
  // Includes category + sellerId so the engine can apply category/seller
  // applicability rules. Falls back gracefully for legacy cart items.
  const buildCouponItemsPayload = () => {
    return items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      price: i.effectivePrice,
      category: i.category,
      sellerId: i.sellerId,
    }))
  }

  // Fetch the list of coupons available for the current cart (for the
  // "Available Coupons" collapsible list under the coupon input).
  const fetchAvailableCoupons = useCallback(async () => {
    if (!items.length) return
    setAvailableCouponsLoading(true)
    try {
      const res = await fetch('/api/customer/coupons/available', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartTotal: totalPrice,
          items: buildCouponItemsPayload(),
        }),
      })
      const data = await res.json()
      if (data.coupons) setAvailableCoupons(data.coupons)
    } catch {
      // Non-fatal — the manual coupon input still works
    } finally {
      setAvailableCouponsLoading(false)
    }
  }, [items, totalPrice])

  // Apply coupon — sends cart items so the server can run per-customer,
  // first-order, and applicability checks (not just the cart total).
  const handleApplyCoupon = async (codeToApply?: string) => {
    const code = (codeToApply || couponCode).trim()
    if (!code) return
    setCouponLoading(true)
    setCouponError('')

    try {
      const res = await fetch('/api/customer/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          cartTotal: totalPrice,
          items: buildCouponItemsPayload(),
        }),
      })

      const data = await res.json()

      if (data.valid) {
        setCouponDiscount(data.discount || 0)
        setCouponApplied(true)
        setCouponCode(data.coupon.code)
        setCouponError('')
      } else {
        setCouponDiscount(0)
        setCouponApplied(false)
        setCouponError(data.error || t('checkout.invalidCoupon'))
      }
    } catch {
      setCouponError(t('checkout.couponValidateFailed'))
    } finally {
      setCouponLoading(false)
    }
  }

  // Remove coupon
  const handleRemoveCoupon = () => {
    setCouponCode('')
    setCouponDiscount(0)
    setCouponApplied(false)
    setCouponError('')
  }

  // Pre-apply a coupon that was selected from the cart page's "Available
  // Coupons" list (passed via sessionStorage). This lets the customer pick
  // a coupon on the cart page and have it auto-applied when they proceed
  // to checkout — no cross-component state plumbing required.
  useEffect(() => {
    if (!items.length) return
    try {
      const pending = sessionStorage.getItem('pendingCouponCode')
      if (pending && !couponApplied && !couponCode) {
        setCouponCode(pending.toUpperCase())
        handleApplyCoupon(pending.toUpperCase())
        sessionStorage.removeItem('pendingCouponCode')
      }
    } catch {
      // sessionStorage may be unavailable (private mode) — non-fatal
    }
    // Intentionally only re-runs when the cart item count changes — we don't
    // want to re-apply on every render. handleApplyCoupon is a stable-enough
    // closure for this one-shot pre-apply behaviour.
  }, [items.length])

  // Fetch available coupons whenever the cart changes (debounced via the
  // items/totalPrice deps). Runs in the background; the manual input works
  // regardless.
  useEffect(() => {
    if (!items.length) {
      setAvailableCoupons([])
      return
    }
    fetchAvailableCoupons()
  }, [items, totalPrice, fetchAvailableCoupons])

  // Fee calculations (Indian e-commerce price breakdown)
  // Matches the server-side order-helpers.ts calculation so the checkout
  // total EXACTLY equals what the customer will be charged.
  //
  // PROJECT POLICY (GST-INCLUSIVE DELIVERY): The customer-facing
  // `deliveryCharge` is GST-INCLUSIVE — the customer pays
  // `items + deliveryCharge` and NEVER sees a separate "GST on delivery"
  // line. The embedded 18% GST is extracted internally on the server for
  // tax reporting (GSTR-1, admin tax dashboard) but is NOT added to the
  // customer total. This matches the server-side `order-helpers.ts` and
  // `finance-engine.ts` calculations exactly.
  const priceWithoutDiscount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

  // === Split product discount into "Product Discount" + "Special Offer" ===
  // A product may have THREE prices:
  //   - price (MRP)            : Maximum Retail Price (original printed price)
  //   - sellingPrice           : Regular selling price (may already be below MRP)
  //   - effectivePrice         : Final price after any active limited-time Special Offer
  //
  // When a Special Offer (specialPrice) is active, effectivePrice < sellingPrice.
  // We split the total savings so the customer can clearly see the Special Offer
  // as a distinct line — exactly like Flipkart / Amazon / Meesho do.
  //
  //   Product Discount = Σ (MRP − sellingPrice) × qty          [regular markdown]
  //   Special Offer    = Σ (sellingPrice − effectivePrice) × qty [limited-time offer]
  //
  // Backward compatibility: if a legacy cart item has no sellingPrice, the entire
  // (MRP − effectivePrice) discount is shown as "Product Discount" (no Special
  // Offer line), preserving the previous behaviour.
  const { totalProductDiscount, totalSpecialOffer } = items.reduce((acc, item) => {
    const qty = item.quantity
    if (item.sellingPrice != null && item.sellingPrice !== item.effectivePrice) {
      // sellingPrice present and a special offer is active (effectivePrice < sellingPrice)
      const regular = Math.max(0, (item.price - item.sellingPrice) * qty)
      const special = Math.max(0, (item.sellingPrice - item.effectivePrice) * qty)
      return {
        totalProductDiscount: acc.totalProductDiscount + regular,
        totalSpecialOffer: acc.totalSpecialOffer + special,
      }
    }
    // No separate sellingPrice OR no special offer active → all discount is "Product Discount"
    return {
      totalProductDiscount: acc.totalProductDiscount + Math.max(0, (item.price - item.effectivePrice) * qty),
      totalSpecialOffer: acc.totalSpecialOffer,
    }
  }, { totalProductDiscount: 0, totalSpecialOffer: 0 })

  // === Delivery charge — comes from the delivery engine via the selected ===
  // === delivery option (Standard or Express). Falls back to the legacy    ===
  // === flat-rate logic (FREE ≥ ₹499 else ₹49) only if the engine hasn't  ===
  // === responded yet — keeping the price breakdown stable while loading.  ===
  // The server re-validates this on order creation (authoritative), so a
  // stale or tampered value here cannot affect the actual charge.
  const fallbackDeliveryCharge = totalPrice >= 499 ? 0 : 49
  const deliveryCharge = selectedOptionSnapshot
    ? selectedOptionSnapshot.charge
    : fallbackDeliveryCharge
  // NOTE: No separate gstOnDelivery line — the customer-facing `deliveryCharge`
  // is GST-INCLUSIVE in this project. The customer pays `items + deliveryCharge`
  // and never sees a separate "GST on delivery" line. The embedded 18% GST is
  // extracted on the server (order-helpers.ts) for tax reporting only.
  const codFee = isCod ? 40 : 0
  const platformFee = 5
  // Total MUST match server: totalPrice (= taxable + gst) + deliveryCharge (GST-INCLUSIVE) + codFee + platformFee - couponDiscount
  const rawTotal = totalPrice + deliveryCharge + codFee + platformFee - (couponApplied ? couponDiscount : 0)
  // Final total after all charges and coupon
  // Note: rounded to nearest rupee for payment-gateway compatibility, but no
  // "Round Off" line is shown in the UI (production behavior matching
  // Flipkart/Amazon/Meesho). The displayed breakdown uses formatPrice which
  // rounds for display, so the small paise difference is absorbed.
  const finalTotal = Math.round(rawTotal)

  // === RealCart Balance derived values (Meesho-style split payment) ===
  // walletAppliedAmount = min(walletBalance, finalTotal) when toggled on.
  // amountPayable = finalTotal - walletAppliedAmount (paid via another method).
  // walletCoversFull = true when the wallet covers the ENTIRE order.
  const walletAppliedAmount = useWalletBalance ? Math.min(walletBalance, finalTotal) : 0
  const amountPayable = Math.max(0, finalTotal - walletAppliedAmount)
  const walletCoversFull = useWalletBalance && walletAppliedAmount >= finalTotal

  // Reusable price-breakup renderer — used in both the Order Summary step and
  // the Payment step so the breakdown is always identical and consistent with
  // the post-purchase "Payment Details" shown on the orders page.
  // Shows ALL discounts clearly (Product Discount + Coupon Discount + Total Savings)
  // and does NOT show any tax breakdown (taxes are inclusive, noted at the bottom).
  const renderPriceBreakup = () => {
    // Aggregate ALL discounts for the "Total Savings" summary line.
    // Product Discount is split into a regular markdown (MRP→sellingPrice) and a
    // distinct "Special Offer" line (sellingPrice→effectivePrice) when a limited-
    // time special price is active — matching Flipkart / Amazon / Meesho UX.
    const productDisc = totalProductDiscount > 0 ? totalProductDiscount : 0
    const specialDisc = totalSpecialOffer > 0 ? totalSpecialOffer : 0
    const couponDisc = couponApplied && couponDiscount > 0 ? couponDiscount : 0
    const totalAllSavings = productDisc + specialDisc + couponDisc
    // Price after all discounts (= totalPrice which is sum of effectivePrice × qty,
    // minus coupon if applied). We compute it as subtotal - totalAllSavings.
    const priceAfterAllDiscounts = Math.max(0, priceWithoutDiscount - totalAllSavings)

    return (
      <div className="space-y-2 text-sm">
        {/* Row 1: Subtotal (MRP) — sum of all items' original prices */}
        <div className="flex justify-between">
          <span className="text-gray-500">{t('checkout.priceMrp', { count: totalItems })}</span>
          <span className="text-gray-800 dark:text-gray-200">{formatPrice(priceWithoutDiscount)}</span>
        </div>
        {/* Row 2: Product Discount — regular markdown (MRP → sellingPrice) */}
        {productDisc > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t('cart.productDiscount')}</span>
            <span className="text-green-600 font-medium">- {formatPrice(productDisc)}</span>
          </div>
        )}
        {/* Row 3: Special Offer — limited-time deal (sellingPrice → effectivePrice), highlighted */}
        {specialDisc > 0 && (
          <div className="flex justify-between bg-amber-50 dark:bg-amber-900/20 -mx-1 px-2 py-1 rounded">
            <span className="text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {t('cart.specialOffer')}
            </span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">- {formatPrice(specialDisc)}</span>
          </div>
        )}
        {/* Row 4: Coupon Discount — additional coupon savings */}
        {couponDisc > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500 flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {t('checkout.couponLabel', { code: couponCode })}
            </span>
            <span className="text-green-600 font-medium">- {formatPrice(couponDisc)}</span>
          </div>
        )}
        {/* Row 5: Total Savings — highlighted summary of ALL discounts */}
        {totalAllSavings > 0 && (
          <div className="flex justify-between bg-green-50 dark:bg-green-900/20 -mx-1 px-2 py-1 rounded">
            <span className="text-green-700 dark:text-green-400 font-semibold">{t('checkout.totalSavings')}</span>
            <span className="text-green-700 dark:text-green-400 font-bold">- {formatPrice(totalAllSavings)}</span>
          </div>
        )}
        {/* Row 6: Price After Discount — intermediate subtotal after all discounts (tax-inclusive) */}
        {totalAllSavings > 0 && (
          <div className="flex justify-between border-t border-dashed border-gray-200 dark:border-gray-700 pt-2">
            <span className="text-gray-600 dark:text-gray-300 font-medium">{t('checkout.priceAfterDiscount')}</span>
            <span className="text-gray-700 dark:text-gray-300 font-medium">{formatPrice(priceAfterAllDiscounts)}</span>
          </div>
        )}
        {/* Row 7: Delivery Fee — additive. Shows the chosen option's label + ETA */}
        <div className="flex justify-between">
          <span className="text-gray-500 flex items-center gap-1.5">
            {t('checkout.deliveryCharge')}
            {selectedOptionSnapshot && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold',
                  selectedOptionSnapshot.id === 'express'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
                )}
              >
                {selectedOptionSnapshot.id === 'express' && <Zap className="h-2.5 w-2.5" />}
                {selectedOptionSnapshot.label.replace(' Delivery', '')}
              </span>
            )}
          </span>
          {deliveryCharge === 0 ? (
            <span className="text-green-600 font-medium">{t('cart.free')}</span>
          ) : (
            <span className="text-gray-800 dark:text-gray-200">{formatPrice(deliveryCharge)}</span>
          )}
        </div>
        {/* Row 7b: ETA line — shows the delivery date range inline beside
            the "Estimated delivery" label (NOT in the amount column).
            Mirrors Flipkart/Amazon where the ETA sits under the label. */}
        {selectedOptionSnapshot && selectedOptionSnapshot.etaLabel && (
          <p className="text-[11px] text-gray-400 -mt-1">
            {t('checkout.estimatedDelivery')}{' '}
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {selectedOptionSnapshot.etaLabel}
            </span>
          </p>
        )}
        {/* Row 8: COD Fee — additive (only for COD orders) */}
        {isCod && codFee > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t('checkout.codConvenienceFee')}</span>
            <span className="text-gray-800 dark:text-gray-200">{formatPrice(codFee)}</span>
          </div>
        )}
        {/* Row 9: Platform Fee — additive */}
        <div className="flex justify-between">
          <span className="text-gray-500">{t('checkout.platformFee')}</span>
          <span className="text-gray-800 dark:text-gray-200">{formatPrice(platformFee)}</span>
        </div>
        {/* Row 10: Total Payable */}
        <div className="border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 flex justify-between">
          <span className="font-bold text-gray-800 dark:text-gray-200">{t('checkout.totalPayable')}</span>
          <span className="font-bold text-gray-800 dark:text-gray-200">{formatPrice(finalTotal)}</span>
        </div>
        {/* Row 11: RealCart Balance credit (Meesho-style split payment) */}
        {useWalletBalance && walletAppliedAmount > 0 && (
          <>
            <div className="flex justify-between">
              <span className="text-violet-600 dark:text-violet-400 flex items-center gap-1">
                <Wallet className="h-3 w-3" />
                {t('wallet.title')}
              </span>
              <span className="text-violet-600 dark:text-violet-400 font-semibold">−{formatPrice(walletAppliedAmount)}</span>
            </div>
            {!walletCoversFull && (
              <div className="border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 flex justify-between">
                <span className="font-bold text-gray-800 dark:text-gray-200">{t('checkout.amountToPay')}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(amountPayable)}</span>
              </div>
            )}
          </>
        )}
        <p className="text-[11px] text-gray-400 text-right">{t('checkout.inclusiveOfTaxes')}</p>
      </div>
    )
  }

  // Helper: detect card brand from number
  const detectCardBrand = useCallback((num: string): string => {
    const clean = num.replace(/\s/g, '')
    if (/^4/.test(clean)) return 'Visa'
    if (/^5[1-5]/.test(clean) || /^2[2-7]/.test(clean)) return 'Mastercard'
    if (/^3[47]/.test(clean)) return 'Amex'
    if (/^6/.test(clean) || /^81/.test(clean) || /^82/.test(clean) || /^508/.test(clean)) return 'RuPay'
    return ''
  }, [])

  // Helper: format card number with spaces
  const formatCardNumber = (value: string): string => {
    const clean = value.replace(/\D/g, '').slice(0, 16)
    return clean.replace(/(\d{4})(?=\d)/g, '$1 ')
  }

  // Helper: format expiry MM/YY
  const formatExpiry = (value: string): string => {
    const clean = value.replace(/\D/g, '').slice(0, 4)
    if (clean.length >= 3) return clean.slice(0, 2) + '/' + clean.slice(2)
    return clean
  }

  // === Saved method helpers ===
  // The currently-selected saved CARD (or null). Used to switch the Card
  // tab between "full card form" and "CVV-only" view.
  const selectedSavedCard = useMemo<SavedPaymentMethod | null>(() => {
    if (!selectedSavedMethodId) return null
    const m = savedMethods.find((m) => m.id === selectedSavedMethodId)
    return m && m.type === 'card' ? m : null
  }, [selectedSavedMethodId, savedMethods])

  // Apply a saved payment method — pre-fills the relevant fields and
  // switches to the correct tab so the customer can pay instantly.
  const applySavedMethod = (method: SavedPaymentMethod) => {
    setSelectedSavedMethodId(method.id)
    setUseNewMethod(false)
    setIsCod(false)
    setSavedCardCvv('')
    setError('')
    if (method.type === 'upi') {
      setPaymentSubMethod('upi')
      setUpiId(method.upiId)
    } else if (method.type === 'card') {
      setPaymentSubMethod('card')
      // Clear the manual card form — we'll use the saved card (CVV only)
      setCardNumber('')
      setCardName('')
      setCardExpiry('')
      setCardCvv('')
    } else if (method.type === 'netbanking') {
      setPaymentSubMethod('netbanking')
      setSelectedBank(method.bankCode || method.bankName)
    } else if (method.type === 'wallet') {
      setPaymentSubMethod('wallet')
      setSelectedWallet(method.walletProvider)
    }
  }

  // Payment validation for current sub-method
  const isPaymentValid = useMemo(() => {
    if (isCod) return true
    // RealCart Balance covers the FULL order — valid, no other method needed
    if (walletCoversFull) return true
    // Partial wallet + another method: validate the OTHER method for the remainder
    // (falls through to the standard checks below)
    // Saved card — only CVV needed (RBI-compliant tokenization)
    if (selectedSavedCard) return savedCardCvv.length >= 3
    if (paymentSubMethod === 'upi') return upiId.includes('@') && upiId.length > 3
    if (paymentSubMethod === 'card') {
      const cleanCard = cardNumber.replace(/\s/g, '')
      return cleanCard.length >= 13 && cardName.trim().length > 0 && cardExpiry.length === 5 && cardCvv.length >= 3
    }
    if (paymentSubMethod === 'netbanking') return selectedBank !== ''
    if (paymentSubMethod === 'wallet') return selectedWallet !== ''
    return false
  }, [isCod, paymentSubMethod, upiId, cardNumber, cardName, cardExpiry, cardCvv, selectedBank, selectedWallet, selectedSavedCard, savedCardCvv, walletCoversFull])

  /* ---------------------------------------------------------------- */
  /*  Handle Server-side Payment — ALL methods, NO checkout.js modal   */
  /*                                                                   */
  /*  Uses /api/customer/payments/process for server-side payment      */
  /*  creation. No Razorpay checkout.js, no modal, no popup,           */
  /*  no splash screen — payment is processed entirely server-side.    */
  /* ---------------------------------------------------------------- */
  const handleServerPayment = useCallback(async (selectedAddress: Address) => {
    setPaymentProcessing(true)
    setError('')

    try {
      // Build checkout context (stored in DB for redirect callback flow)
      const checkoutContext = {
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          variant: item.selectedVariant,
          originalPrice: item.price,
          sellingPrice: item.sellingPrice,
          effectivePrice: item.effectivePrice,
          hasDiscount: item.hasDiscount,
          discountPercent: item.discountPercent,
        })),
        shippingAddress: {
          name: selectedAddress.name,
          phone: selectedAddress.mobile,
          addressLine1: selectedAddress.addressLine1,
          addressLine2: selectedAddress.addressLine2 || '',
          city: selectedAddress.city,
          state: selectedAddress.state,
          pincode: selectedAddress.pincode,
          type: selectedAddress.type,
        },
        couponCode: couponApplied ? couponCode : undefined,
        couponDiscount: couponApplied ? couponDiscount : undefined,
        productDiscount: totalSavings,
        specialOfferDiscount: totalSpecialOffer,
      }

      // Build request body based on payment method
      const method = isCod ? 'cod' as const : paymentSubMethod
      // Meesho-style split payment: when RealCart Balance is applied partially,
      // the online payment only covers the REMAINDER (amountPayable), not the
      // full order total. The wallet portion is debited separately after the
      // order is created.
      const onlineAmount = useWalletBalance && !walletCoversFull ? amountPayable : finalTotal
      const requestBody: Record<string, unknown> = {
        amount: onlineAmount,
        method,
        customerName: selectedAddress.name || user?.name || 'Customer',
        customerEmail: user?.email || '',
        customerPhone: selectedAddress.mobile || '',
        checkoutContext,
      }

      // Add method-specific parameters
      if (method === 'upi') {
        requestBody.vpa = upiId
      } else if (method === 'card') {
        if (selectedSavedCard) {
          // Saved card (RBI-compliant) — send tokenized data, NOT the full
          // card number. Only CVV is re-entered by the customer.
          requestBody.savedCard = true
          requestBody.cardLast4 = selectedSavedCard.cardLast4
          requestBody.cardNetwork = selectedSavedCard.cardNetwork
          requestBody.cardType = selectedSavedCard.cardType
          requestBody.cardCvv = savedCardCvv
        } else {
          const cleanCard = cardNumber.replace(/\s/g, '')
          const [expMonth, expYear] = cardExpiry.split('/')
          requestBody.cardNumber = cleanCard
          requestBody.cardName = cardName.trim()
          requestBody.cardExpiryMonth = expMonth
          requestBody.cardExpiryYear = expYear ? `20${expYear}` : ''
          requestBody.cardCvv = cardCvv
        }
      } else if (method === 'netbanking') {
        requestBody.bankCode = selectedBank
      } else if (method === 'wallet') {
        requestBody.walletType = selectedWallet
      }

      // Call server-side payment processing API
      const res = await fetch('/api/customer/payments/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await res.json()

      if (!data.success && !data.fallbackMode) {
        throw new Error(data.error || 'Payment failed. Please try again.')
      }

      // Handle response based on mode
      if (data.mode === 'polling') {
        // UPI Collect — show polling screen, user approves on UPI app
        setUpiPolling(true)
        setUpiPollingOrderId(data.razorpayOrderId)

        // Start polling for payment status
        const pollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/customer/payments/poll-status?razorpayOrderId=${data.razorpayOrderId}`)
            const pollData = await pollRes.json()

            if (pollData.status === 'paid') {
              clearInterval(pollInterval)
              upiPollIntervalRef.current = null

              // Create order with payment details
              const orderCreateRes = await fetch('/api/customer/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  items: checkoutContext.items,
                  shippingAddress: checkoutContext.shippingAddress,
                  paymentMethod: 'online',
                  paymentDetails: {
                    razorpayOrderId: data.razorpayOrderId,
                    razorpayPaymentId: pollData.paymentId || data.razorpayPaymentId || '',
                    paymentOrderId: data.paymentOrderId,
                    method: pollData.method || 'upi',
                    bank: pollData.bank,
                    vpa: pollData.vpa || upiId,
                    wallet: pollData.wallet,
                    walletAppliedAmount: useWalletBalance ? walletAppliedAmount : 0,
                  },
                  couponCode: checkoutContext.couponCode,
                  couponDiscount: checkoutContext.couponDiscount,
                  productDiscount: checkoutContext.productDiscount,
                  specialOfferDiscount: checkoutContext.specialOfferDiscount,
                  deliveryFee: deliveryCharge,
                  // Forward the customer-chosen delivery option so the server
                  // can re-compute the fee AUTHORITATIVELY (anti-fraud).
                  deliveryOption: selectedDeliveryOption,
                  platformFee: 5,
                }),
              })

              const createData = await orderCreateRes.json()
              if (!orderCreateRes.ok) {
                throw new Error(createData.error || 'Failed to create order')
              }

              setOrderNumber(createData.order?.orderId || 'N/A')
              setPaymentMethodName('UPI')

              // Apply RealCart Balance partially (Meesho-style split payment)
              await applyWalletPartial(createData.order?.orderId || '')

              // Save payment method if customer opted in (RBI-compliant)
              // Skip if using a saved method (already stored)
              if (savePaymentMethod && !selectedSavedMethodId) {
                savePaymentMethodToBackend('upi', { vpa: upiId })
              }

              clearCart()
              setUpiPolling(false)
              setPaymentProcessing(false)
              setStep('success')
            } else if (pollData.status === 'failed') {
              clearInterval(pollInterval)
              upiPollIntervalRef.current = null
              setUpiPolling(false)
              setPaymentProcessing(false)
              setError(t('checkout.paymentFailed'))
            }
          } catch (err) {
            console.error('[Payment Poll Error]', err)
          }
        }, 3000)

        upiPollIntervalRef.current = pollInterval
        return
      }

      if (data.mode === 'redirect') {
        // Net Banking / Wallet — redirect to bank/wallet page directly (no Razorpay UI)
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl
          return
        }
        throw new Error('No redirect URL provided')
      }

      if (data.fallbackMode) {
        // Server-side payment API not available (standard Razorpay account)
        // Simulate payment processing within our UI — NO checkout.js modal/popup
        // For production with Seamless Pro, the server-side API would work
        console.log('[Payment] Server-side API unavailable, processing payment natively')

        // Show a brief "processing" state, then create the order
        // This simulates the payment being processed without any Razorpay UI
        await new Promise(resolve => setTimeout(resolve, 2000))

        // For test/standard accounts: simulate a successful payment
        // Create the order directly with payment details
        const fallbackCardLast4 = selectedSavedCard ? selectedSavedCard.cardLast4 : cardNumber.replace(/\s/g, '').slice(-4)
        const fallbackCardNetwork = selectedSavedCard ? selectedSavedCard.cardNetwork : detectCardBrand(cardNumber)
        const methodLabel = method === 'card' ? `Card (****${fallbackCardLast4})` :
          method === 'netbanking' ? 'Net Banking' :
          method === 'wallet' ? 'Wallet' : 'UPI'

        const orderCreateRes = await fetch('/api/customer/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: checkoutContext.items,
            shippingAddress: checkoutContext.shippingAddress,
            paymentMethod: 'online',
            paymentDetails: {
              razorpayOrderId: data.razorpayOrderId || '',
              razorpayPaymentId: `pay_simulated_${Date.now()}`,
              paymentOrderId: data.paymentOrderId || '',
              method,
              ...(method === 'upi' ? { vpa: upiId } : {}),
              ...(method === 'netbanking' ? { bank: selectedBank } : {}),
              ...(method === 'wallet' ? { wallet: selectedWallet } : {}),
              ...(method === 'card' ? { cardLast4: fallbackCardLast4, cardNetwork: fallbackCardNetwork } : {}),
              walletAppliedAmount: useWalletBalance ? walletAppliedAmount : 0,
              simulated: true, // Flag to indicate this was simulated (no actual Razorpay payment)
            },
            couponCode: checkoutContext.couponCode,
            couponDiscount: checkoutContext.couponDiscount,
            productDiscount: checkoutContext.productDiscount,
            specialOfferDiscount: checkoutContext.specialOfferDiscount,
            deliveryFee: deliveryCharge,
            // Forward the customer-chosen delivery option so the server
            // can re-compute the fee AUTHORITATIVELY (anti-fraud).
            deliveryOption: selectedDeliveryOption,
            platformFee: 5,
          }),
        })

        const createData = await orderCreateRes.json()
        if (!orderCreateRes.ok) {
          throw new Error(createData.error || 'Failed to create order')
        }

        setOrderNumber(createData.order?.orderId || 'N/A')
        setPaymentMethodName(methodLabel)

        // Apply RealCart Balance partially (Meesho-style split payment)
        await applyWalletPartial(createData.order?.orderId || '')

        // Save payment method if customer opted in (RBI-compliant)
        // Skip if using a saved method (already stored)
        if (savePaymentMethod && !selectedSavedMethodId) {
          savePaymentMethodToBackend(method, data)
        }

        clearCart()
        setPaymentProcessing(false)
        setStep('success')
        return
      }

      if (data.mode === 'complete') {
        // Card / Sandbox — payment captured immediately, create order now
        const orderCreateRes = await fetch('/api/customer/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: checkoutContext.items,
            shippingAddress: checkoutContext.shippingAddress,
            paymentMethod: 'online',
            paymentDetails: {
              razorpayOrderId: data.razorpayOrderId,
              razorpayPaymentId: data.razorpayPaymentId || '',
              paymentOrderId: data.paymentOrderId,
              method: data.method || method,
              bank: data.bank || (method === 'netbanking' ? selectedBank : ''),
              vpa: data.vpa || (method === 'upi' ? upiId : ''),
              wallet: data.wallet || (method === 'wallet' ? selectedWallet : ''),
              cardLast4: data.cardLast4 || '',
              cardNetwork: data.cardNetwork || '',
              walletAppliedAmount: useWalletBalance ? walletAppliedAmount : 0,
            },
            couponCode: checkoutContext.couponCode,
            couponDiscount: checkoutContext.couponDiscount,
            productDiscount: checkoutContext.productDiscount,
            specialOfferDiscount: checkoutContext.specialOfferDiscount,
            deliveryFee: deliveryCharge,
            // Forward the customer-chosen delivery option so the server
            // can re-compute the fee AUTHORITATIVELY (anti-fraud).
            deliveryOption: selectedDeliveryOption,
            platformFee: 5,
          }),
        })

        const createData = await orderCreateRes.json()
        if (!orderCreateRes.ok) {
          throw new Error(createData.error || 'Failed to create order')
        }

        const methodLabel = method === 'card' ? `Card (${data.cardLast4 ? `****${data.cardLast4}` : detectCardBrand(cardNumber)})` : method === 'netbanking' ? 'Net Banking' : method === 'wallet' ? 'Wallet' : 'UPI'
        setOrderNumber(createData.order?.orderId || 'N/A')
        setPaymentMethodName(methodLabel)

        // Apply RealCart Balance partially (Meesho-style split payment)
        await applyWalletPartial(createData.order?.orderId || '')

        // Save payment method if customer opted in (RBI-compliant)
        // Skip if using a saved method (already stored)
        if (savePaymentMethod && !selectedSavedMethodId) {
          savePaymentMethodToBackend(method, data)
        }

        clearCart()
        setPaymentProcessing(false)
        setStep('success')
        return
      }

      // Fallback for unknown modes
      throw new Error(data.error || 'Unexpected payment response')
    } catch (err) {
      setUpiPolling(false)
      setPaymentProcessing(false)
      setError(err instanceof Error ? err.message : t('checkout.paymentFailed'))
    }
  }, [finalTotal, items, user, upiId, cardNumber, cardName, cardExpiry, cardCvv, selectedBank, selectedWallet, paymentSubMethod, isCod, couponApplied, couponCode, couponDiscount, totalSavings, clearCart, detectCardBrand, selectedDeliveryOption, deliveryCharge, selectedSavedCard, savedCardCvv, selectedSavedMethodId, useWalletBalance, walletCoversFull, amountPayable, walletAppliedAmount, t])

  // Apply RealCart Balance partially to an already-created order (Meesho-style
  // split payment). Called after the online payment succeeds + order is created.
  // Debits the wallet for walletAppliedAmount, linked to the order. Fire-and-
  // forget — if it fails, the order is still valid (paid online for the rest).
  const applyWalletPartial = async (orderId: string) => {
    if (!useWalletBalance || walletAppliedAmount <= 0) return
    try {
      const res = await fetch('/api/customer/wallet/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'partial', orderId, amount: walletAppliedAmount }),
      })
      const data = await res.json()
      if (data.success) {
        setWalletBalance(data.newBalance || 0)
      } else {
        console.warn('[Wallet Partial] Failed to debit wallet:', data.error)
      }
    } catch (err) {
      console.warn('[Wallet Partial] Network error:', err)
    }
  }

  // Save payment method to backend (RBI-compliant — no full card numbers)
  const savePaymentMethodToBackend = async (method: string, paymentData: Record<string, unknown>) => {
    try {
      const body: Record<string, unknown> = {}
      if (method === 'upi') {
        body.type = 'upi'
        body.upiId = paymentData.vpa || upiId
        body.upiName = user?.name || ''
      } else if (method === 'card') {
        body.type = 'card'
        body.cardLast4 = paymentData.cardLast4 || cardNumber.replace(/\s/g, '').slice(-4)
        body.cardNetwork = (paymentData.cardNetwork || detectCardBrand(cardNumber) || '').toLowerCase()
        body.cardType = 'debit'
        body.nickname = `${body.cardNetwork} ${body.cardType} ****${body.cardLast4}`
      } else if (method === 'netbanking') {
        body.type = 'netbanking'
        body.bankName = paymentData.bank || selectedBank
        body.bankCode = ''
      } else if (method === 'wallet') {
        body.type = 'wallet'
        body.walletProvider = paymentData.wallet || selectedWallet
      } else {
        return
      }
      await fetch('/api/customer/bank-upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      // Non-critical — payment already succeeded
    }
  }

  // Place order — creates order via API
  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      setError(t('checkout.selectAddress'))
      return
    }

    if (items.length === 0) {
      setError(t('checkout.cartIsEmpty'))
      return
    }

    setError('')

    const selectedAddress = addresses.find(a => a._id === selectedAddressId)
    if (!selectedAddress) {
      setError(t('checkout.selectedAddressNotFound'))
      return
    }

    // Validate payment method selection
    if (!isPaymentValid) {
      // Wallet covers full amount — always valid (handled above), so if we're
      // here with useWalletBalance, it means partial wallet needs another method
      if (useWalletBalance && !walletCoversFull) {
        setError(t('checkout.selectPaymentForRemaining', { amount: formatPrice(amountPayable) }))
      } else if (selectedSavedCard) {
        setError(t('checkout.enterSavedCardCvv'))
      } else if (paymentSubMethod === 'upi' && !upiId.includes('@')) {
        setError(t('checkout.invalidUpiId'))
      } else if (paymentSubMethod === 'card') {
        const cleanCard = cardNumber.replace(/\s/g, '')
        if (cleanCard.length < 13) setError(t('checkout.invalidCardNumber'))
        else if (!cardName.trim()) setError(t('checkout.enterCardholderName'))
        else if (cardExpiry.length !== 5) setError(t('checkout.invalidExpiry'))
        else if (cardCvv.length < 3) setError(t('checkout.invalidCvv'))
      } else if (paymentSubMethod === 'netbanking' && !selectedBank) {
        setError(t('checkout.selectBank'))
      } else if (paymentSubMethod === 'wallet' && !selectedWallet) {
        setError(t('checkout.selectWallet'))
      }
      return
    }

    // === RealCart Balance FULL payment flow ===
    // When the wallet covers the ENTIRE order total, debit the wallet server-
    // side + create the order as 'paid' in one atomic call. No Razorpay.
    // Partial wallet payments (balance < total) fall through to the standard
    // online payment flow below, with the wallet debited after order creation.
    if (walletCoversFull) {
      setPaymentProcessing(true)
      setError('')
      try {
        const res = await fetch('/api/customer/wallet/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              variant: item.selectedVariant,
              originalPrice: item.price,
              sellingPrice: item.sellingPrice,
              effectivePrice: item.effectivePrice,
              hasDiscount: item.hasDiscount,
              discountPercent: item.discountPercent,
            })),
            shippingAddress: {
              name: selectedAddress.name,
              phone: selectedAddress.mobile,
              addressLine1: selectedAddress.addressLine1,
              addressLine2: selectedAddress.addressLine2 || '',
              city: selectedAddress.city,
              state: selectedAddress.state,
              pincode: selectedAddress.pincode,
              type: selectedAddress.type,
            },
            couponCode: couponApplied ? couponCode : undefined,
            couponDiscount: couponApplied ? couponDiscount : undefined,
            productDiscount: totalSavings,
            specialOfferDiscount: totalSpecialOffer,
            deliveryFee: deliveryCharge,
            deliveryOption: selectedDeliveryOption,
            totalAmount: finalTotal,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Wallet payment failed')
        }

        setOrderNumber(data.orderId || 'N/A')
        setPaymentMethodName(`RealCart Balance (₹${finalTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })})`)
        setWalletBalance(data.newBalance || 0)
        clearCart()
        setPaymentProcessing(false)
        setStep('success')
      } catch (err) {
        setPaymentProcessing(false)
        setError(err instanceof Error ? err.message : t('checkout.walletPaymentFailed'))
      }
      return
    }

    if (isCod) {
      // COD flow — create order directly
      setLoading(true)
      try {
        const res = await fetch('/api/customer/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              variant: item.selectedVariant,
              // Pricing details — MUST match what the customer sees at checkout
              originalPrice: item.price,           // Original list price / MRP (e.g. ₹499)
              sellingPrice: item.sellingPrice,     // Regular selling price (before special offer)
              effectivePrice: item.effectivePrice,  // Final price after special offer (e.g. ₹299)
              hasDiscount: item.hasDiscount,
              discountPercent: item.discountPercent,
            })),
            shippingAddress: {
              name: selectedAddress.name,
              phone: selectedAddress.mobile,
              addressLine1: selectedAddress.addressLine1,
              addressLine2: selectedAddress.addressLine2 || '',
              city: selectedAddress.city,
              state: selectedAddress.state,
              pincode: selectedAddress.pincode,
              type: selectedAddress.type,
            },
            paymentMethod: 'cod',
            couponCode: couponApplied ? couponCode : undefined,
            couponDiscount: couponApplied ? couponDiscount : undefined,
            // Product-level discount total (what the customer saves from product discounts)
            productDiscount: totalSavings,
            // Special-offer portion of the product discount (for split display on orders page)
            specialOfferDiscount: totalSpecialOffer,
            // Delivery fee — sent as a hint; server re-computes from deliveryOption.
            deliveryFee: deliveryCharge,
            // Customer-chosen delivery option (standard / express) — server-side
            // authoritative re-computation of fee + ETA.
            deliveryOption: selectedDeliveryOption,
            // COD convenience fee
            codFee: 40,
            // Platform/handling fee
            platformFee: 5,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to place order')
        }

        // Order created successfully
        setOrderNumber(data.order?.orderId || 'N/A')
        setPaymentMethodName('Cash on Delivery')
        clearCart()
        setStep('success')
      } catch (err) {
        setError(err instanceof Error ? err.message : t('checkout.failedToPlaceOrder'))
      } finally {
        setLoading(false)
      }
    } else {
      // Online payment flow — ALL methods processed server-side
      // NO Razorpay checkout.js modal/popup for ANY method
      await handleServerPayment(selectedAddress)
    }
  }

  // UPI Payment Polling Screen
  if (upiPolling) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full text-center shadow-xl"
        >
          {/* Pulsing UPI icon */}
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4 relative">
            <Smartphone className="h-10 w-10 text-emerald-600" />
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-emerald-400"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>

          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">
            {t('checkout.waitingForPayment')}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {t('checkout.openUpiApp')}
          </p>

          {/* Payment details */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('checkout.amount')}</span>
              <span className="font-bold text-gray-800 dark:text-gray-200">{formatPrice(finalTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('bankUpi.upiId')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{upiId}</span>
            </div>
          </div>

          {/* Pulsing status indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            <span className="text-sm text-emerald-600 font-medium">{t('checkout.checkingPaymentStatus')}</span>
          </div>

          {/* Security notice */}
          <div className="flex items-center justify-center gap-1 text-[11px] text-gray-400 mb-4">
            <Lock className="h-3 w-3" />
            {t('checkout.securedBySsl')}
          </div>

          {/* Cancel button */}
          <button
            onClick={() => {
              if (upiPollIntervalRef.current) {
                clearInterval(upiPollIntervalRef.current)
                upiPollIntervalRef.current = null
              }
              setUpiPolling(false)
              setPaymentProcessing(false)
            }}
            className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t('checkout.cancelPayment')}
          </button>
        </motion.div>
      </div>
    )
  }

  // Success screen
  if (step === 'success') {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full text-center shadow-xl"
        >
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">{t('checkout.orderPlacedSuccess')}</h2>
          <p className="text-sm text-gray-500 mb-1">{t('checkout.orderConfirmed')}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-semibold mb-2">{t('checkout.orderId')} {orderNumber}</p>
          {paymentMethodName && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full mb-4">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {paymentMethodName === 'Cash on Delivery' ? t('checkout.paymentCod') : t('checkout.paidVia', { method: paymentMethodName })}
              </span>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => { onClose(); router.push('/customer') }}
              className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t('checkout.continueShopping')}
            </button>
            <button
              onClick={() => { onClose() }}
              className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors"
            >
              {t('checkout.viewOrders')}
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-4">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center px-3 h-12">
          <button
            onClick={step === 'address' ? onClose : () => setStep(step === 'payment' ? 'summary' : 'address')}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="flex-1 text-center text-base font-bold text-gray-800 dark:text-gray-200">
            {step === 'address' ? t('checkout.selectDeliveryAddress') : step === 'summary' ? t('checkout.orderSummary') : t('checkout.payment')}
          </h1>
          <div className="w-9" />
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-4 pb-2 gap-1">
          {(['address', 'summary', 'payment'] as CheckoutStep[]).map((s, i) => (
            <div key={s} className="flex-1 flex items-center gap-1">
              <div className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                (step === s || ['address', 'summary', 'payment'].indexOf(step) > i)
                  ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
              )} />
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        <AnimatePresence mode="wait">
          {/* STEP: Address Selection */}
          {step === 'address' && (
            <motion.div
              key="address"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Existing addresses */}
              {addresses.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('checkout.savedAddresses')}</h3>
                  {addresses.map((addr, idx) => (
                    <AddressCard
                      key={addr._id || `addr-${idx}`}
                      address={addr}
                      isSelected={selectedAddressId === addr._id}
                      onSelect={() => setSelectedAddressId(addr._id!)}
                      onDelete={() => handleDeleteAddress(addr._id!)}
                      onEdit={() => { setEditingAddress(addr); setShowAddressForm(true) }}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{t('checkout.noSavedAddresses')}</p>
                </div>
              )}

              {/* Add new address button */}
              <button
                onClick={() => { setEditingAddress(null); setShowAddressForm(true) }}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t('checkout.addNewAddress')}
              </button>

              {/* Continue button */}
              <button
                onClick={() => { if (selectedAddressId) setStep('summary') }}
                disabled={!selectedAddressId}
                className={cn(
                  'w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors',
                  selectedAddressId
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                )}
              >
                {t('checkout.continue')}
                <ChevronRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {/* STEP: Order Summary */}
          {step === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Delivery Address */}
              {addresses.find(a => a._id === selectedAddressId) && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{t('checkout.deliveryAddress')}</h3>
                    <button onClick={() => setStep('address')} className="text-[11px] font-semibold text-blue-500">{t('checkout.change')}</button>
                  </div>
                  {(() => {
                    const addr = addresses.find(a => a._id === selectedAddressId)!
                    return (
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{addr.name} <span className="font-normal text-gray-400 text-xs">{addr.type === 'home' ? t('addresses.home') : addr.type === 'work' ? t('addresses.work') : t('common.other')}</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">{addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}, {addr.city}, {addr.state} - {addr.pincode}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{t('checkout.mobile')} {addr.mobile}</p>
                        {/* Delivery estimate for the selected address pincode */}
                        <CartDeliveryEstimate
                          pincode={addr.pincode}
                          state={addr.state}
                          items={items.map((it) => ({ productId: it.productId, quantity: it.quantity, effectivePrice: it.effectivePrice }))}
                          selectedOption={selectedDeliveryOption}
                          className="mt-1.5"
                        />
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Order Items */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
                  {t('checkout.orderItems', { count: totalItems })}
                </h3>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.productId} className="flex gap-3">
                      <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-5 w-5 text-gray-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{item.name}</p>
                        <p className="text-xs text-gray-400">{t('checkout.qty')} {item.quantity} {item.seller ? t('checkout.seller') + ` ${item.seller}` : ''}</p>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-sm font-bold">{formatPrice(item.effectivePrice * item.quantity)}</span>
                          {item.hasDiscount && <span className="text-[10px] text-gray-400 line-through">{formatPrice(item.price * item.quantity)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Option Selector — Standard vs Express */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-emerald-500" />
                    {t('checkout.deliveryOption')}
                  </h3>
                  {deliveryOptionLoading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                  )}
                </div>

                {deliveryOptions.length === 0 && !deliveryOptionLoading ? (
                  /* No address selected yet, or pincode not serviceable */
                  <p className="text-xs text-gray-400">
                    {addresses.find((a) => a._id === selectedAddressId)
                      ? t('checkout.selectValidAddress')
                      : t('checkout.pleaseSelectAddress')}
                  </p>
                ) : deliveryOptions.length === 0 ? (
                  /* Loading placeholder */
                  <div className="space-y-2">
                    <div className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
                    <div className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deliveryOptions.map((opt) => {
                      const isSelected = selectedDeliveryOption === opt.id && opt.available
                      const isExpress = opt.id === 'express'
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={!opt.available}
                          onClick={() => {
                            if (!opt.available) return
                            setSelectedDeliveryOption(opt.id)
                            setDeliveryOptionManuallyPicked(true)
                          }}
                          className={cn(
                            'w-full text-left rounded-lg border-2 p-3 transition-all',
                            isSelected
                              ? isExpress
                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                                : 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                              : opt.available
                                ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                : 'border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            {/* Radio indicator */}
                            <div
                              className={cn(
                                'mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center',
                                isSelected
                                  ? isExpress
                                    ? 'border-amber-500 bg-amber-500'
                                    : 'border-emerald-500 bg-emerald-500'
                                  : 'border-gray-300 dark:border-gray-600',
                              )}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  {isExpress && <Zap className="h-3.5 w-3.5 text-amber-500" />}
                                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    {opt.label}
                                  </p>
                                  {isExpress && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                                      {t('checkout.faster')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  {opt.charge === 0 ? (
                                    <span className="text-sm font-semibold text-green-600">{t('cart.free')}</span>
                                  ) : (
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                      {formatPrice(opt.charge)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                {opt.tagline}
                              </p>
                              {opt.etaLabel && (
                                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                                  <Truck className="h-2.5 w-2.5" />
                                  {t('checkout.deliveryBy', { eta: opt.etaLabel })}
                                </p>
                              )}
                              {!opt.available && opt.unavailableReason && (
                                <p className="text-[11px] text-red-500 mt-0.5">
                                  {opt.unavailableReason}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                    <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      {t('checkout.deliveryFeeNote')}
                    </p>
                  </div>
                )}
              </div>

              {/* Price Summary */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">{t('cart.priceDetails')}</h3>
                {renderPriceBreakup()}
              </div>

              {/* Continue to Payment — disabled when delivery is unavailable */}
              <button
                onClick={() => { if (canContinueToPayment) setStep('payment') }}
                disabled={!canContinueToPayment}
                className={cn(
                  'w-full h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors',
                  canContinueToPayment
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed',
                )}
              >
                {deliveryOptionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('checkout.checkingDelivery')}
                  </>
                ) : (
                  <>
                    {t('checkout.continueToPayment')}
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
              {/* Show reason when button is disabled (not during loading) */}
              {!canContinueToPayment && !deliveryOptionLoading && deliveryBlockReason && (
                <p className="text-xs text-red-500 text-center flex items-center justify-center gap-1.5 -mt-1">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{deliveryBlockReason}</span>
                </p>
              )}
            </motion.div>
          )}

          {/* STEP: Payment */}
          {step === 'payment' && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* ── RealCart Balance (wallet) — Meesho-style toggle ── */}
              {/* NOT mutually exclusive. When toggled ON, the available balance  */}
              {/* is applied to the order. If it covers the full total, no other  */}
              {/* method is needed. If partial, the remainder is paid via UPI/etc. */}
              {!isCod && walletBalance > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                  'relative overflow-hidden rounded-xl border-2 transition-all',
                  useWalletBalance
                    ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-900/10'
                    : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-violet-200 dark:hover:border-violet-800'
                )}>
                  <button
                    onClick={() => {
                      setUseWalletBalance(!useWalletBalance)
                      setError('')
                    }}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div className={cn(
                      'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      useWalletBalance
                        ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                        : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
                    )}>
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{t('wallet.title')}</p>
                      {walletLoading ? (
                        <p className="text-[11px] text-gray-400">{t('checkout.loadingBalance')}</p>
                      ) : (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {t('checkout.available')} <span className="font-semibold text-violet-600 dark:text-violet-400">₹{walletBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          {useWalletBalance && (
                            <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                              {t('checkout.balanceApplied', { amount: walletAppliedAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 }) })}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {/* Toggle switch (not a radio — allows combining with other methods) */}
                    <div className={cn(
                      'flex-shrink-0 h-6 w-11 rounded-full transition-colors flex items-center px-0.5',
                      useWalletBalance ? 'bg-violet-500 justify-end' : 'bg-gray-300 dark:bg-gray-700 justify-start'
                    )}>
                      <div className="h-5 w-5 rounded-full bg-white shadow-sm transition-transform" />
                    </div>
                  </button>
                  {/* Partial balance info when selected but doesn't cover full amount */}
                  {useWalletBalance && !walletCoversFull && (
                    <div className="px-4 pb-3">
                      <div className="flex items-start gap-2 p-2.5 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-100 dark:border-violet-800/30">
                        <Wallet className="h-3.5 w-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-[10px] text-violet-700 dark:text-violet-400 font-semibold">
                            {t('checkout.balanceSplit', { applied: walletAppliedAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 }), payable: amountPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 }) })}
                          </p>
                          <p className="text-[10px] text-violet-600/70 dark:text-violet-500/70 mt-0.5">
                            {t('checkout.selectPaymentMethod')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Saved Payment Methods — Meesho/Flipkart-style quick select ── */}
              {/* Hidden when wallet covers the FULL order (no other method needed).  */}
              {/* Shown for partial wallet (need a method for the remainder) + no wallet. */}
              {!isCod && !walletCoversFull && savedMethodsLoading && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                  <div className="h-4 w-40 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-3" />
                  <div className="space-y-2">
                    <div className="h-14 bg-gray-50 dark:bg-gray-800/50 rounded-xl animate-pulse" />
                    <div className="h-14 bg-gray-50 dark:bg-gray-800/50 rounded-xl animate-pulse" />
                  </div>
                </div>
              )}
              {!isCod && !walletCoversFull && !savedMethodsLoading && savedMethods.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 px-4 pt-4 pb-2 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-amber-500" />
                    {t('checkout.savedPaymentMethods')}
                  </h3>
                  <div className="px-4 pb-3 space-y-2">
                    {savedMethods.map((m) => {
                      const isSelected = selectedSavedMethodId === m.id
                      const isCard = m.type === 'card'
                      const iconBg = m.type === 'upi' ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400' :
                        m.type === 'card' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                        m.type === 'netbanking' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' :
                        'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400'
                      const label = m.type === 'upi' ? m.upiId :
                        m.type === 'card' ? `${m.cardNetwork} ${m.cardType} ••••${m.cardLast4}` :
                        m.type === 'netbanking' ? getBankFullName(m.bankCode || m.bankName) :
                        getWalletDisplayName(m.walletProvider)
                      const subLabel = m.type === 'upi' ? 'UPI' :
                        m.type === 'card' ? `${m.cardType} Card` :
                        m.type === 'netbanking' ? 'Net Banking' : 'Wallet'
                      return (
                        <div key={m.id}>
                          <button
                            onClick={() => applySavedMethod(m)}
                            className={cn(
                              'w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left',
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10'
                                : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                            )}
                          >
                            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
                              {m.type === 'upi' ? <Smartphone className="h-4 w-4" /> :
                                m.type === 'card' ? <CreditCard className="h-4 w-4" /> :
                                m.type === 'netbanking' ? <Landmark className="h-4 w-4" /> :
                                <Wallet className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{label}</p>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{subLabel}</p>
                            </div>
                            {isSelected && (
                              <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                <Check className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </button>
                          {/* Saved card — CVV input (RBI-compliant: only CVV re-entered) */}
                          {isSelected && isCard && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 ml-12">
                                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">{t('checkout.enterCvv')}</label>
                                <input
                                  value={savedCardCvv}
                                  onChange={(e) => { setSavedCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
                                  placeholder={t('checkout.cvvPlaceholder')}
                                  type="password"
                                  className={cn(
                                    'w-full h-11 px-3 rounded-lg border bg-white dark:bg-gray-800 text-sm font-mono tracking-widest focus:outline-none transition-colors',
                                    savedCardCvv && savedCardCvv.length < 3
                                      ? 'border-red-300 focus:border-red-500'
                                      : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                                  )}
                                  inputMode="numeric"
                                />
                                <div className="flex items-start gap-1.5 mt-1.5">
                                  <Lock className="h-3 w-3 text-emerald-600 flex-shrink-0 mt-0.5" />
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                    {t('checkout.rbiNote')}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      )
                    })}
                    {/* Use new payment method — reveals the full tab UI */}
                    {!useNewMethod && (
                      <button
                        onClick={() => {
                          setUseNewMethod(true)
                          setSelectedSavedMethodId('')
                          setSavedCardCvv('')
                          setError('')
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-700 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/5 transition-all text-left"
                      >
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          <Plus className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t('checkout.useNewPaymentMethod')}</p>
                          <p className="text-[10px] text-gray-400">{t('checkout.useNewPaymentMethodDesc')}</p>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Payment Method Tabs — Flipkart-style horizontal tabs */}
              {/* Hidden when a saved method is selected (Meesho-style).        */}
              {/* Shown for COD, "use new method", or when no saved methods.    */}
              {(isCod || useNewMethod || savedMethods.length === 0) && !walletCoversFull && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 px-4 pt-4 pb-2">{t('checkout.choosePaymentMethod')}</h3>

                {/* Horizontal tab buttons */}
                <div className="flex border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide">
                  {([
                    { id: 'upi' as const, label: t('checkout.tabUpi'), icon: Smartphone },
                    { id: 'card' as const, label: t('checkout.tabCard'), icon: CreditCard },
                    { id: 'netbanking' as const, label: t('checkout.tabNetBanking'), icon: Landmark },
                    { id: 'wallet' as const, label: t('checkout.tabWallet'), icon: Wallet },
                    { id: 'cod' as const, label: t('checkout.tabCod'), icon: Banknote },
                  ]).map((tab) => {
                    const isActive = tab.id === 'cod' ? isCod : !isCod && paymentSubMethod === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          if (tab.id === 'cod') {
                            setIsCod(true)
                          } else {
                            setIsCod(false)
                            setPaymentSubMethod(tab.id)
                            // If the customer has saved methods, switching to
                            // an online tab means they want manual entry —
                            // keep the tabs visible (use new method mode).
                            if (savedMethods.length > 0) {
                              setUseNewMethod(true)
                              setSelectedSavedMethodId('')
                              setSavedCardCvv('')
                            }
                          }
                          setError('')
                        }}
                        className={cn(
                          'flex-1 min-w-[64px] flex flex-col items-center gap-1 py-3 px-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap',
                          isActive
                            ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10'
                            : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                        )}
                      >
                        <tab.icon className={cn('h-5 w-5', isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400')} />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                {/* Tab Content */}
                <div className="p-4">
                  {/* UPI Tab Content */}
                  {!isCod && paymentSubMethod === 'upi' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      {/* UPI ID Input */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">{t('checkout.enterUpiId')}</label>
                        <input
                          value={upiId}
                          onChange={(e) => { setUpiId(e.target.value.trim()); setError('') }}
                          placeholder={t('checkout.upiIdPlaceholder')}
                          className={cn(
                            'w-full h-11 px-3 rounded-lg border bg-white dark:bg-gray-800 text-sm focus:outline-none transition-colors',
                            upiId && !upiId.includes('@')
                              ? 'border-red-300 focus:border-red-500'
                              : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                          )}
                        />
                        {upiId && !upiId.includes('@') && (
                          <p className="text-[11px] text-red-500 mt-1">{t('checkout.upiIdInvalid')}</p>
                        )}
                        {upiId.includes('@') && (
                          <p className="text-[11px] text-emerald-600 mt-1">{t('checkout.upiIdValid')}</p>
                        )}
                      </div>

                      {/* Popular UPI Apps — clicking fills the UPI handle suffix */}
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">{t('checkout.quickFillUpi')}</p>
                        <div className="grid grid-cols-4 gap-2">
                          {([
                            { name: 'Google Pay', suffix: '@okicici', color: '#4285F4' },
                            { name: 'PhonePe', suffix: '@ybl', color: '#5F259F' },
                            { name: 'Paytm', suffix: '@paytm', color: '#00BAF2' },
                            { name: 'BHIM', suffix: '@upi', color: '#005A84' },
                          ]).map((app) => {
                            // Highlight if UPI ID ends with this app's suffix
                            const isSelected = upiId.endsWith(app.suffix)
                            return (
                              <button
                                key={app.name}
                                onClick={() => {
                                  // If user has typed a username before @, preserve it
                                  const username = upiId.includes('@') ? upiId.split('@')[0] : (upiId || 'yourname')
                                  setUpiId(username + app.suffix)
                                  setError('')
                                }}
                                className={cn(
                                  'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all',
                                  isSelected
                                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10'
                                    : 'border-gray-100 dark:border-gray-800 hover:border-gray-200'
                                )}
                              >
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                  style={{ backgroundColor: app.color }}
                                >
                                  {app.name.charAt(0)}
                                </div>
                                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 text-center leading-tight">{app.name}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Card Tab Content */}
                  {!isCod && paymentSubMethod === 'card' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      {/* Card Brand Detection */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('checkout.acceptedCards')}</span>
                        {['Visa', 'Mastercard', 'RuPay'].map((brand) => {
                          const cleanCard = cardNumber.replace(/\s/g, '')
                          const detected = detectCardBrand(cleanCard)
                          const isDetected = detected === brand
                          return (
                            <span key={brand} className={cn(
                              "px-2 py-0.5 rounded text-[11px] font-semibold transition-colors",
                              isDetected ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                            )}>
                              {brand}
                            </span>
                          )
                        })}
                      </div>

                      {/* Card Number */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">{t('checkout.cardNumber')}</label>
                        <div className="relative">
                          <input
                            value={cardNumber}
                            onChange={(e) => { setCardNumber(formatCardNumber(e.target.value)); setError('') }}
                            placeholder={t('checkout.cardNumberPlaceholder')}
                            className={cn(
                              'w-full h-11 px-3 pr-12 rounded-lg border bg-white dark:bg-gray-800 text-sm font-mono tracking-wider focus:outline-none transition-colors',
                              cardNumber && cardNumber.replace(/\s/g, '').length < 13
                                ? 'border-red-300 focus:border-red-500'
                                : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                            )}
                            inputMode="numeric"
                          />
                          {detectCardBrand(cardNumber.replace(/\s/g, '')) && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600">
                              {detectCardBrand(cardNumber.replace(/\s/g, ''))}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Cardholder Name */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">{t('checkout.cardholderName')}</label>
                        <input
                          value={cardName}
                          onChange={(e) => { setCardName(e.target.value); setError('') }}
                          placeholder={t('checkout.nameOnCardPlaceholder')}
                          className={cn(
                            'w-full h-11 px-3 rounded-lg border bg-white dark:bg-gray-800 text-sm focus:outline-none transition-colors',
                            cardName && !cardName.trim()
                              ? 'border-red-300 focus:border-red-500'
                              : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                          )}
                        />
                      </div>

                      {/* Expiry & CVV */}
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">{t('checkout.expiry')}</label>
                          <input
                            value={cardExpiry}
                            onChange={(e) => { setCardExpiry(formatExpiry(e.target.value)); setError('') }}
                            placeholder={t('checkout.expiryPlaceholder')}
                            className={cn(
                              'w-full h-11 px-3 rounded-lg border bg-white dark:bg-gray-800 text-sm font-mono focus:outline-none transition-colors',
                              cardExpiry && cardExpiry.length === 5
                                ? 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                                : cardExpiry && cardExpiry.length > 0
                                  ? 'border-red-300 focus:border-red-500'
                                  : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                            )}
                            inputMode="numeric"
                          />
                        </div>
                        <div className="w-28">
                          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 block">{t('checkout.cvv')}</label>
                          <input
                            value={cardCvv}
                            onChange={(e) => { setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
                            placeholder={t('checkout.cvvPlaceholder')}
                            type="password"
                            className={cn(
                              'w-full h-11 px-3 rounded-lg border bg-white dark:bg-gray-800 text-sm font-mono tracking-widest focus:outline-none transition-colors',
                              cardCvv && cardCvv.length < 3
                                ? 'border-red-300 focus:border-red-500'
                                : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                            )}
                            inputMode="numeric"
                          />
                        </div>
                      </div>

                      {/* Security notice */}
                      <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800/20">
                        <Lock className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                          {t('checkout.cardSecurityNote')}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Net Banking Tab Content */}
                  {!isCod && paymentSubMethod === 'netbanking' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('checkout.popularBanks')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { name: 'SBI', code: 'SBIN', fullName: 'State Bank of India' },
                          { name: 'HDFC', code: 'HDFC', fullName: 'HDFC Bank' },
                          { name: 'ICICI', code: 'ICIC', fullName: 'ICICI Bank' },
                          { name: 'Axis', code: 'UTIB', fullName: 'Axis Bank' },
                          { name: 'Kotak', code: 'KKBK', fullName: 'Kotak Mahindra Bank' },
                          { name: 'PNB', code: 'PUNB', fullName: 'Punjab National Bank' },
                          { name: 'BoB', code: 'BARB_R', fullName: 'Bank of Baroda' },
                          { name: 'Canara', code: 'CNRB', fullName: 'Canara Bank' },
                        ]).map((bank) => (
                          <button
                            key={bank.code}
                            onClick={() => { setSelectedBank(bank.code); setError('') }}
                            className={cn(
                              'flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left',
                              selectedBank === bank.code
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10'
                                : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                            )}
                          >
                            <div className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                              selectedBank === bank.code
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                            )}>
                              {bank.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className={cn(
                                'text-xs font-semibold truncate',
                                selectedBank === bank.code ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'
                              )}>
                                {bank.name}
                              </p>
                              <p className="text-[10px] text-gray-400 truncate">{bank.fullName}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Wallet Tab Content */}
                  {!isCod && paymentSubMethod === 'wallet' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('checkout.popularWallets')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { name: 'Paytm Wallet', code: 'paytm', color: '#00BAF2' },
                          { name: 'Mobikwik', code: 'mobikwik', color: '#E8352E' },
                          { name: 'Airtel Money', code: 'airtelmoney', color: '#ED1C24' },
                          { name: 'Ola Money', code: 'olamoney', color: '#36B37E' },
                          { name: 'FreeCharge', code: 'freecharge', color: '#FF6600' },
                          { name: 'JioMoney', code: 'jiomoney', color: '#0A2463' },
                        ]).map((w) => (
                          <button
                            key={w.code}
                            onClick={() => { setSelectedWallet(w.code); setError('') }}
                            className={cn(
                              'flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left',
                              selectedWallet === w.code
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10'
                                : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                            )}
                          >
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                              style={{ backgroundColor: w.color }}
                            >
                              {w.name.charAt(0)}
                            </div>
                            <p className={cn(
                              'text-xs font-semibold truncate',
                              selectedWallet === w.code ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'
                            )}>
                              {w.name}
                            </p>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* COD Tab Content */}
                  {isCod && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20">
                        <Banknote className="h-10 w-10 text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('paymentRefund.cashOnDelivery')}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{t('checkout.codDesc')}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 text-center">
                        {t('checkout.codNote')}
                      </p>
                    </motion.div>
                  )}
                </div>
              </div>
              )}

              {/* Secure payment notice (for online methods) */}
              {!isCod && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-200 dark:border-emerald-800/30"
                >
                  <Lock className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    {t('checkout.securePaymentNote')}
                  </p>
                </motion.div>
              )}

              {/* Coupon Code Section */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
                  <Tag className="h-4 w-4 text-orange-500" />
                  {t('checkout.applyCoupon')}
                </h3>
                {couponApplied ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-emerald-600" />
                      <div>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{couponCode}</p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-500">{t('checkout.youSaveAmount', { amount: formatPrice(couponDiscount) })}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleRemoveCoupon}
                      className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                    >
                      <X className="h-4 w-4 text-emerald-600" />
                    </button>
                  </motion.div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={couponCode}
                      onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError('') }}
                      placeholder={t('checkout.enterCouponCode')}
                      className="flex-1 h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium uppercase tracking-wider focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      onClick={() => handleApplyCoupon()}
                      disabled={couponLoading || !couponCode.trim()}
                      className={cn(
                        'px-4 h-10 rounded-lg font-bold text-xs transition-colors',
                        !couponLoading && couponCode.trim()
                          ? 'bg-orange-500 hover:bg-orange-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('checkout.apply')}
                    </button>
                  </div>
                )}
                {couponError && (
                  <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                    <X className="h-3 w-3" />
                    {couponError}
                  </p>
                )}

                {/* Available Coupons — collapsible list of coupons the
                    customer can use on this cart. Clicking one auto-fills
                    the code and applies it. Matches Flipkart/Meesho UX. */}
                {availableCoupons.length > 0 && !couponApplied && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowAvailableCoupons((v) => !v)}
                      className="flex items-center justify-between w-full text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" />
                        {t('checkout.couponsAvailable', { count: availableCoupons.filter((c) => c.applicable).length })}
                      </span>
                      <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showAvailableCoupons && 'rotate-90')} />
                    </button>
                    {showAvailableCoupons && (
                      <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                        {availableCoupons.map((ac) => {
                          const c = ac.coupon
                          const offerText = c.discountType === 'percentage'
                            ? (c.maxDiscount > 0 ? `${c.discountValue}% OFF up to ₹${c.maxDiscount}` : `${c.discountValue}% OFF`)
                            : `₹${c.discountValue} OFF`
                          return (
                            <div
                              key={c._id}
                              className={cn(
                                'p-2.5 rounded-lg border transition-colors',
                                ac.applicable
                                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                                  : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 opacity-70',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{c.code}</span>
                                    {c.featured && <Sparkles className="h-3 w-3 text-amber-500" />}
                                  </div>
                                  <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 mt-0.5">{offerText}</p>
                                  {c.displayText && (
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{c.displayText}</p>
                                  )}
                                  {!ac.applicable && ac.reason && (
                                    <p className="text-[10px] text-red-400 mt-0.5">{ac.reason}</p>
                                  )}
                                </div>
                                {ac.applicable && (
                                  <button
                                    onClick={() => {
                                      setCouponCode(c.code)
                                      handleApplyCoupon(c.code)
                                      setShowAvailableCoupons(false)
                                    }}
                                    disabled={couponLoading}
                                    className="shrink-0 px-2.5 py-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold disabled:opacity-50 transition-colors"
                                  >
                                    {t('checkout.apply')}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {availableCouponsLoading && !couponApplied && (
                  <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t('checkout.checkingCoupons')}
                  </p>
                )}
              </div>

              {/* Price Summary in Payment Step */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">{t('cart.priceDetails')}</h3>
                {renderPriceBreakup()}
              </div>

              {/* Security badges */}
              <div className="flex items-center justify-center gap-6 py-2">
                <div className="flex items-center gap-1 text-[11px] text-gray-400">
                  <ShieldCheck className="h-4 w-4" />
                  {t('checkout.safePayment')}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-gray-400">
                  <Truck className="h-4 w-4" />
                  {t('common.freeDelivery')}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-800/30">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
                </div>
              )}

              {/* Save Payment Method checkbox (RBI-compliant) */}
              {/* Hidden when using a saved method (already stored) */}
              {!isCod && !selectedSavedMethodId && !walletCoversFull && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={savePaymentMethod}
                    onChange={(e) => setSavePaymentMethod(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {t('checkout.savePaymentMethod')}
                  </span>
                </label>
              )}

              {/* Place Order / Pay Now */}
              <button
                onClick={handlePlaceOrder}
                disabled={loading || paymentProcessing || !isPaymentValid}
                className={cn(
                  'w-full h-14 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg',
                  loading || paymentProcessing || !isPaymentValid
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                    : isCod
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                )}
              >
                {loading || paymentProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {paymentProcessing ? t('checkout.processingPayment') : t('checkout.placingOrder')}
                  </>
                ) : (
                  <>
                    {isCod ? (
                      <>
                        {t('checkout.placeOrderAmount', { amount: formatPrice(finalTotal) })}
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        {t('checkout.payAmount', { amount: formatPrice(useWalletBalance && !walletCoversFull ? amountPayable : finalTotal) })}
                      </>
                    )}
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Address Form Modal */}
      <AddressFormModal
        isOpen={showAddressForm}
        onClose={() => { setShowAddressForm(false); setEditingAddress(null) }}
        onSave={handleSaveAddress}
        editAddress={editingAddress}
      />
    </div>
  )
}
