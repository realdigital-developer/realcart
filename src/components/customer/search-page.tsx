'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, TrendingUp, Clock, X, Sparkles, Search, Mic, Camera } from 'lucide-react'
import { useLanguage } from '@/components/providers/language-provider'

interface SearchPageProps {
  onBack: () => void
  onSearch: (query: string) => void
  /** Called when the user taps the camera icon to start a visual search. */
  onImageSearch?: () => void
  initialQuery?: string
}

const RECENT_SEARCHES_KEY = 'realcart-recent-searches'
const MAX_RECENT = 8

const POPULAR_SEARCHES = [
  'Men Shirts', 'Women Saree', 'Wireless Headphones', 'Running Shoes',
  'Smart Watches', 'Kitchen Appliances', 'Mobile Cases', 'School Bags',
]

export function SearchPage({ onBack, onSearch, onImageSearch, initialQuery = '' }: SearchPageProps) {
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [voiceError, setVoiceError] = useState('')

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
      if (stored) {
        setRecentSearches(JSON.parse(stored))
      }
    } catch {
      // Ignore — localStorage not available
    }
  }, [])

  // Auto-focus the input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Save a search term to recent searches
  const saveRecentSearch = (query: string) => {
    try {
      const trimmed = query.trim()
      if (!trimmed) return

      setRecentSearches(prev => {
        const filtered = prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase())
        const updated = [trimmed, ...filtered].slice(0, MAX_RECENT)
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
        return updated
      })
    } catch {
      // Ignore localStorage errors
    }
  }

  const handleSearch = (query: string) => {
    saveRecentSearch(query)
    onSearch(query)
  }

  const handleQuickSearch = (term: string) => {
    handleSearch(term)
  }

  const clearRecentSearches = () => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY)
      setRecentSearches([])
    } catch {
      // Ignore
    }
  }

  const removeRecentSearch = (term: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      setRecentSearches(prev => {
        const updated = prev.filter(s => s !== term)
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
        return updated
      })
    } catch {
      // Ignore
    }
  }

  // ── Voice search ──
  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setVoiceError(t('search.voiceNotSupported'))
      setTimeout(() => setVoiceError(''), 3000)
      return
    }

    const recognition = new SR()
    recognition.lang = 'en-IN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
      setVoiceError('')
      setInterimText('')
    }

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      if (interimTranscript) {
        setInterimText(interimTranscript)
      }

      if (finalTranscript.trim()) {
        setSearchQuery(finalTranscript.trim())
        setInterimText('')
        // Auto-trigger search when voice recognition produces a final result
        handleSearch(finalTranscript.trim())
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        setVoiceError(t('search.noSpeech'))
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError(t('search.micDenied'))
      } else if (event.error === 'aborted') {
        // User cancelled — no error needed
      } else {
        setVoiceError(t('search.voiceError', { error: event.error }))
      }
      setIsListening(false)
      setTimeout(() => setVoiceError(''), 3000)
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimText('')
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
    setInterimText('')
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col h-[calc(100dvh)] bg-white dark:bg-gray-950"
    >
      {/* ── Top bar: Back button + Search bar (exact same UI as home page) ── */}
      <div
        className="sticky top-0 z-50 flex items-center gap-1.5 px-2 py-2 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800"
      >
        {/* Back button — compact */}
        <button
          onClick={onBack}
          className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="text-gray-700 dark:text-gray-300" style={{ width: 18, height: 18 }} />
        </button>

        {/* Search bar — exact same white pill style as home page */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center w-full h-11 sm:h-12 bg-white dark:bg-white rounded-[8px] border-2 border-gray-300 dark:border-gray-600 overflow-hidden">
            {/* Search Icon */}
            <div className="flex items-center justify-center pl-3 pr-2 flex-shrink-0">
              <Search className="h-5 w-5 text-gray-400" />
            </div>

            {/* Input — editable here */}
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = (e.target as HTMLInputElement).value.trim()
                  if (value) handleSearch(value)
                }
              }}
              autoFocus
              className="flex-1 min-w-0 h-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
              placeholder={t('header.searchPlaceholder')}
            />

            {/* Clear button */}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="flex items-center justify-center h-6 w-6 mr-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <X className="h-3.5 w-3.5 text-gray-400" />
              </button>
            )}

            {/* Vertical Divider */}
            <div className="h-5 w-px bg-gray-200 mx-1 flex-shrink-0" />

            {/* Microphone Icon — Voice Search */}
            <button
              onClick={isListening ? stopListening : startListening}
              className="flex items-center justify-center px-2.5 py-2 hover:opacity-70 transition-opacity flex-shrink-0"
              aria-label={isListening ? t('search.stopVoice') : t('search.voiceSearch')}
            >
              <Mic className={`h-5 w-5 transition-colors ${isListening ? 'text-red-500' : 'text-gray-400'}`} />
            </button>

            {/* Camera Icon — opens visual search when onImageSearch is wired.
                Falls back to the original static icon when no handler is set. */}
            <button
              onClick={() => onImageSearch?.()}
              className={`flex items-center justify-center pr-3 pl-2.5 py-2 transition-opacity flex-shrink-0 ${onImageSearch ? 'hover:opacity-70 cursor-pointer' : ''}`}
              aria-label={t('header.searchByImage')}
            >
              <Camera className={`h-5 w-5 ${onImageSearch ? 'text-emerald-600' : 'text-gray-400'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Voice error message */}
      {voiceError && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-medium shadow-lg max-w-[90vw]">
          {voiceError}
        </div>
      )}

      {/* ── Search content area ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('search.recentSearches')}</h3>
              </div>
              <button
                onClick={clearRecentSearches}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {t('search.clearAll')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((term, idx) => (
                <motion.button
                  key={`${term}-${idx}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => handleQuickSearch(term)}
                  className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all"
                >
                  <span>{term}</span>
                  <span
                    onClick={(e) => removeRecentSearch(term, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-4 w-4 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <X className="h-3 w-3 text-gray-400" />
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Popular Searches */}
        <div className="px-4 pt-5">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{t('search.popularSearches')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {POPULAR_SEARCHES.map((term, idx) => (
              <motion.button
                key={term}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => handleQuickSearch(term)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 border border-emerald-200/50 dark:border-emerald-800/30 text-sm text-emerald-700 dark:text-emerald-400 hover:from-emerald-100 hover:to-teal-100 dark:hover:from-emerald-900/20 dark:hover:to-teal-900/20 transition-all"
                >
                <Sparkles className="h-3 w-3" />
                {term}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Tip */}
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
            <Search className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">{t('search.searchTips')}</p>
              <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                {t('search.tipBody')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Search Overlay */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={stopListening}
          >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="flex flex-col items-center gap-6 p-8 bg-white dark:bg-gray-900 rounded-3xl shadow-2xl mx-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full bg-red-400"
                style={{ width: 80, height: 80 }}
              />
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-rose-600 shadow-xl shadow-red-500/30"
              >
                <Mic className="h-9 w-9 text-white" strokeWidth={2} />
              </motion.div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {interimText ? t('search.heard') : t('search.listening')}
              </h3>
              {interimText ? (
                <motion.p
                  key={interimText}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-emerald-600 mt-1 font-medium"
                >
                  &ldquo;{interimText}&rdquo;
                </motion.p>
              ) : (
                <p className="text-sm text-gray-400 mt-1">{t('search.sayProduct')}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 h-8">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <motion.div
                  key={i}
                  animate={{
                    height: ['8px', '28px', '8px'],
                    opacity: [0.4, 1, 0.4],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.1,
                  }}
                  className="w-1.5 rounded-full bg-gradient-to-t from-red-400 to-rose-500"
                />
              ))}
            </div>
            <button
              onClick={stopListening}
              className="px-6 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
