'use client'

import { useRouter } from 'next/navigation'
import { Heart, Star, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Product } from './types'
import { useWishlist } from '@/components/providers/wishlist-provider'

/* ------------------------------------------------------------------ */
/*  Reusable Product Card                                               */
/*  EXACT match to the reference HTML/CSS design:                       */
/*  - Card bg: #f0eeec (warm cream), border-radius: 28px, no border     */
/*  - Image: 3:4 portrait, object-cover, bottom gradient fade to #f0eeec*/
/*  - Heart: white rounded-square (14px radius), top-right, #3d4f7c icon */
/*  - Product name: 22px, weight 500, #888888, 1-line clamp             */
/*  - Price: 28px bold #111111 + 18px strike #aaaaaa on LEFT            */
/*  - Discount: #d8efe4 bg, #2e8b57 text, 20px radius pill, on RIGHT    */
/*  - Rating: white pill, gold star #f0a500, 15px text, "|" separator   */
/*  - No add-to-cart, no free delivery, no shadow, no border            */
/*                                                                     */
/*  Size variants:                                                      */
/*  - "full": exact reference (300px wide, 340px image height)          */
/*  - "compact": for horizontal scroll (180px wide, 240px image)        */
/*  - "mini": for related products (150px wide, 200px image)            */
/* ------------------------------------------------------------------ */

interface ProductCardProps {
  product: Product
  onClick?: () => void
  size?: 'full' | 'compact' | 'mini'
  className?: string
}

export function ProductCard({ product, onClick, size = 'full', className }: ProductCardProps) {
  const router = useRouter()
  const { toggleWishlist, isInWishlist } = useWishlist()
  const wishlisted = isInWishlist(product._id)

  // Size configurations — all maintain 3:4 image aspect ratio
  const sizes = {
    full: {
      cardRadius: 28,
      cardWidth: '100%',
      heartSize: 'clamp(36px, 10vw, 48px)',
      heartRadius: 14,
      heartIconSize: 'clamp(18px, 5vw, 22px)',
      heartTop: 'clamp(8px, 2.5vw, 14px)',
      heartRight: 'clamp(8px, 2.5vw, 14px)',
      nameSize: 'clamp(13px, 4vw, 22px)',
      nameMarginBottom: 8,
      priceSize: 'clamp(16px, 5.5vw, 28px)',
      mrpSize: 'clamp(11px, 3.5vw, 18px)',
      discountSize: 'clamp(10px, 2.5vw, 14px)',
      discountPadX: 'clamp(8px, 2.5vw, 14px)',
      discountPadY: 'clamp(5px, 1.5vw, 7px)',
      discountRadius: 20,
      priceRowMarginBottom: 10,
      ratingSize: 'clamp(11px, 2.8vw, 15px)',
      ratingStarSize: 'clamp(14px, 3.5vw, 18px)',
      ratingPadLeft: 'clamp(8px, 2.5vw, 12px)',
      ratingPadRight: 'clamp(10px, 3vw, 16px)',
      ratingPadY: 'clamp(6px, 1.8vw, 8px)',
      ratingRadius: 20,
      textPaddingX: 'clamp(10px, 3.5vw, 20px)',
      textPaddingTop: 8,
      paddingBottom: 'clamp(14px, 4vw, 24px)',
      packageIconSize: 44,
      gap: 8,
    },
    compact: {
      cardRadius: 20,
      cardWidth: '180px',
      heartSize: 36,
      heartRadius: 12,
      heartIconSize: 18,
      heartTop: 10,
      heartRight: 10,
      nameSize: 13,
      nameMarginBottom: 6,
      priceSize: 18,
      mrpSize: 11,
      discountSize: 10,
      discountPadX: 10,
      discountPadY: 4,
      discountRadius: 14,
      priceRowMarginBottom: 8,
      ratingSize: 11,
      ratingStarSize: 13,
      ratingPadLeft: 10,
      ratingPadRight: 12,
      ratingPadY: 6,
      ratingRadius: 14,
      textPaddingX: 12,
      textPaddingTop: 8,
      paddingBottom: 14,
      packageIconSize: 36,
      gap: 8,
    },
    mini: {
      cardRadius: 18,
      cardWidth: '150px',
      heartSize: 32,
      heartRadius: 10,
      heartIconSize: 16,
      heartTop: 8,
      heartRight: 8,
      nameSize: 12,
      nameMarginBottom: 5,
      priceSize: 16,
      mrpSize: 10,
      discountSize: 9,
      discountPadX: 8,
      discountPadY: 4,
      discountRadius: 12,
      priceRowMarginBottom: 6,
      ratingSize: 10,
      ratingStarSize: 12,
      ratingPadLeft: 8,
      ratingPadRight: 10,
      ratingPadY: 5,
      ratingRadius: 12,
      textPaddingX: 10,
      textPaddingTop: 6,
      paddingBottom: 12,
      packageIconSize: 32,
      gap: 8,
    },
  }
  const s = sizes[size]

  const navigate = onClick || (() => {
    router.push(`/customer/product/${product._id}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleWishlist({
      productId: product._id,
      name: product.name,
      price: product.mrp,
      effectivePrice: product.effectivePrice,
      hasDiscount: product.hasDiscount,
      discountPercent: product.discountPercent,
      imageUrl: product.imageUrl,
      stock: product.stock,
      seller: product.seller,
      brand: product.brand,
    })
  }

  const formatPrice = (price: number) => `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  // Gradient fallback for products without images
  const gradients = [
    'from-rose-300 to-pink-400', 'from-violet-300 to-purple-400', 'from-blue-300 to-indigo-400',
    'from-cyan-300 to-teal-400', 'from-emerald-300 to-green-400', 'from-amber-300 to-yellow-400',
  ]
  const getGradient = (name: string) => {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return gradients[Math.abs(hash) % gradients.length]
  }

  return (
    <div
      onClick={navigate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate()
        }
      }}
      className={cn(
        'relative overflow-hidden cursor-pointer group flex-shrink-0',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
        className,
      )}
      style={{
        backgroundColor: '#f0eeec',
        borderRadius: s.cardRadius,
        width: s.cardWidth,
        paddingBottom: s.paddingBottom,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* ── Image Section (3:4 portrait, responsive aspect-ratio, with bottom gradient fade) ── */}
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: '1 / 1' }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className={cn('absolute inset-0 w-full h-full bg-gradient-to-br flex items-center justify-center', getGradient(product.name))}>
            <Package className="text-white/50" style={{ width: s.packageIconSize, height: s.packageIconSize }} />
          </div>
        )}

        {/* Bottom gradient fade — from transparent to card bg (#f0eeec) */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: '30%',
            background: 'linear-gradient(to bottom, transparent, #f0eeec)',
          }}
        />

        {/* Out of Stock Overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-white/90 text-gray-800 font-bold px-3 py-1 rounded-full" style={{ fontSize: size === 'full' ? '12px' : '10px' }}>
              Out of Stock
            </span>
          </div>
        )}

        {/* Heart Icon — white rounded-square, top-right, dark blue icon */}
        <button
          onClick={handleWishlist}
          className="absolute flex items-center justify-center transition-shadow hover:shadow-md"
          style={{
            top: s.heartTop,
            right: s.heartRight,
            width: s.heartSize,
            height: s.heartSize,
            borderRadius: s.heartRadius,
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart
            className="transition-colors"
            style={{
              width: s.heartIconSize,
              height: s.heartIconSize,
              color: wishlisted ? '#ef4444' : '#3d4f7c',
              fill: wishlisted ? '#ef4444' : 'none',
            }}
          />
        </button>
      </div>

      {/* ── Text Section ── */}
      <div
        style={{
          paddingLeft: s.textPaddingX,
          paddingRight: s.textPaddingX,
          paddingTop: s.textPaddingTop,
        }}
      >
        {/* Product name — gray, medium weight, 2-line clamp for compact/mini, 1-line for full */}
        <p
          className={cn('fd-card-name font-medium leading-snug', size === 'full' ? 'line-clamp-1' : 'line-clamp-2')}
          style={{
            fontSize: s.nameSize,
            fontWeight: 500,
            marginBottom: s.nameMarginBottom,
            color: '#888888',
            fontFamily: 'Inter, sans-serif',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {product.name}
        </p>

        {/* Price row — price + MRP on LEFT, discount badge on RIGHT */}
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: s.priceRowMarginBottom, flexWrap: 'wrap', gap: s.gap }}
        >
          <div className="flex items-center" style={{ gap: s.gap }}>
            {/* Selling price — bold, dark */}
            <span
              className="fd-card-price"
              style={{
                fontSize: s.priceSize,
                fontWeight: 700,
                color: '#111111',
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              {formatPrice(product.effectivePrice)}
            </span>
            {/* MRP strikethrough — lighter gray */}
            {product.hasDiscount && (
              <span
                className="fd-card-mrp"
                style={{
                  fontSize: s.mrpSize,
                  fontWeight: 400,
                  textDecoration: 'line-through',
                  color: '#aaaaaa',
                  fontFamily: 'Inter, sans-serif',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatPrice(product.mrp)}
              </span>
            )}
          </div>

          {/* Discount badge — light green bg, green text, pill */}
          {product.hasDiscount && product.discountPercent > 0 && (
            <div
              className="fd-card-disc flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: '#d8efe4',
                color: '#2e8b57',
                fontSize: s.discountSize,
                fontWeight: 600,
                borderRadius: s.discountRadius,
                paddingLeft: s.discountPadX,
                paddingRight: s.discountPadX,
                paddingTop: s.discountPadY,
                paddingBottom: s.discountPadY,
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              {product.discountPercent}% OFF
            </div>
          )}
        </div>

        {/* Rating — white pill with gold star + number + | + count */}
        {(product.avgRating ?? 0) > 0 && (
          <div
            className="fd-card-rating inline-flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: s.ratingRadius,
              paddingLeft: s.ratingPadLeft,
              paddingRight: s.ratingPadRight,
              paddingTop: s.ratingPadY,
              paddingBottom: s.ratingPadY,
              gap: s.gap,
            }}
          >
            {/* Gold star — filled */}
            <Star
              style={{
                width: s.ratingStarSize,
                height: s.ratingStarSize,
                fill: '#f0a500',
                color: '#f0a500',
                flexShrink: 0,
              }}
            />
            {/* Rating number — semibold dark */}
            <span
              style={{
                fontSize: s.ratingSize,
                fontWeight: 600,
                color: '#333333',
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              {product.avgRating!.toFixed(1)}
            </span>
            {/* Separator | — muted */}
            <span
              style={{
                fontSize: s.ratingSize,
                fontWeight: 400,
                color: '#949494',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              |
            </span>
            {/* Review count — normal weight gray */}
            <span
              style={{
                fontSize: s.ratingSize,
                fontWeight: 400,
                color: '#666666',
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              ({product.totalReviews ?? 0})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
