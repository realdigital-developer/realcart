'use client'

/**
 * Change Language page — lets the customer pick a preferred UI language.
 * Selection is persisted to localStorage (`realcart_lang`) and reflected
 * immediately via local state. Uses the shared PageHeader so the top
 * navbar matches the Categories page exactly.
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Globe, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from './page-header'

interface LanguageOption {
  code: string
  label: string
  nativeLabel: string
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
]

const STORAGE_KEY = 'realcart_lang'

interface LanguagePageProps {
  onBack?: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function LanguagePage({ onBack, onNavigate }: LanguagePageProps) {
  const [selected, setSelected] = useState<string>('en')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && LANGUAGES.some((l) => l.code === stored)) {
        setSelected(stored)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  const handleSelect = (code: string) => {
    setSelected(code)
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      // ignore storage errors
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader title="Change Language" onBack={onBack} onNavigate={onNavigate} />

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center gap-2 mb-4 px-1">
          <Globe className="h-4 w-4 text-gray-500" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Select your preferred language for the app interface
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          {LANGUAGES.map((lang, idx) => {
            const isActive = selected === lang.code
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
          More languages coming soon
        </p>
      </div>
    </div>
  )
}
