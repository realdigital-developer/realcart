import { NextRequest } from 'next/server'
import { verifyCredentials, createSessionResponse } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400 })
    }

    const user = await verifyCredentials(email, password)

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 })
    }

    return await createSessionResponse(user)
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
