'use client'

/**
 * Change Language page — lets the customer pick a preferred UI language.
 *
 * Selection is applied LIVE: the whole customer panel re-renders in the
 * chosen language immediately (via the LanguageProvider context) and the
 * preference is persisted to localStorage (`realcart_lang`) so it survives
 * reloads. Uses the shared PageHeader so the top navbar matches the
 * Categories page exactly.
 */

import { motion } from 'framer-motion'
import { Globe, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from './page-header'
import { useLanguage } from '@/components/providers/language-provider'
import { toast } from 'sonner'

interface LanguagePageProps {
  onBack?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function LanguagePage({ onBack, onNavigate }: LanguagePageProps) {
  const { locale, languages, setLocale, t } = useLanguage()

  const handleSelect = (code: string) => {
    if (code === locale) return
    setLocale(code as typeof locale)
    const lang = languages.find((l) => l.code === code)
    // Show a toast in the newly-selected language for immediate feedback.
    toast.success(t('language.changedToast', { language: lang?.nativeLabel || code }))
  }

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader title={t('language.title')} onBack={onBack} onNavigate={onNavigate} />

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center gap-2 mb-4 px-1">
          <Globe className="h-4 w-4 text-gray-500" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('language.description')}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          {languages.map((lang, idx) => {
            const isActive = locale === lang.code
            return (
              <motion.button
                key={lang.code}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02, duration: 0.2 }}
                onClick={() => handleSelect(lang.code)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors',
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-9 w-9 rounded-full text-xs font-bold uppercase',
                      isActive
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    )}
                  >
                    {lang.code.slice(0, 2)}
                  </span>
                  <div>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isActive
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-gray-800 dark:text-gray-200'
                      )}
                    >
                      {lang.label}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {lang.nativeLabel}
                    </p>
                  </div>
                </div>
                {isActive && (
                  <Check className="h-5 w-5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                )}
              </motion.button>
            )
          })}
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-6">
          {t('language.moreComingSoon')}
        </p>
      </div>
    </div>
  )
}
