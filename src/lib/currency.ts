/**
 * Currency formatting utility for the entire application.
 *
 * Centralises all currency-related logic so that changing the
 * symbol, locale, or formatting style only requires editing
 * this single file.
 */

/** Currency symbol used across the application */
export const CURRENCY_SYMBOL = '₹' as const

/** Currency code for reference / API usage */
export const CURRENCY_CODE = 'INR' as const

/**
 * Format a numeric value as a currency string.
 *
 * @example
 * formatCurrency(1200)     // "₹1,200.00"
 * formatCurrency(49.5)     // "₹49.50"
 * formatCurrency(0)        // "₹0.00"
 * formatCurrency(1200, 0)  // "₹1,200"
 */
export function formatCurrency(value: number, decimalPlaces: number = 2): string {
  const formatted = value.toLocaleString('en-IN', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
  return `${CURRENCY_SYMBOL}${formatted}`
}

/**
 * Shorthand alias — identical to `formatCurrency`.
 * Kept for backward-compat and brevity in tight JSX.
 */
export const fmtPrice = formatCurrency
