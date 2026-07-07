'use client'

import React, { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import AdminModal from '@/components/admin/admin-modal'
import { cn } from '@/lib/utils'

/* ====================================================================== */
/*  Shared Animation Variants                                              */
/* ====================================================================== */

export const listAnimations = {
  staggerContainer: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
  },
  fadeInUp: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
  },
  rowVariants: {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  },
  toastSlide: {
    hidden: { opacity: 0, y: -8, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
    exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
  },
  modalVariants: {
    hidden: { opacity: 0, scale: 0.95, y: 10 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.15 } },
  },
}

/* ====================================================================== */
/*  Shared Helper Functions                                                */
/* ====================================================================== */

export function formatDate(isoString: string | null): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(isoString: string | null): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function shortId(id: string): string {
  return `#${id.slice(-5).toUpperCase()}`
}

export function formatPrice(price: number): string {
  return `\u20B9${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/* ====================================================================== */
/*  Types                                                                  */
/* ====================================================================== */

export interface StatCardConfig {
  label: string
  value: number
  icon: React.ElementType
  color: string
  bg: string
  bar: string
  border: string
  gradient: string
}

export interface BreakdownItem {
  key: string
  label: string
  color: string
}

export interface ColumnDef {
  key: string
  label: string
  className?: string
}

export interface ListPageMessage {
  type: 'success' | 'error'
  text: string
}

export interface AdminListPageProps {
  /** Page title */
  title: string
  /** Page subtitle */
  subtitle: string
  /** Refresh callback */
  onRefresh: () => void

  /** Hero card configuration */
  heroCard: {
    icon: React.ElementType
    label: string
    value: number
    breakdownItems: BreakdownItem[]
    statusSummary: Record<string, number>
  }
  /** Stat cards (rendered in the grid alongside hero) */
  statCards: StatCardConfig[]
  /** Total count for percentage calculations */
  totalItems: number

  /** Search state */
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string

  /** Extra filter elements rendered in the toolbar */
  filters?: ReactNode

  /** Table column definitions */
  columns: ColumnDef[]
  /** Data items */
  data: any[]
  /** Loading state */
  loading: boolean
  /** Loading text */
  loadingText?: string
  /** Empty state icon */
  emptyIcon: React.ElementType
  /** Empty state text */
  emptyText?: string
  /** Empty state subtext */
  emptySubtext?: string
  /** Row renderer - must return a <motion.tr> element */
  renderRow: (item: any, index: number) => ReactNode

  /** Selection support */
  selectable?: boolean
  selectedIds?: Set<string>
  allSelected?: boolean
  onToggleSelectAll?: () => void
  onToggleSelect?: (id: string) => void

  /** Pagination */
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  itemName: string
  itemsPerPage: number

  /** Toast message */
  message?: ListPageMessage | null
  onDismissMessage?: () => void

  /** Detail dialog */
  detailOpen?: boolean
  onDetailOpenChange?: (open: boolean) => void
  detailContent?: ReactNode
  detailMaxWidth?: string
  /** Title for the detail dialog (for accessibility). Defaults to itemName + "Details" */
  detailTitle?: string

  /** Extra toolbar actions (e.g., bulk actions) */
  toolbarActions?: ReactNode

  /** Extra content rendered inside the hero card (between value and breakdown bar) */
  heroCardExtra?: ReactNode
}

/* ====================================================================== */
/*  Toast Component                                                        */
/* ====================================================================== */

function ListToast({
  message,
  onDismiss,
}: {
  message: ListPageMessage
  onDismiss?: () => void
}) {
  return (
    <AnimatePresence>
      <motion.div
        variants={listAnimations.toastSlide}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={cn(
          'fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm shadow-lg border',
          message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            : 'bg-destructive/10 border-destructive/20 text-destructive'
        )}
      >
        {message.type === 'success' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0" />
        )}
        <span className="flex-1">{message.text}</span>
        {onDismiss && (
          <button onClick={onDismiss} className="text-current opacity-50 hover:opacity-100 transition-opacity">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/* ====================================================================== */
/*  Header Component                                                       */
/* ====================================================================== */

function ListHeader({
  title,
  subtitle,
  onRefresh,
}: {
  title: string
  subtitle: string
  onRefresh: () => void
}) {
  return (
    <motion.div variants={listAnimations.fadeInUp} className="flex sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.1, rotate: 180 }}
          whileTap={{ scale: 0.9 }}
          onClick={onRefresh}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </motion.button>
      </div>
    </motion.div>
  )
}

/* ====================================================================== */
/*  Stat Cards Section                                                     */
/* ====================================================================== */

function ListStatCards({
  heroCard,
  statCards,
  totalItems,
  statusSummary,
  heroCardExtra,
}: {
  heroCard: AdminListPageProps['heroCard']
  statCards: StatCardConfig[]
  totalItems: number
  statusSummary: Record<string, number>
  heroCardExtra?: ReactNode
}) {
  const HeroIcon = heroCard.icon

  return (
    <motion.div variants={listAnimations.fadeInUp}>
      <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
        {/* Hero Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 rounded-xl p-5 sm:p-6 flex flex-col justify-between min-h-[130px] lg:w-[280px] lg:min-h-[260px] shrink-0">
          <div className="absolute -right-4 -bottom-4 opacity-[0.04] pointer-events-none">
            <HeroIcon className="h-32 w-32" />
          </div>
          <div className="flex items-center justify-between relative z-10">
            <div className={cn('flex items-center justify-center h-11 w-11 rounded-xl', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')}>
              <HeroIcon className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600/60 dark:text-emerald-400/60">Overview</span>
          </div>
          <div className="mt-4 relative z-10">
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">{heroCard.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{heroCard.label}</p>
          </div>
          {heroCardExtra}
          {totalItems > 0 && (
            <div className="mt-4 relative z-10">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/50">
                {heroCard.breakdownItems.map((s) => {
                  const count = statusSummary[s.key] || 0
                  const pct = totalItems > 0 ? (count / totalItems) * 100 : 0
                  return pct > 0 ? (
                    <div key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.color)} style={{ width: `${pct}%` }} />
                  ) : null
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
                {heroCard.breakdownItems.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className={cn('h-1.5 w-1.5 rounded-full', s.color)} />
                    <span>{s.label} {statusSummary[s.key] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 flex-1 gap-3">
          {statCards.map((stat, idx) => {
            const pct = totalItems > 0 ? Math.round(((stat.value as number) / totalItems) * 100) : 0
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
                whileHover={{ y: -2, transition: { duration: 0.15 } }}
                className={cn(
                  'relative overflow-hidden bg-gradient-to-br border rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[110px]',
                  stat.gradient, stat.border
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn('flex items-center justify-center h-9 w-9 rounded-lg', stat.bg, stat.color)}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  {totalItems > 0 && (
                    <span className={cn('text-xs font-bold tabular-nums', stat.color)}>{pct}%</span>
                  )}
                </div>
                <div className="mt-3">
                  <p className={cn('text-2xl sm:text-3xl font-extrabold tracking-tight', stat.color)}>{stat.value as number}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                  <motion.div
                    className={cn('h-full rounded-full', stat.bar)}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: idx * 0.05 + 0.2, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                  />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

/* ====================================================================== */
/*  Toolbar Component                                                      */
/* ====================================================================== */

function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  toolbarActions,
}: {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters?: ReactNode
  toolbarActions?: ReactNode
}) {
  return (
    <motion.div variants={listAnimations.fadeInUp} className="flex items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder || 'Search...'}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9 rounded-lg bg-muted/50 border-0 focus-visible:ring-1"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filters}
        {toolbarActions}
      </div>
    </motion.div>
  )
}

/* ====================================================================== */
/*  Pagination Component                                                   */
/* ====================================================================== */

function ListPagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemName,
  itemsPerPage,
  loading,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems: number
  itemName: string
  itemsPerPage: number
  loading: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
      <p className="text-xs text-muted-foreground">
        {loading ? 'Loading...' : (
          <>
            Showing {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
            {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} {itemName}
          </>
        )}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
          Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2)
        ).map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium transition-colors',
              currentPage === page
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ====================================================================== */
/*  ListCheckbox – Enhanced Checkbox for Table Lists                       */
/* ====================================================================== */

export function ListCheckbox({
  checked,
  onCheckedChange,
  ariaLabel,
}: {
  checked: boolean | 'indeterminate'
  onCheckedChange: () => void
  ariaLabel: string
}) {
  return (
    <div className="flex items-center justify-center">
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
        className={cn(
          /* Explicit square dimensions (20px) for better visibility and accessibility */
          'h-5 w-5 aspect-square rounded-[5px]',
          /* Stronger, more visible border in unchecked state */
          'border-foreground/25 dark:border-foreground/30',
          /* Subtle background fill so the box is visible even when empty */
          'bg-muted/40 dark:bg-muted/30',
          /* Clear hover feedback */
          'hover:border-foreground/50 hover:bg-muted/70',
          /* Checked state: use primary theme color */
          'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
          /* Indeterminate state: primary color with dash */
          'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground',
          /* Focus ring */
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          /* Smooth transition */
          'transition-all duration-150',
          /* Cursor */
          'cursor-pointer',
        )}
      />
    </div>
  )
}

/* ====================================================================== */
/*  ListCheckboxCell – Table cell wrapper for ListCheckbox                  */
/* ====================================================================== */

export function ListCheckboxCell({
  children,
}: {
  children: ReactNode
}) {
  return (
    <TableCell className="w-[48px] min-w-[48px] max-w-[48px] px-0">
      <div className="flex items-center justify-center w-full">
        {children}
      </div>
    </TableCell>
  )
}

/* ====================================================================== */
/*  Status Badge Helper                                                    */
/* ====================================================================== */

export function StatusBadge({
  color,
  bgColor,
  icon: Icon,
  label,
}: {
  color: string
  bgColor: string
  icon: React.ElementType
  label: string
}) {
  return (
    <Badge className={cn('px-2.5 py-0.5 text-[11px] font-medium rounded-full border-0', bgColor, color)}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  )
}

/* ====================================================================== */
/*  View Button Helper                                                     */
/* ====================================================================== */

export function ViewButton({
  onClick,
  label = 'View',
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <Eye className="h-3.5 w-3.5 mr-1" />
      {label}
    </Button>
  )
}

/* Re-export Button from ui for convenience */
import { Button } from '@/components/ui/button'

/* ====================================================================== */
/*  Main AdminListPage Component                                           */
/* ====================================================================== */

export default function AdminListPage({
  title,
  subtitle,
  onRefresh,
  heroCard,
  statCards,
  totalItems,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  columns,
  data,
  loading,
  loadingText,
  emptyIcon,
  emptyText,
  emptySubtext,
  renderRow,
  selectable = false,
  selectedIds,
  allSelected,
  onToggleSelectAll,
  onToggleSelect,
  currentPage,
  totalPages,
  onPageChange,
  itemName,
  itemsPerPage,
  message,
  onDismissMessage,
  detailOpen,
  onDetailOpenChange,
  detailContent,
  detailMaxWidth,
  detailTitle,
  toolbarActions,
  heroCardExtra,
}: AdminListPageProps) {
  const EmptyIcon = emptyIcon
  const colCount = columns.length + (selectable ? 1 : 0)

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={listAnimations.staggerContainer}
      className="space-y-5"
    >
      {/* ── Toast ── */}
      <AnimatePresence>
        {message && <ListToast message={message} onDismiss={onDismissMessage} />}
      </AnimatePresence>

      {/* ── Header ── */}
      <ListHeader title={title} subtitle={subtitle} onRefresh={onRefresh} />

      {/* ── Stat Cards ── */}
      <ListStatCards
        heroCard={heroCard}
        statCards={statCards}
        totalItems={totalItems}
        statusSummary={heroCard.statusSummary}
        heroCardExtra={heroCardExtra}
      />

      {/* ── Toolbar ── */}
      <ListToolbar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        toolbarActions={toolbarActions}
      />

      {/* ── Table ── */}
      <motion.div variants={listAnimations.fadeInUp} className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2.5 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            {loadingText || 'Loading...'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {selectable && (
                  <TableHead className="w-[48px] min-w-[48px] max-w-[48px] px-0">
                    <div className="flex items-center justify-center w-full">
                      <ListCheckbox
                        checked={
                          allSelected
                            ? true
                            : (selectedIds && selectedIds.size > 0)
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={onToggleSelectAll || (() => {})}
                        ariaLabel="Select all"
                      />
                    </div>
                  </TableHead>
                )}
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                      col.className
                    )}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colCount} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <EmptyIcon className="h-8 w-8 opacity-40" />
                        <p className="text-sm">{emptyText || `No ${itemName} found`}</p>
                        <p className="text-xs">{emptySubtext || 'Try adjusting your search or filters'}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item, index) => renderRow(item, index))
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        )}

        {/* ── Pagination ── */}
        <ListPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          totalItems={totalItems}
          itemName={itemName}
          itemsPerPage={itemsPerPage}
          loading={loading}
        />
      </motion.div>

      {/* ── Detail Modal ── */}
      {(detailOpen !== undefined && onDetailOpenChange) && (
        <AdminModal
          open={detailOpen}
          onOpenChange={onDetailOpenChange}
          type="view"
          size="xl"
          title={detailTitle || `${itemName} Details`}
          raw
          className={detailMaxWidth}
        >
          <motion.div variants={listAnimations.modalVariants} initial="hidden" animate="visible" exit="exit">
            {detailContent}
          </motion.div>
        </AdminModal>
      )}
    </motion.div>
  )
}
