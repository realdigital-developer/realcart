'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { WishlistItem } from '@/components/customer/types'
import { createTimeoutSignal } from '@/lib/utils'

interface WishlistContextType {
  items: WishlistItem[]
  totalItems: number
  loading: boolean
  addToWishlist: (item: {
    productId: string
    name: string
    price: number
    effectivePrice: number
    hasDiscount: boolean
    discountPercent: number
    imageUrl: string
    stock: number
    seller: string
    brand: string
  }) => Promise<void>
  removeFromWishlist: (productId: string) => Promise<void>
  clearWishlist: () => Promise<void>
  isInWishlist: (productId: string) => boolean
  toggleWishlist: (item: {
    productId: string
    name: string
    price: number
    effectivePrice: number
    hasDiscount: boolean
    discountPercent: number
    imageUrl: string
    stock: number
    seller: string
    brand: string
  }) => Promise<void>
  refreshWishlist: () => Promise<void>
}

const WishlistContext = createContext<WishlistContextType>({
  items: [],
  totalItems: 0,
  loading: true,
  addToWishlist: async () => {},
  removeFromWishlist: async () => {},
  clearWishlist: async () => {},
  isInWishlist: () => false,
  toggleWishlist: async () => {},
  refreshWishlist: async () => {},
})

export function useWishlist() {
  return useContext(WishlistContext)
}

const LOCAL_WISHLIST_KEY = 'realcart_guest_wishlist'

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useCustomerAuth()
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)

  const totalItems = items.length

  // Load wishlist from localStorage (for guests)
  const loadLocalWishlist = useCallback(() => {
    try {
      const stored = localStorage.getItem(LOCAL_WISHLIST_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setItems(parsed)
        } else {
          localStorage.removeItem(LOCAL_WISHLIST_KEY)
          setItems([])
        }
      }
    } catch {
      try { localStorage.removeItem(LOCAL_WISHLIST_KEY) } catch {}
      setItems([])
    }
  }, [])

  // Save wishlist to localStorage (for guests)
  const saveLocalWishlist = useCallback((wishlistItems: WishlistItem[]) => {
    try {
      localStorage.setItem(LOCAL_WISHLIST_KEY, JSON.stringify(wishlistItems))
    } catch {
      try {
        localStorage.removeItem(LOCAL_WISHLIST_KEY)
        localStorage.setItem(LOCAL_WISHLIST_KEY, JSON.stringify(wishlistItems))
      } catch {
        // Completely unavailable — items still work in memory
      }
    }
  }, [])

  // Fetch wishlist from MongoDB
  const fetchServerWishlist = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/wishlist', {
        signal: createTimeoutSignal(8000), // 8s timeout
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        if (Array.isArray(data.items)) {
          setItems(data.items)
        }
      }
    } catch {
      // Server unreachable — keep existing items in memory
    }
  }, [])

  // Merge guest wishlist on login
  const mergeGuestWishlist = useCallback(async () => {
    try {
      const stored = localStorage.getItem(LOCAL_WISHLIST_KEY)
      if (stored) {
        let guestItems: WishlistItem[]
        try {
          guestItems = JSON.parse(stored)
          if (!Array.isArray(guestItems)) guestItems = []
        } catch {
          guestItems = []
        }
        for (const item of guestItems) {
          try {
            await fetch('/api/customer/wishlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ productId: item.productId }),
              signal: createTimeoutSignal(5000),
            })
          } catch {
            // Skip this item if it fails
          }
        }
        localStorage.removeItem(LOCAL_WISHLIST_KEY)
      }
    } catch {
      // non-critical
    }
  }, [])

  const refreshWishlist = useCallback(async () => {
    if (authenticated) {
      await fetchServerWishlist()
    }
  }, [authenticated, fetchServerWishlist])

  // Track whether initial load has completed
  const [initialized, setInitialized] = useState(false)

  // Initial load
  useEffect(() => {
    if (authenticated) {
      mergeGuestWishlist().then(() => fetchServerWishlist()).finally(() => setInitialized(true))
    } else {
      loadLocalWishlist() // eslint-disable-line react-hooks/set-state-in-effect
      setInitialized(true)
    }
  }, [authenticated])

  // Set loading false once initialized (single transition, not reactive to items)
  useEffect(() => {
    if (initialized) {
      setLoading(false) // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [initialized])

  const addToWishlist = useCallback(async (item: {
    productId: string
    name: string
    price: number
    effectivePrice: number
    hasDiscount: boolean
    discountPercent: number
    imageUrl: string
    stock: number
    seller: string
    brand: string
  }) => {
    if (authenticated) {
      try {
        const res = await fetch('/api/customer/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: item.productId }),
        })
        if (res.ok) {
          await fetchServerWishlist()
        }
      } catch {
        // fallback
      }
    } else {
      const wishlistItem: WishlistItem = {
        ...item,
        addedAt: new Date().toISOString(),
      }
      setItems(prev => {
        if (prev.some(i => i.productId === item.productId)) return prev
        const newItems = [...prev, wishlistItem]
        saveLocalWishlist(newItems)
        return newItems
      })
    }
  }, [authenticated, fetchServerWishlist, saveLocalWishlist])

  const removeFromWishlist = useCallback(async (productId: string) => {
    if (authenticated) {
      try {
        await fetch('/api/customer/wishlist', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
        })
        await fetchServerWishlist()
      } catch {
        // fallback
      }
    } else {
      setItems(prev => {
        const newItems = prev.filter(i => i.productId !== productId)
        saveLocalWishlist(newItems)
        return newItems
      })
    }
  }, [authenticated, fetchServerWishlist, saveLocalWishlist])

  const clearWishlist = useCallback(async () => {
    if (authenticated) {
      try {
        await fetch('/api/customer/wishlist', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearAll: true }),
        })
        await fetchServerWishlist()
      } catch {
        // fallback
      }
    } else {
      setItems([])
      saveLocalWishlist([])
    }
  }, [authenticated, fetchServerWishlist, saveLocalWishlist])

  const isInWishlist = useCallback((productId: string) => {
    return items.some(i => i.productId === productId)
  }, [items])

  const toggleWishlist = useCallback(async (item: {
    productId: string
    name: string
    price: number
    effectivePrice: number
    hasDiscount: boolean
    discountPercent: number
    imageUrl: string
    stock: number
    seller: string
    brand: string
  }) => {
    if (isInWishlist(item.productId)) {
      await removeFromWishlist(item.productId)
    } else {
      await addToWishlist(item)
    }
  }, [isInWishlist, addToWishlist, removeFromWishlist])

  return (
    <WishlistContext.Provider
      value={{
        items,
        totalItems,
        loading,
        addToWishlist,
        removeFromWishlist,
        clearWishlist,
        isInWishlist,
        toggleWishlist,
        refreshWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  )
}
