'use client'

/**
 * DeliveryChecker — Production-grade "Delivery by" section
 * ----------------------------------------------------------
 * Reusable component that mirrors the Flipkart / Meesho / Amazon "Delivery by"
 * UX on the product detail page:
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ 📍 Deliver to 560001        [Change]          │
 *   │ Delivery by Mon, 15 Jun  •  Free delivery     │
 *   │ ✅ Cash on Delivery available                 │
 *   │ ⚡ Express: Sun, 14 Jun (+₹49)                │
 *   └───────────────────────────────────────────────┘
 *
 * Features:
 *   - Pincode input with 6-digit validation
 *   - Auto-fills the customer's default-address pincode on mount (logged-in)
 *   - Persists the last-checked pincode in localStorage (per device)
 *   - Shows estimated delivery date range (business days, skips Sundays)
 *   - Shows COD availability badge
 *   - Shows express option when available (faster date + surcharge)
 *   - Shows free-delivery / charge clearly
 *   - Graceful error + loading states
 *   - Fully backward compatible: if the API is unreachable, shows a sensible
 *     default estimate so the product page never breaks.
 *
 * Non-destructive: this is a NEW self-contained component. It does NOT modify
 * any existing product-detail-page state — it manages its own pincode state.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Truck,
  MapPin,
  Check,
  X,
  Loader2,
  ChevronDown,
  Zap,
  ShieldCheck,
  AlertCircle,
  Search,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useCustomerAuth } from '@/components/providers/customer-auth-provider'
import {
  formatDeliveryDate,
  type DeliveryEstimate,
} from '@/lib/delivery-engine'

interface DeliveryCheckerProps {
  /** Product ID (for single-product delivery estimate). */
  productId: string
  /** Seller id (carried through for context — not required, API resolves it). */
  sellerId?: string
  /** Product-level free-delivery flag. */
  freeDelivery?: boolean
  /** Product-level shipping overrides. */
  shipping?: {
    deliveryCharge?: number
    freeDeliveryAbove?: number
  }
  /**
   * Product's current effective price (post-discount). Used by the graceful
   * fallback path (when the delivery API is unreachable) to correctly
   * determine whether the per-product `freeDeliveryAbove` threshold has been
   * met — so the fallback estimate never shows "Free delivery" for a
   * low-price product that hasn't met the seller's threshold.
   */
  productPrice?: number
  /** Compact variant (for cart sidebar) vs full variant (product page). */
  variant?: 'full' | 'compact'
  className?: string
}

/* ============================================================ */
/*  CartDeliveryEstimate — compact one-line estimate for cart/checkout  */
/* ============================================================ */

interface CartDeliveryEstimateProps {
  /** Destination pincode (required — from the selected shipping address). */
  pincode: string
  /** Destination state (improves zoning accuracy). */
  state?: string
  /** Cart items for the estimate. */
  items: Array<{ productId: string; quantity: number; effectivePrice?: number }>
  /**
   * Optional — the customer's currently-selected delivery option.
   * When 'express' is selected AND the engine returned an express date,
   * the "Delivery by" date reflects the express ETA (with a ⚡ badge)
   * instead of the standard ETA. Falls back to standard gracefully.
   */
  selectedOption?: 'standard' | 'express'
  className?: string
}

/**
 * Compact one-line delivery estimate shown in the cart sidebar and the
 * checkout order-summary. Fetches the estimate via the delivery check API
 * and renders: "🚚 Delivery by Mon, 15 Jun · Free / ₹49".
 *
 * When `selectedOption === 'express'` is passed (checkout summary only),
 * the "Delivery by" date reflects the express ETA (with a ⚡ badge) when
 * the engine returned one — mirroring Flipkart/Amazon where the chosen
 * delivery option's date appears in the address card.
 *
 * Gracefully renders nothing if the pincode is missing or the API fails —
 * so the checkout UI never breaks.
 */
export function CartDeliveryEstimate({ pincode, state, items, selectedOption, className }: CartDeliveryEstimateProps) {
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const valid = pincode && /^\d{6}$/.test(pincode) && items && items.length > 0
    if (!valid) {
      // Defer the clear so it doesn't run synchronously inside the effect body
      // (avoids the cascading-render lint warning).
      Promise.resolve().then(() => {
        if (!cancelled) {
          setEstimate(null)
          setLoading(false)
        }
      })
      return
    }
    // Standard data-fetching pattern: set loading, fetch, then update.
    // The sync setState here is intentional and safe (single render pass).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch('/api/customer/delivery/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pincode, state, items }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.estimate) setEstimate(data.estimate as DeliveryEstimate)
      })
      .catch(() => {
        /* non-fatal — leave estimate null */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pincode, state, items])

  if (!pincode || !/^\d{6}$/.test(pincode)) return null

  if (loading) {
    return (
      <p className={cn('text-[11px] text-gray-400 flex items-center gap-1.5', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking delivery date…
      </p>
    )
  }

  if (!estimate) return null

  if (!estimate.serviceable) {
    return (
      <p className={cn('text-[11px] text-red-500 flex items-center gap-1.5', className)}>
        <X className="h-3 w-3" />
        {estimate.reason || 'Delivery not available at this pincode'}
      </p>
    )
  }

  // Resolve which date to show based on the customer's selected option.
  // Standard (default) → latest standard delivery date.
  // Express (only when engine confirms express is available AND returned a
  // valid express date) → express date, with a ⚡ badge to make it obvious
  // the customer's express choice is reflected in the address card.
  // If express was selected but is unavailable/no express date, gracefully
  // fall back to the standard date so the UI never breaks.
  const useExpress =
    selectedOption === 'express' &&
    estimate.expressAvailable === true &&
    Boolean(estimate.expressDate)

  const deliveryDateIso = useExpress
    ? (estimate.expressDate as string)
    : estimate.deliveryDateMax

  return (
    <p className={cn('text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5', className)}>
      <Truck className="h-3 w-3 text-emerald-500" />
      Delivery by{' '}
      <span
        className={cn(
          'font-semibold',
          useExpress
            ? 'text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5'
            : 'text-emerald-700 dark:text-emerald-400',
        )}
      >
        {useExpress && <Zap className="h-2.5 w-2.5" />}
        {formatDeliveryDate(deliveryDateIso)}
      </span>
      <span className="text-gray-400">·</span>
      {useExpress ? (
        /* Express selected — show the express charge (base + surcharge, or
           surcharge only when standard is free). This MUST match the charge
           the customer saw in the delivery-option selector, otherwise the
           address card shows a different (standard) fee than the selected
           express option — which is the bug this fixes. */
        estimate.expressCharge && estimate.expressCharge > 0 ? (
          <span className="text-amber-600 dark:text-amber-400 font-medium">₹{estimate.expressCharge}</span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Free</span>
        )
      ) : estimate.isFreeDelivery ? (
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Free</span>
      ) : estimate.deliveryCharge > 0 ? (
        <span>₹{estimate.deliveryCharge}</span>
      ) : (
        <span>Standard</span>
      )}
      {estimate.codAvailable && (
        <>
          <span className="text-gray-400">·</span>
          <span className="inline-flex items-center gap-0.5">
            <ShieldCheck className="h-3 w-3" /> COD
          </span>
        </>
      )}
    </p>
  )
}

/**
 * Per-customer delivery-pincode persistence (production-grade isolation)
 * --------------------------------------------------------------------
 * PROBLEM: The previous implementation used a single global localStorage
 * key (`rc_delivery_pincode`) shared by every customer on the same
 * browser. When Customer A entered their pincode and later Customer B
 * logged in on the same browser, Customer B saw Customer A's pincode —
 * a clear privacy / data-isolation bug.
 *
 * FIX (mirrors Flipkart / Amazon / Meesho):
 *   1. localStorage keys are namespaced per customer. Logged-in users
 *      get `rc_delivery_pincode_<userId>`; guests get `rc_delivery_pincode_guest`.
 *      This guarantees two customers on the same browser never share data.
 *   2. The location is ALSO persisted server-side on the customer document
 *      (via /api/customer/delivery/location) so it syncs across devices —
 *      exactly like Flipkart remembering your delivery pincode on a new
 *      device after you log in.
 *   3. When the authenticated user changes (login / logout), the in-memory
 *      pincode state is reset and reloaded from the correct source so a
 *      previous customer's pincode never leaks into the new session.
 *   4. The old global keys are migrated once (to the guest namespace) and
 *      then deleted, so existing guest users keep their pincode while
 *      logged-in users get a clean per-account pincode.
 */
const LS_KEY_LEGACY = 'rc_delivery_pincode'
const LS_STATE_KEY_LEGACY = 'rc_delivery_state'

/** Returns the per-customer localStorage key for the pincode. */
function pincodeKey(userId?: string) {
  return userId ? `rc_delivery_pincode_${userId}` : 'rc_delivery_pincode_guest'
}
/** Returns the per-customer localStorage key for the state. */
function stateKey(userId?: string) {
  return userId ? `rc_delivery_state_${userId}` : 'rc_delivery_state_guest'
}

/**
 * One-time migration of the old global keys → guest namespace.
 * Moves any pre-existing global pincode to the guest key and deletes the
 * old global key so it can never leak into a different customer's session.
 * Only runs for guests (no userId) to avoid attributing a stale browser
 * pincode to a just-logged-in customer.
 */
function migrateLegacyGuestKeys() {
  if (typeof window === 'undefined') return
  try {
    const oldPin = window.localStorage.getItem(LS_KEY_LEGACY)
    const oldState = window.localStorage.getItem(LS_STATE_KEY_LEGACY)
    if (oldPin && /^\d{6}$/.test(oldPin)) {
      // Only migrate into the guest namespace; logged-in users always
      // load from the server / their own namespaced key.
      const guestPinKey = pincodeKey(undefined)
      if (!window.localStorage.getItem(guestPinKey)) {
        window.localStorage.setItem(guestPinKey, oldPin)
        if (oldState) window.localStorage.setItem(stateKey(undefined), oldState)
      }
    }
    // Always remove the legacy global keys so they can never leak again
    window.localStorage.removeItem(LS_KEY_LEGACY)
    window.localStorage.removeItem(LS_STATE_KEY_LEGACY)
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function DeliveryChecker({
  productId,
  sellerId: _sellerId,
  freeDelivery,
  shipping,
  productPrice,
  variant = 'full',
  className,
}: DeliveryCheckerProps) {
  // user.id is the per-customer namespace key. When it changes (login/logout),
  // the initialization effect below resets and reloads from the correct source.
  const { authenticated, user } = useCustomerAuth()
  const userId = user?.id
  const [pincode, setPincode] = useState<string>('')
  const [state, setState] = useState<string | undefined>(undefined)
  const [inputPincode, setInputPincode] = useState<string>('')
  const [editing, setEditing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ---------- 1. Initialize pincode — PER-CUSTOMER, never shared ----------
   *
   * Load priority (logged-in):
   *   1. Per-customer localStorage (`rc_delivery_pincode_<userId>`) — fast cache
   *   2. Server-side saved delivery location (syncs across devices)
   *   3. Customer's default address pincode
   *   4. Empty (prompt the user)
   *
   * Load priority (guest):
   *   1. Guest localStorage (`rc_delivery_pincode_guest`)
   *   2. Empty (prompt the user)
   *
   * When `userId` changes (login / logout / account switch), the entire
   * pincode/state/estimate state is reset FIRST so a previous customer's
   * pincode can never bleed into the new session.
   */
  useEffect(() => {
    let mounted = true

    // Migrate any legacy global keys → guest namespace, then delete the
    // global keys so they can never leak across customers again.
    migrateLegacyGuestKeys()

    // RESET state on auth-state change so the previous session's pincode
    // is never shown to a different customer.
    setPincode('')
    setInputPincode('')
    setState(undefined)
    setEstimate(null)
    setError(null)

    const pKey = pincodeKey(userId)
    const sKey = stateKey(userId)

    // Step 1: per-customer localStorage (fast cache)
    const savedPin = typeof window !== 'undefined' ? window.localStorage.getItem(pKey) : null
    const savedState = typeof window !== 'undefined' ? window.localStorage.getItem(sKey) : null
    if (savedPin && /^\d{6}$/.test(savedPin)) {
      setPincode(savedPin)
      setInputPincode(savedPin)
      if (savedState) setState(savedState)
      return
    }

    // Step 2 & 3: logged-in → fetch saved delivery location from server,
    // then fall back to the customer's default address pincode.
    if (authenticated && userId) {
      // Try the saved delivery location first (per-account, syncs across devices)
      fetch('/api/customer/delivery/location', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!mounted) return
          const loc = data?.location as { pincode?: string; state?: string } | null
          if (loc?.pincode && /^\d{6}$/.test(loc.pincode)) {
            setPincode(loc.pincode)
            setInputPincode(loc.pincode)
            setState(loc.state || undefined)
            try {
              window.localStorage.setItem(pKey, loc.pincode)
              if (loc.state) window.localStorage.setItem(sKey, loc.state)
            } catch {
              /* ignore quota errors */
            }
            return
          }
          // No saved location → fall back to default address pincode
          return fetch('/api/customer/addresses', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((addrData) => {
              if (!mounted || !addrData?.addresses) return
              const defaultAddr =
                addrData.addresses.find((a: { isDefault: boolean }) => a.isDefault) || addrData.addresses[0]
              if (defaultAddr?.pincode && /^\d{6}$/.test(defaultAddr.pincode)) {
                setPincode(defaultAddr.pincode)
                setInputPincode(defaultAddr.pincode)
                setState(defaultAddr.state)
                try {
                  window.localStorage.setItem(pKey, defaultAddr.pincode)
                  if (defaultAddr.state) window.localStorage.setItem(sKey, defaultAddr.state)
                } catch {
                  /* ignore quota errors */
                }
                // Persist to server so it syncs across devices
                fetch('/api/customer/delivery/location', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pincode: defaultAddr.pincode, state: defaultAddr.state }),
                }).catch(() => {
                  /* non-fatal — client-side cache still works */
                })
              }
            })
        })
        .catch(() => {
          /* non-fatal — user can still type a pincode manually */
        })
    }

    return () => {
      mounted = false
    }
    // `userId` changes on login/logout/account-switch → full reload.
    // `authenticated` is derived from user, included for clarity.
  }, [userId, authenticated])

  /* ---------- 2. Fetch estimate whenever pincode changes ---------- */
  const fetchEstimate = useCallback(
    async (pin: string, st?: string) => {
      if (!pin || !/^\d{6}$/.test(pin)) return
      setChecking(true)
      setError(null)
      try {
        const res = await fetch('/api/customer/delivery/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pincode: pin,
            state: st,
            productId,
          }),
        })
        const data = await res.json().catch(() => ({})).catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to check delivery')
        }
        setEstimate(data.estimate as DeliveryEstimate)
        if (data.state) setState(data.state)
      } catch (err) {
        // Graceful fallback: show a generic 5-7 day estimate so the UI is
        // never broken even if the delivery API is temporarily unreachable.
        //
        // Threshold-aware fallback (mirrors the engine's computeDeliveryCharge):
        //   1. seller marked product freeDelivery → ₹0 / free
        //   2. product-level explicit ₹0 deliveryCharge → ₹0 / free
        //   3. product-level freeDeliveryAbove threshold met (price ≥ threshold) → ₹0 / free
        //   4. product-level deliveryCharge override → that charge / not free
        //   5. fallback ₹49 / not free
        // This ensures the fallback NEVER shows "Free delivery" for a low-price
        // product that hasn't met the seller's threshold (the bug we're fixing).
        const fallbackThreshold = Number(shipping?.freeDeliveryAbove) || 0
        const fallbackChargeOverride =
          typeof shipping?.deliveryCharge === 'number' ? shipping.deliveryCharge : undefined
        let fbDeliveryCharge: number
        let fbIsFree: boolean
        if (freeDelivery) {
          fbDeliveryCharge = 0
          fbIsFree = true
        } else if (fallbackChargeOverride === 0) {
          fbDeliveryCharge = 0
          fbIsFree = true
        } else if (
          fallbackThreshold > 0 &&
          typeof productPrice === 'number' &&
          productPrice >= fallbackThreshold
        ) {
          fbDeliveryCharge = 0
          fbIsFree = true
        } else if (typeof fallbackChargeOverride === 'number' && fallbackChargeOverride > 0) {
          fbDeliveryCharge = fallbackChargeOverride
          fbIsFree = false
        } else {
          fbDeliveryCharge = 49
          fbIsFree = false
        }

        const now = new Date()
        const min = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
        const max = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        setEstimate({
          serviceable: true,
          zone: 'national',
          codAvailable: true,
          deliveryCharge: fbDeliveryCharge,
          isFreeDelivery: fbIsFree,
          handlingDays: 1,
          transitDays: { min: 4, max: 6 },
          estimatedDays: { min: 5, max: 7 },
          deliveryDateMin: min.toISOString(),
          deliveryDateMax: max.toISOString(),
          expressAvailable: false,
          sameDayAvailable: false,
        })
        setError(err instanceof Error ? err.message : 'Lookup failed, showing default estimate')
      } finally {
        setChecking(false)
      }
    },
    [productId, freeDelivery, shipping, productPrice],
  )

  useEffect(() => {
    if (pincode) {
      fetchEstimate(pincode, state)
    }
  }, [pincode, state, fetchEstimate])

  /* ---------- 3. Handlers ---------- */
  const handleCheck = useCallback(() => {
    const pin = inputPincode.trim()
    if (!/^\d{6}$/.test(pin)) {
      setError('Please enter a valid 6-digit pincode')
      return
    }
    // If the user manually entered a DIFFERENT pincode, clear the cached
    // state so the API derives the zone from the new pincode prefix instead
    // of using a stale state from the previous pincode. (When the pincode
    // is the same, keep the state — it may have come from a saved address.)
    if (pin !== pincode) {
      setState(undefined)
      try {
        window.localStorage.removeItem(stateKey(userId))
      } catch {
        /* ignore */
      }
    }
    setPincode(pin)
    setEditing(false)
    setError(null)

    // Persist to the PER-CUSTOMER localStorage key (never the global key).
    const pKey = pincodeKey(userId)
    try {
      window.localStorage.setItem(pKey, pin)
    } catch {
      /* ignore */
    }

    // Persist to the server (per-account, syncs across devices) —
    // fire-and-forget, non-blocking. Only when authenticated.
    if (authenticated && userId) {
      fetch('/api/customer/delivery/location', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pincode: pin, state: undefined }),
      }).catch(() => {
        /* non-fatal — client-side cache still works */
      })
    }
  }, [inputPincode, pincode, userId, authenticated])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCheck()
    }
  }

  // Auto-focus the input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  /* ---------- 4. Render ---------- */

  // No pincode yet → show the entry prompt
  if (!pincode || editing) {
    return (
      <div className={cn('mt-4 border-t border-gray-100 dark:border-gray-800 pt-4', className)}>
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Deliver to your location
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="tel"
              inputMode="numeric"
              maxLength={6}
              value={inputPincode}
              onChange={(e) => setInputPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              placeholder="Enter 6-digit pincode"
              className="w-full h-10 pl-3 pr-9 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
            {inputPincode.length === 6 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <Check className="h-4 w-4 text-emerald-500" />
              </span>
            )}
          </div>
          <button
            onClick={handleCheck}
            disabled={inputPincode.length !== 6 || checking}
            className="h-10 px-4 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Check
          </button>
        </div>
        {pincode && (
          <button
            onClick={() => setEditing(false)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
          Enter your pincode to check delivery date & COD availability
        </p>
      </div>
    )
  }

  // Loading state (first check)
  if (checking && !estimate) {
    return (
      <div className={cn('mt-4 border-t border-gray-100 dark:border-gray-800 pt-4', className)}>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
          Checking delivery to {pincode}…
        </div>
      </div>
    )
  }

  // Not serviceable
  if (estimate && !estimate.serviceable) {
    return (
      <div className={cn('mt-4 border-t border-gray-100 dark:border-gray-800 pt-4', className)}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <X className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Not deliverable to {pincode}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {estimate.reason || 'Delivery is not available at this pincode.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  // Main render: serviceable
  return (
    <div className={cn('mt-4 border-t border-gray-100 dark:border-gray-800 pt-4', className)}>
      {/* Top row: location + change */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">Deliver to</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {pincode}
              {state ? <span className="text-gray-400 font-normal"> · {state}</span> : null}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditing(true)
            setError(null)
          }}
          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex-shrink-0"
        >
          Change
        </button>
      </div>

      {/* Delivery date + charge */}
      <div className="mt-3 flex items-center gap-2">
        <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {checking ? (
              <span className="text-gray-400">Checking…</span>
            ) : estimate ? (
              <>
                Delivery by{' '}
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {formatDeliveryDate(estimate.deliveryDateMax)}
                </span>
              </>
            ) : null}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {estimate?.isFreeDelivery ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Free delivery</span>
            ) : estimate && estimate.deliveryCharge > 0 ? (
              <>Delivery charge: ₹{estimate.deliveryCharge}</>
            ) : (
              'Standard delivery'
            )}
            {estimate && estimate.estimatedDays.max > 0 && (
              <span className="text-gray-400">
                {' '}
                · {estimate.estimatedDays.min}-{estimate.estimatedDays.max} days
              </span>
            )}
          </p>
        </div>
      </div>

      {/* COD + Express badges (full variant only) */}
      {variant === 'full' && estimate && !checking && (
        <div className="mt-3 space-y-2">
          {/* COD */}
          <div className="flex items-center gap-2">
            {estimate.codAvailable ? (
              <>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
                  <ShieldCheck className="h-3 w-3" />
                  Cash on Delivery available
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                <X className="h-3 w-3" />
                COD not available
              </span>
            )}
          </div>

          {/* Express option */}
          <AnimatePresence>
            {estimate.expressAvailable && estimate.expressDate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50"
              >
                <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Express delivery by {formatDeliveryDate(estimate.expressDate)}
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500">
                    {estimate.expressCharge && estimate.expressCharge > 0
                      ? `+₹${estimate.expressCharge} extra`
                      : 'No extra charge'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Date range detail (collapsed) */}
          {estimate.deliveryDateMin && estimate.deliveryDateMax && (
            <details className="group">
              <summary className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer select-none list-none">
                <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                Delivery between {formatDeliveryDate(estimate.deliveryDateMin)} – {formatDeliveryDate(estimate.deliveryDateMax)}
              </summary>
              <p className="text-[10px] text-gray-400 mt-1 ml-4">
                Estimated based on your location, seller handling time, and courier transit. Actual delivery may vary.
              </p>
            </details>
          )}
        </div>
      )}

      {/* Soft error notice (estimate still computed via fallback) */}
      {error && (
        <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  )
}
