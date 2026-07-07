import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin-session')?.value

  if (!token) {
    return NextResponse.json({ authenticated: false })
  }

  const user = await verifySessionToken(token)

  if (!user) {
    const response = NextResponse.json({ authenticated: false })
    response.cookies.set('admin-session', '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
    return response
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  })
}
