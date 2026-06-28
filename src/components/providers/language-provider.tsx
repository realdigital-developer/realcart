'use client'

/**
 * Lightweight i18n system for the RealCart customer panel.
 *
 * Design goals
 * ------------
 *  • No URL routing / no SSR locale prefix — the customer panel is an SPA,
 *    so a single React context + localStorage is enough.
 *  • Reuses the existing `realcart_lang` localStorage key that the Change
 *    Language page already writes to, so the two stay in sync automatically.
 *  • Supports interpolation (`{count}`, `{name}` …) and basic pluralization
 *    via the `_plural` key suffix convention.
 *  • Falls back to English when a key or locale is missing, so the UI never
 *    breaks even if a translation file is incomplete.
 *
 * Usage
 * -----
 *   Wrap the app with <LanguageProvider> once (see customer-layout-client.tsx).
 *   Then in any client component:
 *
 *     const { t } = useLanguage()
 *     t('common.cart')                      // → "Cart" / "कार्ट" / "কার্ট" …
 *     t('cart.itemCount', { count: 3 })     // → "(3 items)"
 *     t('account.wishlistItems', { count: 1 })  // uses _plural automatically
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react'

// --- Locale type & metadata -------------------------------------------------

export type LocaleCode = 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'kn' | 'ml' | 'pa' | 'gu'

export interface LanguageMeta {
  code: LocaleCode
  /** English name of the language (stable across locales, used for the picker). */
  label: string
  /** Endonym — the language's name in its own script. */
  nativeLabel: string
}

export const LANGUAGES: LanguageMeta[] = [
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

export const DEFAULT_LOCALE: LocaleCode = 'en'

export const STORAGE_KEY = 'realcart_lang'

/** Maps a stored value to a valid LocaleCode (falls back to English). */
function normalizeLocale(value: string | null | undefined): LocaleCode {
  if (value && LANGUAGES.some((l) => l.code === value)) {
    return value as LocaleCode
  }
  return DEFAULT_LOCALE
}

// --- Translation loading ----------------------------------------------------
//
// Translation JSON files live next to this file under src/locales/*.json.
// They are imported statically so the bundler includes them in the client
// chunk (no network round-trip, no flash of untranslated text).

import en from '@/locales/en.json'
import hi from '@/locales/hi.json'
import bn from '@/locales/bn.json'
import ta from '@/locales/ta.json'
import te from '@/locales/te.json'
import mr from '@/locales/mr.json'
import kn from '@/locales/kn.json'
import ml from '@/locales/ml.json'
import pa from '@/locales/pa.json'
import gu from '@/locales/gu.json'

type TranslationMap = Record<string, string>

const TRANSLATIONS: Record<LocaleCode, TranslationMap> = {
  en: en as TranslationMap,
  hi: hi as TranslationMap,
  bn: bn as TranslationMap,
  ta: ta as TranslationMap,
  te: te as TranslationMap,
  mr: mr as TranslationMap,
  kn: kn as TranslationMap,
  ml: ml as TranslationMap,
  pa: pa as TranslationMap,
  gu: gu as TranslationMap,
}

// --- Interpolation + pluralization -----------------------------------------

type InterpolationParams = Record<string, string | number>

/**
 * Replace `{placeholder}` tokens in a string with values from `params`.
 * Leaves unknown placeholders intact so they're easy to spot in QA.
 */
function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value !== undefined && value !== null ? String(value) : match
  })
}

/**
 * Resolve a translation key for the given locale.
 *
 * Pluralization rule (simple, English-style — works for all 10 supported
 * languages because they all treat "count === 1" as singular and everything
 * else as plural for the small set of countable strings we have):
 *   • If `params.count` is provided AND `count !== 1`, look up `<key>_plural`.
 *   • Fall back to `<key>` if the plural form is missing.
 *   • Finally fall back to the English string, then the key itself.
 */
function resolveKey(locale: LocaleCode, key: string, params?: InterpolationParams): string {
  const usePlural =
    params &&
    typeof params.count === 'number' &&
    params.count !== 1

  const dict = TRANSLATIONS[locale] || {}
  const fallback = TRANSLATIONS[DEFAULT_LOCALE] || {}

  let template: string | undefined
  if (usePlural) {
    template = dict[`${key}_plural`] || fallback[`${key}_plural`]
  }
  template = template || dict[key] || fallback[key] || key

  return interpolate(template, params)
}

// --- Context ----------------------------------------------------------------

export interface LanguageContextValue {
  /** Current locale code (e.g. 'en', 'hi'). */
  locale: LocaleCode
  /** Metadata for the current locale (label + nativeLabel). */
  language: LanguageMeta
  /** All supported languages (for pickers). */
  languages: LanguageMeta[]
  /** Switch the active locale. Persists to localStorage. */
  setLocale: (locale: LocaleCode) => void
  /**
   * Translate a key, with optional interpolation params.
   * `t('cart.itemCount', { count: 3 })` → "(3 items)"
   */
  t: (key: string, params?: InterpolationParams) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

// --- Provider ---------------------------------------------------------------

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Start with the default locale so SSR/first-paint is deterministic.
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE)

  // On mount (client only), read the saved preference from localStorage.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const normalized = normalizeLocale(stored)
      if (normalized !== locale) {
        setLocaleState(normalized)
      }
    } catch {
      // localStorage may be unavailable (private mode / SSR) — ignore.
    }
  }, [])

  // Keep the <html lang="..."> attribute in sync for accessibility / SEO.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
    }
  }, [locale])

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore storage errors
    }
  }, [])

  const t = useCallback(
    (key: string, params?: InterpolationParams) => resolveKey(locale, key, params),
    [locale],
  )

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      language: LANGUAGES.find((l) => l.code === locale) || LANGUAGES[0],
      languages: LANGUAGES,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// --- Hooks ------------------------------------------------------------------

/**
 * Access the full language context (locale, setLocale, t, languages).
 * Throws if used outside a <LanguageProvider>.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return ctx
}

/**
 * Convenience hook that returns just the `t` function.
 * Re-renders the calling component whenever the locale changes.
 */
export function useT() {
  return useLanguage().t
}
