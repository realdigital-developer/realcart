'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Tag,
  TrendingDown,
  RefreshCw,
  ArrowRight,
  CheckCheck,
  BellOff,
  Package,
  CreditCard,
  RotateCcw,
  Gift,
  Wallet,
  ShoppingBag,
  Truck,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { Notification, NotificationType } from './types'
import { PageHeader } from './page-header'
import { useLanguage, type LocaleCode } from '@/components/providers/language-provider'

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getRelativeTime(dateStr: string, t: (key: string, params?: Record<string, string | number>) => string, locale: LocaleCode): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSecs < 60) return t('common.justNow')
    if (diffMins < 60) return diffMins === 1 ? t('notifications.minAgo', { count: diffMins }) : t('notifications.minsAgo', { count: diffMins })
    if (diffHours < 24) return diffHours === 1 ? t('notifications.hourAgo', { count: diffHours }) : t('notifications.hoursAgo', { count: diffHours })
    if (diffDays === 1) return t('common.yesterday')
    if (diffDays < 7) return t('notifications.daysAgo', { count: diffDays })
    return date.toLocaleDateString(`${locale}-IN`, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

// Category mapping for filter tabs
const categoryConfig: Record<string, { labelKey: string; types: NotificationType[]; icon: React.ElementType; color: string }> = {
  all: { labelKey: 'notifications.filterAll', types: [], icon: Bell, color: 'text-gray-600 dark:text-gray-400' },
  orders: { labelKey: 'notifications.filterOrders', types: ['order_placed', 'order_confirmed', 'order_shipped', 'order_out_for_delivery', 'order_delivered', 'order_cancelled'], icon: Package, color: 'text-blue-600 dark:text-blue-400' },
  payments: { labelKey: 'notifications.filterPayments', types: ['payment_success', 'payment_failed', 'refund_processed'], icon: CreditCard, color: 'text-violet-600 dark:text-violet-400' },
  returns: { labelKey: 'notifications.filterReturns', types: ['return_requested', 'return_completed'], icon: RotateCcw, color: 'text-amber-600 dark:text-amber-400' },
  referrals: { labelKey: 'notifications.filterReferrals', types: ['referral_reward', 'referral_joined'], icon: Gift, color: 'text-rose-600 dark:text-rose-400' },
  wallet: { labelKey: 'notifications.filterBalance', types: ['wallet_credit', 'wallet_debit', 'wallet_low_balance'], icon: Wallet, color: 'text-emerald-600 dark:text-emerald-400' },
}

function getNotificationIcon(type: NotificationType): { icon: React.ReactNode; bgColor: string; iconColor: string } {
  switch (type) {
    case 'order_placed':
      return { icon: <ShoppingBag className="h-5 w-5" />, bgColor: 'bg-blue-50 dark:bg-blue-950/30', iconColor: 'text-blue-500' }
    case 'order_confirmed':
      return { icon: <CheckCircle2 className="h-5 w-5" />, bgColor: 'bg-blue-50 dark:bg-blue-950/30', iconColor: 'text-blue-500' }
    case 'order_shipped':
      return { icon: <Package className="h-5 w-5" />, bgColor: 'bg-indigo-50 dark:bg-indigo-950/30', iconColor: 'text-indigo-500' }
    case 'order_out_for_delivery':
      return { icon: <Truck className="h-5 w-5" />, bgColor: 'bg-cyan-50 dark:bg-cyan-950/30', iconColor: 'text-cyan-500' }
    case 'order_delivered':
      return { icon: <CheckCircle2 className="h-5 w-5" />, bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', iconColor: 'text-emerald-500' }
    case 'order_cancelled':
      return { icon: <XCircle className="h-5 w-5" />, bgColor: 'bg-red-50 dark:bg-red-950/30', iconColor: 'text-red-500' }
    case 'payment_success':
      return { icon: <CreditCard className="h-5 w-5" />, bgColor: 'bg-violet-50 dark:bg-violet-950/30', iconColor: 'text-violet-500' }
    case 'payment_failed':
      return { icon: <AlertCircle className="h-5 w-5" />, bgColor: 'bg-red-50 dark:bg-red-950/30', iconColor: 'text-red-500' }
    case 'refund_processed':
      return { icon: <RefreshCw className="h-5 w-5" />, bgColor: 'bg-amber-50 dark:bg-amber-950/30', iconColor: 'text-amber-600' }
    case 'return_requested':
      return { icon: <RotateCcw className="h-5 w-5" />, bgColor: 'bg-orange-50 dark:bg-orange-950/30', iconColor: 'text-orange-500' }
    case 'return_completed':
      return { icon: <CheckCircle2 className="h-5 w-5" />, bgColor: 'bg-teal-50 dark:bg-teal-950/30', iconColor: 'text-teal-500' }
    case 'referral_reward':
      return { icon: <Gift className="h-5 w-5" />, bgColor: 'bg-rose-50 dark:bg-rose-950/30', iconColor: 'text-rose-500' }
    case 'referral_joined':
      return { icon: <Sparkles className="h-5 w-5" />, bgColor: 'bg-pink-50 dark:bg-pink-950/30', iconColor: 'text-pink-500' }
    case 'wallet_credit':
      return { icon: <Wallet className="h-5 w-5" />, bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', iconColor: 'text-emerald-500' }
    case 'wallet_debit':
      return { icon: <Wallet className="h-5 w-5" />, bgColor: 'bg-orange-50 dark:bg-orange-950/30', iconColor: 'text-orange-500' }
    case 'wallet_low_balance':
      return { icon: <AlertCircle className="h-5 w-5" />, bgColor: 'bg-amber-50 dark:bg-amber-950/30', iconColor: 'text-amber-600' }
    case 'promo':
      return { icon: <Tag className="h-5 w-5" />, bgColor: 'bg-orange-50 dark:bg-orange-950/30', iconColor: 'text-orange-500' }
    case 'price_drop':
      return { icon: <TrendingDown className="h-5 w-5" />, bgColor: 'bg-yellow-50 dark:bg-yellow-950/30', iconColor: 'text-yellow-600' }
    case 'back_in_stock':
      return { icon: <RefreshCw className="h-5 w-5" />, bgColor: 'bg-teal-50 dark:bg-teal-950/30', iconColor: 'text-teal-500' }
    default:
      return { icon: <Bell className="h-5 w-5" />, bgColor: 'bg-gray-50 dark:bg-gray-800', iconColor: 'text-gray-500' }
  }
}

/* ------------------------------------------------------------------ */
/*  Notification Card                                                   */
/* ------------------------------------------------------------------ */

function NotificationCard({
  notification,
  onMarkRead,
  onNavigateToOrder,
}: {
  notification: Notification
  onMarkRead: (id: string) => void
  onNavigateToOrder?: (orderId: string) => void
}) {
  const { t, locale } = useLanguage()
  const { icon, bgColor, iconColor } = getNotificationIcon(notification.type)

  // Order-related notification types that should navigate to order details
  const isOrderNotification = [
    'order_placed', 'order_confirmed', 'order_shipped',
    'order_out_for_delivery', 'order_delivered', 'order_cancelled',
    'return_requested', 'return_completed',
  ].includes(notification.type)

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead(notification._id)
    }
    // Navigate to order details if this is an order notification with a relatedId
    if (isOrderNotification && notification.relatedId && onNavigateToOrder) {
      onNavigateToOrder(notification.relatedId)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 p-4 border-b border-gray-100 dark:border-gray-800 transition-colors',
        !notification.read ? 'bg-blue-50/40 dark:bg-blue-950/10' : 'bg-white dark:bg-gray-900',
        (isOrderNotification && notification.relatedId) ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer' : 'cursor-default'
      )}
    >
      {/* Icon */}
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', bgColor, iconColor)}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {!notification.read && (
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 animate-pulse" />
              )}
              <p className={cn(
                'text-sm font-semibold line-clamp-1',
                !notification.read ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'
              )}>
                {notification.title}
              </p>
            </div>
            <p className={cn(
              'text-xs mt-0.5 line-clamp-2',
              !notification.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-500'
            )}>
              {notification.message}
            </p>
          </div>
          <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">
            {getRelativeTime(notification.createdAt, t, locale)}
          </span>
        </div>

        {/* Navigate indicator — only for order notifications with relatedId */}
        {isOrderNotification && notification.relatedId && (
          <div className="flex items-center gap-1 mt-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="text-[11px] font-medium">{t('common.viewDetails')}</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Notifications Page                                             */
/* ------------------------------------------------------------------ */

export function NotificationsPage({ onBack, onNavigate }: { onBack?: () => void; onNavigate?: (tab: string, params?: Record<string, string>) => void }) {
  const { t, locale } = useLanguage()
  const { authenticated } = useCustomerAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const fetchNotifications = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    try {
      const res = await fetch(`/api/customer/notifications?page=${pageNum}&limit=20`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json().catch(() => ({}))

      setNotifications(prev => append ? [...prev, ...data.notifications] : data.notifications)
      setUnreadCount(data.unreadCount || 0)
      setTotal(data.total || 0)
      setPage(pageNum)
      setHasMore(pageNum * 20 < (data.total || 0))
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authenticated) {
      setLoading(false)
      return
    }
    fetchNotifications(1)
  }, [authenticated, fetchNotifications])

  // Auto-refresh every 30 seconds for real-time feel
  useEffect(() => {
    if (!authenticated) return
    const interval = setInterval(() => {
      fetchNotifications(1)
    }, 30000)
    return () => clearInterval(interval)
  }, [authenticated, fetchNotifications])

  const handleMarkRead = async (notificationId: string) => {
    try {
      await fetch('/api/customer/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      })
      setNotifications(prev => prev.map(n => n._id === notificationId ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // silent
    }
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await fetch('/api/customer/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // silent
    } finally {
      setMarkingAll(false)
    }
  }

  const loadMore = () => {
    if (hasMore && !loading) {
      fetchNotifications(page + 1, true)
    }
  }

  // Filter notifications by active category
  const filteredNotifications = activeFilter === 'all'
    ? notifications
    : notifications.filter(n => {
        const config = categoryConfig[activeFilter]
        return config?.types.includes(n.type)
      })

  // Count unread per category
  const categoryCounts = Object.keys(categoryConfig).reduce((acc, key) => {
    const config = categoryConfig[key]
    if (key === 'all') {
      acc[key] = unreadCount
    } else {
      acc[key] = notifications.filter(n => !n.read && config.types.includes(n.type)).length
    }
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex flex-col h-[calc(100dvh)] bg-gray-50 dark:bg-gray-950">
      <PageHeader
        title={t('notifications.title')}
        onBack={onBack}
        onNavigate={onNavigate}
        headerExtra={
          <>
            {unreadCount > 0 && (
              <span className="text-[10px] bg-blue-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1 mr-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors mr-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markingAll ? t('notifications.marking') : t('notifications.markAllRead')}
              </button>
            )}
          </>
        }
      >
        {/* ── Category Filter Tabs ── */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide pb-1">
          {Object.entries(categoryConfig).map(([key, config]) => {
            const Icon = config.icon
            const count = categoryCounts[key] || 0
            const isActive = activeFilter === key
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
                  isActive
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-white' : config.color)} />
                {t(config.labelKey)}
                {count > 0 && (
                  <span className={cn(
                    'text-[9px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center font-bold px-1',
                    isActive ? 'bg-white/20 text-white' : 'bg-blue-500 text-white'
                  )}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </PageHeader>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!authenticated ? (
          <div className="flex flex-col items-center justify-center p-6 min-h-[300px]">
            <Bell className="h-12 w-12 text-gray-300 mb-3" />
            <h2 className="text-base font-bold text-gray-700 dark:text-gray-300 mb-1">{t('notifications.loginToView')}</h2>
            <p className="text-sm text-gray-400">{t('notifications.signInToStayUpdated')}</p>
          </div>
        ) : loading ? (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-start gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 min-h-[300px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <BellOff className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              </div>
              <h2 className="text-base font-bold text-gray-700 dark:text-gray-300">
                {activeFilter === 'all' ? t('notifications.emptyTitleAll') : t('notifications.emptyTitle', { category: t(categoryConfig[activeFilter]?.labelKey || '') })}
              </h2>
              <p className="text-sm text-gray-400 text-center max-w-[250px]">
                {activeFilter === 'all'
                  ? t('notifications.emptyDesc')
                  : t('notifications.emptyDescFiltered', { category: t(categoryConfig[activeFilter]?.labelKey || '') })}
              </p>
            </motion.div>
          </div>
        ) : (
          <AnimatePresence>
            <div key="notifications-list" className="divide-y-0">
              {filteredNotifications.map((n, idx) => (
                <NotificationCard
                  key={n._id || `notif-${idx}`}
                  notification={n}
                  onMarkRead={handleMarkRead}
                  onNavigateToOrder={(orderId) => {
                    if (onNavigate) {
                      onNavigate('orders', { orderId })
                    }
                  }}
                />
              ))}
            </div>

            {/* Load More */}
            {hasMore && activeFilter === 'all' && (
              <div key="load-more" className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  className="px-6 py-2 text-sm font-semibold text-emerald-600 border border-emerald-200 dark:border-emerald-800 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                >
                  {t('common.loadMore')}
                </button>
              </div>
            )}

            {/* End of list padding */}
            <div key="end-spacer" className="h-4" />
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
