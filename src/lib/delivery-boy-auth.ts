import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'realcart-delivery-boy-secret-key-2024-super-secure'
)

const DELIVERY_BOY_COOKIE_NAME = 'delivery-boy-session'

export interface DeliveryBoyPayload {
  id: string
  mobile: string
  name: string
  role: 'delivery_boy'
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
 * Create a JWT session token for a delivery boy
 */
export async function createDeliveryBoySessionToken(deliveryBoy: DeliveryBoyPayload): Promise<string> {
  const token = await new SignJWT({
    id: deliveryBoy.id,
    mobile: deliveryBoy.mobile,
    name: deliveryBoy.name,
    role: deliveryBoy.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // 30 days for delivery boy sessions
    .sign(SECRET)

  return token
}

/**
 * Verify a delivery boy JWT session token
 */
export async function verifyDeliveryBoySessionToken(token: string): Promise<DeliveryBoyPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as DeliveryBoyPayload
  } catch {
    return null
  }
}

/**
 * Get delivery boy session from request cookies
 */
export async function getDeliveryBoySession(request: NextRequest): Promise<DeliveryBoyPayload | null> {
  const token = request.cookies.get(DELIVERY_BOY_COOKIE_NAME)?.value
  if (!token) return null
  return verifyDeliveryBoySessionToken(token)
}

/**
 * Create a response that sets the delivery boy session cookie
 */
export async function createDeliveryBoySessionResponse(deliveryBoy: DeliveryBoyPayload): Promise<NextResponse> {
  const token = await createDeliveryBoySessionToken(deliveryBoy)
  const response = NextResponse.json({
    success: true,
    user: { id: deliveryBoy.id, mobile: deliveryBoy.mobile, name: deliveryBoy.name, role: deliveryBoy.role },
  })
  response.cookies.set(DELIVERY_BOY_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return response
}

/**
 * Clear the delivery boy session cookie
 */
export function clearDeliveryBoySessionResponse(): NextResponse {
  const response = NextResponse.json({ success: true })
  response.cookies.set(DELIVERY_BOY_COOKIE_NAME, '', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
