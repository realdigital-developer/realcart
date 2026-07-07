/**
 * Groq Vision Analysis.
 *
 * Calls Groq's vision-capable LLM (llama-4-scout / llama-3.2-90b-vision) to
 * extract high-level attributes from the query image:
 *   - gender, category, color, style, ageGroup, and a short description.
 *
 * When GROQ_API_KEY is not set, we fall back to a local heuristic that uses
 * `sharp` to compute the dominant color and brightness — this keeps the
 * feature working in environments without the API key (e.g. Vercel previews).
 *
 * No Z.ai tools are used — this is a direct HTTP call to Groq's OpenAI-compatible
 * chat-completions endpoint with an image_url content part.
 */

import { GROQ, HAS_GROQ, DEBUG } from './config'
import type { VisionAttributes } from './types'
import { classifyColor } from './color-utils'

/* ------------------------------------------------------------------ */
/*  Local fallback — uses `sharp` for dominant-color extraction        */
/* ------------------------------------------------------------------ */

async function localFallback(buffer: Buffer): Promise<VisionAttributes> {
  try {
    // sharp is already a project dependency (used for image optimization)
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(buffer)
      .resize(32, 32, { fit: 'inside' })  // shrink for fast averaging
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Average the pixels to find the dominant color
    let r = 0, g = 0, b = 0
    const pixelCount = info.width * info.height
    for (let i = 0; i < data.length; i += info.channels) {
      r += data[i]
      g += data[i + 1] || 0
      b += data[i + 2] || 0
    }
    r = Math.round(r / pixelCount)
    g = Math.round(g / pixelCount)
    b = Math.round(b / pixelCount)
    const color = classifyColor(r, g, b)

    if (DEBUG) console.log('[image-search] Groq fallback — dominant color:', color)

    return {
      gender: null,
      category: null,
      color,
      style: null,
      ageGroup: null,
      description: null,
    }
  } catch (err) {
    console.warn('[image-search] Groq local fallback failed:', (err as Error).message)
    return {
      gender: null,
      category: null,
      color: null,
      style: null,
      ageGroup: null,
      description: null,
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Groq vision call                                                   */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a fashion & product vision analyst for an e-commerce visual search engine.
Analyze the provided product image and return a JSON object with these exact keys:
{
  "gender": "men" | "women" | "unisex" | "boys" | "girls" | "kids" | null,
  "category": <short product category, e.g. "T-Shirt", "Saree", "Headphones", "Shoes">,
  "color": <primary color in lowercase, e.g. "navy blue", "red", "black">,
  "style": "casual" | "formal" | "sporty" | "ethnic" | "party" | null,
  "ageGroup": "adult" | "teen" | "kids" | "senior" | null,
  "description": <one short sentence describing the product>
}
Rules:
- Return ONLY the JSON object. No markdown, no explanation.
- If a field cannot be determined, use null.
- Category must be a generic product type, not a brand name.
- If the image is blurry or contains multiple items, describe the most prominent one.`

interface GroqVisionResponse {
  gender: string | null
  category: string | null
  color: string | null
  style: string | null
  ageGroup: string | null
  description: string | null
}

async function callGroq(buffer: Buffer, mimeType: string): Promise<VisionAttributes> {
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  const body = {
    model: GROQ.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this product image and return the JSON.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 300,
    response_format: { type: 'json_object' },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000) // 15s timeout

  try {
    const res = await fetch(GROQ.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`)
    }

    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (!content) throw new Error('Groq returned empty content')

    // The model may return JSON with or without markdown fences
    const cleaned = typeof content === 'string'
      ? content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      : JSON.stringify(content)

    const parsed: GroqVisionResponse = JSON.parse(cleaned)

    return {
      gender: parsed.gender || null,
      category: parsed.category || null,
      color: parsed.color || null,
      style: parsed.style || null,
      ageGroup: parsed.ageGroup || null,
      description: parsed.description || null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function analyzeWithGroq(buffer: Buffer, mimeType: string): Promise<VisionAttributes> {
  if (!HAS_GROQ) {
    if (DEBUG) console.log('[image-search] Groq skipped (no API key) — using local fallback')
    return localFallback(buffer)
  }

  try {
    const result = await callGroq(buffer, mimeType)
    if (DEBUG) console.log('[image-search] Groq result:', JSON.stringify(result))
    return result
  } catch (err) {
    console.warn('[image-search] Groq call failed, falling back to local:', (err as Error).message)
    return localFallback(buffer)
  }
}
