import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'realcart-admin-secret-key-2024-super-secure')

const ADMIN_EMAIL = 'admin@realcart.com'
const ADMIN_PASSWORD_HASH = '$2b$10$o38ZddJ7kwNxWDRBHbyWYuEW2EgYLFraLtnaM5i26YDbD3bPwdLO.' // admin123

export async function verifyCredentials(email: string, password: string) {
  if (email !== ADMIN_EMAIL) return null

  const isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH)
  if (!isValid) return null

  return {
    id: '1',
    email: ADMIN_EMAIL,
    name: 'RealCart Admin',
    role: 'admin',
  }
}

export async function createSessionToken(user: { id: string; email: string; name: string; role: string }) {
  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET)

  return token
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as { id: string; email: string; name: string; role: string }
  } catch {
    return null
  }
}

export async function getSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get('admin-session')?.value
  if (!token) return null
  return verifySessionToken(token)
}

export function createSessionResponse(user: { id: string; email: string; name: string; role: string }) {
  return createSessionToken(user).then(token => {
    const response = NextResponse.json({ success: true, user })
    response.cookies.set('admin-session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    })
    return response
  })
}

export function clearSessionResponse() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('admin-session', '', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
