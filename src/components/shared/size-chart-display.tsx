'use client'

import { cn } from '@/lib/utils'
import { X, Package, Ruler } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

/* ------------------------------------------------------------------ */
/*  Size Chart Types                                                    */
/* ------------------------------------------------------------------ */

export interface SizeChart {
  headers: string[]
  rows: Record<string, string>[]
  imageUrl?: string
  unit?: 'metric' | 'imperial' | 'both'
  howToMeasure?: string[]
}

/* ------------------------------------------------------------------ */
/*  Unit Conversion Helpers                                             */
/* ------------------------------------------------------------------ */

function getDisplayHeaders(headers: string[], unit: 'imperial' | 'metric'): string[] {
  if (unit === 'metric') return headers.map(h => h.replace('(in)', '(cm)'))
  if (unit === 'imperial') return headers.map(h => h.replace('(cm)', '(in)'))
  return headers
}

function getDisplayHeader(header: string, unit: 'imperial' | 'metric'): string {
  if (unit === 'metric') return header.replace('(in)', '(cm)')
  if (unit === 'imperial') return header.replace('(cm)', '(in)')
  return header
}

function convertValueIfNeeded(
  value: string,
  header: string,
  displayUnit: 'imperial' | 'metric',
  chartUnit?: string
): string {
  if (value === '-') return value
  if (!chartUnit || chartUnit === 'both') return value

  const shouldConvert =
    (displayUnit === 'metric' && (header.includes('(in)') || (!header.includes('(cm)') && chartUnit === 'imperial'))) ||
    (displayUnit === 'imperial' && (header.includes('(cm)') || (!header.includes('(in)') && chartUnit === 'metric')))

  if (!shouldConvert) return value

  const factor = displayUnit === 'metric' ? 2.54 : (1 / 2.54)

  if (value.includes('-')) {
    return value.split('-').map(p => {
      const num = parseFloat(p.trim())
      return isNaN(num) ? p.trim() : (num * factor).toFixed(1).replace(/\.0$/, '')
    }).join('-')
  }

  const num = parseFloat(value)
  if (!isNaN(num)) return (num * factor).toFixed(1).replace(/\.0$/, '')

  return value
}

/* ------------------------------------------------------------------ */
/*  Inline Size Chart Table (for admin panel, seller preview, etc.)     */
/* ------------------------------------------------------------------ */

interface SizeChartTableProps {
  sizeChart: SizeChart
  className?: string
  compact?: boolean
}

export function SizeChartTable({ sizeChart, className, compact = false }: SizeChartTableProps) {
  if (!sizeChart.headers || sizeChart.headers.length === 0 || !sizeChart.rows || sizeChart.rows.length === 0) {
    return null
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className={cn('w-full border-collapse', compact ? 'text-[11px]' : 'text-xs')}>
        <thead>
          <tr className="bg-muted/50">
            {sizeChart.headers.map((header, i) => (
              <th
                key={i}
                className={cn(
                  'text-left font-semibold whitespace-nowrap border-b',
                  compact ? 'px-2 py-1.5' : 'px-3 py-2.5',
                  'text-foreground/70'
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sizeChart.rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                i % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                'border-b border-border/50'
              )}
            >
              {sizeChart.headers.map((header, j) => (
                <td
                  key={j}
                  className={cn(
                    'whitespace-nowrap',
                    compact ? 'px-2 py-1.5' : 'px-3 py-2.5',
                    j === 0 && 'font-medium text-foreground/80'
                  )}
                >
                  {row[header] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Size Chart Modal (Bottom Sheet for Customer Panel)                  */
/* ------------------------------------------------------------------ */

interface SizeChartModalProps {
  open: boolean
  onClose: () => void
  sizeChart: SizeChart | null | undefined
  selectedSize?: string
}

export function SizeChartModal({ open, onClose, sizeChart, selectedSize }: SizeChartModalProps) {
  // Guard against null/undefined sizeChart — return nothing if no data
  if (!sizeChart) return null

  const hasTable = sizeChart.headers?.length > 0 && sizeChart.rows?.length > 0
  const hasImage = !!sizeChart.imageUrl

  if (!hasTable && !hasImage) return null

  return (
    <SizeChartModalInner
      open={open}
      onClose={onClose}
      sizeChart={sizeChart}
      selectedSize={selectedSize}
      hasTable={hasTable}
      hasImage={hasImage}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Inner modal component — guaranteed non-null sizeChart                */
/* ------------------------------------------------------------------ */

interface SizeChartModalInnerProps {
  open: boolean
  onClose: () => void
  sizeChart: SizeChart
  selectedSize?: string
  hasTable: boolean
  hasImage: boolean
}

function SizeChartModalInner({ open, onClose, sizeChart, selectedSize, hasTable, hasImage }: SizeChartModalInnerProps) {
  // Derive the default unit from the chart; only track user overrides
  const defaultUnit = sizeChart.unit === 'metric' ? 'metric' : 'imperial'
  const [userUnit, setUserUnit] = useState<'imperial' | 'metric' | null>(null)
  const unit = userUnit ?? defaultUnit

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sizechart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="sizechart-modal"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
            </div>

            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-emerald-500" />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Size Chart</h3>
                  {/* Unit Toggle */}
                  {sizeChart.unit && sizeChart.unit !== 'both' && (
                    <button
                      onClick={() => setUserUnit(prev => prev === 'imperial' ? 'metric' : 'imperial')}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 transition-colors"
                    >
                      {unit === 'imperial' ? 'in' : 'cm'}
                    </button>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Size Chart Image */}
              {sizeChart.imageUrl && (
                <div className="mb-4 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
                  <img
                    src={sizeChart.imageUrl}
                    alt="Size Chart"
                    className="w-full object-contain"
                  />
                </div>
              )}

              {/* Size Chart Table */}
              {hasTable && (
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full text-[12px] border-collapse">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        {getDisplayHeaders(sizeChart.headers, unit).map((header) => (
                          <th
                            key={header}
                            className="px-3 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sizeChart.rows.map((row, i) => {
                        const sizeHeader = sizeChart.headers[0]
                        const rowSizeValue = row[sizeHeader]
                        const isSelectedSize = selectedSize &&
                          rowSizeValue?.toLowerCase() === selectedSize.toLowerCase()

                        return (
                          <tr
                            key={i}
                            className={cn(
                              isSelectedSize
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-200 dark:ring-emerald-800'
                                : i % 2 === 0
                                  ? 'bg-white dark:bg-gray-900'
                                  : 'bg-gray-50 dark:bg-gray-800/50'
                            )}
                          >
                            {sizeChart.headers.map((header) => {
                              const displayHeader = getDisplayHeader(header, unit)
                              const value = row[header] || row[displayHeader] || '-'
                              return (
                                <td
                                  key={header}
                                  className={cn(
                                    'px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 whitespace-nowrap',
                                    isSelectedSize
                                      ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                                      : 'text-gray-600 dark:text-gray-400',
                                    header === sizeChart.headers[0] && 'font-medium'
                                  )}
                                >
                                  {convertValueIfNeeded(value, header, unit, sizeChart.unit)}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* How to Measure */}
              {sizeChart.howToMeasure && sizeChart.howToMeasure.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">How to Measure</p>
                  <div className="space-y-1.5">
                    {sizeChart.howToMeasure.map((tip, i) => (
                      <p key={i} className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5 flex-shrink-0">•</span>
                        {tip}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Fallback if no chart data */}
              {!hasImage && !hasTable && (
                <div className="text-center py-8">
                  <Package className="h-10 w-10 text-gray-300 dark:bg-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No size chart available</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
