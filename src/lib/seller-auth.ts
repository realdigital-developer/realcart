import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'realcart-seller-secret-key-2024-super-secure'
)

const SELLER_COOKIE_NAME = 'seller-session'

export interface SellerPayload {
  id: string
  email: string
  name: string
  storeName: string
  role: 'seller'
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

/**
 * Verify a password against a bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Validate password strength (min 8 chars, at least 1 letter, 1 number)
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password)
}

/**
 * Create a JWT session token for a seller
 */
export async function createSellerSessionToken(seller: SellerPayload): Promise<string> {
  const token = await new SignJWT({
    id: seller.id,
    email: seller.email,
    name: seller.name,
    storeName: seller.storeName,
    role: seller.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // 7 days for seller sessions
    .sign(SECRET)

  return token
}

/**
 * Verify a seller JWT session token
 */
export async function verifySellerSessionToken(token: string): Promise<SellerPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as SellerPayload
  } catch {
    return null
  }
}

/**
 * Get seller session from request cookies
 */
export async function getSellerSession(request: NextRequest): Promise<SellerPayload | null> {
  const token = request.cookies.get(SELLER_COOKIE_NAME)?.value
  if (!token) return null
  return verifySellerSessionToken(token)
}

/**
 * Create a response that sets the seller session cookie
 */
export async function createSellerSessionResponse(seller: SellerPayload): Promise<NextResponse> {
  const token = await createSellerSessionToken(seller)
  const response = NextResponse.json({
    success: true,
    user: {
      id: seller.id,
      email: seller.email,
      name: seller.name,
      storeName: seller.storeName,
      role: seller.role,
    },
  })
  response.cookies.set(SELLER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
  return response
}

/**
 * Clear the seller session cookie
 */
export function clearSellerSessionResponse(): NextResponse {
  const response = NextResponse.json({ success: true })
  response.cookies.set(SELLER_COOKIE_NAME, '', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
