/**
 * Admin Inventory Import API
 *
 * POST /api/admin/inventory/import
 *   Bulk-import stock quantities via CSV file upload OR a JSON body.
 *
 *   Accepted content types:
 *     1. multipart/form-data with a `file` field (CSV).
 *        Expected CSV columns: productId,newQuantity,variantId
 *        (a header row is optional; if present, it must match those names)
 *     2. application/json: { rows: [{productId, newQuantity, variantId?}], reason?, sellerId? }
 *
 *   Query params:
 *     - dryRun=true   — validate + parse but do NOT persist any changes
 *
 *   Validation:
 *     - max 500 rows
 *     - each newQuantity must be a non-negative finite number
 *
 *   Returns: { success, updated, failed, errors[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { bulkUpdateStock } from '@/lib/inventory-manager'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 500

interface ParsedRow {
  productId: string
  newQuantity: number
  variantId?: string
}

/**
 * Minimal RFC-4180-ish CSV line parser. Splits a single line into fields,
 * honouring double-quoted values (including embedded commas and "" escapes).
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

/**
 * Parse the full CSV text into rows. Skips blank lines. If the first non-blank
 * line looks like a header (contains "productId" case-insensitive), it is
 * treated as a header and the remaining lines are mapped by column name;
 * otherwise every line is treated as positional data.
 */
function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = []
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lines = rawLines.filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return { rows: [], errors: ['CSV is empty'] }
  }

  let headerIndex: Record<string, number> | null = null
  let startIdx = 0
  const firstFields = parseCsvLine(lines[0]).map((f) => f.trim().toLowerCase())
  if (firstFields.includes('productid')) {
    headerIndex = {}
    firstFields.forEach((name, idx) => {
      if (name) headerIndex![name] = idx
    })
    startIdx = 1
  }

  const rows: ParsedRow[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const lineNo = i + 1
    const fields = parseCsvLine(lines[i])

    let productId: string
    let newQuantityStr: string
    let variantId: string | undefined

    if (headerIndex) {
      productId = (fields[headerIndex['productid'] ?? 0] || '').trim()
      newQuantityStr = (fields[headerIndex['newquantity'] ?? 1] || '').trim()
      variantId = (fields[headerIndex['variantid'] ?? 2] || '').trim() || undefined
    } else {
      productId = (fields[0] || '').trim()
      newQuantityStr = (fields[1] || '').trim()
      variantId = (fields[2] || '').trim() || undefined
    }

    if (!productId) {
      errors.push(`line ${lineNo}: missing productId`)
      continue
    }
    const qty = Number(newQuantityStr)
    if (!Number.isFinite(qty) || qty < 0) {
      errors.push(`line ${lineNo}: invalid newQuantity "${newQuantityStr}" for ${productId}`)
      continue
    }
    rows.push({ productId, newQuantity: qty, variantId })
  }

  return { rows, errors }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') === 'true'

    const contentType = request.headers.get('content-type') || ''
    let rows: ParsedRow[] = []
    let reason = 'Admin CSV/JSON import'
    let sellerId: string | undefined
    const parseErrors: string[] = []

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file')
      const reasonField = formData.get('reason')
      const sellerIdField = formData.get('sellerId')
      if (reasonField && typeof reasonField === 'string') reason = reasonField
      if (sellerIdField && typeof sellerIdField === 'string') sellerId = sellerIdField

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { success: false, message: 'No "file" field found in multipart form data' },
          { status: 400 },
        )
      }
      const text = await file.text()
      const parsed = parseCsv(text)
      rows = parsed.rows
      parseErrors.push(...parsed.errors)
    } else {
      // Treat as JSON
      const body = await request.json().catch(() => null)
      if (!body || typeof body !== 'object') {
        return NextResponse.json(
          { success: false, message: 'Unsupported content type. Use multipart/form-data with a file field, or application/json with { rows }.' },
          { status: 400 },
        )
      }
      const { rows: jsonRows, reason: jsonReason, sellerId: jsonSellerId } = body as {
        rows?: Array<{ productId: string; newQuantity: number; variantId?: string }>
        reason?: string
        sellerId?: string
      }
      if (jsonReason) reason = jsonReason
      if (jsonSellerId) sellerId = jsonSellerId
      if (!Array.isArray(jsonRows)) {
        return NextResponse.json(
          { success: false, message: 'JSON body must include a "rows" array' },
          { status: 400 },
        )
      }
      for (let i = 0; i < jsonRows.length; i++) {
        const row = jsonRows[i] as any
        if (!row || !row.productId || typeof row.productId !== 'string') {
          parseErrors.push(`row ${i + 1}: missing productId`)
          continue
        }
        const qty = Number(row.newQuantity)
        if (!Number.isFinite(qty) || qty < 0) {
          parseErrors.push(`row ${i + 1}: invalid newQuantity for ${row.productId}`)
          continue
        }
        rows.push({
          productId: row.productId,
          newQuantity: qty,
          variantId: row.variantId ? String(row.variantId) : undefined,
        })
      }
    }

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'No valid rows parsed',
          updated: 0,
          failed: parseErrors.length,
          errors: parseErrors,
        },
        { status: 400 },
      )
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many rows (${rows.length}). Maximum ${MAX_ROWS} per import.`,
          updated: 0,
          failed: rows.length,
          errors: [`Row count ${rows.length} exceeds max ${MAX_ROWS}`],
        },
        { status: 400 },
      )
    }

    const effectiveReason = sellerId ? `${reason} (seller: ${sellerId})` : reason

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry run: ${rows.length} row(s) parsed successfully, ${parseErrors.length} parse error(s). No changes persisted.`,
        updated: 0,
        failed: parseErrors.length,
        errors: parseErrors,
        dryRun: true,
        rowCount: rows.length,
      })
    }

    const result = await bulkUpdateStock({
      updates: rows,
      reason: effectiveReason,
      performedBy: 'admin',
      userId: session.id,
      userName: session.name,
    })

    // Merge parse-level errors with the bulk-update-level errors
    return NextResponse.json({
      success: result.success,
      message: result.message,
      updated: result.updated,
      failed: result.failed + parseErrors.length,
      errors: [...parseErrors, ...result.errors],
    })
  } catch (error) {
    console.error('[Admin Inventory Import] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to import inventory',
        message: (error as Error).message,
        updated: 0,
        failed: 0,
        errors: [(error as Error).message],
      },
      { status: 500 },
    )
  }
}
