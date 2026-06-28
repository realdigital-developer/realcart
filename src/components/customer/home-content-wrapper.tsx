'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { ArrowLeft, CheckCircle2, X } from 'lucide-react'
import { Navbar } from './navbar'
import { MeeshoSearchBar } from './search-bar'
import { SearchPage } from './search-page'
import { BottomNavbar, BottomTab } from './bottom-navbar'
import { useBackToExit } from '@/hooks/use-back-to-exit'
import { ExitToast } from './exit-toast'
import { ImageSearchDialog } from './image-search-dialog'
import { useLanguage } from '@/components/providers/language-provider'
import type { Product, CategoryItem } from './types'
import type { HeroSlide } from './hero-slider'

// Dynamic imports with ssr: false
const CategorySection = dynamic(() => import('./category-section').then(m => ({ default: m.CategorySection })), { ssr: false })
const CategoriesPage = dynamic(() => import('./categories-page').then(m => ({ default: m.CategoriesPage })), { ssr: false })
const ProductsPage = dynamic(() => import('./products-page').then(m => ({ default: m.ProductsPage })), { ssr: false })
const CartPage = dynamic(() => import('./cart-page').then(m => ({ default: m.CartPage })), { ssr: false })
const WishlistPage = dynamic(() => import('./wishlist-page').then(m => ({ default: m.WishlistPage })), { ssr: false })
const AccountPage = dynamic(() => import('./account-page').then(m => ({ default: m.AccountPage })), { ssr: false })
const NotificationsPage = dynamic(() => import('./notifications-page').then(m => ({ default: m.NotificationsPage })), { ssr: false })
const HeroSlider = dynamic(() => import('./hero-slider').then(m => ({ default: m.HeroSlider })), { ssr: false })
const WhyShopWithUs = dynamic(() => import('./why-shop-with-us').then(m => ({ default: m.WhyShopWithUs })), { ssr: false })
const HomeContentSections = dynamic(() => import('./home-content-sections').then(m => ({ default: m.HomeContentSections })), { ssr: false })
const CheckoutPage = dynamic(() => import('./checkout-page').then(m => ({ default: m.CheckoutPage })), { ssr: false })
const HomeSections = dynamic(() => import('./home-sections'), { ssr: false })
const ProfilePage = dynamic(() => import('./profile-page').then(m => ({ default: m.ProfilePage })), { ssr: false })
const AddressesPage = dynamic(() => import('./addresses-page').then(m => ({ default: m.AddressesPage })), { ssr: false })
const OrdersPage = dynamic(() => import('./orders-page').then(m => ({ default: m.OrdersPage })), { ssr: false })
const LanguagePage = dynamic(() => import('./language-page').then(m => ({ default: m.LanguagePage })), { ssr: false })
const SharedProductsPage = dynamic(() => import('./shared-products-page').then(m => ({ default: m.SharedProductsPage })), { ssr: false })
const PaymentRefundPage = dynamic(() => import('./payment-refund-page').then(m => ({ default: m.PaymentRefundPage })), { ssr: false })
const BankUpiPage = dynamic(() => import('./bank-upi-page').then(m => ({ default: m.BankUpiPage })), { ssr: false })
const ReferralPage = dynamic(() => import('./referral-page').then(m => ({ default: m.ReferralPage })), { ssr: false })
const WalletPage = dynamic(() => import('./wallet-page').then(m => ({ default: m.WalletPage })), { ssr: false })
const FollowedSellersPage = dynamic(() => import('./followed-sellers-page').then(m => ({ default: m.FollowedSellersPage })), { ssr: false })
const HelpSupportPage = dynamic(() => import('./help-support-page').then(m => ({ default: m.HelpSupportPage })), { ssr: false })


// Tab content transition variants — used inside AnimatePresence only
const tabVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

// Extended tab type to include 'products', 'wishlist', 'notifications', 'profile', 'addresses', 'search' which are sub-tabs
type ExtendedTab = BottomTab | 'products' | 'wishlist' | 'notifications' | 'profile' | 'addresses' | 'search' | 'payment-refund' | 'bank-upi' | 'language' | 'shared-products' | 'followed-shop' | 'wallet' | 'referral' | 'help'

const validTabs: ExtendedTab[] = ['home', 'categories', 'cart', 'orders', 'account', 'products', 'wishlist', 'notifications', 'profile', 'addresses', 'search', 'payment-refund', 'bank-upi', 'language', 'shared-products', 'followed-shop', 'wallet', 'referral', 'help']

// Tabs that hide the BottomNavbar and show a back header
const subTabs: ExtendedTab[] = ['products', 'wishlist', 'notifications', 'profile', 'addresses', 'search', 'payment-refund', 'bank-upi', 'language', 'shared-products', 'followed-shop', 'wallet', 'referral', 'help']

// Parent tab mapping — used to build nav history when sub-tabs are loaded from URL
// so the back button works correctly after a page refresh.
const parentTabMap: Partial<Record<ExtendedTab, ExtendedTab>> = {
  products: 'home',
  wishlist: 'home',
  notifications: 'home',
  profile: 'account',
  addresses: 'account',
  search: 'home',
  'payment-refund': 'account',
  'bank-upi': 'account',
  'language': 'account',
  'shared-products': 'account',
  'followed-shop': 'account',
  'wallet': 'account',
  'referral': 'account',
  'help': 'account',
}

// Navigation history entry — tracks how a page was reached
interface NavEntry {
  tab: ExtendedTab
  fromBottomNav: boolean  // true = reached via bottom navbar (no back button); false = reached via in-page navigation (show back button)
}

export function HomeContentWrapper({ initialTab, initialSearch, initialCategory, initialSubcategory }: { initialTab?: string | null; initialSearch?: string | null; initialCategory?: string | null; initialSubcategory?: string | null }) {
  // 'checkout' is a special URL tab value that represents the checkout overlay.
  // It is NOT a real nav tab — the underlying nav tab is 'cart'.
  // On refresh, if tab=checkout, we reopen the checkout overlay at the saved step.
  const isInitialCheckout = initialTab === 'checkout'

  // Navigation history stack — each entry tracks the tab and how it was reached.
  // Bottom navbar clicks reset the stack (root destination), in-page navigation pushes onto it.
  const [navHistory, setNavHistory] = useState<NavEntry[]>(() => {
    // When the URL says 'checkout', the underlying nav tab is 'cart' (checkout is an overlay on cart).
    let tab: ExtendedTab
    if (isInitialCheckout) {
      tab = 'cart'
    } else if (initialTab && validTabs.includes(initialTab as ExtendedTab)) {
      tab = initialTab as ExtendedTab
    } else {
      tab = 'home' as ExtendedTab
    }

    // For sub-tabs that don't exist anymore, fall back to home
    if (tab === 'orderDetails' || tab === 'returns' || tab === 'returnDetails') tab = 'home'

    // For sub-tabs loaded from URL, push the parent tab first so the
    // back button works correctly after a page refresh.
    const parentTab = parentTabMap[tab]
    if (parentTab) {
      return [
        { tab: parentTab, fromBottomNav: true },
        { tab, fromBottomNav: false },
      ]
    }

    return [{ tab, fromBottomNav: true }]
  })
  // Initialize showCheckout from URL so a page refresh reopens the checkout overlay.
  const [showCheckout, setShowCheckout] = useState(isInitialCheckout)

  // Read the initial checkout step from the URL's `step` query param.
  // Only meaningful when isInitialCheckout is true. Used to restore the exact
  // checkout step (address/summary/payment) after a refresh.
  const [initialCheckoutStep] = useState<'address' | 'summary' | 'payment' | undefined>(() => {
    if (!isInitialCheckout || typeof window === 'undefined') return undefined
    const params = new URLSearchParams(window.location.search)
    const step = params.get('step')
    return step === 'summary' || step === 'payment' ? step : 'address'
  })
  const [searchQuery, setSearchQuery] = useState(initialSearch || '')
  const [productsCategoryFilter, setProductsCategoryFilter] = useState<string | undefined>(initialCategory || undefined)
  const [productsSubcategoryFilter, setProductsSubcategoryFilter] = useState<string | undefined>(initialSubcategory || undefined)

  // ── Image search state ──
  // When imageSearchResults is non-null, the products tab renders these
  // directly (no /api/products fetch) + shows the visual-search banner.
  // Setting it back to null returns the products tab to normal behavior.
  const [imageSearchOpen, setImageSearchOpen] = useState(false)
  const [imageSearchResults, setImageSearchResults] = useState<Product[] | null>(null)
  const [imageSearchInfo, setImageSearchInfo] = useState<{
    attributes?: { category?: string | null; color?: string | null; gender?: string | null }
    durationMs?: number
    previewUrl?: string
  } | undefined>(undefined)

  // ── Sync navHistory when initialTab prop changes (URL-driven navigation) ──
  // The navHistory useState initializer only runs ONCE (on first mount).
  // When the user clicks a link that does router.push('/customer?tab=wishlist')
  // or router.push('/customer?tab=cart'), the URL changes, CustomerHomeInner
  // re-renders with a new initialTab prop, but navHistory doesn't update —
  // so the wishlist/cart page never appears.
  //
  // This useEffect watches initialTab and updates navHistory when it changes.
  const lastSyncedTabRef = useRef(initialTab)
  useEffect(() => {
    if (initialTab === lastSyncedTabRef.current) return
    lastSyncedTabRef.current = initialTab

    if (!initialTab) return

    // Determine the target tab
    let tab: ExtendedTab
    if (initialTab === 'checkout') {
      tab = 'cart'
      setShowCheckout(true)
    } else if (validTabs.includes(initialTab as ExtendedTab)) {
      tab = initialTab as ExtendedTab
    } else {
      return // Invalid tab — ignore
    }

    // Skip the sync if we're already on this tab — means we got here via
    // in-page navigation (e.g., onNavigateToSearch pushed onto navHistory),
    // and resetting navHistory would lose the back-stack (e.g., products → search
    // would become home → search, breaking the back button).
    const currentActiveTab = navHistory[navHistory.length - 1]?.tab
    if (currentActiveTab === tab) return

    // For sub-tabs, push parent first so back button works
    const parentTab = parentTabMap[tab]
    if (parentTab) {
      setNavHistory([
        { tab: parentTab, fromBottomNav: true },
        { tab, fromBottomNav: false },
      ])
    } else {
      setNavHistory([{ tab, fromBottomNav: true }])
    }
  }, [initialTab, navHistory])

  // Payment success notification (from redirect callback)
  const [paymentSuccessInfo, setPaymentSuccessInfo] = useState<{ orderNumber: string } | null>(null)
  const [paymentErrorInfo, setPaymentErrorInfo] = useState<string | null>(null)

  // ── Categories cache (client-side) ──────────────────────────────────
  // Fetch ONCE when the customer panel mounts, then keep the data in state
  // so that every subsequent visit to the Home tab shows categories
  // INSTANTLY — no loading skeleton, no re-fetch.  This is the key
  // optimisation that makes the home tab feel "real-time": the
  // CategorySection component unmounts/remounts on every tab switch, but
  // the data lives here in the parent and is passed down as props.
  const [cachedCategories, setCachedCategories] = useState<CategoryItem[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchCategories() {
      try {
        const res = await fetch('/api/categories', {
          signal: AbortSignal.timeout(10000),
          cache: 'no-store',
        })
        const data = await res.json()
        if (!cancelled && res.ok && data.categories && Array.isArray(data.categories)) {
          setCachedCategories(data.categories)
        }
      } catch (err) {
        console.error('Failed to fetch categories:', err)
      } finally {
        if (!cancelled) setCategoriesLoaded(true)
      }
    }
    fetchCategories()
    return () => { cancelled = true }
  }, [])

  // ── Hero slides cache (client-side) ─────────────────────────────────
  // Same pattern as categories: fetch ONCE on mount, keep in parent state,
  // pass down to HeroSlider as props so it shows instantly on every Home
  // tab visit without re-fetching or showing the loading spinner.
  const [cachedHeroSlides, setCachedHeroSlides] = useState<HeroSlide[]>([])
  const [heroSlidesLoaded, setHeroSlidesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchHeroSlides() {
      try {
        const res = await fetch('/api/hero-slides', {
          signal: AbortSignal.timeout(10000),
          cache: 'no-store',
        })
        const data = await res.json()
        if (!cancelled && res.ok && data.slides && Array.isArray(data.slides)) {
          setCachedHeroSlides(data.slides)
        }
      } catch (err) {
        console.error('Failed to fetch hero slides:', err)
      } finally {
        if (!cancelled) setHeroSlidesLoaded(true)
      }
    }
    fetchHeroSlides()
    return () => { cancelled = true }
  }, [])

  // Check for payment callback URL params on mount
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const paymentSuccess = params.get('payment_success')
    const orderNumberParam = params.get('order_number')
    const paymentError = params.get('payment_error')

    if (paymentSuccess === 'true' && orderNumberParam) {
      // Use a microtask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setPaymentSuccessInfo({ orderNumber: orderNumberParam })
      })
      // Clean up URL params
      params.delete('payment_success')
      params.delete('order_number')
      const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`
      window.history.replaceState({}, '', newUrl)
    } else if (paymentError) {
      queueMicrotask(() => {
        setPaymentErrorInfo(paymentError)
      })
      params.delete('payment_error')
      const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`
      window.history.replaceState({}, '', newUrl)
    }
  }, [searchParams])


  // Derive activeTab from the last history entry
  const activeTab = navHistory[navHistory.length - 1].tab

  // Whether to show back button in the current page's header.
  // Show back button only if there's a previous page to go back to AND
  // the current page wasn't reached from bottom navbar.
  const showBackButton = navHistory.length > 1 && !navHistory[navHistory.length - 1].fromBottomNav

  // ── Navigation handlers ──

  // Bottom navbar tab change — resets history (bottom nav is always a "root" destination)
  const handleTabChange = useCallback((tab: BottomTab) => {
    setNavHistory([{ tab, fromBottomNav: true }])
    setProductsCategoryFilter(undefined)
    setProductsSubcategoryFilter(undefined)
    setImageSearchResults(null)
    setImageSearchInfo(undefined)
  }, [])

  // In-page navigation — pushes onto history (always shows back button)
  const handleAccountNavigate = useCallback((tab: string, _params?: Record<string, string>) => {
    if (validTabs.includes(tab as ExtendedTab)) {
      setNavHistory(prev => [...prev, { tab: tab as ExtendedTab, fromBottomNav: false }])
    }
  }, [])

  // Back navigation — pops from history to go to the previous page
  const handleBack = useCallback(() => {
    setNavHistory(prev => {
      if (prev.length <= 1) return [{ tab: 'home' as ExtendedTab, fromBottomNav: true }]
      return prev.slice(0, -1)
    })
    setProductsCategoryFilter(undefined)
    setProductsSubcategoryFilter(undefined)
    setImageSearchResults(null)
    setImageSearchInfo(undefined)
  }, [])

  // Sync URL and scroll position whenever activeTab or detail IDs change.
  // When the checkout overlay is open, the URL is set to ?tab=checkout and the
  // `step` param is managed by handleCheckoutStepChange (called from CheckoutPage).
  // When checkout closes, the URL reverts to ?tab=<activeTab>.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
      const url = new URL(window.location.href)
      if (showCheckout) {
        // Checkout overlay is open — set tab=checkout and clean up non-relevant params.
        // The `step` param is preserved here and managed by handleCheckoutStepChange.
        url.searchParams.set('tab', 'checkout')
        url.searchParams.delete('search')
        url.searchParams.delete('category')
        url.searchParams.delete('orderId')
        url.searchParams.delete('categoryId')
      } else {
        url.searchParams.set('tab', activeTab)
        // Clean up step when not in checkout (stale param from a previous checkout session)
        url.searchParams.delete('step')
        if (activeTab === 'products') {
          if (searchQuery) url.searchParams.set('search', searchQuery)
          if (productsCategoryFilter) url.searchParams.set('category', productsCategoryFilter)
          if (productsSubcategoryFilter) url.searchParams.set('subcategory', productsSubcategoryFilter)
        } else {
          url.searchParams.delete('search')
          url.searchParams.delete('category')
          url.searchParams.delete('subcategory')
        }
        // Remove orderId when navigating away from orders tab so returning via
        // bottom navbar shows the orders list (not a stale detail view).
        // orderId is only preserved on page refresh while still on the orders tab.
        if (activeTab !== 'orders') url.searchParams.delete('orderId')
        // Remove categoryId when navigating away from categories tab so returning
        // via bottom navbar shows the default (first) category.
        if (activeTab !== 'categories') url.searchParams.delete('categoryId')
      }
      window.history.replaceState({}, '', url.toString())
    }
  }, [activeTab, searchQuery, productsCategoryFilter, showCheckout])

  // Handle step changes from the CheckoutPage — updates the URL's `step` param
  // without affecting React state. This is what makes the checkout refresh-resilient:
  // each step transition writes the current step to the URL, so a refresh restores it.
  //
  // Special case: when the order is placed (step === 'success'), the URL is switched
  // to ?tab=orders so that a refresh on the success screen goes to the orders page
  // (where the user can see their just-placed order) instead of reopening checkout
  // with an empty cart.
  const handleCheckoutStepChange = useCallback((step: 'address' | 'summary' | 'payment' | 'success') => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (step === 'success') {
      // Order placed — switch URL to orders tab so refresh goes to orders page
      url.searchParams.set('tab', 'orders')
      url.searchParams.delete('step')
    } else {
      url.searchParams.set('tab', 'checkout')
      url.searchParams.set('step', step)
    }
    window.history.replaceState({}, '', url.toString())
  }, [])

  // Handle checkout close — restores URL to the underlying nav tab (cart).
  const handleCloseCheckout = useCallback(() => {
    setShowCheckout(false)
  }, [])

  // Handle initial search - searchQuery already initialized from initialSearch prop via useState

  const isSubTab = subTabs.includes(activeTab)
  const isHomeTab = activeTab === 'home'

  // "Press back again to exit" pattern — only active on the home tab.
  // When the user presses back on /customer?tab=home, a toast appears
  // ("Press back again to exit"). If they press back again within 2.5s,
  // the app exits. See src/hooks/use-back-to-exit.ts for full details.
  //
  // IMPORTANT: This hook MUST be called BEFORE any early returns (e.g., the
  // showCheckout check below). React requires hooks to be called in the same
  // order on every render — an early return would skip this hook, causing
  // "Rendered fewer hooks than expected" error.
  const { showExitToast } = useBackToExit(isHomeTab)

  // Checkout overlay — pass initialStep (for refresh restore) and onStepChange (for URL sync)
  if (showCheckout) {
    return (
      <CheckoutPage
        onClose={handleCloseCheckout}
        initialStep={initialCheckoutStep}
        onStepChange={handleCheckoutStepChange}
      />
    )
  }

  // Non-home, non-sub tabs: categories, cart, orders, account — need a header
  const mainTabLabels: Record<string, string> = {
    categories: t('nav.categories'),
    cart: t('nav.cart'),
    orders: t('nav.orders'),
    account: t('account.title'),
  }
  const needsMainHeader = !isHomeTab && !isSubTab

  // Whether the bottom navbar is visible — used to add bottom padding to scrollable content
  const showBottomNav = !isSubTab

  // Determine the onBack callback for page components.
  // Only pass the handler if we want to show a back button (i.e., page was NOT reached from bottom navbar).
  // When onBack is undefined, the page won't render a back arrow.
  const pageOnBack = showBackButton ? handleBack : undefined

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Payment Success Notification (from redirect callback) */}
      {paymentSuccessInfo && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-0 left-0 right-0 z-[100] p-4 flex justify-center"
        >
          <div className="bg-emerald-500 text-white rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-3 max-w-md w-full">
            <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{t('payment.success')}</p>
              <p className="text-xs text-emerald-100 truncate">{t('payment.successOrder', { orderNumber: paymentSuccessInfo.orderNumber })}</p>
            </div>
            <button
              onClick={() => setPaymentSuccessInfo(null)}
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-emerald-600 transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Payment Error Notification (from redirect callback) */}
      {paymentErrorInfo && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-0 left-0 right-0 z-[100] p-4 flex justify-center"
        >
          <div className="bg-red-500 text-white rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-3 max-w-md w-full">
            <X className="h-6 w-6 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{t('payment.failed')}</p>
              <p className="text-xs text-red-100">{paymentErrorInfo}</p>
            </div>
            <button
              onClick={() => setPaymentErrorInfo(null)}
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-red-600 transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Header for main tabs that don't have their own — categories, cart, orders, account pages have their own headers */}
      {needsMainHeader && activeTab !== 'categories' && activeTab !== 'cart' && activeTab !== 'orders' && activeTab !== 'account' && (
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 h-12">
            <button
              onClick={handleBack}
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
            <h1 className="text-base font-bold text-gray-800 dark:text-gray-200">
              {mainTabLabels[activeTab] || 'RealCart'}
            </h1>
          </div>
        </div>
      )}

      {/* Sub-tab header with back button (for profile only). Products, Search, Wishlist, Addresses, Notifications and new blank-page tabs have their own headers. */}
      {isSubTab && activeTab !== 'addresses' && activeTab !== 'notifications' && activeTab !== 'wishlist' && activeTab !== 'products' && activeTab !== 'search' && activeTab !== 'payment-refund' && activeTab !== 'bank-upi' && activeTab !== 'language' && activeTab !== 'shared-products' && activeTab !== 'followed-shop' && activeTab !== 'wallet' && activeTab !== 'referral' && activeTab !== 'help' && activeTab !== 'shared-products' && (
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 h-12">
            <button
              onClick={handleBack}
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
            <h1 className="text-base font-bold text-gray-800 dark:text-gray-200">
              {activeTab === 'notifications' ? t('common.notifications') : activeTab === 'profile' ? t('account.title') : activeTab === 'addresses' ? 'My Addresses' : 'Products'}
            </h1>
          </div>
        </div>
      )}

      {/* Tab Content — popLayout lets exiting content leave the flow immediately so entering content takes its place without a gap */}
      <AnimatePresence mode="popLayout">
        {activeTab === 'home' && (
          <motion.div
            key="home-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto pb-16"
          >
            <Navbar />
            <MeeshoSearchBar
              onSearch={(query) => {
                setSearchQuery(query)
                setProductsCategoryFilter(undefined)
                setProductsSubcategoryFilter(undefined)
                setImageSearchResults(null)
                setImageSearchInfo(undefined)
                setNavHistory(prev => {
                  // If already on products tab, just update search
                  if (prev[prev.length - 1].tab === 'products') {
                    return [...prev.slice(0, -1), { tab: 'products' as ExtendedTab, fromBottomNav: false }]
                  }
                  return [...prev, { tab: 'products' as ExtendedTab, fromBottomNav: false }]
                })
              }}
              onSearchClick={() => {
                setNavHistory(prev => [...prev, { tab: 'search' as ExtendedTab, fromBottomNav: false }])
              }}
              initialQuery=""
            />
            <CategorySection
              categories={cachedCategories}
              loading={!categoriesLoaded}
              onCategoryClick={(categoryName) => {
              setSearchQuery('')
              setProductsSubcategoryFilter(undefined)
              setProductsCategoryFilter(categoryName)
              setImageSearchResults(null)
              setImageSearchInfo(undefined)
              setNavHistory(prev => [...prev, { tab: 'products' as ExtendedTab, fromBottomNav: false }])
            }} />
            <HeroSlider slides={cachedHeroSlides} loading={!heroSlidesLoaded} />
            <HomeContentSections onNavigateToProducts={(params) => {
              setSearchQuery('')
              setProductsSubcategoryFilter(undefined)
              setProductsCategoryFilter(params?.category)
              setImageSearchResults(null)
              setImageSearchInfo(undefined)
              setNavHistory(prev => [...prev, { tab: 'products' as ExtendedTab, fromBottomNav: false }])
            }} />
          </motion.div>
        )}

        {activeTab === 'categories' && (
          <motion.div
            key="categories-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <CategoriesPage onBack={pageOnBack} onNavigate={(tab, params) => {
              if (tab === 'products' && (params?.category || params?.subcategory)) {
                setSearchQuery('')
                setImageSearchResults(null)
                setImageSearchInfo(undefined)
                setNavHistory(prev => [...prev, { tab: 'products' as ExtendedTab, fromBottomNav: false }])
                // Clear the opposite filter so they don't compound across clicks
                if (params.subcategory) {
                  setProductsCategoryFilter(undefined)
                  setProductsSubcategoryFilter(params.subcategory)
                } else if (params.category) {
                  setProductsSubcategoryFilter(undefined)
                  setProductsCategoryFilter(params.category)
                }
              } else {
                handleAccountNavigate(tab)
              }
            }} />
          </motion.div>
        )}

        {activeTab === 'products' && (
          <motion.div
            key="products-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <ProductsPage
              initialSearch={searchQuery}
              initialCategory={productsCategoryFilter}
              initialSubcategory={productsSubcategoryFilter}
              onBack={pageOnBack}
              onNavigateToSearch={() => {
                // When search is opened FROM the products page, we want the
                // back button on the search page to go to HOME (not back to
                // the products page). This is smarter because:
                //   - The user was already viewing products and tapped search
                //   - Going back to products would show the same products again
                //   - Going to home gives them a fresh starting point
                //
                // To achieve this, we replace the 'products' entry with 'home'
                // before pushing 'search' onto the history:
                //   Before: [home, products] → push search → [home, products, search]
                //   After:  [home, products] → replace products with home → [home, home, search]
                //           → simplified to [home, search] → back goes to home ✓
                setNavHistory(prev => {
                  const last = prev[prev.length - 1]
                  if (last && last.tab === 'products') {
                    // Replace the products entry with home, then push search
                    return [...prev.slice(0, -1), { tab: 'home' as ExtendedTab, fromBottomNav: true }, { tab: 'search' as ExtendedTab, fromBottomNav: false }]
                  }
                  return [...prev, { tab: 'search' as ExtendedTab, fromBottomNav: false }]
                })
              }}
              initialImageProducts={imageSearchResults ?? undefined}
              imageSearchInfo={imageSearchInfo}
            />
          </motion.div>
        )}

        {activeTab === 'cart' && (
          <motion.div
            key="cart-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <CartPage onBack={pageOnBack} onNavigate={handleAccountNavigate} onCheckout={() => setShowCheckout(true)} />
          </motion.div>
        )}

        {activeTab === 'wishlist' && (
          <motion.div
            key="wishlist-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <WishlistPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div
            key="orders-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <OrdersPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}

        {activeTab === 'account' && (
          <motion.div
            key="account-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <AccountPage onNavigate={handleAccountNavigate} onBack={pageOnBack} />
          </motion.div>
        )}

        {activeTab === 'notifications' && (
          <motion.div
            key="notifications-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <NotificationsPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}

        {activeTab === 'profile' && (
          <motion.div
            key="profile-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <ProfilePage />
          </motion.div>
        )}

        {activeTab === 'addresses' && (
          <motion.div
            key="addresses-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <AddressesPage onBack={pageOnBack} />
          </motion.div>
        )}

        {/* ── New account sub-tabs (blank pages) ── */}
        {activeTab === 'payment-refund' && (
          <motion.div key="payment-refund-tab" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="flex-1 overflow-y-auto">
            <PaymentRefundPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}
        {activeTab === 'bank-upi' && (
          <motion.div key="bank-upi-tab" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="flex-1 overflow-y-auto">
            <BankUpiPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}
        {activeTab === 'language' && (
          <motion.div key="language-tab" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="flex-1 overflow-y-auto">
            <LanguagePage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}
        {activeTab === 'shared-products' && (
          <motion.div key="shared-products-tab" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="flex-1 overflow-y-auto">
            <SharedProductsPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}
        {activeTab === 'followed-shop' && (
          <motion.div key="followed-shop-tab" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="flex-1 overflow-y-auto">
            <FollowedSellersPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}
        {activeTab === 'wallet' && (
          <motion.div key="wallet-tab" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="flex-1 overflow-y-auto">
            <WalletPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}
        {activeTab === 'referral' && (
          <motion.div key="referral-tab" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="flex-1 overflow-y-auto">
            <ReferralPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}
        {activeTab === 'help' && (
          <motion.div key="help-tab" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="flex-1 overflow-y-auto">
            <HelpSupportPage onBack={pageOnBack} onNavigate={handleAccountNavigate} />
          </motion.div>
        )}


        {activeTab === 'search' && (
          <motion.div
            key="search-tab"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 overflow-y-auto"
          >
            <SearchPage
              onBack={handleBack}
              onSearch={(query) => {
                setSearchQuery(query)
                setProductsCategoryFilter(undefined)
                setProductsSubcategoryFilter(undefined)
                setImageSearchResults(null)
                setImageSearchInfo(undefined)
                setNavHistory(prev => {
                  // Replace the 'search' tab with 'products' tab so back
                  // from products goes to home (not back to search)
                  const withoutSearch = prev.filter(e => e.tab !== 'search')
                  if (withoutSearch.length > 0 && withoutSearch[withoutSearch.length - 1].tab === 'products') {
                    return [...withoutSearch.slice(0, -1), { tab: 'products' as ExtendedTab, fromBottomNav: false }]
                  }
                  return [...withoutSearch, { tab: 'products' as ExtendedTab, fromBottomNav: false }]
                })
              }}
              onImageSearch={() => setImageSearchOpen(true)}
              initialQuery={searchQuery}
            />
          </motion.div>
        )}


      </AnimatePresence>

      {/* Bottom spacer for fixed BottomNavbar — ensures content isn't hidden behind it on mobile */}
      {showBottomNav && <div className="h-16 lg:h-0 flex-shrink-0" />}

      {/* BottomNavbar — always rendered (never unmounted) to preserve Framer Motion layoutId animations.
          Visibility is controlled via CSS to prevent the blink caused by unmount/remount cycles. */}
      <BottomNavbar
        activeTab={subTabs.includes(activeTab) ? 'home' : (activeTab as BottomTab)}
        onTabChange={handleTabChange}
        visible={showBottomNav}
      />

      {/* "Press back again to exit" toast — shown when the user presses back
          on the home tab. See useBackToExit hook for the full logic. */}
      <ExitToast visible={showExitToast} />

      {/* ── Image Search Dialog ──
          Opens when the user taps the camera icon in the search bar or
          search page. On success, navigates to the products tab with the
          image results + the visual-search banner metadata. */}
      <ImageSearchDialog
        open={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        onSuccess={(result) => {
          // Store the results + metadata for the products page to render
          setImageSearchResults(result.products)
          setImageSearchInfo({
            attributes: result.attributes,
            durationMs: result.durationMs,
            previewUrl: result.previewUrl,
          })
          // Clear any text search / category filter so the products page
          // shows ONLY the image results (no conflicting filters).
          setSearchQuery('')
          setProductsCategoryFilter(undefined)
          setProductsSubcategoryFilter(undefined)
          // Navigate to the products tab. If we're already on products,
          // replace the current entry; otherwise push onto the history.
          setNavHistory(prev => {
            if (prev[prev.length - 1].tab === 'products') {
              return [...prev.slice(0, -1), { tab: 'products' as ExtendedTab, fromBottomNav: false }]
            }
            return [...prev, { tab: 'products' as ExtendedTab, fromBottomNav: false }]
          })
          setImageSearchOpen(false)
        }}
      />
    </div>
  )
}
