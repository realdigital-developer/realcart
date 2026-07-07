import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'realcart-customer-secret-key-2024-super-secure'
)

export const CUSTOMER_COOKIE_NAME = 'customer-session'

export interface CustomerPayload {
  id: string
  mobile: string
  name: string
  role: 'customer'
}

/**
 * Hash a 6-digit passcode using bcrypt
 */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(passcode, salt)
}

/**
 * Verify a 6-digit passcode against a bcrypt hash
 */
export async function verifyPasscode(passcode: string, hash: string): Promise<boolean> {
  return bcrypt.compare(passcode, hash)
}

/**
 * Validate that a passcode is exactly 6 digits
 */
export function isValidPasscode(passcode: string): boolean {
  return /^\d{6}$/.test(passcode)
}

/**
 * Create a JWT session token for a customer
 */
export async function createCustomerSessionToken(customer: CustomerPayload): Promise<string> {
  const token = await new SignJWT({
    id: customer.id,
    mobile: customer.mobile,
    name: customer.name,
    role: customer.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // 30 days for customer sessions
    .sign(SECRET)

  return token
}

/**
 * Verify a customer JWT session token
 */
export async function verifyCustomerSessionToken(token: string): Promise<CustomerPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as CustomerPayload
  } catch {
    return null
  }
}

/**
 * Get customer session from request cookies
 */
export async function getCustomerSession(request: NextRequest): Promise<CustomerPayload | null> {
  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value
  if (!token) return null
  return verifyCustomerSessionToken(token)
}

/**
 * Verify customer session using cookies() - works in API routes without NextRequest
 */
export async function verifyCustomerSession(): Promise<CustomerPayload | null> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const token = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value
    if (!token) return null
    return verifyCustomerSessionToken(token)
  } catch {
    return null
  }
}

/**
 * Create a response that sets the customer session cookie
 */
export async function createCustomerSessionResponse(customer: CustomerPayload): Promise<NextResponse> {
  const token = await createCustomerSessionToken(customer)
  const response = NextResponse.json({
    success: true,
    user: { id: customer.id, mobile: customer.mobile, name: customer.name, role: customer.role },
  })
  response.cookies.set(CUSTOMER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return response
}

/**
 * Clear the customer session cookie
 */
export function clearCustomerSessionResponse(): NextResponse {
  const response = NextResponse.json({ success: true })
  response.cookies.set(CUSTOMER_COOKIE_NAME, '', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
