/**
 * Seller Inventory Forecast API
 *
 * GET /api/seller/inventory/forecast
 *   Generates a demand forecast for a single product owned by the authenticated
 *   seller, based on a moving average of daily sales (order movements) over the
 *   last `lookbackDays` and projected forward for `horizonDays`.
 *
 *   Query params:
 *     - productId (required)
 *     - lookbackDays (default 30)
 *     - horizonDays (default 30)
 *
 *   Response: the forecast object returned by getInventoryForecast, augmented
 *   with the input parameters for client convenience.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { getInventoryForecast } from '@/lib/inventory-manager'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId') || ''
    const lookbackDays = Math.max(1, parseInt(searchParams.get('lookbackDays') || '30'))
    const horizonDays = Math.max(1, parseInt(searchParams.get('horizonDays') || '30'))

    if (!productId) {
      return NextResponse.json(
        { error: 'productId query parameter is required' },
        { status: 400 },
      )
    }

    // Authorize: the product must belong to this seller.
    const sellerIds = [session.id, ...session.sellerAliases]
    const { db } = await connectToDatabase()
    let product: any = null
    try {
      product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
    } catch {
      /* _id may be a string */
    }
    if (!product) {
      product = await db.collection('products').findOne({ _id: productId as any })
    }
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const belongsToSeller =
      sellerIds.includes(product.sellerId) ||
      sellerIds.includes(product.seller) ||
      sellerIds.includes(product.storeName)
    if (!belongsToSeller) {
      return NextResponse.json(
        { error: 'You do not own this product' },
        { status: 403 },
      )
    }

    const forecast = await getInventoryForecast(productId, lookbackDays, horizonDays)

    return NextResponse.json({
      ...forecast,
      lookbackDays,
      horizonDays,
    })
  } catch (error) {
    console.error('[Seller Inventory Forecast] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate forecast', message: (error as Error).message },
      { status: 500 },
    )
  }
}
