/**
 * Perceptual Hash (pHash) — Exact Image Match
 * ------------------------------------------------------------------
 * Generates a perceptual hash of an image for near-duplicate detection.
 *
 * How it works:
 *   1. Resize image to 32x32 grayscale (using sharp)
 *   2. Compute the DCT (Discrete Cosine Transform) — simplified 2D version
 *   3. Take the top-left 8x8 DCT coefficients (low-frequency — captures
 *      overall structure, not high-frequency noise)
 *   4. Compute the median of these 64 values
 *   5. Each bit = 1 if coefficient > median, else 0
 *   6. Result: 64-bit hash
 *
 * Two images with the same product (even different backgrounds/lighting)
 * will have a Hamming distance < 10. Exact duplicates have distance 0.
 *
 * This is the #1 priority in the Meesho-style ranking:
 *   "Exact Product Match (same image / near-duplicate) → Rank = 100"
 */

import sharp from 'sharp'

/**
 * Compute a 64-bit perceptual hash of an image buffer.
 * Returns the hash as a hex string (16 chars).
 */
export async function computeImageHash(imageBuffer: Buffer): Promise<string> {
  try {
    // Resize to 32x32 grayscale
    const { data } = await sharp(imageBuffer)
      .resize(32, 32, { fit: 'cover' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Convert to 2D array (32x32)
    const pixels: number[][] = []
    for (let i = 0; i < 32; i++) {
      const row: number[] = []
      for (let j = 0; j < 32; j++) {
        row.push(data[i * 32 + j])
      }
      pixels.push(row)
    }

    // Compute 2D DCT (simplified — we only need the top-left 8x8 block)
    const dct = computeDCT2D(pixels, 32)

    // Extract the top-left 8x8 block (excluding the DC component at [0][0])
    const coeffs: number[] = []
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (i === 0 && j === 0) continue // skip DC
        coeffs.push(dct[i][j])
      }
    }

    // Compute median
    const sorted = [...coeffs].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]

    // Build 64-bit hash using BigInt (JavaScript Number can't safely handle 64-bit)
    let hash = 0n
    let bit = 0n
    for (const c of coeffs) {
      if (c > median) {
        hash |= (1n << bit)
      }
      bit += 1n
    }

    // Convert to hex string (16 chars for 64 bits)
    return hash.toString(16).padStart(16, '0')
  } catch (err) {
    console.warn('[pHash] computation failed:', err instanceof Error ? err.message : String(err))
    return ''
  }
}

/**
 * Compute the Hamming distance between two hex hashes.
 * Returns -1 if either hash is empty/invalid.
 */
export function hashDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return -1
  let dist = 0
  const n1 = BigInt('0x' + hash1)
  const n2 = BigInt('0x' + hash2)
  let xor = n1 ^ n2
  while (xor > 0n) {
    dist += Number(xor & 1n)
    xor >>= 1n
  }
  return dist
}

/**
 * Check if two hashes represent the same/near-duplicate image.
 * Threshold: distance < 10 → near-duplicate (same product, different photo)
 *            distance < 5  → very likely the exact same image
 */
export function isNearDuplicate(hash1: string, hash2: string): boolean {
  const dist = hashDistance(hash1, hash2)
  return dist >= 0 && dist < 10
}

/**
 * Check if two hashes represent the EXACT same image.
 * Threshold: distance === 0 → exact match
 */
export function isExactMatch(hash1: string, hash2: string): boolean {
  const dist = hashDistance(hash1, hash2)
  return dist === 0
}

/**
 * Compute a simplified 2D Discrete Cosine Transform.
 * Only computes the top-left `size x size` block we need.
 *
 * This is a simplified DCT-II implementation — not as numerically
 * precise as a full FFT, but sufficient for perceptual hashing.
 */
function computeDCT2D(pixels: number[][], size: number): number[][] {
  // First, compute 1D DCT on each row
  const rowDCT: number[][] = []
  for (let i = 0; i < size; i++) {
    rowDCT.push(computeDCT1D(pixels[i], size))
  }

  // Then compute 1D DCT on each column of the row-DCT result
  const dct: number[][] = []
  for (let j = 0; j < size; j++) {
    const col: number[] = []
    for (let i = 0; i < size; i++) {
      col.push(rowDCT[i][j])
    }
    const colDCT = computeDCT1D(col, size)
    dct.push(colDCT)
  }

  // Transpose back (dct[j][i] → dct[i][j])
  const result: number[][] = []
  for (let i = 0; i < size; i++) {
    result.push([])
    for (let j = 0; j < size; j++) {
      result[i].push(dct[j][i])
    }
  }

  return result
}

/**
 * Compute 1D DCT-II of a signal.
 */
function computeDCT1D(signal: number[], size: number): number[] {
  const result: number[] = []
  for (let k = 0; k < size; k++) {
    let sum = 0
    for (let n = 0; n < size; n++) {
      sum += signal[n] * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * size))
    }
    const c_k = k === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size)
    result.push(sum * c_k)
  }
  return result
}
