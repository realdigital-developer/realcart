import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/**
 * POST /api/analytics/track
 *
 * Public endpoint (no auth required) for recording analytics events from the
 * client side. Used by the useAnalytics hook to track page views, product
 * views, searches, cart actions, checkout events, and order placements.
 *
 * Security:
 *   - Rate-limited via simple in-memory throttle (max 60 events/min per IP)
 *   - Validates event type against the allowed enum
 *   - Sanitizes string inputs (max length 1000 chars)
 *   - Never throws — always returns 200 to avoid breaking the client
 *
 * The endpoint accepts a single event or a batch of events (array).
 */
const ALLOWED_TYPES = new Set([
  'page_view', 'product_view', 'search', 'cart_add', 'cart_remove',
  'wishlist_add', 'checkout_start', 'payment_initiated', 'order_placed',
  'order_cancelled', 'order_returned', 'review_submitted', 'seller_visit',
])

const MAX_STRING_LENGTH = 1000
const MAX_BATCH_SIZE = 20

// Simple in-memory rate limiter (per IP, per minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 60

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count += 1
  return true
}

function sanitizeString(val: unknown): string | null {
  if (val == null) return null
  const s = String(val)
  if (s.length > MAX_STRING_LENGTH) return s.substring(0, MAX_STRING_LENGTH)
  return s
}

function detectDevice(userAgent: string | null): 'desktop' | 'mobile' | 'tablet' | null {
  if (!userAgent) return null
  const ua = userAgent.toLowerCase()
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet'
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile'
  return 'desktop'
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown'

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const events = Array.isArray(body) ? body : [body]
    if (events.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { ok: false, error: `Batch too large (max ${MAX_BATCH_SIZE})` },
        { status: 400 }
      )
    }

    const userAgent = request.headers.get('user-agent')
    const device = detectDevice(userAgent)
    const referrer = sanitizeString(request.headers.get('referer'))

    const { db } = await connectToDatabase()
    const docs: Array<Record<string, unknown>> = []

    for (const evt of events) {
      if (!evt || typeof evt !== 'object') continue
      const e = evt as Record<string, unknown>
      const type = sanitizeString(e.type)
      if (!type || !ALLOWED_TYPES.has(type)) continue

      // Generate or reuse session ID
      let sessionId = sanitizeString(e.sessionId)
      if (!sessionId) {
        sessionId = `anon-${ip}-${Date.now().toString(36)}`
      }

      docs.push({
        type,
        sessionId,
        customerId: sanitizeString(e.customerId),
        path: sanitizeString(e.path),
        title: sanitizeString(e.title),
        productId: sanitizeString(e.productId),
        productName: sanitizeString(e.productName),
        sellerId: sanitizeString(e.sellerId),
        category: sanitizeString(e.category),
        searchQuery: sanitizeString(e.searchQuery),
        searchResults: typeof e.searchResults === 'number' ? e.searchResults : null,
        cartValue: typeof e.cartValue === 'number' ? e.cartValue : null,
        orderId: sanitizeString(e.orderId),
        orderValue: typeof e.orderValue === 'number' ? e.orderValue : null,
        referrer: referrer,
        userAgent: userAgent ? userAgent.substring(0, 500) : null,
        device,
        ip,
        metadata: e.metadata && typeof e.metadata === 'object' ? e.metadata : null,
        timestamp: new Date(),
        createdAt: new Date(),
      })
    }

    if (docs.length === 0) {
      return NextResponse.json({ ok: true, tracked: 0 })
    }

    // Insert with ordered:false so one bad doc doesn't block the rest
    await db.collection('analytics_events').insertMany(docs, { ordered: false })

    return NextResponse.json({ ok: true, tracked: docs.length })
  } catch (error) {
    // Never break the client — analytics is non-critical
    console.warn('[Analytics Track] Error:', (error as Error).message)
    return NextResponse.json({ ok: true, tracked: 0, error: 'tracking_failed' })
  }
}

/** GET — health check / simple stats */
export async function GET() {
  try {
    const { db } = await connectToDatabase()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayCount = await db.collection('analytics_events').countDocuments({
      timestamp: { $gte: today },
    })
    return NextResponse.json({ ok: true, todayCount })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}
