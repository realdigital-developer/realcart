/**
 * Finance Engine — Production-Level Multi-Vendor E-Commerce
 *
 * Implements comprehensive financial calculations for Indian e-commerce:
 *   - Category-wise commission rates (like Flipkart/Meesho/Amazon)
 *   - TDS deduction under Section 194-O (1% for e-commerce operators)
 *   - TCS collection under Section 52 of IGST Act (1% on net taxable supplies)
 *   - GST on platform commission (18%)
 *   - Seller payout calculation with all deductions
 *   - Delivery charge computation
 *   - COD convenience fee
 *   - Platform fee / handling charges
 *   - Settlement cycle tracking
 *
 * Based on production finance systems used by Flipkart, Meesho, Amazon India.
 */

import { calculateTax, extractGstFromInclusiveCharge, type TaxBreakdown, type TaxCalculationInput } from './tax-engine'

/* ------------------------------------------------------------------ */
/*  Commission Configuration                                            */
/* ------------------------------------------------------------------ */

/** Category-wise commission rates (inspired by Flipkart/Meesho/Amazon India) */
export interface CategoryCommission {
  /** Category name */
  category: string
  /** Commission rate as percentage */
  rate: number
  /** Sub-categories (if different rates apply) */
  subcategories?: Record<string, number>
  /** Minimum commission per item (₹) */
  minCommission?: number
  /** Maximum commission per item (₹, 0 = no cap) */
  maxCommission?: number
}

/** Default category-wise commission rates for Indian e-commerce */
export const DEFAULT_CATEGORY_COMMISSIONS: CategoryCommission[] = [
  {
    category: 'Electronics',
    rate: 8,
    subcategories: {
      'Mobile Phones': 6,
      'Laptops': 6,
      'Tablets': 6,
      'Audio': 10,
      'Cameras': 8,
      'Accessories': 12,
      'Chargers': 12,
      'Cables': 12,
      'Headphones': 10,
      'Smartwatches': 10,
      'Power Banks': 10,
    },
    minCommission: 5,
  },
  {
    category: 'Fashion',
    rate: 15,
    subcategories: {
      'Men\'s Clothing': 12,
      'Women\'s Clothing': 12,
      'Kids\' Clothing': 10,
      'Men\'s Footwear': 14,
      'Women\'s Footwear': 14,
      'Kids\' Footwear': 12,
      'Bags & Luggage': 12,
      'Watches': 10,
      'Jewellery': 12,
      'Sunglasses': 15,
      'Ethnic Wear': 12,
      'Western Wear': 12,
      'Sportswear': 14,
    },
    minCommission: 5,
  },
  {
    category: 'Home & Kitchen',
    rate: 12,
    subcategories: {
      'Kitchen Appliances': 10,
      'Cookware': 10,
      'Storage': 12,
      'Furniture': 8,
      'Bedding': 12,
      'Decor': 15,
      'Lighting': 12,
      'Cleaning': 14,
    },
    minCommission: 5,
  },
  {
    category: 'Beauty & Personal Care',
    rate: 14,
    subcategories: {
      'Skincare': 14,
      'Haircare': 14,
      'Makeup': 15,
      'Fragrances': 12,
      'Men\'s Grooming': 14,
      'Health Devices': 10,
    },
    minCommission: 5,
  },
  {
    category: 'Books',
    rate: 8,
    subcategories: {
      'Fiction': 8,
      'Non-Fiction': 8,
      'Academic': 6,
      'Children\'s Books': 6,
    },
    minCommission: 2,
  },
  {
    category: 'Sports & Fitness',
    rate: 12,
    subcategories: {
      'Cricket': 12,
      'Fitness Equipment': 10,
      'Yoga': 10,
      'Gym Accessories': 12,
    },
    minCommission: 5,
  },
  {
    category: 'Toys & Games',
    rate: 14,
    subcategories: {
      'Board Games': 14,
      'Action Figures': 14,
      'Educational Toys': 10,
      'Baby Toys': 10,
    },
    minCommission: 5,
  },
  {
    category: 'Grocery & Gourmet',
    rate: 6,
    subcategories: {
      'Staples': 4,
      'Snacks': 6,
      'Beverages': 6,
      'Spices': 6,
      'Organic': 8,
    },
    minCommission: 2,
  },
  {
    category: 'Health & Wellness',
    rate: 10,
    subcategories: {
      'Ayurvedic': 10,
      'Supplements': 12,
      'OTC Medicines': 8,
      'Personal Care': 12,
    },
    minCommission: 5,
  },
  {
    category: 'Automotive',
    rate: 10,
    subcategories: {
      'Car Accessories': 12,
      'Bike Accessories': 12,
      'Spare Parts': 8,
      'Helmets': 10,
    },
    minCommission: 5,
  },
]

/** Flat default commission for unmapped categories */
export const DEFAULT_COMMISSION_RATE = 10

/* ------------------------------------------------------------------ */
/*  TDS / TCS Configuration                                            */
/* ------------------------------------------------------------------ */

/** TDS rate under Section 194-O for e-commerce operators */
export const TDS_RATE_194O = 1 // 1% (0.5% if PAN available but no Aadhaar, 5% if no PAN)

/** TCS rate under Section 52 of IGST Act */
export const TCS_RATE_52 = 1 // 1% (0.5% CGST + 0.5% SGST for intra-state, 1% IGST for inter-state)

/** GST rate on platform commission */
export const GST_ON_COMMISSION_RATE = 18 // 18%

/* ------------------------------------------------------------------ */
/*  Delivery & Fee Configuration                                        */
/* ------------------------------------------------------------------ */

/** Delivery charge configuration */
export interface DeliveryConfig {
  /** Base delivery charge (₹) */
  baseCharge: number
  /** Free delivery threshold (₹, 0 = never free) */
  freeAbove: number
  /** Additional charge per 500g above base weight */
  per500g: number
  /** Base weight in grams */
  baseWeight: number
  /** COD convenience fee (₹) */
  codFee: number
  /** Platform handling fee (₹) */
  platformFee: number
}

/** Default delivery configuration */
export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  baseCharge: 49,
  freeAbove: 499,
  per500g: 20,
  baseWeight: 500,
  codFee: 40,
  platformFee: 5,
}

/* ------------------------------------------------------------------ */
/*  Finance Calculation Types                                           */
/* ------------------------------------------------------------------ */

/** Complete financial breakdown for an order item */
export interface ItemFinanceBreakdown {
  /** Order item ID */
  orderItemId: string
  /** Product ID */
  productId: string
  /** Product name */
  productName: string
  /** HSN code */
  hsnCode: string
  /** Quantity */
  quantity: number

  // --- Customer-facing amounts ---
  /** MRP (Maximum Retail Price) per unit */
  mrpPerUnit: number
  /** Effective selling price per unit (after product discount) */
  sellingPricePerUnit: number
  /** Product discount per unit (MRP - selling price) */
  productDiscountPerUnit: number
  /** Total product discount for this item */
  productDiscountTotal: number
  /** Taxable value per unit (before GST) */
  taxableValuePerUnit: number
  /** GST rate applied (%) */
  gstRate: number
  /** CGST per unit */
  cgstPerUnit: number
  /** SGST per unit */
  sgstPerUnit: number
  /** IGST per unit */
  igstPerUnit: number
  /** Cess per unit */
  cessPerUnit: number
  /** Total tax per unit */
  taxPerUnit: number
  /** Price including tax per unit */
  priceWithTaxPerUnit: number
  /** Item total (priceWithTax × quantity) */
  itemTotal: number

  // --- Seller-facing amounts ---
  /** Taxable value total (for commission calculation) */
  taxableValueTotal: number
  /** Platform commission rate applied (%) */
  commissionRate: number
  /** Platform commission amount */
  commissionAmount: number
  /** GST on commission (18%) */
  gstOnCommission: number
  /** Delivery charge for this item */
  deliveryCharge: number
  /** GST on delivery charge */
  gstOnDelivery: number
  /** TDS deducted (1% under 194-O) */
  tdsAmount: number
  /** TCS collected (1% under Section 52) */
  tcsAmount: number
  /** Seller earnings (after all deductions) */
  sellerEarnings: number

  // --- Tax summary ---
  /** Total CGST for item */
  totalCgst: number
  /** Total SGST for item */
  totalSgst: number
  /** Total IGST for item */
  totalIgst: number
  /** Total Cess for item */
  totalCess: number
  /** Total tax for item */
  totalTax: number
}

/** Order-level financial summary */
export interface OrderFinanceSummary {
  // --- Customer totals ---
  /** Total MRP of all items */
  totalMrp: number
  /** Total product discount */
  totalProductDiscount: number
  /** Subtotal after product discount */
  subtotalAfterDiscount: number
  /** Total taxable value */
  totalTaxableValue: number
  /** Total CGST */
  totalCgst: number
  /** Total SGST */
  totalSgst: number
  /** Total IGST */
  totalIgst: number
  /** Total Cess */
  totalCess: number
  /** Total GST amount */
  totalGst: number
  /** Total delivery charges */
  totalDeliveryCharge: number
  /** GST on delivery */
  totalGstOnDelivery: number
  /** COD fee */
  codFee: number
  /** Platform fee */
  platformFee: number
  /** Coupon discount */
  couponDiscount: number
  /** Total discount (product + coupon) */
  totalDiscount: number
  /** Round-off to nearest rupee */
  roundOff: number
  /** Final amount payable by customer */
  totalPayable: number

  // --- Seller totals (aggregated) ---
  /** Total platform commission */
  totalCommission: number
  /** Total GST on commission */
  totalGstOnCommission: number
  /** Total TDS deducted */
  totalTds: number
  /** Total TCS collected */
  totalTcs: number
  /** Total seller earnings */
  totalSellerEarnings: number

  // --- Tax details ---
  isIntraState: boolean
}

/* ------------------------------------------------------------------ */
/*  Core Finance Calculation Functions                                   */
/* ------------------------------------------------------------------ */

/**
 * Get commission rate for a product category and subcategory.
 * Falls back to default rate if category not found.
 */
export function getCommissionRate(
  category: string,
  subcategory?: string,
  categoryCommissions?: CategoryCommission[],
): number {
  const commissions = categoryCommissions || DEFAULT_CATEGORY_COMMISSIONS

  // Find category
  const categoryConfig = commissions.find(
    c => c.category.toLowerCase() === category?.toLowerCase()
  )

  if (!categoryConfig) {
    return DEFAULT_COMMISSION_RATE
  }

  // Check subcategory first
  if (subcategory && categoryConfig.subcategories) {
    const subRate = categoryConfig.subcategories[subcategory]
    if (subRate !== undefined) return subRate
  }

  return categoryConfig.rate
}

/**
 * Calculate commission amount for an item.
 * Commission is calculated on the taxable value (pre-tax selling price).
 */
export function calculateCommission(
  taxableValue: number,
  category: string,
  subcategory?: string,
  categoryCommissions?: CategoryCommission[],
): {
  rate: number
  amount: number
  gstOnCommission: number
  minApplied: boolean
} {
  const rate = getCommissionRate(category, subcategory, categoryCommissions)
  let amount = Math.round(taxableValue * rate / 100 * 100) / 100

  // Apply minimum commission
  const commissions = categoryCommissions || DEFAULT_CATEGORY_COMMISSIONS
  const categoryConfig = commissions.find(
    c => c.category.toLowerCase() === category?.toLowerCase()
  )
  let minApplied = false
  if (categoryConfig?.minCommission && amount < categoryConfig.minCommission) {
    amount = categoryConfig.minCommission
    minApplied = true
  }
  if (categoryConfig?.maxCommission && categoryConfig.maxCommission > 0 && amount > categoryConfig.maxCommission) {
    amount = categoryConfig.maxCommission
  }

  // GST on commission (18%) — the platform must charge this to the seller
  const gstOnCommission = Math.round(amount * GST_ON_COMMISSION_RATE / 100 * 100) / 100

  return { rate, amount, gstOnCommission, minApplied }
}

/**
 * Calculate TDS under Section 194-O.
 * E-commerce operators must deduct 1% TDS on gross amount of goods/services.
 * Rate is 0.5% if seller has PAN but not Aadhaar linked, 5% if no PAN.
 */
export function calculateTds(
  grossAmount: number,
  hasPan: boolean = true,
  isAadhaarLinked: boolean = true,
): {
  rate: number
  amount: number
  section: string
} {
  let rate = TDS_RATE_194O

  if (!hasPan) {
    rate = 5 // 5% if no PAN
  } else if (!isAadhaarLinked) {
    rate = 0.5 // 0.5% if PAN but Aadhaar not linked (transitional)
  }

  const amount = Math.round(grossAmount * rate / 100 * 100) / 100

  return {
    rate,
    amount,
    section: '194-O',
  }
}

/**
 * Calculate TCS under Section 52 of IGST Act.
 * E-commerce operators must collect 1% TCS on net taxable supplies.
 * For intra-state: 0.5% CGST + 0.5% SGST
 * For inter-state: 1% IGST
 */
export function calculateTcs(
  netTaxableValue: number,
  isIntraState: boolean,
): {
  rate: number
  amount: number
  cgst: number
  sgst: number
  igst: number
  section: string
} {
  const rate = TCS_RATE_52
  const amount = Math.round(netTaxableValue * rate / 100 * 100) / 100

  if (isIntraState) {
    const half = Math.round(amount / 2 * 100) / 100
    return { rate, amount, cgst: half, sgst: half, igst: 0, section: 'Section 52' }
  }

  return { rate, amount, cgst: 0, sgst: 0, igst: amount, section: 'Section 52' }
}

/**
 * Calculate delivery charge for an item.
 * Considers weight, free delivery threshold, and seller's delivery settings.
 */
export function calculateDeliveryCharge(params: {
  sellingPrice: number
  weight?: number
  sellerFreeDeliveryAbove?: number
  productDeliveryCharge?: number
  productFreeDeliveryAbove?: number
  config?: Partial<DeliveryConfig>
}): {
  deliveryCharge: number
  isFree: boolean
  breakdown: {
    baseCharge: number
    weightCharge: number
    freeDeliveryApplied: boolean
  }
} {
  const config = { ...DEFAULT_DELIVERY_CONFIG, ...params.config }

  // Check if product has free delivery
  if (params.productDeliveryCharge === 0) {
    return {
      deliveryCharge: 0,
      isFree: true,
      breakdown: { baseCharge: 0, weightCharge: 0, freeDeliveryApplied: true },
    }
  }

  // Check free delivery threshold (product-level takes priority)
  const freeAbove = params.productFreeDeliveryAbove || params.sellerFreeDeliveryAbove || config.freeAbove
  if (freeAbove > 0 && params.sellingPrice >= freeAbove) {
    return {
      deliveryCharge: 0,
      isFree: true,
      breakdown: { baseCharge: 0, weightCharge: 0, freeDeliveryApplied: true },
    }
  }

  // Calculate weight-based charge
  const baseCharge = params.productDeliveryCharge || config.baseCharge
  let weightCharge = 0

  if (params.weight && params.weight > config.baseWeight) {
    const extra500g = Math.ceil((params.weight - config.baseWeight) / 500)
    weightCharge = extra500g * config.per500g
  }

  const deliveryCharge = baseCharge + weightCharge

  return {
    deliveryCharge,
    isFree: false,
    breakdown: {
      baseCharge,
      weightCharge,
      freeDeliveryApplied: false,
    },
  }
}

/**
 * Calculate complete financial breakdown for an order item.
 * This is the single source of truth for all money calculations.
 */
export function calculateItemFinance(params: {
  orderItemId: string
  productId: string
  productName: string
  hsnCode: string
  quantity: number
  mrp: number
  sellingPrice: number
  category: string
  subcategory?: string
  sellerState: string
  customerState: string
  isTaxInclusive: boolean
  weight?: number
  sellerFreeDeliveryAbove?: number
  productDeliveryCharge?: number
  productFreeDeliveryAbove?: number
  sellerHasPan?: boolean
  sellerIsAadhaarLinked?: boolean
  deliveryConfig?: Partial<DeliveryConfig>
  categoryCommissions?: CategoryCommission[]
  cessRate?: number
}): ItemFinanceBreakdown {
  const {
    orderItemId,
    productId,
    productName,
    hsnCode,
    quantity,
    mrp,
    sellingPrice,
    category,
    subcategory,
    sellerState,
    customerState,
    isTaxInclusive,
    weight,
    sellerFreeDeliveryAbove,
    productDeliveryCharge,
    productFreeDeliveryAbove,
    sellerHasPan = true,
    sellerIsAadhaarLinked = true,
    deliveryConfig,
    categoryCommissions,
    cessRate,
  } = params

  // 1. Product discount
  const productDiscountPerUnit = Math.max(0, mrp - sellingPrice)
  const productDiscountTotal = Math.round(productDiscountPerUnit * quantity * 100) / 100

  // 2. Tax calculation on selling price
  const taxInput: TaxCalculationInput = {
    hsnCode,
    sellingPrice,
    isTaxInclusive,
    sellerState,
    customerState,
    cessRate,
  }
  const taxBreakdown = calculateTax(taxInput)

  // 3. Per-unit tax amounts
  const taxableValuePerUnit = taxBreakdown.taxableValue
  const cgstPerUnit = taxBreakdown.cgst
  const sgstPerUnit = taxBreakdown.sgst
  const igstPerUnit = taxBreakdown.igst
  const cessPerUnit = taxBreakdown.cessAmount
  const taxPerUnit = taxBreakdown.totalTax
  const priceWithTaxPerUnit = taxBreakdown.priceWithTax

  // 4. Totals for quantity
  const taxableValueTotal = Math.round(taxableValuePerUnit * quantity * 100) / 100
  const totalCgst = Math.round(cgstPerUnit * quantity * 100) / 100
  const totalSgst = Math.round(sgstPerUnit * quantity * 100) / 100
  const totalIgst = Math.round(igstPerUnit * quantity * 100) / 100
  const totalCess = Math.round(cessPerUnit * quantity * 100) / 100
  const totalTax = Math.round(taxPerUnit * quantity * 100) / 100
  const itemTotal = Math.round(priceWithTaxPerUnit * quantity)

  // 5. Commission on taxable value (pre-tax)
  const commission = calculateCommission(
    taxableValueTotal,
    category,
    subcategory,
    categoryCommissions,
  )

  // 6. Delivery charge
  const delivery = calculateDeliveryCharge({
    sellingPrice: priceWithTaxPerUnit * quantity,
    weight: weight ? weight * quantity : undefined,
    sellerFreeDeliveryAbove,
    productDeliveryCharge,
    productFreeDeliveryAbove,
    config: deliveryConfig,
  })

  // 7. GST embedded in the delivery charge (18%, GST-INCLUSIVE model)
  // The customer-facing delivery charge is GST-INCLUSIVE in this project.
  // For internal tax reporting (GSTR-1, seller payouts, finance summaries)
  // we extract the embedded 18% GST from the inclusive charge using the
  // reverse-GST formula: gst = inclusive × 18 / 118.
  // This value is NOT added on top of the customer total — it's already
  // inside `delivery.deliveryCharge`.
  const gstOnDelivery = extractGstFromInclusiveCharge(delivery.deliveryCharge)

  // 8. TDS on gross amount (taxable value × quantity)
  const tds = calculateTds(taxableValueTotal, sellerHasPan, sellerIsAadhaarLinked)

  // 9. TCS on net taxable value
  const tcs = calculateTcs(taxableValueTotal, taxBreakdown.isIntraState)

  // 10. Seller earnings = Taxable Value - Commission - GST on Commission - Delivery - TDS - TCS
  //    (Tax is collected from customer and remitted to government; seller gets the pre-tax amount minus deductions)
  const sellerEarnings = Math.max(0, Math.round(
    (taxableValueTotal - commission.amount - commission.gstOnCommission - delivery.deliveryCharge - tds.amount - tcs.amount) * 100
  ) / 100)

  return {
    orderItemId,
    productId,
    productName,
    hsnCode,
    quantity,

    // Customer-facing
    mrpPerUnit: mrp,
    sellingPricePerUnit: sellingPrice,
    productDiscountPerUnit,
    productDiscountTotal,
    taxableValuePerUnit,
    gstRate: taxBreakdown.gstRate,
    cgstPerUnit,
    sgstPerUnit,
    igstPerUnit,
    cessPerUnit,
    taxPerUnit,
    priceWithTaxPerUnit,
    itemTotal,

    // Seller-facing
    taxableValueTotal,
    commissionRate: commission.rate,
    commissionAmount: commission.amount,
    gstOnCommission: commission.gstOnCommission,
    deliveryCharge: delivery.deliveryCharge,
    gstOnDelivery,
    tdsAmount: tds.amount,
    tcsAmount: tcs.amount,
    sellerEarnings,

    // Tax totals
    totalCgst,
    totalSgst,
    totalIgst,
    totalCess,
    totalTax,
  }
}

/**
 * Calculate order-level financial summary from item breakdowns.
 */
export function calculateOrderFinance(params: {
  itemBreakdowns: ItemFinanceBreakdown[]
  couponDiscount?: number
  codFee?: number
  platformFee?: number
}): OrderFinanceSummary {
  const { itemBreakdowns, couponDiscount = 0, codFee = 0, platformFee = 0 } = params

  let totalMrp = 0
  let totalProductDiscount = 0
  let totalTaxableValue = 0
  let totalCgst = 0
  let totalSgst = 0
  let totalIgst = 0
  let totalCess = 0
  let totalGst = 0
  let totalDeliveryCharge = 0
  let totalGstOnDelivery = 0
  let totalCommission = 0
  let totalGstOnCommission = 0
  let totalTds = 0
  let totalTcs = 0
  let totalSellerEarnings = 0

  const isIntraState = itemBreakdowns.length > 0
    ? (itemBreakdowns[0].cgstPerUnit > 0 || itemBreakdowns[0].sgstPerUnit > 0)
    : false

  for (const item of itemBreakdowns) {
    totalMrp += item.mrpPerUnit * item.quantity
    totalProductDiscount += item.productDiscountTotal
    totalTaxableValue += item.taxableValueTotal
    totalCgst += item.totalCgst
    totalSgst += item.totalSgst
    totalIgst += item.totalIgst
    totalCess += item.totalCess
    totalGst += item.totalTax
    totalDeliveryCharge += item.deliveryCharge
    totalGstOnDelivery += item.gstOnDelivery
    totalCommission += item.commissionAmount
    totalGstOnCommission += item.gstOnCommission
    totalTds += item.tdsAmount
    totalTcs += item.tcsAmount
    totalSellerEarnings += item.sellerEarnings
  }

  // Round all totals
  totalMrp = Math.round(totalMrp * 100) / 100
  totalProductDiscount = Math.round(totalProductDiscount * 100) / 100
  totalTaxableValue = Math.round(totalTaxableValue * 100) / 100
  totalCgst = Math.round(totalCgst * 100) / 100
  totalSgst = Math.round(totalSgst * 100) / 100
  totalIgst = Math.round(totalIgst * 100) / 100
  totalCess = Math.round(totalCess * 100) / 100
  totalGst = Math.round(totalGst * 100) / 100
  totalDeliveryCharge = Math.round(totalDeliveryCharge * 100) / 100
  totalGstOnDelivery = Math.round(totalGstOnDelivery * 100) / 100
  totalCommission = Math.round(totalCommission * 100) / 100
  totalGstOnCommission = Math.round(totalGstOnCommission * 100) / 100
  totalTds = Math.round(totalTds * 100) / 100
  totalTcs = Math.round(totalTcs * 100) / 100
  totalSellerEarnings = Math.round(totalSellerEarnings * 100) / 100

  const subtotalAfterDiscount = Math.round((totalMrp - totalProductDiscount) * 100) / 100

  // Customer pays: items with tax + delivery (GST-INCLUSIVE) + COD fee + platform fee - coupon discount
  //
  // PROJECT POLICY: `totalDeliveryCharge` is GST-INCLUSIVE — the embedded GST
  // (`totalGstOnDelivery`) is already inside it. We must NOT add
  // `totalGstOnDelivery` again here, otherwise the customer would be
  // double-charged. The extracted `totalGstOnDelivery` is still returned in
  // the breakdown for tax-reporting purposes (GSTR-1, admin tax dashboard).
  const exactTotal = totalTaxableValue + totalGst + totalDeliveryCharge + codFee + platformFee - couponDiscount
  const totalPayable = Math.round(exactTotal)
  const roundOff = Math.round((totalPayable - exactTotal) * 100) / 100

  const totalDiscount = Math.round((totalProductDiscount + couponDiscount) * 100) / 100

  return {
    totalMrp,
    totalProductDiscount,
    subtotalAfterDiscount,
    totalTaxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    totalCess,
    totalGst,
    totalDeliveryCharge,
    totalGstOnDelivery,
    codFee,
    platformFee,
    couponDiscount,
    totalDiscount,
    roundOff,
    totalPayable,
    totalCommission,
    totalGstOnCommission,
    totalTds,
    totalTcs,
    totalSellerEarnings,
    isIntraState,
  }
}

/* ------------------------------------------------------------------ */
/*  Invoice Number Generation                                           */
/* ------------------------------------------------------------------ */

/**
 * Generate a GST invoice number.
 * Format: INV-YYYYMMDD-XXXX (compliant with Indian invoicing rules)
 * As per GST law, invoice number must not exceed 16 characters and must be unique per financial year.
 */
export function generateInvoiceNumber(): string {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `INV-${dateStr}-${random}`
}

/**
 * Generate a GST credit note number.
 * Format: CN-YYYYMMDD-XXXX (mirrors the invoice number format, prefixed CN)
 *
 * A credit note is issued to REVERSE a tax invoice when an order (or part of
 * an order) is cancelled. Under GST Rule 16 (CGST Rules 2017), the credit
 * note number must be unique and linked to the original invoice it reverses.
 */
export function generateCreditNoteNumber(): string {
  const date = new Date()
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `CN-${dateStr}-${random}`
}

/* ------------------------------------------------------------------ */
/*  Settlement & Payout Types                                           */
/* ------------------------------------------------------------------ */

/** Settlement status */
export type SettlementStatus = 'pending' | 'processed' | 'paid' | 'failed'

/** Payout record for a seller */
export interface SellerPayout {
  _id?: string
  sellerId: string
  sellerName: string
  sellerStoreName: string
  /** Settlement period start */
  periodStart: string
  /** Settlement period end */
  periodEnd: string
  /** Total order value (taxable) */
  grossOrderValue: number
  /** Total commission */
  commission: number
  /** GST on commission */
  gstOnCommission: number
  /** Total delivery charges collected */
  deliveryCollected: number
  /** Total TDS deducted */
  tdsDeducted: number
  /** Total TCS collected */
  tcsCollected: number
  /** Net payout amount */
  netPayout: number
  /** Settlement status */
  status: SettlementStatus
  /** Bank account details */
  bankAccount: {
    accountNumber: string
    ifscCode: string
    bankName: string
    accountHolderName: string
  }
  /** Order IDs included in this settlement */
  orderIds: string[]
  /** When the settlement was processed */
  processedAt?: string
  /** When the payout was completed */
  paidAt?: string
  /** Transaction reference number */
  transactionRef?: string
  createdAt: string
  updatedAt: string
}

/**
 * Calculate net payout for a seller from multiple order items.
 */
export function calculateSellerPayout(params: {
  items: Array<{
    taxableValue: number
    commission: number
    gstOnCommission: number
    deliveryCharge: number
    tdsAmount: number
    tcsAmount: number
  }>
}): {
  grossOrderValue: number
  totalCommission: number
  totalGstOnCommission: number
  totalDeliveryCollected: number
  totalTds: number
  totalTcs: number
  netPayout: number
} {
  let grossOrderValue = 0
  let totalCommission = 0
  let totalGstOnCommission = 0
  let totalDeliveryCollected = 0
  let totalTds = 0
  let totalTcs = 0

  for (const item of params.items) {
    grossOrderValue += item.taxableValue
    totalCommission += item.commission
    totalGstOnCommission += item.gstOnCommission
    totalDeliveryCollected += item.deliveryCharge
    totalTds += item.tdsAmount
    totalTcs += item.tcsAmount
  }

  const netPayout = Math.max(0, Math.round(
    (grossOrderValue - totalCommission - totalGstOnCommission - totalDeliveryCollected - totalTds - totalTcs) * 100
  ) / 100)

  return {
    grossOrderValue: Math.round(grossOrderValue * 100) / 100,
    totalCommission: Math.round(totalCommission * 100) / 100,
    totalGstOnCommission: Math.round(totalGstOnCommission * 100) / 100,
    totalDeliveryCollected: Math.round(totalDeliveryCollected * 100) / 100,
    totalTds: Math.round(totalTds * 100) / 100,
    totalTcs: Math.round(totalTcs * 100) / 100,
    netPayout,
  }
}
