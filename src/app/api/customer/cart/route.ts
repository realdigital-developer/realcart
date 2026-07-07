import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { computePriceInfo } from '@/lib/product-utils'
import { releaseReservation } from '@/lib/inventory-manager'

/**
 * GET /api/customer/cart
 * Get the authenticated customer's cart
 */
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const cart = await db.collection('carts').findOne({ customerId: customer.id })

    if (!cart) {
      return NextResponse.json({
        items: [],
        totalItems: 0,
        totalPrice: 0,
        totalSavings: 0,
      })
    }

    // Enrich cart items with latest product data — bulk $in query instead of N+1
    const cartItems: any[] = cart.items || []
    const productIds = cartItems
      .map((item: any) => {
        try { return new ObjectId(item.productId) } catch { return null }
      })
      .filter(Boolean)

    const products = productIds.length > 0
      ? await db.collection('products')
          .find({ _id: { $in: productIds } })
          .project({ name: 1, price: 1, mrp: 1, sellingPrice: 1, specialPrice: 1, specialPriceStartDate: 1, specialPriceEndDate: 1, imageUrl: 1, images: 1, stock: 1, seller: 1, brand: 1, discounts: 1, status: 1, active: 1, category: 1, sellerId: 1 })
          .toArray()
      : []

    // Build a lookup map for O(1) access
    const productMap = new Map<string, any>()
    for (const p of products) {
      productMap.set(p._id.toString(), p)
    }

    const enrichedItems = cartItems.map((item: any) => {
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

      // Legacy discounts fallback (for products created with old schema)
      let effectivePrice = priceInfo.effectivePrice
      let hasDiscount = priceInfo.hasDiscount
      let discountPercent = priceInfo.discountPercent
      const basePrice = priceInfo.mrp

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

      // Get best image
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
        // Carry sellingPrice so the checkout price breakup can split the
        // discount into "Product Discount" (MRP→sellingPrice) and a distinct
        // "Special Offer" line (sellingPrice→effectivePrice) when a limited-
        // time special price is active. Falls back to effectivePrice for
        // legacy products without a separate sellingPrice.
        sellingPrice: priceInfo.sellingPrice,
        effectivePrice,
        hasDiscount,
        discountPercent,
        imageUrl: bestImage,
        stock: product.stock || 0,
        seller: product.seller || '',
        brand: product.brand || '',
        // Category + sellerId for coupon applicability checks (optional,
        // backward compatible — legacy carts without these still work).
        category: product.category || '',
        sellerId: product.sellerId ? String(product.sellerId) : '',
        unavailable: false,
      }
    })

    const validItems = enrichedItems.filter((item: any) => !item.unavailable)
    const totalItems = validItems.reduce((sum: number, item: any) => sum + item.quantity, 0)
    const totalPrice = validItems.reduce((sum: number, item: any) => sum + (item.effectivePrice * item.quantity), 0)
    const totalSavings = validItems.reduce((sum: number, item: any) => sum + ((item.price - item.effectivePrice) * item.quantity), 0)

    // Remove unavailable items from cart
    const unavailableIds = enrichedItems.filter((item: any) => item.unavailable).map((item: any) => item.productId)
    if (unavailableIds.length > 0) {
      await db.collection('carts').updateOne(
        { customerId: customer.id },
        { $pull: { items: { productId: { $in: unavailableIds } } } }
      )
    }

    return NextResponse.json({
      items: validItems,
      totalItems,
      totalPrice: Math.round(totalPrice * 100) / 100,
      totalSavings: Math.round(totalSavings * 100) / 100,
    })
  } catch (error) {
    console.error('[Cart GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch cart' }, { status: 500 })
  }
}

/**
 * POST /api/customer/cart
 * Add item to cart or update quantity
 * Body: { productId, quantity, selectedVariant? }
 */
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { productId, quantity = 1, selectedVariant = {} } = body

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Verify product exists and is available
    const product = await db.collection('products').findOne({
      _id: new ObjectId(productId),
      status: 'Published',
      active: true,
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not available' }, { status: 404 })
    }

    // Validate variant selection for products with variant attributes
    const variantAttributes: string[] = product.variantAttributes || []
    if (variantAttributes.length > 0) {
      const selectedKeys = Object.keys(selectedVariant || {}).filter(k => (selectedVariant as Record<string, string>)[k])
      const missingAttrs = variantAttributes.filter(attr => !selectedKeys.includes(attr))
      if (missingAttrs.length > 0) {
        return NextResponse.json({
          error: `Please select ${missingAttrs.join(', ')} before adding to cart`,
          missingAttributes: missingAttrs,
        }, { status: 400 })
      }
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

    // Legacy discounts fallback (for products created with old schema)
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

    // Get best image
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

    const variantKey = JSON.stringify(selectedVariant)

    // Upsert cart
    const cart = await db.collection('carts').findOne({ customerId: customer.id })

    if (cart) {
      // Check if item already exists with same variant
      const existingIndex = (cart.items || []).findIndex(
        (item: any) => item.productId === productId && JSON.stringify(item.selectedVariant || {}) === variantKey
      )

      if (existingIndex >= 0) {
        // Update quantity of existing item — use index-based update to match exact variant
        const currentQty = cart.items[existingIndex].quantity || 0
        const newQty = Math.min(currentQty + quantity, product.stock || 99)

        await db.collection('carts').updateOne(
          { customerId: customer.id },
          { $set: { [`items.${existingIndex}.quantity`]: newQty, [`items.${existingIndex}.effectivePrice`]: effectivePrice, [`items.${existingIndex}.sellingPrice`]: priceInfo.sellingPrice, updatedAt: new Date() } }
        )
      } else {
        // Add new item
        const newItem = {
          productId,
          name: product.name,
          price: basePrice,
          sellingPrice: priceInfo.sellingPrice,
          effectivePrice,
          hasDiscount,
          discountPercent,
          imageUrl: bestImage,
          quantity: Math.min(quantity, product.stock || 99),
          stock: product.stock || 0,
          seller: product.seller || '',
          brand: product.brand || '',
          category: product.category || '',
          sellerId: product.sellerId ? String(product.sellerId) : '',
          selectedVariant,
          addedAt: new Date().toISOString(),
        }

        await db.collection('carts').updateOne(
          { customerId: customer.id },
          { $push: { items: newItem }, $set: { updatedAt: new Date() } }
        )
      }
    } else {
      // Create new cart
      const newItem = {
        productId,
        name: product.name,
        price: basePrice,
        sellingPrice: priceInfo.sellingPrice,
        effectivePrice,
        hasDiscount,
        discountPercent,
        imageUrl: bestImage,
        quantity: Math.min(quantity, product.stock || 99),
        stock: product.stock || 0,
        seller: product.seller || '',
        brand: product.brand || '',
        category: product.category || '',
        sellerId: product.sellerId ? String(product.sellerId) : '',
        selectedVariant,
        addedAt: new Date().toISOString(),
      }

      await db.collection('carts').insertOne({
        customerId: customer.id,
        items: [newItem],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    return NextResponse.json({ success: true, message: 'Item added to cart' })
  } catch (error) {
    console.error('[Cart POST Error]', error)
    return NextResponse.json({ error: 'Failed to add to cart' }, { status: 500 })
  }
}

/**
 * PUT /api/customer/cart
 * Update item quantity
 * Body: { productId, quantity, selectedVariant? }
 */
export async function PUT(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { productId, quantity, selectedVariant = {} } = body

    if (!productId || quantity === undefined) {
      return NextResponse.json({ error: 'Product ID and quantity required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const variantKey = JSON.stringify(selectedVariant)

    if (quantity <= 0) {
      // Remove item — use variant-aware filter to avoid removing wrong variant
      const removeFilter: Record<string, unknown> = { productId }
      if (selectedVariant && Object.keys(selectedVariant).length > 0) {
        removeFilter.selectedVariant = selectedVariant
      }
      await db.collection('carts').updateOne(
        { customerId: customer.id },
        { $pull: { items: removeFilter } as any, $set: { updatedAt: new Date() } }
      )
    } else {
      // Update quantity
      const cart = await db.collection('carts').findOne({ customerId: customer.id })
      if (cart) {
        const items = (cart.items || []).map((item: any) => {
          if (item.productId === productId && JSON.stringify(item.selectedVariant || {}) === variantKey) {
            return { ...item, quantity: Math.min(quantity, item.stock || 99) }
          }
          return item
        })
        await db.collection('carts').updateOne(
          { customerId: customer.id },
          { $set: { items, updatedAt: new Date() } }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Cart PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update cart' }, { status: 500 })
  }
}

/**
 * DELETE /api/customer/cart
 * Remove item(s) from cart
 * Body: { productId?, selectedVariant?, clearAll? }
 */
export async function DELETE(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { productId, selectedVariant, clearAll } = body
    const { db } = await connectToDatabase()

    if (clearAll) {
      await db.collection('carts').updateOne(
        { customerId: customer.id },
        { $set: { items: [], updatedAt: new Date() } }
      )
    } else if (productId) {
      const variantKey = JSON.stringify(selectedVariant || {})
      const cart = await db.collection('carts').findOne({ customerId: customer.id })
      if (cart) {
        const remaining = (cart.items || []).filter(
          (item: any) => !(item.productId === productId && JSON.stringify(item.selectedVariant || {}) === variantKey)
        )
        await db.collection('carts').updateOne(
          { customerId: customer.id },
          { $set: { items: remaining, updatedAt: new Date() } }
        )
      }

      // === Inventory: Release any active stock reservation for this product + customer ===
      // Non-fatal — if we can't cleanly find/release it, the TTL sweeper will catch it.
      try {
        const activeReservation = await db.collection('stock_reservations').findOne({
          productId,
          customerId: customer.id,
          status: 'active',
        })
        if (activeReservation?.reservationId) {
          try {
            await releaseReservation(activeReservation.reservationId, 'Cart item removed')
          } catch (relErr) {
            console.warn(`[Cart DELETE] releaseReservation ${activeReservation.reservationId} failed:`, relErr)
          }
        }
      } catch (relErr) {
        console.warn('[Cart DELETE] Failed to lookup/release stock reservation:', relErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Cart DELETE Error]', error)
    return NextResponse.json({ error: 'Failed to remove from cart' }, { status: 500 })
  }
}
