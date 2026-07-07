/* ------------------------------------------------------------------ */
/*  Admin Products CRUD API                                            */
/*  Full product lifecycle management for admin panel                  */
/*  Supports: listing, creation, update, deletion with approval        */
/*  workflow, SEO auto-generation, legacy compatibility, and caching.  */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { cacheOrCompute, cacheInvalidate } from '@/lib/server-cache'
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
import type { ProductStatus } from '@/lib/product-types'
import {
  recordInitialStock,
  checkAndCreateAlert,
  adjustStock,
} from '@/lib/inventory-manager'
import { getSessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  Helper: Serialize product for JSON response                        */
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
/*  Helper: Build images array from request body                       */
/* ------------------------------------------------------------------ */

function buildImages(body: Record<string, unknown>) {
  const raw = body.images
  if (!Array.isArray(raw)) return []

  const images = raw.map((img: Record<string, unknown>, idx: number) => ({
    url: String(img.url || ''),
    alt: String(img.alt || body.name || ''),
    publicId: String(img.publicId || ''),
    isPrimary: idx === 0 ? true : Boolean(img.isPrimary),
  }))

  // Ensure at least one primary image
  if (images.length > 0 && !images.some((img: { isPrimary: boolean }) => img.isPrimary)) {
    images[0].isPrimary = true
  }

  return images
}

/* ------------------------------------------------------------------ */
/*  Helper: Build variants array from request body                     */
/* ------------------------------------------------------------------ */

function buildVariants(body: Record<string, unknown>) {
  if (!Array.isArray(body.variants)) return []
  return body.variants
    .filter((v: Record<string, unknown>) => v && v.sku)
    .map((v: Record<string, unknown>) => ({
      sku: String(v.sku || ''),
      attributes: (v.attributes || {}) as Record<string, string>,
      mrp: Number(v.mrp) || 0,
      sellingPrice: Number(v.sellingPrice) || 0,
      stock: Number(v.stock) || 0,
      images: Array.isArray(v.images) ? v.images.filter(Boolean) as string[] : [],
      isActive: v.isActive !== false,
    }))
}

/* ------------------------------------------------------------------ */
/*  Helper: Build specifications array from request body               */
/* ------------------------------------------------------------------ */

function buildSpecifications(body: Record<string, unknown>) {
  if (!Array.isArray(body.specifications)) return []
  return body.specifications
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
}

/* ------------------------------------------------------------------ */
/*  Helper: Build shipping object from request body                    */
/* ------------------------------------------------------------------ */

function buildShipping(shipping: Record<string, unknown> | undefined) {
  const sh = shipping || {}
  return {
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

/* ------------------------------------------------------------------ */
/*  Helper: Build SEO fields (auto-generate if not provided)           */
/* ------------------------------------------------------------------ */

function buildSEO(body: Record<string, unknown>) {
  const seoInput = {
    name: body.name as string,
    brand: body.brand as string | undefined,
    category: body.category as string | undefined,
    subcategory: body.subcategory as string | undefined,
    description: body.description as string | undefined,
    sellingPrice: Number(body.sellingPrice) || 0,
    highlights: body.highlights as string[] | undefined,
  }
  const autoSEO = generateSEO(seoInput)

  return {
    metaTitle: (body.seo as Record<string, unknown>)?.metaTitle?.toString().trim() || autoSEO.metaTitle,
    metaDescription: (body.seo as Record<string, unknown>)?.metaDescription?.toString().trim() || autoSEO.metaDescription,
    searchKeywords: Array.isArray((body.seo as Record<string, unknown>)?.searchKeywords)
      ? ((body.seo as Record<string, unknown>).searchKeywords as unknown[]).filter(Boolean)
      : autoSEO.searchKeywords,
    canonicalUrl: (body.seo as Record<string, unknown>)?.canonicalUrl?.toString().trim() || autoSEO.canonicalUrl,
  }
}

/* ------------------------------------------------------------------ */
/*  Valid product statuses                                              */
/* ------------------------------------------------------------------ */

const VALID_STATUSES: ProductStatus[] = ['Draft', 'Pending', 'Approved', 'Published', 'Rejected', 'Suspended']

/* ------------------------------------------------------------------ */
/*  GET /api/admin/products                                            */
/*  List all products with pagination, search, filters, status counts, */
/*  and filter metadata. No auth required — admin panel handles auth.  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams

    // ── Pagination ──
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')))
    const skip = (page - 1) * limit

    // ── Search & Filters ──
    const search = searchParams.get('search')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''
    const subcategory = searchParams.get('subcategory')?.trim() || ''
    const status = searchParams.get('status')?.trim() || ''
    const seller = searchParams.get('seller')?.trim() || ''
    const brand = searchParams.get('brand')?.trim() || ''

    // Build the query
    const query: Record<string, unknown> = {}

    // Text search across name, brand, description, seller
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { seller: { $regex: search, $options: 'i' } },
      ]
    }

    // Apply filters (skip 'all' — means "no filter")
    if (category && category !== 'all') query.category = category
    if (subcategory && subcategory !== 'all') query.subcategory = subcategory
    if (status && status !== 'all') query.status = status
    if (seller && seller !== 'all') query.seller = seller
    if (brand && brand !== 'all') query.brand = brand

    // ── Run main query + status counts in parallel ──
    const [
      products,
      filteredTotal,
      totalAll,
      draftCount,
      pendingCount,
      approvedCount,
      publishedCount,
      rejectedCount,
      suspendedCount,
    ] = await Promise.all([
      db.collection('products')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('products').countDocuments(query),
      db.collection('products').countDocuments({}),
      db.collection('products').countDocuments({ status: 'Draft' }),
      db.collection('products').countDocuments({ status: 'Pending' }),
      db.collection('products').countDocuments({ status: 'Approved' }),
      db.collection('products').countDocuments({ status: 'Published' }),
      db.collection('products').countDocuments({ status: 'Rejected' }),
      db.collection('products').countDocuments({ status: 'Suspended' }),
    ])

    // ── Filter metadata (cached 5 min) ──
    const filterMeta = await cacheOrCompute('admin:products:filters:v2', async () => {
      const [categories, subcategories, brands, sellers] = await Promise.all([
        db.collection('products').distinct('category'),
        db.collection('products').distinct('subcategory'),
        db.collection('products').distinct('brand'),
        db.collection('products').distinct('seller'),
      ])
      return {
        categories: categories.filter(Boolean).sort(),
        subcategories: subcategories.filter(Boolean).sort(),
        brands: brands.filter(Boolean).sort(),
        sellers: sellers.filter(Boolean).sort(),
      }
    }, 300_000) // 5 minutes

    return NextResponse.json({
      products: products.map(serializeProduct),
      total: filteredTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
      // Status counts for admin dashboard
      counts: {
        total: totalAll,
        draft: draftCount,
        pending: pendingCount,
        approved: approvedCount,
        published: publishedCount,
        rejected: rejectedCount,
        suspended: suspendedCount,
      },
      // Filter metadata for dropdowns
      ...filterMeta,
    })
  } catch (error) {
    console.error('[Admin Products GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/admin/products                                           */
/*  Create a new product (admin can create directly).                  */
/*  - Same validation as seller                                        */
/*  - Auto-generates slug and SEO                                      */
/*  - Admin can set any status directly                                */
/*  - Sets legacy fields for backward compat                           */
/*  - Defaults seller to 'Admin' if not provided                       */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
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

    // ── Build sub-documents ──
    const images = buildImages(body)
    const variants = buildVariants(body)
    const specifications = buildSpecifications(body)
    const shippingData = buildShipping(body.shipping)
    const seo = buildSEO(body)

    // ── Compute total stock ──
    const trackInventory = body.trackInventory !== false
    const stock = computeTotalStock({
      stock: Number(body.stock) || 0,
      variants,
      trackInventory,
    })

    // ── Validate & normalize status ──
    const requestedStatus = body.status || 'Draft'
    const status: ProductStatus = VALID_STATUSES.includes(requestedStatus)
      ? requestedStatus
      : 'Draft'

    // ── Approval timestamps ──
    let approvedAt: Date | null = null
    let publishedAt: Date | null = null
    if (status === 'Approved') approvedAt = now
    if (status === 'Published') publishedAt = now

    // ── Validate and sanitize size chart ──
    const sizeChartResult = validateSizeChartData(body.sizeChart)
    if (!sizeChartResult.valid) {
      return NextResponse.json({ error: `Invalid size chart: ${sizeChartResult.errors.join(', ')}` }, { status: 400 })
    }

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

      // Seller Info (defaults to 'Admin')
      seller: body.seller?.trim() || 'Admin',
      sellerId: body.sellerId || 'admin',
      storeName: body.storeName || body.seller?.trim() || 'Admin',

      // Status & Approval
      status,
      approvalNotes: body.approvalNotes?.trim() || '',
      active: body.active !== false,

      // Tags
      tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : [],

      // Computed/Cached
      totalSold: 0,
      viewCount: 0,

      // Timestamps
      createdAt: now,
      updatedAt: now,
      approvedAt,
      publishedAt,

      // Legacy fields for backward compatibility
      ...buildLegacyFields({ images, mrp: Number(body.mrp) || 0 }),
    }

    // ── Insert into database ──
    const result = await db.collection('products').insertOne(product)

    // ── Invalidate product caches ──
    cacheInvalidate('products:')
    cacheInvalidate('admin:products:')

    // === Inventory: Record initial stock movement + low-stock alert ===
    // Non-fatal — product is already created; audit trail is best-effort.
    try {
      // Best-effort admin session lookup for audit attribution
      let adminSession: { id: string; name: string } | null = null
      try {
        adminSession = await getSessionFromRequest(request)
      } catch { /* no session — use defaults */ }
      const adminId = adminSession?.id || 'admin'
      const adminName = adminSession?.name || 'Admin'

      const insertedId = result.insertedId.toString()
      const insertedProduct = { ...product, _id: result.insertedId }
      const initialStock = Number(body.stock) || 0
      const sellerId = (body.sellerId as string) || 'admin'
      const sellerName = (body.seller as string) || 'Admin'

      try {
        await recordInitialStock({
          productId: insertedId,
          productName: body.name,
          stock: initialStock,
          sellerId,
          sellerName,
          performedBy: 'admin',
          userId: adminId,
          userName: adminName,
        })
      } catch (initErr) {
        console.warn('[Admin Products POST] recordInitialStock (parent) failed:', initErr)
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
                performedBy: 'admin',
                userId: adminId,
                userName: adminName,
              })
            } catch (vInitErr) {
              console.warn(`[Admin Products POST] recordInitialStock variant ${v.sku} failed:`, vInitErr)
            }
          }
        }
      }

      // Fire low-stock / out-of-stock alert at creation time
      try {
        await checkAndCreateAlert(insertedId, insertedProduct, initialStock)
      } catch (alertErr) {
        console.warn('[Admin Products POST] checkAndCreateAlert failed:', alertErr)
      }
    } catch (invErr) {
      console.warn('[Admin Products POST] Inventory integration failed:', invErr)
    }

    return NextResponse.json({
      success: true,
      product: { ...product, _id: result.insertedId.toString() },
    }, { status: 201 })
  } catch (error) {
    console.error('[Admin Products POST Error]', error)
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errMsg.includes('duplicate key') || errMsg.includes('E11000')) {
      return NextResponse.json({ error: 'A product with this slug already exists.' }, { status: 409 })
    }
    if (errMsg.includes('Document failed validation')) {
      return NextResponse.json({ error: 'Product data does not match the expected schema.', detail: errMsg }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create product', detail: errMsg }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  PUT /api/admin/products                                            */
/*  Update any product (admin can update all fields).                  */
/*  - Admin can change any field including status                      */
/*  - Approval workflow: Approved → set approvedAt                    */
/*  - Published → set publishedAt                                     */
/*  - Rejection requires approvalNotes                                */
/*  - Auto-update slug and SEO when name changes                      */
/*  - Recompute total stock                                            */
/*  - Update legacy fields                                             */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
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

    // ── Fetch existing product ──
    const existing = await db.collection('products').findOne({ _id: new ObjectId(_id) })
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const safeUpdate: Record<string, unknown> = { updatedAt: new Date() }

    // ── Approval workflow ──
    if (updateData.status !== undefined) {
      const newStatus = updateData.status as string

      // Validate the status value
      if (!VALID_STATUSES.includes(newStatus as ProductStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 },
        )
      }

      // Rejection requires approvalNotes
      if (newStatus === 'Rejected' && !updateData.approvalNotes?.trim()) {
        return NextResponse.json(
          { error: 'Approval notes are required when rejecting a product' },
          { status: 400 },
        )
      }

      safeUpdate.status = newStatus

      // Set approvedAt when status is Approved
      if (newStatus === 'Approved') {
        safeUpdate.approvedAt = new Date()
      }

      // Set publishedAt when status is Published
      if (newStatus === 'Published') {
        safeUpdate.publishedAt = new Date()
        // Also ensure approvedAt is set
        if (!existing.approvedAt) {
          safeUpdate.approvedAt = new Date()
        }
      }
    }

    // ── Approval notes ──
    if (updateData.approvalNotes !== undefined) {
      safeUpdate.approvalNotes = updateData.approvalNotes.trim()
    }

    // ── Core Info ──
    if (updateData.name !== undefined) {
      const trimmedName = updateData.name.trim()
      safeUpdate.name = trimmedName
      // Auto-update slug when name changes
      safeUpdate.slug = generateSlug(trimmedName)
    }
    if (updateData.description !== undefined) safeUpdate.description = updateData.description.trim()
    if (updateData.category !== undefined) safeUpdate.category = updateData.category.trim()
    if (updateData.subcategory !== undefined) safeUpdate.subcategory = updateData.subcategory.trim()
    if (updateData.brand !== undefined) safeUpdate.brand = updateData.brand.trim()

    // ── Media ──
    if (updateData.images !== undefined) {
      const images = buildImages(updateData)
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
      safeUpdate.variants = buildVariants(updateData)
    }
    if (updateData.variantAttributes !== undefined) {
      safeUpdate.variantAttributes = Array.isArray(updateData.variantAttributes)
        ? updateData.variantAttributes.filter(Boolean)
        : []
    }

    // ── Stock (recompute if stock or variants changed) ──
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
      safeUpdate.specifications = buildSpecifications(updateData)
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
      safeUpdate.shipping = buildShipping(updateData.shipping)
    }

    // ── Return & Warranty ──
    if (updateData.returnPolicy !== undefined) safeUpdate.returnPolicy = updateData.returnPolicy.trim()
    if (updateData.warranty !== undefined) safeUpdate.warranty = updateData.warranty.trim()

    // ── SEO (auto-update if name changed or seo explicitly provided) ──
    if (updateData.seo !== undefined || updateData.name !== undefined) {
      const seoSource = {
        name: safeUpdate.name || existing.name,
        brand: safeUpdate.brand || existing.brand,
        category: safeUpdate.category || existing.category,
        subcategory: safeUpdate.subcategory || existing.subcategory,
        description: safeUpdate.description || existing.description,
        sellingPrice: safeUpdate.sellingPrice || existing.sellingPrice,
        highlights: safeUpdate.highlights || existing.highlights,
      }
      const autoSEO = generateSEO(seoSource as Parameters<typeof generateSEO>[0])

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

    // ── Seller info (admin can change seller) ──
    if (updateData.seller !== undefined) safeUpdate.seller = updateData.seller.trim()
    if (updateData.sellerId !== undefined) safeUpdate.sellerId = updateData.sellerId
    if (updateData.storeName !== undefined) safeUpdate.storeName = updateData.storeName.trim()

    // ── Ensure legacy fields stay in sync ──
    const finalMrp = safeUpdate.mrp !== undefined ? safeUpdate.mrp : existing.mrp
    const finalImages = safeUpdate.images !== undefined ? safeUpdate.images : existing.images
    if (safeUpdate.mrp !== undefined || safeUpdate.images !== undefined) {
      Object.assign(safeUpdate, buildLegacyFields({
        images: finalImages as { url: string; alt: string; publicId: string; isPrimary: boolean }[],
        mrp: finalMrp as number,
      }))
    }
    // Always ensure discounts is empty array (legacy compat)
    safeUpdate.discounts = []

    // === Inventory: Record stock movement via adjustStock (audit trail) ===
    // Run BEFORE the main updateOne so adjustStock can compute the delta
    // against the OLD stock value. Non-fatal — edit should still succeed.
    try {
      // Best-effort admin session lookup for audit attribution
      let adminSession: { id: string; name: string } | null = null
      try {
        adminSession = await getSessionFromRequest(request)
      } catch { /* no session — use defaults */ }
      const adminId = adminSession?.id || 'admin'
      const adminName = adminSession?.name || 'Admin'

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
                reason: `Variant ${sku} stock updated via admin product edit`,
                performedBy: 'admin',
                userId: adminId,
                userName: adminName,
              })
            } catch (vAdjErr) {
              console.warn(`[Admin Products PUT] adjustStock variant ${sku} failed:`, vAdjErr)
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
              reason: 'Stock updated via admin product edit',
              performedBy: 'admin',
              userId: adminId,
              userName: adminName,
            })
          } catch (adjErr) {
            console.warn('[Admin Products PUT] adjustStock failed:', adjErr)
          }
        }
      }
    } catch (invErr) {
      console.warn('[Admin Products PUT] Inventory adjustStock wrapper failed:', invErr)
    }

    // ── Perform the update ──
    const result = await db.collection('products').updateOne(
      { _id: new ObjectId(_id) },
      { $set: safeUpdate },
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // ── Invalidate product caches ──
    cacheInvalidate('products:')
    cacheInvalidate('admin:products:')

    return NextResponse.json({
      success: true,
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    console.error('[Admin Products PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/admin/products                                         */
/*  Delete a product by ID.                                            */
/*  - Deletes images from Cloudinary (best-effort)                     */
/*  - Removes from database                                           */
/*  - Invalidates caches                                              */
/* ------------------------------------------------------------------ */

export async function DELETE(request: NextRequest) {
  try {
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

    // ── Fetch the product (to get images for cleanup) ──
    const existing = await db.collection('products').findOne({ _id: new ObjectId(id) })
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // ── Delete product images from Cloudinary (best-effort) ──
    const images = existing.images as Array<{ publicId?: string }> | undefined
    if (Array.isArray(images)) {
      for (const img of images) {
        if (img.publicId) {
          try {
            await deleteFile(img.publicId, 'image')
          } catch (deleteError) {
            // Log but don't fail the product deletion if image cleanup fails
            console.warn(
              `[Admin Products DELETE] Failed to delete image ${img.publicId}:`,
              deleteError,
            )
          }
        }
      }
    }

    // ── Also try to delete legacy imageUrl from Cloudinary ──
    if (existing.imageUrl && typeof existing.imageUrl === 'string' && existing.imageUrl.includes('cloudinary')) {
      try {
        const urlParts = existing.imageUrl.split('/')
        const uploadIdx = urlParts.indexOf('upload')
        if (uploadIdx >= 0 && urlParts.length > uploadIdx + 2) {
          const publicIdParts = urlParts.slice(uploadIdx + 2)
          const lastPart = publicIdParts.join('/')
          const publicId = lastPart.replace(/\.[^.]+$/, '')
          if (publicId) await deleteFile(publicId, 'image')
        }
      } catch {
        // Best-effort — don't block deletion
      }
    }

    // ── Delete the product document ──
    await db.collection('products').deleteOne({ _id: new ObjectId(id) })

    // ── Invalidate product caches ──
    cacheInvalidate('products:')
    cacheInvalidate('admin:products:')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Products DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
