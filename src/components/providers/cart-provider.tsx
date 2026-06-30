'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { CartItem } from '@/components/customer/types'
import { createTimeoutSignal } from '@/lib/utils'

interface CartContextType {
  items: CartItem[]
  totalItems: number
  totalPrice: number
  totalSavings: number
  loading: boolean
  addToCart: (item: {
    productId: string
    name: string
    price: number
    effectivePrice: number
    /** Regular selling price (before special offer). Optional — used to split
     *  the discount into Product Discount + Special Offer in the price breakup. */
    sellingPrice?: number
    hasDiscount: boolean
    discountPercent: number
    imageUrl: string
    stock: number
    seller: string
    brand: string
    selectedVariant?: Record<string, string>
    quantity?: number
  }) => Promise<boolean>
  updateQuantity: (productId: string, quantity: number, selectedVariant?: Record<string, string>) => Promise<void>
  removeFromCart: (productId: string, selectedVariant?: Record<string, string>) => Promise<void>
  clearCart: () => Promise<void>
  isInCart: (productId: string, selectedVariant?: Record<string, string>) => boolean
  refreshCart: () => Promise<void>
}

const CartContext = createContext<CartContextType>({
  items: [],
  totalItems: 0,
  totalPrice: 0,
  totalSavings: 0,
  loading: true,
  addToCart: async () => false,
  updateQuantity: async () => {},
  removeFromCart: async () => {},
  clearCart: async () => {},
  isInCart: () => false,
  refreshCart: async () => {},
})

export function useCart() {
  return useContext(CartContext)
}

const LOCAL_CART_KEY = 'realcart_guest_cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useCustomerAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce((sum, item) => sum + (item.effectivePrice * item.quantity), 0)
  const totalSavings = items.reduce((sum, item) => sum + ((item.price - item.effectivePrice) * item.quantity), 0)

  // Load cart from localStorage (for guests)
  const loadLocalCart = useCallback(() => {
    try {
      const stored = localStorage.getItem(LOCAL_CART_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setItems(parsed)
        } else {
          localStorage.removeItem(LOCAL_CART_KEY)
          setItems([])
        }
      }
    } catch {
      try { localStorage.removeItem(LOCAL_CART_KEY) } catch {}
      setItems([])
    }
  }, [])

  // Save cart to localStorage (for guests)
  const saveLocalCart = useCallback((cartItems: CartItem[]) => {
    try {
      localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(cartItems))
    } catch {
      // localStorage full or unavailable — try removing and re-setting
      try {
        localStorage.removeItem(LOCAL_CART_KEY)
        localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(cartItems))
      } catch {
        // Completely unavailable — items still work in memory
      }
    }
  }, [])

  // Fetch cart from MongoDB (for authenticated users)
  const fetchServerCart = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/cart', {
        signal: createTimeoutSignal(8000), // 8s timeout
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.items)) {
          setItems(data.items)
        }
      }
    } catch {
      // Server unreachable — keep existing items in memory
    }
  }, [])

  // Merge guest cart with server cart on login
  const mergeGuestCart = useCallback(async () => {
    try {
      const stored = localStorage.getItem(LOCAL_CART_KEY)
      if (stored) {
        let guestItems: CartItem[]
        try {
          guestItems = JSON.parse(stored)
          if (!Array.isArray(guestItems)) guestItems = []
        } catch {
          guestItems = []
        }
        // Add each guest item to server cart
        for (const item of guestItems) {
          try {
            await fetch('/api/customer/cart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: item.productId,
                quantity: item.quantity,
                selectedVariant: item.selectedVariant || {},
              }),
              signal: createTimeoutSignal(5000),
            })
          } catch {
            // Skip this item if it fails, continue with others
          }
        }
        // Clear local cart after merge
        localStorage.removeItem(LOCAL_CART_KEY)
      }
    } catch {
      // non-critical
    }
  }, [])

  // Refresh cart
  const refreshCart = useCallback(async () => {
    if (authenticated) {
      await fetchServerCart()
    }
  }, [authenticated, fetchServerCart])

  // Track whether initial load has completed
  const [initialized, setInitialized] = useState(false)

  // Initial load and auth change handling
  useEffect(() => {
    if (authenticated) {
      mergeGuestCart().then(() => fetchServerCart()).finally(() => setInitialized(true))
    } else {
      loadLocalCart() // eslint-disable-line react-hooks/set-state-in-effect
      setInitialized(true)
    }
  }, [authenticated])

  // Set loading false once initialized (single transition, not reactive to items)
  useEffect(() => {
    if (initialized) {
      setLoading(false) // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [initialized])

  const addToCart = useCallback(async (item: {
    productId: string
    name: string
    price: number
    effectivePrice: number
    /** Regular selling price (before special offer). Optional. */
    sellingPrice?: number
    hasDiscount: boolean
    discountPercent: number
    imageUrl: string
    stock: number
    seller: string
    brand: string
    selectedVariant?: Record<string, string>
    quantity?: number
  }) => {
    if (authenticated) {
      try {
        const res = await fetch('/api/customer/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: item.productId,
            quantity: item.quantity || 1,
            selectedVariant: item.selectedVariant || {},
          }),
        })
        if (res.ok) {
          await fetchServerCart()
          return true
        }
        // Log error for debugging but don't crash
        const errData = await res.json().catch(() => ({}))
        console.warn('[addToCart] Server returned:', res.status, errData)
        return false
      } catch (err) {
        console.warn('[addToCart] Network error:', err)
        return false
      }
    } else {
      // Guest: save to localStorage
      const cartItem: CartItem = {
        ...item,
        quantity: item.quantity || 1,
        selectedVariant: item.selectedVariant || {},
        addedAt: new Date().toISOString(),
      }
      setItems(prev => {
        const variantKey = JSON.stringify(cartItem.selectedVariant)
        const existingIndex = prev.findIndex(
          i => i.productId === cartItem.productId && JSON.stringify(i.selectedVariant || {}) === variantKey
        )
        let newItems: CartItem[]
        if (existingIndex >= 0) {
          newItems = [...prev]
          newItems[existingIndex] = {
            ...newItems[existingIndex],
            quantity: Math.min(newItems[existingIndex].quantity + cartItem.quantity, cartItem.stock || 99),
          }
        } else {
          newItems = [...prev, cartItem]
        }
        saveLocalCart(newItems)
        return newItems
      })
      return true
    }
  }, [authenticated, fetchServerCart, saveLocalCart])

  const updateQuantity = useCallback(async (productId: string, quantity: number, selectedVariant: Record<string, string> = {}) => {
    if (authenticated) {
      try {
        const res = await fetch('/api/customer/cart', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, quantity, selectedVariant }),
        })
        if (res.ok) {
          await fetchServerCart()
        }
      } catch {
        // fallback
      }
    } else {
      setItems(prev => {
        if (quantity <= 0) {
          const newItems = prev.filter(i => {
            const variantKey = JSON.stringify(selectedVariant)
            return !(i.productId === productId && JSON.stringify(i.selectedVariant || {}) === variantKey)
          })
          saveLocalCart(newItems)
          return newItems
        }
        const newItems = prev.map(i => {
          const variantKey = JSON.stringify(selectedVariant)
          if (i.productId === productId && JSON.stringify(i.selectedVariant || {}) === variantKey) {
            return { ...i, quantity: Math.min(quantity, i.stock || 99) }
          }
          return i
        })
        saveLocalCart(newItems)
        return newItems
      })
    }
  }, [authenticated, fetchServerCart, saveLocalCart])

  const removeFromCart = useCallback(async (productId: string, selectedVariant: Record<string, string> = {}) => {
    if (authenticated) {
      try {
        await fetch('/api/customer/cart', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, selectedVariant }),
        })
        await fetchServerCart()
      } catch {
        // fallback
      }
    } else {
      setItems(prev => {
        const variantKey = JSON.stringify(selectedVariant)
        const newItems = prev.filter(
          i => !(i.productId === productId && JSON.stringify(i.selectedVariant || {}) === variantKey)
        )
        saveLocalCart(newItems)
        return newItems
      })
    }
  }, [authenticated, fetchServerCart, saveLocalCart])

  const clearCart = useCallback(async () => {
    if (authenticated) {
      try {
        await fetch('/api/customer/cart', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearAll: true }),
        })
        await fetchServerCart()
      } catch {
        // fallback
      }
    } else {
      setItems([])
      saveLocalCart([])
    }
  }, [authenticated, fetchServerCart, saveLocalCart])

  const isInCart = useCallback((productId: string, selectedVariant?: Record<string, string>) => {
    if (selectedVariant && Object.keys(selectedVariant).length > 0) {
      const variantKey = JSON.stringify(selectedVariant)
      return items.some(i => i.productId === productId && JSON.stringify(i.selectedVariant || {}) === variantKey)
    }
    return items.some(i => i.productId === productId)
  }, [items])

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        totalPrice: Math.round(totalPrice * 100) / 100,
        totalSavings: Math.round(totalSavings * 100) / 100,
        loading,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        isInCart,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}
