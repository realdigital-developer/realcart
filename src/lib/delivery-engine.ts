/**
 * Delivery Engine — Production-Grade "Delivery by" Estimation
 * ----------------------------------------------------------
 * Single source of truth for ALL delivery date / charge / serviceability
 * calculations in the project. Mirrors how Flipkart / Meesho / Amazon
 * estimate "Delivery by <date>" on the product page, cart, and checkout.
 *
 * Key capabilities:
 *   1. Pincode serviceability check (blocked / non-serviceable list)
 *   2. Zone derivation from Indian state OR pincode prefix (coarse fallback)
 *   3. Zone-based delivery SLA (same-city / same-state / regional / national)
 *   4. Business-day calendar (skips Sundays) for realistic delivery dates
 *   5. Seller handling time (ships-in-X-days) added to transit time
 *   6. Delivery charge calc (admin base + product override + free-delivery threshold)
 *   7. Cash-on-Delivery availability per pincode / seller
 *   8. Express delivery option (faster SLA + surcharge) when enabled
 *
 * Design principles:
 *   - 100% backward compatible: every input is optional with sensible defaults.
 *     If seller has no delivery settings, falls back to 5-7 day national SLA.
 *   - Pure functions wherever possible — easy to unit-test and reason about.
 *   - No external pincode DB required: derives zone from state (preferred) or
 *     pincode prefix (fallback). This keeps the feature self-contained.
 *   - All date math uses the server's UTC clock but renders in IST-friendly
 *     day labels. Returns ISO strings so the client can format per locale.
 */

/* ============================================================ */
/*  Types                                                        */
/* ============================================================ */

export type DeliveryZone = 'sameCity' | 'sameState' | 'regional' | 'national'

export interface ZoneSla {
  /** Minimum transit days (excluding handling time). */
  min: number
  /** Maximum transit days (excluding handling time). */
  max: number
}

export interface DeliverySlaConfig {
  sameCity: ZoneSla
  sameState: ZoneSla
  regional: ZoneSla
  national: ZoneSla
  /** Express transit days per zone (optional — only if express enabled). */
  expressSameCity?: ZoneSla
  expressSameState?: ZoneSla
  expressRegional?: ZoneSla
  expressNational?: ZoneSla
}

export interface DeliverySettings {
  /** Free delivery threshold (₹). 0 = disabled. */
  freeDeliveryAbove: number
  /** Default delivery base charge (₹) when product has no override. */
  deliveryBaseCharge: number
  /** COD convenience fee (₹). */
  codFee: number
  /** Whether express delivery is enabled platform-wide. */
  expressEnabled: boolean
  /** Extra charge (₹) added for express delivery. */
  expressSurcharge: number
  /** Whether same-day delivery is enabled platform-wide. */
  sameDayEnabled: boolean
  /** Default handling/prep time (days) when seller has none. */
  defaultHandlingDays: number
  /** Pincodes that are NOT serviceable (admin block-list). */
  blockedPincodes: string[]
  /** Pincodes where same-day delivery is available (admin whitelist). */
  sameDayPincodes: string[]
  /** SLA configuration per zone. */
  sla: DeliverySlaConfig
  updatedAt?: string | null
}

export interface SellerDeliverySettings {
  /** Pincode the seller ships from. */
  shipsFromPincode?: string
  /** State the seller ships from (full name, e.g. "Karnataka"). */
  shipsFromState?: string
  /** Handling/prep time in days (0 = same-day dispatch). */
  handlingDays: number
  /** Whether this seller offers COD. */
  codAvailable: boolean
  /** Whether this seller offers express delivery. */
  expressAvailable: boolean
  /** Custom SLA overrides per zone (optional — falls back to platform SLA). */
  customSla?: Partial<DeliverySlaConfig>
  updatedAt?: string | null
}

export interface DeliveryEstimateInput {
  /** Customer's delivery pincode (6 digits). */
  customerPincode: string
  /** Customer's state (preferred for accurate zoning). */
  customerState?: string
  /** Seller delivery settings (ships-from + handling). */
  seller?: SellerDeliverySettings
  /** Cart total (₹) — used for free-delivery threshold. */
  cartTotal: number
  /** Product-level free-delivery flag. */
  productFreeDelivery?: boolean
  /** Product-level delivery charge override (₹). */
  productDeliveryCharge?: number
  /** Product-level free-delivery threshold override (₹). */
  productFreeDeliveryAbove?: number
  /** Admin global delivery settings. */
  settings: DeliverySettings
}

export interface DeliveryEstimate {
  /** Whether the pincode is serviceable. */
  serviceable: boolean
  /** Reason if not serviceable. */
  reason?: string
  /** Derived delivery zone. */
  zone: DeliveryZone
  /** Whether Cash on Delivery is available. */
  codAvailable: boolean
  /** Final delivery charge (₹) the customer pays. */
  deliveryCharge: number
  /** Whether free delivery is applied. */
  isFreeDelivery: boolean
  /** Seller handling time (days). */
  handlingDays: number
  /** Transit days (excluding handling). */
  transitDays: ZoneSla
  /** Total estimated days (handling + transit) min/max. */
  estimatedDays: ZoneSla
  /** Earliest delivery date (ISO). */
  deliveryDateMin: string
  /** Latest delivery date (ISO). */
  deliveryDateMax: string
  /** Whether express delivery is available for this route. */
  expressAvailable: boolean
  /** Express delivery date (ISO) — earliest. */
  expressDate?: string
  /** Express delivery charge (₹) (base + surcharge, or free). */
  expressCharge?: number
  /**
   * Platform express surcharge (₹) — the premium added on top of the
   * standard delivery charge for express orders. Populated from
   * `settings.expressSurcharge` so `resolveDeliveryOption` can add it in
   * the fallback path (when express is requested but the engine didn't
   * pre-compute `expressCharge` because `expressAvailable` is false).
   */
  expressSurcharge?: number
  /** Whether same-day delivery is available. */
  sameDayAvailable: boolean
}

/* ============================================================ */
/*  Delivery Option Snapshot (for checkout UI radio selector)   */
/* ============================================================ */

/**
 * Compact, UI-ready snapshot of a single delivery option.
 * Returned by `getDeliveryOptions()` for the checkout page so the UI can
 * render a Flipkart/Amazon-style radio selector without re-deriving
 * dates or charges.
 */
export interface DeliveryOptionSnapshot {
  /** Option identifier — 'standard' or 'express' */
  id: 'standard' | 'express'
  /** Human-readable label (e.g. "Standard Delivery", "Express Delivery") */
  label: string
  /** Short tagline shown under the label (e.g. "1-2 days", "Free over ₹499") */
  tagline: string
  /** Final delivery charge the customer pays (₹). 0 = FREE. */
  charge: number
  /** Whether this option is FREE delivery (for badge styling). */
  isFree: boolean
  /** ISO timestamp of the earliest delivery date. */
  dateMin: string
  /** ISO timestamp of the latest delivery date. */
  dateMax: string
  /** Human-friendly ETA range (e.g. "Tomorrow", "Mon, 15 Jun", "Mon 15 - Tue 16 Jun"). */
  etaLabel: string
  /** Whether this option is available for selection. */
  available: boolean
  /** Reason if unavailable (shown as disabled hint). */
  unavailableReason?: string
}

/**
 * Build a UI-ready ETA label from a min/max date pair.
 * - Same day → "Today"
 * - Next day → "Tomorrow"
 * - Same min/max day → "Mon, 15 Jun"
 * - Different min/max → "Mon 15 - Tue 16 Jun"
 */
export function buildEtaLabel(dateMinIso: string, dateMaxIso: string): string {
  try {
    if (!dateMinIso) return ''
    const min = new Date(dateMinIso)
    const max = dateMaxIso ? new Date(dateMaxIso) : min
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const minDay = new Date(min)
    minDay.setHours(0, 0, 0, 0)
    const maxDay = new Date(max)
    maxDay.setHours(0, 0, 0, 0)

    const minStr = min.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    const maxStr = max.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    const minShort = min.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    const maxShort = max.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

    const diffMinDays = Math.round((minDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    if (diffMinDays <= 0) return 'Today'
    if (diffMinDays === 1 && minDay.getTime() === maxDay.getTime()) return 'Tomorrow'

    if (minDay.getTime() === maxDay.getTime()) return minStr
    return `${minShort} - ${maxStr}`
  } catch {
    return ''
  }
}

/**
 * Build UI-ready snapshots for BOTH standard and express delivery options
 * from a single DeliveryEstimate. The checkout page uses this to render a
 * radio-card selector exactly like Flipkart / Amazon / Meesho.
 *
 * Standard is always available when the pincode is serviceable.
 * Express is only available when `estimate.expressAvailable === true`.
 */
export function getDeliveryOptions(estimate: DeliveryEstimate): DeliveryOptionSnapshot[] {
  if (!estimate.serviceable) {
    return [
      {
        id: 'standard',
        label: 'Standard Delivery',
        tagline: '3-7 business days',
        charge: 0,
        isFree: false,
        dateMin: '',
        dateMax: '',
        etaLabel: '',
        available: false,
        unavailableReason: estimate.reason || 'Not serviceable',
      },
    ]
  }

  const standard: DeliveryOptionSnapshot = {
    id: 'standard',
    label: 'Standard Delivery',
    tagline: estimate.isFreeDelivery
      ? 'Free over threshold'
      : estimate.deliveryCharge > 0
        ? `Flat ₹${estimate.deliveryCharge}`
        : 'Free',
    charge: estimate.deliveryCharge,
    isFree: estimate.isFreeDelivery,
    dateMin: estimate.deliveryDateMin,
    dateMax: estimate.deliveryDateMax,
    etaLabel: buildEtaLabel(estimate.deliveryDateMin, estimate.deliveryDateMax),
    available: true,
  }

  const options: DeliveryOptionSnapshot[] = [standard]

  if (estimate.expressAvailable) {
    options.push({
      id: 'express',
      label: 'Express Delivery',
      tagline: 'Faster transit · priority handling',
      charge: estimate.expressCharge ?? 0,
      isFree: (estimate.expressCharge ?? 0) === 0,
      dateMin: estimate.expressDate || estimate.deliveryDateMin,
      dateMax: estimate.expressDate || estimate.deliveryDateMin,
      etaLabel: estimate.expressDate
        ? buildEtaLabel(estimate.expressDate, estimate.expressDate)
        : buildEtaLabel(estimate.deliveryDateMin, estimate.deliveryDateMin),
      available: true,
    })
  }

  return options
}

/* ============================================================ */
/*  Indian State → Zone Mapping                                 */
/* ============================================================ */

/**
 * Maps Indian states/UTs to one of 5 geographic regions.
 * Used to derive the delivery zone between seller and customer.
 *
 * Source: India Post / standard regional classification.
 */
export const STATE_REGION: Record<string, 'north' | 'south' | 'east' | 'west' | 'central'> = {
  // North India
  'delhi': 'north',
  'jammu and kashmir': 'north',
  'jammu & kashmir': 'north',
  'ladakh': 'north',
  'himachal pradesh': 'north',
  'punjab': 'north',
  'chandigarh': 'north',
  'haryana': 'north',
  'rajasthan': 'north',
  'uttar pradesh': 'north',
  'uttarakhand': 'north',
  // South India
  'andhra pradesh': 'south',
  'telangana': 'south',
  'karnataka': 'south',
  'tamil nadu': 'south',
  'kerala': 'south',
  'puducherry': 'south',
  'pondicherry': 'south',
  'lakshadweep': 'south',
  'andaman and nicobar islands': 'south',
  // East India
  'bihar': 'east',
  'jharkhand': 'east',
  'west bengal': 'east',
  'odisha': 'east',
  'assam': 'east',
  'sikkim': 'east',
  'arunachal pradesh': 'east',
  'nagaland': 'east',
  'manipur': 'east',
  'mizoram': 'east',
  'meghalaya': 'east',
  'tripura': 'east',
  // West India
  'gujarat': 'west',
  'maharashtra': 'west',
  'goa': 'west',
  'dadra and nagar haveli': 'west',
  'daman and diu': 'west',
  // Central India
  'madhya pradesh': 'central',
  'chhattisgarh': 'central',
}

/**
 * Coarse zone fallback from the FIRST DIGIT of an Indian pincode.
 * Used when the customer's state is unknown (e.g. guest pincode-only check).
 *
 * India Post PIN prefix regions:
 *   1-2 → North  (Delhi, Haryana, Punjab, HP, J&K, Chandigarh, Rajasthan, UP)
 *   3-4 → West   (Gujarat, Maharashtra, Goa, MP, Chhattisgarh)
 *   5-6 → South  (AP, Telangana, Karnataka, TN, Kerala, Pondicherry)
 *   7-8 → East   (Bihar, Jharkhand, WB, Odisha, North-East, Assam)
 *   9   → Army (APS) — treat as national
 */
export function pincodePrefixRegion(pincode: string): 'north' | 'south' | 'east' | 'west' | 'central' {
  const first = (pincode || '').trim().charAt(0)
  switch (first) {
    case '1':
    case '2':
      return 'north'
    case '3':
    case '4':
      return 'west'
    case '5':
    case '6':
      return 'south'
    case '7':
    case '8':
      return 'east'
    case '9':
      return 'central' // Army postal — treat as central/national
    default:
      return 'central' // unknown — neutral fallback
  }
}

/**
 * Normalize a state name for region lookup (trim + lowercase).
 */
export function normalizeState(state?: string): string {
  return (state || '').trim().toLowerCase()
}

/**
 * Get the region for a state name. Returns undefined if unknown.
 */
export function stateRegion(state?: string): 'north' | 'south' | 'east' | 'west' | 'central' | undefined {
  const key = normalizeState(state)
  if (!key) return undefined
  return STATE_REGION[key]
}

/* ============================================================ */
/*  Pincode Validation & Serviceability                         */
/* ============================================================ */

/**
 * Validate Indian pincode format (exactly 6 digits).
 */
export function isValidPincode(pincode: string): boolean {
  return /^\d{6}$/.test((pincode || '').trim())
}

/**
 * Check if a pincode is in the blocked / non-serviceable list.
 */
export function isPincodeServiceable(pincode: string, blocked: string[]): boolean {
  const p = (pincode || '').trim()
  if (!p) return false
  return !blocked.some((b) => b.trim() === p)
}

/* ============================================================ */
/*  Zone Derivation                                             */
/* ============================================================ */

/**
 * Derive the delivery zone between seller and customer.
 *
 * Priority:
 *   1. If both pincodes share the same first 3 digits → sameCity
 *      (India Post uses the first 3 digits for the sub-region / sorting district;
 *       same prefix generally means same metro / nearby.)
 *   2. If both states are known and equal → sameState
 *   3. If both regions (derived from state OR pincode prefix) are equal → regional
 *   4. Otherwise → national
 */
export function deriveZone(
  customerPincode: string,
  customerState: string | undefined,
  sellerPincode: string | undefined,
  sellerState: string | undefined,
): DeliveryZone {
  const cPin = (customerPincode || '').trim()
  const sPin = (sellerPincode || '').trim()

  // 1. Same city — first 3 digits match
  if (cPin.length >= 3 && sPin.length >= 3 && cPin.slice(0, 3) === sPin.slice(0, 3)) {
    return 'sameCity'
  }

  const cState = normalizeState(customerState)
  const sState = normalizeState(sellerState)

  // 2. Same state (both known and equal, non-empty)
  if (cState && sState && cState === sState) {
    return 'sameState'
  }

  // 3. Same region (derived from state, else pincode prefix)
  const cRegion = stateRegion(customerState) || pincodePrefixRegion(cPin)
  const sRegion = stateRegion(sellerState) || pincodePrefixRegion(sPin)
  if (cRegion === sRegion) {
    return 'regional'
  }

  // 4. National
  return 'national'
}

/* ============================================================ */
/*  Business-Day Calendar                                       */
/* ============================================================ */

/**
 * Add N calendar days to a date, skipping Sundays.
 * Returns a new Date. `days` must be >= 0.
 *
 * Note: We skip only Sundays (most Indian couriers deliver 6 days a week).
 * National holidays are NOT subtracted — they'd require a holiday calendar
 * which is out of scope; the date range (min/max) absorbs minor variance.
 */
export function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start.getTime())
  let remaining = Math.max(0, Math.floor(days))
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    // getDay(): 0 = Sunday, 6 = Saturday. Skip Sunday only.
    if (d.getDay() !== 0) {
      remaining -= 1
    }
  }
  return d
}

/**
 * Format a Date as a short Indian date label (e.g. "Mon, 15 Jun").
 */
export function formatDeliveryDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return ''
  }
}

/**
 * Format a Date as a long Indian date label (e.g. "Monday, 15 June 2026").
 */
export function formatDeliveryDateLong(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

/* ============================================================ */
/*  Defaults                                                     */
/* ============================================================ */

/**
 * Default platform-wide delivery settings. Used when the admin has not
 * configured anything yet (brand-new install). These match the existing
 * checkout logic (free above ₹499, else ₹49) to remain backward compatible.
 */
export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  freeDeliveryAbove: 499,
  deliveryBaseCharge: 49,
  codFee: 40,
  expressEnabled: true,
  expressSurcharge: 49,
  sameDayEnabled: false,
  sameDayPincodes: [],
  defaultHandlingDays: 1,
  blockedPincodes: [],
  sla: {
    sameCity: { min: 1, max: 2 },
    sameState: { min: 2, max: 3 },
    regional: { min: 3, max: 5 },
    national: { min: 5, max: 7 },
    expressSameCity: { min: 1, max: 1 },
    expressSameState: { min: 1, max: 2 },
    expressRegional: { min: 2, max: 3 },
    expressNational: { min: 3, max: 4 },
  },
  updatedAt: null,
}

/**
 * Default seller delivery settings (when seller hasn't configured any).
 * COD available, express offered, 1-day handling.
 */
export const DEFAULT_SELLER_DELIVERY_SETTINGS: SellerDeliverySettings = {
  handlingDays: 1,
  codAvailable: true,
  expressAvailable: true,
}

/* ============================================================ */
/*  Delivery Charge Calculation                                 */
/* ============================================================ */

/**
 * Compute the customer-facing delivery charge.
 *
 * Priority (highest first):
 *   1. Product marked freeDelivery → ₹0
 *   2. Product-level deliveryCharge === 0 → ₹0
 *   3. Cart total ≥ product-level freeDeliveryAbove → ₹0
 *   4. Cart total ≥ platform freeDeliveryAbove → ₹0
 *   5. Product-level deliveryCharge override → that value
 *   6. Platform deliveryBaseCharge
 */
export function computeDeliveryCharge(input: {
  cartTotal: number
  productFreeDelivery?: boolean
  productDeliveryCharge?: number
  productFreeDeliveryAbove?: number
  settings: DeliverySettings
}): { deliveryCharge: number; isFreeDelivery: boolean } {
  // 1. Product marked free delivery
  if (input.productFreeDelivery) {
    return { deliveryCharge: 0, isFreeDelivery: true }
  }

  // 2. Product-level explicit ₹0 charge
  if (input.productDeliveryCharge === 0) {
    return { deliveryCharge: 0, isFreeDelivery: true }
  }

  // 3. Product-level free-delivery threshold
  const productThreshold = Number(input.productFreeDeliveryAbove) || 0
  if (productThreshold > 0 && input.cartTotal >= productThreshold) {
    return { deliveryCharge: 0, isFreeDelivery: true }
  }

  // 4. Platform free-delivery threshold
  if (input.settings.freeDeliveryAbove > 0 && input.cartTotal >= input.settings.freeDeliveryAbove) {
    return { deliveryCharge: 0, isFreeDelivery: true }
  }

  // 5. Product-level charge override
  if (typeof input.productDeliveryCharge === 'number' && input.productDeliveryCharge > 0) {
    return { deliveryCharge: input.productDeliveryCharge, isFreeDelivery: false }
  }

  // 6. Platform base charge
  return { deliveryCharge: input.settings.deliveryBaseCharge, isFreeDelivery: false }
}

/* ============================================================ */
/*  Core: getDeliveryEstimate                                   */
/* ============================================================ */

/**
 * Compute a full delivery estimate for a product/cart to a given pincode.
 *
 * This is the main entry point. All API routes and the order-creation flow
 * call this function so behaviour is consistent everywhere.
 */
export function getDeliveryEstimate(input: DeliveryEstimateInput): DeliveryEstimate {
  const settings = input.settings
  const seller: SellerDeliverySettings = {
    ...DEFAULT_SELLER_DELIVERY_SETTINGS,
    ...(input.seller || {}),
  }

  const customerPincode = (input.customerPincode || '').trim()

  // --- 1. Validate pincode format ---
  if (!isValidPincode(customerPincode)) {
    return {
      serviceable: false,
      reason: 'Please enter a valid 6-digit pincode',
      zone: 'national',
      codAvailable: false,
      deliveryCharge: 0,
      isFreeDelivery: false,
      handlingDays: 0,
      transitDays: { min: 0, max: 0 },
      estimatedDays: { min: 0, max: 0 },
      deliveryDateMin: '',
      deliveryDateMax: '',
      expressAvailable: false,
      sameDayAvailable: false,
    }
  }

  // --- 2. Check serviceability (blocked list) ---
  if (!isPincodeServiceable(customerPincode, settings.blockedPincodes)) {
    return {
      serviceable: false,
      reason: 'Sorry, delivery is not available at this pincode',
      zone: 'national',
      codAvailable: false,
      deliveryCharge: 0,
      isFreeDelivery: false,
      handlingDays: 0,
      transitDays: { min: 0, max: 0 },
      estimatedDays: { min: 0, max: 0 },
      deliveryDateMin: '',
      deliveryDateMax: '',
      expressAvailable: false,
      sameDayAvailable: false,
    }
  }

  // --- 3. Derive zone ---
  const zone = deriveZone(
    customerPincode,
    input.customerState,
    seller.shipsFromPincode,
    seller.shipsFromState,
  )

  // --- 4. SLA selection (seller override > platform default) ---
  const sla = { ...settings.sla, ...(seller.customSla || {}) }
  const transitDays: ZoneSla = sla[zone] || sla.national

  // --- 5. Handling time ---
  const handlingDays = Math.max(0, Math.floor(seller.handlingDays ?? settings.defaultHandlingDays))

  // --- 6. Total estimated days ---
  const estimatedDays: ZoneSla = {
    min: handlingDays + transitDays.min,
    max: handlingDays + transitDays.max,
  }

  // --- 7. Delivery dates (business days, skip Sundays) ---
  const now = new Date()
  const minDate = addBusinessDays(now, estimatedDays.min)
  const maxDate = addBusinessDays(now, estimatedDays.max)

  // --- 8. Delivery charge ---
  const charge = computeDeliveryCharge({
    cartTotal: input.cartTotal,
    productFreeDelivery: input.productFreeDelivery,
    productDeliveryCharge: input.productDeliveryCharge,
    productFreeDeliveryAbove: input.productFreeDeliveryAbove,
    settings,
  })

  // --- 9. COD availability ---
  // COD is available if: platform didn't block the pincode (already checked)
  // AND the seller offers COD. Same-day pincode whitelist is independent.
  const codAvailable = seller.codAvailable

  // --- 10. Express availability ---
  // Express requires: platform enabled + seller offers it + express SLA exists.
  const expressSla = sla[`express${zone.charAt(0).toUpperCase()}${zone.slice(1)}` as keyof DeliverySlaConfig] as ZoneSla | undefined
  const expressAvailable =
    settings.expressEnabled &&
    seller.expressAvailable &&
    !!expressSla &&
    transitDays.max > (expressSla.max || 0) // only show express if it's actually faster

  let expressDate: string | undefined
  let expressCharge: number | undefined
  if (expressAvailable && expressSla) {
    const exDays = handlingDays + expressSla.min
    expressDate = addBusinessDays(now, exDays).toISOString()
    // Express charge = base delivery charge (if not free) + surcharge.
    // If standard delivery is free, express still costs the surcharge (premium).
    expressCharge = charge.isFreeDelivery
      ? settings.expressSurcharge
      : charge.deliveryCharge + settings.expressSurcharge
  }

  // --- 11. Same-day availability ---
  const sameDayAvailable =
    settings.sameDayEnabled &&
    settings.sameDayPincodes.some((p) => p.trim() === customerPincode) &&
    zone === 'sameCity'

  return {
    serviceable: true,
    zone,
    codAvailable,
    deliveryCharge: charge.deliveryCharge,
    isFreeDelivery: charge.isFreeDelivery,
    handlingDays,
    transitDays,
    estimatedDays,
    deliveryDateMin: minDate.toISOString(),
    deliveryDateMax: maxDate.toISOString(),
    expressAvailable,
    expressDate,
    expressCharge,
    // Expose the platform express surcharge so resolveDeliveryOption can add
    // it in the fallback path (when express is requested but not pre-computed).
    expressSurcharge: settings.expressSurcharge,
    sameDayAvailable,
  }
}

/* ============================================================ */
/*  Helpers for API routes                                       */
/* ============================================================ */

/**
 * Sanitize a delivery settings doc from MongoDB into the public shape.
 * Fills missing fields with DEFAULT_DELIVERY_SETTINGS values.
 */
export function sanitizeDeliverySettings(doc: Record<string, unknown> | null | undefined): DeliverySettings {
  if (!doc) return { ...DEFAULT_DELIVERY_SETTINGS }
  const d = doc as Record<string, unknown>
  return {
    freeDeliveryAbove: typeof d.freeDeliveryAbove === 'number' ? d.freeDeliveryAbove : DEFAULT_DELIVERY_SETTINGS.freeDeliveryAbove,
    deliveryBaseCharge: typeof d.deliveryBaseCharge === 'number' ? d.deliveryBaseCharge : DEFAULT_DELIVERY_SETTINGS.deliveryBaseCharge,
    codFee: typeof d.codFee === 'number' ? d.codFee : DEFAULT_DELIVERY_SETTINGS.codFee,
    expressEnabled: typeof d.expressEnabled === 'boolean' ? d.expressEnabled : DEFAULT_DELIVERY_SETTINGS.expressEnabled,
    expressSurcharge: typeof d.expressSurcharge === 'number' ? d.expressSurcharge : DEFAULT_DELIVERY_SETTINGS.expressSurcharge,
    sameDayEnabled: typeof d.sameDayEnabled === 'boolean' ? d.sameDayEnabled : DEFAULT_DELIVERY_SETTINGS.sameDayEnabled,
    sameDayPincodes: Array.isArray(d.sameDayPincodes) ? d.sameDayPincodes.map(String) : [],
    defaultHandlingDays: typeof d.defaultHandlingDays === 'number' ? d.defaultHandlingDays : DEFAULT_DELIVERY_SETTINGS.defaultHandlingDays,
    blockedPincodes: Array.isArray(d.blockedPincodes) ? d.blockedPincodes.map(String) : [],
    sla: { ...DEFAULT_DELIVERY_SETTINGS.sla, ...((d.sla as Partial<DeliverySlaConfig>) || {}) },
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : d.updatedAt instanceof Date ? d.updatedAt.toISOString() : null,
  }
}

/**
 * Sanitize a seller delivery settings doc from MongoDB.
 * Fills missing fields with DEFAULT_SELLER_DELIVERY_SETTINGS values.
 */
export function sanitizeSellerDeliverySettings(doc: Record<string, unknown> | null | undefined): SellerDeliverySettings {
  if (!doc) return { ...DEFAULT_SELLER_DELIVERY_SETTINGS }
  const d = doc as Record<string, unknown>
  return {
    shipsFromPincode: typeof d.shipsFromPincode === 'string' ? d.shipsFromPincode : undefined,
    shipsFromState: typeof d.shipsFromState === 'string' ? d.shipsFromState : undefined,
    handlingDays: typeof d.handlingDays === 'number' ? d.handlingDays : DEFAULT_SELLER_DELIVERY_SETTINGS.handlingDays,
    codAvailable: typeof d.codAvailable === 'boolean' ? d.codAvailable : DEFAULT_SELLER_DELIVERY_SETTINGS.codAvailable,
    expressAvailable: typeof d.expressAvailable === 'boolean' ? d.expressAvailable : DEFAULT_SELLER_DELIVERY_SETTINGS.expressAvailable,
    customSla: d.customSla ? (d.customSla as Partial<DeliverySlaConfig>) : undefined,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : d.updatedAt instanceof Date ? d.updatedAt.toISOString() : null,
  }
}

/**
 * Parse a free-form textarea of pincodes into a clean deduplicated array.
 * Accepts comma, space, newline, or tab separation.
 */
export function parsePincodeList(raw: string): string[] {
  if (!raw) return []
  return Array.from(
    new Set(
      raw
        .split(/[\s,;\n\t]+/)
        .map((p) => p.trim())
        .filter((p) => /^\d{6}$/.test(p)),
    ),
  )
}

/**
 * Describe a delivery zone in human-friendly terms.
 */
export function describeZone(zone: DeliveryZone): string {
  switch (zone) {
    case 'sameCity':
      return 'Within city'
    case 'sameState':
      return 'Within state'
    case 'regional':
      return 'Regional'
    case 'national':
      return 'National'
  }
}

/* ============================================================ */
/*  Server-Authoritative Option Resolver                        */
/* ============================================================ */

/**
 * Resolve the FINAL delivery charge + ETA date for a chosen delivery option.
 *
 * Used by `createOrder()` so the customer-chosen `deliveryOption` is honored
 * AND the actual charge/date is computed server-side from the delivery engine
 * (prevents client-side tampering of `deliveryFee`).
 *
 * Returns:
 *   - option: ALWAYS matches the customer's requestedOption (never silently
 *     downgrades to 'standard'). The customer's CHOICE is honored on the
 *     order, invoice, and email — even if the engine's `expressAvailable`
 *     flag is false at order creation time (e.g., admin changed settings
 *     between checkout and order placement).
 *   - charge: final ₹ amount to charge the customer
 *   - dateMin / dateMax: ISO delivery date range for the chosen option
 *   - label: human-readable label for the order
 *
 * PRICING/ETA FALLBACK (option label stays the same, only numbers change):
 *   - If Express is requested but `estimate.expressAvailable` is false, we
 *     still label the order as Express (honoring the customer's choice) but
 *     compute the charge and ETA from the best available data:
 *       * Charge  = standard delivery charge + express surcharge (or just
 *                   surcharge if standard is free).
 *       * ETA     = express SLA date if available, else standard SLA date.
 *   - This ensures the customer ALWAYS sees the option they picked on the
 *     order details page, invoice, and email — no silent downgrades.
 */
export function resolveDeliveryOption(
  estimate: DeliveryEstimate,
  requestedOption: 'standard' | 'express' = 'standard',
): {
  option: 'standard' | 'express'
  label: string
  charge: number
  isFree: boolean
  dateMin: string
  dateMax: string
} {
  // If pincode is not serviceable, return zeros (the caller should reject
  // such orders earlier — this is just a defensive guard). The option label
  // still reflects what the customer requested.
  if (!estimate.serviceable) {
    return {
      option: requestedOption,
      label: requestedOption === 'express' ? 'Express Delivery' : 'Standard Delivery',
      charge: 0,
      isFree: false,
      dateMin: '',
      dateMax: '',
    }
  }

  // Express requested — ALWAYS honor the customer's choice.
  if (requestedOption === 'express') {
    // Best case: express is fully available → use express charge + ETA.
    if (estimate.expressAvailable) {
      return {
        option: 'express',
        label: 'Express Delivery',
        charge: estimate.expressCharge ?? 0,
        isFree: (estimate.expressCharge ?? 0) === 0,
        dateMin: estimate.expressDate || estimate.deliveryDateMin,
        dateMax: estimate.expressDate || estimate.deliveryDateMin,
      }
    }
    // Fallback: express was requested but the engine says it's not available
    // (e.g., admin disabled it, or the "faster" check failed). HONOR the
    // customer's choice — label as Express, and charge the express premium
    // (standard delivery charge + express surcharge) so the customer pays
    // what they agreed to at checkout. This mirrors the engine's primary
    // express-charge computation (line ~715-717) exactly:
    //   - If standard is FREE (above threshold): charge just the surcharge
    //     (premium for priority handling).
    //   - If standard has a charge: charge standard + surcharge.
    // The previous code returned `estimate.deliveryCharge` without adding
    // the surcharge — that was the bug: express orders were stored with the
    // standard fee, so the order details page showed "⚡ Express" but the
    // delivery fee didn't include the express premium.
    const surcharge = estimate.expressSurcharge ?? 0
    const fallbackCharge = estimate.isFreeDelivery
      ? surcharge
      : (estimate.deliveryCharge || 0) + surcharge
    return {
      option: 'express',
      label: 'Express Delivery',
      charge: fallbackCharge,
      isFree: fallbackCharge === 0,
      // Use express ETA if the engine computed one, else fall back to the
      // standard ETA range so the customer still sees a realistic date.
      dateMin: estimate.expressDate || estimate.deliveryDateMin,
      dateMax: estimate.expressDate || estimate.deliveryDateMax,
    }
  }

  // Standard (default)
  return {
    option: 'standard',
    label: 'Standard Delivery',
    charge: estimate.deliveryCharge,
    isFree: estimate.isFreeDelivery,
    dateMin: estimate.deliveryDateMin,
    dateMax: estimate.deliveryDateMax,
  }
}
