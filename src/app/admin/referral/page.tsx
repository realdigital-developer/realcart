'use client'

/**
 * Admin Referral Program Management
 * ------------------------------------------------------------------
 * Manage the customer referral program (Meesho-style):
 *   - Configure rewards (referrer + referee amounts)
 *   - Set minimum order value to qualify
 *   - Toggle program active/inactive
 *   - View analytics (total referrals, qualified, rewarded, payout)
 *   - View recent referrals with referrer/referee details
 *   - Edit terms & conditions
 */

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Gift,
  Users,
  CheckCircle2,
  Clock,
  IndianRupee,
  TrendingUp,
  Plus,
  Pencil,
  RefreshCw,
  AlertCircle,
  Save,
  Percent,
  Wallet,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AdminModal, {
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProgramConfig {
  id?: string
  name: string
  status: 'active' | 'inactive'
  rewardType: 'wallet' | 'discount_coupon'
  referrerReward: number
  refereeReward: number
  minOrderValue: number
  shareMessage: string
  termsAndConditions: string[]
  createdAt?: string
  updatedAt?: string
}

interface Analytics {
  totalReferrals: number
  totalQualified: number
  totalRewarded: number
  totalPending: number
  customersWithCodes: number
  totalReferrerPayout: number
  totalRefereePayout: number
  totalPayout: number
  conversionRate: number
}

interface RecentReferral {
  id: string
  referrerName: string
  referrerMobile: string
  refereeName: string
  refereeMobile: string
  referralCode: string
  status: string
  referrerReward: number
  refereeReward: number
  createdAt: string
  qualifiedAt: string | null
  rewardedAt: string | null
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminReferralPage() {
  const { authenticated, loading } = useAdminAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/admin')
    }
  }, [authenticated, loading, router])

  if (loading) {
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <ReferralContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Content                                                       */
/* ------------------------------------------------------------------ */

function ReferralContent() {
  const [program, setProgram] = useState<ProgramConfig | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [recent, setRecent] = useState<RecentReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/referral')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setProgram(data.program)
      setAnalytics(data.analytics)
      setRecent(data.recent || [])
      setError(null)
    } catch {
      setError('Failed to load referral program data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggleStatus = async () => {
    if (!program?.id) return
    try {
      const newStatus = program.status === 'active' ? 'inactive' : 'active'
      await fetch('/api/admin/referral', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: program.id, status: newStatus }),
      })
      setProgram({ ...program, status: newStatus })
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-card border rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-card border rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <p className="text-sm font-semibold text-foreground">{error}</p>
        <Button onClick={fetchData} className="mt-4" variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" />
            Referral Program
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure rewards and track referral performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button
            onClick={() => setModalOpen(true)}
            size="sm"
            className="bg-primary hover:bg-primary/90"
          >
            {program ? <Pencil className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {program ? 'Edit Program' : 'Create Program'}
          </Button>
        </div>
      </div>

      {/* Program Status Banner */}
      {program ? (
        <div className={cn(
          'flex items-center justify-between p-4 rounded-xl border',
          program.status === 'active'
            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'h-10 w-10 rounded-lg flex items-center justify-center',
              program.status === 'active'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
            )}>
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{program.name}</p>
              <p className="text-xs text-muted-foreground">
                {program.status === 'active' ? 'Program is live — customers can refer friends' : 'Program is inactive — no new referrals will be rewarded'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn(
              'text-xs font-semibold px-2.5 py-1 rounded-full',
              program.status === 'active'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
            )}>
              {program.status === 'active' ? '● Active' : '○ Inactive'}
            </span>
            <Switch
              checked={program.status === 'active'}
              onCheckedChange={handleToggleStatus}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
          <p className="text-sm font-semibold text-foreground">No referral program configured</p>
          <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">
            Create a referral program to let customers invite friends and earn rewards. Configure reward amounts, qualification criteria, and terms.
          </p>
          <Button onClick={() => setModalOpen(true)} className="mt-4 bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1.5" /> Create Program
          </Button>
        </div>
      )}

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AnalyticsCard
            icon={<Users className="h-4 w-4" />}
            label="Total Referrals"
            value={analytics.totalReferrals.toString()}
            sublabel={`${analytics.customersWithCodes} customers with codes`}
            color="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
          />
          <AnalyticsCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Qualified"
            value={analytics.totalQualified.toString()}
            sublabel={`${analytics.conversionRate}% conversion rate`}
            color="bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400"
          />
          <AnalyticsCard
            icon={<Clock className="h-4 w-4" />}
            label="Pending"
            value={analytics.totalPending.toString()}
            sublabel="Awaiting first order"
            color="bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
          />
          <AnalyticsCard
            icon={<IndianRupee className="h-4 w-4" />}
            label="Total Payout"
            value={`₹${analytics.totalPayout.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            sublabel={`Referrer: ₹${analytics.totalReferrerPayout.toLocaleString('en-IN', { maximumFractionDigits: 0 })} • Referee: ₹${analytics.totalRefereePayout.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            color="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
          />
        </div>
      )}

      {/* Reward Configuration Summary */}
      {program && (
        <div className="bg-card border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" />
            Reward Configuration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ConfigItem
              icon={<Gift className="h-4 w-4" />}
              label="Referrer Reward"
              value={`₹${program.referrerReward.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              desc="Earned by the person who refers"
            />
            <ConfigItem
              icon={<Sparkles className="h-4 w-4" />}
              label="Referee Reward"
              value={`₹${program.refereeReward.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              desc="Welcome bonus for new joiner"
            />
            <ConfigItem
              icon={<Wallet className="h-4 w-4" />}
              label="Reward Type"
              value={program.rewardType === 'wallet' ? 'Wallet Credit' : 'Discount Coupon'}
              desc="How rewards are delivered"
            />
            <ConfigItem
              icon={<Percent className="h-4 w-4" />}
              label="Min Order Value"
              value={`₹${program.minOrderValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              desc="To qualify the referral"
            />
          </div>
          {program.shareMessage && (
            <div className="mt-4 p-3 bg-muted/30 rounded-lg">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Share Message</p>
              <p className="text-xs text-foreground leading-relaxed">{program.shareMessage}</p>
            </div>
          )}
        </div>
      )}

      {/* Recent Referrals Table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />
            Recent Referrals ({recent.length})
          </h2>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">No referrals yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Referrals will appear here once customers start inviting friends</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Referrer</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Referee</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Code</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Reward</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground">{r.referrerName}</p>
                      <p className="text-[10px] text-muted-foreground">{r.referrerMobile}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground">{r.refereeName}</p>
                      <p className="text-[10px] text-muted-foreground">{r.refereeMobile}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted px-2 py-1 rounded">{r.referralCode}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-foreground">₹{r.referrerReward + r.refereeReward}</p>
                      <p className="text-[10px] text-muted-foreground">{r.referrerReward} + {r.refereeReward}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ReferralStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      <ProgramModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        program={program}
        submitting={submitting}
        onSubmit={async (formData) => {
          setSubmitting(true)
          try {
            const res = await fetch('/api/admin/referral', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData),
            })
            const data = await res.json()
            if (!res.ok) {
              alert(data.error || 'Failed to save program')
              return
            }
            setModalOpen(false)
            fetchData()
          } catch {
            alert('Network error. Please try again.')
          } finally {
            setSubmitting(false)
          }
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function AnalyticsCard({ icon, label, value, sublabel, color }: {
  icon: React.ReactNode
  label: string
  value: string
  sublabel: string
  color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border rounded-xl p-4"
    >
      <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center mb-3', color)}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mt-2">{label}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-1">{sublabel}</p>
    </motion.div>
  )
}

function ConfigItem({ icon, label, value, desc }: {
  icon: React.ReactNode
  label: string
  value: string
  desc: string
}) {
  return (
    <div className="p-3 bg-muted/20 rounded-lg">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
      </div>
      <p className="text-base font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
    </div>
  )
}

function ReferralStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    qualified: { label: 'Qualified', variant: 'outline' },
    rewarded: { label: 'Rewarded', variant: 'default' },
    cancelled: { label: 'Cancelled', variant: 'destructive' },
  }
  const c = config[status] || config.pending
  return <Badge variant={c.variant} className="text-[10px]">{c.label}</Badge>
}

/* ------------------------------------------------------------------ */
/*  Program Create/Edit Modal                                          */
/* ------------------------------------------------------------------ */

interface ProgramFormData {
  id?: string
  name: string
  status: 'active' | 'inactive'
  rewardType: 'wallet' | 'discount_coupon'
  referrerReward: number
  refereeReward: number
  minOrderValue: number
  shareMessage: string
  termsAndConditions: string[]
}

function ProgramModal({ open, onOpenChange, program, submitting, onSubmit }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  program: ProgramConfig | null
  submitting: boolean
  onSubmit: (data: ProgramFormData) => void
}) {
  const [form, setForm] = useState<ProgramFormData>({
    name: '',
    status: 'active',
    rewardType: 'wallet',
    referrerReward: 100,
    refereeReward: 50,
    minOrderValue: 0,
    shareMessage: '',
    termsAndConditions: [],
  })
  const [tncText, setTncText] = useState('')

  useEffect(() => {
    if (program) {
      setForm({
        id: program.id,
        name: program.name,
        status: program.status,
        rewardType: program.rewardType,
        referrerReward: program.referrerReward,
        refereeReward: program.refereeReward,
        minOrderValue: program.minOrderValue,
        shareMessage: program.shareMessage,
        termsAndConditions: program.termsAndConditions || [],
      })
      setTncText((program.termsAndConditions || []).join('\n'))
    } else {
      setForm({
        name: '',
        status: 'active',
        rewardType: 'wallet',
        referrerReward: 100,
        refereeReward: 50,
        minOrderValue: 0,
        shareMessage: '',
        termsAndConditions: [],
      })
      setTncText('')
    }
  }, [program, open])

  const handleSubmit = () => {
    const tnc = tncText.split('\n').map((t) => t.trim()).filter(Boolean)
    onSubmit({ ...form, termsAndConditions: tnc })
  }

  return (
    <AdminModal
      open={open}
      onOpenChange={onOpenChange}
      type="form"
      size="lg"
      title={program ? 'Edit Referral Program' : 'Create Referral Program'}
      description="Configure rewards and qualification criteria for customer referrals."
      submitting={submitting}
      footer={
        <>
          <ModalCancelButton onClick={() => onOpenChange(false)} disabled={submitting} />
          <ModalSubmitButton onClick={handleSubmit} submitting={submitting} icon={Save}>
            {program ? 'Save Changes' : 'Create Program'}
          </ModalSubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* Program Name */}
        <div>
          <Label className="text-xs">Program Name *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Refer & Earn"
            className="mt-1 h-10"
          />
        </div>

        {/* Reward Type */}
        <div>
          <Label className="text-xs">Reward Type *</Label>
          <Select
            value={form.rewardType}
            onValueChange={(v) => setForm({ ...form, rewardType: v as 'wallet' | 'discount_coupon' })}
          >
            <SelectTrigger className="mt-1 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wallet">Wallet Credit</SelectItem>
              <SelectItem value="discount_coupon">Discount Coupon</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reward Amounts */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Referrer Reward (₹) *</Label>
            <Input
              type="number"
              value={form.referrerReward}
              onChange={(e) => setForm({ ...form, referrerReward: Number(e.target.value) || 0 })}
              placeholder="100"
              className="mt-1 h-10"
              min={0}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Earned by the person who refers</p>
          </div>
          <div>
            <Label className="text-xs">Referee Reward (₹) *</Label>
            <Input
              type="number"
              value={form.refereeReward}
              onChange={(e) => setForm({ ...form, refereeReward: Number(e.target.value) || 0 })}
              placeholder="50"
              className="mt-1 h-10"
              min={0}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Welcome bonus for new joiner</p>
          </div>
        </div>

        {/* Min Order Value */}
        <div>
          <Label className="text-xs">Minimum Order Value (₹)</Label>
          <Input
            type="number"
            value={form.minOrderValue}
            onChange={(e) => setForm({ ...form, minOrderValue: Number(e.target.value) || 0 })}
            placeholder="0"
            className="mt-1 h-10"
            min={0}
          />
          <p className="text-[10px] text-muted-foreground mt-1">Minimum order value required to qualify the referral (0 = no minimum)</p>
        </div>

        {/* Share Message */}
        <div>
          <Label className="text-xs">Share Message</Label>
          <Textarea
            value={form.shareMessage}
            onChange={(e) => setForm({ ...form, shareMessage: e.target.value })}
            placeholder="Hey! I'm using RealCart for the best deals. Sign up with my referral code and get exciting rewards! 🎁"
            className="mt-1 min-h-[70px] text-xs"
            rows={3}
          />
          <p className="text-[10px] text-muted-foreground mt-1">Default message shown when customers share their referral code</p>
        </div>

        {/* Terms & Conditions */}
        <div>
          <Label className="text-xs">Terms & Conditions</Label>
          <Textarea
            value={tncText}
            onChange={(e) => setTncText(e.target.value)}
            placeholder={'One term per line\nReferral reward credited to wallet on first order delivery\nSelf-referral not allowed\nRewards expire after 90 days'}
            className="mt-1 min-h-[100px] text-xs"
            rows={5}
          />
          <p className="text-[10px] text-muted-foreground mt-1">Enter one term per line — these will be shown to customers</p>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div>
            <Label className="text-xs font-semibold">Program Status</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {form.status === 'active' ? 'Customers can refer friends and earn rewards' : 'Program paused — no new referrals will be rewarded'}
            </p>
          </div>
          <Switch
            checked={form.status === 'active'}
            onCheckedChange={(c) => setForm({ ...form, status: c ? 'active' : 'inactive' })}
          />
        </div>
      </div>
    </AdminModal>
  )
}
