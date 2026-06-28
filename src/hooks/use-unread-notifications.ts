'use client'

import { useState, useEffect, useCallback } from 'react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'

let globalUnreadCount = 0
const listeners: Set<(count: number) => void> = new Set()

function notifyListeners(count: number) {
  globalUnreadCount = count
  listeners.forEach(fn => fn(count))
}

export function useUnreadNotifications() {
  const { authenticated } = useCustomerAuth()
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
      const res = await fetch('/api/customer/notifications?limit=1')
      if (res.ok) {
        const data = await res.json()
        notifyListeners(data.unreadCount || 0)
      }
    } catch {
      // silent
    }
  }, [authenticated])

  useEffect(() => {
    fetchUnreadCount()
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  return { unreadCount, refresh: fetchUnreadCount }
}
