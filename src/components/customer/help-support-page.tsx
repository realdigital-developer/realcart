'use client'

/**
 * Customer Help & Support Page
 * ------------------------------------------------------------------
 * Sections:
 *   1. Browse Help Topics — searchable FAQ section
 *   2. Other ways to reach us — call/email
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HelpCircle,
  Phone,
  Mail,
  ChevronDown,
  ChevronRight,
  Package,
  RotateCcw,
  Wallet,
  User,
  Gift,
  Store,
  Loader2,
  AlertCircle,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from './page-header'
import { useLanguage } from '@/components/providers/language-provider'

interface FAQQuestion {
  id: string
  question: string
  answer: string
}

interface FAQCategory {
  id: string
  category: string
  icon: string
  color: string
  questions: FAQQuestion[]
}

interface HelpSupportPageProps {
  onBack?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

const iconMap: Record<string, React.ElementType> = {
  package: Package,
  rotate: RotateCcw,
  wallet: Wallet,
  user: User,
  gift: Gift,
  store: Store,
  help: HelpCircle,
}

const colorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-600 dark:text-violet-400' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400' },
  rose: { bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-600 dark:text-rose-400' },
  cyan: { bg: 'bg-cyan-50 dark:bg-cyan-900/20', text: 'text-cyan-600 dark:text-cyan-400' },
}

export function HelpSupportPage({ onBack, onNavigate }: HelpSupportPageProps) {
  const { t } = useLanguage()
  const [faqCategories, setFaqCategories] = useState<FAQCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/customer/support')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setFaqCategories(data.faqCategories || [])
      setError(null)
    } catch {
      setError('Failed to load help & support data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filter FAQ by search query
  const filteredCategories = searchQuery.trim()
    ? faqCategories
        .map((cat) => ({
          ...cat,
          questions: cat.questions.filter(
            (q) =>
              q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
              q.answer.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((cat) => cat.questions.length > 0)
    : faqCategories

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader
        title={t('help.title')}
        onBack={onBack}
        onNavigate={onNavigate}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-4">
            <div className="h-12 bg-white dark:bg-gray-900 rounded-xl animate-pulse" />
            <div className="h-40 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
            <div className="h-40 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{error === 'Failed to load help & support data' ? t('help.loadFailed') : error}</p>
            <button onClick={fetchData} className="mt-4 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-500 hover:bg-emerald-600">{t('common.retry')}</button>
          </div>
        ) : (
          <div className="p-4 space-y-4 pb-8">
            {/* ── 1. Browse Help Topics (FAQ search + categories) ── */}
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4 text-blue-500" />
                {t('help.browseTopics')}
              </h3>

              {/* FAQ Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('help.searchPlaceholder')}
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:border-emerald-400 transition-colors"
                />
              </div>

              {filteredCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Search className="h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-xs text-gray-400">{t('help.noResults', { query: searchQuery })}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCategories.map((cat) => {
                    const Icon = iconMap[cat.icon] || HelpCircle
                    const colors = colorMap[cat.color] || colorMap.blue
                    const isExpanded = expandedCategory === cat.id
                    return (
                      <motion.div
                        key={cat.id}
                        layout
                        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                          className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                        >
                          <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0', colors.bg, colors.text)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{cat.category}</p>
                            <p className="text-[10px] text-gray-400">{cat.questions.length === 1 ? t('help.question', { count: cat.questions.length }) : t('help.questions', { count: cat.questions.length })}</p>
                          </div>
                          <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', isExpanded && 'rotate-180')} />
                        </button>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3.5 pb-3 space-y-1">
                                {cat.questions.map((q) => {
                                  const isQExpanded = expandedQuestion === q.id
                                  return (
                                    <div key={q.id} className="rounded-xl overflow-hidden">
                                      <button
                                        onClick={() => setExpandedQuestion(isQExpanded ? null : q.id)}
                                        className="w-full flex items-center justify-between gap-2 p-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors rounded-xl"
                                      >
                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">{q.question}</span>
                                        <ChevronRight className={cn('h-3.5 w-3.5 text-gray-400 transition-transform flex-shrink-0', isQExpanded && 'rotate-90')} />
                                      </button>
                                      <AnimatePresence>
                                        {isQExpanded && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                          >
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2.5 pb-2.5 pt-0.5">{q.answer}</p>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  )
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── 2. Other ways to reach us ── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-emerald-500" />
                {t('help.otherWays')}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <a href="tel:+918000000000" className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{t('help.callUs')}</p>
                    <p className="text-[10px] text-gray-400">{t('help.callHours')}</p>
                  </div>
                </a>
                <a href="mailto:support@realcart.com" className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{t('help.emailUs')}</p>
                    <p className="text-[10px] text-gray-400">{t('help.emailHours')}</p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
