import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { cacheOrCompute } from '@/lib/server-cache'
import {
  computePriceInfo,
  productToListItem,
  generateProductStructuredData,
  getBestImageUrl,
  normalizeProductImages,
} from '@/lib/product-utils'
import type {
  ProductListItem,
  ProductDetailItem,
  ProductImage,
  SpecificationGroup,
  ProductShipping,
  ProductSEO,
  SizeChart,
} from '@/lib/product-types'

/* ------------------------------------------------------------------ */
/*  GET /api/products/[id]                                              */
/*  Public endpoint — no auth required.                                 */
/*  Returns full product details for the customer storefront.           */
/*  Supports lookup by _id OR slug (SEO-friendly URLs).                 */
/* ------------------------------------------------------------------ */

// Next.js route-level cache: 60 seconds
export const revalidate = 60

/** Base filter for customer-visible products */
const BASE_FILTER = { status: 'Published', active: true }

/**
 * Resolve the `id` param to a MongoDB query filter.
 * If it's a valid ObjectId → match by _id.
 * Otherwise → treat it as a slug.
 */
function resolveIdToFilter(id: string): Record<string, unknown> {
  if (ObjectId.isValid(id) && new ObjectId(id).toString() === id) {
    return { ...BASE_FILTER, _id: new ObjectId(id) }
  }
  // Treat as slug for SEO-friendly URLs
  return { ...BASE_FILTER, slug: id }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    if (!id || id.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid product identifier' }, { status: 400 })
    }

    const filter = resolveIdToFilter(id)

    // Cache product detail for 2 minutes — product data rarely changes between views
    const result = await cacheOrCompute(`product:${id}:v2`, async () => {
      const { db } = await connectToDatabase()

      const product = await db.collection('products').findOne(filter)

      if (!product) return null

      // ── Batch-fetch rating summary ──
      const ratingSummary = await db.collection('product_rating_summary').findOne(
        { productId: product._id.toString() },
      )
      const ratingData = ratingSummary
        ? { avgRating: ratingSummary.avgRating || 0, totalReviews: ratingSummary.totalReviews || 0 }
        : undefined

      // ── Build list-item base via shared utility ──
      const listItem = productToListItem(product, ratingData)

      // ── Compose full detail from product doc ──
      const images = normalizeProductImages(product.images, product.imageUrl, product.name as string)
      const videoUrl = (product.videoUrl as string) || ''

      const specifications = (product.specifications as SpecificationGroup[]) || []
      const sizeChart = (product.sizeChart as SizeChart) || null
      const shipping = product.shipping as ProductShipping | undefined
      const warranty = (product.warranty as string) || ''
      const seo = product.seo as ProductSEO | undefined
      const returnPolicy = (product.returnPolicy as string) || ''
      const approvalNotes = (product.approvalNotes as string) || ''
      const approvedAt = product.approvedAt instanceof Date
        ? product.approvedAt.toISOString()
        : (product.approvedAt as string) || null
      const publishedAt = product.publishedAt instanceof Date
        ? product.publishedAt.toISOString()
        : (product.publishedAt as string) || null

      // ── JSON-LD structured data for SEO ──
      const priceInfo = computePriceInfo({
        mrp: product.mrp as number | undefined,
        sellingPrice: product.sellingPrice as number | undefined,
        specialPrice: product.specialPrice as number | undefined,
        specialPriceStartDate: product.specialPriceStartDate as string | null | undefined,
        specialPriceEndDate: product.specialPriceEndDate as string | null | undefined,
        hsnCode: (product.shipping as any)?.hsnCode as string | undefined,
        gstRate: (product.shipping as any)?.gstRate as number | undefined,
      })

      const structuredData = generateProductStructuredData({
        name: product.name as string,
        description: product.description as string,
        brand: product.brand as string,
        mrp: product.mrp as number,
        sellingPrice: product.sellingPrice as number,
        effectivePrice: priceInfo.effectivePrice,
        imageUrl: getBestImageUrl({ images, imageUrl: product.imageUrl as string }),
        images,
        avgRating: listItem.avgRating,
        totalReviews: listItem.totalReviews,
        seller: product.seller as string,
        category: product.category as string,
        slug: product.slug as string,
      })

      const productDetail: ProductDetailItem = {
        ...listItem,
        images,
        videoUrl,
        specifications,
        sizeChart,
        shipping: shipping || {
          weight: 0, length: 0, width: 0, height: 0,
          hsnCode: '', gstRate: 0, deliveryCharge: 0, freeDeliveryAbove: 0,
        },
        warranty,
        seo: seo || {
          metaTitle: '',
          metaDescription: '',
          searchKeywords: [],
          canonicalUrl: '',
        },
        approvalNotes,
        approvedAt,
        publishedAt,
        relatedProducts: [], // populated below
      }

      // ── Related products: same category, sorted by totalSold desc, limit 8 ──
      let relatedProducts: ProductListItem[] = []

      if (product.category) {
        const relatedRaw = await db.collection('products')
          .find({
            ...BASE_FILTER,
            category: product.category,
            _id: { $ne: product._id },
          })
          .sort({ totalSold: -1 })
          .limit(8)
          .project({
            name: 1, slug: 1, description: 1, mrp: 1, sellingPrice: 1,
            specialPrice: 1, specialPriceStartDate: 1, specialPriceEndDate: 1,
            category: 1, subcategory: 1, brand: 1,
            images: 1, imageUrl: 1, stock: 1, tags: 1, highlights: 1,
            seller: 1, variants: 1, variantAttributes: 1, trackInventory: 1,
            shipping: 1, returnPolicy: 1, totalSold: 1, viewCount: 1,
            avgRating: 1, totalReviews: 1, seo: 1, createdAt: 1,
          })
          .toArray()

        if (relatedRaw.length > 0) {
          // Batch-fetch rating summaries for related products
          const relatedIds = relatedRaw.map(p => p._id.toString())
          const relatedRatings = await db.collection('product_rating_summary')
            .find({ productId: { $in: relatedIds } })
            .project({ productId: 1, avgRating: 1, totalReviews: 1 })
            .toArray()
          const relatedRatingMap = new Map<string, { avgRating: number; totalReviews: number }>()
          for (const rs of relatedRatings) {
            relatedRatingMap.set(rs.productId, { avgRating: rs.avgRating || 0, totalReviews: rs.totalReviews || 0 })
          }

          relatedProducts = relatedRaw.map(p =>
            productToListItem(p, relatedRatingMap.get(p._id.toString())),
          )
        }
      }

      productDetail.relatedProducts = relatedProducts

      return { product: productDetail, structuredData }
    }, 120_000) // 2-minute cache

    if (!result) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // ── Best-effort viewCount increment (don't await) ──
    // Increment after serving the cached result so we don't slow the response
    const { db } = await connectToDatabase()
    const incFilter = resolveIdToFilter(id)
    db.collection('products').updateOne(
      { ...incFilter, status: 'Published', active: true },
      { $inc: { viewCount: 1 } },
    ).catch(() => { /* best-effort — ignore errors */ })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Product Detail GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}
