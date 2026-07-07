'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  Truck,
  MapPin,
  Clock,
  Zap,
  Banknote,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_SELLER_DELIVERY_SETTINGS,
  type SellerDeliverySettings,
  type DeliverySlaConfig,
  type ZoneSla,
} from '@/lib/delivery-engine'

/* ------------------------------------------------------------------ */
/*  Animation variants                                                */
/* ------------------------------------------------------------------ */

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const toastSlide: Variants = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/*  Indian states list (for the datalist autocomplete)                */
/* ------------------------------------------------------------------ */

const INDIAN_STATES: string[] = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
]

/* ------------------------------------------------------------------ */
/*  Color palette helpers                                             */
/* ------------------------------------------------------------------ */

const colorClasses: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' },
  sky: { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400' },
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400' },
}

/* ------------------------------------------------------------------ */
/*  Zone metadata                                                     */
/* ------------------------------------------------------------------ */

interface ZoneMeta {
  key: 'sameCity' | 'sameState' | 'regional' | 'national'
  label: string
  description: string
  color: string
}

const ZONES: ZoneMeta[] = [
  {
    key: 'sameCity',
    label: 'Same City',
    description: 'Buyer & your store share the first 3 pincode digits.',
    color: 'emerald',
  },
  {
    key: 'sameState',
    label: 'Same State',
    description: 'Buyer in the same state as your store.',
    color: 'amber',
  },
  {
    key: 'regional',
    label: 'Regional',
    description: 'Buyer in the same geographic region (N/S/E/W/Central).',
    color: 'sky',
  },
  {
    key: 'national',
    label: 'National',
    description: 'Buyer in a different region (rest of India).',
    color: 'violet',
  },
]

/* ------------------------------------------------------------------ */
/*  Form state                                                        */
/* ------------------------------------------------------------------ */

interface ZoneForm {
  min: string
  max: string
}

interface FormState {
  shipsFromPincode: string
  shipsFromState: string
  handlingDays: number
  codAvailable: boolean
  expressAvailable: boolean
  customSla: Record<ZoneMeta['key'], ZoneForm>
  updatedAt: string | null
}

const DEFAULT_FORM: FormState = {
  shipsFromPincode: '',
  shipsFromState: '',
  handlingDays: DEFAULT_SELLER_DELIVERY_SETTINGS.handlingDays,
  codAvailable: DEFAULT_SELLER_DELIVERY_SETTINGS.codAvailable,
  expressAvailable: DEFAULT_SELLER_DELIVERY_SETTINGS.expressAvailable,
  customSla: {
    sameCity: { min: '', max: '' },
    sameState: { min: '', max: '' },
    regional: { min: '', max: '' },
    national: { min: '', max: '' },
  },
  updatedAt: null,
}

function emptyZone(): ZoneForm {
  return { min: '', max: '' }
}

function zoneHasValue(z: ZoneForm): boolean {
  return z.min.trim() !== '' || z.max.trim() !== ''
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function SellerDeliveryPage() {
  const { authenticated, loading } = useSellerAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/seller')
    }
  }, [authenticated, loading, router])

  if (loading || !authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <DeliveryContent />
}

/* ------------------------------------------------------------------ */
/*  Delivery Content                                                   */
/* ------------------------------------------------------------------ */

function DeliveryContent() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCustomSla, setShowCustomSla] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Fetch settings                                                   */
  /* ---------------------------------------------------------------- */

  const fetchSettings = useCallback(async () => {
    setFetching(true)
    try {
      const res = await fetch('/api/seller/delivery-settings')
      if (!res.ok) {
        throw new Error('Failed to load delivery settings')
      }
      const data = (await res.json().catch(() => ({}))) as { settings: SellerDeliverySettings }
      const s: SellerDeliverySettings = {
        ...DEFAULT_SELLER_DELIVERY_SETTINGS,
        ...(data.settings || {}),
      }
      const cs = s.customSla || {}
      const toZone = (z: ZoneSla | undefined): ZoneForm =>
        z
          ? { min: z.min != null ? String(z.min) : '', max: z.max != null ? String(z.max) : '' }
          : emptyZone()
      const newCustomSla = {
        sameCity: toZone(cs.sameCity),
        sameState: toZone(cs.sameState),
        regional: toZone(cs.regional),
        national: toZone(cs.national),
      }
      setForm({
        shipsFromPincode: s.shipsFromPincode ?? '',
        shipsFromState: s.shipsFromState ?? '',
        handlingDays:
          typeof s.handlingDays === 'number' ? s.handlingDays : DEFAULT_FORM.handlingDays,
        codAvailable: s.codAvailable ?? DEFAULT_FORM.codAvailable,
        expressAvailable: s.expressAvailable ?? DEFAULT_FORM.expressAvailable,
        customSla: newCustomSla,
        updatedAt: s.updatedAt ?? null,
      })
      // Auto-open the custom SLA panel if any zone already has a value
      const anyZoneFilled = (Object.keys(newCustomSla) as ZoneMeta['key'][]).some((k) =>
        zoneHasValue(newCustomSla[k]),
      )
      if (anyZoneFilled) setShowCustomSla(true)
    } catch (err) {
      console.error('[Seller Delivery Settings] Fetch error:', err)
      showToast('error', 'Failed to load your delivery settings. Showing defaults.')
    } finally {
      setFetching(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Auto-dismiss toast
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Field change handlers                                            */
  /* ---------------------------------------------------------------- */

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const updateZone = useCallback(
    (zoneKey: ZoneMeta['key'], field: 'min' | 'max', value: string) => {
      // Allow only digits (empty allowed)
      if (value !== '' && !/^\d+$/.test(value)) return
      setForm((prev) => ({
        ...prev,
        customSla: {
          ...prev.customSla,
          [zoneKey]: { ...prev.customSla[zoneKey], [field]: value },
        },
      }))
    },
    [],
  )

  /* ---------------------------------------------------------------- */
  /*  Save                                                             */
  /* ---------------------------------------------------------------- */

  const handleSave = useCallback(async () => {
    // Client-side validation
    const pin = form.shipsFromPincode.trim()
    if (pin && !/^\d{6}$/.test(pin)) {
      showToast('error', 'Ships-from pincode must be a 6-digit number')
      return
    }
    if (!Number.isFinite(form.handlingDays) || form.handlingDays < 0 || form.handlingDays > 14) {
      showToast('error', 'Handling time must be between 0 and 14 days')
      return
    }

    // Build customSla — only zones the seller actually filled in
    const customSla: Partial<DeliverySlaConfig> = {}
    for (const z of ZONES) {
      const zf = form.customSla[z.key]
      if (!zoneHasValue(zf)) continue
      const min = zf.min.trim() === '' ? NaN : parseInt(zf.min, 10)
      const max = zf.max.trim() === '' ? NaN : parseInt(zf.max, 10)
      // Sanity: min <= max (clamp min to max if needed)
      let finalMin = Number.isFinite(min) ? min : 1
      let finalMax = Number.isFinite(max) ? max : 2
      if (finalMin > finalMax) {
        finalMin = finalMax
      }
      customSla[z.key] = { min: finalMin, max: finalMax }
    }
    const customSlaToStore = Object.keys(customSla).length > 0 ? customSla : undefined

    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/seller/delivery-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipsFromPincode: pin,
          shipsFromState: form.shipsFromState.trim(),
          handlingDays: Math.floor(form.handlingDays),
          codAvailable: form.codAvailable,
          expressAvailable: form.expressAvailable,
          customSla: customSlaToStore,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings')
      }
      const updated: SellerDeliverySettings | undefined = data.settings
      if (updated?.updatedAt) {
        setForm((prev) => ({ ...prev, updatedAt: updated.updatedAt ?? null }))
      } else {
        setForm((prev) => ({ ...prev, updatedAt: new Date().toISOString() }))
      }
      showToast('success', 'Delivery settings saved successfully!')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }, [form, showToast])

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <div className="h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Loading delivery settings...
        </div>
      </div>
    )
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-5">
      {/* ── Toast ── */}
      <AnimatePresence>
        {message && (
          <motion.div
            variants={toastSlide}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm shadow-lg border ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-current opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-600 shrink-0">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Delivery Settings</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure how your store ships orders, accepts payments &amp; estimates delivery dates.
            </p>
          </div>
        </div>
        {form.updatedAt && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground text-[10px] font-medium">
            <Clock className="h-3 w-3" />
            Updated {new Date(form.updatedAt).toLocaleDateString()}
          </div>
        )}
      </motion.div>

      {/* ---------------------------------------------------------- */}
      {/*  Section A: Ships From (Origin)                            */}
      {/* ---------------------------------------------------------- */}
      <motion.section variants={fadeInUp} className="space-y-3">
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-600 shrink-0">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold leading-tight">Ships From</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Where your orders ship out from — used to calculate delivery dates &amp; zones
              </p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Ships From Pincode */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.emerald.bg} ${colorClasses.emerald.text} shrink-0`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs font-medium leading-tight">Ships From Pincode</Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    6-digit pincode your orders ship from.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={form.shipsFromPincode}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                    updateField('shipsFromPincode', v)
                  }}
                  placeholder="e.g. 560001"
                  className="h-9 text-sm font-mono max-w-[200px]"
                  disabled={saving}
                  aria-label="Ships from pincode"
                />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  6 digits
                </span>
              </div>
            </div>

            {/* Ships From State */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-t border-border/30 pt-4">
              <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.amber.bg} ${colorClasses.amber.text} shrink-0`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs font-medium leading-tight">Ships From State</Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Indian state your store is based in.
                  </p>
                </div>
              </div>
              <div className="flex-1 max-w-[280px]">
                <Input
                  type="text"
                  list="indian-states-list"
                  value={form.shipsFromState}
                  onChange={(e) => updateField('shipsFromState', e.target.value)}
                  placeholder="e.g. Karnataka"
                  className="h-9 text-sm"
                  disabled={saving}
                  aria-label="Ships from state"
                />
                <datalist id="indian-states-list">
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/80">
              This is the pincode your orders ship from. Used to calculate delivery dates and zones.
            </p>
          </div>
        </div>
      </motion.section>

      {/* ---------------------------------------------------------- */}
      {/*  Section B: Handling & Dispatch                            */}
      {/* ---------------------------------------------------------- */}
      <motion.section variants={fadeInUp} className="space-y-3">
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500/15 to-violet-500/5 text-violet-600 shrink-0">
              <Clock className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold leading-tight">Handling &amp; Dispatch</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                How long you need to prepare an order before it&apos;s picked up
              </p>
            </div>
          </div>

          <div className="p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.violet.bg} ${colorClasses.violet.text} shrink-0`}
                >
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs font-medium leading-tight">Handling Time (days)</Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Days needed to prepare/dispatch before courier pickup.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-[180px]">
                  <Input
                    type="number"
                    min={0}
                    max={14}
                    step={1}
                    value={form.handlingDays}
                    onChange={(e) => {
                      const num = parseInt(e.target.value, 10)
                      if (isNaN(num)) {
                        updateField('handlingDays', 0)
                        return
                      }
                      const clamped = Math.max(0, Math.min(14, num))
                      updateField('handlingDays', clamped)
                    }}
                    className="h-9 text-sm font-mono pr-12"
                    disabled={saving}
                    aria-label="Handling time in days"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none">
                    days
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">0–14</span>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/80">
              How many days you need to prepare/dispatch an order before it&apos;s handed to the courier. 0 = same-day dispatch.
            </p>
          </div>
        </div>
      </motion.section>

      {/* ---------------------------------------------------------- */}
      {/*  Section C: Payment Options                                */}
      {/* ---------------------------------------------------------- */}
      <motion.section variants={fadeInUp} className="space-y-3">
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500/15 to-amber-500/5 text-amber-600 shrink-0">
              <Banknote className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold leading-tight">Payment Options</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Payment methods your store accepts
              </p>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* COD Available toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.emerald.bg} ${colorClasses.emerald.text} shrink-0`}
                >
                  <Banknote className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs font-medium leading-tight">Cash on Delivery Available</Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Whether you accept Cash on Delivery for your orders.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-[11px] font-medium ${!form.codAvailable ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  Off
                </span>
                <Switch
                  checked={form.codAvailable}
                  onCheckedChange={(checked) => updateField('codAvailable', checked)}
                  disabled={saving}
                  aria-label="Cash on Delivery available"
                />
                <span
                  className={`text-[11px] font-medium ${form.codAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                >
                  On
                </span>
              </div>
            </div>

            {/* Express Delivery toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-t border-border/30 pt-4">
              <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.sky.bg} ${colorClasses.sky.text} shrink-0`}
                >
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs font-medium leading-tight">Express Delivery Offered</Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Whether you offer express (faster) delivery. Platform must also have express enabled.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-[11px] font-medium ${!form.expressAvailable ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  Off
                </span>
                <Switch
                  checked={form.expressAvailable}
                  onCheckedChange={(checked) => updateField('expressAvailable', checked)}
                  disabled={saving}
                  aria-label="Express delivery offered"
                />
                <span
                  className={`text-[11px] font-medium ${form.expressAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                >
                  On
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ---------------------------------------------------------- */}
      {/*  Section D: Custom Delivery SLA (Optional, collapsible)    */}
      {/* ---------------------------------------------------------- */}
      <motion.section variants={fadeInUp} className="space-y-3">
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-sky-500/15 to-sky-500/5 text-sky-600 shrink-0">
              <Settings2 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold leading-tight">Custom Delivery SLA (Optional)</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Override platform-default transit days for your shipments
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomSla((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-expanded={showCustomSla}
              aria-label={showCustomSla ? 'Collapse custom SLA' : 'Expand custom SLA'}
            >
              {showCustomSla ? 'Hide' : 'Show'}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showCustomSla ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showCustomSla && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="p-5 space-y-4">
                  <p className="text-[10px] text-muted-foreground/80">
                    Override the platform-default transit days for your shipments. Leave blank to use
                    platform defaults.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {ZONES.map((zone) => {
                      const colors = colorClasses[zone.color] ?? colorClasses.emerald
                      const zf = form.customSla[zone.key]
                      return (
                        <div
                          key={zone.key}
                          className="rounded-xl border border-border/40 bg-card/60 p-3.5 space-y-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex items-center justify-center h-7 w-7 rounded-lg ${colors.bg} ${colors.text} shrink-0`}
                            >
                              <MapPin className="h-3 w-3" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold leading-tight">{zone.label}</p>
                              <p className="text-[9px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                                {zone.description}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px] font-medium text-muted-foreground">
                                Min days
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                max={30}
                                step={1}
                                value={zf.min}
                                onChange={(e) => updateZone(zone.key, 'min', e.target.value)}
                                placeholder="—"
                                className="h-8 text-xs font-mono"
                                disabled={saving}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] font-medium text-muted-foreground">
                                Max days
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                max={30}
                                step={1}
                                value={zf.max}
                                onChange={(e) => updateZone(zone.key, 'max', e.target.value)}
                                placeholder="—"
                                className="h-8 text-xs font-mono"
                                disabled={saving}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <p className="text-[10px] text-muted-foreground/70">
                    Only the zones you fill in will be saved. Blank zones fall back to platform defaults.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* ---------------------------------------------------------- */}
      {/*  Save button                                               */}
      {/* ---------------------------------------------------------- */}
      <motion.div variants={fadeInUp} className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        <div className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
              <span className="flex items-center gap-1">
                <Truck className="h-2.5 w-2.5" />
                Applied to your store
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Changes take effect immediately
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />
                Transit days are business days
              </span>
            </div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-9 text-xs gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save Settings
                  </>
                )}
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
