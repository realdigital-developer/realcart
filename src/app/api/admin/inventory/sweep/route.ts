/**
 * Admin Inventory Reservation Sweep API
 *
 * POST /api/admin/inventory/sweep
 *   Trigger a manual sweep of expired stock reservations, releasing the
 *   reserved stock back to the products. Safe to call repeatedly; intended
 *   for manual maintenance or as a cron target.
 *
 *   Returns: { success, released }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { sweepExpiredReservations } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await sweepExpiredReservations()

    return NextResponse.json({
      success: true,
      released: result.released,
    })
  } catch (error) {
    console.error('[Admin Inventory Sweep] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sweep expired reservations',
        message: (error as Error).message,
      },
      { status: 500 },
    )
  }
}
