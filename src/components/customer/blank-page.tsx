'use client'

/**
 * Generic Blank Page — used for new account sub-tabs that don't have
 * full implementations yet. Shows a header with back button + title,
 * and a "coming soon" placeholder body.
 */

import { ArrowLeft, Sparkles } from 'lucide-react'

interface BlankPageProps {
  title: string
  description?: string
  icon?: React.ReactNode
  onBack?: () => void
}

export function BlankPage({ title, description, icon, onBack }: BlankPageProps) {
  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-3 h-12">
          {onBack && (
            <button
              onClick={onBack}
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
          )}
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-200 truncate">
            {title}
          </h1>
        </div>
      </div>

      {/* Body — coming soon placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-3xl blur-2xl opacity-60" />
          <div className="relative h-20 w-20 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/40 dark:to-teal-900/40 flex items-center justify-center">
            {icon || <Sparkles className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />}
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">
          {title}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          {description || `This feature is coming soon. We're working hard to bring you the best ${title.toLowerCase()} experience.`}
        </p>
      </div>
    </div>
  )
}
