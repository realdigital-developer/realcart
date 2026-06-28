/* ------------------------------------------------------------------ */
/*  Size Chart Templates                                                */
/*  Pre-defined templates for different product categories              */
/*  Following Flipkart/Amazon/Meesho size chart patterns                */
/* ------------------------------------------------------------------ */

export interface SizeChartTemplate {
  _id?: string
  name: string
  description: string
  /** Column headers for the size chart table */
  headers: string[]
  /** Pre-filled row data – each row maps header → value. "Size" column values are auto-matched. */
  rows: Record<string, string>[]
  /** Unit system: 'metric' (cm/kg), 'imperial' (in/lb), or 'both' */
  unit: 'metric' | 'imperial' | 'both'
  /** Conversion factor from imperial to metric (e.g., 2.54 for inches→cm) */
  conversionFactor?: number
  /** The header that represents the "size label" (e.g., "Size", "UK Size", "US Size") */
  sizeHeader: string
  /** How-to-measure tips for customers */
  howToMeasure?: string[]
  /** Whether this is a system template (cannot be deleted) */
  isSystem?: boolean
  /** Status */
  status: 'Active' | 'Inactive'
  createdAt?: string | Date
  updatedAt?: string | Date
}

/* ------------------------------------------------------------------ */
/*  Default Templates                                                   */
/* ------------------------------------------------------------------ */

export const DEFAULT_SIZE_CHART_TEMPLATES: Omit<SizeChartTemplate, '_id'>[] = [
  // ─── Men's Clothing ───
  {
    name: "Men's T-Shirts & Tops",
    description: 'Standard size chart for men t-shirts, polos, and tops',
    headers: ['Size', 'Chest (in)', 'Waist (in)', 'Length (in)', 'Sleeve Length (in)'],
    rows: [
      { 'Size': 'XS', 'Chest (in)': '34-36', 'Waist (in)': '28-30', 'Length (in)': '26', 'Sleeve Length (in)': '7.5' },
      { 'Size': 'S', 'Chest (in)': '36-38', 'Waist (in)': '30-32', 'Length (in)': '27', 'Sleeve Length (in)': '8' },
      { 'Size': 'M', 'Chest (in)': '38-40', 'Waist (in)': '32-34', 'Length (in)': '28', 'Sleeve Length (in)': '8.5' },
      { 'Size': 'L', 'Chest (in)': '40-42', 'Waist (in)': '34-36', 'Length (in)': '29', 'Sleeve Length (in)': '9' },
      { 'Size': 'XL', 'Chest (in)': '42-44', 'Waist (in)': '36-38', 'Length (in)': '30', 'Sleeve Length (in)': '9.5' },
      { 'Size': 'XXL', 'Chest (in)': '44-46', 'Waist (in)': '38-40', 'Length (in)': '31', 'Sleeve Length (in)': '10' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Chest: Measure around the fullest part of your chest, under the armpits',
      'Waist: Measure around your natural waistline',
      'Length: Measure from the highest point of the shoulder to the hem',
      'Sleeve Length: Measure from the shoulder seam to the cuff edge',
    ],
    isSystem: true,
    status: 'Active',
  },
  {
    name: "Men's Shirts",
    description: 'Standard size chart for men formal and casual shirts',
    headers: ['Size', 'Chest (in)', 'Waist (in)', 'Shoulder (in)', 'Length (in)', 'Sleeve (in)'],
    rows: [
      { 'Size': 'S', 'Chest (in)': '36-38', 'Waist (in)': '30-32', 'Shoulder (in)': '16', 'Length (in)': '27', 'Sleeve (in)': '24' },
      { 'Size': 'M', 'Chest (in)': '38-40', 'Waist (in)': '32-34', 'Shoulder (in)': '17', 'Length (in)': '28', 'Sleeve (in)': '25' },
      { 'Size': 'L', 'Chest (in)': '40-42', 'Waist (in)': '34-36', 'Shoulder (in)': '18', 'Length (in)': '29', 'Sleeve (in)': '26' },
      { 'Size': 'XL', 'Chest (in)': '42-44', 'Waist (in)': '36-38', 'Shoulder (in)': '19', 'Length (in)': '30', 'Sleeve (in)': '27' },
      { 'Size': 'XXL', 'Chest (in)': '44-46', 'Waist (in)': '38-40', 'Shoulder (in)': '20', 'Length (in)': '31', 'Sleeve (in)': '28' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Chest: Measure around the fullest part, keeping the tape level',
      'Waist: Measure around your natural waistline',
      'Shoulder: Measure from one shoulder seam to the other across the back',
      'Length: Measure from the collar seam to the hem',
      'Sleeve: Measure from the shoulder seam to the cuff',
    ],
    isSystem: true,
    status: 'Active',
  },
  {
    name: "Men's Jeans & Trousers",
    description: 'Size chart for men jeans, chinos, and trousers',
    headers: ['Size', 'Waist (in)', 'Hip (in)', 'Inseam (in)', 'Outseam (in)'],
    rows: [
      { 'Size': '28', 'Waist (in)': '28', 'Hip (in)': '36', 'Inseam (in)': '30', 'Outseam (in)': '40' },
      { 'Size': '30', 'Waist (in)': '30', 'Hip (in)': '38', 'Inseam (in)': '30', 'Outseam (in)': '41' },
      { 'Size': '32', 'Waist (in)': '32', 'Hip (in)': '40', 'Inseam (in)': '31', 'Outseam (in)': '42' },
      { 'Size': '34', 'Waist (in)': '34', 'Hip (in)': '42', 'Inseam (in)': '31', 'Outseam (in)': '43' },
      { 'Size': '36', 'Waist (in)': '36', 'Hip (in)': '44', 'Inseam (in)': '32', 'Outseam (in)': '44' },
      { 'Size': '38', 'Waist (in)': '38', 'Hip (in)': '46', 'Inseam (in)': '32', 'Outseam (in)': '45' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Waist: Measure around your natural waistline, keep tape comfortably loose',
      'Hip: Measure around the fullest part of your hips/buttocks',
      'Inseam: Measure from the crotch seam to the bottom of the leg',
      'Outseam: Measure from the top of the waistband to the bottom of the leg',
    ],
    isSystem: true,
    status: 'Active',
  },

  // ─── Women's Clothing ───
  {
    name: "Women's Tops & Kurtis",
    description: 'Standard size chart for women tops, kurtis, and tunics',
    headers: ['Size', 'Bust (in)', 'Waist (in)', 'Hip (in)', 'Length (in)'],
    rows: [
      { 'Size': 'XS', 'Bust (in)': '32', 'Waist (in)': '26', 'Hip (in)': '35', 'Length (in)': '36' },
      { 'Size': 'S', 'Bust (in)': '34', 'Waist (in)': '28', 'Hip (in)': '37', 'Length (in)': '38' },
      { 'Size': 'M', 'Bust (in)': '36', 'Waist (in)': '30', 'Hip (in)': '39', 'Length (in)': '40' },
      { 'Size': 'L', 'Bust (in)': '38', 'Waist (in)': '32', 'Hip (in)': '41', 'Length (in)': '42' },
      { 'Size': 'XL', 'Bust (in)': '40', 'Waist (in)': '34', 'Hip (in)': '43', 'Length (in)': '44' },
      { 'Size': 'XXL', 'Bust (in)': '42', 'Waist (in)': '36', 'Hip (in)': '45', 'Length (in)': '46' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Bust: Measure around the fullest part of your bust',
      'Waist: Measure around your natural waistline (narrowest part)',
      'Hip: Measure around the fullest part of your hips',
      'Length: Measure from the shoulder point to the hem',
    ],
    isSystem: true,
    status: 'Active',
  },
  {
    name: "Women's Dresses",
    description: 'Size chart for women dresses, gowns, and jumpsuits',
    headers: ['Size', 'Bust (in)', 'Waist (in)', 'Hip (in)', 'Length (in)'],
    rows: [
      { 'Size': 'XS', 'Bust (in)': '32', 'Waist (in)': '26', 'Hip (in)': '35', 'Length (in)': '34' },
      { 'Size': 'S', 'Bust (in)': '34', 'Waist (in)': '28', 'Hip (in)': '37', 'Length (in)': '36' },
      { 'Size': 'M', 'Bust (in)': '36', 'Waist (in)': '30', 'Hip (in)': '39', 'Length (in)': '38' },
      { 'Size': 'L', 'Bust (in)': '38', 'Waist (in)': '32', 'Hip (in)': '41', 'Length (in)': '40' },
      { 'Size': 'XL', 'Bust (in)': '40', 'Waist (in)': '34', 'Hip (in)': '43', 'Length (in)': '42' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Bust: Measure around the fullest part of your bust',
      'Waist: Measure around your natural waistline',
      'Hip: Stand with feet together, measure around the fullest part',
      'Length: Measure from the highest point of the shoulder to the hem',
    ],
    isSystem: true,
    status: 'Active',
  },

  // ─── Footwear ───
  {
    name: "Men's Footwear",
    description: 'Size chart for men shoes, sneakers, and sandals',
    headers: ['UK Size', 'US Size', 'EU Size', 'Foot Length (in)', 'Foot Length (cm)'],
    rows: [
      { 'UK Size': '6', 'US Size': '7', 'EU Size': '40', 'Foot Length (in)': '9.6', 'Foot Length (cm)': '24.4' },
      { 'UK Size': '7', 'US Size': '8', 'EU Size': '41', 'Foot Length (in)': '9.9', 'Foot Length (cm)': '25.2' },
      { 'UK Size': '8', 'US Size': '9', 'EU Size': '42', 'Foot Length (in)': '10.2', 'Foot Length (cm)': '26.0' },
      { 'UK Size': '9', 'US Size': '10', 'EU Size': '43', 'Foot Length (in)': '10.6', 'Foot Length (cm)': '26.8' },
      { 'UK Size': '10', 'US Size': '11', 'EU Size': '44', 'Foot Length (in)': '10.9', 'Foot Length (cm)': '27.6' },
      { 'UK Size': '11', 'US Size': '12', 'EU Size': '45', 'Foot Length (in)': '11.3', 'Foot Length (cm)': '28.4' },
    ],
    unit: 'both',
    sizeHeader: 'UK Size',
    howToMeasure: [
      'Stand on a piece of paper with your heel against the wall',
      'Mark the longest point of your foot (usually the big toe) on the paper',
      'Measure the distance from the wall to the mark',
      'Measure both feet and use the larger measurement',
    ],
    isSystem: true,
    status: 'Active',
  },
  {
    name: "Women's Footwear",
    description: 'Size chart for women shoes, heels, and sandals',
    headers: ['UK Size', 'US Size', 'EU Size', 'Foot Length (in)', 'Foot Length (cm)'],
    rows: [
      { 'UK Size': '3', 'US Size': '5.5', 'EU Size': '36', 'Foot Length (in)': '8.7', 'Foot Length (cm)': '22.2' },
      { 'UK Size': '4', 'US Size': '6.5', 'EU Size': '37', 'Foot Length (in)': '9.0', 'Foot Length (cm)': '22.9' },
      { 'UK Size': '5', 'US Size': '7.5', 'EU Size': '38', 'Foot Length (in)': '9.3', 'Foot Length (cm)': '23.6' },
      { 'UK Size': '6', 'US Size': '8.5', 'EU Size': '39', 'Foot Length (in)': '9.6', 'Foot Length (cm)': '24.4' },
      { 'UK Size': '7', 'US Size': '9.5', 'EU Size': '40', 'Foot Length (in)': '9.9', 'Foot Length (cm)': '25.2' },
      { 'UK Size': '8', 'US Size': '10.5', 'EU Size': '41', 'Foot Length (in)': '10.2', 'Foot Length (cm)': '26.0' },
    ],
    unit: 'both',
    sizeHeader: 'UK Size',
    howToMeasure: [
      'Stand on a piece of paper with your heel against the wall',
      'Mark the longest point of your foot on the paper',
      'Measure the distance from the wall to the mark',
      'Measure both feet and use the larger measurement',
    ],
    isSystem: true,
    status: 'Active',
  },

  // ─── Kids Clothing ───
  {
    name: "Kids' Clothing (2-8 Years)",
    description: 'Size chart for kids clothing based on age and height',
    headers: ['Size', 'Age', 'Height (in)', 'Chest (in)', 'Waist (in)'],
    rows: [
      { 'Size': '2-3Y', 'Age': '2-3 Years', 'Height (in)': '35-38', 'Chest (in)': '20-21', 'Waist (in)': '19-20' },
      { 'Size': '3-4Y', 'Age': '3-4 Years', 'Height (in)': '38-41', 'Chest (in)': '21-22', 'Waist (in)': '20-21' },
      { 'Size': '4-5Y', 'Age': '4-5 Years', 'Height (in)': '41-43', 'Chest (in)': '22-23', 'Waist (in)': '21-22' },
      { 'Size': '5-6Y', 'Age': '5-6 Years', 'Height (in)': '43-46', 'Chest (in)': '23-24', 'Waist (in)': '22-23' },
      { 'Size': '6-7Y', 'Age': '6-7 Years', 'Height (in)': '46-48', 'Chest (in)': '24-25', 'Waist (in)': '23-24' },
      { 'Size': '7-8Y', 'Age': '7-8 Years', 'Height (in)': '48-50', 'Chest (in)': '25-26', 'Waist (in)': '24-25' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Height: Measure from the top of the head to the floor, standing straight',
      'Chest: Measure around the fullest part of the chest',
      'Waist: Measure around the natural waistline',
    ],
    isSystem: true,
    status: 'Active',
  },

  // ─── Innerwear & Sleepwear ───
  {
    name: "Men's Innerwear",
    description: 'Size chart for men briefs, boxers, and vests',
    headers: ['Size', 'Waist (in)', 'Hip (in)'],
    rows: [
      { 'Size': 'S', 'Waist (in)': '28-30', 'Hip (in)': '35-37' },
      { 'Size': 'M', 'Waist (in)': '30-34', 'Hip (in)': '37-39' },
      { 'Size': 'L', 'Waist (in)': '34-38', 'Hip (in)': '39-41' },
      { 'Size': 'XL', 'Waist (in)': '38-42', 'Hip (in)': '41-43' },
      { 'Size': 'XXL', 'Waist (in)': '42-46', 'Hip (in)': '43-45' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Waist: Measure around your natural waistline, keep the tape comfortably loose',
      'Hip: Measure around the fullest part of your hips/buttocks',
    ],
    isSystem: true,
    status: 'Active',
  },

  // ─── Sports & Activewear ───
  {
    name: "Sports & Activewear",
    description: 'Size chart for sports t-shirts, track pants, and activewear',
    headers: ['Size', 'Chest (in)', 'Waist (in)', 'Hip (in)', 'Inseam (in)'],
    rows: [
      { 'Size': 'XS', 'Chest (in)': '34-36', 'Waist (in)': '28-30', 'Hip (in)': '35-37', 'Inseam (in)': '28' },
      { 'Size': 'S', 'Chest (in)': '36-38', 'Waist (in)': '30-32', 'Hip (in)': '37-39', 'Inseam (in)': '29' },
      { 'Size': 'M', 'Chest (in)': '38-40', 'Waist (in)': '32-34', 'Hip (in)': '39-41', 'Inseam (in)': '30' },
      { 'Size': 'L', 'Chest (in)': '40-42', 'Waist (in)': '34-36', 'Hip (in)': '41-43', 'Inseam (in)': '31' },
      { 'Size': 'XL', 'Chest (in)': '42-44', 'Waist (in)': '36-38', 'Hip (in)': '43-45', 'Inseam (in)': '32' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Chest: Measure around the fullest part of your chest while breathing normally',
      'Waist: Measure around your natural waistline',
      'Hip: Measure around the fullest part of your hips',
      'Inseam: Measure from the crotch to the desired length',
    ],
    isSystem: true,
    status: 'Active',
  },

  // ─── Generic Clothing ───
  {
    name: "Generic Clothing",
    description: 'Basic size chart for general clothing items without a specific category',
    headers: ['Size', 'Chest (in)', 'Waist (in)', 'Hip (in)', 'Length (in)'],
    rows: [
      { 'Size': 'XS', 'Chest (in)': '32-34', 'Waist (in)': '26-28', 'Hip (in)': '34-36', 'Length (in)': '26' },
      { 'Size': 'S', 'Chest (in)': '34-36', 'Waist (in)': '28-30', 'Hip (in)': '36-38', 'Length (in)': '27' },
      { 'Size': 'M', 'Chest (in)': '36-38', 'Waist (in)': '30-32', 'Hip (in)': '38-40', 'Length (in)': '28' },
      { 'Size': 'L', 'Chest (in)': '38-40', 'Waist (in)': '32-34', 'Hip (in)': '40-42', 'Length (in)': '29' },
      { 'Size': 'XL', 'Chest (in)': '40-42', 'Waist (in)': '34-36', 'Hip (in)': '42-44', 'Length (in)': '30' },
      { 'Size': 'XXL', 'Chest (in)': '42-44', 'Waist (in)': '36-38', 'Hip (in)': '44-46', 'Length (in)': '31' },
    ],
    unit: 'imperial',
    conversionFactor: 2.54,
    sizeHeader: 'Size',
    howToMeasure: [
      'Chest: Measure around the fullest part of your chest',
      'Waist: Measure around your natural waistline',
      'Hip: Measure around the fullest part of your hips',
      'Length: Measure from the shoulder to the hem',
    ],
    isSystem: true,
    status: 'Active',
  },

  // ─── Luggage & Bags ───
  {
    name: "Travel Bags & Luggage",
    description: 'Size chart for travel bags based on capacity and dimensions',
    headers: ['Size', 'Capacity (L)', 'Length (cm)', 'Width (cm)', 'Height (cm)'],
    rows: [
      { 'Size': 'Small', 'Capacity (L)': '20-30', 'Length (cm)': '45', 'Width (cm)': '25', 'Height (cm)': '30' },
      { 'Size': 'Medium', 'Capacity (L)': '30-50', 'Length (cm)': '55', 'Width (cm)': '30', 'Height (cm)': '40' },
      { 'Size': 'Large', 'Capacity (L)': '50-75', 'Length (cm)': '65', 'Width (cm)': '35', 'Height (cm)': '50' },
      { 'Size': 'Extra Large', 'Capacity (L)': '75-100', 'Length (cm)': '75', 'Width (cm)': '40', 'Height (cm)': '55' },
    ],
    unit: 'metric',
    sizeHeader: 'Size',
    howToMeasure: [
      'Check the capacity (liters) to understand how much the bag can hold',
      'Dimensions are measured as Length × Width × Height',
      'Ensure the bag meets airline cabin luggage size limits if needed',
    ],
    isSystem: true,
    status: 'Active',
  },
]

/* ------------------------------------------------------------------ */
/*  Helper: Find best matching template (by name keyword)               */
/* ------------------------------------------------------------------ */

export function findTemplateByName(
  templates: SizeChartTemplate[],
  keyword: string
): SizeChartTemplate | null {
  if (!keyword?.trim()) return null
  const q = keyword.toLowerCase().trim()
  // Try to find a template whose name contains the keyword
  const match = templates.find(
    t => t.name.toLowerCase().includes(q) && t.status === 'Active'
  )
  return match || null
}

/* ------------------------------------------------------------------ */
/*  Helper: Generate size chart from template + variant size values     */
/* ------------------------------------------------------------------ */

export function generateSizeChartFromTemplate(
  template: SizeChartTemplate,
  sizeValues: string[]
): { headers: string[]; rows: Record<string, string>[] } {
  // If the template has rows that match the size values, use them directly
  const sizeHeader = template.sizeHeader
  const matchedRows: Record<string, string>[] = []

  for (const sizeValue of sizeValues) {
    // Try to find a matching row in the template
    const matchingRow = template.rows.find(
      row => row[sizeHeader]?.toLowerCase() === sizeValue.toLowerCase() ||
             row[sizeHeader]?.toLowerCase().includes(sizeValue.toLowerCase()) ||
             sizeValue.toLowerCase().includes(row[sizeHeader]?.toLowerCase())
    )

    if (matchingRow) {
      // Use the template row but override the size value to match exactly
      matchedRows.push({ ...matchingRow, [sizeHeader]: sizeValue })
    } else {
      // Create a new row with the size value and empty measurement cells
      const newRow: Record<string, string> = { [sizeHeader]: sizeValue }
      template.headers.forEach(h => {
        if (h !== sizeHeader) newRow[h] = ''
      })
      matchedRows.push(newRow)
    }
  }

  return {
    headers: [...template.headers],
    rows: matchedRows,
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: Convert measurements between units                         */
/* ------------------------------------------------------------------ */

export function convertSizeChartUnits(
  headers: string[],
  rows: Record<string, string>[],
  fromUnit: 'imperial' | 'metric',
  toUnit: 'imperial' | 'metric'
): { headers: string[]; rows: Record<string, string>[] } {
  if (fromUnit === toUnit) return { headers, rows }

  const IN_TO_CM = 2.54
  const CM_TO_IN = 1 / 2.54

  const factor = toUnit === 'metric' ? IN_TO_CM : CM_TO_IN
  const fromLabel = fromUnit === 'imperial' ? '(in)' : '(cm)'
  const toLabel = toUnit === 'imperial' ? '(in)' : '(cm)'

  // Update headers
  const newHeaders = headers.map(h => h.replace(fromLabel, toLabel))

  // Update rows - convert numeric values in measurement columns
  const newRows = rows.map(row => {
    const newRow: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      const newKey = key.replace(fromLabel, toLabel)
      if (key.includes(fromLabel)) {
        // Try to convert numeric values and ranges
        const converted = convertMeasurementValue(value, factor)
        newRow[newKey] = converted
      } else {
        newRow[newKey] = value
      }
    }
    return newRow
  })

  return { headers: newHeaders, rows: newRows }
}

function convertMeasurementValue(value: string, factor: number): string {
  // Handle ranges like "36-38"
  if (value.includes('-')) {
    const parts = value.split('-').map(p => {
      const num = parseFloat(p.trim())
      return isNaN(num) ? p.trim() : (num * factor).toFixed(1).replace(/\.0$/, '')
    })
    return parts.join('-')
  }

  // Handle single numbers
  const num = parseFloat(value)
  if (!isNaN(num)) {
    return (num * factor).toFixed(1).replace(/\.0$/, '')
  }

  // Return as-is if not a number
  return value
}
