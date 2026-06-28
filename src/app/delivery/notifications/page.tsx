'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  IndianRupee,
  Wallet,
  Clock,
  ArrowRight,
  CheckCheck,
  BellOff,
  AlertTriangle,
  Shield,
  Info,
  Trash2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'
import { useDeliveryBoyNotifications } from '@/hooks/use-delivery-boy-notifications'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type NotificationType =
  | 'order_assigned'
  | 'order_picked_up'
  | 'order_delivered'
  | 'order_failed'
  | 'order_cancelled'
  | 'earning_credited'
  | 'payout_processed'
  | 'availability_reminder'
  | 'account_update'
  | 'system_alert'

interface DeliveryNotification {
  _id: string
  deliveryBoyId: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  priority: 'low' | 'normal' | 'high' | 'urgent'
  relatedId: string | null
  relatedType: 'order' | 'earning' | 'payout' | 'account' | null
  createdAt: string
}

/* ------------------------------------------------------------------ */
/*  Notifications Cache — stale-while-revalidate strategy               */
/*                                                                     */
/*  Uses in-memory + sessionStorage cache so the notifications page     */
/*  renders INSTANTLY on every visit (no loading spinner).              */
/* ------------------------------------------------------------------ */

const CACHE_KEY = 'delivery_notifications_v1'

interface CachedData {
  notifications: DeliveryNotification[]
  unreadCount: number
  total: number
  cachedAt: number
}

// Module-level in-memory cache (survives React remounts within same page lifecycle)
let memoryCache: CachedData | null = null

function readCache(): CachedData | null {
  if (memoryCache) return memoryCache
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as CachedData
        if (Date.now() - parsed.cachedAt < 10 * 60 * 1000) {
          memoryCache = parsed
          return parsed
        }
        sessionStorage.removeItem(CACHE_KEY)
      }
    } catch {
      // Ignore
    }
  }
  return null
}

function writeCache(data: { notifications: DeliveryNotification[]; unreadCount: number; total: number }) {
  const cached: CachedData = { ...data, cachedAt: Date.now() }
  memoryCache = cached
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    } catch {
      // Ignore
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Polling Configuration                                               */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL_VISIBLE = 15_000  // 15s — notifications are time-sensitive
const POLL_INTERVAL_HIDDEN  = 60_000  // 1min when tab is hidden

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSecs < 60) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

function getNotificationIcon(type: NotificationType): {
  icon: React.ReactNode
  bgColor: string
  iconColor: string
} {
  switch (type) {
    case 'order_assigned':
      return { icon: <Package className="h-4 w-4" />, bgColor: 'bg-blue-50 dark:bg-blue-950/30', iconColor: 'text-blue-500' }
    case 'order_picked_up':
      return { icon: <Truck className="h-4 w-4" />, bgColor: 'bg-purple-50 dark:bg-purple-950/30', iconColor: 'text-purple-500' }
    case 'order_delivered':
      return { icon: <CheckCircle2 className="h-4 w-4" />, bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', iconColor: 'text-emerald-500' }
    case 'order_failed':
    case 'order_cancelled':
      return { icon: <XCircle className="h-4 w-4" />, bgColor: 'bg-red-50 dark:bg-red-950/30', iconColor: 'text-red-500' }
    case 'earning_credited':
      return { icon: <IndianRupee className="h-4 w-4" />, bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', iconColor: 'text-emerald-600' }
    case 'payout_processed':
      return { icon: <Wallet className="h-4 w-4" />, bgColor: 'bg-teal-50 dark:bg-teal-950/30', iconColor: 'text-teal-600' }
    case 'availability_reminder':
      return { icon: <Clock className="h-4 w-4" />, bgColor: 'bg-amber-50 dark:bg-amber-950/30', iconColor: 'text-amber-600' }
    case 'account_update':
      return { icon: <Shield className="h-4 w-4" />, bgColor: 'bg-gray-50 dark:bg-gray-800', iconColor: 'text-gray-500' }
    case 'system_alert':
      return { icon: <AlertTriangle className="h-4 w-4" />, bgColor: 'bg-orange-50 dark:bg-orange-950/30', iconColor: 'text-orange-500' }
    default:
      return { icon: <Bell className="h-4 w-4" />, bgColor: 'bg-gray-50 dark:bg-gray-800', iconColor: 'text-gray-500' }
  }
}

function getPriorityBadge(priority: string) {
  if (priority === 'urgent') {
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-[8px] px-1 py-0">Urgent</Badge>
  }
  if (priority === 'high') {
    return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0 text-[8px] px-1 py-0">High</Badge>
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Notification Card (compact)                                         */
/* ------------------------------------------------------------------ */

function NotificationCard({
  notification,
  onMarkRead,
  onDelete,
}: {
  notification: DeliveryNotification
  onMarkRead: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { icon, bgColor, iconColor } = getNotificationIcon(notification.type)
  const priorityBadge = getPriorityBadge(notification.priority)

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead(notification._id)
    }
  }

  const getRelatedLink = () => {
    if (!notification.relatedId) return null
    switch (notification.relatedType) {
      case 'order': return '/delivery/dashboard'
      case 'earning':
      case 'payout': return '/delivery/earnings'
      case 'account': return '/delivery/profile'
      default: return null
    }
  }

  const relatedLink = getRelatedLink()

  const content = (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-start gap-2.5 p-3 rounded-lg border transition-all duration-200 cursor-pointer',
        !notification.read
          ? 'bg-blue-50/30 dark:bg-blue-950/10 border-blue-100/60 dark:border-blue-900/20'
          : 'bg-card border-border/30 hover:border-border/60',
        relatedLink && 'hover:shadow-sm',
      )}
    >
      {/* Icon */}
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', bgColor, iconColor)}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {!notification.read && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              )}
              <p className={cn(
                'text-xs font-semibold line-clamp-1',
                !notification.read ? 'text-foreground' : 'text-foreground/80'
              )}>
                {notification.title}
              </p>
              {priorityBadge}
            </div>
            <p className={cn(
              'text-[11px] mt-0.5 line-clamp-2',
              !notification.read ? 'text-muted-foreground' : 'text-muted-foreground/70'
            )}>
              {notification.message}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[9px] text-muted-foreground/50 mt-0.5">
              {getRelativeTime(notification.createdAt)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(notification._id) }}
              className="h-5 w-5 flex items-center justify-center rounded-md text-muted-foreground/20 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              aria-label="Delete notification"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>

        {/* Navigate indicator */}
        {relatedLink && (
          <div className="flex items-center gap-0.5 mt-1 text-orange-600 dark:text-orange-400">
            <span className="text-[10px] font-medium">View</span>
            <ArrowRight className="h-2.5 w-2.5" />
          </div>
        )}
      </div>
    </div>
  )

  if (relatedLink) {
    return (
      <Link href={relatedLink} className="block">
        {content}
      </Link>
    )
  }

  return content
}

/* ------------------------------------------------------------------ */
/*  Notifications Page                                                  */
/* ------------------------------------------------------------------ */

export default function DeliveryNotificationsPage() {
  const { authenticated, handleAuthFailure } = useDeliveryBoyAuth()
  const { refresh: refreshGlobal } = useDeliveryBoyNotifications()

  // ── Initialize state with EMPTY defaults (SSR-safe — matches server render) ──
  const [notifications, setNotifications] = useState<DeliveryNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Whether we have ANY data
  const hasData = notifications.length > 0 || total > 0

  // Use a ref for hasData to avoid it being a useCallback dependency
  // (changing hasData would recreate fetchNotifications, causing polling loops)
  const hasDataRef = useRef(hasData)
  hasDataRef.current = hasData

  // Pagination
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // Action states
  const [markingAll, setMarkingAll] = useState(false)
  const [clearingRead, setClearingRead] = useState(false)

  // Refs for polling management
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFetchingRef = useRef(false)
  const mountedRef = useRef(false)

  /* ---------------------------------------------------------------- */
  /*  Fetch notifications — always silent (no loading spinner)         */
  /* ---------------------------------------------------------------- */

  const fetchNotifications = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!authenticated) return
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(`/api/delivery-boy/notifications?page=${pageNum}&limit=20`, {
        signal: controller.signal,
        credentials: 'include',
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        const data = await res.json()
        const newNotifications = append
          ? [...notifications, ...data.notifications]
          : data.notifications

        setNotifications(newNotifications)
        setUnreadCount(data.unreadCount || 0)
        setTotal(data.total || 0)
        setPage(pageNum)
        setHasMore(pageNum * 20 < (data.total || 0))
        setError(null)

        // Persist to cache (only first page)
        if (pageNum === 1) {
          writeCache({
            notifications: data.notifications,
            unreadCount: data.unreadCount || 0,
            total: data.total || 0,
          })
        }

        // Sync global unread count
        refreshGlobal()
      } else if (res.status === 401) {
        // Ask auth provider to verify the session — may be transient
        const authResult = await handleAuthFailure()
        if (authResult === 'session_valid') {
          // The 401 was transient — retry the request immediately
          isFetchingRef.current = false
          fetchNotifications(pageNum, append)
          return
        } else if (authResult === 'session_expired') {
          if (!hasDataRef.current) {
            setError('Session expired. Redirecting to login...')
          }
        } else {
          // network_error — show retry message, not "session expired"
          if (!hasDataRef.current) {
            setError('Connection issue. Retrying...')
          }
        }
      } else {
        if (!hasDataRef.current) setError('Failed to load notifications.')
      }
    } catch (err) {
      if (!hasDataRef.current) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Request timed out.')
        } else {
          setError('Network error. Please try again.')
        }
      }
    } finally {
      isFetchingRef.current = false
    }
  }, [authenticated, handleAuthFailure, notifications, refreshGlobal])

  /* ---------------------------------------------------------------- */
  /*  Hydrate from cache AFTER mount (prevents SSR mismatch)           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setNotifications(cached.notifications)
      setUnreadCount(cached.unreadCount)
      setTotal(cached.total)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Initial fetch on mount                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!authenticated) return
    mountedRef.current = true
    fetchNotifications(1)
    return () => {
      mountedRef.current = false
    }
  }, [authenticated, fetchNotifications])

  /* ---------------------------------------------------------------- */
  /*  Real-time polling with visibility-aware pause/resume             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!authenticated) return

    const startPolling = (intervalMs: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        if (mountedRef.current) fetchNotifications(1)
      }, intervalMs)
    }

    startPolling(POLL_INTERVAL_VISIBLE)

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchNotifications(1)
        startPolling(POLL_INTERVAL_VISIBLE)
      } else {
        startPolling(POLL_INTERVAL_HIDDEN)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authenticated, fetchNotifications])

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  const handleMarkRead = async (notificationId: string) => {
    try {
      await fetch('/api/delivery-boy/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notificationId }),
      })
      setNotifications(prev => prev.map(n => n._id === notificationId ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
      refreshGlobal()
    } catch {
      // silent
    }
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await fetch('/api/delivery-boy/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ markAllRead: true }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      refreshGlobal()
    } catch {
      // silent
    } finally {
      setMarkingAll(false)
    }
  }

  const handleDelete = async (notificationId: string) => {
    try {
      const res = await fetch('/api/delivery-boy/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notificationId }),
      })
      if (res.ok) {
        const deleted = notifications.find(n => n._id === notificationId)
        setNotifications(prev => prev.filter(n => n._id !== notificationId))
        setTotal(prev => Math.max(0, prev - 1))
        if (deleted && !deleted.read) {
          setUnreadCount(prev => Math.max(0, prev - 1))
          refreshGlobal()
        }
      }
    } catch {
      // silent
    }
  }

  const handleClearRead = async () => {
    setClearingRead(true)
    try {
      const res = await fetch('/api/delivery-boy/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clearRead: true }),
      })
      if (res.ok) {
        const data = await res.json()
        setNotifications(prev => prev.filter(n => !n.read))
        setTotal(prev => Math.max(0, prev - (data.deletedCount || 0)))
      }
    } catch {
      // silent
    } finally {
      setClearingRead(false)
    }
  }

  const loadMore = () => {
    if (hasMore) {
      fetchNotifications(page + 1, true)
    }
  }

  const readCount = notifications.filter(n => n.read).length

  /* ---------------------------------------------------------------- */
  /*  Error (only when no cached data exists at all)                   */
  /* ---------------------------------------------------------------- */

  if (error && !hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-destructive/10 text-destructive">
          <Bell className="h-7 w-7" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">Auto-retrying in background...</p>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Render — ALWAYS instant, never a loading spinner                 */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {/* ── Action Bar (compact) ── */}
      {(unreadCount > 0 || readCount > 0) && (
        <div className="flex items-center justify-end gap-1.5">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="h-7 text-[10px] gap-0.5 text-orange-600 hover:text-orange-700 px-2"
            >
              <CheckCheck className="h-3 w-3" />
              {markingAll ? '...' : 'Read all'}
            </Button>
          )}
          {readCount > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] gap-0.5 text-muted-foreground hover:text-red-600 px-2"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Clear Read Notifications</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Delete {readCount} read notification{readCount !== 1 ? 's' : ''}? This cannot be undone.
                </p>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" size="sm">Cancel</Button>
                  </DialogClose>
                  <Button
                    size="sm"
                    onClick={handleClearRead}
                    disabled={clearingRead}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {clearingRead ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* ── Content ── */}
      {notifications.length === 0 && !hasData ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
            <BellOff className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <h2 className="text-sm font-semibold mb-1">No notifications yet</h2>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            We&apos;ll notify you about deliveries, earnings, and important alerts.
          </p>
          <div className="flex items-center gap-3 mt-4">
            {[
              { icon: <Package className="h-3 w-3" />, text: 'Orders' },
              { icon: <IndianRupee className="h-3 w-3" />, text: 'Earnings' },
              { icon: <Info className="h-3 w-3" />, text: 'Alerts' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {item.icon}
                {item.text}
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <>
          <AnimatePresence>
            <div className="space-y-2">
              {notifications.map((n, idx) => (
                <NotificationCard
                  key={n._id || `notif-${idx}`}
                  notification={n}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </AnimatePresence>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center py-1">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                className="rounded-lg text-orange-600 border-orange-200 dark:border-orange-900/30 hover:bg-orange-50 dark:hover:bg-orange-950/30 text-xs h-7"
              >
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
