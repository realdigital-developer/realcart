/* ------------------------------------------------------------------ */
/*  Production-Level Product Types                                      */
/*  Following Flipkart/Meesho/Amazon product management patterns        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Product Image                                                       */
/* ------------------------------------------------------------------ */

export interface ProductImage {
  url: string
  alt: string
  publicId: string
  isPrimary: boolean
}

/* ------------------------------------------------------------------ */
/*  Product Variant (Color-Size Matrix like Flipkart/Amazon)            */
/* ------------------------------------------------------------------ */

export interface ProductVariant {
  _id?: string
  sku: string
  attributes: Record<string, string> // e.g., { Color: 'Red', Size: 'M' }
  mrp: number
  sellingPrice: number
  stock: number
  images: string[] // URLs of variant-specific images
  isActive: boolean
}

/* ------------------------------------------------------------------ */
/*  Product Specification Group (like Flipkart spec table)              */
/* ------------------------------------------------------------------ */

export interface SpecificationItem {
  key: string   // e.g., 'Battery Capacity'
  value: string // e.g., '5000 mAh'
}

export interface SpecificationGroup {
  group: string              // e.g., 'General', 'Display', 'Camera'
  specs: SpecificationItem[]
}

/* ------------------------------------------------------------------ */
/*  Size Chart                                                          */
/* ------------------------------------------------------------------ */

export interface SizeChartRow {
  [key: string]: string
}

export interface SizeChart {
  headers: string[]
  rows: SizeChartRow[]
  imageUrl?: string
  unit?: 'metric' | 'imperial' | 'both'
  howToMeasure?: string[]
}

/* ------------------------------------------------------------------ */
/*  SEO Fields                                                          */
/* ------------------------------------------------------------------ */

export interface ProductSEO {
  metaTitle: string          // Custom meta title (auto-generated if empty)
  metaDescription: string    // Custom meta description (auto-generated if empty)
  searchKeywords: string[]   // Additional search keywords for better discovery
  canonicalUrl: string       // Canonical URL for SEO
}

/* ------------------------------------------------------------------ */
/*  Shipping & Tax (like Flipkart seller panel)                         */
/* ------------------------------------------------------------------ */

export interface ProductShipping {
  weight: number             // In grams
  length: number             // In cm
  width: number              // In cm
  height: number             // In cm
  hsnCode: string           // HSN/SAC code for GST
  gstRate: number           // GST rate (%)
  deliveryCharge: number    // Delivery charge (0 = free)
  freeDeliveryAbove: number // Free delivery above this amount
}

/* ------------------------------------------------------------------ */
/*  Product Status (Approval Workflow)                                  */
/*  Draft → Pending Review → Approved → Published                      */
/*                    ↘ Rejected (with reason)                          */
/* ------------------------------------------------------------------ */

export type ProductStatus =
  | 'Draft'          // Seller is still editing
  | 'Pending'        // Submitted for admin review
  | 'Approved'       // Admin approved, ready to publish
  | 'Published'      // Live on storefront
  | 'Rejected'       // Rejected by admin (with reason)
  | 'Suspended'      // Temporarily taken down by admin

/* ------------------------------------------------------------------ */
/*  Full Product Document (MongoDB)                                     */
/* ------------------------------------------------------------------ */

export interface ProductDocument {
  _id?: string

  // === Core Info ===
  name: string
  slug: string
  description: string
  category: string
  subcategory: string
  brand: string

  // === Media ===
  images: ProductImage[]
  videoUrl: string

  // === Pricing ===
  mrp: number                        // Maximum Retail Price (original)
  sellingPrice: number               // Current selling price
  specialPrice: number               // Sale/discount price (0 = no special price)
  specialPriceStartDate: string | null
  specialPriceEndDate: string | null

  // === Variants ===
  variantAttributes: string[]        // e.g., ['Color', 'Size']
  variants: ProductVariant[]

  // === Inventory ===
  stock: number                      // Total stock (auto-calc from variants if variants exist)
  lowStockThreshold: number
  trackInventory: boolean

  // === Specifications ===
  specifications: SpecificationGroup[]

  // === Highlights / Key Features ===
  highlights: string[]               // e.g., ['5000 mAh Battery', '6.7" Display']

  // === Size Chart ===
  sizeChart: SizeChart | null

  // === Shipping & Tax ===
  shipping: ProductShipping

  // === Return & Warranty ===
  returnPolicy: string               // e.g., '7 Days Replacement'
  warranty: string                   // e.g., '1 Year Manufacturer Warranty'

  // === SEO ===
  seo: ProductSEO

  // === Seller Info ===
  seller: string                     // Store name
  sellerId: string                   // Seller MongoDB _id
  storeName: string                  // Store name (for orders)

  // === Status & Approval ===
  status: ProductStatus
  approvalNotes: string              // Admin feedback on rejection
  active: boolean                    // Visibility toggle (seller can deactivate)

  // === Tags ===
  tags: string[]

  // === Computed / Cached Fields ===
  totalSold: number                  // Total units sold (for popularity sorting)
  viewCount: number                  // Total views (for popularity)
  avgRating: number                  // Cached average rating
  totalReviews: number               // Cached total review count

  // === Timestamps ===
  createdAt: string | Date
  updatedAt: string | Date
  approvedAt: string | Date | null
  publishedAt: string | Date | null
}

/* ------------------------------------------------------------------ */
/*  API Response Types (Public / Customer)                              */
/* ------------------------------------------------------------------ */

export interface ProductListItem {
  _id: string
  name: string
  slug: string
  description: string
  mrp: number
  sellingPrice: number
  effectivePrice: number
  hasDiscount: boolean
  discountPercent: number
  category: string
  subcategory: string
  brand: string
  imageUrl: string
  stock: number
  inStock: boolean
  highlights: string[]
  tags: string[]
  seller: string
  avgRating: number
  totalReviews: number
  totalSold: number
  returnPolicy: string
  freeDelivery: boolean
  variantAttributes: string[]
  variants: ProductVariant[]
  createdAt: string
}

export interface ProductDetailItem extends ProductListItem {
  images: ProductImage[]
  videoUrl: string
  specifications: SpecificationGroup[]
  sizeChart: SizeChart | null
  shipping: ProductShipping
  warranty: string
  seo: ProductSEO
  approvalNotes: string
  approvedAt: string | null
  publishedAt: string | null
  relatedProducts: ProductListItem[]
}

export interface ProductFilters {
  categories: string[]
  subcategories: string[]
  priceRange: { min: number; max: number }
  brands: string[]
  tags: string[]
  ratingOptions: number[]
}

/* ------------------------------------------------------------------ */
/*  Seller Product Form Types                                           */
/* ------------------------------------------------------------------ */

export interface SellerProductFormData {
  // Step 1: Basic Info
  name: string
  category: string
  subcategory: string
  brand: string
  description: string
  highlights: string[]

  // Step 2: Images
  images: ProductImage[]
  videoUrl: string

  // Step 3: Pricing & Inventory
  mrp: number
  sellingPrice: number
  specialPrice: number
  specialPriceStartDate: string
  specialPriceEndDate: string
  stock: number
  lowStockThreshold: number
  trackInventory: boolean

  // Step 4: Variants
  variantAttributes: string[]
  variants: ProductVariant[]

  // Step 5: Specifications
  specifications: SpecificationGroup[]

  // Step 6: Shipping & Tax
  shipping: ProductShipping
  returnPolicy: string
  warranty: string

  // Step 7: SEO
  seo: ProductSEO
  tags: string[]
  sizeChart: SizeChart | null

  // Status
  status: ProductStatus
}

/* ------------------------------------------------------------------ */
/*  Admin Product Review Types                                          */
/* ------------------------------------------------------------------ */

export interface AdminProductReview {
  _id: string
  product: ProductDocument
  seller: {
    name: string
    storeName: string
    email: string
    isVerified: boolean
  }
  submittedAt: string
}

export interface BulkActionRequest {
  action: 'approve' | 'reject' | 'delete' | 'publish' | 'suspend' | 'activate'
  ids: string[]
  reason?: string // For reject/suspend
}

/* ------------------------------------------------------------------ */
/*  Search & Relevance Types                                            */
/* ------------------------------------------------------------------ */

export type SortOption =
  | 'relevance'
  | 'newest'
  | 'price-low'
  | 'price-high'
  | 'rating'
  | 'discount'
  | 'popularity'
  | 'name'

export interface SearchParams {
  query?: string
  category?: string
  subcategory?: string
  minPrice?: number
  maxPrice?: number
  brands?: string[]
  tags?: string[]
  minRating?: number
  inStock?: boolean
  sort?: SortOption
  page?: number
  limit?: number
}
