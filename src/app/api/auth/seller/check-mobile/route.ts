import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

/**
 * POST /api/auth/seller/check-mobile
 * Check if a mobile number is already registered as a seller
 * Body: { mobile: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const mobile = (body.mobile || '').trim().replace(/\D/g, '')

    if (!mobile || mobile.length < 10) {
      return NextResponse.json(
        { error: 'Valid mobile number is required' },
        { status: 400 }
      )
    }

    const cleanMobile = mobile.slice(-10)
    const { db } = await connectToDatabase()
    const existing = await db.collection('sellers').findOne({ phone: cleanMobile })

    return NextResponse.json({
      available: !existing,
      registered: !!existing,
    })
  } catch (error) {
    console.error('[Seller Check Mobile Error]', error)
    return NextResponse.json(
      { error: 'Failed to check mobile number' },
      { status: 500 }
    )
  }
}
