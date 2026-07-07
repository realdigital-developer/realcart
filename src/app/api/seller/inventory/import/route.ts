/**
 * Seller Inventory Import API
 *
 * POST /api/seller/inventory/import
 *   Bulk-update stock quantities for products owned by the authenticated seller.
 *
 *   Two input modes are supported:
 *     1. multipart/form-data with a `file` field containing CSV text.
 *        Expected CSV columns (header required): productId,newQuantity,variantId
 *        (variantId column may be empty).
 *     2. application/json body: { rows: [{ productId, newQuantity, variantId? }], reason? }
 *
 *   Query params:
 *     - dryRun (default false): when "true", the request is validated and the
 *       computed update set is returned without applying any change.
 *
 *   Validation rules:
 *     - Max 500 rows per request.
 *     - Each newQuantity must be a finite, non-negative number.
 *
 *   Response: { success, updated, failed, errors[], dryRun, applied }
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { bulkUpdateStock } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

interface ParsedRow {
  productId: string
  newQuantity: number
  variantId?: string
}

/**
 * Minimal CSV line parser: splits on commas but respects double-quoted fields
 * (with "" escaping embedded quotes). Sufficient for the controlled shape of
 * our import file; not a full RFC-4180 implementation.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

function parseCsvText(text: string): ParsedRow[] {
  // Normalize line endings, drop trailing whitespace, ignore fully empty lines.
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    throw new Error('CSV file is empty')
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const idxProductId = header.indexOf('productid')
  const idxNewQty = header.indexOf('newquantity')
  const idxVariant = header.indexOf('variantid')

  if (idxProductId === -1 || idxNewQty === -1) {
    throw new Error(
      'CSV header must include "productId" and "newQuantity" columns (variantId is optional)',
    )
  }

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const productId = (cols[idxProductId] || '').trim()
    const qtyStr = (cols[idxNewQty] || '').trim()
    const variantId =
      idxVariant !== -1 ? (cols[idxVariant] || '').trim() : ''
    const newQuantity = Number(qtyStr)
    rows.push({
      productId,
      newQuantity,
      variantId: variantId || undefined,
    })
  }
  return rows
}

export async function POST(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') === 'true'

    let rows: ParsedRow[] = []
    let reason: string | undefined

    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file')
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'multipart/form-data must include a "file" field' },
          { status: 400 },
        )
      }
      const text = await file.text()
      try {
        rows = parseCsvText(text)
      } catch (e) {
        return NextResponse.json(
          { error: 'Failed to parse CSV', message: (e as Error).message },
          { status: 400 },
        )
      }
      reason = (formData.get('reason') as string) || undefined
    } else {
      // Treat as JSON
      const body = await request.json().catch(() => null)
      if (!body || !Array.isArray(body.rows)) {
        return NextResponse.json(
          { error: 'JSON body must include a "rows" array, or send a multipart/form-data file' },
          { status: 400 },
        )
      }
      rows = body.rows.map((r: any) => ({
        productId: String(r.productId ?? '').trim(),
        newQuantity: Number(r.newQuantity),
        variantId: r.variantId ? String(r.variantId) : undefined,
      }))
      reason = body.reason
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows to import' }, { status: 400 })
    }
    if (rows.length > 500) {
      return NextResponse.json(
        { error: `Cannot import more than 500 rows at once (received ${rows.length})` },
        { status: 400 },
      )
    }

    // Validate each row before applying anything.
    const errors: string[] = []
    const validRows: ParsedRow[] = []
    rows.forEach((r, i) => {
      if (!r.productId) {
        errors.push(`Row ${i + 1}: missing productId`)
        return
      }
      if (
        typeof r.newQuantity !== 'number' ||
        !Number.isFinite(r.newQuantity) ||
        r.newQuantity < 0
      ) {
        errors.push(`Row ${i + 1} (productId=${r.productId}): newQuantity must be a non-negative number`)
        return
      }
      validRows.push(r)
    })

    if (validRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          updated: 0,
          failed: rows.length,
          errors,
          dryRun,
          applied: false,
        },
        { status: 400 },
      )
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        updated: 0,
        failed: errors.length,
        errors,
        dryRun: true,
        applied: false,
        validRowCount: validRows.length,
      })
    }

    const result = await bulkUpdateStock({
      updates: validRows.map((r) => ({
        productId: r.productId,
        newQuantity: r.newQuantity,
        variantId: r.variantId,
      })),
      reason: reason || 'CSV / JSON import by seller',
      performedBy: 'seller',
      userId: session.id,
      userName: session.name || session.storeName,
    })

    return NextResponse.json({
      success: result.success,
      updated: result.updated,
      failed: result.failed + errors.length,
      errors: [...errors, ...result.errors],
      dryRun: false,
      applied: true,
    })
  } catch (error) {
    console.error('[Seller Inventory Import] Error:', error)
    return NextResponse.json(
      { error: 'Failed to import inventory', message: (error as Error).message },
      { status: 500 },
    )
  }
}
