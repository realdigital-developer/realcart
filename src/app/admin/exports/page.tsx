'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  Store,
  Package,
  Users,
  IndianRupee,
  UserCircle,
  Download,
  Info,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format a Date as yyyy-mm-dd for <input type="date"> */
function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function firstOfMonth(): string {
  const now = new Date()
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
}

function todayValue(): string {
  return toDateInputValue(new Date())
}

type ExportType = 'sales' | 'sellers' | 'products' | 'customers' | 'overview'

interface ExportCardConfig {
  type: ExportType
  title: string
  description: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  accentBar: string
}

const EXPORT_CARDS: ExportCardConfig[] = [
  {
    type: 'sales',
    title: 'Sales Report',
    description: 'Daily revenue, orders, and item sales breakdown',
    icon: BarChart3,
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    accentBar: 'bg-emerald-500',
  },
  {
    type: 'sellers',
    title: 'Top Sellers',
    description: 'Ranked seller performance by GMV and order count',
    icon: Store,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
    accentBar: 'bg-blue-500',
  },
  {
    type: 'products',
    title: 'Top Products',
    description: 'Best-selling products by units sold and revenue',
    icon: Package,
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
    accentBar: 'bg-amber-500',
  },
  {
    type: 'customers',
    title: 'Top Customers',
    description: 'Most valuable customers by total spend and order count',
    icon: Users,
    iconBg: 'bg-rose-500/10',
    iconColor: 'text-rose-600 dark:text-rose-400',
    accentBar: 'bg-rose-500',
  },
  {
    type: 'overview',
    title: 'Revenue Overview',
    description: 'Platform KPIs, top sellers and revenue breakdown',
    icon: IndianRupee,
    iconBg: 'bg-teal-500/10',
    iconColor: 'text-teal-600 dark:text-teal-400',
    accentBar: 'bg-teal-500',
  },
  {
    type: 'customers',
    title: 'Customer Analytics',
    description: 'Customer registrations, LTV and repeat purchase metrics',
    icon: UserCircle,
    iconBg: 'bg-sky-500/10',
    iconColor: 'text-sky-600 dark:text-sky-400',
    accentBar: 'bg-sky-500',
  },
]

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                 */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ExportsPage() {
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
        <ExportsContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Exports Content                                                    */
/* ------------------------------------------------------------------ */

function ExportsContent() {
  // Per-card date range state, defaulting to first-of-month -> today
  const [ranges, setRanges] = useState<Record<string, { start: string; end: string }>>(
    () => {
      const start = firstOfMonth()
      const end = todayValue()
      const init: Record<string, { start: string; end: string }> = {}
      for (const card of EXPORT_CARDS) {
        init[card.title] = { start, end }
      }
      return init
    },
  )

  const setRange = useCallback(
    (title: string, field: 'start' | 'end', value: string) => {
      setRanges((prev) => ({
        ...prev,
        [title]: { ...prev[title], [field]: value },
      }))
    },
    [],
  )

  const handleDownload = useCallback(
    (type: string, startDate: string, endDate: string) => {
      const params = new URLSearchParams({
        type,
        startDate: new Date(startDate).toISOString(),
      })
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      params.set('endDate', end.toISOString())
      window.open(
        `/api/admin/analytics/export?${params.toString()}`,
        '_blank',
      )
    },
    [],
  )

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* ── Page Header ── */}
      <motion.div variants={fadeInUp}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/10">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Reports &amp; Exports
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Download comprehensive reports as CSV for offline analysis
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Export cards grid ── */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {EXPORT_CARDS.map((card) => {
          const range = ranges[card.title] || { start: firstOfMonth(), end: todayValue() }
          const Icon = card.icon
          const cardId = `card-${card.title.replace(/\s+/g, '-').toLowerCase()}`
          return (
            <motion.div key={card.title} variants={fadeInUp}>
              <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden relative h-full flex flex-col">
                <div
                  className={cn('absolute top-0 left-0 right-0 h-0.5', card.accentBar)}
                />
                <CardContent className="pt-5 pb-5 px-5 flex flex-col h-full">
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className={cn(
                        'flex items-center justify-center h-10 w-10 rounded-lg shrink-0',
                        card.iconBg,
                      )}
                    >
                      <Icon className={cn('h-5 w-5', card.iconColor)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm font-semibold">
                        {card.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">
                        {card.description}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`${cardId}-start`}
                        className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        Start
                      </Label>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          id={`${cardId}-start`}
                          type="date"
                          value={range.start}
                          onChange={(e) => setRange(card.title, 'start', e.target.value)}
                          className="pl-8 h-9 text-xs bg-muted/50 border-0"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`${cardId}-end`}
                        className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        End
                      </Label>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          id={`${cardId}-end`}
                          type="date"
                          value={range.end}
                          onChange={(e) => setRange(card.title, 'end', e.target.value)}
                          className="pl-8 h-9 text-xs bg-muted/50 border-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <Button
                      onClick={() =>
                        handleDownload(card.type, range.start, range.end)
                      }
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      size="sm"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download CSV
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>

      {/* ── Recent exports info card ── */}
      <motion.div variants={fadeInUp}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-sky-500/10">
                <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <CardTitle className="text-sm font-semibold">
                About Exports
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>
                Exports are generated <span className="font-medium text-foreground">on-demand from live data</span>.
                Large date ranges may take a few seconds to process.
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>All reports are downloaded in CSV format compatible with Excel, Google Sheets and Numbers.</li>
                <li>Date ranges are inclusive of both the start and end day.</li>
                <li>Exports respect your admin permissions and only include data you can access.</li>
                <li>Currency figures are in Indian Rupees (INR) unless otherwise noted in the column header.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
