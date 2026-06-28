import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { cacheOrCompute } from '@/lib/server-cache'

const CATEGORIES_COLLECTION = 'categories'
const HIGHLIGHTS_COLLECTION = 'highlights'

// Always re-render this route — we rely on our own in-memory cache
// (cacheOrCompute with 60s TTL) + cacheInvalidate() on admin mutations.
// Setting revalidate=0 ensures the Next.js route cache never serves stale
// data when the admin reorders categories.
export const revalidate = 0

/**
 * GET /api/categories
 * Public endpoint — no auth required.
 * Returns only Active parent categories with their active subcategories.
 */
export async function GET() {
  try {
    // Cache the entire categories response for 5 minutes
    // Key version bumped to v2 when displayOrder sorting was added — ensures
    // no stale v1 cache (sorted by name only) is served.
    const categories = await cacheOrCompute('public:categories:v2', async () => {
      const { db } = await connectToDatabase()

      // ── Resolve all active highlights: ObjectId string → name ──
      const allHighlights = await db.collection(HIGHLIGHTS_COLLECTION)
        .find({
          $or: [
            { status: 'Active' },
            { status: { $exists: false } },
          ],
        })
        .project({ name: 1 })
        .toArray()

      const highlightNameMap = new Map<string, string>()
      for (const hl of allHighlights) {
        highlightNameMap.set(hl._id.toString(), hl.name)
      }

      // ── Fetch parent categories ──
      // Sort by displayOrder (admin-controlled ordering) ascending, then by
      // name ascending as a fallback for categories without displayOrder set.
      const parentCats = await db.collection(CATEGORIES_COLLECTION)
        .find({
          $and: [
            {
              $or: [
                { parentCategory: 'None' },
                { parentCategory: { $exists: false } },
                { parentCategory: null },
              ],
            },
            {
              $or: [
                { status: 'Active' },
                { status: { $exists: false } },
              ],
            },
          ],
        }, {
          projection: { name: 1, description: 1, imageUrl: 1, displayOrder: 1 },
        })
        .sort({ displayOrder: 1, name: 1 })
        .toArray()

      // ── Fetch subcategories ──
      // Same sort: displayOrder first, then name.
      const subCats = await db.collection(CATEGORIES_COLLECTION)
        .find({
          $and: [
            {
              $and: [
                { parentCategory: { $ne: 'None' } },
                { parentCategory: { $exists: true } },
                { parentCategory: { $ne: null } },
              ],
            },
            {
              $or: [
                { status: 'Active' },
                { status: { $exists: false } },
              ],
            },
          ],
        }, {
          projection: { name: 1, description: 1, imageUrl: 1, parentCategory: 1, highlights: 1, displayOrder: 1 },
        })
        .sort({ displayOrder: 1, name: 1 })
        .toArray()

      // Group subcategories by parent name
      const subcategoryMap: Record<string, typeof subCats> = {}
      for (const sub of subCats) {
        const parentName = sub.parentCategory
        if (!subcategoryMap[parentName]) {
          subcategoryMap[parentName] = []
        }
        subcategoryMap[parentName].push(sub)
      }

      // Build the hierarchical response with resolved highlight names
      return parentCats.map((cat) => ({
        _id: cat._id.toString(),
        name: cat.name || '',
        description: cat.description || '',
        imageUrl: cat.imageUrl || null,
        subcategories: (subcategoryMap[cat.name] || []).map((sub) => {
          const highlightNames: string[] = []
          if (Array.isArray(sub.highlights)) {
            for (const hlId of sub.highlights) {
              const hlName = highlightNameMap.get(String(hlId))
              if (hlName) {
                highlightNames.push(hlName)
              }
            }
          }

          return {
            _id: sub._id.toString(),
            name: sub.name || '',
            description: sub.description || '',
            imageUrl: sub.imageUrl || null,
            highlights: highlightNames,
          }
        }),
      }))
    }, 30_000) // 30-second cache — short enough that admin reorders propagate
                 // quickly to customer-facing pages, long enough to absorb
                 // burst traffic. The admin PATCH/POST/PUT/DELETE handlers
                 // also call cacheInvalidate('public:categories') for instant
                 // propagation.

    return NextResponse.json({ categories })
  } catch (error) {
    console.error('[Public Categories GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}
