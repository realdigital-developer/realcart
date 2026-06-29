/* ------------------------------------------------------------------ */
/*  Shared Customer Frontend Types                                      */
/* ------------------------------------------------------------------ */

export interface CategoryItem {
  _id: string
  name: string
  description: string
  imageUrl: string | null
  subcategories: {
    _id: string
    name: string
    description: string
    imageUrl: string | null
    highlights: string[]
  }[]
}

export interface ProductImage {
  url: string
  alt: string
  publicId: string
  isPrimary: boolean
}

export interface ProductVariant {
  sku: string
  attributes: Record<string, string>
  mrp: number
  sellingPrice: number
  stock: number
  images: string[]
  isActive: boolean
}

export interface SpecificationGroup {
  group: string
  specs: { key: string; value: string }[]
}

export interface ProductShipping {
  weight: number
  length: number
  width: number
  height: number
  hsnCode: string
  gstRate: number
  deliveryCharge: number
  freeDeliveryAbove: number
}

export interface ProductSEO {
  metaTitle: string
  metaDescription: string
  searchKeywords: string[]
  canonicalUrl: string
}

export interface Product {
  _id: string
  name: string
  slug?: string
  description: string
  mrp: number                      // Maximum Retail Price
  sellingPrice: number             // Selling Price
  effectivePrice: number
  hasDiscount: boolean
  discountPercent: number
  category: string
  subcategory?: string             // NEW
  brand: string
  imageUrl: string
  stock: number
  tags: string[]
  seller: string
  inStock: boolean
  highlights?: string[]            // NEW
  totalSold?: number               // NEW
  avgRating?: number               // NEW
  totalReviews?: number            // NEW
  returnPolicy?: string            // NEW
  freeDelivery?: boolean           // NEW
  variantAttributes?: string[]     // NEW
  variants?: ProductVariant[]      // NEW
}

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

export interface ProductDetail {
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
  subcategory?: string
  brand: string
  imageUrl: string
  images: ProductImage[]           // CHANGED from string[] to ProductImage[]
  videoUrl: string
  stock: number
  inStock: boolean
  tags: string[]
  seller: string
  highlights?: string[]
  totalSold?: number
  avgRating?: number
  totalReviews?: number
  returnPolicy?: string
  freeDelivery?: boolean
  warranty?: string                // NEW
  specifications?: SpecificationGroup[]  // NEW
  sizeChart: SizeChart | null
  shipping?: ProductShipping       // NEW
  seo?: ProductSEO                 // NEW
  variantAttributes?: string[]
  variants?: ProductVariant[]
  relatedProducts?: Product[]      // CHANGED: was inline, now uses Product type
  structuredData?: object          // NEW: JSON-LD
  sellerProfileImage?: string | null  // Seller's profile image URL
}

export interface Filters {
  categories: string[]
  subcategories?: string[]        // NEW
  priceRange: { min: number; max: number }
  tags: string[]
  brands: string[]
  ratingOptions?: number[]        // NEW
}

/* ------------------------------------------------------------------ */
/*  Cart Types                                                          */
/* ------------------------------------------------------------------ */

export interface CartItem {
  productId: string
  name: string
  price: number
  effectivePrice: number
  /** Regular selling price (before any special/limited-time offer).
   *  Used to split the discount into "Product Discount" (MRP→sellingPrice)
   *  and "Special Offer" (sellingPrice→effectivePrice) in the price breakup.
   *  Optional for backward compatibility with legacy cart items. */
  sellingPrice?: number
  hasDiscount: boolean
  discountPercent: number
  imageUrl: string
  quantity: number
  stock: number
  seller: string
  brand: string
  /** Product category — used for coupon applicability checks. Optional
   *  for backward compatibility with legacy cart items. */
  category?: string
  /** Seller ObjectId (string) — used for coupon applicability checks.
   *  Optional for backward compatibility with legacy cart items. */
  sellerId?: string
  selectedVariant: Record<string, string>
  selectedVariantDetail?: {       // NEW: variant selection support
    sku: string
    attributes: Record<string, string>
  }
  addedAt: string
}

export interface Cart {
  items: CartItem[]
  totalItems: number
  totalPrice: number
  totalSavings: number
}

/* ------------------------------------------------------------------ */
/*  Wishlist Types                                                      */
/* ------------------------------------------------------------------ */

export interface WishlistItem {
  productId: string
  name: string
  price: number
  effectivePrice: number
  /** Regular selling price (before special offer). Optional. */
  sellingPrice?: number
  hasDiscount: boolean
  discountPercent: number
  imageUrl: string
  stock: number
  seller: string
  brand: string
  selectedVariant?: {              // NEW: variant selection support
    sku: string
    attributes: Record<string, string>
  }
  addedAt: string
}

/* ------------------------------------------------------------------ */
/*  Address Types                                                       */
/* ------------------------------------------------------------------ */

export interface Address {
  _id?: string
  name: string
  mobile: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  pincode: string
  landmark: string
  type: 'home' | 'work' | 'other'
  isDefault: boolean
}

/* ------------------------------------------------------------------ */
/*  Notification Types                                                  */
/* ------------------------------------------------------------------ */

export type NotificationType =
  | 'order_placed'
  | 'order_confirmed'
  | 'order_shipped'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled'
  | 'payment_success'
  | 'payment_failed'
  | 'refund_processed'
  | 'return_requested'
  | 'return_completed'
  | 'referral_reward'
  | 'referral_joined'
  | 'wallet_credit'
  | 'wallet_debit'
  | 'wallet_low_balance'
  | 'promo'
  | 'price_drop'
  | 'back_in_stock'
  | 'seller_update'

export interface Notification {
  _id: string
  customerId: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  relatedId?: string
  relatedType?: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/*  Review & Rating Types                                                */
/* ------------------------------------------------------------------ */

export interface ReviewMedia {
  _id: string
  reviewId: string
  mediaType: 'image' | 'video'
  mediaUrl: string
  thumbnailUrl: string | null
  createdAt: string
}

export interface SellerReply {
  _id: string
  reviewId: string
  sellerId: string
  sellerName: string
  replyText: string
  createdAt: string
}

export interface Review {
  _id: string
  productId: string
  customerId: string
  customerName: string
  /** Customer profile image URL (joined from customers collection). Null when no avatar is set. */
  customerAvatar?: string | null
  orderId: string
  orderItemId: string
  rating: number
  title: string
  comment: string
  pros: string | null
  cons: string | null
  variant: string | null
  verified: boolean
  helpful: number
  notHelpful: number
  status: 'active' | 'hidden' | 'flagged'
  flaggedReason: string | null
  media: ReviewMedia[]
  sellerReplies: SellerReply[]
  userVote: 'helpful' | 'not_helpful' | null
  createdAt: string
  updatedAt: string
}

export interface ReviewStats {
  averageRating: number
  totalReviews: number
  ratingDistribution: Record<number, number>
  mediaCount: number
}

/* ------------------------------------------------------------------ */
/*  Coupon Types                                                        */
/* ------------------------------------------------------------------ */

export interface Coupon {
  _id?: string
  code: string
  discountType: 'percentage' | 'flat'
  discountValue: number
  maxDiscount: number
  minOrderAmount: number
  startDate: string
  endDate: string
  usageLimit: number
  usedCount: number
  isActive: boolean
  description: string
  createdAt?: string
  updatedAt?: string
}

export interface CouponValidationResult {
  valid: boolean
  coupon?: {
    code: string
    discountType: 'percentage' | 'flat'
    discountValue: number
    maxDiscount: number
    minOrderAmount: number
  }
  discount?: number
  error?: string
}

/* ------------------------------------------------------------------ */
/*  Profile Types                                                       */
/* ------------------------------------------------------------------ */

export interface CustomerProfile {
  _id: string
  name: string
  mobile: string
  email: string
  profileImage: {
    url: string
    publicId: string
    width?: number
    height?: number
    format?: string
    size?: number
    uploadedAt?: string
  } | null
  createdAt: string
}
