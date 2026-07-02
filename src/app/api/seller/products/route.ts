/* ------------------------------------------------------------------ */
/*  Seller Products CRUD API                                           */
/*  Production-level route following Flipkart/Meesho/Amazon patterns   */
/*  Supports full product lifecycle: Draft → Pending → Approved →      */
/*  Published, with rejection & suspension states.                     */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { ObjectId } from 'mongodb'
import { cacheInvalidate } from '@/lib/server-cache'
import { deleteFile } from '@/lib/upload'
import {
  generateSlug,
  generateSEO,
  computeTotalStock,
  validateProductData,
  validateSizeChartData,
  getBestImageUrl,
  normalizeProductImages,
} from '@/lib/product-utils'
import type { ProductDocument, ProductStatus } from '@/lib/product-types'
import {
  recordInitialStock,
  checkAndCreateAlert,
  adjustStock,
} from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  Helper: Convert ObjectId fields to strings for JSON response       */
/* ------------------------------------------------------------------ */

function serializeProduct(product: Record<string, unknown>) {
  // Normalize images: handle string[] from legacy seed data and fallback to imageUrl
  const normalizedImages = normalizeProductImages(product.images, product.imageUrl, product.name as string)

  return {
    ...product,
    _id: (product._id as ObjectId).toString(),
    images: normalizedImages,
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: Build seller match query from aliases                      */
/* ------------------------------------------------------------------ */

function buildSellerMatch(aliases: string[]) {
  return aliases.length === 1 ? aliases[0] : { $in: aliases }
}

/* ------------------------------------------------------------------ */
/*  Helper: Derive legacy fields for backward compatibility            */
/*  - imageUrl: primary image from images array                        */
/*  - price: mapped from mrp for old consumers                        */
/*  - discounts: kept as empty array for compat                       */
/* ------------------------------------------------------------------ */

function buildLegacyFields(product: {
  images?: { url: string; alt: string; publicId: string; isPrimary: boolean }[]
  mrp?: number
}) {
  return {
    imageUrl: getBestImageUrl({ images: product.images }),
    price: product.mrp || 0,
    discounts: [],
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/seller/products                                           */
/*  List seller's products with pagination, search, filters, counts    */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')))
    const skip = (page - 1) * limit

    // Search & Filters
    const search = searchParams.get('search')?.trim() || ''
    const status = searchParams.get('status')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''

    // Build the seller match condition using aliases
    const sellerMatch = buildSellerMatch(session.sellerAliases)

    // Build the base query — always scope to this seller's products
    const query: Record<string, unknown> = { seller: sellerMatch }

    // Text search on name, brand, description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }

    // Filter by status
    if (status && status !== 'all') {
      query.status = status
    }

    // Filter by category — supports comma-separated values for multi-select.
    // The frontend sends EITHER category names OR subcategory names (not both).
    // If subcategories are selected, only subcategory names are sent.
    // If only categories are selected, only category names are sent.
    // We check both fields with $or to handle both cases.
    if (category && category !== 'all') {
      const values = category.split(',').map(v => v.trim()).filter(Boolean)
      if (values.length === 1) {
        query.$or = [
          { category: values[0] },
          { subcategory: values[0] },
        ]
      } else if (values.length > 1) {
        query.$or = [
          { category: { $in: values } },
          { subcategory: { $in: values } },
        ]
      }
    }

    // Run main query + status counts + categories + subcategories in parallel
    const [
      products,
      filteredTotal,
      totalAll,
      draftCount,
      pendingCount,
      approvedCount,
      publishedCount,
      rejectedCount,
      categories,
      subcategories,
    ] = await Promise.all([
      db.collection('products')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('products').countDocuments(query),
      db.collection('products').countDocuments({ seller: sellerMatch }),
      db.collection('products').countDocuments({ seller: sellerMatch, status: 'Draft' }),
      db.collection('products').countDocuments({ seller: sellerMatch, status: 'Pending' }),
      db.collection('products').countDocuments({ seller: sellerMatch, status: 'Approved' }),
      db.collection('products').countDocuments({ seller: sellerMatch, status: 'Published' }),
      db.collection('products').countDocuments({ seller: sellerMatch, status: 'Rejected' }),
      db.collection('products').distinct('category', { seller: sellerMatch }),
      db.collection('products').distinct('subcategory', { seller: sellerMatch }),
    ])

    // Build category → subcategory mapping from the seller's actual products
    const sellerProducts = await db.collection('products')
      .find({ seller: sellerMatch }, { projection: { category: 1, subcategory: 1 } })
      .toArray()
    const categorySubcategoryMap: Record<string, string[]> = {}
    for (const p of sellerProducts) {
      if (p.category) {
        if (!categorySubcategoryMap[p.category]) categorySubcategoryMap[p.category] = []
        if (p.subcategory && !categorySubcategoryMap[p.category].includes(p.subcategory)) {
          categorySubcategoryMap[p.category].push(p.subcategory)
        }
      }
    }

    return NextResponse.json({
      products: products.map(serializeProduct),
      total: filteredTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
      counts: {
        total: totalAll,
        draft: draftCount,
        pending: pendingCount,
        approved: approvedCount,
        published: publishedCount,
        rejected: rejectedCount,
      },
      categories: categories.filter(Boolean).sort(),
      subcategories: subcategories.filter(Boolean).sort(),
      categorySubcategoryMap,
    })
  } catch (error) {
    console.error('[Seller Products GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/seller/products                                          */
/*  Create a new product with full schema support                      */
/*  - Validates required fields                                        */
/*  - Auto-generates slug and SEO fields                               */
/*  - Auto-sets seller info from session                               */
/*  - Computes total stock from variants                               */
/*  - Sets legacy fields for backward compatibility                    */
/*  - Defaults status to 'Draft'                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const body = await request.json()

    // ── Validate product data ──
    const validation = validateProductData(body)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 },
      )
    }

    const now = new Date()

    // ── Auto-generate slug from name ──
    const slug = generateSlug(body.name)

    // ── Build images array ──
    const images = Array.isArray(body.images)
      ? body.images.map((img: Record<string, unknown>, idx: number) => ({
          url: String(img.url || ''),
          alt: String(img.alt || body.name || ''),
          publicId: String(img.publicId || ''),
          isPrimary: idx === 0 ? true : Boolean(img.isPrimary),
        }))
      : []

    // ── Ensure at least one primary image ──
    if (images.length > 0 && !images.some((img: { isPrimary: boolean }) => img.isPrimary)) {
      images[0].isPrimary = true
    }

    // ── Build variants array ──
    const variants = Array.isArray(body.variants)
      ? body.variants
          .filter((v: Record<string, unknown>) => v && v.sku)
          .map((v: Record<string, unknown>) => ({
            sku: String(v.sku || ''),
            attributes: v.attributes || {},
            mrp: Number(v.mrp) || 0,
            sellingPrice: Number(v.sellingPrice) || 0,
            stock: Number(v.stock) || 0,
            images: Array.isArray(v.images) ? v.images.filter(Boolean) : [],
            isActive: v.isActive !== false,
          }))
      : []

    // ── Build specifications ──
    const specifications = Array.isArray(body.specifications)
      ? body.specifications
          .filter((g: Record<string, unknown>) => g && g.group)
          .map((g: Record<string, unknown>) => ({
            group: String(g.group || ''),
            specs: Array.isArray(g.specs)
              ? g.specs
                  .filter((s: Record<string, unknown>) => s && s.key)
                  .map((s: Record<string, unknown>) => ({
                    key: String(s.key || ''),
                    value: String(s.value || ''),
                  }))
              : [],
          }))
      : []

    // ── Build shipping ──
    const shipping = body.shipping || {}
    const shippingData = {
      weight: Number(shipping.weight) || 0,
      length: Number(shipping.length) || 0,
      width: Number(shipping.width) || 0,
      height: Number(shipping.height) || 0,
      hsnCode: String(shipping.hsnCode || ''),
      gstRate: Number(shipping.gstRate) || 0,
      deliveryCharge: Number(shipping.deliveryCharge) || 0,
      freeDeliveryAbove: Number(shipping.freeDeliveryAbove) || 0,
    }

    // ── Validate and sanitize size chart ──
    const sizeChartResult = validateSizeChartData(body.sizeChart)
    if (!sizeChartResult.valid) {
      return NextResponse.json({ error: `Invalid size chart: ${sizeChartResult.errors.join(', ')}` }, { status: 400 })
    }

    // ── Build SEO (auto-generate if not provided) ──
    const seoInput = {
      name: body.name,
      brand: body.brand,
      category: body.category,
      subcategory: body.subcategory,
      description: body.description,
      sellingPrice: Number(body.sellingPrice) || 0,
      highlights: body.highlights,
    }
    const autoSEO = generateSEO(seoInput)
    const seo = {
      metaTitle: body.seo?.metaTitle?.trim() || autoSEO.metaTitle,
      metaDescription: body.seo?.metaDescription?.trim() || autoSEO.metaDescription,
      searchKeywords: Array.isArray(body.seo?.searchKeywords)
        ? body.seo.searchKeywords.filter(Boolean)
        : autoSEO.searchKeywords,
      canonicalUrl: body.seo?.canonicalUrl?.trim() || autoSEO.canonicalUrl,
    }

    // ── Compute total stock ──
    const trackInventory = body.trackInventory !== false
    const stock = computeTotalStock({
      stock: Number(body.stock) || 0,
      variants,
      trackInventory,
    })

    // ── Assemble the product document ──
    const product: Record<string, unknown> = {
      // Core Info
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || '',
      category: body.category?.trim() || '',
      subcategory: body.subcategory?.trim() || '',
      brand: body.brand?.trim() || '',

      // Media
      images,
      videoUrl: body.videoUrl?.trim() || '',

      // Pricing
      mrp: Number(body.mrp) || 0,
      sellingPrice: Number(body.sellingPrice) || 0,
      specialPrice: Number(body.specialPrice) || 0,
      specialPriceStartDate: body.specialPriceStartDate || null,
      specialPriceEndDate: body.specialPriceEndDate || null,

      // Variants
      variantAttributes: Array.isArray(body.variantAttributes)
        ? body.variantAttributes.filter(Boolean)
        : [],
      variants,

      // Inventory
      stock,
      lowStockThreshold: Number(body.lowStockThreshold) || 5,
      trackInventory,
      lastStockUpdateAt: now,

      // Specifications
      specifications,

      // Highlights
      highlights: Array.isArray(body.highlights)
        ? body.highlights.filter(Boolean)
        : [],

      // Size Chart
      sizeChart: sizeChartResult.sanitized,

      // Shipping & Tax
      shipping: shippingData,

      // Return & Warranty
      returnPolicy: body.returnPolicy?.trim() || '',
      warranty: body.warranty?.trim() || '',

      // SEO
      seo,

      // Seller Info (auto-set from session — cannot be overridden)
      seller: session.storeName,
      sellerId: session.id,
      storeName: session.storeName,

      // Status & Approval — respect the status from the request body
      // Allows 'Pending' for submit-for-review, defaults to 'Draft' for save-as-draft
      status: (body.status === 'Pending' ? 'Pending' : 'Draft') as ProductStatus,
      approvalNotes: '',
      active: body.active !== false,

      // Tags
      tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : [],

      // Computed/Cached
      totalSold: 0,
      viewCount: 0,

      // Timestamps
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      publishedAt: null,

      // Legacy fields for backward compatibility
      ...buildLegacyFields({ images, mrp: Number(body.mrp) || 0 }),
    }

    // ── Insert into database ──
    const result = await db.collection('products').insertOne(product)

    // ── Invalidate product caches ──
    cacheInvalidate('products:')

    // === Inventory: Record initial stock movement + low-stock alert ===
    // Non-fatal — product is already created; audit trail is best-effort.
    try {
      const insertedId = result.insertedId.toString()
      const insertedProduct = { ...product, _id: result.insertedId }
      const sellerId = session.id
      const sellerName = session.storeName
      const initialStock = Number(body.stock) || 0

      try {
        await recordInitialStock({
          productId: insertedId,
          productName: body.name,
          stock: initialStock,
          sellerId,
          sellerName,
          performedBy: 'seller',
          userId: session.id,
          userName: session.name,
        })
      } catch (initErr) {
        console.warn('[Seller Products POST] recordInitialStock (parent) failed:', initErr)
      }

      // Record per-variant initial stock (if variants exist)
      if (Array.isArray(variants) && variants.length > 0) {
        for (const v of variants) {
          const vStock = Number(v.stock) || 0
          if (vStock > 0) {
            try {
              await recordInitialStock({
                productId: insertedId,
                productName: body.name,
                stock: vStock,
                variantId: v.sku,
                variantSku: v.sku,
                sellerId,
                sellerName,
                performedBy: 'seller',
                userId: session.id,
                userName: session.name,
              })
            } catch (vInitErr) {
              console.warn(`[Seller Products POST] recordInitialStock variant ${v.sku} failed:`, vInitErr)
            }
          }
        }
      }

      // Fire low-stock / out-of-stock alert at creation time
      try {
        await checkAndCreateAlert(insertedId, insertedProduct, initialStock)
      } catch (alertErr) {
        console.warn('[Seller Products POST] checkAndCreateAlert failed:', alertErr)
      }
    } catch (invErr) {
      console.warn('[Seller Products POST] Inventory integration failed:', invErr)
    }

    return NextResponse.json({
      success: true,
      product: { ...product, _id: result.insertedId.toString() },
    }, { status: 201 })
  } catch (error) {
    console.error('[Seller Products POST Error]', error)
    // Classify the error for better client-side feedback
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errMsg.includes('duplicate key') || errMsg.includes('E11000')) {
      return NextResponse.json({ error: 'A product with this slug already exists. Please try a different name.' }, { status: 409 })
    }
    if (errMsg.includes('Document failed validation')) {
      return NextResponse.json({ error: 'Product data does not match the expected schema. Please check all fields.', detail: errMsg }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create product', detail: errMsg }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT /api/seller/products                                           */
/*  Update seller's own product with full schema support               */
/*  - Verifies ownership via sellerAliases                             */
/*  - Re-approval logic for Published products                         */
/*  - Re-submit logic for Rejected products                            */
/*  - Auto-updates slug if name changes                                */
/*  - Auto-updates SEO if not explicitly provided                      */
/*  - Recomputes total stock from variants                             */
/*  - Updates legacy fields for backward compat                        */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const body = await request.json()
    const { _id, ...updateData } = body

    // ── Validate product ID ──
    if (!_id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }
    if (!ObjectId.isValid(_id)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    // ── Verify ownership via sellerAliases ──
    const existing = await db.collection('products').findOne({
      _id: new ObjectId(_id),
      seller: { $in: session.sellerAliases },
    })
    if (!existing) {
      return NextResponse.json(
        { error: 'Product not found or you do not own it' },
        { status: 404 },
      )
    }

    const safeUpdate: Record<string, unknown> = { updatedAt: new Date() }

    // ── Re-approval logic for Published products ──
    // Changing key fields (name, price, category) on a Published product
    // reverts status to 'Pending' for admin re-approval
    const KEY_FIELDS = ['name', 'mrp', 'sellingPrice', 'category'] as const
    const currentStatus = existing.status as string

    if (currentStatus === 'Published') {
      const keyFieldChanged = KEY_FIELDS.some(
        (field) => updateData[field] !== undefined && updateData[field] !== existing[field],
      )
      if (keyFieldChanged) {
        safeUpdate.status = 'Pending'
        safeUpdate.approvalNotes = ''
        safeUpdate.publishedAt = null
      }
    }

    // ── Re-submit logic for Rejected products ──
    // Seller can set status to 'Pending' to re-submit for approval
    if (currentStatus === 'Rejected' && updateData.status === 'Pending') {
      safeUpdate.status = 'Pending'
      safeUpdate.approvalNotes = ''
    }

    // ── Submit for review logic for Draft products ──
    // Seller can set status to 'Pending' to submit for admin review
    if (currentStatus === 'Draft' && updateData.status === 'Pending') {
      safeUpdate.status = 'Pending'
      safeUpdate.approvalNotes = ''
    }

    // ── Core Info ──
    if (updateData.name !== undefined) {
      const trimmedName = updateData.name.trim()
      safeUpdate.name = trimmedName
      // Auto-update slug if name changes
      safeUpdate.slug = generateSlug(trimmedName)
    }
    if (updateData.description !== undefined) safeUpdate.description = updateData.description.trim()
    if (updateData.category !== undefined) safeUpdate.category = updateData.category.trim()
    if (updateData.subcategory !== undefined) safeUpdate.subcategory = updateData.subcategory.trim()
    if (updateData.brand !== undefined) safeUpdate.brand = updateData.brand.trim()

    // ── Media ──
    if (updateData.images !== undefined) {
      const images = Array.isArray(updateData.images)
        ? updateData.images.map((img: Record<string, unknown>, idx: number) => ({
            url: String(img.url || ''),
            alt: String(img.alt || ''),
            publicId: String(img.publicId || ''),
            isPrimary: idx === 0 && !updateData.images.some((i: Record<string, unknown>) => i.isPrimary)
              ? true
              : Boolean(img.isPrimary),
          }))
        : []
      // Ensure at least one primary image
      if (images.length > 0 && !images.some((img: { isPrimary: boolean }) => img.isPrimary)) {
        images[0].isPrimary = true
      }
      safeUpdate.images = images
      // Update legacy imageUrl
      safeUpdate.imageUrl = getBestImageUrl({ images })
    }
    if (updateData.videoUrl !== undefined) safeUpdate.videoUrl = updateData.videoUrl.trim()

    // ── Pricing ──
    if (updateData.mrp !== undefined) {
      safeUpdate.mrp = Number(updateData.mrp) || 0
      // Update legacy price field
      safeUpdate.price = Number(updateData.mrp) || 0
    }
    if (updateData.sellingPrice !== undefined) safeUpdate.sellingPrice = Number(updateData.sellingPrice) || 0
    if (updateData.specialPrice !== undefined) safeUpdate.specialPrice = Number(updateData.specialPrice) || 0
    if (updateData.specialPriceStartDate !== undefined) safeUpdate.specialPriceStartDate = updateData.specialPriceStartDate || null
    if (updateData.specialPriceEndDate !== undefined) safeUpdate.specialPriceEndDate = updateData.specialPriceEndDate || null

    // ── Variants ──
    if (updateData.variants !== undefined) {
      safeUpdate.variants = Array.isArray(updateData.variants)
        ? updateData.variants
            .filter((v: Record<string, unknown>) => v && v.sku)
            .map((v: Record<string, unknown>) => ({
              sku: String(v.sku || ''),
              attributes: v.attributes || {},
              mrp: Number(v.mrp) || 0,
              sellingPrice: Number(v.sellingPrice) || 0,
              stock: Number(v.stock) || 0,
              images: Array.isArray(v.images) ? v.images.filter(Boolean) : [],
              isActive: v.isActive !== false,
            }))
        : []
    }
    if (updateData.variantAttributes !== undefined) {
      safeUpdate.variantAttributes = Array.isArray(updateData.variantAttributes)
        ? updateData.variantAttributes.filter(Boolean)
        : []
    }

    // ── Recompute total stock if stock/variants changed ──
    if (updateData.stock !== undefined || updateData.variants !== undefined) {
      const mergedProduct = {
        ...existing,
        ...(safeUpdate.variants !== undefined ? { variants: safeUpdate.variants } : {}),
        stock: safeUpdate.stock !== undefined ? Number(safeUpdate.stock) : existing.stock,
        trackInventory: safeUpdate.trackInventory !== undefined
          ? safeUpdate.trackInventory
          : existing.trackInventory,
      }
      safeUpdate.stock = computeTotalStock(mergedProduct as Parameters<typeof computeTotalStock>[0])
    }
    if (updateData.lowStockThreshold !== undefined) safeUpdate.lowStockThreshold = Number(updateData.lowStockThreshold) || 5
    if (updateData.trackInventory !== undefined) safeUpdate.trackInventory = updateData.trackInventory !== false

    // ── Specifications ──
    if (updateData.specifications !== undefined) {
      safeUpdate.specifications = Array.isArray(updateData.specifications)
        ? updateData.specifications
            .filter((g: Record<string, unknown>) => g && g.group)
            .map((g: Record<string, unknown>) => ({
              group: String(g.group || ''),
              specs: Array.isArray(g.specs)
                ? g.specs
                    .filter((s: Record<string, unknown>) => s && s.key)
                    .map((s: Record<string, unknown>) => ({
                      key: String(s.key || ''),
                      value: String(s.value || ''),
                    }))
                : [],
            }))
        : []
    }

    // ── Highlights ──
    if (updateData.highlights !== undefined) {
      safeUpdate.highlights = Array.isArray(updateData.highlights)
        ? updateData.highlights.filter(Boolean)
        : []
    }

    // ── Size Chart ──
    if (updateData.sizeChart !== undefined) {
      const sizeChartResult = validateSizeChartData(updateData.sizeChart)
      if (!sizeChartResult.valid) {
        return NextResponse.json({ error: `Invalid size chart: ${sizeChartResult.errors.join(', ')}` }, { status: 400 })
      }
      safeUpdate.sizeChart = sizeChartResult.sanitized
    }

    // ── Shipping ──
    if (updateData.shipping !== undefined) {
      const sh = updateData.shipping || {}
      safeUpdate.shipping = {
        weight: Number(sh.weight) || 0,
        length: Number(sh.length) || 0,
        width: Number(sh.width) || 0,
        height: Number(sh.height) || 0,
        hsnCode: String(sh.hsnCode || ''),
        gstRate: Number(sh.gstRate) || 0,
        deliveryCharge: Number(sh.deliveryCharge) || 0,
        freeDeliveryAbove: Number(sh.freeDeliveryAbove) || 0,
      }
    }

    // ── Return & Warranty ──
    if (updateData.returnPolicy !== undefined) safeUpdate.returnPolicy = updateData.returnPolicy.trim()
    if (updateData.warranty !== undefined) safeUpdate.warranty = updateData.warranty.trim()

    // ── SEO (auto-update if not explicitly provided) ──
    if (updateData.seo !== undefined || updateData.name !== undefined) {
      // Merge current product data with proposed updates for SEO generation
      const seoSource = {
        name: safeUpdate.name || existing.name,
        brand: safeUpdate.brand || existing.brand,
        category: safeUpdate.category || existing.category,
        subcategory: safeUpdate.subcategory || existing.subcategory,
        description: safeUpdate.description || existing.description,
        sellingPrice: safeUpdate.sellingPrice || existing.sellingPrice,
        highlights: safeUpdate.highlights || existing.highlights,
      }
      const autoSEO = generateSEO(seoSource)

      if (updateData.seo) {
        safeUpdate.seo = {
          metaTitle: updateData.seo.metaTitle?.trim() || autoSEO.metaTitle,
          metaDescription: updateData.seo.metaDescription?.trim() || autoSEO.metaDescription,
          searchKeywords: Array.isArray(updateData.seo.searchKeywords)
            ? updateData.seo.searchKeywords.filter(Boolean)
            : autoSEO.searchKeywords,
          canonicalUrl: updateData.seo.canonicalUrl?.trim() || autoSEO.canonicalUrl,
        }
      } else {
        // Auto-update SEO when name changed but no SEO provided
        safeUpdate.seo = autoSEO
      }
    }

    // ── Active toggle ──
    if (updateData.active !== undefined) safeUpdate.active = updateData.active !== false

    // ── Tags ──
    if (updateData.tags !== undefined) {
      safeUpdate.tags = Array.isArray(updateData.tags) ? updateData.tags.filter(Boolean) : []
    }

    // ── Ensure legacy discounts field stays as empty array ──
    safeUpdate.discounts = []

    // ── Seller field is immutable — never allow changing it ──

    // === Inventory: Record stock movement via adjustStock (audit trail) ===
    // Run BEFORE the main updateOne so adjustStock can compute the delta
    // against the OLD stock value. Non-fatal — edit should still succeed.
    try {
      const variantsSent = Array.isArray(updateData.variants)

      if (variantsSent && Array.isArray(existing.variants)) {
        // Per-variant stock movement — one adjustStock per changed variant.
        // adjustStock also bumps parent `stock` by the same delta, so we
        // skip a separate parent call when variants are present.
        for (const incoming of updateData.variants as Array<Record<string, unknown>>) {
          const sku = String(incoming.sku || '')
          if (!sku) continue
          const oldVariant = (existing.variants as Array<Record<string, unknown>>)
            .find((v) => String(v.sku || '') === sku)
          const oldVStock = Number(oldVariant?.stock) || 0
          const newVStock = Number(incoming.stock) || 0
          if (newVStock !== oldVStock) {
            try {
              await adjustStock({
                productId: _id,
                newQuantity: newVStock,
                variantId: sku,
                reason: `Variant ${sku} stock updated via product edit form`,
                performedBy: 'seller',
                userId: session.id,
                userName: session.name,
              })
            } catch (vAdjErr) {
              console.warn(`[Seller Products PUT] adjustStock variant ${sku} failed:`, vAdjErr)
            }
          }
        }
      } else if (updateData.stock !== undefined) {
        // Parent-only stock change (no variants sent)
        const oldStock = Number(existing.stock) || 0
        const newStock = Number(updateData.stock) || 0
        if (newStock !== oldStock) {
          try {
            await adjustStock({
              productId: _id,
              newQuantity: newStock,
              reason: 'Stock updated via product edit form',
              performedBy: 'seller',
              userId: session.id,
              userName: session.name,
            })
          } catch (adjErr) {
            console.warn('[Seller Products PUT] adjustStock failed:', adjErr)
          }
        }
      }
    } catch (invErr) {
      console.warn('[Seller Products PUT] Inventory adjustStock wrapper failed:', invErr)
    }

    // ── Perform the update ──
    const result = await db.collection('products').updateOne(
      { _id: new ObjectId(_id), seller: { $in: session.sellerAliases } },
      { $set: safeUpdate },
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // ── Invalidate product caches ──
    cacheInvalidate('products:')

    return NextResponse.json({
      success: true,
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    console.error('[Seller Products PUT Error]', error)
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errMsg.includes('Document failed validation')) {
      return NextResponse.json({ error: 'Product data does not match the expected schema. Please check all fields.', detail: errMsg }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update product', detail: errMsg }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/seller/products                                        */
/*  Delete seller's own product                                        */
/*  - Verifies ownership via sellerAliases                             */
/*  - Only allows deleting Draft/Rejected products                     */
/*  - Published products must be suspended first                       */
/*  - Deletes product images from Cloudinary                           */
/*  - Invalidates product caches                                      */
/* ------------------------------------------------------------------ */

export async function DELETE(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    // ── Validate product ID ──
    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    // ── Verify ownership via sellerAliases ──
    const existing = await db.collection('products').findOne({
      _id: new ObjectId(id),
      seller: { $in: session.sellerAliases },
    })
    if (!existing) {
      return NextResponse.json(
        { error: 'Product not found or you do not own it' },
        { status: 404 },
      )
    }

    // ── Business rule: Only Draft/Rejected products can be deleted ──
    // Published products must be suspended first (by admin)
    const currentStatus = existing.status as string
    if (currentStatus === 'Published' || currentStatus === 'Approved') {
      return NextResponse.json(
        {
          error: `Cannot delete a ${currentStatus.toLowerCase()} product. Please contact admin to suspend it first.`,
        },
        { status: 403 },
      )
    }

    // ── Delete product images from Cloudinary ──
    const images = existing.images as Array<{ publicId?: string }> | undefined
    if (Array.isArray(images)) {
      for (const img of images) {
        if (img.publicId) {
          try {
            await deleteFile(img.publicId, 'image')
          } catch (deleteError) {
            // Log but don't fail the product deletion if image cleanup fails
            console.warn(
              `[Seller Products DELETE] Failed to delete image ${img.publicId}:`,
              deleteError,
            )
          }
        }
      }
    }

    // ── Also try to delete legacy imageUrl from Cloudinary ──
    if (existing.imageUrl && typeof existing.imageUrl === 'string' && existing.imageUrl.includes('cloudinary')) {
      // Extract publicId from the URL as a best-effort cleanup
      // This is a fallback for products created before the images[] schema
      try {
        const urlParts = existing.imageUrl.split('/')
        const uploadIdx = urlParts.indexOf('upload')
        if (uploadIdx >= 0 && urlParts.length > uploadIdx + 2) {
          // publicId is everything after "upload/v{version}/"
          const publicIdParts = urlParts.slice(uploadIdx + 2)
          const lastPart = publicIdParts.join('/')
          const publicId = lastPart.replace(/\.[^.]+$/, '') // Remove file extension
          if (publicId) await deleteFile(publicId, 'image')
        }
      } catch {
        // Best-effort — don't block deletion
      }
    }

    // ── Delete the product document ──
    await db.collection('products').deleteOne({
      _id: new ObjectId(id),
      seller: { $in: session.sellerAliases },
    })

    // ── Invalidate product caches ──
    cacheInvalidate('products:')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Seller Products DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
