/**
 * Attribute merging & normalization.
 *
 * Combines the outputs of Groq (high-level vision attributes) and Ximilar
 * (fine-grained fashion attributes) into a single normalized attribute set.
 *
 * Normalization rules:
 *  - All string values are lowercased & trimmed.
 *  - Colors are mapped to canonical names (see color-utils.ts).
 *  - Gender is mapped to a small canonical set.
 *  - Empty/unknown values become null.
 */

import { normalizeColor } from './color-utils'
import type { VisionAttributes, FashionAttributes, MergedAttributes } from './types'

/* ------------------------------------------------------------------ */
/*  Gender normalization                                               */
/* ------------------------------------------------------------------ */

const GENDER_MAP: Record<string, string> = {
  male: 'men',
  man: 'men',
  men: 'men',
  mens: 'men',
  "men's": 'men',
  female: 'women',
  woman: 'women',
  women: 'women',
  womens: 'women',
  "women's": 'women',
  unisex: 'unisex',
  neutral: 'unisex',
  boys: 'boys',
  boy: 'boys',
  girls: 'girls',
  girl: 'girls',
  kids: 'kids',
  kid: 'kids',
  children: 'kids',
  child: 'kids',
  teen: 'teen',
  teenager: 'teen',
  senior: 'senior',
  elderly: 'senior',
}

function normalizeGender(input: string | null | undefined): string | null {
  if (!input) return null
  const lower = input.toLowerCase().trim()
  return GENDER_MAP[lower] || (lower in GENDER_MAP ? GENDER_MAP[lower] : null)
}

/* ------------------------------------------------------------------ */
/*  Generic string normalizer                                          */
/* ------------------------------------------------------------------ */

function normString(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.toLowerCase().trim()
  return trimmed.length > 0 ? trimmed : null
}

/* ------------------------------------------------------------------ */
/*  Merge                                                              */
/* ------------------------------------------------------------------ */

export function mergeAttributes(
  vision: VisionAttributes,
  fashion: FashionAttributes,
): MergedAttributes {
  return {
    gender: normalizeGender(vision.gender),
    category: normString(vision.category),
    color: normalizeColor(vision.color),
    style: normString(vision.style),
    ageGroup: normString(vision.ageGroup),
    clothingType: normString(fashion.clothingType),
    material: normString(fashion.material),
    pattern: normString(fashion.pattern),
    sleeveType: normString(fashion.sleeveType),
    description: normString(vision.description),
  }
}

/**
 * Build a free-text search query from the merged attributes.
 * Used as a fallback when both vector and Algolia search return nothing.
 */
export function buildTextQuery(attrs: MergedAttributes): string {
  const parts: string[] = []
  if (attrs.gender) parts.push(attrs.gender)
  if (attrs.category) parts.push(attrs.category)
  if (attrs.clothingType) parts.push(attrs.clothingType)
  if (attrs.color) parts.push(attrs.color)
  if (attrs.material) parts.push(attrs.material)
  if (attrs.pattern) parts.push(attrs.pattern)
  return parts.join(' ').trim()
}
