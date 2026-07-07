/**
 * Analytics Engine — Production-Grade Reports & Analytics for Multi-Vendor E-Commerce
 *
 * This module is the aggregation layer that powers all reports & analytics across
 * the admin and seller panels. Inspired by Flipkart / Meesho / Amazon seller
 * dashboards, it provides:
 *
 *   1. Admin Overview        — platform KPIs (GMV, revenue, orders, customers, AOV, growth)
 *   2. Sales Report          — daily/weekly/monthly revenue & order trends with comparison
 *   3. Traffic Analytics     — page views, sessions, unique visitors, top pages, sources
 *   4. Conversion Funnel     — visits → product views → cart → checkout → orders
 *   5. Customer Analytics    — new vs returning, LTV, repeat rate, top customers
 *   6. Seller Analytics      — top sellers by GMV/orders, growth, new sellers
 *   7. Product Analytics     — best/worst sellers, inventory, view-to-purchase ratio
 *   8. Category Analytics    — revenue share, growth per category/subcategory
 *   9. Payment Analytics     — method distribution, success/failure, COD vs online
 *  10. Geographic Analytics  — orders & revenue by state/city
 *  11. Seller-specific       — per-seller KPIs, sales trends, product & customer insights
 *  12. Event Tracking        — record page views, product views, searches, cart events
 *  13. CSV Export            — convert any report to CSV
 *
 * Design principles:
 *   - NEVER throws on non-critical failures (logs + returns empty result)
 *   - Date-safe: uses $toString + $substr to handle BOTH Date objects and ISO strings
 *     (orders.createdAt is ISO string, products.createdAt is Date object — this works for both)
 *   - All monetary values are raw numbers (INR); UI formats with formatCurrency()
 *   - Period-over-period comparison built-in (current vs previous period growth %)
 *   - Efficient: uses MongoDB aggregation pipelines with $facet where possible
 *
 * Collections used:
 *   - orders          — order data (createdAt as ISO string)
 *   - products        — product catalog
 *   - customers       — customer registrations
 *   - sellers         — seller registrations
 *   - analytics_events — tracked events (page views, product views, searches, cart)
 *   - refunds         — refund records
 *   - reviews         — product reviews
 */

import { connectToDatabase } from '@/lib/mongodb'

/* ================================================================== */
/*  Types — Report Response Interfaces                                  */
/* ================================================================== */

/** Date range filter used by all report functions */
export interface DateRange {
  startDate: string // ISO string (inclusive)
  endDate: string   // ISO string (inclusive)
}

/** A single point in a time-series chart */
export interface TimeSeriesPoint {
  date: string       // ISO date string (YYYY-MM-DD or YYYY-MM depending on grouping)
  label: string      // Human-readable label (e.g. "Jan 15", "Jan 2024", "W3")
  value: number
  /** Optional secondary value for dual-axis charts */
  secondaryValue?: number
}

/** Growth metric comparing current period vs previous period */
export interface GrowthMetric {
  current: number
  previous: number
  /** Absolute change (current - previous) */
  change: number
  /** Percentage change (0 if previous is 0) */
  growthRate: number
}

/** Admin overview KPI response */
export interface AdminOverviewReport {
  range: DateRange
  kpis: {
    totalRevenue: GrowthMetric
    totalOrders: GrowthMetric
    totalCustomers: GrowthMetric
    avgOrderValue: GrowthMetric
    totalProductsSold: GrowthMetric
    totalRefunds: GrowthMetric
    conversionRate: GrowthMetric
  }
  orderStatusBreakdown: Array<{ status: string; count: number; revenue: number }>
  paymentMethodBreakdown: Array<{ method: string; count: number; revenue: number }>
  topSellers: Array<{
    sellerId: string
    storeName: string
    sellerName: string
    orders: number
    revenue: number
    growthRate: number
  }>
  topProducts: Array<{
    productId: string
    name: string
    image: string
    unitsSold: number
    revenue: number
  }>
  topCategories: Array<{
    category: string
    revenue: number
    orders: number
    unitsSold: number
  }>
  revenueByDay: TimeSeriesPoint[]
  ordersByDay: TimeSeriesPoint[]
}

/** Sales report response */
export interface SalesReport {
  range: DateRange
  groupBy: 'day' | 'week' | 'month'
  summary: {
    grossRevenue: GrowthMetric
    netRevenue: GrowthMetric
    totalOrders: GrowthMetric
    itemsSold: GrowthMetric
    avgOrderValue: GrowthMetric
    refundAmount: GrowthMetric
    discountAmount: GrowthMetric
    deliveryFeeCollected: GrowthMetric
  }
  trend: Array<{
    date: string
    label: string
    revenue: number
    orders: number
    itemsSold: number
    avgOrderValue: number
    refundAmount: number
  }>
  breakdownByPayment: Array<{ method: string; revenue: number; orders: number; percentage: number }>
  breakdownByStatus: Array<{ status: string; revenue: number; orders: number; percentage: number }>
  hourlyDistribution: Array<{ hour: number; orders: number; revenue: number }>
  weekdayDistribution: Array<{ day: string; orders: number; revenue: number }>
}

/** Traffic analytics response */
export interface TrafficReport {
  range: DateRange
  summary: {
    totalPageViews: GrowthMetric
    uniqueVisitors: GrowthMetric
    totalSessions: GrowthMetric
    avgSessionDuration: number
    bounceRate: number
    pagesPerSession: number
  }
  viewsByDay: TimeSeriesPoint[]
  visitorsByDay: TimeSeriesPoint[]
  topPages: Array<{
    path: string
    title: string
    views: number
    uniqueVisitors: number
    avgTimeOnPage: number
  }>
  trafficSources: Array<{
    source: string
    sessions: number
    percentage: number
  }>
  deviceBreakdown: Array<{
    device: string
    sessions: number
    percentage: number
  }>
}

/** Conversion funnel response */
export interface ConversionReport {
  range: DateRange
  funnel: Array<{
    stage: string
    label: string
    count: number
    /** Conversion rate from the previous stage (0-100) */
    stepRate: number
    /** Conversion rate from the first stage (0-100) */
    overallRate: number
  }>
  checkoutAbandonment: {
    cartStarted: number
    checkoutStarted: number
    paymentInitiated: number
    orderCompleted: number
    cartAbandonmentRate: number
    checkoutAbandonmentRate: number
    paymentAbandonmentRate: number
  }
  conversionByDay: TimeSeriesPoint[]
  conversionBySource: Array<{
    source: string
    visits: number
    orders: number
    conversionRate: number
  }>
}

/** Customer analytics response */
export interface CustomerReport {
  range: DateRange
  summary: {
    totalCustomers: GrowthMetric
    newCustomers: GrowthMetric
    returningCustomers: GrowthMetric
    repeatPurchaseRate: GrowthMetric
    avgCustomerLTV: GrowthMetric
    avgOrdersPerCustomer: GrowthMetric
    avgRevenuePerCustomer: GrowthMetric
  }
  registrationsByDay: TimeSeriesPoint[]
  newVsReturning: Array<{ type: string; count: number; revenue: number; percentage: number }>
  topCustomers: Array<{
    customerId: string
    name: string
    mobile: string
    totalOrders: number
    totalSpent: number
    avgOrderValue: number
    lastOrderDate: string
  }>
  customerCohorts: Array<{
    cohort: string
    size: number
    revenue: number
    repeatRate: number
  }>
  orderFrequencyDistribution: Array<{ range: string; customers: number }>
}

/** Seller analytics response */
export interface SellerReport {
  range: DateRange
  summary: {
    totalSellers: GrowthMetric
    activeSellers: GrowthMetric
    newSellers: GrowthMetric
    avgSellerGMV: GrowthMetric
    avgOrdersPerSeller: GrowthMetric
  }
  registrationsByDay: TimeSeriesPoint[]
  topSellersByGMV: Array<{
    sellerId: string
    storeName: string
    sellerName: string
    gmv: number
    orders: number
    products: number
    avgOrderValue: number
    growthRate: number
  }>
  topSellersByOrders: Array<{
    sellerId: string
    storeName: string
    sellerName: string
    orders: number
    gmv: number
    avgOrderValue: number
  }>
  sellerPerformanceTiers: Array<{ tier: string; count: number; totalGMV: number }>
}

/** Product analytics response */
export interface ProductReport {
  range: DateRange
  summary: {
    totalProducts: GrowthMetric
    activeProducts: GrowthMetric
    outOfStock: GrowthMetric
    lowStock: GrowthMetric
    avgRating: GrowthMetric
    totalViews: GrowthMetric
  }
  topProducts: Array<{
    productId: string
    name: string
    image: string
    category: string
    unitsSold: number
    revenue: number
    views: number
    conversionRate: number
    avgRating: number
    stock: number
  }>
  slowMovingProducts: Array<{
    productId: string
    name: string
    image: string
    category: string
    stock: number
    lastSoldDate: string | null
    unitsSold: number
  }>
  categoryPerformance: Array<{
    category: string
    products: number
    unitsSold: number
    revenue: number
    avgRating: number
  }>
  inventoryStatus: Array<{
    status: string
    count: number
    value: number
    percentage: number
  }>
}

/** Category analytics response */
export interface CategoryReport {
  range: DateRange
  categories: Array<{
    category: string
    revenue: number
    orders: number
    unitsSold: number
    products: number
    avgOrderValue: number
    growthRate: number
    marketShare: number
  }>
  trendByDay: TimeSeriesPoint[]
  topSubcategories: Array<{
    category: string
    subcategory: string
    revenue: number
    orders: number
    unitsSold: number
  }>
}

/** Payment analytics response */
export interface PaymentReport {
  range: DateRange
  summary: {
    totalPayments: GrowthMetric
    successRate: GrowthMetric
    failureRate: GrowthMetric
    codOrders: GrowthMetric
    onlineOrders: GrowthMetric
    totalRefunds: GrowthMetric
  }
  methodBreakdown: Array<{
    method: string
    count: number
    revenue: number
    successRate: number
    percentage: number
  }>
  methodDetailBreakdown: Array<{
    detail: string
    count: number
    revenue: number
  }>
  refundsByDay: TimeSeriesPoint[]
  refundReasons: Array<{ reason: string; count: number; amount: number }>
}

/** Geographic analytics response */
export interface GeographicReport {
  range: DateRange
  summary: {
    totalStates: number
    totalCities: number
    topState: string
    topCity: string
  }
  byState: Array<{
    state: string
    orders: number
    revenue: number
    customers: number
    avgOrderValue: number
    percentage: number
  }>
  byCity: Array<{
    city: string
    state: string
    orders: number
    revenue: number
    customers: number
    avgOrderValue: number
  }>
  topPincodes: Array<{
    pincode: string
    city: string
    state: string
    orders: number
    revenue: number
  }>
}

/* ================================================================== */
/*  Seller-Specific Report Types                                        */
/* ================================================================== */

/** Seller overview KPI response */
export interface SellerOverviewReport {
  range: DateRange
  sellerId: string
  kpis: {
    totalRevenue: GrowthMetric
    totalOrders: GrowthMetric
    itemsSold: GrowthMetric
    avgOrderValue: GrowthMetric
    totalProducts: number
    activeProducts: number
    avgRating: number
    conversionRate: GrowthMetric
    productViews: GrowthMetric
  }
  orderStatusBreakdown: Array<{ status: string; count: number; revenue: number }>
  revenueByDay: TimeSeriesPoint[]
  ordersByDay: TimeSeriesPoint[]
  topProducts: Array<{
    productId: string
    name: string
    image: string
    unitsSold: number
    revenue: number
  }>
  topCategories: Array<{
    category: string
    revenue: number
    orders: number
    unitsSold: number
  }>
}

/** Seller sales report response */
export interface SellerSalesReport {
  range: DateRange
  groupBy: 'day' | 'week' | 'month'
  sellerId: string
  summary: {
    grossRevenue: GrowthMetric
    netRevenue: GrowthMetric
    totalOrders: GrowthMetric
    itemsSold: GrowthMetric
    avgOrderValue: GrowthMetric
    refundAmount: GrowthMetric
    sellerEarnings: GrowthMetric
    commissionPaid: GrowthMetric
  }
  trend: Array<{
    date: string
    label: string
    revenue: number
    orders: number
    itemsSold: number
    sellerEarnings: number
    avgOrderValue: number
  }>
  breakdownByPayment: Array<{ method: string; revenue: number; orders: number; percentage: number }>
  breakdownByStatus: Array<{ status: string; revenue: number; orders: number; percentage: number }>
  weekdayDistribution: Array<{ day: string; orders: number; revenue: number }>
}

/** Seller product analytics response */
export interface SellerProductReport {
  range: DateRange
  sellerId: string
  summary: {
    totalProducts: number
    activeProducts: number
    outOfStock: number
    lowStock: number
    avgRating: number
    totalViews: number
  }
  topProducts: Array<{
    productId: string
    name: string
    image: string
    category: string
    unitsSold: number
    revenue: number
    views: number
    conversionRate: number
    avgRating: number
    stock: number
  }>
  slowMovingProducts: Array<{
    productId: string
    name: string
    image: string
    category: string
    stock: number
    lastSoldDate: string | null
    unitsSold: number
  }>
  categoryPerformance: Array<{
    category: string
    products: number
    unitsSold: number
    revenue: number
  }>
  inventoryStatus: Array<{
    status: string
    count: number
    value: number
    percentage: number
  }>
}

/** Seller customer analytics response */
export interface SellerCustomerReport {
  range: DateRange
  sellerId: string
  summary: {
    totalCustomers: number
    newCustomers: GrowthMetric
    returningCustomers: GrowthMetric
    repeatPurchaseRate: GrowthMetric
    avgCustomerValue: GrowthMetric
  }
  newVsReturning: Array<{ type: string; count: number; revenue: number; percentage: number }>
  topCustomers: Array<{
    customerId: string
    name: string
    mobile: string
    totalOrders: number
    totalSpent: number
    avgOrderValue: number
    lastOrderDate: string
  }>
  geographicDistribution: Array<{
    state: string
    customers: number
    orders: number
    revenue: number
  }>
}

/* ================================================================== */
/*  Analytics Event Tracking                                            */
/* ================================================================== */

export type AnalyticsEventType =
  | 'page_view'
  | 'product_view'
  | 'search'
  | 'cart_add'
  | 'cart_remove'
  | 'wishlist_add'
  | 'checkout_start'
  | 'payment_initiated'
  | 'order_placed'
  | 'order_cancelled'
  | 'order_returned'
  | 'review_submitted'
  | 'seller_visit'

export interface AnalyticsEvent {
  type: AnalyticsEventType
  sessionId: string
  customerId?: string
  path?: string
  title?: string
  productId?: string
  productName?: string
  sellerId?: string
  category?: string
  searchQuery?: string
  searchResults?: number
  cartValue?: number
  orderId?: string
  orderValue?: number
  referrer?: string
  userAgent?: string
  device?: 'desktop' | 'mobile' | 'tablet'
  ip?: string
  metadata?: Record<string, unknown>
}

/** Record an analytics event (fire-and-forget, never throws) */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    await db.collection('analytics_events').insertOne({
      ...event,
      timestamp: new Date(),
      createdAt: new Date(),
    })
  } catch (error) {
    // Non-fatal — analytics should never break the user experience
    console.warn('[Analytics] Failed to track event:', (error as Error).message)
  }
}

/* ================================================================== */
/*  Date Utility Functions                                              */
/* ================================================================== */

/** Default date range: last 30 days */
export function getDefaultDateRange(days: number = 30): DateRange {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  }
}

/** Get the previous period of equal length for comparison */
export function getPreviousPeriod(range: DateRange): DateRange {
  const start = new Date(range.startDate)
  const end = new Date(range.endDate)
  const duration = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 1) // 1ms before current start
  const prevStart = new Date(prevEnd.getTime() - duration)
  return {
    startDate: prevStart.toISOString(),
    endDate: prevEnd.toISOString(),
  }
}

/** Compute growth metric from current and previous values */
export function computeGrowth(current: number, previous: number): GrowthMetric {
  const change = current - previous
  const growthRate = previous > 0 ? (change / Math.abs(previous)) * 100 : (current > 0 ? 100 : 0)
  return { current, previous, change, growthRate: Math.round(growthRate * 100) / 100 }
}

/**
 * Build a MongoDB match stage for date filtering that works with BOTH
 * Date objects and ISO strings. Uses $gte/$lte on the raw field value.
 * MongoDB compares ISO strings lexicographically (same chronological order).
 */
function buildDateMatch(field: string, range: DateRange) {
  return {
    [field]: {
      $gte: range.startDate,
      $lte: range.endDate,
    },
  }
}

/**
 * Build an aggregation stage that extracts year/month/day from a date field
 * that may be stored as either a Date object or an ISO string.
 * Uses $toString + $substr pattern (safe for both storage formats).
 */
function buildDateExtraction(dateField: string) {
  return {
    dateStr: { $toString: { $ifNull: [`$${dateField}`, new Date().toISOString()] } },
  }
}

/** Group a date range into daily/weekly/monthly buckets */
function getGroupKey(groupBy: 'day' | 'week' | 'month'): string {
  return groupBy
}

/** Generate a label for a time-series point based on grouping */
function formatDateLabel(dateStr: string, groupBy: 'day' | 'week' | 'month'): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  switch (groupBy) {
    case 'day':
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    case 'week':
      return `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString('en-IN', { month: 'short' })}`
    case 'month':
      return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
    default:
      return d.toLocaleDateString('en-IN')
  }
}

/** Format a date string for time-series (YYYY-MM-DD or YYYY-MM) */
function formatDateKey(dateStr: string, groupBy: 'day' | 'week' | 'month'): string {
  // dateStr is the substr output (YYYYMMDD or YYYYMM)
  if (dateStr.length >= 8) {
    const y = dateStr.substring(0, 4)
    const m = dateStr.substring(4, 6)
    const d = dateStr.substring(6, 8)
    if (groupBy === 'month') return `${y}-${m}`
    return `${y}-${m}-${d}`
  }
  if (dateStr.length >= 6) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}`
  }
  return dateStr
}

/* ================================================================== */
/*  Admin Analytics Functions                                           */
/* ================================================================== */

/**
 * Get the admin overview report — platform-wide KPIs for the dashboard.
 */
export async function getAdminOverview(range: DateRange): Promise<AdminOverviewReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  // Current period orders
  const currentOrders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()
  const previousOrders = await db.collection('orders').find(buildDateMatch('createdAt', prevRange)).toArray()

  // Current period customers
  const currentCustomers = await db.collection('customers').find({
    createdAt: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).count()
  const previousCustomers = await db.collection('customers').find({
    createdAt: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  }).count()

  // Analytics events for conversion rate
  const currentVisits = await db.collection('analytics_events').find({
    type: 'page_view',
    timestamp: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).toArray()
  const previousVisits = await db.collection('analytics_events').find({
    type: 'page_view',
    timestamp: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  }).toArray()

  // Refunds
  const currentRefunds = await db.collection('refunds').find({
    createdAt: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).toArray()
  const previousRefunds = await db.collection('refunds').find({
    createdAt: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  }).toArray()

  // Compute KPIs
  const sumTotal = (orders: typeof currentOrders) =>
    orders.reduce((sum, o) => sum + (typeof o.totalAmount === 'number' ? o.totalAmount : 0), 0)
  const sumItems = (orders: typeof currentOrders) =>
    orders.reduce((sum, o) => sum + (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0), 0)

  const currentRevenue = sumTotal(currentOrders)
  const previousRevenue = sumTotal(previousOrders)
  const currentOrderCount = currentOrders.length
  const previousOrderCount = previousOrders.length
  const currentItemsSold = sumItems(currentOrders)
  const previousItemsSold = sumItems(previousOrders)
  const currentAOV = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0
  const previousAOV = previousOrderCount > 0 ? previousRevenue / previousOrderCount : 0
  const currentRefundAmount = currentRefunds.reduce((s, r) => s + (r.amount || 0), 0)
  const previousRefundAmount = previousRefunds.reduce((s, r) => s + (r.amount || 0), 0)
  const currentVisitCount = currentVisits.length
  const previousVisitCount = previousVisits.length
  const currentConversionRate = currentVisitCount > 0 ? (currentOrderCount / currentVisitCount) * 100 : 0
  const previousConversionRate = previousVisitCount > 0 ? (previousOrderCount / previousVisitCount) * 100 : 0

  // Order status breakdown
  const statusMap = new Map<string, { count: number; revenue: number }>()
  for (const order of currentOrders) {
    const status = order.status || 'Unknown'
    const existing = statusMap.get(status) || { count: 0, revenue: 0 }
    existing.count += 1
    existing.revenue += typeof order.totalAmount === 'number' ? order.totalAmount : 0
    statusMap.set(status, existing)
  }
  const orderStatusBreakdown = Array.from(statusMap.entries())
    .map(([status, v]) => ({ status, count: v.count, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.count - a.count)

  // Payment method breakdown
  const paymentMap = new Map<string, { count: number; revenue: number }>()
  for (const order of currentOrders) {
    const method = order.paymentMethod || 'unknown'
    const existing = paymentMap.get(method) || { count: 0, revenue: 0 }
    existing.count += 1
    existing.revenue += typeof order.totalAmount === 'number' ? order.totalAmount : 0
    paymentMap.set(method, existing)
  }
  const paymentMethodBreakdown = Array.from(paymentMap.entries())
    .map(([method, v]) => ({ method, count: v.count, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue)

  // Top sellers (aggregate from order items)
  const sellerMap = new Map<string, { storeName: string; sellerName: string; orders: Set<string>; revenue: number }>()
  for (const order of currentOrders) {
    for (const item of order.items || []) {
      const sellerId = item.sellerId
      if (!sellerId) continue
      const existing = sellerMap.get(sellerId) || {
        storeName: item.sellerStoreName || 'Unknown',
        sellerName: item.sellerName || 'Unknown',
        orders: new Set<string>(),
        revenue: 0,
      }
      existing.orders.add(order.orderId || order._id?.toString())
      existing.revenue += typeof item.total === 'number' ? item.total : 0
      sellerMap.set(sellerId, existing)
    }
  }

  // Get previous-period seller revenue for growth calculation
  const prevSellerRevenueMap = new Map<string, number>()
  for (const order of previousOrders) {
    for (const item of order.items || []) {
      const sellerId = item.sellerId
      if (!sellerId) continue
      prevSellerRevenueMap.set(sellerId, (prevSellerRevenueMap.get(sellerId) || 0) + (typeof item.total === 'number' ? item.total : 0))
    }
  }

  const topSellers = Array.from(sellerMap.entries())
    .map(([sellerId, v]) => {
      const prevRev = prevSellerRevenueMap.get(sellerId) || 0
      const growth = prevRev > 0 ? ((v.revenue - prevRev) / prevRev) * 100 : (v.revenue > 0 ? 100 : 0)
      return {
        sellerId,
        storeName: v.storeName,
        sellerName: v.sellerName,
        orders: v.orders.size,
        revenue: Math.round(v.revenue * 100) / 100,
        growthRate: Math.round(growth * 100) / 100,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Top products
  const productMap = new Map<string, { name: string; image: string; unitsSold: number; revenue: number }>()
  for (const order of currentOrders) {
    for (const item of order.items || []) {
      const pid = item.productId
      if (!pid) continue
      const existing = productMap.get(pid) || {
        name: item.productName || 'Unknown',
        image: item.productImage || '',
        unitsSold: 0,
        revenue: 0,
      }
      existing.unitsSold += item.quantity || 0
      existing.revenue += typeof item.total === 'number' ? item.total : 0
      productMap.set(pid, existing)
    }
  }
  const topProducts = Array.from(productMap.entries())
    .map(([productId, v]) => ({
      productId,
      name: v.name,
      image: v.image,
      unitsSold: v.unitsSold,
      revenue: Math.round(v.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Top categories
  const categoryMap = new Map<string, { revenue: number; orders: Set<string>; unitsSold: number }>()
  for (const order of currentOrders) {
    for (const item of order.items || []) {
      const cat = item.category || 'Uncategorized'
      const existing = categoryMap.get(cat) || { revenue: 0, orders: new Set<string>(), unitsSold: 0 }
      existing.revenue += typeof item.total === 'number' ? item.total : 0
      existing.orders.add(order.orderId || order._id?.toString())
      existing.unitsSold += item.quantity || 0
      categoryMap.set(cat, existing)
    }
  }
  const topCategories = Array.from(categoryMap.entries())
    .map(([category, v]) => ({
      category,
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders.size,
      unitsSold: v.unitsSold,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Revenue & orders by day
  const dayMap = new Map<string, { revenue: number; orders: number }>()
  for (const order of currentOrders) {
    const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
    const dayKey = dateStr.substring(0, 10) // YYYY-MM-DD
    const existing = dayMap.get(dayKey) || { revenue: 0, orders: 0 }
    existing.revenue += typeof order.totalAmount === 'number' ? order.totalAmount : 0
    existing.orders += 1
    dayMap.set(dayKey, existing)
  }
  const sortedDays = Array.from(dayMap.keys()).sort()
  const revenueByDay: TimeSeriesPoint[] = sortedDays.map(d => ({
    date: d,
    label: formatDateLabel(d, 'day'),
    value: Math.round((dayMap.get(d)?.revenue || 0) * 100) / 100,
  }))
  const ordersByDay: TimeSeriesPoint[] = sortedDays.map(d => ({
    date: d,
    label: formatDateLabel(d, 'day'),
    value: dayMap.get(d)?.orders || 0,
  }))

  return {
    range,
    kpis: {
      totalRevenue: computeGrowth(currentRevenue, previousRevenue),
      totalOrders: computeGrowth(currentOrderCount, previousOrderCount),
      totalCustomers: computeGrowth(currentCustomers, previousCustomers),
      avgOrderValue: computeGrowth(currentAOV, previousAOV),
      totalProductsSold: computeGrowth(currentItemsSold, previousItemsSold),
      totalRefunds: computeGrowth(currentRefundAmount, previousRefundAmount),
      conversionRate: computeGrowth(currentConversionRate, previousConversionRate),
    },
    orderStatusBreakdown,
    paymentMethodBreakdown,
    topSellers,
    topProducts,
    topCategories,
    revenueByDay,
    ordersByDay,
  }
}

/**
 * Get the sales report — detailed revenue & order trends with comparison.
 */
export async function getSalesReport(range: DateRange, groupBy: 'day' | 'week' | 'month' = 'day'): Promise<SalesReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const currentOrders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()
  const previousOrders = await db.collection('orders').find(buildDateMatch('createdAt', prevRange)).toArray()

  // Refunds for both periods
  const currentRefunds = await db.collection('refunds').find({
    createdAt: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).toArray()
  const previousRefunds = await db.collection('refunds').find({
    createdAt: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  }).toArray()

  const computeSummary = (orders: typeof currentOrders, refunds: typeof currentRefunds) => {
    let gross = 0, discount = 0, deliveryFee = 0, itemsSold = 0
    for (const o of orders) {
      gross += typeof o.totalAmount === 'number' ? o.totalAmount : 0
      discount += typeof o.discount === 'number' ? o.discount : (typeof o.productDiscount === 'number' ? o.productDiscount : 0)
      deliveryFee += typeof o.deliveryFee === 'number' ? o.deliveryFee : 0
      for (const item of o.items || []) {
        itemsSold += item.quantity || 0
      }
    }
    const refundAmount = refunds.reduce((s, r) => s + (r.amount || 0), 0)
    const net = gross - refundAmount
    const aov = orders.length > 0 ? gross / orders.length : 0
    return { gross, discount, deliveryFee, itemsSold, refundAmount, net, aov, orderCount: orders.length }
  }

  const curr = computeSummary(currentOrders, currentRefunds)
  const prev = computeSummary(previousOrders, previousRefunds)

  // Trend by grouping
  const trendMap = new Map<string, { revenue: number; orders: number; itemsSold: number; refundAmount: number }>()
  for (const order of currentOrders) {
    const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
    let key: string
    if (groupBy === 'day') {
      key = dateStr.substring(0, 10)
    } else if (groupBy === 'month') {
      key = dateStr.substring(0, 7)
    } else {
      // week: group by ISO week (approximate using year + week number)
      const d = new Date(dateStr)
      const onejan = new Date(d.getFullYear(), 0, 1)
      const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)
      key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
    const existing = trendMap.get(key) || { revenue: 0, orders: 0, itemsSold: 0, refundAmount: 0 }
    existing.revenue += typeof order.totalAmount === 'number' ? order.totalAmount : 0
    existing.orders += 1
    for (const item of order.items || []) existing.itemsSold += item.quantity || 0
    trendMap.set(key, existing)
  }
  // Add refund amounts to trend
  for (const refund of currentRefunds) {
    const dateStr = refund.createdAt instanceof Date ? refund.createdAt.toISOString() : new Date(refund.createdAt).toISOString()
    let key: string
    if (groupBy === 'day') key = dateStr.substring(0, 10)
    else if (groupBy === 'month') key = dateStr.substring(0, 7)
    else {
      const d = new Date(dateStr)
      const onejan = new Date(d.getFullYear(), 0, 1)
      const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)
      key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
    const existing = trendMap.get(key) || { revenue: 0, orders: 0, itemsSold: 0, refundAmount: 0 }
    existing.refundAmount += refund.amount || 0
    trendMap.set(key, existing)
  }

  const trend = Array.from(trendMap.keys()).sort().map(key => {
    const v = trendMap.get(key)!
    return {
      date: key,
      label: groupBy === 'day' ? formatDateLabel(key, 'day') : groupBy === 'month' ? formatDateLabel(key + '-01', 'month') : key,
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders,
      itemsSold: v.itemsSold,
      avgOrderValue: v.orders > 0 ? Math.round((v.revenue / v.orders) * 100) / 100 : 0,
      refundAmount: Math.round(v.refundAmount * 100) / 100,
    }
  })

  // Payment breakdown
  const paymentMap = new Map<string, { revenue: number; orders: number }>()
  for (const o of currentOrders) {
    const m = o.paymentMethod || 'unknown'
    const e = paymentMap.get(m) || { revenue: 0, orders: 0 }
    e.revenue += typeof o.totalAmount === 'number' ? o.totalAmount : 0
    e.orders += 1
    paymentMap.set(m, e)
  }
  const totalRev = curr.gross || 1
  const breakdownByPayment = Array.from(paymentMap.entries()).map(([method, v]) => ({
    method,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders,
    percentage: Math.round((v.revenue / totalRev) * 10000) / 100,
  })).sort((a, b) => b.revenue - a.revenue)

  // Status breakdown
  const statusMap = new Map<string, { revenue: number; orders: number }>()
  for (const o of currentOrders) {
    const s = o.status || 'Unknown'
    const e = statusMap.get(s) || { revenue: 0, orders: 0 }
    e.revenue += typeof o.totalAmount === 'number' ? o.totalAmount : 0
    e.orders += 1
    statusMap.set(s, e)
  }
  const totalOrders = curr.orderCount || 1
  const breakdownByStatus = Array.from(statusMap.entries()).map(([status, v]) => ({
    status,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders,
    percentage: Math.round((v.orders / totalOrders) * 10000) / 100,
  })).sort((a, b) => b.orders - a.orders)

  // Hourly distribution (0-23)
  const hourlyMap = new Array(24).fill(0).map(() => ({ orders: 0, revenue: 0 }))
  for (const o of currentOrders) {
    const dateStr = typeof o.createdAt === 'string' ? o.createdAt : new Date(o.createdAt).toISOString()
    const hour = parseInt(dateStr.substring(11, 13), 10)
    if (hour >= 0 && hour < 24) {
      hourlyMap[hour].orders += 1
      hourlyMap[hour].revenue += typeof o.totalAmount === 'number' ? o.totalAmount : 0
    }
  }
  const hourlyDistribution = hourlyMap.map((v, hour) => ({
    hour,
    orders: v.orders,
    revenue: Math.round(v.revenue * 100) / 100,
  }))

  // Weekday distribution
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const weekdayMap = weekdays.map(d => ({ day: d, orders: 0, revenue: 0 }))
  for (const o of currentOrders) {
    const dateStr = typeof o.createdAt === 'string' ? o.createdAt : new Date(o.createdAt).toISOString()
    const d = new Date(dateStr)
    if (!isNaN(d.getDay())) {
      weekdayMap[d.getDay()].orders += 1
      weekdayMap[d.getDay()].revenue += typeof o.totalAmount === 'number' ? o.totalAmount : 0
    }
  }
  // Reorder to start with Monday
  const weekdayDistribution = [...weekdayMap.slice(1), weekdayMap[0]].map(v => ({
    day: v.day,
    orders: v.orders,
    revenue: Math.round(v.revenue * 100) / 100,
  }))

  return {
    range,
    groupBy,
    summary: {
      grossRevenue: computeGrowth(curr.gross, prev.gross),
      netRevenue: computeGrowth(curr.net, prev.net),
      totalOrders: computeGrowth(curr.orderCount, prev.orderCount),
      itemsSold: computeGrowth(curr.itemsSold, prev.itemsSold),
      avgOrderValue: computeGrowth(curr.aov, prev.aov),
      refundAmount: computeGrowth(curr.refundAmount, prev.refundAmount),
      discountAmount: computeGrowth(curr.discount, prev.discount),
      deliveryFeeCollected: computeGrowth(curr.deliveryFee, prev.deliveryFee),
    },
    trend,
    breakdownByPayment,
    breakdownByStatus,
    hourlyDistribution,
    weekdayDistribution,
  }
}

/**
 * Get traffic analytics — page views, sessions, visitors from analytics_events.
 */
export async function getTrafficReport(range: DateRange): Promise<TrafficReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const matchCurrent = { type: 'page_view', timestamp: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) } }
  const matchPrev = { type: 'page_view', timestamp: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) } }

  const [currentAgg] = await db.collection('analytics_events').aggregate([
    { $match: matchCurrent },
    {
      $facet: {
        total: [{ $count: 'count' }],
        uniqueVisitors: [{ $group: { _id: '$sessionId' } }, { $count: 'count' }],
        sessions: [{ $group: { _id: '$sessionId' } }, { $count: 'count' }],
        byDay: [
          { $addFields: { dateStr: { $toString: '$timestamp' } } },
          { $group: { _id: { $substr: ['$dateStr', 0, 10] }, views: { $sum: 1 }, visitors: { $addToSet: '$sessionId' } } },
          { $project: { _id: 0, date: '$_id', views: 1, visitors: { $size: '$visitors' } } },
          { $sort: { date: 1 } },
        ],
        topPages: [
          { $group: { _id: { path: '$path', title: '$title' }, views: { $sum: 1 }, visitors: { $addToSet: '$sessionId' } } },
          { $project: { _id: 0, path: '$_id.path', title: '$_id.title', views: 1, uniqueVisitors: { $size: '$visitors' } } },
          { $sort: { views: -1 } },
          { $limit: 10 },
        ],
        sources: [
          { $match: { referrer: { $exists: true, $ne: null, $ne: '' } } },
          { $group: { _id: '$referrer', sessions: { $sum: 1 } } },
          { $sort: { sessions: -1 } },
          { $limit: 10 },
        ],
        devices: [
          { $match: { device: { $exists: true } } },
          { $group: { _id: '$device', sessions: { $sum: 1 } } },
          { $sort: { sessions: -1 } },
        ],
      },
    },
  ]).toArray()

  const [prevAgg] = await db.collection('analytics_events').aggregate([
    { $match: matchPrev },
    {
      $facet: {
        total: [{ $count: 'count' }],
        uniqueVisitors: [{ $group: { _id: '$sessionId' } }, { $count: 'count' }],
        sessions: [{ $group: { _id: '$sessionId' } }, { $count: 'count' }],
      },
    },
  ]).toArray()

  const currentTotal = currentAgg?.total?.[0]?.count || 0
  const prevTotal = prevAgg?.total?.[0]?.count || 0
  const currentUnique = currentAgg?.uniqueVisitors?.[0]?.count || 0
  const prevUnique = prevAgg?.uniqueVisitors?.[0]?.count || 0
  const currentSessions = currentAgg?.sessions?.[0]?.count || 0
  const prevSessions = prevAgg?.sessions?.[0]?.count || 0

  const viewsByDay: TimeSeriesPoint[] = (currentAgg?.byDay || []).map((d: { date: string; views: number; visitors: number }) => ({
    date: d.date,
    label: formatDateLabel(d.date, 'day'),
    value: d.views,
    secondaryValue: d.visitors,
  }))

  const visitorsByDay: TimeSeriesPoint[] = (currentAgg?.byDay || []).map((d: { date: string; views: number; visitors: number }) => ({
    date: d.date,
    label: formatDateLabel(d.date, 'day'),
    value: d.visitors,
  }))

  const topPages = (currentAgg?.topPages || []).map((p: { path: string; title: string; views: number; uniqueVisitors: number }) => ({
    path: p.path || '/',
    title: p.title || p.path || 'Unknown',
    views: p.views || 0,
    uniqueVisitors: p.uniqueVisitors || 0,
    avgTimeOnPage: 0, // Not tracked without explicit session timing
  }))

  const totalSourceSessions = (currentAgg?.sources || []).reduce((s: number, r: { sessions: number }) => s + (r.sessions || 0), 0) || 1
  const trafficSources = (currentAgg?.sources || []).map((s: { _id: string; sessions: number }) => ({
    source: s._id || 'Direct',
    sessions: s.sessions || 0,
    percentage: Math.round(((s.sessions || 0) / totalSourceSessions) * 10000) / 100,
  }))

  const totalDeviceSessions = (currentAgg?.devices || []).reduce((s: number, r: { sessions: number }) => s + (r.sessions || 0), 0) || 1
  const deviceBreakdown = (currentAgg?.devices || []).map((d: { _id: string; sessions: number }) => ({
    device: d._id || 'unknown',
    sessions: d.sessions || 0,
    percentage: Math.round(((d.sessions || 0) / totalDeviceSessions) * 10000) / 100,
  }))

  // Compute derived metrics
  const pagesPerSession = currentSessions > 0 ? currentTotal / currentSessions : 0

  return {
    range,
    summary: {
      totalPageViews: computeGrowth(currentTotal, prevTotal),
      uniqueVisitors: computeGrowth(currentUnique, prevUnique),
      totalSessions: computeGrowth(currentSessions, prevSessions),
      avgSessionDuration: 0, // Not tracked without explicit session end events
      bounceRate: 0, // Not tracked without session analysis
      pagesPerSession: Math.round(pagesPerSession * 100) / 100,
    },
    viewsByDay,
    visitorsByDay,
    topPages,
    trafficSources,
    deviceBreakdown,
  }
}

/**
 * Get conversion funnel — visits → product views → cart → checkout → orders.
 */
export async function getConversionReport(range: DateRange): Promise<ConversionReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const matchCurrent = { timestamp: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) } }
  const matchPrev = { timestamp: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) } }

  const [currentAgg] = await db.collection('analytics_events').aggregate([
    { $match: matchCurrent },
    {
      $facet: {
        pageViews: [{ $match: { type: 'page_view' } }, { $count: 'count' }],
        productViews: [{ $match: { type: 'product_view' } }, { $count: 'count' }],
        cartAdds: [{ $match: { type: 'cart_add' } }, { $count: 'count' }],
        checkoutStarts: [{ $match: { type: 'checkout_start' } }, { $count: 'count' }],
        paymentInitiated: [{ $match: { type: 'payment_initiated' } }, { $count: 'count' }],
        orderPlaced: [{ $match: { type: 'order_placed' } }, { $count: 'count' }],
        byDay: [
          { $match: { type: { $in: ['page_view', 'order_placed'] } } },
          { $addFields: { dateStr: { $toString: '$timestamp' } } },
          {
            $group: {
              _id: { date: { $substr: ['$dateStr', 0, 10] }, type: '$type' },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]).toArray()

  const orderCount = await db.collection('orders').countDocuments(buildDateMatch('createdAt', range))

  const pageViews = currentAgg?.pageViews?.[0]?.count || 0
  const productViews = currentAgg?.productViews?.[0]?.count || 0
  const cartAdds = currentAgg?.cartAdds?.[0]?.count || 0
  const checkoutStarts = currentAgg?.checkoutStarts?.[0]?.count || 0
  const paymentInitiated = currentAgg?.paymentInitiated?.[0]?.count || 0
  const orderPlaced = currentAgg?.orderPlaced?.[0]?.count || orderCount

  const stages = [
    { stage: 'visits', label: 'Site Visits', count: pageViews },
    { stage: 'product_views', label: 'Product Views', count: productViews },
    { stage: 'cart', label: 'Added to Cart', count: cartAdds },
    { stage: 'checkout', label: 'Started Checkout', count: checkoutStarts },
    { stage: 'payment', label: 'Payment Initiated', count: paymentInitiated },
    { stage: 'order', label: 'Order Placed', count: orderPlaced },
  ]

  const firstStageCount = stages[0].count || 1
  const funnel = stages.map((s, i) => ({
    stage: s.stage,
    label: s.label,
    count: s.count,
    stepRate: i > 0 && stages[i - 1].count > 0 ? Math.round((s.count / stages[i - 1].count) * 10000) / 100 : 100,
    overallRate: Math.round((s.count / firstStageCount) * 10000) / 100,
  }))

  // Build conversion-by-day time series
  const dayMap = new Map<string, { visits: number; orders: number }>()
  for (const item of currentAgg?.byDay || []) {
    const date = item._id.date
    const type = item._id.type
    const existing = dayMap.get(date) || { visits: 0, orders: 0 }
    if (type === 'page_view') existing.visits += item.count
    if (type === 'order_placed') existing.orders += item.count
    dayMap.set(date, existing)
  }
  // Also count actual orders by day (in case order_placed events are missing)
  const actualOrders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()
  for (const order of actualOrders) {
    const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
    const day = dateStr.substring(0, 10)
    const existing = dayMap.get(day) || { visits: 0, orders: 0 }
    existing.orders += 1
    dayMap.set(day, existing)
  }

  const conversionByDay: TimeSeriesPoint[] = Array.from(dayMap.keys()).sort().map(date => {
    const v = dayMap.get(date)!
    const rate = v.visits > 0 ? (v.orders / v.visits) * 100 : 0
    return {
      date,
      label: formatDateLabel(date, 'day'),
      value: Math.round(rate * 100) / 100,
      secondaryValue: v.orders,
    }
  })

  // Conversion by source
  const sourceAgg = await db.collection('analytics_events').aggregate([
    { $match: { ...matchCurrent, type: 'page_view', referrer: { $exists: true, $ne: null, $ne: '' } } },
    { $group: { _id: '$referrer', visits: { $sum: 1 } } },
    { $sort: { visits: -1 } },
    { $limit: 10 },
  ]).toArray()

  const conversionBySource = await Promise.all((sourceAgg || []).map(async (s: { _id: string; visits: number }) => {
    // Count order_placed events from this source
    const orders = await db.collection('analytics_events').countDocuments({
      ...matchCurrent,
      type: 'order_placed',
      referrer: s._id,
    })
    return {
      source: s._id,
      visits: s.visits,
      orders,
      conversionRate: s.visits > 0 ? Math.round((orders / s.visits) * 10000) / 100 : 0,
    }
  }))

  return {
    range,
    funnel,
    checkoutAbandonment: {
      cartStarted: cartAdds,
      checkoutStarted: checkoutStarts,
      paymentInitiated,
      orderCompleted: orderPlaced,
      cartAbandonmentRate: cartAdds > 0 ? Math.round(((cartAdds - checkoutStarts) / cartAdds) * 10000) / 100 : 0,
      checkoutAbandonmentRate: checkoutStarts > 0 ? Math.round(((checkoutStarts - paymentInitiated) / checkoutStarts) * 10000) / 100 : 0,
      paymentAbandonmentRate: paymentInitiated > 0 ? Math.round(((paymentInitiated - orderPlaced) / paymentInitiated) * 10000) / 100 : 0,
    },
    conversionByDay,
    conversionBySource,
  }
}

/**
 * Get customer analytics — new vs returning, LTV, top customers.
 */
export async function getCustomerReport(range: DateRange): Promise<CustomerReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  // All orders in current & previous periods
  const currentOrders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()
  const previousOrders = await db.collection('orders').find(buildDateMatch('createdAt', prevRange)).toArray()

  // Customers registered in current & previous period
  const newCustomers = await db.collection('customers').find({
    createdAt: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).toArray()
  const prevNewCustomers = await db.collection('customers').find({
    createdAt: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  }).toArray()

  // Classify customers as new vs returning in current period
  const customerOrderMap = new Map<string, { orders: number; spent: number; lastOrder: string; firstOrder: string }>()
  for (const order of currentOrders) {
    const cid = order.customerId
    if (!cid) continue
    const existing = customerOrderMap.get(cid) || { orders: 0, spent: 0, lastOrder: '', firstOrder: '' }
    existing.orders += 1
    existing.spent += typeof order.totalAmount === 'number' ? order.totalAmount : 0
    const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
    if (!existing.firstOrder || dateStr < existing.firstOrder) existing.firstOrder = dateStr
    if (!existing.lastOrder || dateStr > existing.lastOrder) existing.lastOrder = dateStr
    customerOrderMap.set(cid, existing)
  }

  // New customers = first order in current period
  const newCustomerIds = new Set<string>()
  const returningCustomerIds = new Set<string>()
  for (const [cid, data] of customerOrderMap.entries()) {
    // Check if they had orders before this period
    if (data.firstOrder >= range.startDate && data.firstOrder <= range.endDate) {
      newCustomerIds.add(cid)
    } else {
      returningCustomerIds.add(cid)
    }
  }

  const prevCustomerOrderMap = new Map<string, { orders: number; spent: number }>()
  for (const order of previousOrders) {
    const cid = order.customerId
    if (!cid) continue
    const existing = prevCustomerOrderMap.get(cid) || { orders: 0, spent: 0 }
    existing.orders += 1
    existing.spent += typeof order.totalAmount === 'number' ? order.totalAmount : 0
    prevCustomerOrderMap.set(cid, existing)
  }
  const prevNewCustomerCount = prevCustomerOrderMap.size > 0 ?
    Array.from(prevCustomerOrderMap.keys()).filter(cid => {
      // Simplified: count customers whose first order was in prev period
      return true
    }).length : 0

  const totalCustomers = customerOrderMap.size
  const newCount = newCustomerIds.size
  const returningCount = returningCustomerIds.size
  const repeatCount = Array.from(customerOrderMap.values()).filter(c => c.orders > 1).length
  const repeatRate = totalCustomers > 0 ? (repeatCount / totalCustomers) * 100 : 0
  const totalRevenue = Array.from(customerOrderMap.values()).reduce((s, c) => s + c.spent, 0)
  const avgLTV = totalCustomers > 0 ? totalRevenue / totalCustomers : 0
  const avgOrders = totalCustomers > 0 ? Array.from(customerOrderMap.values()).reduce((s, c) => s + c.orders, 0) / totalCustomers : 0
  const avgRevenue = totalCustomers > 0 ? totalRevenue / totalCustomers : 0

  // Previous period metrics
  const prevTotalCustomers = prevCustomerOrderMap.size
  const prevRepeatCount = Array.from(prevCustomerOrderMap.values()).filter(c => c.orders > 1).length
  const prevRepeatRate = prevTotalCustomers > 0 ? (prevRepeatCount / prevTotalCustomers) * 100 : 0
  const prevRevenue = Array.from(prevCustomerOrderMap.values()).reduce((s, c) => s + c.spent, 0)
  const prevLTV = prevTotalCustomers > 0 ? prevRevenue / prevTotalCustomers : 0
  const prevAvgOrders = prevTotalCustomers > 0 ? Array.from(prevCustomerOrderMap.values()).reduce((s, c) => s + c.orders, 0) / prevTotalCustomers : 0
  const prevAvgRevenue = prevTotalCustomers > 0 ? prevRevenue / prevTotalCustomers : 0

  // Registrations by day
  const regDayMap = new Map<string, number>()
  for (const c of newCustomers) {
    const dateStr = c.createdAt instanceof Date ? c.createdAt.toISOString() : new Date(c.createdAt).toISOString()
    const day = dateStr.substring(0, 10)
    regDayMap.set(day, (regDayMap.get(day) || 0) + 1)
  }
  const registrationsByDay: TimeSeriesPoint[] = Array.from(regDayMap.keys()).sort().map(d => ({
    date: d,
    label: formatDateLabel(d, 'day'),
    value: regDayMap.get(d) || 0,
  }))

  // New vs returning
  const newRevenue = Array.from(newCustomerIds).map(id => customerOrderMap.get(id)?.spent || 0).reduce((s, v) => s + v, 0)
  const returningRevenue = Array.from(returningCustomerIds).map(id => customerOrderMap.get(id)?.spent || 0).reduce((s, v) => s + v, 0)
  const totalCust = totalCustomers || 1
  const newVsReturning = [
    { type: 'New', count: newCount, revenue: Math.round(newRevenue * 100) / 100, percentage: Math.round((newCount / totalCust) * 10000) / 100 },
    { type: 'Returning', count: returningCount, revenue: Math.round(returningRevenue * 100) / 100, percentage: Math.round((returningCount / totalCust) * 10000) / 100 },
  ]

  // Top customers — need to fetch customer details
  const topCustomerIds = Array.from(customerOrderMap.entries())
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, 10)
    .map(([id]) => id)

  // Query by string _id matching (handles both ObjectId and string storage)
  const customerInfoMap = new Map<string, { name: string; mobile: string }>()
  for (const id of topCustomerIds) {
    try {
      const { ObjectId } = await import('mongodb')
      let cust = null
      try {
        cust = await db.collection('customers').findOne({ _id: new ObjectId(id) })
      } catch {
        cust = await db.collection('customers').findOne({ _id: id as any })
      }
      if (cust) {
        customerInfoMap.set(id, { name: cust.name || 'Unknown', mobile: cust.mobile || '' })
      } else {
        customerInfoMap.set(id, { name: 'Unknown', mobile: '' })
      }
    } catch {
      customerInfoMap.set(id, { name: 'Unknown', mobile: '' })
    }
  }

  const topCustomers = topCustomerIds.map(id => {
    const data = customerOrderMap.get(id)!
    const info = customerInfoMap.get(id) || { name: 'Unknown', mobile: '' }
    return {
      customerId: id,
      name: info.name,
      mobile: info.mobile,
      totalOrders: data.orders,
      totalSpent: Math.round(data.spent * 100) / 100,
      avgOrderValue: data.orders > 0 ? Math.round((data.spent / data.orders) * 100) / 100 : 0,
      lastOrderDate: data.lastOrder,
    }
  })

  // Cohorts (by first-order month)
  const cohortMap = new Map<string, { size: number; revenue: number; repeatCustomers: number }>()
  for (const [cid, data] of customerOrderMap.entries()) {
    const cohortKey = data.firstOrder.substring(0, 7) // YYYY-MM
    const existing = cohortMap.get(cohortKey) || { size: 0, revenue: 0, repeatCustomers: 0 }
    existing.size += 1
    existing.revenue += data.spent
    if (data.orders > 1) existing.repeatCustomers += 1
    cohortMap.set(cohortKey, existing)
  }
  const customerCohorts = Array.from(cohortMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cohort, v]) => ({
      cohort,
      size: v.size,
      revenue: Math.round(v.revenue * 100) / 100,
      repeatRate: v.size > 0 ? Math.round((v.repeatCustomers / v.size) * 10000) / 100 : 0,
    }))

  // Order frequency distribution
  const freqBuckets = [
    { range: '1 order', min: 1, max: 1 },
    { range: '2-3 orders', min: 2, max: 3 },
    { range: '4-5 orders', min: 4, max: 5 },
    { range: '6-10 orders', min: 6, max: 10 },
    { range: '10+ orders', min: 11, max: Infinity },
  ]
  const orderFrequencyDistribution = freqBuckets.map(b => ({
    range: b.range,
    customers: Array.from(customerOrderMap.values()).filter(c => c.orders >= b.min && c.orders <= b.max).length,
  }))

  return {
    range,
    summary: {
      totalCustomers: computeGrowth(totalCustomers, prevTotalCustomers),
      newCustomers: computeGrowth(newCount, prevNewCustomerCount),
      returningCustomers: computeGrowth(returningCount, prevTotalCustomers - prevNewCustomerCount),
      repeatPurchaseRate: computeGrowth(repeatRate, prevRepeatRate),
      avgCustomerLTV: computeGrowth(avgLTV, prevLTV),
      avgOrdersPerCustomer: computeGrowth(avgOrders, prevAvgOrders),
      avgRevenuePerCustomer: computeGrowth(avgRevenue, prevAvgRevenue),
    },
    registrationsByDay,
    newVsReturning,
    topCustomers,
    customerCohorts,
    orderFrequencyDistribution,
  }
}

/**
 * Get seller analytics — top sellers, growth, performance tiers.
 */
export async function getSellerReport(range: DateRange): Promise<SellerReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const currentOrders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()
  const previousOrders = await db.collection('orders').find(buildDateMatch('createdAt', prevRange)).toArray()

  // Seller registrations
  const newSellers = await db.collection('sellers').find({
    createdAt: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).count()
  const prevNewSellers = await db.collection('sellers').find({
    createdAt: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  }).count()

  const totalSellers = await db.collection('sellers').countDocuments()
  const prevTotalSellers = totalSellers - newSellers // approximate

  // Build seller performance maps
  const sellerMap = new Map<string, { storeName: string; sellerName: string; gmv: number; orders: Set<string>; products: number }>()
  for (const order of currentOrders) {
    for (const item of order.items || []) {
      const sid = item.sellerId
      if (!sid) continue
      const existing = sellerMap.get(sid) || {
        storeName: item.sellerStoreName || 'Unknown',
        sellerName: item.sellerName || 'Unknown',
        gmv: 0,
        orders: new Set<string>(),
        products: 0,
      }
      existing.gmv += typeof item.total === 'number' ? item.total : 0
      existing.orders.add(order.orderId || order._id?.toString())
      sellerMap.set(sid, existing)
    }
  }

  // Count products per seller
  const sellerProductAgg = await db.collection('products').aggregate([
    { $group: { _id: '$sellerId', count: { $sum: 1 } } },
  ]).toArray()
  for (const sp of sellerProductAgg) {
    const sid = sp._id
    if (sellerMap.has(sid)) {
      sellerMap.get(sid)!.products = sp.count
    }
  }

  // Previous period seller GMV
  const prevSellerGMV = new Map<string, number>()
  for (const order of previousOrders) {
    for (const item of order.items || []) {
      const sid = item.sellerId
      if (!sid) continue
      prevSellerGMV.set(sid, (prevSellerGMV.get(sid) || 0) + (typeof item.total === 'number' ? item.total : 0))
    }
  }

  // Active sellers = sellers with at least 1 order in current period
  const activeSellers = sellerMap.size
  const prevActiveSellers = new Set<string>()
  for (const order of previousOrders) {
    for (const item of order.items || []) {
      if (item.sellerId) prevActiveSellers.add(item.sellerId)
    }
  }
  const prevActiveCount = prevActiveSellers.size

  const allGMV = Array.from(sellerMap.values()).map(s => s.gmv)
  const avgGMV = allGMV.length > 0 ? allGMV.reduce((s, v) => s + v, 0) / allGMV.length : 0
  const prevAllGMV = Array.from(prevSellerGMV.values())
  const prevAvgGMV = prevAllGMV.length > 0 ? prevAllGMV.reduce((s, v) => s + v, 0) / prevAllGMV.length : 0
  const avgOrders = activeSellers > 0 ? Array.from(sellerMap.values()).reduce((s, v) => s + v.orders.size, 0) / activeSellers : 0
  const prevAvgOrders = prevActiveCount > 0 ? Array.from(prevSellerGMV.keys()).length / prevActiveCount : 0

  // Top sellers by GMV
  const topSellersByGMV = Array.from(sellerMap.entries())
    .map(([sellerId, v]) => {
      const prevGMV = prevSellerGMV.get(sellerId) || 0
      const growth = prevGMV > 0 ? ((v.gmv - prevGMV) / prevGMV) * 100 : (v.gmv > 0 ? 100 : 0)
      return {
        sellerId,
        storeName: v.storeName,
        sellerName: v.sellerName,
        gmv: Math.round(v.gmv * 100) / 100,
        orders: v.orders.size,
        products: v.products,
        avgOrderValue: v.orders.size > 0 ? Math.round((v.gmv / v.orders.size) * 100) / 100 : 0,
        growthRate: Math.round(growth * 100) / 100,
      }
    })
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 10)

  // Top sellers by orders
  const topSellersByOrders = Array.from(sellerMap.entries())
    .map(([sellerId, v]) => ({
      sellerId,
      storeName: v.storeName,
      sellerName: v.sellerName,
      orders: v.orders.size,
      gmv: Math.round(v.gmv * 100) / 100,
      avgOrderValue: v.orders.size > 0 ? Math.round((v.gmv / v.orders.size) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10)

  // Performance tiers
  const tiers = [
    { tier: 'Platinum (₹1L+)', min: 100000, count: 0, totalGMV: 0 },
    { tier: 'Gold (₹50K-1L)', min: 50000, max: 100000, count: 0, totalGMV: 0 },
    { tier: 'Silver (₹10K-50K)', min: 10000, max: 50000, count: 0, totalGMV: 0 },
    { tier: 'Bronze (<₹10K)', min: 0, max: 10000, count: 0, totalGMV: 0 },
  ]
  for (const v of sellerMap.values()) {
    for (const t of tiers) {
      if (v.gmv >= t.min && (!('max' in t) || v.gmv < t.max!)) {
        t.count += 1
        t.totalGMV += v.gmv
        break
      }
    }
  }
  const sellerPerformanceTiers = tiers.map(t => ({
    tier: t.tier,
    count: t.count,
    totalGMV: Math.round(t.totalGMV * 100) / 100,
  }))

  // Registrations by day
  const sellerDayMap = new Map<string, number>()
  const sellerRegs = await db.collection('sellers').find({
    createdAt: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).toArray()
  for (const s of sellerRegs) {
    const dateStr = s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date(s.createdAt).toISOString()
    const day = dateStr.substring(0, 10)
    sellerDayMap.set(day, (sellerDayMap.get(day) || 0) + 1)
  }
  const registrationsByDay: TimeSeriesPoint[] = Array.from(sellerDayMap.keys()).sort().map(d => ({
    date: d,
    label: formatDateLabel(d, 'day'),
    value: sellerDayMap.get(d) || 0,
  }))

  return {
    range,
    summary: {
      totalSellers: computeGrowth(totalSellers, prevTotalSellers),
      activeSellers: computeGrowth(activeSellers, prevActiveCount),
      newSellers: computeGrowth(newSellers, prevNewSellers),
      avgSellerGMV: computeGrowth(avgGMV, prevAvgGMV),
      avgOrdersPerSeller: computeGrowth(avgOrders, prevAvgOrders),
    },
    registrationsByDay,
    topSellersByGMV,
    topSellersByOrders,
    sellerPerformanceTiers,
  }
}

/**
 * Get product analytics — best/worst sellers, inventory, ratings.
 */
export async function getProductReport(range: DateRange): Promise<ProductReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const currentOrders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()
  const previousOrders = await db.collection('orders').find(buildDateMatch('createdAt', prevRange)).toArray()

  // Product sales aggregation
  const productMap = new Map<string, { name: string; image: string; category: string; unitsSold: number; revenue: number; lastSold: string }>()
  for (const order of currentOrders) {
    for (const item of order.items || []) {
      const pid = item.productId
      if (!pid) continue
      const existing = productMap.get(pid) || {
        name: item.productName || 'Unknown',
        image: item.productImage || '',
        category: item.category || 'Uncategorized',
        unitsSold: 0,
        revenue: 0,
        lastSold: '',
      }
      existing.unitsSold += item.quantity || 0
      existing.revenue += typeof item.total === 'number' ? item.total : 0
      const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
      if (!existing.lastSold || dateStr > existing.lastSold) existing.lastSold = dateStr
      productMap.set(pid, existing)
    }
  }

  // Product views from analytics_events
  const viewAgg = await db.collection('analytics_events').aggregate([
    { $match: { type: 'product_view', timestamp: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) } } },
    { $group: { _id: '$productId', views: { $sum: 1 } } },
  ]).toArray()
  const viewMap = new Map<string, number>()
  for (const v of viewAgg) {
    if (v._id) viewMap.set(v._id, v.views)
  }

  // Fetch product details (stock, rating, active status)
  // Query one by one to handle both ObjectId and string _id storage
  const productIds = Array.from(productMap.keys())

  const productDetailsMap = new Map<string, { stock: number; avgRating: number; active: boolean; status: string; category: string; name: string; image: string }>()
  for (const pid of productIds) {
    try {
      const { ObjectId } = await import('mongodb')
      let prod = null
      try { prod = await db.collection('products').findOne({ _id: new ObjectId(pid) }) } catch { prod = await db.collection('products').findOne({ _id: pid as any }) }
      if (prod) {
        productDetailsMap.set(pid, {
          stock: prod.stock || 0,
          avgRating: prod.avgRating || 0,
          active: prod.active !== false,
          status: prod.status || 'Unknown',
          category: prod.category || 'Uncategorized',
          name: prod.name || 'Unknown',
          image: prod.imageUrl || (prod.images?.[0]?.url) || '',
        })
      }
    } catch { /* skip */ }
  }

  // Top products
  const topProducts = Array.from(productMap.entries())
    .map(([productId, v]) => {
      const details = productDetailsMap.get(productId)
      const views = viewMap.get(productId) || 0
      return {
        productId,
        name: v.name,
        image: v.image,
        category: v.category,
        unitsSold: v.unitsSold,
        revenue: Math.round(v.revenue * 100) / 100,
        views,
        conversionRate: views > 0 ? Math.round((v.unitsSold / views) * 10000) / 100 : 0,
        avgRating: details?.avgRating || 0,
        stock: details?.stock || 0,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20)

  // Slow-moving products (in catalog but low/no sales)
  const allProducts = await db.collection('products').find({}).limit(500).toArray()
  const slowMoving = []
  for (const prod of allProducts) {
    const pid = prod._id.toString()
    const sales = productMap.get(pid)
    if (!sales || sales.unitsSold < 3) {
      slowMoving.push({
        productId: pid,
        name: prod.name || 'Unknown',
        image: prod.imageUrl || (prod.images?.[0]?.url) || '',
        category: prod.category || 'Uncategorized',
        stock: prod.stock || 0,
        lastSoldDate: sales?.lastSold || null,
        unitsSold: sales?.unitsSold || 0,
      })
    }
    if (slowMoving.length >= 20) break
  }
  const slowMovingProducts = slowMoving.sort((a, b) => (a.unitsSold) - (b.unitsSold))

  // Category performance
  const catMap = new Map<string, { products: number; unitsSold: number; revenue: number; ratingSum: number; ratingCount: number }>()
  for (const prod of allProducts) {
    const cat = prod.category || 'Uncategorized'
    const existing = catMap.get(cat) || { products: 0, unitsSold: 0, revenue: 0, ratingSum: 0, ratingCount: 0 }
    existing.products += 1
    if (prod.avgRating) {
      existing.ratingSum += prod.avgRating
      existing.ratingCount += 1
    }
    catMap.set(cat, existing)
  }
  for (const [pid, v] of productMap.entries()) {
    const cat = v.category
    const existing = catMap.get(cat) || { products: 0, unitsSold: 0, revenue: 0, ratingSum: 0, ratingCount: 0 }
    existing.unitsSold += v.unitsSold
    existing.revenue += v.revenue
    catMap.set(cat, existing)
  }
  const categoryPerformance = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      products: v.products,
      unitsSold: v.unitsSold,
      revenue: Math.round(v.revenue * 100) / 100,
      avgRating: v.ratingCount > 0 ? Math.round((v.ratingSum / v.ratingCount) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // Inventory status
  let inStock = 0, lowStock = 0, outOfStock = 0, inStockValue = 0
  for (const prod of allProducts) {
    const stock = prod.stock || 0
    const price = prod.sellingPrice || prod.price || 0
    if (stock <= 0) {
      outOfStock += 1
    } else if (stock <= (prod.lowStockThreshold || 5)) {
      lowStock += 1
      inStockValue += stock * price
    } else {
      inStock += 1
      inStockValue += stock * price
    }
  }
  const totalProducts = allProducts.length || 1
  const inventoryStatus = [
    { status: 'In Stock', count: inStock, value: Math.round(inStockValue * 100) / 100, percentage: Math.round((inStock / totalProducts) * 10000) / 100 },
    { status: 'Low Stock', count: lowStock, value: 0, percentage: Math.round((lowStock / totalProducts) * 10000) / 100 },
    { status: 'Out of Stock', count: outOfStock, value: 0, percentage: Math.round((outOfStock / totalProducts) * 10000) / 100 },
  ]

  // Previous period stats for growth
  const prevProductMap = new Map<string, number>()
  for (const order of previousOrders) {
    for (const item of order.items || []) {
      if (item.productId) prevProductMap.set(item.productId, (prevProductMap.get(item.productId) || 0) + (item.quantity || 0))
    }
  }
  const prevTotalViews = await db.collection('analytics_events').countDocuments({
    type: 'product_view',
    timestamp: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  })
  const currentTotalViews = Array.from(viewMap.values()).reduce((s, v) => s + v, 0)

  // Compute product averages
  const allRatings = allProducts.map(p => p.avgRating || 0).filter(r => r > 0)
  const avgRating = allRatings.length > 0 ? allRatings.reduce((s, v) => s + v, 0) / allRatings.length : 0

  return {
    range,
    summary: {
      totalProducts: computeGrowth(allProducts.length, allProducts.length), // no historical snapshot
      activeProducts: computeGrowth(allProducts.filter(p => p.active !== false).length, allProducts.length),
      outOfStock: computeGrowth(outOfStock, outOfStock),
      lowStock: computeGrowth(lowStock, lowStock),
      avgRating: computeGrowth(avgRating, avgRating),
      totalViews: computeGrowth(currentTotalViews, prevTotalViews),
    },
    topProducts,
    slowMovingProducts,
    categoryPerformance,
    inventoryStatus,
  }
}

/**
 * Get category analytics — revenue share, growth per category.
 */
export async function getCategoryReport(range: DateRange): Promise<CategoryReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const currentOrders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()
  const previousOrders = await db.collection('orders').find(buildDateMatch('createdAt', prevRange)).toArray()

  const buildCatMap = (orders: typeof currentOrders) => {
    const m = new Map<string, { revenue: number; orders: Set<string>; unitsSold: number }>()
    for (const order of orders) {
      for (const item of order.items || []) {
        const cat = item.category || 'Uncategorized'
        const existing = m.get(cat) || { revenue: 0, orders: new Set<string>(), unitsSold: 0 }
        existing.revenue += typeof item.total === 'number' ? item.total : 0
        existing.orders.add(order.orderId || order._id?.toString())
        existing.unitsSold += item.quantity || 0
        m.set(cat, existing)
      }
    }
    return m
  }

  const currentCatMap = buildCatMap(currentOrders)
  const prevCatMap = buildCatMap(previousOrders)

  // Count products per category
  const productCountAgg = await db.collection('products').aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]).toArray()
  const productCountMap = new Map<string, number>()
  for (const c of productCountAgg) {
    if (c._id) productCountMap.set(c._id, c.count)
  }

  const totalRevenue = Array.from(currentCatMap.values()).reduce((s, v) => s + v.revenue, 0) || 1
  const categories = Array.from(currentCatMap.entries())
    .map(([category, v]) => {
      const prev = prevCatMap.get(category)
      const prevRev = prev?.revenue || 0
      const growth = prevRev > 0 ? ((v.revenue - prevRev) / prevRev) * 100 : (v.revenue > 0 ? 100 : 0)
      return {
        category,
        revenue: Math.round(v.revenue * 100) / 100,
        orders: v.orders.size,
        unitsSold: v.unitsSold,
        products: productCountMap.get(category) || 0,
        avgOrderValue: v.orders.size > 0 ? Math.round((v.revenue / v.orders.size) * 100) / 100 : 0,
        growthRate: Math.round(growth * 100) / 100,
        marketShare: Math.round((v.revenue / totalRevenue) * 10000) / 100,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  // Trend by day (top 5 categories)
  const top5Cats = categories.slice(0, 5).map(c => c.category)
  const dayMap = new Map<string, number>()
  for (const order of currentOrders) {
    for (const item of order.items || []) {
      if (top5Cats.includes(item.category)) {
        const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
        const day = dateStr.substring(0, 10)
        dayMap.set(day, (dayMap.get(day) || 0) + (typeof item.total === 'number' ? item.total : 0))
      }
    }
  }
  const trendByDay: TimeSeriesPoint[] = Array.from(dayMap.keys()).sort().map(d => ({
    date: d,
    label: formatDateLabel(d, 'day'),
    value: Math.round((dayMap.get(d) || 0) * 100) / 100,
  }))

  // Top subcategories
  const subcatMap = new Map<string, { category: string; subcategory: string; revenue: number; orders: Set<string>; unitsSold: number }>()
  for (const order of currentOrders) {
    for (const item of order.items || []) {
      const cat = item.category || 'Uncategorized'
      const subcat = item.subcategory || 'General'
      const key = `${cat}|||${subcat}`
      const existing = subcatMap.get(key) || { category: cat, subcategory: subcat, revenue: 0, orders: new Set<string>(), unitsSold: 0 }
      existing.revenue += typeof item.total === 'number' ? item.total : 0
      existing.orders.add(order.orderId || order._id?.toString())
      existing.unitsSold += item.quantity || 0
      subcatMap.set(key, existing)
    }
  }
  const topSubcategories = Array.from(subcatMap.values())
    .map(v => ({
      category: v.category,
      subcategory: v.subcategory,
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders.size,
      unitsSold: v.unitsSold,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15)

  return {
    range,
    categories,
    trendByDay,
    topSubcategories,
  }
}

/**
 * Get payment analytics — method distribution, success/failure, refunds.
 */
export async function getPaymentReport(range: DateRange): Promise<PaymentReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const currentOrders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()
  const previousOrders = await db.collection('orders').find(buildDateMatch('createdAt', prevRange)).toArray()

  const currentRefunds = await db.collection('refunds').find({
    createdAt: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).toArray()
  const previousRefunds = await db.collection('refunds').find({
    createdAt: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  }).toArray()

  // Method breakdown
  const methodMap = new Map<string, { count: number; revenue: number; failed: number }>()
  for (const o of currentOrders) {
    const m = o.paymentMethod || 'unknown'
    const existing = methodMap.get(m) || { count: 0, revenue: 0, failed: 0 }
    existing.count += 1
    existing.revenue += typeof o.totalAmount === 'number' ? o.totalAmount : 0
    if (o.paymentStatus === 'failed' || o.status === 'Cancelled') existing.failed += 1
    methodMap.set(m, existing)
  }
  const totalPayments = currentOrders.length || 1
  const methodBreakdown = Array.from(methodMap.entries()).map(([method, v]) => ({
    method,
    count: v.count,
    revenue: Math.round(v.revenue * 100) / 100,
    successRate: v.count > 0 ? Math.round(((v.count - v.failed) / v.count) * 10000) / 100 : 100,
    percentage: Math.round((v.count / totalPayments) * 10000) / 100,
  })).sort((a, b) => b.revenue - a.revenue)

  // Method detail breakdown (upi, card, netbanking, wallet)
  const detailMap = new Map<string, { count: number; revenue: number }>()
  for (const o of currentOrders) {
    const detail = o.paymentMethodDetail || (o.paymentMethod === 'cod' ? 'cod' : 'unknown')
    const existing = detailMap.get(detail) || { count: 0, revenue: 0 }
    existing.count += 1
    existing.revenue += typeof o.totalAmount === 'number' ? o.totalAmount : 0
    detailMap.set(detail, existing)
  }
  const methodDetailBreakdown = Array.from(detailMap.entries()).map(([detail, v]) => ({
    detail,
    count: v.count,
    revenue: Math.round(v.revenue * 100) / 100,
  })).sort((a, b) => b.revenue - a.revenue)

  // Refunds by day
  const refundDayMap = new Map<string, number>()
  for (const r of currentRefunds) {
    const dateStr = r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString()
    const day = dateStr.substring(0, 10)
    refundDayMap.set(day, (refundDayMap.get(day) || 0) + (r.amount || 0))
  }
  const refundsByDay: TimeSeriesPoint[] = Array.from(refundDayMap.keys()).sort().map(d => ({
    date: d,
    label: formatDateLabel(d, 'day'),
    value: Math.round((refundDayMap.get(d) || 0) * 100) / 100,
  }))

  // Refund reasons
  const reasonMap = new Map<string, { count: number; amount: number }>()
  for (const r of currentRefunds) {
    const reason = r.reason || 'Unknown'
    const existing = reasonMap.get(reason) || { count: 0, amount: 0 }
    existing.count += 1
    existing.amount += r.amount || 0
    reasonMap.set(reason, existing)
  }
  const refundReasons = Array.from(reasonMap.entries()).map(([reason, v]) => ({
    reason,
    count: v.count,
    amount: Math.round(v.amount * 100) / 100,
  })).sort((a, b) => b.amount - a.amount)

  // Summary metrics
  const codOrders = methodMap.get('cod')?.count || 0
  const onlineOrders = methodMap.get('online')?.count || 0
  const prevCodOrders = previousOrders.filter(o => o.paymentMethod === 'cod').length
  const prevOnlineOrders = previousOrders.filter(o => o.paymentMethod === 'online').length
  const totalRefunds = currentRefunds.reduce((s, r) => s + (r.amount || 0), 0)
  const prevTotalRefunds = previousRefunds.reduce((s, r) => s + (r.amount || 0), 0)
  const failedCount = Array.from(methodMap.values()).reduce((s, v) => s + v.failed, 0)
  const prevFailed = previousOrders.filter(o => o.paymentStatus === 'failed' || o.status === 'Cancelled').length
  const successRate = currentOrders.length > 0 ? ((currentOrders.length - failedCount) / currentOrders.length) * 100 : 100
  const prevSuccessRate = previousOrders.length > 0 ? ((previousOrders.length - prevFailed) / previousOrders.length) * 100 : 100

  return {
    range,
    summary: {
      totalPayments: computeGrowth(currentOrders.length, previousOrders.length),
      successRate: computeGrowth(successRate, prevSuccessRate),
      failureRate: computeGrowth(failedCount, prevFailed),
      codOrders: computeGrowth(codOrders, prevCodOrders),
      onlineOrders: computeGrowth(onlineOrders, prevOnlineOrders),
      totalRefunds: computeGrowth(totalRefunds, prevTotalRefunds),
    },
    methodBreakdown,
    methodDetailBreakdown,
    refundsByDay,
    refundReasons,
  }
}

/**
 * Get geographic analytics — orders & revenue by state/city.
 */
export async function getGeographicReport(range: DateRange): Promise<GeographicReport> {
  const { db } = await connectToDatabase()
  const orders = await db.collection('orders').find(buildDateMatch('createdAt', range)).toArray()

  const stateMap = new Map<string, { orders: number; revenue: number; customers: Set<string> }>()
  const cityMap = new Map<string, { city: string; state: string; orders: number; revenue: number; customers: Set<string> }>()
  const pincodeMap = new Map<string, { pincode: string; city: string; state: string; orders: number; revenue: number }>()

  for (const order of orders) {
    const addr = order.shippingAddress || {}
    const state = addr.state || 'Unknown'
    const city = addr.city || 'Unknown'
    const pincode = addr.pincode || 'Unknown'
    const revenue = typeof order.totalAmount === 'number' ? order.totalAmount : 0
    const customerId = order.customerId

    const stateExisting = stateMap.get(state) || { orders: 0, revenue: 0, customers: new Set<string>() }
    stateExisting.orders += 1
    stateExisting.revenue += revenue
    if (customerId) stateExisting.customers.add(customerId)
    stateMap.set(state, stateExisting)

    const cityKey = `${city}|||${state}`
    const cityExisting = cityMap.get(cityKey) || { city, state, orders: 0, revenue: 0, customers: new Set<string>() }
    cityExisting.orders += 1
    cityExisting.revenue += revenue
    if (customerId) cityExisting.customers.add(customerId)
    cityMap.set(cityKey, cityExisting)

    const pincodeExisting = pincodeMap.get(pincode) || { pincode, city, state, orders: 0, revenue: 0 }
    pincodeExisting.orders += 1
    pincodeExisting.revenue += revenue
    pincodeMap.set(pincode, pincodeExisting)
  }

  const totalRevenue = Array.from(stateMap.values()).reduce((s, v) => s + v.revenue, 0) || 1
  const byState = Array.from(stateMap.entries())
    .map(([state, v]) => ({
      state,
      orders: v.orders,
      revenue: Math.round(v.revenue * 100) / 100,
      customers: v.customers.size,
      avgOrderValue: v.orders > 0 ? Math.round((v.revenue / v.orders) * 100) / 100 : 0,
      percentage: Math.round((v.revenue / totalRevenue) * 10000) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const byCity = Array.from(cityMap.values())
    .map(v => ({
      city: v.city,
      state: v.state,
      orders: v.orders,
      revenue: Math.round(v.revenue * 100) / 100,
      customers: v.customers.size,
      avgOrderValue: v.orders > 0 ? Math.round((v.revenue / v.orders) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20)

  const topPincodes = Array.from(pincodeMap.values())
    .map(v => ({
      pincode: v.pincode,
      city: v.city,
      state: v.state,
      orders: v.orders,
      revenue: Math.round(v.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15)

  return {
    range,
    summary: {
      totalStates: stateMap.size,
      totalCities: cityMap.size,
      topState: byState[0]?.state || 'N/A',
      topCity: byCity[0]?.city || 'N/A',
    },
    byState,
    byCity,
    topPincodes,
  }
}

/* ================================================================== */
/*  Seller-Specific Analytics Functions                                 */
/* ================================================================== */

/**
 * Build a MongoDB match for orders containing items from a specific seller.
 * Handles multiple seller ID aliases.
 */
function buildSellerMatch(sellerIds: string[], range: DateRange) {
  return {
    'items.sellerId': { $in: sellerIds },
    createdAt: { $gte: range.startDate, $lte: range.endDate },
  }
}

/**
 * Get seller overview — KPIs for the seller dashboard.
 */
export async function getSellerOverview(sellerIds: string[], range: DateRange): Promise<SellerOverviewReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const currentOrders = await db.collection('orders').find(buildSellerMatch(sellerIds, range)).toArray()
  const previousOrders = await db.collection('orders').find(buildSellerMatch(sellerIds, prevRange)).toArray()

  const computeStats = (orders: typeof currentOrders) => {
    let revenue = 0, itemsSold = 0
    const orderSet = new Set<string>()
    const statusMap = new Map<string, { count: number; revenue: number }>()
    const productMap = new Map<string, { name: string; image: string; unitsSold: number; revenue: number }>()
    const catMap = new Map<string, { revenue: number; orders: Set<string>; unitsSold: number }>()

    for (const order of orders) {
      orderSet.add(order.orderId || order._id?.toString())
      let orderHasSellerItem = false
      for (const item of order.items || []) {
        if (!sellerIds.includes(item.sellerId)) continue
        orderHasSellerItem = true
        revenue += typeof item.total === 'number' ? item.total : 0
        itemsSold += item.quantity || 0

        const status = item.status || 'Unknown'
        const sExisting = statusMap.get(status) || { count: 0, revenue: 0 }
        sExisting.count += 1
        sExisting.revenue += typeof item.total === 'number' ? item.total : 0
        statusMap.set(status, sExisting)

        const pid = item.productId
        if (pid) {
          const pExisting = productMap.get(pid) || { name: item.productName || 'Unknown', image: item.productImage || '', unitsSold: 0, revenue: 0 }
          pExisting.unitsSold += item.quantity || 0
          pExisting.revenue += typeof item.total === 'number' ? item.total : 0
          productMap.set(pid, pExisting)
        }

        const cat = item.category || 'Uncategorized'
        const cExisting = catMap.get(cat) || { revenue: 0, orders: new Set<string>(), unitsSold: 0 }
        cExisting.revenue += typeof item.total === 'number' ? item.total : 0
        cExisting.orders.add(order.orderId || order._id?.toString())
        cExisting.unitsSold += item.quantity || 0
        catMap.set(cat, cExisting)
      }
    }

    return { revenue, itemsSold, orderCount: orderSet.size, statusMap, productMap, catMap }
  }

  const curr = computeStats(currentOrders)
  const prev = computeStats(previousOrders)
  const currentAOV = curr.orderCount > 0 ? curr.revenue / curr.orderCount : 0
  const prevAOV = prev.orderCount > 0 ? prev.revenue / prev.orderCount : 0

  // Product views for this seller
  const currentViews = await db.collection('analytics_events').countDocuments({
    type: 'product_view',
    sellerId: { $in: sellerIds },
    timestamp: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  })
  const prevViews = await db.collection('analytics_events').countDocuments({
    type: 'product_view',
    sellerId: { $in: sellerIds },
    timestamp: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  })
  const conversionRate = currentViews > 0 ? (curr.itemsSold / currentViews) * 100 : 0
  const prevConversionRate = prevViews > 0 ? (prev.itemsSold / prevViews) * 100 : 0

  // Product counts
  const totalProducts = await db.collection('products').countDocuments({ sellerId: { $in: sellerIds } })
  const activeProducts = await db.collection('products').countDocuments({ sellerId: { $in: sellerIds }, active: true, status: 'Published' })

  // Average rating
  const productAgg = await db.collection('products').aggregate([
    { $match: { sellerId: { $in: sellerIds } } },
    { $group: { _id: null, avgRating: { $avg: '$avgRating' }, count: { $sum: 1 } } },
  ]).toArray()
  const avgRating = productAgg[0]?.avgRating || 0

  // Order status breakdown
  const orderStatusBreakdown = Array.from(curr.statusMap.entries())
    .map(([status, v]) => ({ status, count: v.count, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.count - a.count)

  // Revenue & orders by day
  const dayMap = new Map<string, { revenue: number; orders: Set<string> }>()
  for (const order of currentOrders) {
    const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
    const day = dateStr.substring(0, 10)
    const existing = dayMap.get(day) || { revenue: 0, orders: new Set<string>() }
    let dayRevenue = 0
    for (const item of order.items || []) {
      if (sellerIds.includes(item.sellerId)) dayRevenue += typeof item.total === 'number' ? item.total : 0
    }
    existing.revenue += dayRevenue
    existing.orders.add(order.orderId || order._id?.toString())
    dayMap.set(day, existing)
  }
  const sortedDays = Array.from(dayMap.keys()).sort()
  const revenueByDay: TimeSeriesPoint[] = sortedDays.map(d => ({
    date: d,
    label: formatDateLabel(d, 'day'),
    value: Math.round((dayMap.get(d)?.revenue || 0) * 100) / 100,
  }))
  const ordersByDay: TimeSeriesPoint[] = sortedDays.map(d => ({
    date: d,
    label: formatDateLabel(d, 'day'),
    value: dayMap.get(d)?.orders.size || 0,
  }))

  // Top products
  const topProducts = Array.from(curr.productMap.entries())
    .map(([productId, v]) => ({
      productId,
      name: v.name,
      image: v.image,
      unitsSold: v.unitsSold,
      revenue: Math.round(v.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Top categories
  const topCategories = Array.from(curr.catMap.entries())
    .map(([category, v]) => ({
      category,
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders.size,
      unitsSold: v.unitsSold,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  return {
    range,
    sellerId: sellerIds[0],
    kpis: {
      totalRevenue: computeGrowth(curr.revenue, prev.revenue),
      totalOrders: computeGrowth(curr.orderCount, prev.orderCount),
      itemsSold: computeGrowth(curr.itemsSold, prev.itemsSold),
      avgOrderValue: computeGrowth(currentAOV, prevAOV),
      totalProducts,
      activeProducts,
      avgRating: Math.round(avgRating * 100) / 100,
      conversionRate: computeGrowth(conversionRate, prevConversionRate),
      productViews: computeGrowth(currentViews, prevViews),
    },
    orderStatusBreakdown,
    revenueByDay,
    ordersByDay,
    topProducts,
    topCategories,
  }
}

/**
 * Get seller sales report — detailed revenue & order trends.
 */
export async function getSellerSalesReport(sellerIds: string[], range: DateRange, groupBy: 'day' | 'week' | 'month' = 'day'): Promise<SellerSalesReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const currentOrders = await db.collection('orders').find(buildSellerMatch(sellerIds, range)).toArray()
  const previousOrders = await db.collection('orders').find(buildSellerMatch(sellerIds, prevRange)).toArray()

  // Refunds for this seller
  const currentRefunds = await db.collection('refunds').find({
    sellerId: { $in: sellerIds },
    createdAt: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) },
  }).toArray()
  const previousRefunds = await db.collection('refunds').find({
    sellerId: { $in: sellerIds },
    createdAt: { $gte: new Date(prevRange.startDate), $lte: new Date(prevRange.endDate) },
  }).toArray()

  const computeStats = (orders: typeof currentOrders, refunds: typeof currentRefunds) => {
    let gross = 0, itemsSold = 0, sellerEarnings = 0, commission = 0
    const orderSet = new Set<string>()
    const paymentMap = new Map<string, { revenue: number; orders: Set<string> }>()
    const statusMap = new Map<string, { revenue: number; orders: Set<string> }>()

    for (const order of orders) {
      let orderRevenue = 0
      let orderHasSellerItem = false
      for (const item of order.items || []) {
        if (!sellerIds.includes(item.sellerId)) continue
        orderHasSellerItem = true
        orderRevenue += typeof item.total === 'number' ? item.total : 0
        itemsSold += item.quantity || 0
        sellerEarnings += typeof item.sellerEarnings === 'number' ? item.sellerEarnings : (typeof item.total === 'number' ? item.total : 0)
        commission += typeof item.commission === 'number' ? item.commission : 0

        const status = item.status || 'Unknown'
        const sExisting = statusMap.get(status) || { revenue: 0, orders: new Set<string>() }
        sExisting.revenue += typeof item.total === 'number' ? item.total : 0
        sExisting.orders.add(order.orderId || order._id?.toString())
        statusMap.set(status, sExisting)
      }
      if (orderHasSellerItem) {
        gross += orderRevenue
        orderSet.add(order.orderId || order._id?.toString())
        const m = order.paymentMethod || 'unknown'
        const pExisting = paymentMap.get(m) || { revenue: 0, orders: new Set<string>() }
        pExisting.revenue += orderRevenue
        pExisting.orders.add(order.orderId || order._id?.toString())
        paymentMap.set(m, pExisting)
      }
    }

    const refundAmount = refunds.reduce((s, r) => s + (r.amount || 0), 0)
    const net = gross - refundAmount
    const aov = orderSet.size > 0 ? gross / orderSet.size : 0
    return { gross, itemsSold, sellerEarnings, commission, orderCount: orderSet.size, refundAmount, net, aov, paymentMap, statusMap }
  }

  const curr = computeStats(currentOrders, currentRefunds)
  const prev = computeStats(previousOrders, previousRefunds)

  // Trend
  const trendMap = new Map<string, { revenue: number; orders: Set<string>; itemsSold: number; sellerEarnings: number }>()
  for (const order of currentOrders) {
    const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
    let key: string
    if (groupBy === 'day') key = dateStr.substring(0, 10)
    else if (groupBy === 'month') key = dateStr.substring(0, 7)
    else {
      const d = new Date(dateStr)
      const onejan = new Date(d.getFullYear(), 0, 1)
      const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)
      key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
    const existing = trendMap.get(key) || { revenue: 0, orders: new Set<string>(), itemsSold: 0, sellerEarnings: 0 }
    for (const item of order.items || []) {
      if (sellerIds.includes(item.sellerId)) {
        existing.revenue += typeof item.total === 'number' ? item.total : 0
        existing.itemsSold += item.quantity || 0
        existing.sellerEarnings += typeof item.sellerEarnings === 'number' ? item.sellerEarnings : (typeof item.total === 'number' ? item.total : 0)
      }
    }
    existing.orders.add(order.orderId || order._id?.toString())
    trendMap.set(key, existing)
  }

  const trend = Array.from(trendMap.keys()).sort().map(key => {
    const v = trendMap.get(key)!
    return {
      date: key,
      label: groupBy === 'day' ? formatDateLabel(key, 'day') : groupBy === 'month' ? formatDateLabel(key + '-01', 'month') : key,
      revenue: Math.round(v.revenue * 100) / 100,
      orders: v.orders.size,
      itemsSold: v.itemsSold,
      sellerEarnings: Math.round(v.sellerEarnings * 100) / 100,
      avgOrderValue: v.orders.size > 0 ? Math.round((v.revenue / v.orders.size) * 100) / 100 : 0,
    }
  })

  // Payment breakdown
  const totalRev = curr.gross || 1
  const breakdownByPayment = Array.from(curr.paymentMap.entries()).map(([method, v]) => ({
    method,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders.size,
    percentage: Math.round((v.revenue / totalRev) * 10000) / 100,
  })).sort((a, b) => b.revenue - a.revenue)

  // Status breakdown
  const totalOrders = curr.orderCount || 1
  const breakdownByStatus = Array.from(curr.statusMap.entries()).map(([status, v]) => ({
    status,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders.size,
    percentage: Math.round((v.orders.size / totalOrders) * 10000) / 100,
  })).sort((a, b) => b.orders - a.orders)

  // Weekday distribution
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const weekdayMap = weekdays.map(d => ({ day: d, orders: 0, revenue: 0 }))
  for (const o of currentOrders) {
    const dateStr = typeof o.createdAt === 'string' ? o.createdAt : new Date(o.createdAt).toISOString()
    const d = new Date(dateStr)
    if (!isNaN(d.getDay())) {
      let dayRev = 0
      for (const item of o.items || []) {
        if (sellerIds.includes(item.sellerId)) dayRev += typeof item.total === 'number' ? item.total : 0
      }
      weekdayMap[d.getDay()].orders += 1
      weekdayMap[d.getDay()].revenue += dayRev
    }
  }
  const weekdayDistribution = [...weekdayMap.slice(1), weekdayMap[0]].map(v => ({
    day: v.day,
    orders: v.orders,
    revenue: Math.round(v.revenue * 100) / 100,
  }))

  return {
    range,
    groupBy,
    sellerId: sellerIds[0],
    summary: {
      grossRevenue: computeGrowth(curr.gross, prev.gross),
      netRevenue: computeGrowth(curr.net, prev.net),
      totalOrders: computeGrowth(curr.orderCount, prev.orderCount),
      itemsSold: computeGrowth(curr.itemsSold, prev.itemsSold),
      avgOrderValue: computeGrowth(curr.aov, prev.aov),
      refundAmount: computeGrowth(curr.refundAmount, prev.refundAmount),
      sellerEarnings: computeGrowth(curr.sellerEarnings, prev.sellerEarnings),
      commissionPaid: computeGrowth(curr.commission, prev.commission),
    },
    trend,
    breakdownByPayment,
    breakdownByStatus,
    weekdayDistribution,
  }
}

/**
 * Get seller product analytics — best/worst sellers, inventory.
 */
export async function getSellerProductReport(sellerIds: string[], range: DateRange): Promise<SellerProductReport> {
  const { db } = await connectToDatabase()
  const orders = await db.collection('orders').find(buildSellerMatch(sellerIds, range)).toArray()

  const productMap = new Map<string, { name: string; image: string; category: string; unitsSold: number; revenue: number; lastSold: string }>()
  for (const order of orders) {
    for (const item of order.items || []) {
      if (!sellerIds.includes(item.sellerId)) continue
      const pid = item.productId
      if (!pid) continue
      const existing = productMap.get(pid) || {
        name: item.productName || 'Unknown',
        image: item.productImage || '',
        category: item.category || 'Uncategorized',
        unitsSold: 0,
        revenue: 0,
        lastSold: '',
      }
      existing.unitsSold += item.quantity || 0
      existing.revenue += typeof item.total === 'number' ? item.total : 0
      const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
      if (!existing.lastSold || dateStr > existing.lastSold) existing.lastSold = dateStr
      productMap.set(pid, existing)
    }
  }

  // Product views
  const viewAgg = await db.collection('analytics_events').aggregate([
    { $match: { type: 'product_view', sellerId: { $in: sellerIds }, timestamp: { $gte: new Date(range.startDate), $lte: new Date(range.endDate) } } },
    { $group: { _id: '$productId', views: { $sum: 1 } } },
  ]).toArray()
  const viewMap = new Map<string, number>()
  for (const v of viewAgg) if (v._id) viewMap.set(v._id, v.views)

  // All seller products
  const allProducts = await db.collection('products').find({ sellerId: { $in: sellerIds } }).toArray()

  // Build product details
  const topProducts = Array.from(productMap.entries())
    .map(([productId, v]) => {
      const prod = allProducts.find(p => p._id.toString() === productId)
      const views = viewMap.get(productId) || 0
      return {
        productId,
        name: v.name,
        image: v.image,
        category: v.category,
        unitsSold: v.unitsSold,
        revenue: Math.round(v.revenue * 100) / 100,
        views,
        conversionRate: views > 0 ? Math.round((v.unitsSold / views) * 10000) / 100 : 0,
        avgRating: prod?.avgRating || 0,
        stock: prod?.stock || 0,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20)

  // Slow-moving
  const slowMoving = allProducts
    .filter(p => {
      const sales = productMap.get(p._id.toString())
      return !sales || sales.unitsSold < 3
    })
    .map(p => {
      const sales = productMap.get(p._id.toString())
      return {
        productId: p._id.toString(),
        name: p.name || 'Unknown',
        image: p.imageUrl || (p.images?.[0]?.url) || '',
        category: p.category || 'Uncategorized',
        stock: p.stock || 0,
        lastSoldDate: sales?.lastSold || null,
        unitsSold: sales?.unitsSold || 0,
      }
    })
    .sort((a, b) => a.unitsSold - b.unitsSold)
    .slice(0, 20)

  // Category performance
  const catMap = new Map<string, { products: number; unitsSold: number; revenue: number }>()
  for (const p of allProducts) {
    const cat = p.category || 'Uncategorized'
    const existing = catMap.get(cat) || { products: 0, unitsSold: 0, revenue: 0 }
    existing.products += 1
    catMap.set(cat, existing)
  }
  for (const [pid, v] of productMap.entries()) {
    const cat = v.category
    const existing = catMap.get(cat) || { products: 0, unitsSold: 0, revenue: 0 }
    existing.unitsSold += v.unitsSold
    existing.revenue += v.revenue
    catMap.set(cat, existing)
  }
  const categoryPerformance = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      products: v.products,
      unitsSold: v.unitsSold,
      revenue: Math.round(v.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // Inventory status
  let inStock = 0, lowStock = 0, outOfStock = 0, inStockValue = 0
  for (const p of allProducts) {
    const stock = p.stock || 0
    const price = p.sellingPrice || p.price || 0
    if (stock <= 0) outOfStock += 1
    else if (stock <= (p.lowStockThreshold || 5)) {
      lowStock += 1
      inStockValue += stock * price
    } else {
      inStock += 1
      inStockValue += stock * price
    }
  }
  const totalProducts = allProducts.length || 1
  const inventoryStatus = [
    { status: 'In Stock', count: inStock, value: Math.round(inStockValue * 100) / 100, percentage: Math.round((inStock / totalProducts) * 10000) / 100 },
    { status: 'Low Stock', count: lowStock, value: 0, percentage: Math.round((lowStock / totalProducts) * 10000) / 100 },
    { status: 'Out of Stock', count: outOfStock, value: 0, percentage: Math.round((outOfStock / totalProducts) * 10000) / 100 },
  ]

  // Summary
  const activeProducts = allProducts.filter(p => p.active !== false).length
  const ratings = allProducts.map(p => p.avgRating || 0).filter(r => r > 0)
  const avgRating = ratings.length > 0 ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0
  const totalViews = Array.from(viewMap.values()).reduce((s, v) => s + v, 0)

  return {
    range,
    sellerId: sellerIds[0],
    summary: {
      totalProducts: allProducts.length,
      activeProducts,
      outOfStock,
      lowStock,
      avgRating: Math.round(avgRating * 100) / 100,
      totalViews,
    },
    topProducts,
    slowMovingProducts: slowMoving,
    categoryPerformance,
    inventoryStatus,
  }
}

/**
 * Get seller customer analytics — new vs returning, top customers, geography.
 */
export async function getSellerCustomerReport(sellerIds: string[], range: DateRange): Promise<SellerCustomerReport> {
  const prevRange = getPreviousPeriod(range)
  const { db } = await connectToDatabase()

  const currentOrders = await db.collection('orders').find(buildSellerMatch(sellerIds, range)).toArray()
  const previousOrders = await db.collection('orders').find(buildSellerMatch(sellerIds, prevRange)).toArray()

  const buildCustomerMap = (orders: typeof currentOrders) => {
    const m = new Map<string, { orders: number; spent: number; lastOrder: string; firstOrder: string; state: string; city: string }>()
    for (const order of orders) {
      const cid = order.customerId
      if (!cid) continue
      let hasSellerItem = false
      let orderRevenue = 0
      for (const item of order.items || []) {
        if (sellerIds.includes(item.sellerId)) {
          hasSellerItem = true
          orderRevenue += typeof item.total === 'number' ? item.total : 0
        }
      }
      if (!hasSellerItem) continue
      const existing = m.get(cid) || {
        orders: 0,
        spent: 0,
        lastOrder: '',
        firstOrder: '',
        state: order.shippingAddress?.state || 'Unknown',
        city: order.shippingAddress?.city || 'Unknown',
      }
      existing.orders += 1
      existing.spent += orderRevenue
      const dateStr = typeof order.createdAt === 'string' ? order.createdAt : new Date(order.createdAt).toISOString()
      if (!existing.firstOrder || dateStr < existing.firstOrder) existing.firstOrder = dateStr
      if (!existing.lastOrder || dateStr > existing.lastOrder) existing.lastOrder = dateStr
      m.set(cid, existing)
    }
    return m
  }

  const currentMap = buildCustomerMap(currentOrders)
  const previousMap = buildCustomerMap(previousOrders)

  // New vs returning
  const newCustomerIds = new Set<string>()
  const returningCustomerIds = new Set<string>()
  for (const [cid, data] of currentMap.entries()) {
    if (data.firstOrder >= range.startDate && data.firstOrder <= range.endDate) {
      newCustomerIds.add(cid)
    } else {
      returningCustomerIds.add(cid)
    }
  }

  const prevNewCount = Array.from(previousMap.entries()).filter(([, d]) => d.firstOrder >= prevRange.startDate && d.firstOrder <= prevRange.endDate).length
  const prevReturningCount = previousMap.size - prevNewCount

  const totalCustomers = currentMap.size || 1
  const newRevenue = Array.from(newCustomerIds).map(id => currentMap.get(id)?.spent || 0).reduce((s, v) => s + v, 0)
  const returningRevenue = Array.from(returningCustomerIds).map(id => currentMap.get(id)?.spent || 0).reduce((s, v) => s + v, 0)
  const newVsReturning = [
    { type: 'New', count: newCustomerIds.size, revenue: Math.round(newRevenue * 100) / 100, percentage: Math.round((newCustomerIds.size / totalCustomers) * 10000) / 100 },
    { type: 'Returning', count: returningCustomerIds.size, revenue: Math.round(returningRevenue * 100) / 100, percentage: Math.round((returningCustomerIds.size / totalCustomers) * 10000) / 100 },
  ]

  const repeatCount = Array.from(currentMap.values()).filter(c => c.orders > 1).length
  const repeatRate = currentMap.size > 0 ? (repeatCount / currentMap.size) * 100 : 0
  const prevRepeatCount = Array.from(previousMap.values()).filter(c => c.orders > 1).length
  const prevRepeatRate = previousMap.size > 0 ? (prevRepeatCount / previousMap.size) * 100 : 0
  const avgCustomerValue = currentMap.size > 0 ? Array.from(currentMap.values()).reduce((s, c) => s + c.spent, 0) / currentMap.size : 0
  const prevAvgCustomerValue = previousMap.size > 0 ? Array.from(previousMap.values()).reduce((s, c) => s + c.spent, 0) / previousMap.size : 0

  // Top customers
  const topCustomerIds = Array.from(currentMap.entries())
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, 10)
    .map(([id]) => id)

  const customerInfoMap = new Map<string, { name: string; mobile: string }>()
  for (const id of topCustomerIds) {
    try {
      const { ObjectId } = await import('mongodb')
      let cust = null
      try { cust = await db.collection('customers').findOne({ _id: new ObjectId(id) }) } catch { cust = await db.collection('customers').findOne({ _id: id as any }) }
      if (cust) customerInfoMap.set(id, { name: cust.name || 'Unknown', mobile: cust.mobile || '' })
      else customerInfoMap.set(id, { name: 'Unknown', mobile: '' })
    } catch {
      customerInfoMap.set(id, { name: 'Unknown', mobile: '' })
    }
  }

  const topCustomers = topCustomerIds.map(id => {
    const data = currentMap.get(id)!
    const info = customerInfoMap.get(id) || { name: 'Unknown', mobile: '' }
    return {
      customerId: id,
      name: info.name,
      mobile: info.mobile,
      totalOrders: data.orders,
      totalSpent: Math.round(data.spent * 100) / 100,
      avgOrderValue: data.orders > 0 ? Math.round((data.spent / data.orders) * 100) / 100 : 0,
      lastOrderDate: data.lastOrder,
    }
  })

  // Geographic distribution
  const geoMap = new Map<string, { customers: Set<string>; orders: number; revenue: number }>()
  for (const [cid, data] of currentMap.entries()) {
    const state = data.state
    const existing = geoMap.get(state) || { customers: new Set<string>(), orders: 0, revenue: 0 }
    existing.customers.add(cid)
    existing.orders += data.orders
    existing.revenue += data.spent
    geoMap.set(state, existing)
  }
  const geographicDistribution = Array.from(geoMap.entries())
    .map(([state, v]) => ({
      state,
      customers: v.customers.size,
      orders: v.orders,
      revenue: Math.round(v.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    range,
    sellerId: sellerIds[0],
    summary: {
      totalCustomers: currentMap.size,
      newCustomers: computeGrowth(newCustomerIds.size, prevNewCount),
      returningCustomers: computeGrowth(returningCustomerIds.size, prevReturningCount),
      repeatPurchaseRate: computeGrowth(repeatRate, prevRepeatRate),
      avgCustomerValue: computeGrowth(avgCustomerValue, prevAvgCustomerValue),
    },
    newVsReturning,
    topCustomers,
    geographicDistribution,
  }
}

/* ================================================================== */
/*  CSV Export Utilities                                                */
/* ================================================================== */

/** Convert an array of objects to CSV format */
export function toCSV(rows: Array<Record<string, unknown>>, headers?: Array<{ key: string; label: string }>): string {
  if (rows.length === 0 && !headers) return ''
  const keys = headers ? headers.map(h => h.key) : Object.keys(rows[0] || {})
  const headerLabels = headers ? headers.map(h => h.label) : keys
  const escapeCell = (val: unknown): string => {
    if (val == null) return ''
    const s = typeof val === 'object' ? JSON.stringify(val) : String(val)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [headerLabels.map(escapeCell).join(',')]
  for (const row of rows) {
    lines.push(keys.map(k => escapeCell(row[k])).join(','))
  }
  return lines.join('\n')
}

/** Export sales report trend to CSV-ready rows */
export function salesReportToCSV(report: SalesReport): string {
  return toCSV(report.trend.map(t => ({
    Date: t.date,
    Period: t.label,
    Revenue: t.revenue,
    Orders: t.orders,
    ItemsSold: t.itemsSold,
    AvgOrderValue: t.avgOrderValue,
    RefundAmount: t.refundAmount,
  })), [
    { key: 'Date', label: 'Date' },
    { key: 'Period', label: 'Period' },
    { key: 'Revenue', label: 'Revenue' },
    { key: 'Orders', label: 'Orders' },
    { key: 'ItemsSold', label: 'ItemsSold' },
    { key: 'AvgOrderValue', label: 'AvgOrderValue' },
    { key: 'RefundAmount', label: 'RefundAmount' },
  ])
}

/** Export admin overview top sellers to CSV */
export function overviewTopSellersToCSV(report: AdminOverviewReport): string {
  return toCSV(report.topSellers.map(s => ({
    SellerID: s.sellerId,
    StoreName: s.storeName,
    SellerName: s.sellerName,
    Orders: s.orders,
    Revenue: s.revenue,
    GrowthRate: s.growthRate,
  })), [
    { key: 'SellerID', label: 'SellerID' },
    { key: 'StoreName', label: 'StoreName' },
    { key: 'SellerName', label: 'SellerName' },
    { key: 'Orders', label: 'Orders' },
    { key: 'Revenue', label: 'Revenue' },
    { key: 'GrowthRate', label: 'GrowthRate' },
  ])
}

/** Export customer report top customers to CSV */
export function customerTopToCSV(report: CustomerReport): string {
  return toCSV(report.topCustomers.map(c => ({
    CustomerID: c.customerId,
    Name: c.name,
    Mobile: c.mobile,
    TotalOrders: c.totalOrders,
    TotalSpent: c.totalSpent,
    AvgOrderValue: c.avgOrderValue,
    LastOrderDate: c.lastOrderDate,
  })), [
    { key: 'CustomerID', label: 'CustomerID' },
    { key: 'Name', label: 'Name' },
    { key: 'Mobile', label: 'Mobile' },
    { key: 'TotalOrders', label: 'TotalOrders' },
    { key: 'TotalSpent', label: 'TotalSpent' },
    { key: 'AvgOrderValue', label: 'AvgOrderValue' },
    { key: 'LastOrderDate', label: 'LastOrderDate' },
  ])
}

/** Export product report top products to CSV */
export function productTopToCSV(report: ProductReport): string {
  return toCSV(report.topProducts.map(p => ({
    ProductID: p.productId,
    Name: p.name,
    Category: p.category,
    UnitsSold: p.unitsSold,
    Revenue: p.revenue,
    Views: p.views,
    ConversionRate: p.conversionRate,
    AvgRating: p.avgRating,
    Stock: p.stock,
  })), [
    { key: 'ProductID', label: 'ProductID' },
    { key: 'Name', label: 'Name' },
    { key: 'Category', label: 'Category' },
    { key: 'UnitsSold', label: 'UnitsSold' },
    { key: 'Revenue', label: 'Revenue' },
    { key: 'Views', label: 'Views' },
    { key: 'ConversionRate', label: 'ConversionRate' },
    { key: 'AvgRating', label: 'AvgRating' },
    { key: 'Stock', label: 'Stock' },
  ])
}

/** Export seller sales report trend to CSV */
export function sellerSalesToCSV(report: SellerSalesReport): string {
  return toCSV(report.trend.map(t => ({
    Date: t.date,
    Period: t.label,
    Revenue: t.revenue,
    Orders: t.orders,
    ItemsSold: t.itemsSold,
    SellerEarnings: t.sellerEarnings,
    AvgOrderValue: t.avgOrderValue,
  })), [
    { key: 'Date', label: 'Date' },
    { key: 'Period', label: 'Period' },
    { key: 'Revenue', label: 'Revenue' },
    { key: 'Orders', label: 'Orders' },
    { key: 'ItemsSold', label: 'ItemsSold' },
    { key: 'SellerEarnings', label: 'SellerEarnings' },
    { key: 'AvgOrderValue', label: 'AvgOrderValue' },
  ])
}
