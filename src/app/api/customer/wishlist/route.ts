import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { computePriceInfo } from '@/lib/product-utils'

/**
 * GET /api/customer/wishlist
 * Get the authenticated customer's wishlist
 *
 * OPTIMIZED: Uses bulk $in query instead of N+1 findOne per item.
 * Previously: 1 findOne() per wishlist item = 50 concurrent queries for 50 items.
 * Now: 1 find($in) query + JS-side lookup = 1 DB call regardless of wishlist size.
 */
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const wishlist = await db.collection('wishlists').findOne({ customerId: customer.id })

    if (!wishlist) {
      return NextResponse.json({ items: [] })
    }

    const wishlistItems: any[] = wishlist.items || []

    // Bulk $in query — fetch all products in a single DB call
    const productIds = wishlistItems
      .map((item: any) => {
        try { return new ObjectId(item.productId) } catch { return null }
      })
      .filter(Boolean)

    const products = productIds.length > 0
      ? await db.collection('products')
          .find({ _id: { $in: productIds } })
          .project({ name: 1, price: 1, mrp: 1, sellingPrice: 1, specialPrice: 1, specialPriceStartDate: 1, specialPriceEndDate: 1, imageUrl: 1, images: 1, stock: 1, seller: 1, brand: 1, discounts: 1, status: 1, active: 1 })
          .toArray()
      : []

    // Build lookup map for O(1) access
    const productMap = new Map<string, any>()
    for (const p of products) {
      productMap.set(p._id.toString(), p)
    }

    // Enrich items with latest product data
    const enrichedItems = wishlistItems.map((item: any) => {
      const product = productMap.get(item.productId)

      if (!product || product.status !== 'Published' || !product.active) {
        return { ...item, unavailable: true }
      }

      // Recalculate effective price using production pricing logic
      const priceInfo = computePriceInfo({
        mrp: product.mrp ?? product.price,
        sellingPrice: product.sellingPrice ?? product.price,
        specialPrice: product.specialPrice,
        specialPriceStartDate: product.specialPriceStartDate,
        specialPriceEndDate: product.specialPriceEndDate,
        hsnCode: product.shipping?.hsnCode,
        gstRate: product.shipping?.gstRate,
      })

      let effectivePrice = priceInfo.effectivePrice
      let hasDiscount = priceInfo.hasDiscount
      let discountPercent = priceInfo.discountPercent
      const basePrice = priceInfo.mrp

      // Legacy discounts fallback
      if (!hasDiscount && Array.isArray(product.discounts) && product.discounts.length > 0) {
        const enabled = product.discounts.filter((d: any) => d.enabled !== false && d.title)
        if (enabled.length > 0) {
          const lowest = Math.min(...enabled.map((d: any) => Number(d.price) || 0))
          if (lowest > 0 && lowest < basePrice) {
            effectivePrice = lowest
            hasDiscount = true
            discountPercent = Math.round(((basePrice - lowest) / basePrice) * 100)
          }
        }
      }

      let bestImage = ''
      if (product.imageUrl?.trim()) bestImage = product.imageUrl.trim()
      else if (Array.isArray(product.images) && product.images.length > 0) {
        const first = product.images.find((img: any) => img?.url?.trim())
        if (first) bestImage = first.url.trim()
        else {
          const firstStr = product.images.find((img: string) => img?.trim())
          if (firstStr) bestImage = firstStr.trim()
        }
      }

      return {
        ...item,
        name: product.name,
        price: basePrice,
        sellingPrice: priceInfo.sellingPrice,
        effectivePrice,
        hasDiscount,
        discountPercent,
        imageUrl: bestImage,
        stock: product.stock || 0,
        seller: product.seller || '',
        brand: product.brand || '',
        unavailable: false,
      }
    })

    // Remove unavailable items
    const validItems = enrichedItems.filter((item: any) => !item.unavailable)
    const unavailableIds = enrichedItems.filter((item: any) => item.unavailable).map((item: any) => item.productId)
    if (unavailableIds.length > 0) {
      await db.collection('wishlists').updateOne(
        { customerId: customer.id },
        { $pull: { items: { productId: { $in: unavailableIds } } } }
      )
    }

    return NextResponse.json({ items: validItems })
  } catch (error) {
    console.error('[Wishlist GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch wishlist' }, { status: 500 })
  }
}

/**
 * POST /api/customer/wishlist
 * Add item to wishlist
 * Body: { productId }
 */
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { productId } = body

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Verify product exists
    const product = await db.collection('products').findOne({
      _id: new ObjectId(productId),
      status: 'Published',
      active: true,
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not available' }, { status: 404 })
    }

    // Calculate effective price using production pricing logic
    const priceInfo = computePriceInfo({
      mrp: product.mrp ?? product.price,
      sellingPrice: product.sellingPrice ?? product.price,
      specialPrice: product.specialPrice,
      specialPriceStartDate: product.specialPriceStartDate,
      specialPriceEndDate: product.specialPriceEndDate,
      hsnCode: product.shipping?.hsnCode,
      gstRate: product.shipping?.gstRate,
    })

    let effectivePrice = priceInfo.effectivePrice
    let hasDiscount = priceInfo.hasDiscount
    let discountPercent = priceInfo.discountPercent
    const basePrice = priceInfo.mrp

    // Legacy discounts fallback
    if (!hasDiscount && Array.isArray(product.discounts) && product.discounts.length > 0) {
      const enabled = product.discounts.filter((d: any) => d.enabled !== false && d.title)
      if (enabled.length > 0) {
        const lowest = Math.min(...enabled.map((d: any) => Number(d.price) || 0))
        if (lowest > 0 && lowest < basePrice) {
          effectivePrice = lowest
          hasDiscount = true
          discountPercent = Math.round(((basePrice - lowest) / basePrice) * 100)
        }
      }
    }

    let bestImage = ''
    if (product.imageUrl?.trim()) bestImage = product.imageUrl.trim()
    else if (Array.isArray(product.images) && product.images.length > 0) {
      const first = product.images.find((img: any) => img?.url?.trim())
      if (first) bestImage = first.url.trim()
      else {
        const firstStr = product.images.find((img: string) => img?.trim())
        if (firstStr) bestImage = firstStr.trim()
      }
    }

    const newItem = {
      productId,
      name: product.name,
      price: basePrice,
      sellingPrice: priceInfo.sellingPrice,
      effectivePrice,
      hasDiscount,
      discountPercent,
      imageUrl: bestImage,
      stock: product.stock || 0,
      seller: product.seller || '',
      brand: product.brand || '',
      addedAt: new Date().toISOString(),
    }

    // Check if already in wishlist
    const existing = await db.collection('wishlists').findOne({
      customerId: customer.id,
      'items.productId': productId,
    })

    if (existing) {
      return NextResponse.json({ success: true, message: 'Already in wishlist', alreadyExists: true })
    }

    // Upsert wishlist
    await db.collection('wishlists').updateOne(
      { customerId: customer.id },
      {
        $push: { items: newItem },
        $set: { updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    )

    return NextResponse.json({ success: true, message: 'Added to wishlist' })
  } catch (error) {
    console.error('[Wishlist POST Error]', error)
    return NextResponse.json({ error: 'Failed to add to wishlist' }, { status: 500 })
  }
}

/**
 * DELETE /api/customer/wishlist
 * Remove item from wishlist
 * Body: { productId } or { clearAll: true }
 */
export async function DELETE(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { productId, clearAll } = body
    const { db } = await connectToDatabase()

    if (clearAll) {
      await db.collection('wishlists').updateOne(
        { customerId: customer.id },
        { $set: { items: [], updatedAt: new Date() } }
      )
    } else if (productId) {
      await db.collection('wishlists').updateOne(
        { customerId: customer.id },
        { $pull: { items: { productId } }, $set: { updatedAt: new Date() } }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Wishlist DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to remove from wishlist' }, { status: 500 })
  }
}
