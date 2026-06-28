import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getSessionFromRequest } from '@/lib/auth'
import { uploadCategoryImage, deleteCategoryImageFile, isUploadConfigured } from '@/lib/upload'
import { ObjectId } from 'mongodb'
import { cacheOrCompute, cacheInvalidate } from '@/lib/server-cache'

const CATEGORIES_COLLECTION = 'categories'

// Allowed MIME types for category image upload
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

// Max file size: 3.1 MB
const MAX_FILE_SIZE = 3.1 * 1024 * 1024

/**
 * GET /api/admin/categories
 * Fetch categories from MongoDB in hierarchical structure.
 * Returns parent categories with their nested subcategory objects,
 * and also includes subcategories whose parent may not exist (orphan subcategories).
 * Query params: search, createdBy, page, limit
 *
 * ROBUST APPROACH: Pagination is based on PARENT categories only.
 * All subcategories for the displayed parents are always fetched.
 * This ensures:
 * - All parent categories are visible on the correct page
 * - Every parent shows ALL its subcategories (not just some)
 * - Pagination total matches what the user sees
 * - Search works across both parents and subcategories
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const createdBy = searchParams.get('createdBy') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10', 10)))

    const projection = {
      name: 1,
      description: 1,
      parentCategory: 1,
      status: 1,
      createdBy: 1,
      imageUrl: 1,
      imagePublicId: 1,
      highlights: 1,
      displayOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 1: Determine which parent categories to show on this page.
    //
    // When searching, a parent matches if:
    //   a) The parent itself matches the search/filter, OR
    //   b) Any of its subcategories match the search/filter
    //
    // When NOT searching, simply paginate parent categories.
    // ──────────────────────────────────────────────────────────────────

    // Base parent filter: only top-level categories
    const parentBaseFilter: any = {
      $or: [{ parentCategory: 'None' }, { parentCategory: { $exists: false } }],
    }

    if (createdBy && createdBy !== 'all') {
      parentBaseFilter.createdBy = createdBy
    }

    let totalMatching: number
    let paginatedParents: any[]

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' }

      // Find subcategories matching the search
      const subSearchFilter: any = {
        parentCategory: { $ne: 'None', $exists: true },
        $or: [{ name: searchRegex }, { description: searchRegex }],
      }

      const matchingSubs = await db.collection(CATEGORIES_COLLECTION)
        .find(subSearchFilter, { projection: { parentCategory: 1 } })
        .limit(200)
        .toArray()

      const parentNamesFromSubs = [...new Set(matchingSubs.map((s) => s.parentCategory))]

      // Build combined parent filter using $and to avoid key collisions:
      // Parents that (match search themselves) OR (have matching subcategories)
      const parentSearchConditions: any[][] = [
        // Condition A: parent itself matches the search text AND is a top-level category
        [
          { $or: [{ parentCategory: 'None' }, { parentCategory: { $exists: false } }] },
          { $or: [{ name: searchRegex }, { description: searchRegex }] },
        ],
      ]

      // Condition B: parent has subcategories that match the search
      if (parentNamesFromSubs.length > 0) {
        const nameFilter: Record<string, unknown> = { name: { $in: parentNamesFromSubs } }
        if (createdBy && createdBy !== 'all') {
          parentSearchConditions.push([
            { $or: [{ parentCategory: 'None' }, { parentCategory: { $exists: false } }] },
            nameFilter,
            { createdBy },
          ])
        } else {
          parentSearchConditions.push([
            { $or: [{ parentCategory: 'None' }, { parentCategory: { $exists: false } }] },
            nameFilter,
          ])
        }
      }

      // Add createdBy filter to Condition A as well
      if (createdBy && createdBy !== 'all') {
        parentSearchConditions[0].push({ createdBy })
      }

      // Build the final $or query from the conditions
      const finalParentFilter: any = {
        $or: parentSearchConditions.map((conds) => ({ $and: conds })),
      }

      totalMatching = await db.collection(CATEGORIES_COLLECTION).countDocuments(finalParentFilter)

      paginatedParents = await db.collection(CATEGORIES_COLLECTION)
        .find(finalParentFilter, { projection })
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray()
    } else {
      // No search — simple parent pagination
      totalMatching = await db.collection(CATEGORIES_COLLECTION).countDocuments(parentBaseFilter)

      paginatedParents = await db.collection(CATEGORIES_COLLECTION)
        .find(parentBaseFilter, { projection })
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray()
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 2: Fetch ALL subcategories for the parents on this page.
    // This ensures every parent shows its complete list of subcategories,
    // regardless of pagination.
    // ──────────────────────────────────────────────────────────────────

    const parentNames = paginatedParents.map((cat) => cat.name)

    const subCats = parentNames.length > 0
      ? await db.collection(CATEGORIES_COLLECTION)
          .find({
            parentCategory: { $in: parentNames },
          }, { projection })
          .sort({ displayOrder: 1, createdAt: -1 })
          .toArray()
      : []

    // Also fetch orphan subcategories (those whose parent doesn't exist in DB at all)
    // These are shown as standalone items on the first page
    const orphanSubCats: any[] = []
    if (page === 1 && parentNames.length > 0) {
      // Get all parent names in the entire DB
      const allParentNamesInDB = await db.collection(CATEGORIES_COLLECTION)
        .distinct('name', {
          $or: [{ parentCategory: 'None' }, { parentCategory: { $exists: false } }],
        })

      // Orphans: subcategories whose parentCategory name is NOT any known parent
      // Use $and to avoid duplicate key issues with parentCategory
      const orphans = await db.collection(CATEGORIES_COLLECTION)
        .find({
          $and: [
            { parentCategory: { $nin: allParentNamesInDB } },
            { parentCategory: { $ne: 'None' } },
            { parentCategory: { $exists: true } },
          ],
        }, { projection })
        .sort({ displayOrder: 1, createdAt: -1 })
        .limit(50)
        .toArray()

      orphanSubCats.push(...orphans)
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: Get product counts for all categories on this page.
    // ──────────────────────────────────────────────────────────────────

    const allCategoryNamesForCount = [...parentNames, ...subCats.map((s) => s.name), ...orphanSubCats.map((s) => s.name)]

    const productCounts = allCategoryNamesForCount.length > 0
      ? await db.collection('products').aggregate([
          { $match: { category: { $in: allCategoryNamesForCount } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ]).toArray()
      : []

    const countMap: Record<string, number> = {}
    for (const item of productCounts) {
      countMap[item._id] = item.count
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 4: Fetch ALL category names for dropdown (cached).
    // ──────────────────────────────────────────────────────────────────

    const allCategoryNamesData = await cacheOrCompute('admin:categories:dropdown:v2', async () => {
      const allCategoriesRaw = await db.collection(CATEGORIES_COLLECTION)
        .find({}, { projection: { name: 1, parentCategory: 1 } })
        .sort({ name: 1 })
        .limit(500)
        .toArray()

      const existingParentNames = new Set(
        allCategoriesRaw
          .filter((cat) => (cat.parentCategory || 'None') === 'None')
          .map((cat) => cat.name)
      )

      return {
        names: allCategoriesRaw.map((cat) => ({
          _id: cat._id.toString(),
          name: cat.name || '',
          parentCategory: cat.parentCategory || 'None',
        })),
        existingParentNames: Array.from(existingParentNames),
      }
    }, 300_000) // 5-minute cache

    // ──────────────────────────────────────────────────────────────────
    // STEP 5: Build subcategory map — group by parent name.
    // ──────────────────────────────────────────────────────────────────

    const subcategoryDataMap: Record<string, any[]> = {}

    for (const sub of subCats) {
      const pn = sub.parentCategory
      if (!subcategoryDataMap[pn]) {
        subcategoryDataMap[pn] = []
      }
      subcategoryDataMap[pn].push({
        _id: sub._id.toString(),
        name: sub.name || '',
        description: sub.description || '',
        parentCategory: sub.parentCategory || 'None',
        status: sub.status || 'Active',
        createdBy: sub.createdBy || 'Admin',
        imageUrl: sub.imageUrl || null,
        imagePublicId: sub.imagePublicId || null,
        productCount: countMap[sub.name] || 0,
        highlights: sub.highlights || [],
        displayOrder: typeof sub.displayOrder === 'number' ? sub.displayOrder : 0,
        createdAt: sub.createdAt ? new Date(sub.createdAt).toISOString() : null,
        updatedAt: sub.updatedAt ? new Date(sub.updatedAt).toISOString() : null,
      })
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 6: Build the final hierarchical list.
    // ──────────────────────────────────────────────────────────────────

    const hierarchicalList: any[] = []

    // Add parent categories with their nested subcategories
    for (const cat of paginatedParents) {
      hierarchicalList.push({
        _id: cat._id.toString(),
        name: cat.name || '',
        description: cat.description || '',
        parentCategory: cat.parentCategory || 'None',
        status: cat.status || 'Active',
        createdBy: cat.createdBy || 'Admin',
        imageUrl: cat.imageUrl || null,
        imagePublicId: cat.imagePublicId || null,
        productCount: countMap[cat.name] || 0,
        subcategoryData: subcategoryDataMap[cat.name] || [],
        highlights: cat.highlights || [],
        displayOrder: typeof cat.displayOrder === 'number' ? cat.displayOrder : 0,
        createdAt: cat.createdAt ? new Date(cat.createdAt).toISOString() : null,
        updatedAt: cat.updatedAt ? new Date(cat.updatedAt).toISOString() : null,
      })
    }

    // Add orphan subcategories as standalone items (no parent exists in DB)
    for (const sub of orphanSubCats) {
      hierarchicalList.push({
        _id: sub._id.toString(),
        name: sub.name || '',
        description: sub.description || '',
        parentCategory: sub.parentCategory || 'None',
        status: sub.status || 'Active',
        createdBy: sub.createdBy || 'Admin',
        imageUrl: sub.imageUrl || null,
        imagePublicId: sub.imagePublicId || null,
        productCount: countMap[sub.name] || 0,
        subcategoryData: [],
        highlights: sub.highlights || [],
        displayOrder: typeof sub.displayOrder === 'number' ? sub.displayOrder : 0,
        createdAt: sub.createdAt ? new Date(sub.createdAt).toISOString() : null,
        updatedAt: sub.updatedAt ? new Date(sub.updatedAt).toISOString() : null,
      })
    }

    return NextResponse.json({
      categories: hierarchicalList,
      allCategoryNames: allCategoryNamesData.names,
      total: totalMatching,
      page,
      totalPages: Math.max(1, Math.ceil(totalMatching / limit)),
      cloudinaryConfigured: isUploadConfigured(),
    })
  } catch (error) {
    console.error('[Categories GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

/**
 * POST /api/admin/categories
 * Create a new category.
 * Accepts FormData with: name, description, parentCategory, status, image (file)
 * Image uploads require Cloudinary to be configured.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse form data ──
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const name = (formData.get('name') as string || '').trim()
    const description = (formData.get('description') as string || '').trim()
    const parentCategory = (formData.get('parentCategory') as string) || 'None'
    const status = (formData.get('status') as string) || 'Active'
    const imageFile = formData.get('image') as File | null

    const highlightsRaw = formData.get('highlights') as string || ''
    let highlights: string[] = []
    try {
      highlights = JSON.parse(highlightsRaw)
      if (!Array.isArray(highlights)) highlights = []
    } catch {
      highlights = []
    }

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    // ── Database connection ──
    const { db } = await connectToDatabase()

    // ── Check for duplicate name ──
    const existing = await db.collection(CATEGORIES_COLLECTION).findOne({
      name: { $regex: `^${name}$`, $options: 'i' },
    })
    if (existing) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    }

    // ── Upload image to Cloudinary if provided ──
    let imageUrl: string | null = null
    let imagePublicId: string | null = null

    if (imageFile && imageFile.size > 0) {
      // Validate MIME type
      if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF' },
          { status: 400 },
        )
      }

      // Validate file size
      if (imageFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File too large. Maximum size: 3.1 MB' },
          { status: 400 },
        )
      }

      // Upload image to Cloudinary
      try {
        const arrayBuffer = await imageFile.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const result = await uploadCategoryImage(buffer, imageFile.type, slug)
        imageUrl = result.url
        imagePublicId = result.publicId
      } catch (uploadError) {
        const uploadErrMsg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
        console.error('[Categories POST] Cloudinary upload failed:', uploadErrMsg)
        return NextResponse.json(
          { error: `Image upload failed: ${uploadErrMsg}. Try creating the category without an image.` },
          { status: 500 },
        )
      }
    }

    // ── Insert category into database ──
    const now = new Date()

    // Compute displayOrder for the new category:
    // - For parent categories: max(displayOrder) among parents + 1
    // - For subcategories: max(displayOrder) among siblings (same parent) + 1
    // This ensures new categories appear at the END of their respective list,
    // preserving the admin's existing ordering. Falls back to 0 if no siblings.
    const siblingFilter = parentCategory && parentCategory !== 'None'
      ? { parentCategory }
      : { $or: [{ parentCategory: 'None' }, { parentCategory: { $exists: false } }] }

    const maxOrderDoc = await db.collection(CATEGORIES_COLLECTION)
      .find(siblingFilter, { projection: { displayOrder: 1 } })
      .sort({ displayOrder: -1 })
      .limit(1)
      .toArray()

    const nextDisplayOrder = maxOrderDoc.length > 0 && typeof maxOrderDoc[0].displayOrder === 'number'
      ? maxOrderDoc[0].displayOrder + 1
      : 0

    const doc = {
      name,
      description,
      parentCategory,
      status,
      active: status === 'Active',
      createdBy: 'Admin',
      imageUrl,
      imagePublicId,
      highlights,
      displayOrder: nextDisplayOrder,
      createdAt: now,
      updatedAt: now,
    }

    try {
      const result = await db.collection(CATEGORIES_COLLECTION).insertOne(doc)

      // Invalidate caches so the new category appears immediately on the
      // public categories API and the admin dropdown.
      cacheInvalidate('public:categories')
      cacheInvalidate('admin:categories')

      return NextResponse.json({
        success: true,
        category: {
          _id: result.insertedId.toString(),
          ...doc,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      }, { status: 201 })
    } catch (dbError) {
      console.error('[Categories POST] Database insert failed:', dbError)
      return NextResponse.json(
        { error: 'Failed to save category to database. Please try again.' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('[Categories POST] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}

/**
 * PUT /api/admin/categories
 * Update an existing category.
 * Accepts FormData with: _id, name, description, parentCategory, status, image (file), removeImage (string "true")
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const _id = (formData.get('_id') as string || '').trim()
    const name = (formData.get('name') as string || '').trim()
    const description = (formData.get('description') as string || '').trim()
    const parentCategory = (formData.get('parentCategory') as string) || 'None'
    const status = (formData.get('status') as string) || 'Active'
    const imageFile = formData.get('image') as File | null
    const removeImage = formData.get('removeImage') as string || ''

    const highlightsRaw = formData.get('highlights') as string || ''
    let highlights: string[] = []
    try {
      highlights = JSON.parse(highlightsRaw)
      if (!Array.isArray(highlights)) highlights = []
    } catch {
      highlights = []
    }

    if (!_id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Check for duplicate name (excluding current category)
    const existing = await db.collection(CATEGORIES_COLLECTION).findOne({
      name: { $regex: `^${name}$`, $options: 'i' },
      _id: { $ne: new ObjectId(_id) },
    })
    if (existing) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    }

    // Get current category data to check for existing image
    const currentCategory = await db.collection(CATEGORIES_COLLECTION).findOne({
      _id: new ObjectId(_id),
    })
    if (!currentCategory) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    let imageUrl: string | null = currentCategory.imageUrl || null
    let imagePublicId: string | null = currentCategory.imagePublicId || null

    // If removeImage is set, delete the current image from Cloudinary
    if (removeImage === 'true' && imagePublicId) {
      await deleteCategoryImageFile(imagePublicId)
      imageUrl = null
      imagePublicId = null
    }

    // Upload new image to Cloudinary if provided
    if (imageFile && imageFile.size > 0) {
      // Validate MIME type
      if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF' },
          { status: 400 },
        )
      }

      // Validate file size
      if (imageFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File too large. Maximum size: 3.1 MB' },
          { status: 400 },
        )
      }

      // Delete old image from Cloudinary if exists
      if (imagePublicId) {
        await deleteCategoryImageFile(imagePublicId)
      }

      // Upload new image to Cloudinary
      try {
        const arrayBuffer = await imageFile.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const result = await uploadCategoryImage(buffer, imageFile.type, slug)

        imageUrl = result.url
        imagePublicId = result.publicId
      } catch (uploadError) {
        const uploadErrMsg = uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
        console.error('[Categories PUT] Cloudinary upload failed:', uploadErrMsg)
        return NextResponse.json(
          { error: `Image upload failed: ${uploadErrMsg}. Try updating the category without changing the image.` },
          { status: 500 },
        )
      }
    }

    const now = new Date()
    const updateDoc = {
      name,
      description,
      parentCategory,
      status,
      active: status === 'Active',
      imageUrl,
      imagePublicId,
      highlights,
      updatedAt: now,
    }

    const result = await db.collection(CATEGORIES_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(_id) },
      { $set: updateDoc },
      { returnDocument: 'after' },
    )

    if (!result) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Invalidate caches so the updated category data is reflected immediately
    // on the public categories API and the admin dropdown.
    cacheInvalidate('public:categories')
    cacheInvalidate('admin:categories')

    return NextResponse.json({
      success: true,
      category: {
        _id: result._id.toString(),
        name: result.name,
        description: result.description,
        parentCategory: result.parentCategory,
        status: result.status,
        createdBy: result.createdBy,
        imageUrl: result.imageUrl,
        imagePublicId: result.imagePublicId || null,
        highlights: result.highlights || [],
        createdAt: result.createdAt ? new Date(result.createdAt).toISOString() : null,
        updatedAt: now.toISOString(),
      },
    })
  } catch (error) {
    console.error('[Categories PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/categories
 * Delete a category by ID.
 * Also removes the category image from Cloudinary.
 * Body: { _id } or query param ?id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let _id: string | null = null

    // Try to get ID from body first, then from query params
    try {
      const body = await request.json()
      _id = body._id || null
    } catch {
      // Body might be empty, try query params
    }

    if (!_id) {
      const { searchParams } = new URL(request.url)
      _id = searchParams.get('id')
    }

    if (!_id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    const result = await db.collection(CATEGORIES_COLLECTION).findOneAndDelete({
      _id: new ObjectId(_id),
    })

    if (!result) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Delete the category image from Cloudinary
    if (result.imagePublicId) {
      await deleteCategoryImageFile(result.imagePublicId)
    }

    // Invalidate caches so the deleted category disappears immediately
    // from the public categories API and the admin dropdown.
    cacheInvalidate('public:categories')
    cacheInvalidate('admin:categories')

    return NextResponse.json({
      success: true,
      deletedCategory: {
        _id: result._id.toString(),
        name: result.name,
      },
    })
  } catch (error) {
    console.error('[Categories DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/categories
 * Bulk-update the displayOrder of categories (and optionally their parentCategory).
 *
 * Body:
 *   {
 *     items: [
 *       { _id: string, displayOrder: number, parentCategory?: string },
 *       ...
 *     ]
 *   }
 *
 * This is used by the admin drag-and-drop reorder UI. Each item specifies the
 * new displayOrder for a category. If parentCategory is provided, the category
 * is also moved to that parent (used when reordering subcategories within a
 * different parent, though the current UI only reorders within the same parent).
 *
 * The operation is atomic — all updates succeed or all fail. We use bulkWrite
 * with updateOne operations for efficiency.
 *
 * After the update, caches are invalidated so the new order is reflected
 * immediately on the public categories API.
 */
export async function PATCH(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'items array is required and must not be empty' }, { status: 400 })
    }

    // Validate each item — must have _id and numeric displayOrder
    const updates: Array<{ _id: string; displayOrder: number; parentCategory?: string }> = []
    for (const item of body.items) {
      if (!item._id || typeof item._id !== 'string') {
        return NextResponse.json({ error: 'Each item must have a valid _id' }, { status: 400 })
      }
      if (typeof item.displayOrder !== 'number' || !Number.isFinite(item.displayOrder) || item.displayOrder < 0) {
        return NextResponse.json({ error: `Invalid displayOrder for item ${item._id}: must be a non-negative number` }, { status: 400 })
      }
      // Try to convert _id to ObjectId; reject if invalid
      try {
        new ObjectId(item._id)
      } catch {
        return NextResponse.json({ error: `Invalid category ID: ${item._id}` }, { status: 400 })
      }
      updates.push({
        _id: item._id,
        displayOrder: Math.floor(item.displayOrder),
        ...(typeof item.parentCategory === 'string' ? { parentCategory: item.parentCategory } : {}),
      })
    }

    const { db } = await connectToDatabase()

    // Build bulk update operations — one updateOne per item.
    // We only $set displayOrder (and parentCategory if provided), leaving all
    // other fields untouched. updatedAt is refreshed for audit trail.
    const now = new Date()
    const bulkOps = updates.map((u) => {
      const setFields: Record<string, unknown> = {
        displayOrder: u.displayOrder,
        updatedAt: now,
      }
      if (u.parentCategory !== undefined) {
        setFields.parentCategory = u.parentCategory
      }
      return {
        updateOne: {
          filter: { _id: new ObjectId(u._id) },
          update: { $set: setFields },
        },
      }
    })

    const result = await db.collection(CATEGORIES_COLLECTION).bulkWrite(bulkOps)

    // Invalidate caches so the new order is reflected immediately
    cacheInvalidate('public:categories')
    cacheInvalidate('admin:categories')

    return NextResponse.json({
      success: true,
      updated: result.modifiedCount || updates.length,
      message: `Reordered ${updates.length} categor${updates.length === 1 ? 'y' : 'ies'}`,
    })
  } catch (error) {
    console.error('[Categories PATCH Error]', error)
    return NextResponse.json({ error: 'Failed to reorder categories' }, { status: 500 })
  }
}
