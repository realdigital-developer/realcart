import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { cacheOrCompute } from '@/lib/server-cache'

const HERO_SLIDES_COLLECTION = 'hero_slides'

// Never cache at the Next.js route level — we use our own in-memory cache
// + cacheInvalidate() on admin mutations.
export const revalidate = 0

/**
 * GET /api/hero-slides
 * Public endpoint — no auth required.
 *
 * Returns only Active hero slides, sorted by displayOrder, with scheduling
 * (startDate / endDate) applied. Each slide contains:
 *   - _id
 *   - title        (internal identifier — not shown to customers)
 *   - imageUrl     (the high-resolution predesigned banner image)
 *   - redirectUrl  (the page/URL the customer navigates to on click)
 *
 * The customer hero slider renders the imageUrl as a full-bleed clickable
 * banner — no text overlay, no gradient. The admin uploads a fully-designed
 * banner and the customer sees it as-is.
 */
export async function GET() {
  try {
    const slides = await cacheOrCompute('public:hero-slides:v1', async () => {
      const { db } = await connectToDatabase()

      const now = new Date()

      // Fetch all active slides, sorted by displayOrder
      const allSlides = await db.collection(HERO_SLIDES_COLLECTION)
        .find({
          $or: [
            { status: 'Active' },
            { status: { $exists: false } },
          ],
        })
        .sort({ displayOrder: 1, createdAt: -1 })
        .toArray()

      // Filter by scheduling — only show slides within their date range
      // (slides without startDate/endDate are always shown)
      const visibleSlides = allSlides.filter((s) => {
        const start = s.startDate ? new Date(s.startDate) : null
        const end = s.endDate ? new Date(s.endDate) : null
        if (start && now < start) return false
        if (end && now > end) return false
        return true
      })

      return visibleSlides.map((s) => ({
        _id: s._id.toString(),
        title: s.title || '',
        imageUrl: s.imageUrl || null,
        redirectUrl: s.redirectUrl || '',
      }))
    }, 30_000) // 30-second cache

    return NextResponse.json({ slides })
  } catch (error) {
    console.error('[Public Hero Slides GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch hero slides', slides: [] }, { status: 500 })
  }
}
