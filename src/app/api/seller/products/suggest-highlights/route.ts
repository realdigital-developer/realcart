import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import { getZAI, AI_MODEL } from '@/lib/ai-config'

/* ------------------------------------------------------------------ */
/*  POST /api/seller/products/suggest-highlights                        */
/*  Uses AI to suggest product highlights/key features based on the     */
/*  product name, description, and subcategory provided by the seller.  */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // Authenticate seller
  const { error: authError } = await authenticateSeller(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { name, description, subcategory } = body

    // Validate that at least the product name is provided
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Product name is required (at least 2 characters)' },
        { status: 400 }
      )
    }

    // Build the context for AI
    const contextParts: string[] = []
    if (name.trim()) contextParts.push(`Product Name: ${name.trim()}`)
    if (subcategory && typeof subcategory === 'string' && subcategory.trim()) {
      contextParts.push(`Subcategory: ${subcategory.trim()}`)
    }
    if (description && typeof description === 'string' && description.trim().length >= 10) {
      contextParts.push(`Description: ${description.trim()}`)
    }

    if (contextParts.length === 0) {
      return NextResponse.json(
        { error: 'Please provide product name with at least a description or subcategory' },
        { status: 400 }
      )
    }

    const productContext = contextParts.join('\n')

    const zai = await getZAI()

    const completion = await zai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'assistant',
          content: `You are an expert e-commerce product listing assistant. Your job is to generate concise, compelling highlights/key features for products sold on platforms like Flipkart, Meesho, and Amazon.

RULES:
- Generate 5 to 8 highlights only
- Each highlight should be short (3-8 words), punchy, and sell the product
- Use title case or sentence case
- Focus on: material, fit, design, functionality, durability, convenience, value
- Do NOT repeat the product name in highlights
- Do NOT use generic phrases like "High Quality" or "Best Product"
- Return ONLY a valid JSON array of strings, no other text
- Example format: ["100% Premium Cotton", "Regular Fit for All-Day Comfort", "Machine Washable", "Breathable Fabric"]`
        },
        {
          role: 'user',
          content: `Generate highlights/key features for this product:\n\n${productContext}`
        }
      ],
      thinking: { type: 'disabled' }
    })

    const responseText = completion.choices[0]?.message?.content?.trim()

    if (!responseText) {
      return NextResponse.json(
        { error: 'AI could not generate suggestions. Please try again.' },
        { status: 500 }
      )
    }

    // Parse the AI response — it should be a JSON array
    let highlights: string[] = []
    try {
      // Try to extract JSON array from the response (AI might wrap it in markdown)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        highlights = JSON.parse(jsonMatch[0])
      } else {
        // Fallback: split by newlines if not JSON
        highlights = responseText
          .split('\n')
          .map(line => line.replace(/^[\d\-\•\*\.\)\s]+/, '').trim())
          .filter(line => line.length > 0 && line.length < 80)
      }
    } catch {
      // If JSON parsing fails, try splitting by newlines
      highlights = responseText
        .split('\n')
        .map(line => line.replace(/^[\d\-\•\*\.\)\s]+/, '').trim())
        .filter(line => line.length > 0 && line.length < 80)
    }

    // Validate and clean up highlights
    const validHighlights = highlights
      .filter(h => typeof h === 'string' && h.trim().length > 0 && h.trim().length <= 80)
      .map(h => h.trim())
      .slice(0, 10) // Max 10

    if (validHighlights.length === 0) {
      return NextResponse.json(
        { error: 'AI could not generate valid suggestions. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ highlights: validHighlights })
  } catch (error) {
    console.error('[Suggest Highlights Error]', error)
    return NextResponse.json(
      { error: 'Failed to generate suggestions. Please try again.' },
      { status: 500 }
    )
  }
}
