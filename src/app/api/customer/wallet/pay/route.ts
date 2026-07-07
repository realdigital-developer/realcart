/**
 * Wallet Payment Endpoint — pay for an order using RealCart Balance.
 * -------------------------------------------------------------------
 * POST /api/customer/wallet/pay
 *
 * Mode 1 — FULL wallet payment (default):
 *   Body: { items, shippingAddress, ..., totalAmount }
 *   Flow: check balance >= totalAmount → create order (paid) → debit wallet
 *
 * Mode 2 — PARTIAL wallet debit (Meesho-style split payment):
 *   Body: { mode: 'partial', orderId, amount }
 *   Flow: debit wallet for `amount` linked to an already-created order.
 *   Used when the customer pays part of the order with RealCart Balance
 *   and the remainder via UPI/Card/Net Banking (processed separately).
 *   The order is already created by the time this is called.
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { getWallet, debitWallet } from '@/lib/wallet-helper'
import { createOrder } from '@/lib/order-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()

    // ── Mode 2: PARTIAL wallet debit (Meesho-style split payment) ──
    // The order is already created via /api/customer/orders with an online
    // payment for the remainder. We just debit the wallet for the partial
    // amount and link it to the order.
    if (body.mode === 'partial') {
      const { orderId, amount } = body

      if (!orderId || typeof orderId !== 'string') {
        return NextResponse.json({ error: 'Order ID is required for partial debit' }, { status: 400 })
      }
      if (typeof amount !== 'number' || amount <= 0) {
        return NextResponse.json({ error: 'Invalid debit amount' }, { status: 400 })
      }

      const roundedAmount = Math.round(amount * 100) / 100

      // Verify the wallet has enough balance (debitWallet also checks atomically,
      // but we do an early check for a clearer error message)
      const { balance } = await getWallet(customer.id)
      if (balance < roundedAmount) {
        return NextResponse.json({
          error: `Insufficient RealCart Balance. Available: ₹${balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}, Required: ₹${roundedAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
          availableBalance: balance,
          requiredAmount: roundedAmount,
        }, { status: 400 })
      }

      // Debit the wallet (atomic, with balance guard)
      const newBalance = await debitWallet({
        customerId: customer.id,
        amount: roundedAmount,
        source: 'purchase',
        description: `RealCart Balance applied for order ${orderId}`,
        orderId,
      })

      return NextResponse.json({
        success: true,
        orderId,
        newBalance,
        debitedAmount: roundedAmount,
        message: `₹${roundedAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} debited from RealCart Balance for order ${orderId}`,
      })
    }

    // ── Mode 1: FULL wallet payment (default — existing flow) ──
    const {
      items,
      shippingAddress,
      couponCode,
      couponDiscount,
      productDiscount,
      specialOfferDiscount,
      deliveryFee,
      deliveryOption,
      totalAmount,
    } = body

    // Validate total amount
    if (typeof totalAmount !== 'number' || totalAmount <= 0) {
      return NextResponse.json({ error: 'Invalid total amount' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    if (!shippingAddress || !shippingAddress.name || !shippingAddress.pincode) {
      return NextResponse.json({ error: 'Shipping address is required' }, { status: 400 })
    }

    // ── Check wallet balance ──
    const { balance } = await getWallet(customer.id)

    if (balance < totalAmount) {
      return NextResponse.json({
        error: `Insufficient RealCart Balance. You need ₹${totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} but have ₹${balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}. Please add money or use another payment method.`,
        availableBalance: balance,
        requiredAmount: totalAmount,
        shortfall: totalAmount - balance,
      }, { status: 400 })
    }

    // ── Fetch customer name/email for the order ──
    const { db } = await connectToDatabase()
    const customerDoc = await db.collection('customers').findOne({ _id: customer.id as unknown as import('mongodb').ObjectId })
      || await db.collection('customers').findOne({ mobile: customer.mobile })

    const customerName = customerDoc?.name || customer.name || 'Customer'
    const customerEmail = customerDoc?.email || undefined

    // ── Create the order (marked as 'paid' via online + paymentDetails) ──
    const order = await createOrder({
      customerId: customer.id,
      customerName,
      customerPhone: customer.mobile || '',
      customerEmail,
      items: items.map((item: {
        productId: string
        quantity: number
        variant?: unknown
        originalPrice?: number
        sellingPrice?: number
        effectivePrice?: number
        hasDiscount?: boolean
        discountPercent?: number
      }) => ({
        productId: item.productId,
        quantity: item.quantity,
        variant: item.variant as unknown,
        originalPrice: item.originalPrice,
        sellingPrice: item.sellingPrice,
        effectivePrice: item.effectivePrice,
        hasDiscount: item.hasDiscount,
        discountPercent: item.discountPercent,
      })),
      shippingAddress,
      paymentMethod: 'online',
      paymentDetails: {
        razorpayOrderId: `wallet_${Date.now()}`,
        razorpayPaymentId: `wallet_pay_${Date.now()}`,
        method: 'wallet_balance',
        // Full wallet payment — the entire order was paid from RealCart Balance
        walletAppliedAmount: totalAmount,
      },
      couponCode,
      couponDiscount,
      productDiscount,
      specialOfferDiscount,
      deliveryFee,
      deliveryOption: deliveryOption || 'standard',
    })

    // ── Debit the wallet (atomic, with balance guard) ──
    const newBalance = await debitWallet({
      customerId: customer.id,
      amount: totalAmount,
      source: 'purchase',
      description: `Payment for order ${order.orderId}`,
      orderId: order.orderId,
    })

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      newBalance,
      message: `Paid ₹${totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} from RealCart Balance`,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/customer/wallet/pay] error:', msg)
    return NextResponse.json({ error: msg || 'Wallet payment failed' }, { status: 500 })
  }
}
