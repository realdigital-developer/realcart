'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'

/* ------------------------------------------------------------------ */
/*  Global singleton for unread count (shared across components)        */
/* ------------------------------------------------------------------ */

let globalUnreadCount = 0
const listeners: Set<(count: number) => void> = new Set()

function notifyListeners(count: number) {
  globalUnreadCount = count
  listeners.forEach(fn => fn(count))
}

/* ------------------------------------------------------------------ */
/*  Hook: useDeliveryBoyNotifications                                   */
/*  Provides unread count with 30s polling + manual refresh             */
/*  OPTIMIZED: Uses ?countOnly=true to avoid fetching full notification */
/*  list just for the unread count badge in the top bar.                */
/* ------------------------------------------------------------------ */

export function useDeliveryBoyNotifications() {
  const { authenticated } = useDeliveryBoyAuth()
  const [unreadCount, setUnreadCount] = useState(globalUnreadCount)

  useEffect(() => {
    listeners.add(setUnreadCount)
    return () => {
      listeners.delete(setUnreadCount)
    }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    if (!authenticated) {
      notifyListeners(0)
      return
    }
    try {
      // Use countOnly=true to avoid fetching full notification list
      const res = await fetch('/api/delivery-boy/notifications?countOnly=true', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        notifyListeners(data.unreadCount || 0)
      }
    } catch {
      // silent
    }
  }, [authenticated])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  return { unreadCount, refresh: fetchUnreadCount }
}
