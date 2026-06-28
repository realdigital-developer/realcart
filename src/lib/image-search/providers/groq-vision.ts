/**
 * Provider: Groq Vision
 * ------------------------------------------------------------------
 * Extracts high-level AND fashion-specific attributes from the uploaded
 * image using Groq's free-tier vision-capable LLM.
 *
 * Groq free-tier vision models (as of 2025):
 *   - meta-llama/llama-4-scout-17b-16e-instruct  (fast, recommended)
 *   - meta-llama/llama-4-maverick-17b-128e-instruct (higher quality)
 *   - meta-llama/llama-3.2-90b-vision-preview     (legacy, still works)
 *
 * The old `llama-3.2-11b-vision-preview` is deprecated and returns 404.
 * We now default to llama-4-scout which is fast, free, and supports
 * vision input via the OpenAI-compatible chat completions API.
 *
 * Returns:  { gender, category, color, style, ageGroup, subcategory,
 *             clothingType, material, pattern, sleeveType, neckline,
 *             dominantColors, description }
 *
 * FALLBACK: When GROQ_API_KEY is missing or the request fails, returns
 * neutral nulls. The pipeline then relies on Jina embedding + vector
 * search. This guarantees the feature always works.
 */

import { getImageSearchConfig } from '../config'
import type { ImageAttributes } from '../types'

export interface GroqVisionOutput {
  gender: string | null
  category: string | null
  subcategory: string | null
  color: string | null
  style: string | null
  ageGroup: string | null
  clothingType: string | null
  material: string | null
  pattern: string | null
  sleeveType: string | null
  neckline: string | null
  dominantColors: string[]
  description: string | null
}

const SYSTEM_PROMPT = `You are an expert fashion and product vision analyst for an e-commerce visual search system (like Meesho/Amazon). Analyze the product in the image and extract structured attributes.

Return ONLY a valid JSON object (no markdown fences, no explanation) with these exact keys:

{
  "gender": "men" | "women" | "kids" | "unisex" | null,
  "category": the primary product category. CRITICAL: Distinguish carefully between "t-shirt" (casual, knit fabric, no buttons) and "shirt" (button-down, collared, dress/casual shirt). Use one of: "t-shirt", "shirt", "kurta", "kurti", "sherwani", "panjabi", "dhoti", "nehru", "indo-western", "saree", "lehenga", "dress", "jeans", "trousers", "shorts", "jacket", "blazer", "leggings", "skirt", "sweater", "hoodie", "top", "blouse", "headphones", "earphones", "smartwatch", "watch", "mobile", "laptop", "speaker", "camera", "shoes", "sandals", "boots", "flip-flops", "bag", "wallet", "belt", "sunglasses", "cap", "home decor", "kitchen", "furniture", "beauty" | null,
  "subcategory": more specific type (e.g., "over-ear headphones", "running shoes", "crew neck t-shirt", "formal dress shirt", "wedding sherwani", "embroidered kurta") | null,
  "color": the SINGLE most dominant color name. Use canonical names: "black", "white", "red", "maroon", "pink", "orange", "yellow", "green", "olive", "teal", "navy blue", "sky blue", "blue", "denim blue", "purple", "lavender", "brown", "beige", "khaki", "grey", "silver", "gold", "multicolor" | null,
  "style": "casual" | "formal" | "sporty" | "ethnic" | "party" | "street" | null,
  "ageGroup": "adult" | "kids" | "teen" | "senior" | null,
  "clothingType": specific garment type (e.g., "t-shirt", "saree", "jeans", "jacket") | null,
  "material": "cotton" | "silk" | "polyester" | "wool" | "linen" | "denim" | "leather" | "rayon" | "nylon" | "blend" | null,
  "pattern": "solid" | "striped" | "floral" | "checked" | "printed" | "polka dots" | "geometric" | "abstract" | null,
  "sleeveType": "full" | "half" | "short" | "sleeveless" | null,
  "neckline": "round" | "v-neck" | "crew" | "polo" | "square" | null,
  "dominantColors": array of up to 3 secondary colors present (same canonical names as "color"),
  "description": a one-sentence description of the product for search matching
}

Rules:
- Be confident but accurate. If truly uncertain, return null for that key.
- For non-fashion products (electronics, home, etc.), set clothing-specific fields (material, pattern, sleeveType, neckline) to null.
- "color" is the SINGLE most prominent color. Put additional colors in "dominantColors".
- Use the exact canonical color names listed above for consistency.`

/**
 * Default Groq vision model — llama-4-scout is the current free-tier
 * vision model. Override with GROQ_VISION_MODEL env var if needed.
 */
const DEFAULT_GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

/**
 * Fallback model list — if the primary model 404s, try these in order.
 * This makes the integration resilient to Groq deprecating models.
 */
const FALLBACK_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-3.2-90b-vision-preview',
  'llama-3.2-90b-vision-preview',
]

/**
 * Call Groq's vision chat-completion API with the image as base64.
 * Tries multiple models if the primary one fails (404/deprecated).
 */
export async function analyzeWithGroq(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ result: GroqVisionOutput; source: 'groq' | 'fallback' }> {
  const config = getImageSearchConfig()

  if (!config.groq.available) {
    return { result: neutralFallback(), source: 'fallback' }
  }

  const base64 = imageBuffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  // Build the model try-list: configured model first, then fallbacks
  // (deduped, preserving order)
  const configuredModel = config.groq.model
  const modelsToTry = [...new Set([configuredModel, ...FALLBACK_MODELS])]

  for (const model of modelsToTry) {
    const result = await tryGroqModel(model, dataUrl, config.groq.apiKey!)
    if (result) {
      return { result, source: 'groq' }
    }
    // If this model failed with 404/422 (model not found/deprecated),
    // continue to the next model. Other errors (400 bad image, 429 rate
    // limit) → don't retry with another model, fall back entirely.
    // tryGroqModel returns null for retryable-not-found errors.
  }

  return { result: neutralFallback(), source: 'fallback' }
}

/**
 * Try a single Groq model. Returns the parsed result on success, or
 * null if we should try the next model (404/422), or throws to abort.
 */
async function tryGroqModel(
  model: string,
  dataUrl: string,
  apiKey: string,
): Promise<GroqVisionOutput | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000) // 20s budget (vision is slower)

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this product image and return the attributes as JSON.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // 404 / 422 = model not found or deprecated → try next model
      if (res.status === 404 || res.status === 422) {
        console.warn(`[ImageSearch:Groq] model "${model}" unavailable (${res.status}), trying next`)
        return null
      }
      // 429 = rate limit → don't try other models, just fall back
      if (res.status === 429) {
        console.warn(`[ImageSearch:Groq] rate limited on model "${model}"`)
        return null
      }
      // Other errors → log and try next model
      console.warn(`[ImageSearch:Groq] model "${model}" HTTP ${res.status}: ${text.slice(0, 200)}`)
      return null
    }

    const data = await res.json()
    const content: string | undefined = data?.choices?.[0]?.message?.content
    if (!content) {
      console.warn(`[ImageSearch:Groq] model "${model}" returned empty content`)
      return null
    }

    const parsed = parseJsonLoose(content)
    if (!parsed) {
      console.warn(`[ImageSearch:Groq] model "${model}" unparseable JSON: ${content.slice(0, 200)}`)
      return null
    }

    return {
      gender: pickString(parsed.gender),
      category: pickString(parsed.category),
      subcategory: pickString(parsed.subcategory),
      color: pickString(parsed.color),
      style: pickString(parsed.style),
      ageGroup: pickString(parsed.ageGroup),
      clothingType: pickString(parsed.clothingType),
      material: pickString(parsed.material),
      pattern: pickString(parsed.pattern),
      sleeveType: pickString(parsed.sleeveType),
      neckline: pickString(parsed.neckline),
      dominantColors: pickStringArray(parsed.dominantColors),
      description: pickString(parsed.description),
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted')) {
      console.warn(`[ImageSearch:Groq] model "${model}" timed out`)
    } else {
      console.warn(`[ImageSearch:Groq] model "${model}" error: ${msg}`)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** Neutral fallback — no attributes detected. Vector search takes over. */
function neutralFallback(): GroqVisionOutput {
  return {
    gender: null,
    category: null,
    subcategory: null,
    color: null,
    style: null,
    ageGroup: null,
    clothingType: null,
    material: null,
    pattern: null,
    sleeveType: null,
    neckline: null,
    dominantColors: [],
    description: null,
  }
}

/** Parse JSON allowing minor formatting quirks (markdown fences, trailing text). */
function parseJsonLoose(raw: string): Record<string, unknown> | null {
  // Strip markdown code fences if present
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  try {
    return JSON.parse(cleaned)
  } catch {
    // Try to extract the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

function pickString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() && v.toLowerCase() !== 'null' && v.toLowerCase() !== 'undefined') {
    return v.trim()
  }
  return null
}

function pickStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x && x.toLowerCase() !== 'null')
    .slice(0, 5)
}

/**
 * Build the partial ImageAttributes from Groq output.
 * Groq now extracts BOTH the high-level attributes AND the fashion-specific
 * ones (clothingType, material, pattern, sleeveType), so even without
 * Ximilar configured, we get rich attribute data.
 */
export function groqToAttributes(out: GroqVisionOutput): Partial<ImageAttributes> {
  return {
    gender: out.gender,
    category: out.category,
    color: out.color,
    style: out.style,
    ageGroup: out.ageGroup,
    clothingType: out.clothingType,
    material: out.material,
    pattern: out.pattern,
    sleeveType: out.sleeveType,
  }
}

/** Export the default model name for the config module to use. */
export const DEFAULT_GROQ_VISION_MODEL = DEFAULT_GROQ_MODEL
