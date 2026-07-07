'use client'

/**
 * Customer Referral Page — Meesho-style "Refer & Earn"
 * ------------------------------------------------------------------
 * Sections:
 *   1. Hero card with referral code + copy + share
 *   2. Reward summary stats (invited / qualified / earnings / wallet)
 *   3. How it works (3-step visual guide)
 *   4. Invited friends list (status: pending / qualified / rewarded)
 *   5. Terms & conditions
 *   6. Apply referral code (if customer was referred by someone)
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  TrendingUp,
  Wallet,
  Clock,
  CheckCircle2,
  UserPlus,
  Send,
  ChevronRight,
  Sparkles,
  Award,
  Info,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import AdminModal from '@/components/admin/admin-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from './page-header'
import { useLanguage } from '@/components/providers/language-provider'

interface InvitedFriend {
  id: string
  friendName: string
  friendMobile: string
  status: 'pending' | 'qualified' | 'rewarded' | 'cancelled'
  rewardAmount: number
  joinedAt: string
  qualifiedAt: string | null
  rewardedAt: string | null
  orderCount: number
}

interface ProgramConfig {
  id: string
  name: string
  referrerReward: number
  refereeReward: number
  rewardType: 'wallet' | 'discount_coupon'
  minOrderValue: number
  termsAndConditions: string[]
  isActive: boolean
}

interface ReferralData {
  referralCode: string
  shareMessage: string
  shareUrl: string
  program: ProgramConfig | null
  stats: {
    totalInvited: number
    totalQualified: number
    totalRewarded: number
    totalEarnings: number
    pendingEarnings: number
    walletBalance: number
  }
  invitedFriends: InvitedFriend[]
  referredBy: { name: string; rewarded: boolean } | null
}

interface ReferralPageProps {
  onBack?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function ReferralPage({ onBack, onNavigate }: ReferralPageProps) {
  const { t } = useLanguage()
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [applyCode, setApplyCode] = useState('')
  const [applySubmitting, setApplySubmitting] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState<string | null>(null)
  const [showTerms, setShowTerms] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/customer/referral')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json().catch(() => ({})).catch(() => ({}))
      setData(json)
      setError(null)
    } catch {
      setError('Failed to load referral data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Copy referral code to clipboard ──
  const handleCopyCode = async () => {
    if (!data?.referralCode) return
    try {
      await navigator.clipboard.writeText(data.referralCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = data.referralCode
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Share via Web Share API (with WhatsApp/SMS fallback) ──
  const handleShare = async (channel?: 'whatsapp' | 'sms' | 'native') => {
    if (!data) return
    const text = data.shareMessage
    const url = data.shareUrl
    const fullText = `${text}\n${url}`

    if (channel === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank')
      return
    }
    if (channel === 'sms') {
      window.open(`sms:?body=${encodeURIComponent(fullText)}`, '_blank')
      return
    }

    // Native share (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'RealCart Refer & Earn', text, url })
      } catch {
        // User cancelled — no action needed
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(fullText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // ignore
      }
    }
  }

  // ── Apply a referral code (link to a referrer) ──
  const handleApplyCode = async () => {
    if (!applyCode.trim()) {
      setApplyError('Please enter a referral code')
      return
    }
    setApplySubmitting(true)
    setApplyError(null)
    try {
      const res = await fetch('/api/customer/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: applyCode.trim() }),
      })
      const json = await res.json().catch(() => ({})).catch(() => ({}))
      if (!res.ok) {
        setApplyError(json.error || 'Failed to apply referral code')
        return
      }
      setApplySuccess(`Referral code applied! You were referred by ${json.referrerName}.`)
      setTimeout(() => {
        setApplyModalOpen(false)
        setApplySuccess(null)
        setApplyCode('')
        fetchData()
      }, 2000)
    } catch {
      setApplyError('Network error. Please try again.')
    } finally {
      setApplySubmitting(false)
    }
  }

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' }
  }

  const formatPrice = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const programActive = data?.program?.isActive

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader title={t('referral.title')} onBack={onBack} onNavigate={onNavigate} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-4">
            <div className="h-48 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-24 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
              <div className="h-24 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
            </div>
            <div className="h-40 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{error === 'Failed to load referral data' ? t('referral.loadFailed') : error}</p>
            <button onClick={fetchData} className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-500 hover:bg-emerald-600">{t('common.retry')}</button>
          </div>
        ) : !data ? null : (
          <div className="p-4 space-y-4 pb-8">
            {/* ── Hero Card: Referral Code ── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-5 text-white shadow-lg"
            >
              {/* Decorative circles */}
              <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10" />
              <div className="absolute -bottom-16 -left-8 h-32 w-32 rounded-full bg-white/10" />

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="h-5 w-5" />
                  <h2 className="text-lg font-bold">{t('referral.heroTitle')}</h2>
                </div>
                {programActive ? (
                  <p className="text-xs text-white/90 mb-4 leading-relaxed">
                    {t('referral.heroDescActive')}{' '}
                    <span className="font-bold">{formatPrice(data.program?.referrerReward || 0)}</span> each!
                  </p>
                ) : (
                  <p className="text-xs text-white/90 mb-4 leading-relaxed">
                    {t('referral.heroDescInactive')}
                  </p>
                )}

                {/* Referral Code Box */}
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                  <p className="text-[10px] uppercase tracking-wider text-white/80 mb-1.5 font-semibold">{t('referral.yourCode')}</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-2xl font-black tracking-wider font-mono">{data.referralCode}</span>
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 bg-white text-emerald-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-50 transition-colors"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? t('common.copied') : t('common.copy')}
                    </button>
                  </div>
                </div>

                {/* Share Buttons */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button
                    onClick={() => handleShare('whatsapp')}
                    className="flex flex-col items-center gap-1 bg-white/20 backdrop-blur-sm rounded-xl py-2.5 hover:bg-white/30 transition-colors border border-white/20"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-[10px] font-semibold">{t('referral.whatsapp')}</span>
                  </button>
                  <button
                    onClick={() => handleShare('sms')}
                    className="flex flex-col items-center gap-1 bg-white/20 backdrop-blur-sm rounded-xl py-2.5 hover:bg-white/30 transition-colors border border-white/20"
                  >
                    <Send className="h-4 w-4" />
                    <span className="text-[10px] font-semibold">{t('referral.sms')}</span>
                  </button>
                  <button
                    onClick={() => handleShare('native')}
                    className="flex flex-col items-center gap-1 bg-white/20 backdrop-blur-sm rounded-xl py-2.5 hover:bg-white/30 transition-colors border border-white/20"
                  >
                    <Share2 className="h-4 w-4" />
                    <span className="text-[10px] font-semibold">{t('referral.more')}</span>
                  </button>
                </div>
              </div>
            </motion.div>

            {/* ── Stats Grid ── */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label={t('referral.friendsInvited')}
                value={data.stats.totalInvited.toString()}
                color="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              />
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label={t('referral.qualified')}
                value={data.stats.totalQualified.toString()}
                color="bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
              />
              <StatCard
                icon={<Award className="h-4 w-4" />}
                label={t('referral.totalEarned')}
                value={formatPrice(data.stats.totalEarnings)}
                color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label={t('referral.walletBalance')}
                value={formatPrice(data.stats.walletBalance)}
                color="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
              />
            </div>

            {/* Pending earnings banner */}
            {data.stats.pendingEarnings > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-800/20"
              >
                <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('referral.pending', { amount: formatPrice(data.stats.pendingEarnings) })}</p>
                  <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70">{t('referral.pendingDesc')}</p>
                </div>
              </motion.div>
            )}

            {/* ── How It Works ── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                {t('referral.howItWorks')}
              </h3>
              <div className="space-y-3">
                <HowItWorksStep
                  step={1}
                  icon={<Share2 className="h-4 w-4" />}
                  title={t('referral.step1Title')}
                  desc={t('referral.step1Desc')}
                />
                <HowItWorksStep
                  step={2}
                  icon={<UserPlus className="h-4 w-4" />}
                  title={t('referral.step2Title')}
                  desc={t('referral.step2Desc')}
                />
                <HowItWorksStep
                  step={3}
                  icon={<Gift className="h-4 w-4" />}
                  title={t('referral.step3Title')}
                  desc={`When their first order is delivered, you both get ${formatPrice(data.program?.referrerReward || 0)} in your wallet`}
                />
              </div>
            </div>

            {/* ── Invited Friends ── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-blue-500" />
                  {t('referral.invitedFriends', { count: data.invitedFriends.length })}
                </h3>
              </div>
              {data.invitedFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                    <Users className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t('referral.noFriends')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('referral.noFriendsDesc')}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {data.invitedFriends.map((friend, idx) => (
                    <motion.div
                      key={friend.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {friend.friendName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{friend.friendName}</p>
                        <p className="text-[10px] text-gray-400">{friend.friendMobile} • {formatDate(friend.joinedAt)}</p>
                      </div>
                      <StatusBadge status={friend.status} reward={friend.rewardAmount} formatPrice={formatPrice} />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Apply Referral Code (if not yet referred) ── */}
            {!data.referredBy && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-1.5">
                  <Gift className="h-4 w-4 text-violet-500" />
                  {t('referral.haveCode')}
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                  {t('referral.haveCodeDesc')}
                </p>
                <button
                  onClick={() => { setApplyError(null); setApplySuccess(null); setApplyModalOpen(true) }}
                  className="w-full py-2.5 rounded-xl border-2 border-dashed border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 text-xs font-bold hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors"
                >
                  {t('referral.applyCode')}
                </button>
              </div>
            )}

            {/* Referred-by info */}
            {data.referredBy && (
              <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/10 rounded-2xl border border-violet-100 dark:border-violet-800/20">
                <div className="h-9 w-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                    {t('referral.referredBy', { name: data.referredBy.name })}
                  </p>
                  <p className="text-[10px] text-violet-600/70 dark:text-violet-500/70">
                    {data.referredBy.rewarded
                      ? `✓ ${t('referral.bonusCredited')}`
                      : t('referral.bonusPending')}
                  </p>
                </div>
              </div>
            )}

            {/* ── Terms & Conditions ── */}
            {data.program?.termsAndConditions && data.program.termsAndConditions.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <button
                  onClick={() => setShowTerms((v) => !v)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-gray-400" />
                    {t('referral.termsConditions')}
                  </span>
                  <ChevronRight className={cn('h-4 w-4 text-gray-400 transition-transform', showTerms && 'rotate-90')} />
                </button>
                <AnimatePresence>
                  {showTerms && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-1.5">
                        {data.program.termsAndConditions.map((tnc, i) => (
                          <div key={i} className="flex gap-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            <span className="text-gray-400 flex-shrink-0">{i + 1}.</span>
                            <span>{tnc}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Program inactive notice */}
            {!programActive && (
              <div className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800/50 rounded-xl">
                <Info className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {t('referral.inactiveMsg')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Apply Referral Code Modal ── */}
      <AdminModal
        open={applyModalOpen}
        onOpenChange={(o) => setApplyModalOpen(o)}
        type="form"
        size="sm"
        title={t('referral.applyCodeTitle')}
        description={t('referral.applyCodeDesc')}
        submitting={applySubmitting}
        footer={
          <>
            <Button variant="outline" onClick={() => setApplyModalOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
            <Button onClick={handleApplyCode} disabled={applySubmitting} className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white">
              {applySubmitting ? t('referral.applying') : t('referral.applyCodeButton')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {applyError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
              <p className="text-[11px] text-red-600 dark:text-red-400">{applyError}</p>
            </div>
          )}
          {applySuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{applySuccess}</p>
            </div>
          )}
          <div>
            <Label className="text-xs">{t('referral.referralCodeLabel')}</Label>
            <Input
              value={applyCode}
              onChange={(e) => { setApplyCode(e.target.value.toUpperCase()); setApplyError(null) }}
              placeholder={t('referral.referralCodePlaceholder')}
              className="mt-1 h-11 font-mono uppercase tracking-wider"
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            {t('referral.referralCodeNote')}
          </p>
        </div>
      </AdminModal>
    </div>
  )
}

// ── Stat Card sub-component ──
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 border border-gray-100 dark:border-gray-800"
    >
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center mb-2', color)}>
        {icon}
      </div>
      <p className="text-lg font-bold text-gray-800 dark:text-gray-200 leading-none">{value}</p>
      <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">{label}</p>
    </motion.div>
  )
}

// ── How It Works Step ──
function HowItWorksStep({ step, icon, title, desc }: { step: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="relative flex-shrink-0">
        <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          {icon}
        </div>
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
          {step}
        </span>
      </div>
      <div className="flex-1 pt-1">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

// ── Status Badge ──
function StatusBadge({ status, reward, formatPrice }: { status: string; reward: number; formatPrice: (n: number) => string }) {
  const config: Record<string, { label: string; color: string; icon?: React.ReactNode }> = {
    pending: { label: 'Pending', color: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' },
    qualified: { label: 'Qualified', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
    rewarded: { label: `+${formatPrice(reward)}`, color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', icon: <Check className="h-3 w-3" /> },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 dark:bg-red-900/30 text-red-500' },
  }
  const c = config[status] || config.pending
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap', c.color)}>
      {c.icon}
      {c.label}
    </span>
  )
}
