import { NextRequest } from 'next/server'
import { clearCustomerSessionResponse } from '@/lib/customer-auth'

/**
 * POST /api/auth/customer/logout
 * Logout the customer by clearing the session cookie
 */
export async function POST(_request: NextRequest) {
  return clearCustomerSessionResponse()
}
