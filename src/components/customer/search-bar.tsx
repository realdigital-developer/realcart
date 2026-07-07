'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Mic, X, Camera } from 'lucide-react'
import { useLanguage } from '@/components/providers/language-provider'

interface MeeshoSearchBarProps {
  onSearch?: (query: string) => void
  onSearchClick?: () => void
  /** Called when the user taps the camera icon to start a visual search. */
  onImageSearch?: () => void
  initialQuery?: string
}

export function MeeshoSearchBar({ onSearch, onSearchClick, onImageSearch, initialQuery = '' }: MeeshoSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const { t } = useLanguage()
  const [isStuck, setIsStuck] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync with external initialQuery changes (only when parent explicitly changes it)
  useEffect(() => {
    setSearchQuery(initialQuery)
  }, [initialQuery])

  // Use IntersectionObserver to detect when the search bar sticks to the top
  useEffect(() => {
    if (!sentinelRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsStuck(!entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [])

  const handleSearch = () => {
    const trimmed = searchQuery.trim()
    if (trimmed && onSearch) {
      onSearch(trimmed)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <>
      {/* Sentinel — positioned just above the sticky bar to detect stickiness */}
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden="true" />

      <div className={`sticky top-0 z-30 w-full bg-[#5fd3d3] transition-shadow duration-200 ${isStuck ? 'shadow-md' : ''}`}>
        <div className="relative max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2">
          {/* Search Bar - White pill with light gray border */}
          <div className="flex items-center w-full h-10 sm:h-12 bg-white dark:bg-white rounded-[8px] border border-gray-200 dark:border-gray-200 overflow-hidden">
            {/* Search Icon / Button */}
            <button
              onClick={handleSearch}
              className="flex items-center justify-center pl-2.5 sm:pl-3 pr-1.5 sm:pr-2 hover:opacity-70 transition-opacity flex-shrink-0"
              aria-label={t('common.search')}
            >
              <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            </button>

            {/* Input — read-only on home page; clicking opens the dedicated search page */}
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={() => {}}  // No-op — input is read-only
              onKeyDown={() => {}}  // No-op
              onFocus={(e) => {
                e.target.blur()  // Prevent keyboard from opening
                onSearchClick?.()
              }}
              onClick={() => onSearchClick?.()}
              readOnly
              className="flex-1 min-w-0 h-full bg-transparent text-xs sm:text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none cursor-pointer"
              placeholder={t('header.searchPlaceholder')}
            />

            {/* Clear button */}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="flex items-center justify-center h-6 w-6 mr-0.5 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <X className="h-3.5 w-3.5 text-gray-400" />
              </button>
            )}

            {/* Vertical Divider */}
            <div className="h-4 sm:h-5 w-px bg-gray-200 mx-0.5 sm:mx-1 flex-shrink-0" />

            {/* Microphone Icon */}
            <button className="flex items-center justify-center px-1.5 sm:px-2.5 py-2 hover:opacity-70 transition-opacity flex-shrink-0">
              <Mic className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            </button>

            {/* Camera Icon — opens the visual search dialog when onImageSearch
                is wired. Given a higher z-index than the overlay below so it
                stays tappable; falls back to the original static icon when no
                handler is provided (backward compatibility). */}
            <button
              onClick={(e) => {
                if (onImageSearch) {
                  e.stopPropagation()
                  onImageSearch()
                }
              }}
              className={`flex items-center justify-center pr-2 sm:pr-3 pl-1.5 sm:pl-2.5 py-2 transition-opacity flex-shrink-0 ${onImageSearch ? 'hover:opacity-70 cursor-pointer relative z-20' : ''}`}
              aria-label={t('header.searchByImage')}
            >
              <Camera className={`h-4 w-4 sm:h-5 sm:w-5 ${onImageSearch ? 'text-emerald-600' : 'text-gray-400'}`} />
            </button>
          </div>
          {/* Transparent click-catcher — covers the entire search bar so tapping
              anywhere (icons, input, dividers) opens the dedicated search page.
              Uses relative positioning on the parent + absolute overlay.
              The camera button (z-20) sits above this overlay (z-10) so it
              remains directly tappable when onImageSearch is provided. */}
          {onSearchClick && (
            <div
              onClick={onSearchClick}
              className="absolute inset-0 z-10 cursor-pointer"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </>
  )
}
