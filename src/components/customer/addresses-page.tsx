'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Check,
  X,
  Edit3,
  Trash2,
  Loader2,
  MapPin,
  Home,
  Building2,
  Briefcase,
  Star,
  ArrowLeft,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useLanguage } from '@/components/providers/language-provider'
import { Address } from './types'

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

function AddressCard({ address, onEdit, onDelete, onSetDefault }: {
  address: Address
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  const { t } = useLanguage()
  const typeIcon = address.type === 'home' ? Home : address.type === 'work' ? Building2 : Briefcase

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'relative p-4 rounded-xl border-2 transition-all bg-white dark:bg-gray-900',
        address.isDefault
          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
      )}
    >
      {/* Default Badge */}
      {address.isDefault && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-emerald-500 rounded-full">
          <Star className="h-3 w-3 text-white fill-white" />
          <span className="text-[10px] font-bold text-white">{t('addresses.default')}</span>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
          address.isDefault ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-800'
        )}>
          {(() => { const Icon = typeIcon; return <Icon className={cn('h-5 w-5', address.isDefault ? 'text-emerald-600' : 'text-gray-400')} /> })()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{address.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 uppercase font-medium">
              {address.type === 'home' ? t('addresses.home') : address.type === 'work' ? t('addresses.work') : t('common.other')}
            </span>
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

          <div className="flex items-center gap-3 mt-3">
            <button onClick={onEdit} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
              <Edit3 className="h-3 w-3" />
              {t('addresses.edit')}
            </button>
            <button onClick={onDelete} className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex items-center gap-1">
              <Trash2 className="h-3 w-3" />
              {t('addresses.delete')}
            </button>
            {!address.isDefault && (
              <button onClick={onSetDefault} className="text-[11px] font-semibold text-orange-500 hover:text-orange-600 flex items-center gap-1">
                <Star className="h-3 w-3" />
                {t('addresses.setDefault')}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Addresses Page                                                  */
/* ------------------------------------------------------------------ */

export function AddressesPage({ onBack }: { onBack?: () => void }) {
  const { t } = useLanguage()
  const { authenticated } = useCustomerAuth()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authenticated) return
    fetchAddresses()
  }, [authenticated])

  // Auto-focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showSearch])

  const fetchAddresses = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/customer/addresses')
      if (res.ok) {
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        setAddresses(data.addresses || [])
      }
    } catch (err) {
      console.error('Fetch addresses error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveAddress = async (addr: Omit<Address, '_id'>) => {
    try {
      if (editingAddress?._id) {
        await fetch('/api/customer/addresses', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _id: editingAddress._id, ...addr }),
        })
      } else {
        await fetch('/api/customer/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(addr),
        })
      }
      await fetchAddresses()
    } catch (err) {
      console.error('Save address error:', err)
    }
  }

  const handleDeleteAddress = async (id: string) => {
    if (!confirm(t('addresses.deleteConfirm'))) return
    setDeletingId(id)
    try {
      await fetch('/api/customer/addresses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressId: id }),
      })
      setAddresses(prev => prev.filter(a => a._id !== id))
    } catch (err) {
      console.error('Delete address error:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await fetch('/api/customer/addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: id, isDefault: true }),
      })
      await fetchAddresses()
    } catch (err) {
      console.error('Set default error:', err)
    }
  }

  // Filter addresses by search query
  const filteredAddresses = searchQuery.trim()
    ? addresses.filter(a => {
        const q = searchQuery.toLowerCase()
        return (
          a.name?.toLowerCase().includes(q) ||
          a.city?.toLowerCase().includes(q) ||
          a.state?.toLowerCase().includes(q) ||
          a.pincode?.includes(q) ||
          a.addressLine1?.toLowerCase().includes(q) ||
          (a.addressLine2 && a.addressLine2.toLowerCase().includes(q)) ||
          (a.landmark && a.landmark.toLowerCase().includes(q)) ||
          a.type?.toLowerCase().includes(q)
        )
      })
    : addresses

  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-4">
      {/* ── Sticky Header Bar: Back arrow + "My Addresses" + Search/New icons ── */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            )}
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">
              {t('addresses.myAddresses')}
            </h1>
          </div>

          {/* Right Icons: Search → New Address */}
          <div className="flex items-center gap-0.5">
            {/* Search Icon */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="h-9 w-9 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* New Address Button — green circle with white plus (reference design) */}
            <button
              onClick={() => { setEditingAddress(null); setShowForm(true) }}
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500 transition-colors">
                <Plus className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </span>
            </button>
          </div>
        </div>

        {/* Expandable Search Input */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="flex items-center h-9 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 gap-2 mt-2">
                <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('addresses.searchPlaceholder')}
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => { setShowSearch(false); setSearchQuery('') }} className="text-gray-400 hover:text-gray-600 ml-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {filteredAddresses.length > 0 ? (
          <div className="space-y-3">
            {/* Default addresses first */}
            {filteredAddresses.filter(a => a.isDefault).map((addr, idx) => (
              <AddressCard
                key={addr._id || `addr-default-${idx}`}
                address={addr}
                onEdit={() => { setEditingAddress(addr); setShowForm(true) }}
                onDelete={() => handleDeleteAddress(addr._id!)}
                onSetDefault={() => handleSetDefault(addr._id!)}
              />
            ))}
            {/* Non-default addresses */}
            {filteredAddresses.filter(a => !a.isDefault).map((addr, idx) => (
              <AddressCard
                key={addr._id || `addr-other-${idx}`}
                address={addr}
                onEdit={() => { setEditingAddress(addr); setShowForm(true) }}
                onDelete={() => handleDeleteAddress(addr._id!)}
                onSetDefault={() => handleSetDefault(addr._id!)}
              />
            ))}

            {/* Summary */}
            <div className="text-center pt-2">
              <p className="text-xs text-gray-400">{t('addresses.savedCount', { count: filteredAddresses.length })}</p>
            </div>
          </div>
        ) : searchQuery.trim() && addresses.length > 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Search className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">{t('addresses.noMatching')}</h3>
            <p className="text-sm text-gray-500">{t('addresses.tryDifferentSearch')}</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <MapPin className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">{t('addresses.noSavedAddresses')}</h3>
            <p className="text-sm text-gray-500 mb-6">{t('addresses.noSavedAddressesDesc')}</p>
            <button
              onClick={() => { setEditingAddress(null); setShowForm(true) }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('addresses.addAddress')}
            </button>
          </div>
        )}
      </div>

      {/* Address Form Modal */}
      <AddressFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingAddress(null) }}
        onSave={handleSaveAddress}
        editAddress={editingAddress}
      />
    </div>
  )
}
