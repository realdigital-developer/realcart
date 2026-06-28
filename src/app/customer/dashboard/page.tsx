'use client'

import { useState, useEffect } from 'react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Heart,
  Package,
  MapPin,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useCart } from '@/components/providers/cart-provider'

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
/* ------------------------------------------------------------------ */

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

interface AddressData {
  _id: string
  name: string
  type: 'home' | 'work' | 'other'
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                      */
/* ------------------------------------------------------------------ */

export default function CustomerDashboard() {
  const { user, authenticated, loading: authLoading } = useCustomerAuth()
  const router = useRouter()
  const { totalItems: wishlistCount } = useWishlist()
  const { totalItems: cartItemCount } = useCart()

  const [addresses, setAddresses] = useState<AddressData[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Fetch real data
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch addresses
        const addrRes = await fetch('/api/customer/addresses')
        if (addrRes.ok) {
          const addrData = await addrRes.json()
          setAddresses(addrData.addresses || [])
        }
      } catch {
        // fallback to empty
      } finally {
        setDataLoading(false)
      }
    }

    if (authenticated) {
      fetchData()
    } else {
      setDataLoading(false)
    }
  }, [authenticated])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  /* ---- Stat Cards ---- */
  const stats = [
    {
      label: 'Wishlist Items',
      value: String(wishlistCount),
      icon: <Heart className="h-5 w-5" />,
      bgColor: 'bg-pink-500/10',
      textColor: 'text-pink-600 dark:text-pink-400',
    },
    {
      label: 'Cart Items',
      value: String(cartItemCount),
      icon: <Package className="h-5 w-5" />,
      bgColor: 'bg-emerald-500/10',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Saved Addresses',
      value: dataLoading ? '...' : String(addresses.length),
      icon: <MapPin className="h-5 w-5" />,
      bgColor: 'bg-amber-500/10',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
  ]

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="space-y-6"
      >
        {/* Welcome Section */}
        <motion.div variants={fadeInUp}>
          <Card className="overflow-hidden border-0 shadow-lg shadow-emerald-500/5">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10" />
              <CardContent className="relative p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                        Welcome back
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight">
                      Hello, {user?.name || 'Customer'}!
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Here&apos;s what&apos;s happening with your account today.
                    </p>
                  </div>
                  <Button
                    onClick={() => router.push('/customer')}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white gap-2 shadow-lg shadow-emerald-500/25 rounded-xl"
                  >
                    Continue Shopping
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </div>
          </Card>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={fadeInUp} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border/40 hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl', stat.bgColor, stat.textColor)}>
                    {stat.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={fadeInUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-border/40 hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/customer?tab=wishlist')}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400 shrink-0">
                <Heart className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-sm">Your Wishlist</p>
                <p className="text-xs text-muted-foreground mt-0.5">{wishlistCount} item{wishlistCount !== 1 ? 's' : ''} saved for later</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </CardContent>
          </Card>

          <Card className="border-border/40 hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/customer/addresses')}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <MapPin className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-sm">Manage Addresses</p>
                <p className="text-xs text-muted-foreground mt-0.5">{addresses.length} saved address{addresses.length !== 1 ? 'es' : ''}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}
