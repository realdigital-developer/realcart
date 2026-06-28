import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { DEFAULT_SIZE_CHART_TEMPLATES } from '@/lib/size-chart-templates'

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams

    // Ensure default templates exist in DB
    await seedDefaultTemplates(db)

    const statusFilter = searchParams.get('status') || ''
    const query: Record<string, unknown> = {}
    if (statusFilter && statusFilter !== 'all') {
      query.status = statusFilter
    } else if (!statusFilter) {
      query.status = 'Active' // Default: only show active templates to non-admin consumers
    }
    // If statusFilter === 'all', no status filter is applied (admin view)

    const templates = await db.collection('size_chart_templates')
      .find(query)
      .sort({ isSystem: -1, name: 1 })
      .toArray()

    const safeTemplates = templates.map(t => {
      const { category: _cat, subcategory: _subcat, ...rest } = t as Record<string, unknown> & { _id: import('mongodb').ObjectId }
      return {
        ...rest,
        _id: rest._id?.toString(),
      }
    })

    return NextResponse.json({ templates: safeTemplates })
  } catch (error) {
    console.error('[Size Chart Templates GET Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()
    const { name, description, headers, rows, unit, sizeHeader, howToMeasure } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
    }
    if (!headers?.length) {
      return NextResponse.json({ error: 'At least one header is required' }, { status: 400 })
    }

    const now = new Date()
    const doc = {
      name: name.trim(),
      description: description?.trim() || '',
      headers,
      rows: rows || [],
      unit: unit || 'imperial',
      conversionFactor: unit === 'imperial' ? 2.54 : (unit === 'metric' ? 0.393701 : undefined),
      sizeHeader: sizeHeader || headers[0] || 'Size',
      howToMeasure: howToMeasure || [],
      isSystem: false,
      status: 'Active',
      createdAt: now,
      updatedAt: now,
    }

    const result = await db.collection('size_chart_templates').insertOne(doc)

    return NextResponse.json({
      success: true,
      template: { ...doc, _id: result.insertedId.toString() },
    })
  } catch (error) {
    console.error('[Size Chart Templates POST Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const body = await request.json()
    const { _id, ...updateData } = body

    if (!_id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const { ObjectId } = await import('mongodb')
    const existing = await db.collection('size_chart_templates').findOne({ _id: new ObjectId(_id) })
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // System templates CAN be edited by admin, but cannot be deleted while marked as system.
    // Admin can also remove the system marking (isSystem: false) to make it a custom template.

    const safeUpdate: Record<string, unknown> = { updatedAt: new Date() }
    const unsetFields: Record<string, string> = {}
    if (updateData.name !== undefined) safeUpdate.name = updateData.name.trim()
    if (updateData.description !== undefined) safeUpdate.description = updateData.description.trim()
    if (updateData.headers !== undefined) safeUpdate.headers = updateData.headers
    if (updateData.rows !== undefined) safeUpdate.rows = updateData.rows
    if (updateData.unit !== undefined) safeUpdate.unit = updateData.unit
    if (updateData.sizeHeader !== undefined) safeUpdate.sizeHeader = updateData.sizeHeader
    if (updateData.howToMeasure !== undefined) safeUpdate.howToMeasure = updateData.howToMeasure
    if (updateData.status !== undefined) safeUpdate.status = updateData.status
    // Allow admin to remove system marking (isSystem: false)
    if (updateData.isSystem !== undefined && updateData.isSystem === false) {
      safeUpdate.isSystem = false
    }

    // Always remove legacy category/subcategory fields if they exist in the document
    if (existing.category !== undefined || existing.subcategory !== undefined) {
      if (existing.category !== undefined) unsetFields.category = ''
      if (existing.subcategory !== undefined) unsetFields.subcategory = ''
    }

    const updateOp: Record<string, unknown> = { $set: safeUpdate }
    if (Object.keys(unsetFields).length > 0) {
      updateOp.$unset = unsetFields
    }

    await db.collection('size_chart_templates').updateOne(
      { _id: new ObjectId(_id) },
      updateOp
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Size Chart Templates PUT Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase()
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    // Prevent deletion of system templates
    const existing = await db.collection('size_chart_templates').findOne({ _id: new (await import('mongodb')).ObjectId(id) })
    if (existing?.isSystem) {
      return NextResponse.json({ error: 'System templates cannot be deleted' }, { status: 403 })
    }

    await db.collection('size_chart_templates').deleteOne({ _id: new (await import('mongodb')).ObjectId(id) })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Size Chart Templates DELETE Error]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/*  Seed default templates if they don't exist yet                     */
/* ------------------------------------------------------------------ */

let templatesSeeded = false

async function seedDefaultTemplates(db: import('mongodb').Db) {
  if (templatesSeeded) return

  try {
    // Migrate: remove legacy category/subcategory fields from existing documents
    try {
      await db.collection('size_chart_templates').updateMany(
        { category: { $exists: true } },
        { $unset: { category: '', subcategory: '' } }
      )
    } catch { /* non-fatal */ }

    const count = await db.collection('size_chart_templates').countDocuments()
    if (count === 0) {
      const docs = DEFAULT_SIZE_CHART_TEMPLATES.map(t => ({
        ...t,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
      await db.collection('size_chart_templates').insertMany(docs)
      console.log(`[Size Chart Templates] Seeded ${docs.length} default templates`)
    }
    templatesSeeded = true
  } catch (error) {
    console.warn('[Size Chart Templates] Seed failed (non-fatal):', (error as Error).message)
  }
}
