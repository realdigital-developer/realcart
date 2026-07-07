import { NextRequest } from 'next/server'
import { clearDeliveryBoySessionResponse } from '@/lib/delivery-boy-auth'

/**
 * POST /api/auth/delivery-boy/logout
 * Logout the delivery boy by clearing the session cookie
 */
export async function POST(_request: NextRequest) {
  return clearDeliveryBoySessionResponse()
}
