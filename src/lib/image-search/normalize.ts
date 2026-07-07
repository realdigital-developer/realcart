/**
 * Image Search — Attribute Normalization
 * ------------------------------------------------------------------
 * Converts raw, free-form attributes from vision providers into canonical,
 * lowercase, consistent values used for filtering and scoring.
 *
 * This module is PURE (no I/O, no side effects) so it can be unit-tested
 * and shared by both the query pipeline and the batch indexer.
 */

import type { ImageAttributes } from './types'

/* ------------------------------------------------------------------ */
/*  Color Normalization                                                 */
/* ------------------------------------------------------------------ */

/** Map of common color synonyms → canonical name. */
const COLOR_MAP: Record<string, string> = {
  // Reds
  red: 'red', crimson: 'red', scarlet: 'red', maroon: 'maroon', burgundy: 'maroon',
  wine: 'maroon', cherry: 'red', ruby: 'red',
  // Pinks
  pink: 'pink', rose: 'pink', magenta: 'pink', fuchsia: 'pink', peach: 'peach',
  coral: 'coral', salmon: 'coral',
  // Oranges
  orange: 'orange', amber: 'orange', tangerine: 'orange', rust: 'orange',
  // Yellows
  yellow: 'yellow', gold: 'yellow', golden: 'yellow', mustard: 'mustard',
  // Greens
  green: 'green', olive: 'olive', lime: 'green', mint: 'green', emerald: 'green',
  teal: 'teal', turquoise: 'teal',
  // Blues
  blue: 'blue', navy: 'navy blue', 'navy blue': 'navy blue', indigo: 'indigo',
  cobalt: 'blue', sky: 'sky blue', 'sky blue': 'sky blue', azure: 'sky blue',
  royal: 'blue', denim: 'denim blue', 'denim blue': 'denim blue',
  // Purples
  purple: 'purple', violet: 'purple', lavender: 'lavender', plum: 'purple', lilac: 'lavender',
  // Browns
  brown: 'brown', tan: 'beige', beige: 'beige', khaki: 'khaki', camel: 'beige',
  chocolate: 'brown', coffee: 'brown', mocha: 'brown',
  // Grays
  gray: 'grey', grey: 'grey', charcoal: 'grey', slate: 'grey', ash: 'grey',
  // Blacks
  black: 'black', ebony: 'black', jet: 'black', onyx: 'black',
  // Whites
  white: 'white', ivory: 'white', cream: 'white', offwhite: 'white', 'off-white': 'white',
  // Silvers
  silver: 'silver', metallic: 'silver',
  // Multicolor
  multicolor: 'multicolor', multi: 'multicolor', printed: 'multicolor',
}

const COLOR_KEYWORDS: Array<[RegExp, string]> = [
  [/navy|royal blue|dark blue/i, 'navy blue'],
  [/sky|light blue|baby blue/i, 'sky blue'],
  [/denim/i, 'denim blue'],
  [/wine|burgundy|maroon/i, 'maroon'],
  [/mustard/i, 'mustard'],
  [/olive/i, 'olive'],
  [/teal|turquoise/i, 'teal'],
  [/lavender|lilac/i, 'lavender'],
  [/beige|tan|camel/i, 'beige'],
  [/charcoal|slate/i, 'grey'],
  [/ivory|cream|off-white|offwhite/i, 'white'],
]

export function normalizeColor(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!lower) return null
  if (COLOR_MAP[lower]) return COLOR_MAP[lower]
  for (const [re, canonical] of COLOR_KEYWORDS) {
    if (re.test(lower)) return canonical
  }
  // Single-word color — keep as-is (already lowercase)
  if (/^[a-z]+$/.test(lower)) return lower
  return lower
}

/* ------------------------------------------------------------------ */
/*  Gender Normalization                                                */
/* ------------------------------------------------------------------ */

const GENDER_MAP: Record<string, string> = {
  male: 'men', man: 'men', men: 'men', mens: "men's", "men's": "men's", boys: 'kids', boy: 'kids',
  female: 'women', woman: 'women', women: 'women', womens: "women's", "women's": "women's",
  girls: 'kids', girl: 'kids', ladies: 'women', lady: 'women',
  kid: 'kids', kids: 'kids', child: 'kids', children: 'kids', 'kid\'s': 'kids',
  unisex: 'unisex', gender: 'unisex', neutral: 'unisex',
}

export function normalizeGender(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!lower) return null
  if (GENDER_MAP[lower]) return GENDER_MAP[lower]
  // Heuristic: contains "men" but not "women" → men
  if (/men/.test(lower) && !/women/.test(lower)) return 'men'
  if (/women|ladies|girl/.test(lower)) return 'women'
  if (/kid|child|boy/.test(lower)) return 'kids'
  if (/unisex|neutral/.test(lower)) return 'unisex'
  return lower
}

/* ------------------------------------------------------------------ */
/*  Category Normalization                                              */
/* ------------------------------------------------------------------ */

/**
 * Map free-form category strings to a canonical taxonomy.
 * This is intentionally generous — unknown values pass through lowercased.
 */
const CATEGORY_MAP: Record<string, string> = {
  // Casual upper body wear
  't-shirt': 't-shirt', tshirt: 't-shirt', 't shirt': 't-shirt', tee: 't-shirt',
  shirt: 'shirt', 'casual shirt': 'shirt', 'formal shirt': 'shirt',
  'sweater': 'sweater', 'pullover': 'sweater', 'hoodie': 'hoodie',
  // Ethnic / traditional wear
  'kurta': 'kurta', 'kurta set': 'kurta', 'kurti': 'kurti',
  'sherwani': 'sherwani', 'panjabi': 'sherwani', 'punjabi': 'sherwani',
  'dhoti': 'dhoti', 'nehru jacket': 'nehru', 'nehru': 'nehru',
  'indo-western': 'indo-western', 'indowestern': 'indo-western',
  'ethnic wear': 'kurta', 'ethnic': 'kurta',
  // Women's traditional
  'saree': 'saree', 'sari': 'saree',
  'lehenga': 'lehenga',
  // Casual wear
  'dress': 'dress', 'gown': 'dress', 'frock': 'dress',
  'jeans': 'jeans', 'denim': 'jeans',
  'trouser': 'trousers', 'trousers': 'trousers', 'pants': 'trousers', 'pant': 'trousers',
  'shorts': 'shorts', 'three-fourths': 'shorts',
  'jacket': 'jacket', 'blazer': 'blazer', 'coat': 'jacket',
  'leggings': 'leggings', 'jegging': 'leggings',
  'skirt': 'skirt',
  // Footwear
  'shoes': 'shoes', 'shoe': 'shoes', 'sneakers': 'shoes', 'sports shoes': 'shoes',
  'running shoes': 'shoes', 'formal shoes': 'shoes',
  'sandal': 'sandals', 'sandals': 'sandals', 'floaters': 'sandals',
  'flip flop': 'flip-flops', 'flip-flops': 'flip-flops', 'slippers': 'flip-flops',
  'boots': 'boots', 'boot': 'boots',
  // Electronics
  'headphones': 'headphones', 'headphone': 'headphones', 'earphones': 'headphones',
  'earbuds': 'earphones', 'tws': 'earphones',
  'smartwatch': 'smartwatch', 'smart watch': 'smartwatch', 'watch': 'watch',
  'mobile': 'mobile', 'phone': 'mobile', 'smartphone': 'mobile',
  'laptop': 'laptop', 'tablet': 'tablet',
  'speaker': 'speaker', 'speakers': 'speaker', 'bluetooth speaker': 'speaker',
  'camera': 'camera',
  // Accessories
  'bag': 'bag', 'handbag': 'bag', 'backpack': 'bag', 'school bag': 'bag',
  'wallet': 'wallet', 'belt': 'belt', 'sunglasses': 'sunglasses',
  'cap': 'cap', 'hat': 'cap',
  // Home
  'kitchen': 'home', 'home decor': 'home', 'furniture': 'home',
}

export function normalizeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!lower) return null
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower]
  // Try keyword match
  for (const [key, canonical] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return canonical
  }
  return lower
}

/* ------------------------------------------------------------------ */
/*  Style / Age Group / Material / Pattern / Sleeve                    */
/* ------------------------------------------------------------------ */

export function normalizeStyle(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase()
  if (!lower) return null
  if (/casual|daily|everyday/.test(lower)) return 'casual'
  if (/formal|office|business|professional/.test(lower)) return 'formal'
  if (/sport|athletic|gym|activewear|activ/.test(lower)) return 'sporty'
  if (/ethnic|traditional|festive/.test(lower)) return 'ethnic'
  if (/party|wedding|occasion/.test(lower)) return 'party'
  if (/street|urban/.test(lower)) return 'street'
  return lower
}

export function normalizeAgeGroup(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase()
  if (!lower) return null
  if (/kid|child|boy|girl/.test(lower)) return 'kids'
  if (/teen|young/.test(lower)) return 'teen'
  if (/senior|elder|old/.test(lower)) return 'senior'
  return 'adult'
}

export function normalizeMaterial(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase()
  if (!lower) return null
  if (/cotton/.test(lower)) return 'cotton'
  if (/polyester|poly/.test(lower)) return 'polyester'
  if (/silk/.test(lower)) return 'silk'
  if (/wool|woolen/.test(lower)) return 'wool'
  if (/linen/.test(lower)) return 'linen'
  if (/denim|jean/.test(lower)) return 'denim'
  if (/leather/.test(lower)) return 'leather'
  if (/rayon/.test(lower)) return 'rayon'
  if (/nylon/.test(lower)) return 'nylon'
  if (/blend/.test(lower)) return 'blend'
  return lower
}

export function normalizePattern(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase()
  if (!lower) return null
  if (/solid|plain/.test(lower)) return 'solid'
  if (/stripe/.test(lower)) return 'striped'
  if (/floral|flower/.test(lower)) return 'floral'
  if (/check|plaid/.test(lower)) return 'checked'
  if (/print|printed/.test(lower)) return 'printed'
  if (/polka/.test(lower)) return 'polka dots'
  if (/geometric/.test(lower)) return 'geometric'
  if (/abstract/.test(lower)) return 'abstract'
  return lower
}

export function normalizeSleeve(raw: string | null | undefined): string | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase()
  if (!lower) return null
  if (/full|long/.test(lower)) return 'full'
  if (/half|3\/4|three quarter/.test(lower)) return 'half'
  if (/short/.test(lower)) return 'short'
  if (/sleeveless|tank|sleeve-less/.test(lower)) return 'sleeveless'
  return lower
}

/* ------------------------------------------------------------------ */
/*  Full Attribute Normalization                                       */
/* ------------------------------------------------------------------ */

/**
 * Normalize a raw attribute object (from Groq + Ximilar) into canonical form.
 * All fields are guaranteed non-null strings or null.
 */
export function normalizeAttributes(raw: Partial<ImageAttributes>): ImageAttributes {
  return {
    gender: normalizeGender(raw.gender),
    category: normalizeCategory(raw.category),
    color: normalizeColor(raw.color),
    style: normalizeStyle(raw.style),
    ageGroup: normalizeAgeGroup(raw.ageGroup),
    clothingType: normalizeCategory(raw.clothingType),
    material: normalizeMaterial(raw.material),
    pattern: normalizePattern(raw.pattern),
    sleeveType: normalizeSleeve(raw.sleeveType),
  }
}

/**
 * Merge two partial attribute objects (e.g., from Groq and Ximilar).
 * Groq provides gender/category/color/style/ageGroup.
 * Ximilar provides clothingType/material/pattern/sleeveType.
 * Non-null values always win; null values defer to the other provider.
 */
export function mergeAttributes(
  a: Partial<ImageAttributes>,
  b: Partial<ImageAttributes>,
): ImageAttributes {
  const merged: ImageAttributes = {
    gender: a.gender ?? b.gender ?? null,
    category: a.category ?? b.category ?? null,
    color: a.color ?? b.color ?? null,
    style: a.style ?? b.style ?? null,
    ageGroup: a.ageGroup ?? b.ageGroup ?? null,
    clothingType: a.clothingType ?? b.clothingType ?? null,
    material: a.material ?? b.material ?? null,
    pattern: a.pattern ?? b.pattern ?? null,
    sleeveType: a.sleeveType ?? b.sleeveType ?? null,
  }
  return normalizeAttributes(merged)
}

/**
 * Check whether two attribute objects are effectively equal (ignoring nulls).
 * Used by the cache key builder.
 */
export function attributesKey(attrs: ImageAttributes): string {
  const parts = [
    attrs.gender ?? '',
    attrs.category ?? '',
    attrs.color ?? '',
    attrs.style ?? '',
    attrs.ageGroup ?? '',
    attrs.clothingType ?? '',
    attrs.material ?? '',
    attrs.pattern ?? '',
    attrs.sleeveType ?? '',
  ]
  return parts.join('|')
}
