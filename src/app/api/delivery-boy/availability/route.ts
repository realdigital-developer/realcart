import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { authenticateDeliveryBoy } from '@/lib/delivery-boy-api-auth'
import { ObjectId } from 'mongodb'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  PUT /api/delivery-boy/availability                                 */
/*  Toggle delivery boy availability status.                            */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const { error, session } = await authenticateDeliveryBoy(request)
    if (error || !session) return error

    const { db } = await connectToDatabase()
    const body = await request.json()
    const { isAvailable } = body

    if (typeof isAvailable !== 'boolean') {
      return NextResponse.json({ error: 'isAvailable must be a boolean' }, { status: 400 })
    }

    let updateFilter: any
    try {
      updateFilter = { _id: new ObjectId(session.id) }
    } catch {
      updateFilter = { mobile: session.mobile }
    }

    await db.collection('delivery_boys').updateOne(
      updateFilter,
      { $set: { isAvailable, updatedAt: new Date() } },
    )

    return NextResponse.json({
      success: true,
      isAvailable,
    })
  } catch (error) {
    console.error('[Delivery Boy Availability PUT Error]', error)
    return NextResponse.json({ error: 'Failed to update availability' }, { status: 500 })
  }
}
