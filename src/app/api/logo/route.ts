import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'

/**
 * GET /api/logo
 * Public endpoint – returns the current site logo URL (no auth needed).
 */
export async function GET() {
  try {
    const { db } = await connectToDatabase()
    const setting = await db.collection('settings').findOne({ key: 'site_logo' })

    if (!setting) {
      return NextResponse.json({ logo: null })
    }

    return NextResponse.json({
      logo: {
        url: setting.url ?? null,
        thumbnailUrl: setting.thumbnailUrl ?? setting.url ?? null,
        originalName: setting.originalName ?? null,
      },
    })
  } catch {
    return NextResponse.json({ logo: null })
  }
}
