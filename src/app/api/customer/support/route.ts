/**
 * Customer Help & Support API
 * -------------------------------------------------------------------
 * GET    /api/customer/support               — fetch FAQ categories + customer's support tickets
 * POST   /api/customer/support               — create a new support ticket
 *
 * MongoDB collections:
 *   support_tickets — { _id, customerId, customerName, customerMobile, subject, message,
 *                       category, priority, status, ticketId, responses[], createdAt, updatedAt }
 *   faq_categories  — admin-managed FAQ categories with questions/answers (seeded if empty)
 *
 * Meesho-style: customers can browse FAQs, submit support tickets, and track
 * their ticket status. Tickets are managed by admin (future admin panel integration).
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { verifyCustomerSession } from '@/lib/customer-auth'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Generate a unique ticket ID (e.g., TKT-20260627-AB12) */
function generateTicketId(): string {
  const date = new Date()
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `TKT-${ymd}-${suffix}`
}

/** Seed default FAQ categories if the collection is empty. */
async function seedFAQsIfEmpty(db: import('mongodb').Db) {
  const count = await db.collection('faq_categories').countDocuments()
  if (count > 0) return

  const defaultFAQs = [
    {
      category: 'Orders & Delivery',
      icon: 'package',
      color: 'blue',
      questions: [
        { q: 'How can I track my order?', a: 'Go to the Orders tab in your account. Tap on any order to see its real-time delivery status and tracking timeline.' },
        { q: 'What is the estimated delivery time?', a: 'Delivery typically takes 3-7 business days depending on your location. Express delivery options may be available for faster shipping.' },
        { q: 'Can I change my delivery address after placing an order?', a: 'Address changes are only possible before the order is shipped. Please contact support immediately if you need to change your address.' },
        { q: 'What if my order is delayed?', a: 'If your order is significantly delayed beyond the estimated delivery date, please raise a support ticket and we will investigate with the delivery partner.' },
      ],
    },
    {
      category: 'Returns & Refunds',
      icon: 'rotate',
      color: 'amber',
      questions: [
        { q: 'What is the return policy?', a: 'Most products can be returned within 7 days of delivery. The item must be unused and in its original packaging with tags intact.' },
        { q: 'How will I get my refund?', a: 'Refunds are credited back to your RealCart Balance instantly for online payments. For COD orders, refunds are processed to your bank account within 5-7 business days.' },
        { q: 'When will I receive my refund?', a: 'Online payment refunds are instant to your RealCart Balance. Bank transfers may take 5-7 business days depending on your bank.' },
        { q: 'Can I return a part of my order?', a: 'Yes, you can return individual items from your order. Go to the order details page and tap "Return" on the specific item.' },
      ],
    },
    {
      category: 'Payments & RealCart Balance',
      icon: 'wallet',
      color: 'violet',
      questions: [
        { q: 'What is RealCart Balance?', a: 'RealCart Balance is your wallet balance earned through referral rewards, promotional cashback, and refunds. You can use it for purchases at checkout.' },
        { q: 'How do I use my RealCart Balance?', a: 'At checkout, toggle on "RealCart Balance" to apply your available balance. If it covers the full amount, no other payment is needed. If partial, pay the remainder via UPI/Card/etc.' },
        { q: 'Can I withdraw my RealCart Balance?', a: 'No, RealCart Balance is non-transferable and cannot be withdrawn to bank accounts. It can only be used for purchases on RealCart.' },
        { q: 'Is my payment information secure?', a: 'Yes, all payments are processed through Razorpay with 256-bit SSL encryption. We never store your full card details (RBI-compliant tokenization).' },
      ],
    },
    {
      category: 'Account & Security',
      icon: 'user',
      color: 'emerald',
      questions: [
        { q: 'How do I change my passcode?', a: 'Go to Account > Profile > Change Passcode to update your 6-digit passcode. You will need to verify with your current passcode first.' },
        { q: 'I forgot my passcode, what should I do?', a: 'Tap "Forgot Passcode" on the login screen. You will receive an OTP on your registered mobile number to reset your passcode.' },
        { q: 'How do I update my profile information?', a: 'Go to Account > Profile to update your name, email, and profile picture. Changes are saved instantly.' },
        { q: 'Is my personal data safe?', a: 'Yes, we follow strict data protection guidelines. Your personal information is encrypted and never shared with third parties without your consent.' },
      ],
    },
    {
      category: 'Referrals & Rewards',
      icon: 'gift',
      color: 'rose',
      questions: [
        { q: 'How does the referral program work?', a: 'Share your referral code with friends. When they place their first order, you both earn rewards credited to your RealCart Balance.' },
        { q: 'Where can I find my referral code?', a: 'Go to Account > Referral to see your unique referral code. Share it via WhatsApp, SMS, or social media.' },
        { q: 'When do I receive my referral reward?', a: 'Referral rewards are credited to your RealCart Balance when your friend\'s first order is delivered. This ensures genuine referrals.' },
        { q: 'Is there a limit on referrals?', a: 'No, you can refer unlimited friends! The more friends you invite, the more rewards you earn.' },
      ],
    },
    {
      category: 'Products & Sellers',
      icon: 'store',
      color: 'cyan',
      questions: [
        { q: 'How do I follow a seller?', a: 'On any product page, tap the "Follow" button next to the seller name in the "Sold by" section. You can view all followed sellers in Account > Followed Sellers.' },
        { q: 'Can I rate a seller?', a: 'Yes! Visit the seller\'s profile page by tapping "Sold by" on any product. Tap "Rate Seller" to give a 1-5 star rating with an optional review.' },
        { q: 'Are all sellers verified?', a: 'Sellers with a blue verified badge have completed our verification process. Always check for the badge before making a purchase.' },
        { q: 'How do I report a problematic seller?', a: 'Raise a support ticket with the seller\'s name and the issue. Our team will investigate and take appropriate action.' },
      ],
    },
  ]

  await db.collection('faq_categories').insertMany(
    defaultFAQs.map((cat) => ({
      ...cat,
      status: 'active',
      createdAt: new Date().toISOString(),
    }))
  )
}

// ── GET: FAQ categories + customer's support tickets ──
export async function GET() {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { db } = await connectToDatabase()

    // Seed default FAQs if empty
    await seedFAQsIfEmpty(db)

    // Fetch FAQ categories
    const faqCategories = await db.collection('faq_categories')
      .find({ status: 'active' })
      .sort({ _id: 1 })
      .toArray()

    // Fetch customer's support tickets (newest first)
    const tickets = await db.collection('support_tickets')
      .find({ customerId: customer.id })
      .sort({ createdAt: -1 })
      .toArray()

    return NextResponse.json({
      faqCategories: faqCategories.map((c) => ({
        id: c._id.toString(),
        category: c.category,
        icon: c.icon || 'help',
        color: c.color || 'blue',
        questions: (c.questions || []).map((q: { q: string; a: string }, i: number) => ({
          id: `${c._id.toString()}-${i}`,
          question: q.q,
          answer: q.a,
        })),
      })),
      tickets: tickets.map((t) => ({
        id: t._id.toString(),
        ticketId: t.ticketId,
        subject: t.subject,
        message: t.message,
        category: t.category,
        priority: t.priority,
        status: t.status,
        response: t.response || null,
        respondedAt: t.respondedAt || null,
        orderId: t.orderId || null,
        orderInfo: t.orderInfo || null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[GET /api/customer/support] error:', msg)
    return NextResponse.json({ error: 'Failed to fetch support data' }, { status: 500 })
  }
}

// ── POST: create a new support ticket ──
// Body: { subject: string, message: string, category: string, priority?: 'low'|'medium'|'high' }
export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerSession()
    if (!customer) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { subject, message, category, priority, orderId, orderInfo } = body

    // Validate
    if (!subject || typeof subject !== 'string' || subject.trim().length < 5) {
      return NextResponse.json({ error: 'Subject must be at least 5 characters' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return NextResponse.json({ error: 'Message must be at least 10 characters' }, { status: 400 })
    }
    if (!category || typeof category !== 'string') {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }

    const validPriorities = ['low', 'medium', 'high']
    const ticketPriority = validPriorities.includes(priority) ? priority : 'medium'

    const { db } = await connectToDatabase()

    // Fetch customer details
    const customerDoc = await db.collection('customers').findOne({ _id: new ObjectId(customer.id) })
    const customerName = customerDoc?.name || customer.name || 'Customer'
    const customerMobile = customerDoc?.mobile || customer.mobile || ''

    const now = new Date().toISOString()
    const ticketId = generateTicketId()

    const ticket = {
      ticketId,
      customerId: customer.id,
      customerName,
      customerMobile,
      subject: subject.trim(),
      message: message.trim(),
      category: category.trim(),
      priority: ticketPriority,
      status: 'open', // open | in_progress | resolved | closed
      response: null,
      respondedAt: null,
      respondedBy: null,
      // Optional: link to a specific order (Flipkart-style order-specific support)
      orderId: orderId || null,
      orderInfo: orderInfo || null, // { orderId, status, totalAmount, firstItemName, firstItemImage }
      createdAt: now,
      updatedAt: now,
    }

    const result = await db.collection('support_tickets').insertOne(ticket)

    return NextResponse.json({
      success: true,
      ticketId,
      id: result.insertedId.toString(),
      message: 'Support ticket created successfully. We will get back to you soon.',
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/customer/support] error:', msg)
    return NextResponse.json({ error: 'Failed to create support ticket' }, { status: 500 })
  }
}
