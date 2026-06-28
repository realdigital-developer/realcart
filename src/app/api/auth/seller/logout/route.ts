import { NextRequest } from 'next/server'
import { clearSellerSessionResponse } from '@/lib/seller-auth'

/**
 * POST /api/auth/seller/logout
 * Logout the seller by clearing the session cookie
 */
export async function POST(_request: NextRequest) {
  return clearSellerSessionResponse()
}
