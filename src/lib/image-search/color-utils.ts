/**
 * Color normalization & matching utilities.
 *
 * Vision models (Groq) return free-text color names like "Navy Blue",
 * "light pink", "maroon". We normalize these to a canonical set so that
 * attribute matching between the query image and indexed products is
 * consistent.
 *
 * Also includes a fast perceptual color-distance function (in RGB space)
 * used by the local fallback path when no vision API is available.
 */

/* ------------------------------------------------------------------ */
/*  Canonical color map                                                */
/*  Keys are lowercased synonyms; values are canonical names.          */
/* ------------------------------------------------------------------ */

const COLOR_SYNONYMS: Record<string, string> = {
  // Reds
  red: 'red', crimson: 'red', scarlet: 'red', maroon: 'maroon', burgundy: 'maroon',
  wine: 'maroon', cherry: 'red', ruby: 'red',
  // Pinks
  pink: 'pink', rose: 'pink', 'light pink': 'pink', 'hot pink': 'pink', fuchsia: 'pink',
  magenta: 'pink', peach: 'peach',
  // Oranges
  orange: 'orange', 'rust': 'orange', 'terracotta': 'orange', 'coral': 'coral',
  // Yellows
  yellow: 'yellow', gold: 'gold', 'mustard': 'mustard', 'lemon': 'yellow',
  // Greens
  green: 'green', 'olive': 'olive', 'lime': 'green', 'mint': 'green', 'emerald': 'green',
  'forest': 'green', 'teal': 'teal',
  // Blues
  blue: 'blue', 'navy': 'navy', 'navy blue': 'navy', 'royal blue': 'blue',
  'sky blue': 'blue', 'light blue': 'blue', 'dark blue': 'navy', 'indigo': 'indigo',
  'cobalt': 'blue', 'azure': 'blue', 'cyan': 'cyan', 'turquoise': 'teal',
  // Purples
  purple: 'purple', 'violet': 'purple', 'lavender': 'lavender', 'plum': 'purple',
  'mauve': 'purple', 'lilac': 'lavender',
  // Browns
  brown: 'brown', 'tan': 'tan', 'beige': 'beige', 'camel': 'tan', 'khaki': 'khaki',
  'chocolate': 'brown', 'coffee': 'brown', 'mocha': 'brown',
  // Neutrals
  black: 'black', white: 'white', gray: 'grey', grey: 'grey', 'charcoal': 'grey',
  'silver': 'grey', 'slate': 'grey', 'off-white': 'white', 'ivory': 'white',
  'cream': 'beige', 'nude': 'beige',
  // Multi
  'multi': 'multicolor', 'multicolor': 'multicolor', 'printed': 'multicolor',
  'assorted': 'multicolor',
}

/**
 * Normalize a free-text color into a canonical name.
 * Returns null when the color can't be parsed.
 */
export function normalizeColor(input: string | null | undefined): string | null {
  if (!input) return null
  const lower = input.toLowerCase().trim()
  if (!lower) return null
  // Direct match
  if (COLOR_SYNONYMS[lower]) return COLOR_SYNONYMS[lower]
  // Try first word (e.g., "navy blue striped" → "navy")
  const words = lower.split(/\s+/)
  for (const w of words) {
    if (COLOR_SYNONYMS[w]) return COLOR_SYNONYMS[w]
  }
  // Try the whole phrase as a prefix lookup
  for (const key of Object.keys(COLOR_SYNONYMS)) {
    if (lower.includes(key)) return COLOR_SYNONYMS[key]
  }
  return lower // return as-is (still useful for exact-string matching)
}

/* ------------------------------------------------------------------ */
/*  RGB <-> HEX helpers                                                */
/* ------------------------------------------------------------------ */

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  const num = parseInt(full, 16)
  if (!Number.isFinite(num)) return [0, 0, 0]
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/* ------------------------------------------------------------------ */
/*  Color name from RGB (basic classifier)                             */
/*  Used by the local fallback when no vision API is available.        */
/* ------------------------------------------------------------------ */

const NAMED_COLORS: { name: string; rgb: [number, number, number] }[] = [
  { name: 'black', rgb: [0, 0, 0] },
  { name: 'white', rgb: [255, 255, 255] },
  { name: 'grey', rgb: [128, 128, 128] },
  { name: 'red', rgb: [255, 0, 0] },
  { name: 'maroon', rgb: [128, 0, 0] },
  { name: 'pink', rgb: [255, 192, 203] },
  { name: 'orange', rgb: [255, 165, 0] },
  { name: 'yellow', rgb: [255, 255, 0] },
  { name: 'green', rgb: [0, 128, 0] },
  { name: 'teal', rgb: [0, 128, 128] },
  { name: 'blue', rgb: [0, 0, 255] },
  { name: 'navy', rgb: [0, 0, 128] },
  { name: 'purple', rgb: [128, 0, 128] },
  { name: 'brown', rgb: [139, 69, 19] },
  { name: 'beige', rgb: [245, 245, 220] },
]

/**
 * Classify an RGB pixel into the nearest canonical color name.
 * Uses weighted RGB distance (human eyes are more sensitive to green).
 */
export function classifyColor(r: number, g: number, b: number): string {
  let best = 'grey'
  let bestDist = Infinity
  for (const { name, rgb } of NAMED_COLORS) {
    const dr = r - rgb[0]
    const dg = g - rgb[1]
    const db = b - rgb[2]
    // Weighted Euclidean — approximates perceived difference
    const dist = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db
    if (dist < bestDist) {
      bestDist = dist
      best = name
    }
  }
  return best
}

/* ------------------------------------------------------------------ */
/*  Color similarity score (0..1)                                      */
/*  Used by the attribute-match ranking stage.                         */
/* ------------------------------------------------------------------ */

export function colorSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  const na = normalizeColor(a)
  const nb = normalizeColor(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  // Partial credit for same color family (e.g. navy vs blue)
  const families: Record<string, string> = {
    red: 'red', maroon: 'red', pink: 'red', coral: 'red', peach: 'red',
    orange: 'orange', yellow: 'orange', gold: 'orange', mustard: 'orange',
    green: 'green', olive: 'green', teal: 'green',
    blue: 'blue', navy: 'blue', indigo: 'blue', cyan: 'blue',
    purple: 'purple', lavender: 'purple',
    brown: 'brown', tan: 'brown', beige: 'brown', khaki: 'brown',
    black: 'neutral', white: 'neutral', grey: 'neutral',
  }
  const fa = families[na] || na
  const fb = families[nb] || nb
  return fa === fb ? 0.5 : 0
}
