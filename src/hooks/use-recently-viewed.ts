'use client'

import { useState, useCallback } from 'react'

const KEY = 'realcart_recently_viewed'
const MAX = 20

interface RecentProduct {
  _id: string
  name: string
  mrp: number
  sellingPrice: number
  effectivePrice: number
  hasDiscount: boolean
  discountPercent: number
  imageUrl: string
  category: string
  brand: string
}

function loadItems(): RecentProduct[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        // Migrate old format: if items have 'price' but not 'mrp', map them
        return parsed.map((item: Record<string, unknown>) => ({
          _id: item._id as string,
          name: item.name as string,
          mrp: (item.mrp as number) ?? (item.price as number) ?? 0,
          sellingPrice: (item.sellingPrice as number) ?? (item.effectivePrice as number) ?? 0,
          effectivePrice: (item.effectivePrice as number) ?? 0,
          hasDiscount: (item.hasDiscount as boolean) ?? false,
          discountPercent: (item.discountPercent as number) ?? 0,
          imageUrl: (item.imageUrl as string) ?? '',
          category: (item.category as string) ?? '',
          brand: (item.brand as string) ?? '',
        }))
      }
    }
  } catch {
    // localStorage might be corrupted or unavailable
    try { localStorage.removeItem(KEY) } catch {}
  }
  return []
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentProduct[]>(loadItems)

  const addProduct = useCallback((product: RecentProduct) => {
    try {
      setItems(prev => {
        const filtered = prev.filter(p => p._id !== product._id)
        const updated = [product, ...filtered].slice(0, MAX)
        try { localStorage.setItem(KEY, JSON.stringify(updated)) } catch {}
        return updated
      })
    } catch {
      // Non-critical — ignore localStorage errors
    }
  }, [])

  return { items, addProduct }
}
