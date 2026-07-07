'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Truck,
  Percent,
  IndianRupee,
  Clock,
  Zap,
  MapPin,
  Ban,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_DELIVERY_SETTINGS,
  type DeliverySettings,
  type DeliverySlaConfig,
  type ZoneSla,
} from '@/lib/delivery-engine'

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const toastSlide = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FormState {
  freeDeliveryAbove: number
  deliveryBaseCharge: number
  codFee: number
  defaultHandlingDays: number
  expressEnabled: boolean
  expressSurcharge: number
  sameDayEnabled: boolean
  sameDayPincodesRaw: string
  blockedPincodesRaw: string
  sla: DeliverySlaConfig
  updatedAt: string | null
}

const DEFAULT_FORM: FormState = {
  freeDeliveryAbove: DEFAULT_DELIVERY_SETTINGS.freeDeliveryAbove,
  deliveryBaseCharge: DEFAULT_DELIVERY_SETTINGS.deliveryBaseCharge,
  codFee: DEFAULT_DELIVERY_SETTINGS.codFee,
  defaultHandlingDays: DEFAULT_DELIVERY_SETTINGS.defaultHandlingDays,
  expressEnabled: DEFAULT_DELIVERY_SETTINGS.expressEnabled,
  expressSurcharge: DEFAULT_DELIVERY_SETTINGS.expressSurcharge,
  sameDayEnabled: DEFAULT_DELIVERY_SETTINGS.sameDayEnabled,
  sameDayPincodesRaw: '',
  blockedPincodesRaw: '',
  sla: {
    sameCity: { ...DEFAULT_DELIVERY_SETTINGS.sla.sameCity },
    sameState: { ...DEFAULT_DELIVERY_SETTINGS.sla.sameState },
    regional: { ...DEFAULT_DELIVERY_SETTINGS.sla.regional },
    national: { ...DEFAULT_DELIVERY_SETTINGS.sla.national },
    expressSameCity: { ...(DEFAULT_DELIVERY_SETTINGS.sla.expressSameCity ?? { min: 1, max: 1 }) },
    expressSameState: { ...(DEFAULT_DELIVERY_SETTINGS.sla.expressSameState ?? { min: 1, max: 2 }) },
    expressRegional: { ...(DEFAULT_DELIVERY_SETTINGS.sla.expressRegional ?? { min: 2, max: 3 }) },
    expressNational: { ...(DEFAULT_DELIVERY_SETTINGS.sla.expressNational ?? { min: 3, max: 4 }) },
  },
  updatedAt: null,
}

/* ------------------------------------------------------------------ */
/*  Field / zone config                                                */
/* ------------------------------------------------------------------ */

const colorClasses: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' },
  sky: { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400' },
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400' },
}

interface FeeField {
  key: keyof Pick<FormState, 'freeDeliveryAbove' | 'deliveryBaseCharge' | 'codFee' | 'defaultHandlingDays'>
  label: string
  description: string
  suffix: string
  icon: React.ComponentType<{ className?: string }>
  min: number
  max: number
  step: number
  color: string
}

const FEE_FIELDS: FeeField[] = [
  {
    key: 'freeDeliveryAbove',
    label: 'Free Delivery Above',
    description: 'Orders at or above this amount get free delivery (0 = disabled).',
    suffix: '₹',
    icon: IndianRupee,
    min: 0,
    max: 99999,
    step: 1,
    color: 'emerald',
  },
  {
    key: 'deliveryBaseCharge',
    label: 'Default Delivery Base Charge',
    description: 'Base delivery fee charged per order when no override applies.',
    suffix: '₹',
    icon: Truck,
    min: 0,
    max: 9999,
    step: 1,
    color: 'amber',
  },
  {
    key: 'codFee',
    label: 'COD Fee',
    description: 'Extra convenience fee added to Cash-on-Delivery orders.',
    suffix: '₹',
    icon: IndianRupee,
    min: 0,
    max: 9999,
    step: 1,
    color: 'rose',
  },
  {
    key: 'defaultHandlingDays',
    label: 'Default Handling Days',
    description: 'Default seller dispatch/handling time when seller has none (0–10).',
    suffix: 'days',
    icon: Clock,
    min: 0,
    max: 10,
    step: 1,
    color: 'violet',
  },
]

interface ZoneMeta {
  key: keyof DeliverySlaConfig
  label: string
  description: string
  color: string
}

const STANDARD_ZONES: ZoneMeta[] = [
  {
    key: 'sameCity',
    label: 'Same City',
    description: 'Buyer & seller share first 3 pincode digits.',
    color: 'emerald',
  },
  {
    key: 'sameState',
    label: 'Same State',
    description: 'Buyer in same state as the seller.',
    color: 'amber',
  },
  {
    key: 'regional',
    label: 'Regional',
    description: 'Buyer in same geographic region (N/S/E/W/Central).',
    color: 'sky',
  },
  {
    key: 'national',
    label: 'National',
    description: 'Buyer in a different region (rest of India).',
    color: 'violet',
  },
]

const EXPRESS_ZONES: ZoneMeta[] = [
  { key: 'expressSameCity', label: 'Express Same City', description: 'Express transit, same city.', color: 'emerald' },
  { key: 'expressSameState', label: 'Express Same State', description: 'Express transit, same state.', color: 'amber' },
  { key: 'expressRegional', label: 'Express Regional', description: 'Express transit, regional.', color: 'sky' },
  { key: 'expressNational', label: 'Express National', description: 'Express transit, national.', color: 'violet' },
]

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function DeliverySettingsPage() {
  const { authenticated, loading } = useAdminAuth()
  const router = useRouter()

  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showExpressSla, setShowExpressSla] = useState(false)

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/admin')
    }
  }, [authenticated, loading, router])

  const fetchSettings = useCallback(async () => {
    try {
      setFetching(true)
      const res = await fetch('/api/admin/delivery-settings')
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as DeliverySettings
        const incomingSla = data.sla || {}
        setForm({
          freeDeliveryAbove: data.freeDeliveryAbove ?? DEFAULT_FORM.freeDeliveryAbove,
          deliveryBaseCharge: data.deliveryBaseCharge ?? DEFAULT_FORM.deliveryBaseCharge,
          codFee: data.codFee ?? DEFAULT_FORM.codFee,
          defaultHandlingDays: data.defaultHandlingDays ?? DEFAULT_FORM.defaultHandlingDays,
          expressEnabled: data.expressEnabled ?? DEFAULT_FORM.expressEnabled,
          expressSurcharge: data.expressSurcharge ?? DEFAULT_FORM.expressSurcharge,
          sameDayEnabled: data.sameDayEnabled ?? DEFAULT_FORM.sameDayEnabled,
          sameDayPincodesRaw: Array.isArray(data.sameDayPincodes) ? data.sameDayPincodes.join(', ') : '',
          blockedPincodesRaw: Array.isArray(data.blockedPincodes) ? data.blockedPincodes.join(', ') : '',
          sla: {
            sameCity: { ...(incomingSla.sameCity || DEFAULT_FORM.sla.sameCity) },
            sameState: { ...(incomingSla.sameState || DEFAULT_FORM.sla.sameState) },
            regional: { ...(incomingSla.regional || DEFAULT_FORM.sla.regional) },
            national: { ...(incomingSla.national || DEFAULT_FORM.sla.national) },
            expressSameCity: { ...(incomingSla.expressSameCity ?? { min: 1, max: 1 }) },
            expressSameState: { ...(incomingSla.expressSameState ?? { min: 1, max: 2 }) },
            expressRegional: { ...(incomingSla.expressRegional ?? { min: 2, max: 3 }) },
            expressNational: { ...(incomingSla.expressNational ?? { min: 3, max: 4 }) },
          },
          updatedAt: data.updatedAt ?? null,
        })
        // Auto-open the Express SLA panel if express delivery is enabled
        if (data.expressEnabled) setShowExpressSla(true)
      }
    } catch (err) {
      console.error('[Delivery Settings] Fetch error:', err)
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Auto-dismiss toast
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [message])

  const handleNumberChange = useCallback((key: keyof FormState, value: string) => {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      setForm((prev) => ({ ...prev, [key]: num }))
    }
  }, [])

  const handleSlaChange = useCallback(
    (zoneKey: keyof DeliverySlaConfig, field: 'min' | 'max', value: string) => {
      const num = parseInt(value, 10)
      if (isNaN(num) || num < 0) return
      setForm((prev) => ({
        ...prev,
        sla: {
          ...prev.sla,
          [zoneKey]: { ...(prev.sla[zoneKey] as ZoneSla), [field]: num },
        },
      }))
    },
    [],
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/delivery-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          freeDeliveryAbove: form.freeDeliveryAbove,
          deliveryBaseCharge: form.deliveryBaseCharge,
          codFee: form.codFee,
          defaultHandlingDays: form.defaultHandlingDays,
          expressEnabled: form.expressEnabled,
          expressSurcharge: form.expressSurcharge,
          sameDayEnabled: form.sameDayEnabled,
          sameDayPincodesRaw: form.sameDayPincodesRaw,
          blockedPincodesRaw: form.blockedPincodesRaw,
          sla: form.sla,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')
      setForm((prev) => ({ ...prev, updatedAt: data.updatedAt ?? new Date().toISOString() }))
      setMessage({ type: 'success', text: 'Delivery settings saved successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }, [form])

  if (loading || fetching) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        {/* Page header */}
        <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
          <h2 className="text-xl font-semibold tracking-tight">Delivery Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure platform-wide delivery charges, SLA zones, express / same-day delivery & non-serviceable pincodes.
          </p>
        </motion.div>

        {/* Toast */}
        <AnimatePresence>
          {message && (
            <motion.div
              variants={toastSlide}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-destructive/10 border border-destructive/20 text-destructive'
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

        {/* ---------------------------------------------------------- */}
        {/*  Section A: Delivery Charges & Fees                        */}
        {/* ---------------------------------------------------------- */}
        <motion.section initial="hidden" animate="visible" variants={staggerContainer} className="space-y-3">
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500/15 to-amber-500/5 text-amber-600 shrink-0">
                <IndianRupee className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold leading-tight">Delivery Charges & Fees</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Default platform-wide delivery, COD & handling fees
                </p>
              </div>
              {form.updatedAt && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground text-[10px] font-medium">
                  <Clock className="h-3 w-3" />
                  Updated {new Date(form.updatedAt).toLocaleDateString()}
                </div>
              )}
            </div>

            <div className="p-5 space-y-4">
              {FEE_FIELDS.map((field) => {
                const Icon = field.icon
                const colors = colorClasses[field.color] ?? colorClasses.emerald
                return (
                  <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                      <div
                        className={`flex items-center justify-center h-8 w-8 rounded-lg ${colors.bg} ${colors.text} shrink-0`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <Label className="text-xs font-medium leading-tight">{field.label}</Label>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{field.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1 max-w-[180px]">
                        <Input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={form[field.key] as number}
                          onChange={(e) => handleNumberChange(field.key, e.target.value)}
                          className="h-9 text-sm font-mono pr-12"
                          disabled={saving}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none">
                          {field.suffix}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {field.min}–{field.max}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </motion.section>

        {/* ---------------------------------------------------------- */}
        {/*  Section B: Express & Same-Day Delivery                    */}
        {/* ---------------------------------------------------------- */}
        <motion.section initial="hidden" animate="visible" variants={staggerContainer} className="space-y-3">
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-600 shrink-0">
                <Zap className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold leading-tight">Express & Same-Day Delivery</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Premium faster-than-standard delivery options
                </p>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Express Delivery toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                  <div
                    className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.emerald.bg} ${colorClasses.emerald.text} shrink-0`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs font-medium leading-tight">Express Delivery Enabled</Label>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Show faster express option on product / checkout pages.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`text-[11px] font-medium ${!form.expressEnabled ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    Off
                  </span>
                  <Switch
                    checked={form.expressEnabled}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, expressEnabled: checked }))}
                    disabled={saving}
                  />
                  <span
                    className={`text-[11px] font-medium ${form.expressEnabled ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    On
                  </span>
                </div>
              </div>

              {/* Express Surcharge (shown when express enabled) */}
              <AnimatePresence initial={false}>
                {form.expressEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pl-0 sm:pl-2">
                      <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                        <div
                          className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.amber.bg} ${colorClasses.amber.text} shrink-0`}
                        >
                          <IndianRupee className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <Label className="text-xs font-medium leading-tight">Express Surcharge</Label>
                          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                            Extra fee added to standard delivery for express.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <div className="relative flex-1 max-w-[180px]">
                          <Input
                            type="number"
                            min={0}
                            max={9999}
                            step={1}
                            value={form.expressSurcharge}
                            onChange={(e) => handleNumberChange('expressSurcharge', e.target.value)}
                            className="h-9 text-sm font-mono pr-12"
                            disabled={saving}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none">
                            ₹
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">0–9999</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Same-Day Delivery toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-t border-border/30 pt-4">
                <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                  <div
                    className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.violet.bg} ${colorClasses.violet.text} shrink-0`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs font-medium leading-tight">Same-Day Delivery Enabled</Label>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Offer same-day delivery for whitelisted pincodes.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`text-[11px] font-medium ${!form.sameDayEnabled ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    Off
                  </span>
                  <Switch
                    checked={form.sameDayEnabled}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, sameDayEnabled: checked }))}
                    disabled={saving}
                  />
                  <span
                    className={`text-[11px] font-medium ${form.sameDayEnabled ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    On
                  </span>
                </div>
              </div>

              {/* Same-Day Pincodes textarea */}
              <AnimatePresence initial={false}>
                {form.sameDayEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 pl-0 sm:pl-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.sky.bg} ${colorClasses.sky.text} shrink-0`}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <Label className="text-xs font-medium leading-tight">Same-Day Pincodes</Label>
                          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                            Enter one pincode per line or comma-separated. Same-day delivery will only be available for
                            these pincodes.
                          </p>
                        </div>
                      </div>
                      <Textarea
                        value={form.sameDayPincodesRaw}
                        onChange={(e) => setForm((prev) => ({ ...prev, sameDayPincodesRaw: e.target.value }))}
                        placeholder={'e.g.\n560001\n560002\n560003'}
                        rows={5}
                        disabled={saving}
                        className="font-mono text-xs resize-y max-h-72"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Only valid 6-digit pincodes will be stored (duplicates auto-removed).
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.section>

        {/* ---------------------------------------------------------- */}
        {/*  Section C: Delivery SLA (Transit Days per Zone)           */}
        {/* ---------------------------------------------------------- */}
        <motion.section initial="hidden" animate="visible" variants={staggerContainer} className="space-y-3">
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-sky-500/15 to-sky-500/5 text-sky-600 shrink-0">
                <Truck className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold leading-tight">Delivery SLA (Transit Days per Zone)</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Min / max transit days per derived delivery zone
                </p>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Standard SLA grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {STANDARD_ZONES.map((zone) => {
                  const colors = colorClasses[zone.color] ?? colorClasses.emerald
                  const sla = form.sla[zone.key] as ZoneSla
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
                          <Label className="text-[10px] font-medium text-muted-foreground">Min days</Label>
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            step={1}
                            value={sla.min}
                            onChange={(e) => handleSlaChange(zone.key, 'min', e.target.value)}
                            className="h-8 text-xs font-mono"
                            disabled={saving}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] font-medium text-muted-foreground">Max days</Label>
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            step={1}
                            value={sla.max}
                            onChange={(e) => handleSlaChange(zone.key, 'max', e.target.value)}
                            className="h-8 text-xs font-mono"
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Express SLA collapsible */}
              <div className="border-t border-border/30 pt-4">
                <button
                  type="button"
                  onClick={() => setShowExpressSla((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 group disabled:cursor-not-allowed"
                  disabled={!form.expressEnabled}
                  aria-expanded={showExpressSla}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex items-center justify-center h-7 w-7 rounded-lg ${colorClasses.emerald.bg} ${colorClasses.emerald.text} shrink-0`}
                    >
                      <Zap className="h-3 w-3" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-semibold leading-tight">Express SLA</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        Faster transit times applied to express orders.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!form.expressEnabled && (
                      <span className="text-[10px] text-muted-foreground/70 italic">Enable express delivery first</span>
                    )}
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        showExpressSla ? 'rotate-180' : ''
                      } ${!form.expressEnabled ? 'opacity-40' : 'group-hover:text-foreground'}`}
                    />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {showExpressSla && form.expressEnabled && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
                        {EXPRESS_ZONES.map((zone) => {
                          const colors = colorClasses[zone.color] ?? colorClasses.emerald
                          const sla = form.sla[zone.key] as ZoneSla
                          return (
                            <div
                              key={zone.key}
                              className="rounded-xl border border-border/40 bg-card/60 p-3.5 space-y-2.5"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`flex items-center justify-center h-7 w-7 rounded-lg ${colors.bg} ${colors.text} shrink-0`}
                                >
                                  <Zap className="h-3 w-3" />
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
                                  <Label className="text-[10px] font-medium text-muted-foreground">Min days</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={30}
                                    step={1}
                                    value={sla.min}
                                    onChange={(e) => handleSlaChange(zone.key, 'min', e.target.value)}
                                    className="h-8 text-xs font-mono"
                                    disabled={saving}
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] font-medium text-muted-foreground">Max days</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={30}
                                    step={1}
                                    value={sla.max}
                                    onChange={(e) => handleSlaChange(zone.key, 'max', e.target.value)}
                                    className="h-8 text-xs font-mono"
                                    disabled={saving}
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.section>

        {/* ---------------------------------------------------------- */}
        {/*  Section D: Non-Serviceable Pincodes (Block-list)          */}
        {/* ---------------------------------------------------------- */}
        <motion.section initial="hidden" animate="visible" variants={staggerContainer} className="space-y-3">
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-rose-500/15 to-rose-500/5 text-rose-600 shrink-0">
                <Ban className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold leading-tight">Non-Serviceable Pincodes (Block-list)</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Pincodes where delivery will be marked unavailable
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.rose.bg} ${colorClasses.rose.text} shrink-0`}
                >
                  <Ban className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs font-medium leading-tight">Blocked Pincodes</Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Delivery will be marked unavailable for these pincodes. Enter one per line or comma-separated.
                  </p>
                </div>
              </div>
              <Textarea
                value={form.blockedPincodesRaw}
                onChange={(e) => setForm((prev) => ({ ...prev, blockedPincodesRaw: e.target.value }))}
                placeholder={'e.g.\n111111\n999999'}
                rows={5}
                disabled={saving}
                className="font-mono text-xs resize-y max-h-96"
              />
              <p className="text-[10px] text-muted-foreground">
                Only valid 6-digit pincodes will be stored (duplicates auto-removed).
              </p>
            </div>
          </motion.div>
        </motion.section>

        {/* ---------------------------------------------------------- */}
        {/*  Save button                                               */}
        {/* ---------------------------------------------------------- */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
        >
          <div className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
                <span className="flex items-center gap-1">
                  <Truck className="h-2.5 w-2.5" />
                  Applied platform-wide
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  Changes take effect immediately
                </span>
                <span className="flex items-center gap-1">
                  <Percent className="h-2.5 w-2.5" />
                  All times in business days
                </span>
              </div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" onClick={handleSave} disabled={saving} className="h-9 text-xs gap-1.5 rounded-lg">
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      Save Changes
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Bottom spacer */}
        <div className="h-2" />
      </div>
    </div>
  )
}
