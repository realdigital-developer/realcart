import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateSeller } from '@/lib/seller-api-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/seller/delivery-boys
 * Fetch active & available delivery boys for seller to assign to orders.
 * Only returns delivery boys with status "Active" and isAvailable = true.
 */
export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()

    // Fetch only active and available delivery boys
    // Use case-insensitive query for robustness (stored as 'Active' but could vary)
    const deliveryBoys = await db.collection('delivery_boys')
      .find({
        status: { $regex: /^active$/i },
        isAvailable: true,
      })
      .project({
        passcodeHash: 0, // Never expose password hash
      })
      .sort({ name: 1 })
      .toArray()

    // Format for frontend consumption — only expose safe fields
    const safeDeliveryBoys = deliveryBoys.map((d) => ({
      _id: d._id.toString(),
      name: d.name || '',
      mobile: d.mobile || '',
      vehicleType: d.vehicleType || '',
      vehicleNumber: d.vehicleNumber || '',
      profileImage: d.profileImage || '',
      isAvailable: d.isAvailable ?? true,
    }))

    return NextResponse.json({
      deliveryBoys: safeDeliveryBoys,
      total: safeDeliveryBoys.length,
    })
  } catch (error) {
    console.error('[Seller Delivery Boys GET Error]', error)
    return NextResponse.json({ error: 'Failed to fetch delivery boys' }, { status: 500 })
  }
}
