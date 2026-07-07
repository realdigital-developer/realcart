/**
 * GET  /api/customer/bank-upi — Fetch customer's saved bank accounts + UPI IDs
 * POST /api/customer/bank-upi — Add a new bank account or UPI ID
 * PATCH /api/customer/bank-upi — Set default / update
 * DELETE /api/customer/bank-upi — Delete a saved bank account or UPI ID
 *
 * Stores in MongoDB collection: customer_payment_methods
 * Each document: { _id, customerId, type: 'bank'|'upi', ...details, isDefault, createdAt }
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Validate IFSC code (format: ABCD0123456 — 4 letters + 0 + 6 digits) */
function isValidIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())
}

/** Validate UPI ID (format: name@bank) */
function isValidUpi(vpa: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(vpa)
}

/** Validate account number (6-18 digits) */
function isValidAccountNumber(acct: string): boolean {
  return /^\d{6,18}$/.test(acct)
}

// ── GET — fetch all saved payment methods ──
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const methods = await db
      .collection('customer_payment_methods')
      .find({ customerId: customer.id })
      .sort({ isDefault: -1, createdAt: -1 })
      .toArray()

    return NextResponse.json({
      paymentMethods: methods.map((m) => ({
        id: m._id.toString(),
        type: m.type,
        // Bank fields
        accountNumber: m.accountNumber || '',
        ifscCode: m.ifscCode || '',
        bankName: m.bankName || '',
        accountHolderName: m.accountHolderName || '',
        accountType: m.accountType || '',
        bankCode: m.bankCode || '',
        // UPI fields
        upiId: m.upiId || '',
        upiName: m.upiName || '',
        // Card fields (RBI-compliant: only last 4 + network, no full number)
        cardLast4: m.cardLast4 || '',
        cardNetwork: m.cardNetwork || '',
        cardType: m.cardType || '',
        nickname: m.nickname || '',
        // Wallet fields
        walletProvider: m.walletProvider || '',
        // Common
        label: m.label || '',
        isDefault: m.isDefault || false,
        createdAt: m.createdAt,
      })),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/bank-upi] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 })
  }
}

// ── POST — add a new bank account or UPI ID ──
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { type } = body

    if (!type || !['bank', 'upi', 'card', 'netbanking', 'wallet'].includes(type)) {
      return NextResponse.json({ error: 'Type must be "bank", "upi", "card", "netbanking", or "wallet"' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Validate + build document
    const doc: Record<string, unknown> = {
      customerId: customer.id,
      type,
      isDefault: false,
      createdAt: new Date().toISOString(),
    }

    if (type === 'bank') {
      const { accountNumber, ifscCode, bankName, accountHolderName, accountType } = body
      if (!accountNumber || !isValidAccountNumber(accountNumber)) {
        return NextResponse.json({ error: 'Invalid account number (6-18 digits required)' }, { status: 400 })
      }
      if (!ifscCode || !isValidIfsc(ifscCode)) {
        return NextResponse.json({ error: 'Invalid IFSC code' }, { status: 400 })
      }
      if (!accountHolderName || accountHolderName.trim().length < 2) {
        return NextResponse.json({ error: 'Account holder name is required' }, { status: 400 })
      }
      doc.accountNumber = accountNumber.trim()
      doc.ifscCode = ifscCode.toUpperCase().trim()
      doc.bankName = (bankName || '').trim()
      doc.accountHolderName = accountHolderName.trim()
      doc.accountType = (accountType || 'savings').trim()
      doc.label = `${bankName || 'Bank'} • ****${accountNumber.slice(-4)}`

      // Check for duplicates
      const existing = await db.collection('customer_payment_methods').findOne({
        customerId: customer.id,
        type: 'bank',
        accountNumber: doc.accountNumber,
        ifscCode: doc.ifscCode,
      })
      if (existing) {
        return NextResponse.json({ error: 'This bank account is already added' }, { status: 409 })
      }
    } else if (type === 'upi') {
      const { upiId, upiName } = body
      if (!upiId || !isValidUpi(upiId)) {
        return NextResponse.json({ error: 'Invalid UPI ID (format: name@bank)' }, { status: 400 })
      }
      doc.upiId = upiId.trim().toLowerCase()
      doc.upiName = (upiName || '').trim()
      doc.label = doc.upiId

      // Check for duplicates
      const existing = await db.collection('customer_payment_methods').findOne({
        customerId: customer.id,
        type: 'upi',
        upiId: doc.upiId,
      })
      if (existing) {
        return NextResponse.json({ error: 'This UPI ID is already added' }, { status: 409 })
      }
    } else if (type === 'card') {
      // RBI-compliant card tokenization: store ONLY last 4 digits + network.
      // NEVER store full card number, expiry, or CVV.
      const { cardLast4, cardNetwork, cardType, nickname } = body
      if (!cardLast4 || !/^\d{4}$/.test(cardLast4)) {
        return NextResponse.json({ error: 'Invalid card last 4 digits' }, { status: 400 })
      }
      if (!cardNetwork || !['visa', 'mastercard', 'rupay', 'amex', 'discover', 'diners'].includes(cardNetwork.toLowerCase())) {
        return NextResponse.json({ error: 'Invalid card network' }, { status: 400 })
      }
      doc.cardLast4 = cardLast4
      doc.cardNetwork = cardNetwork.toLowerCase()
      doc.cardType = (cardType || 'debit').toLowerCase() // debit | credit
      doc.nickname = (nickname || '').trim() || `${cardNetwork} ${cardType} ****${cardLast4}`
      doc.label = `${doc.cardNetwork} ${doc.cardType} ****${cardLast4}`

      // Check for duplicates (same last 4 + network = likely same card)
      const existing = await db.collection('customer_payment_methods').findOne({
        customerId: customer.id,
        type: 'card',
        cardLast4: doc.cardLast4,
        cardNetwork: doc.cardNetwork,
      })
      if (existing) {
        return NextResponse.json({ error: 'This card is already saved' }, { status: 409 })
      }
    } else if (type === 'netbanking') {
      // Store only the bank name — no credentials
      const { bankName: nbBank, bankCode } = body
      if (!nbBank || nbBank.trim().length < 2) {
        return NextResponse.json({ error: 'Bank name is required' }, { status: 400 })
      }
      doc.bankName = nbBank.trim()
      doc.bankCode = (bankCode || '').trim()
      doc.label = `${nbBank} (Net Banking)`

      const existing = await db.collection('customer_payment_methods').findOne({
        customerId: customer.id,
        type: 'netbanking',
        bankName: doc.bankName,
      })
      if (existing) {
        return NextResponse.json({ error: 'This bank is already saved' }, { status: 409 })
      }
    } else if (type === 'wallet') {
      // Store only the wallet provider name — no credentials
      const { walletProvider } = body
      if (!walletProvider || walletProvider.trim().length < 2) {
        return NextResponse.json({ error: 'Wallet provider is required' }, { status: 400 })
      }
      doc.walletProvider = walletProvider.trim()
      doc.label = `${walletProvider} Wallet`

      const existing = await db.collection('customer_payment_methods').findOne({
        customerId: customer.id,
        type: 'wallet',
        walletProvider: doc.walletProvider,
      })
      if (existing) {
        return NextResponse.json({ error: 'This wallet is already saved' }, { status: 409 })
      }
    }

    // If this is the first payment method, make it default
    const count = await db.collection('customer_payment_methods').countDocuments({ customerId: customer.id })
    if (count === 0) {
      doc.isDefault = true
    }

    const result = await db.collection('customer_payment_methods').insertOne(doc)

    return NextResponse.json({
      success: true,
      id: result.insertedId.toString(),
      paymentMethod: { ...doc, _id: result.insertedId },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/customer/bank-upi] error:', msg)
    return NextResponse.json({ error: 'Failed to add payment method' }, { status: 500 })
  }
}

// ── PATCH — set default / update ──
export async function PATCH(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { id, action } = body

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Valid ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    if (action === 'setDefault') {
      // Unset all other defaults for this customer
      await db.collection('customer_payment_methods').updateMany(
        { customerId: customer.id },
        { $set: { isDefault: false } },
      )
      // Set the selected one as default
      await db.collection('customer_payment_methods').updateOne(
        { _id: new ObjectId(id), customerId: customer.id },
        { $set: { isDefault: true } },
      )
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[PATCH /api/customer/bank-upi] error:', msg)
    return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500 })
  }
}

// ── DELETE — remove a payment method ──
export async function DELETE(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Valid ID is required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()

    // Check if this was the default
    const method = await db.collection('customer_payment_methods').findOne({
      _id: new ObjectId(id),
      customerId: customer.id,
    })
    if (!method) {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404 })
    }

    await db.collection('customer_payment_methods').deleteOne({
      _id: new ObjectId(id),
      customerId: customer.id,
    })

    // If deleted method was default, make the most recent one default
    if (method.isDefault) {
      const next = await db.collection('customer_payment_methods').findOne(
        { customerId: customer.id },
        { sort: { createdAt: -1 } },
      )
      if (next) {
        await db.collection('customer_payment_methods').updateOne(
          { _id: next._id },
          { $set: { isDefault: true } },
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[DELETE /api/customer/bank-upi] error:', msg)
    return NextResponse.json({ error: 'Failed to delete payment method' }, { status: 500 })
  }
}
