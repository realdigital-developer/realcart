'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Heart,
  ShoppingCart,
  Share2,
  Truck,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Package,
  BadgeCheck,
  Zap,
  Check,
  X,
  Star,
  ThumbsUp,
  MessageSquare,
  Edit2,
  Trash2,
  Camera,
  ImageIcon,
  Loader2,
  Verified,
  Video,
  Play,
  Shield,
  CreditCard,
  Minus,
  Plus,
  Eye,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { cn, createTimeoutSignal } from '@/lib/utils'
import { ProductDetail, Product, ProductImage, ProductVariant, Review, ReviewStats, SpecificationGroup } from './types'
import { useCart } from '@/components/providers/cart-provider'
import { useWishlist } from '@/components/providers/wishlist-provider'
import { useRecentlyViewed } from '@/hooks/use-recently-viewed'
import { useCustomerAuth } from '@/components/providers/customer-auth-provider'
import { SizeChartModal } from '@/components/shared/size-chart-display'
import { DeliveryChecker } from '@/components/customer/delivery-checker'
import { ProductCard } from './product-card'
import { useLanguage } from '@/components/providers/language-provider'

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const getProductGradient = (name: string) => {
  const gradients = [
    'from-rose-200 to-pink-200 dark:from-rose-900/40 dark:to-pink-900/40',
    'from-violet-200 to-purple-200 dark:from-violet-900/40 dark:to-purple-900/40',
    'from-blue-200 to-indigo-200 dark:from-blue-900/40 dark:to-indigo-900/40',
    'from-cyan-200 to-teal-200 dark:from-cyan-900/40 dark:to-teal-900/40',
    'from-emerald-200 to-green-200 dark:from-emerald-900/40 dark:to-green-200',
    'from-amber-200 to-yellow-200 dark:from-amber-900/40 dark:to-yellow-900/40',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}

/* ------------------------------------------------------------------ */
/*  Star Rating Display                                                 */
/* ------------------------------------------------------------------ */

function StarRatingDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            'text-gray-300 dark:text-gray-600',
            star <= Math.round(rating) && 'fill-amber-400 text-amber-400'
          )}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Star Rating Selector                                                */
/* ------------------------------------------------------------------ */

const RATING_LABEL_KEYS: Record<number, string> = {
  1: 'reviews.terrible',
  2: 'reviews.poor',
  3: 'reviews.average',
  4: 'reviews.good',
  5: 'reviews.excellent',
}

function StarRatingSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (r: number) => void
}) {
  const { t } = useLanguage()
  const [hover, setHover] = useState(0)
  const display = hover || value

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                'h-8 w-8 transition-colors',
                star <= display
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-300 dark:text-gray-600'
              )}
            />
          </button>
        ))}
      </div>
      {display > 0 && (
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {t(RATING_LABEL_KEYS[display])}
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Rating Bar                                                          */
/* ------------------------------------------------------------------ */

function RatingBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-3 text-gray-500">{stars}</span>
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-gray-400">{count}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Rating Badge Color Helper                                           */
/* ------------------------------------------------------------------ */

function ratingBadgeClass(rating: number): string {
  if (rating >= 4) return 'bg-emerald-500 text-white'
  if (rating >= 3) return 'bg-amber-400 text-white'
  return 'bg-red-500 text-white'
}

/* ------------------------------------------------------------------ */
/*  Review Card                                                         */
/* ------------------------------------------------------------------ */

function ReviewCard({
  review,
  isOwn,
  onEdit,
  onDelete,
  onHelpful,
  helpfulLoading,
  onImageClick,
}: {
  review: Review
  isOwn: boolean
  onEdit: (r: Review) => void
  onDelete: (id: string) => void
  onHelpful: (id: string) => void
  helpfulLoading: string | null
  onImageClick: (url: string) => void
}) {
  const { t } = useLanguage()
  const initials = review.customerName?.charAt(0)?.toUpperCase() || '?'
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set())
  const [avatarFailed, setAvatarFailed] = useState(false)
  const avatarUrl = typeof review.customerAvatar === 'string' ? review.customerAvatar : null
  const showAvatarImage = !!avatarUrl && !avatarFailed

  return (
    <div className="py-4 border-b border-gray-100 dark:border-gray-800 last:border-0">
      {/* Top row: avatar, name, rating, date */}
      <div className="flex items-start gap-3">
        {/* Avatar — renders the customer's profile image when available,
            falls back to the first-initial circle (preserves existing UI). */}
        <div className="flex-shrink-0 h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
          {showAvatarImage ? (
            <img
              src={avatarUrl!}
              alt={review.customerName || t('productDetail.customerAvatar')}
              className="w-full h-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{initials}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
              {review.customerName}
            </span>
            {/* Rating pill */}
            <span
              className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold',
                ratingBadgeClass(review.rating)
              )}
            >
              {review.rating}
              <Star className="h-2.5 w-2.5 fill-current" />
            </span>
            {review.verified && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                <Verified className="h-3 w-3" />
                {t('productDetail.verifiedPurchase')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {new Date(review.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Edit / Delete for own reviews */}
        {isOwn && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(review)}
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={t('productDetail.editReviewTitle')}
            >
              <Edit2 className="h-3.5 w-3.5 text-gray-400" />
            </button>
            <button
              onClick={() => onDelete(review._id)}
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title={t('productDetail.deleteReviewTitle')}
            >
              <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
            </button>
          </div>
        )}
      </div>

      {/* Title */}
      {review.title && (
        <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
          {review.title}
        </p>
      )}

      {/* Comment */}
      {review.comment && (
        <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed">
          {review.comment}
        </p>
      )}

      {/* Media */}
      {review.media && review.media.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {review.media.map((m, idx) => {
            const isVideo = m.mediaType === 'video'
            const thumbSrc = m.thumbnailUrl || m.mediaUrl
            const handleClick = () => onImageClick(m.mediaUrl)
            const key = m._id || `media-${idx}`
            return (
              <button
                key={key}
                onClick={handleClick}
                className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 hover:ring-2 hover:ring-amber-400/50 transition-all relative bg-gray-50 dark:bg-gray-800"
              >
                {isVideo ? (
                  <>
                    {m.thumbnailUrl && !failedThumbnails.has(key) ? (
                      <img
                        src={m.thumbnailUrl}
                        alt={t('productDetail.reviewVideoThumb')}
                        className="w-full h-full object-cover"
                        onError={() => {
                          console.warn('[ReviewCard] Video thumbnail failed to load:', m.thumbnailUrl)
                          setFailedThumbnails(prev => new Set(prev).add(key))
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700">
                        <Video className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                      <Play className="h-5 w-5 text-white fill-white" />
                    </div>
                    <span className="absolute bottom-0.5 right-0.5 text-[7px] bg-black/70 text-white px-1 rounded-sm font-medium pointer-events-none">{t('productDetail.video')}</span>
                  </>
                ) : failedThumbnails.has(key) ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700">
                    <ImageIcon className="h-5 w-5 text-gray-400" />
                  </div>
                ) : (
                  <img
                    src={thumbSrc}
                    alt={t('productDetail.reviewMedia')}
                    className="w-full h-full object-cover"
                    onError={() => {
                      console.warn('[ReviewCard] Image thumbnail failed to load:', thumbSrc)
                      setFailedThumbnails(prev => new Set(prev).add(key))
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Pros / Cons */}
      {(review.pros || review.cons) && (
        <div className="mt-3 flex flex-col gap-1">
          {review.pros && (
            <div className="flex items-start gap-1.5">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-px">+</span>
              <span className="text-[12px] text-gray-600 dark:text-gray-400">{review.pros}</span>
            </div>
          )}
          {review.cons && (
            <div className="flex items-start gap-1.5">
              <span className="text-[11px] font-bold text-red-500 mt-px">−</span>
              <span className="text-[12px] text-gray-600 dark:text-gray-400">{review.cons}</span>
            </div>
          )}
        </div>
      )}

      {/* Helpful button */}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => onHelpful(review._id)}
          disabled={helpfulLoading === review._id || review.userVote === 'helpful'}
          className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
            review.userVote === 'helpful'
              ? 'border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
          )}
        >
          {helpfulLoading === review._id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ThumbsUp className="h-3 w-3" />
          )}
          {t('productDetail.helpfulCount', { count: review.helpful })}
        </button>
      </div>

      {/* Seller Replies */}
      {review.sellerReplies && review.sellerReplies.length > 0 && (
        <div className="mt-3 ml-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700 space-y-2">
          {review.sellerReplies.map((reply, idx) => (
            <div key={reply._id || `reply-${idx}`} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                  {reply.sellerName}
                </span>
                <span className="text-[10px] text-gray-400">{t('productDetail.seller')}</span>
              </div>
              <p className="text-[12px] text-gray-600 dark:text-gray-400">{reply.replyText}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Review Form Modal                                                   */
/* ------------------------------------------------------------------ */

function ReviewFormModal({
  open,
  onClose,
  onSubmit,
  submitting,
  editingReview,
  productId,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: FormData) => void
  submitting: boolean
  editingReview: Review | null
  productId: string
}) {
  const { t } = useLanguage()
  const [rating, setRating] = useState(editingReview?.rating ?? 0)
  const [title, setTitle] = useState(editingReview?.title ?? '')
  const [comment, setComment] = useState(editingReview?.comment ?? '')
  const [pros, setPros] = useState(editingReview?.pros ?? '')
  const [cons, setCons] = useState(editingReview?.cons ?? '')
  // New images selected by user (File objects)
  const [newImages, setNewImages] = useState<File[]>([])
  // Previews for new images (blob URLs)
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])
  // Existing images from the review being edited (kept images)
  const [existingImages, setExistingImages] = useState<Array<{ url: string; publicId: string; _id: string }>>([])
  // New videos selected by user (File objects)
  const [newVideos, setNewVideos] = useState<File[]>([])
  // Previews for new videos (blob URLs)
  const [newVideoPreviews, setNewVideoPreviews] = useState<string[]>([])
  // Existing videos from the review being edited (kept videos)
  const [existingVideos, setExistingVideos] = useState<Array<{ url: string; publicId: string; _id: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Total image count (existing kept + new)
  const totalImageCount = existingImages.length + newImages.length
  // Total video count (existing kept + new)
  const totalVideoCount = existingVideos.length + newVideos.length

  // Track modal open key to reset form
  const [lastOpenKey, setLastOpenKey] = useState('')
  const openKey = `${open}-${editingReview?._id ?? 'new'}`
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey)
    if (editingReview) {
      setRating(editingReview.rating)
      setTitle(editingReview.title)
      setComment(editingReview.comment)
      setPros(editingReview.pros || '')
      setCons(editingReview.cons || '')
      // Separate existing media into images and videos
      const existingImageMedia = (editingReview.media || [])
        .filter((m) => m.mediaType !== 'video')
        .map((m) => ({
          url: m.mediaUrl || m.thumbnailUrl || '',
          publicId: '',
          _id: m._id,
        }))
        .filter((m) => m.url)
      const existingVideoMedia = (editingReview.media || [])
        .filter((m) => m.mediaType === 'video')
        .map((m) => ({
          url: m.mediaUrl || m.thumbnailUrl || '',
          publicId: '',
          _id: m._id,
        }))
        .filter((m) => m.url)
      setExistingImages(existingImageMedia)
      setExistingVideos(existingVideoMedia)
    } else {
      setRating(0)
      setTitle('')
      setComment('')
      setPros('')
      setCons('')
      setExistingImages([])
      setExistingVideos([])
    }
    setNewImages([])
    setNewImagePreviews([])
    setNewVideos([])
    setNewVideoPreviews([])
    setError(null)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (totalImageCount + files.length > 10) {
      setError(t('reviews.maxPhotos'))
      return
    }
    const addedImages = [...newImages, ...files].slice(0, 10 - existingImages.length)
    setNewImages(addedImages)

    // Generate previews for new images
    const previews: string[] = []
    addedImages.forEach((f) => {
      const url = URL.createObjectURL(f)
      previews.push(url)
    })
    setNewImagePreviews(previews)
    setError(null)
    // Reset the file input so the same file can be selected again
    e.target.value = ''
  }

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    // Validate file types
    const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
    for (const f of files) {
      if (!validVideoTypes.includes(f.type)) {
        setError(t('reviews.invalidVideoFormat'))
        e.target.value = ''
        return
      }
      if (f.size > 30 * 1024 * 1024) {
        setError(t('reviews.videoTooLarge'))
        e.target.value = ''
        return
      }
    }
    if (totalVideoCount + files.length > 5) {
      setError(t('reviews.maxVideos'))
      e.target.value = ''
      return
    }

    const addedVideos = [...newVideos, ...files].slice(0, 5 - existingVideos.length)
    setNewVideos(addedVideos)

    // Generate previews for new videos
    const previews: string[] = []
    addedVideos.forEach((f) => {
      const url = URL.createObjectURL(f)
      previews.push(url)
    })
    setNewVideoPreviews(previews)
    setError(null)
    e.target.value = ''
  }

  const removeExistingImage = (index: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index))
  }

  const removeNewImage = (index: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== index))
    setNewImagePreviews((prev) => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[index])
      return copy.filter((_, i) => i !== index)
    })
  }

  const removeExistingVideo = (index: number) => {
    setExistingVideos((prev) => prev.filter((_, i) => i !== index))
  }

  const removeNewVideo = (index: number) => {
    setNewVideos((prev) => prev.filter((_, i) => i !== index))
    setNewVideoPreviews((prev) => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[index])
      return copy.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = () => {
    if (rating === 0) {
      setError(t('reviews.selectRating'))
      return
    }
    if (comment.trim().length < 10) {
      setError(t('reviews.commentTooShort'))
      return
    }

    const formData = new FormData()
    formData.append('productId', productId)
    formData.append('rating', String(rating))
    formData.append('title', title.trim())
    formData.append('comment', comment.trim())
    formData.append('pros', pros.trim())
    formData.append('cons', cons.trim())
    if (editingReview) {
      formData.append('reviewId', editingReview._id)
      // Send existing images to keep (as JSON string)
      formData.append('existingImages', JSON.stringify(existingImages))
      // Send existing videos to keep (as JSON string)
      formData.append('existingVideos', JSON.stringify(existingVideos))
    }
    newImages.forEach((img) => {
      formData.append('images', img)
    })
    newVideos.forEach((vid) => {
      formData.append('videos', vid)
    })

    onSubmit(formData)
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="review-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <motion.div
        key="review-modal"
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {editingReview ? t('productDetail.editReview') : t('productDetail.writeReview')}
            </h3>
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Rating */}
          <div className="mb-5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              {t('reviews.yourRating')}
            </label>
            <StarRatingSelector value={rating} onChange={setRating} />
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              {t('reviews.reviewTitle')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('reviews.summarizePlaceholder')}
              maxLength={100}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
            />
          </div>

          {/* Comment */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              {t('reviews.yourReview')}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('reviews.tellOthersPlaceholder')}
              rows={4}
              maxLength={2000}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">{t('reviews.charCounter', { count: comment.length })}</p>
          </div>

          {/* Pros */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              {t('reviews.pros')} <span className="text-gray-400 font-normal">{t('reviews.optional')}</span>
            </label>
            <input
              type="text"
              value={pros}
              onChange={(e) => setPros(e.target.value)}
              placeholder={t('reviews.prosPlaceholder')}
              maxLength={300}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
            />
          </div>

          {/* Cons */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              {t('reviews.cons')} <span className="text-gray-400 font-normal">{t('reviews.optional')}</span>
            </label>
            <input
              type="text"
              value={cons}
              onChange={(e) => setCons(e.target.value)}
              placeholder={t('reviews.consPlaceholder')}
              maxLength={300}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
            />
          </div>

          {/* Image Upload */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              <Camera className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
              {t('reviews.photos')} <span className="text-gray-400 font-normal">{t('reviews.upTo10')}</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {/* Existing review images (from edit) */}
              {existingImages.map((img, i) => (
                <div key={`existing-img-${img._id}-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-emerald-300 dark:border-emerald-700">
                  <img src={img.url} alt={t('productDetail.existingPhoto', { index: i + 1 })} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeExistingImage(i)}
                    className="absolute top-0.5 right-0.5 h-4 w-4 bg-black/60 text-white rounded-full flex items-center justify-center"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  <span className="absolute bottom-0.5 left-0.5 text-[7px] bg-emerald-500 text-white px-1 rounded-sm font-medium">{t('reviews.saved')}</span>
                </div>
              ))}
              {/* Newly selected image previews */}
              {newImagePreviews.map((src, i) => (
                <div key={`new-img-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img src={src} alt={t('productDetail.newPreview', { index: i + 1 })} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeNewImage(i)}
                    className="absolute top-0.5 right-0.5 h-4 w-4 bg-black/60 text-white rounded-full flex items-center justify-center"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {totalImageCount < 10 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                >
                  <Camera className="h-4 w-4 text-gray-400" />
                  <span className="text-[9px] text-gray-400 mt-0.5">{t('reviews.add')}</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          {/* Video Upload */}
          <div className="mb-5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              <Video className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
              {t('reviews.videos')} <span className="text-gray-400 font-normal">{t('reviews.upTo5Videos')}</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {/* Existing review videos (from edit) */}
              {existingVideos.map((vid, i) => (
                <div key={`existing-vid-${vid._id}-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-emerald-300 dark:border-emerald-700 bg-gray-100 dark:bg-gray-800">
                  <video src={vid.url} className="w-full h-full object-cover" muted />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <Play className="h-4 w-4 text-white fill-white" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExistingVideo(i)}
                    className="absolute top-0.5 right-0.5 h-4 w-4 bg-black/60 text-white rounded-full flex items-center justify-center"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  <span className="absolute bottom-0.5 left-0.5 text-[7px] bg-emerald-500 text-white px-1 rounded-sm font-medium">{t('reviews.saved')}</span>
                </div>
              ))}
              {/* Newly selected video previews */}
              {newVideoPreviews.map((src, i) => (
                <div key={`new-vid-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                  <video src={src} className="w-full h-full object-cover" muted />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <Play className="h-4 w-4 text-white fill-white" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeNewVideo(i)}
                    className="absolute top-0.5 right-0.5 h-4 w-4 bg-black/60 text-white rounded-full flex items-center justify-center"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {totalVideoCount < 5 && (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                >
                  <Video className="h-4 w-4 text-gray-400" />
                  <span className="text-[9px] text-gray-400 mt-0.5">{t('reviews.add')}</span>
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{t('reviews.supportedFormats')}</p>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
              multiple
              onChange={handleVideoChange}
              className="hidden"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 mb-3">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={cn(
              'w-full py-3 rounded-xl font-bold text-sm transition-all',
              submitting
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white active:scale-[0.98]'
            )}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {editingReview ? t('reviews.updating') : t('reviews.submitting')}
              </span>
            ) : editingReview ? (
              t('reviews.updateReview')
            ) : (
              t('reviews.submitReview')
            )}
          </button>
        </div>
      </motion.div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Image Gallery (Modern Flipkart/Amazon/Meesho style)                */
/*  - Desktop: vertical thumbnail strip (left) + main image (right)    */
/*  - Mobile:  main image (top, swipeable) + horizontal thumbs (below) */
/*  - Magnifier-lens hover zoom on desktop                             */
/*  - Full-screen lightbox with swipe + pinch-zoom + keyboard nav      */
/* ------------------------------------------------------------------ */

function ImageGallery({ images, productName, isWishlisted: _isWishlisted, onToggleWishlist: _onToggleWishlist }: {
  images: ProductImage[]
  productName: string
  // These two props are accepted for backward compatibility but no longer
  // rendered inside the gallery — the wishlist toggle was moved to the
  // product info section (Price Block) so the image stays clean.
  isWishlisted: boolean
  onToggleWishlist: () => void
}) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [erroredImages, setErroredImages] = useState<Set<number>>(new Set())

  // Refs for swipe gesture detection on mobile
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  // Reset to first image when images array changes (e.g. variant switch)
  const imagesKey = images.map(img => img.url).join('|')

  const validImages = images.filter(img => img.url)

  // ── Cloudinary URL optimization ──
  // Cloudinary supports on-the-fly transformations via URL params.
  // We insert f_auto (auto format — WebP/AVIF for modern browsers),
  // q_auto (auto quality), and width constraints to dramatically reduce
  // image file size and load time without visible quality loss.
  // Non-Cloudinary URLs are returned unchanged.
  const optimizeCloudinaryUrl = useCallback((url: string, width?: number): string => {
    if (!url || !url.includes('/upload/')) return url
    const params = width ? `f_auto,q_auto,w_${width}` : 'f_auto,q_auto'
    return url.replace('/upload/', `/upload/${params}/`)
  }, [])

  // Pre-optimized image URLs for different display sizes:
  // - Thumbnails: w_150 (small, fast-loading)
  // - Main image: w_800 (large enough for detail view + zoom, much smaller than full-size)
  const optimizedImages = useMemo(() => {
    return validImages.map(img => ({
      ...img,
      url: optimizeCloudinaryUrl(img.url, 800), // Main display size
      thumbUrl: optimizeCloudinaryUrl(img.url, 150), // Thumbnail size
    }))
  }, [validImages, optimizeCloudinaryUrl])

  useEffect(() => {
    setSelected(0) // eslint-disable-line react-hooks/set-state-in-effect
    setLoadedImages(new Set())
    setErroredImages(new Set())
  }, [imagesKey])

  // === Keyboard navigation (when lightbox is open) ===
  useEffect(() => {
    if (!isLightboxOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false)
      else if (e.key === 'ArrowRight' && selected < validImages.length - 1) setSelected(selected + 1)
      else if (e.key === 'ArrowLeft' && selected > 0) setSelected(selected - 1)
    }
    window.addEventListener('keydown', handleKey)
    // Prevent body scroll when lightbox is open
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [isLightboxOpen, selected, validImages.length])

  // === Empty state ===
  if (validImages.length === 0) {
    return (
      <div className={cn('w-full aspect-square bg-gradient-to-br flex items-center justify-center rounded-2xl', getProductGradient(productName))}>
        <Package className="h-20 w-20 text-gray-400 dark:text-gray-500" />
      </div>
    )
  }

  const currentImage = optimizedImages[selected]

  const handleImageLoad = (idx: number) => {
    setLoadedImages(prev => new Set(prev).add(idx))
  }

  const handleImageError = (idx: number) => {
    setErroredImages(prev => new Set(prev).add(idx))
  }

  const goToPrev = () => setSelected(prev => Math.max(0, prev - 1))
  const goToNext = () => setSelected(prev => Math.min(validImages.length - 1, prev + 1))

  // === Touch swipe handlers (mobile) ===
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchEndX.current = null
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }
  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return
    const diff = touchStartX.current - touchEndX.current
    const threshold = 50 // px
    if (Math.abs(diff) > threshold) {
      if (diff > 0) goToNext()
      else goToPrev()
    }
    touchStartX.current = null
    touchEndX.current = null
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3">
        {/* === Vertical Thumbnail Strip (Desktop, left side — Flipkart style) === */}
        {validImages.length > 1 && (
          <div className="hidden sm:flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1 flex-shrink-0" style={{ scrollbarWidth: 'thin' }}>
            {optimizedImages.map((img, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                onMouseEnter={() => setSelected(i)}
                className={cn(
                  'flex-shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all duration-200 bg-white dark:bg-gray-800',
                  selected === i
                    ? 'border-blue-500 shadow-md shadow-blue-500/20 scale-105'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:scale-105',
                )}
              >
                {erroredImages.has(i) ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-gray-400" />
                  </div>
                ) : (
                  <img
                    src={img.thumbUrl}
                    alt={img.alt || t('productDetail.thumbAlt', { name: productName, index: i + 1 })}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => handleImageError(i)}
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {/* === Main Image Container === */}
        {/* NOTE: Per UX requirement, NO icons, badges, or image counter are
            overlaid on the image itself. The image is shown clean.
            - Tap/click the image to open the full-screen lightbox (expand)
            - Use the thumbnail strip to navigate between images
            - Wishlist toggle is available in the product info section below */}
        <div className="flex-1 relative">
          <MagnifierImage
            src={currentImage?.url}
            alt={currentImage?.alt || t('productDetail.mainImageAlt', { name: productName, index: selected + 1 })}
            index={selected}
            isLoaded={loadedImages.has(selected)}
            isErrored={erroredImages.has(selected)}
            onLoad={() => handleImageLoad(selected)}
            onError={() => handleImageError(selected)}
            productName={productName}
            onExpand={() => setIsLightboxOpen(true)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        </div>
      </div>

      {/* === Horizontal Thumbnail Strip (Mobile, below main image) === */}
      {validImages.length > 1 && (
        <div className="flex sm:hidden gap-2 overflow-x-auto pb-2 mt-3" style={{ scrollbarWidth: 'none' }}>
          {optimizedImages.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={cn(
                'flex-shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden transition-all bg-white dark:bg-gray-800',
                selected === i
                  ? 'border-blue-500 shadow-md shadow-blue-500/20 scale-105'
                  : 'border-gray-200 dark:border-gray-700',
              )}
            >
              {erroredImages.has(i) ? (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-gray-400" />
                </div>
              ) : (
                <img
                  src={img.thumbUrl}
                  alt={img.alt || `${productName} thumb ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => handleImageError(i)}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* === Full-screen Lightbox === */}
      <AnimatePresence>
        {isLightboxOpen && (
          <Lightbox
            images={optimizedImages}
            productName={productName}
            initialIndex={selected}
            onClose={() => setIsLightboxOpen(false)}
            onIndexChange={setSelected}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Magnifier Image — hover-to-zoom on desktop, tap-to-expand on mobile */
/*  (Amazon/Flipkart style magnifier lens effect)                       */
/* ------------------------------------------------------------------ */

function MagnifierImage({
  src,
  alt,
  index,
  isLoaded,
  isErrored,
  onLoad,
  onError,
  productName,
  onExpand,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  src: string
  alt: string
  index: number
  isLoaded: boolean
  isErrored: boolean
  onLoad: () => void
  onError: () => void
  productName: string
  onExpand: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
}) {
  const { t } = useLanguage()
  const [isHovering, setIsHovering] = useState(false)
  const [lensPos, setLensPos] = useState({ x: 50, y: 50 })
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setLensPos({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
  }

  if (isErrored) {
    return (
      <div className={cn('relative aspect-square w-full bg-gradient-to-br flex items-center justify-center rounded-2xl border border-gray-100 dark:border-gray-800', getProductGradient(productName))}>
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <ImageIcon className="h-12 w-12" />
          <span className="text-xs">{t('productDetail.imageUnavailable')}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-square w-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 cursor-zoom-in sm:cursor-crosshair group"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
      onClick={onExpand}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Loading skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 animate-pulse flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
        </div>
      )}

      {/* Main image with crossfade transition */}
      <AnimatePresence mode="wait">
        <motion.img
          key={index}
          src={src}
          alt={alt}
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? 1 : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full h-full object-contain p-4 pointer-events-none"
          onLoad={onLoad}
          onError={onError}
          draggable={false}
        />
      </AnimatePresence>

      {/* Zoomed view overlay (desktop, on hover) — shows zoomed area filling the container.
          NOTE: No visible lens circle indicator is drawn; the zoom itself is the feedback.
          This keeps the image clean (no icons/overlays) while preserving the zoom feature. */}
      {isHovering && isLoaded && (
        <div
          className="absolute inset-0 pointer-events-none hidden sm:block overflow-hidden"
          style={{ opacity: isHovering ? 1 : 0, transition: 'opacity 0.2s' }}
        >
          <img
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-[2.5]"
            style={{
              transformOrigin: `${lensPos.x}% ${lensPos.y}%`,
              transition: 'transform-origin 0.05s ease-out',
            }}
            draggable={false}
          />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Full-screen Lightbox — swipe + pinch-zoom + keyboard navigation    */
/* ------------------------------------------------------------------ */

function Lightbox({
  images,
  productName,
  initialIndex,
  onClose,
  onIndexChange,
}: {
  images: ProductImage[]
  productName: string
  initialIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
}) {
  const { t } = useLanguage()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })

  // Touch tracking for swipe + pinch
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const touchEndY = useRef<number | null>(null)
  const initialPinchDistance = useRef<number | null>(null)
  const initialScale = useRef<number>(1)

  // Sync internal state with parent
  useEffect(() => {
    onIndexChange(currentIndex)
  }, [currentIndex, onIndexChange])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
        setCurrentIndex(currentIndex + 1)
        setScale(1)
        setTranslate({ x: 0, y: 0 })
      }
      else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1)
        setScale(1)
        setTranslate({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentIndex, images.length, onClose])

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    }
  }
  const goToNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    }
  }

  // === Touch handlers for swipe + pinch-zoom ===
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      touchEndX.current = null
      touchEndY.current = null
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      initialPinchDistance.current = Math.sqrt(dx * dx + dy * dy)
      initialScale.current = scale
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchEndX.current = e.touches[0].clientX
      touchEndY.current = e.touches[0].clientY
    } else if (e.touches.length === 2 && initialPinchDistance.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.sqrt(dx * dx + dy * dy)
      const newScale = Math.max(1, Math.min(4, initialScale.current * (distance / initialPinchDistance.current)))
      setScale(newScale)
    }
  }

  const handleTouchEnd = () => {
    // Only swipe if not zoomed in
    if (scale === 1 && touchStartX.current !== null && touchEndX.current !== null) {
      const diffX = touchStartX.current - touchEndX.current
      const diffY = touchStartY.current && touchEndY.current ? Math.abs(touchStartY.current - touchEndY.current) : 0
      const threshold = 50

      // Horizontal swipe (more horizontal than vertical)
      if (Math.abs(diffX) > threshold && Math.abs(diffX) > diffY) {
        if (diffX > 0) goToNext()
        else goToPrev()
      }
    }

    // Reset pinch tracking
    if (scale === 1) {
      initialPinchDistance.current = null
    }

    touchStartX.current = null
    touchStartY.current = null
    touchEndX.current = null
    touchEndY.current = null
  }

  const currentImage = images[currentIndex]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
      onClick={(e) => {
        // Close when clicking the background (not the image)
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* === Top bar === */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {t('productDetail.imageCounter', { current: currentIndex + 1, total: images.length })}
          </span>
        </div>
        <button
          onClick={onClose}
          className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          aria-label={t('common.close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* === Main image area === */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={currentIndex}
            src={currentImage?.url}
            alt={currentImage?.alt || t('productDetail.mainImageAlt', { name: productName, index: currentIndex + 1 })}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
              transformOrigin: 'center',
              transition: scale === 1 ? 'transform 0.2s ease-out' : 'none',
              touchAction: 'none',
            }}
            draggable={false}
          />
        </AnimatePresence>

        {/* Nav arrows (desktop) */}
        {images.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                onClick={goToPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label={t('productDetail.previousImage')}
              >
                <ChevronLeft className="h-6 w-6 text-white" />
              </button>
            )}
            {currentIndex < images.length - 1 && (
              <button
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                aria-label={t('productDetail.nextImage')}
              >
                <ChevronRight className="h-6 w-6 text-white" />
              </button>
            )}
          </>
        )}

        {/* Zoom indicator */}
        {scale > 1 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
            {t('productDetail.pinchToAdjust', { percent: Math.round(scale * 100) })}
          </div>
        )}
      </div>

      {/* === Thumbnail strip (bottom) === */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-4 justify-start sm:justify-center" style={{ scrollbarWidth: 'thin' }}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentIndex(i)
                setScale(1)
                setTranslate({ x: 0, y: 0 })
              }}
              className={cn(
                'flex-shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden transition-all bg-white/10',
                currentIndex === i
                  ? 'border-white scale-110'
                  : 'border-white/30 hover:border-white/60',
              )}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Related Product Card — uses shared ProductCard                      */
/* ------------------------------------------------------------------ */

function RelatedProductCard({ product }: { product: Product }) {
  return <ProductCard product={product} size="mini" />
}

/* ------------------------------------------------------------------ */
/*  Specifications Table (Flipkart style)                              */
/* ------------------------------------------------------------------ */

function SpecificationsTable({ specs }: { specs: SpecificationGroup[] }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(specs.map(s => s.group)))

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  return (
    <div className="space-y-0">
      {specs.map((group) => (
        <div key={group.group} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
          <button
            onClick={() => toggleGroup(group.group)}
            className="w-full flex items-center justify-between py-3 text-left"
          >
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{group.group}</h4>
            <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', expandedGroups.has(group.group) && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {expandedGroups.has(group.group) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pb-3">
                  {group.specs.map((spec, i) => (
                    <div key={i} className={cn(
                      'flex py-2 text-[12px]',
                      i % 2 === 0 ? 'bg-gray-50/50 dark:bg-gray-800/30' : ''
                    )}>
                      <span className="w-2/5 text-gray-500 dark:text-gray-400 px-3 flex-shrink-0">{spec.key}</span>
                      <span className="w-3/5 text-gray-800 dark:text-gray-200 px-3">{spec.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}


/* ------------------------------------------------------------------ */
/*  Main Product Detail Page                                            */
/* ------------------------------------------------------------------ */

export function ProductDetailPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const shouldAutoOpenReview = searchParams.get('review') === 'true'
  const productId = params?.id as string

  const { authenticated, user } = useCustomerAuth()

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [selectedVariantAttrs, setSelectedVariantAttrs] = useState<Record<string, string>>({})
  const [selectedVariantSku, setSelectedVariantSku] = useState<string | null>(null)
  const [addedToCart, setAddedToCart] = useState(false)

  const { addToCart, isInCart, totalItems: cartCount } = useCart()
  const { toggleWishlist, isInWishlist, totalItems: wishlistCount } = useWishlist()
  const { addProduct: addRecentlyViewed } = useRecentlyViewed()

  // Size chart modal state
  const [showSizeChart, setShowSizeChart] = useState(false)

  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewStats, setReviewStats] = useState<ReviewStats>({
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    mediaCount: 0,
  })
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [editingReview, setEditingReview] = useState<Review | null>(null)
  const [canReview, setCanReview] = useState(false)
  const [hasExistingReview, setHasExistingReview] = useState(false)
  const [eligibleItems, setEligibleItems] = useState<Array<{ orderId: string; orderItemId: string; productId: string; productName: string; variant: string | Record<string, unknown>; status: string }>>([])
  const [helpfulLoading, setHelpfulLoading] = useState<string | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'positive' | 'critical' | 'photos' | 'videos'>('all')
  const [visibleReviews, setVisibleReviews] = useState(3)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [galleryModal, setGalleryModal] = useState<{
    type: 'image' | 'video'
    items: Array<{ mediaUrl: string; thumbnailUrl?: string | null; mediaType: string; customerName?: string; rating?: number; [key: string]: unknown }>
  } | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [failedGalleryImages, setFailedGalleryImages] = useState<Set<string>>(new Set())
  const [failedVideoThumbnails, setFailedVideoThumbnails] = useState<Set<string>>(new Set())
  const [failedGalleryModalThumbs, setFailedGalleryModalThumbs] = useState<Set<string>>(new Set())
  const [lightboxAsVideo, setLightboxAsVideo] = useState(false)

  /* ── Keyboard navigation for lightbox and gallery modal ── */
  useEffect(() => {
    if (!lightboxImage && !galleryModal) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null)
          setLightboxAsVideo(false)
        } else if (galleryModal) {
          setGalleryModal(null)
        }
        return
      }
      // Arrow key navigation only when lightbox is open with gallery context
      if (!lightboxImage || !galleryModal || galleryModal.items.length <= 1) return
      if (e.key === 'ArrowLeft' && lightboxIndex > 0) {
        const prevIdx = lightboxIndex - 1
        setLightboxIndex(prevIdx)
        setLightboxImage(galleryModal.items[prevIdx].mediaUrl)
        setLightboxAsVideo(false)
      } else if (e.key === 'ArrowRight' && lightboxIndex < galleryModal.items.length - 1) {
        const nextIdx = lightboxIndex + 1
        setLightboxIndex(nextIdx)
        setLightboxImage(galleryModal.items[nextIdx].mediaUrl)
        setLightboxAsVideo(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxImage, galleryModal, lightboxIndex])

  const isWishlisted = product ? isInWishlist(product._id) : false
  const inCart = product ? isInCart(product._id, selectedVariantAttrs) : false

  // === Seller follow state (Meesho-style) ===
  // Check if the customer follows this seller + follow/unfollow toggle.
  const [isFollowingSeller, setIsFollowingSeller] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  // === Seller rating state (Meesho/Flipkart-style) ===
  // Fetched from seller_ratings collection — shows the seller's aggregate
  // rating + total count in the "Sold by" section.
  const [sellerRating, setSellerRating] = useState<{ avg: number; total: number }>({ avg: 0, total: 0 })

  useEffect(() => {
    if (!product?.seller) {
      setSellerRating({ avg: 0, total: 0 })
      return
    }
    let cancelled = false
    fetch(`/api/customer/seller-ratings?storeName=${encodeURIComponent(product.seller)}`)
      .then((res) => (res.ok ? res.json() : { avgRating: 0, totalRatings: 0 }))
      .then((data) => {
        if (!cancelled) {
          setSellerRating({ avg: data.avgRating || 0, total: data.totalRatings || 0 })
        }
      })
      .catch(() => {
        if (!cancelled) setSellerRating({ avg: 0, total: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [product?.seller])

  useEffect(() => {
    if (!authenticated || !product?.seller) {
      setIsFollowingSeller(false)
      return
    }
    let cancelled = false
    fetch('/api/customer/followed-sellers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName: product.seller }),
    })
      .then((res) => (res.ok ? res.json() : { following: false }))
      .then((data) => {
        if (!cancelled) setIsFollowingSeller(!!data.following)
      })
      .catch(() => {
        if (!cancelled) setIsFollowingSeller(false)
      })
    return () => {
      cancelled = true
    }
  }, [authenticated, product?.seller])

  const handleToggleFollowSeller = useCallback(async () => {
    if (!authenticated || !product?.seller || followLoading) return
    setFollowLoading(true)
    try {
      if (isFollowingSeller) {
        // Unfollow
        const res = await fetch(`/api/customer/followed-sellers?storeName=${encodeURIComponent(product.seller)}`, {
          method: 'DELETE',
        })
        if (res.ok) {
          setIsFollowingSeller(false)
        }
      } else {
        // Follow
        const res = await fetch('/api/customer/followed-sellers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeName: product.seller, sellerName: product.seller }),
        })
        if (res.ok) {
          setIsFollowingSeller(true)
        }
      }
    } catch {
      // ignore
    } finally {
      setFollowLoading(false)
    }
  }, [authenticated, product?.seller, isFollowingSeller, followLoading])

  /* ── Compute active variant ── */
  const activeVariant: ProductVariant | undefined = useMemo(() => {
    if (!product?.variants?.length) return undefined
    // Only match a variant when ALL required variant attributes have been selected.
    // Previously, an empty selectedVariantAttrs object caused [].every() to return
    // true (vacuous truth), which matched the FIRST variant even before the user
    // selected anything — causing the product-level specialPrice / effectivePrice
    // (e.g. a limited-time offer) to be ignored on the detail page while the list
    // page correctly showed the discounted price. This produced an inconsistent
    // "price difference" between the list page and the detail page.
    const requiredAttrs: string[] = product.variantAttributes ?? []
    const allAttrsSelected =
      requiredAttrs.length > 0 &&
      requiredAttrs.every(attr => selectedVariantAttrs[attr] !== undefined && selectedVariantAttrs[attr] !== '')
    if (!allAttrsSelected) return undefined
    return product.variants.find(v => {
      if (!v.isActive) return false
      return Object.entries(selectedVariantAttrs).every(([key, val]) => v.attributes[key] === val)
    })
  }, [product?.variants, product?.variantAttributes, selectedVariantAttrs])

  // Current price based on selected variant or base product
  const currentMrp = activeVariant ? activeVariant.mrp : (product?.mrp ?? 0)
  const currentSellingPrice = activeVariant ? activeVariant.sellingPrice : (product?.sellingPrice ?? 0)
  // When a variant IS selected, honor the product-level special price (if active)
  // by using the lower of the variant sellingPrice and the product effectivePrice.
  // This prevents the displayed price from jumping UP when the user selects a size
  // on a product that currently has an active special/limited-time price.
  const currentEffectivePrice = activeVariant
    ? Math.min(activeVariant.sellingPrice, product?.effectivePrice ?? activeVariant.sellingPrice)
    : (product?.effectivePrice ?? 0)
  const currentStock = activeVariant ? activeVariant.stock : (product?.stock ?? 0)
  const currentInStock = activeVariant ? activeVariant.stock > 0 : (product?.inStock ?? false)
  // Use effectivePrice for discount display (considers special prices for non-variant products)
  const currentDiscountPercent = currentMrp > 0 ? Math.round(((currentMrp - currentEffectivePrice) / currentMrp) * 100) : 0
  const hasCurrentDiscount = currentDiscountPercent > 0

  // Images to show in gallery (variant images or product images)
  const galleryImages = useMemo(() => {
    if (activeVariant?.images?.length) {
      // Convert variant image URLs to ProductImage format
      return activeVariant.images.map((url, i) => ({
        url,
        alt: `${product?.name || 'Product'} - Variant ${i + 1}`,
        publicId: '',
        isPrimary: i === 0,
      }))
    }
    return product?.images?.filter(img => img.url) || []
  }, [activeVariant, product?.images, product?.name])

  /* ── Fetch product ── */
  useEffect(() => {
    if (!productId) return
    setLoading(true)
    setError(null)
    setAddedToCart(false)
    setSelectedVariantAttrs({})
    setSelectedVariantSku(null)

    fetch(`/api/products/${productId}`, {
      signal: createTimeoutSignal(10000),
    })
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Product not found' : 'Failed to load')
        return res.json()
      })
      .then(data => {
        setProduct(data.product)
        setRelatedProducts(data.relatedProducts || data.product?.relatedProducts || [])
        setQuantity(1)
        if (data.product) {
          addRecentlyViewed({
            _id: data.product._id,
            name: data.product.name,
            mrp: data.product.mrp,
            sellingPrice: data.product.sellingPrice,
            effectivePrice: data.product.effectivePrice,
            hasDiscount: data.product.hasDiscount,
            discountPercent: data.product.discountPercent,
            imageUrl: data.product.imageUrl,
            category: data.product.category,
            brand: data.product.brand,
          })
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [productId, addRecentlyViewed])

  /* ── Fetch reviews ── */
  const fetchReviews = useCallback(async () => {
    if (!productId) return
    setReviewsLoading(true)
    try {
      const res = await fetch(`/api/customer/reviews?productId=${productId}`)
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        // Map backend response format to frontend Review type
        const mapped: Review[] = (data.reviews || []).map((r: Record<string, unknown>) => ({
          _id: r._id as string,
          productId: r.productId as string,
          customerId: r.customerId as string,
          customerName: r.customerName as string,
          customerAvatar: (r.customerAvatar as string | null | undefined) ?? null,
          orderId: (r.orderId as string) || '',
          orderItemId: (r.orderItemId as string) || '',
          rating: r.rating as number,
          title: (r.title as string) || '',
          comment: (r.comment as string) || '',
          pros: (r.pros as string) || null,
          cons: (r.cons as string) || null,
          variant: (r.variant as string) || null,
          verified: r.verified as boolean,
          helpful: (r.helpful as number) || 0,
          notHelpful: (r.notHelpful as number) || 0,
          status: (r.status as string) as Review['status'],
          flaggedReason: null,
          media: ((r.media || []) as Array<Record<string, unknown>>).map((m) => ({
            _id: (m._id as string) || '',
            reviewId: r._id as string,
            mediaType: ((m.mediaType as string) || 'image') as 'image' | 'video',
            mediaUrl: (m.url as string) || (m.mediaUrl as string) || '',
            thumbnailUrl: (m.thumbnailUrl as string) || null,
            createdAt: (m.createdAt as string) || new Date().toISOString(),
          })),
          sellerReplies: ((r.replies || []) as Array<Record<string, unknown>>).map((rep) => ({
            _id: (rep._id as string) || '',
            reviewId: r._id as string,
            sellerId: (rep.sellerId as string) || '',
            sellerName: (rep.sellerName as string) || '',
            replyText: (rep.replyText as string) || (rep.comment as string) || '',
            createdAt: (rep.createdAt as string) || new Date().toISOString(),
          })),
          userVote: ((r.userVote as string) || null) as Review['userVote'],
          createdAt: r.createdAt as string,
          updatedAt: (r.updatedAt as string) || r.createdAt as string,
        }))
        setReviews(mapped)
        setReviewStats(
          data.stats || {
            averageRating: 0,
            totalReviews: 0,
            ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
            mediaCount: 0,
          }
        )
      }
    } catch {
      // Silently fail
    } finally {
      setReviewsLoading(false)
    }
  }, [productId])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  /* ── Check can review ── */
  const checkCanReview = useCallback(async () => {
    if (!productId || !authenticated) {
      setCanReview(false)
      setHasExistingReview(false)
      setEligibleItems([])
      return
    }
    try {
      const res = await fetch(`/api/customer/reviews/can-review?productId=${productId}`)
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        setCanReview(data.canReview ?? false)
        setHasExistingReview(!!data.existingReview)
        setEligibleItems(data.eligibleItems || [])
      }
    } catch {
      setCanReview(false)
    }
  }, [productId, authenticated])

  useEffect(() => {
    checkCanReview()
  }, [checkCanReview])

  /* ── Auto-open review modal ── */
  useEffect(() => {
    if (shouldAutoOpenReview && canReview && !hasExistingReview) {
      setReviewModalOpen(true)
    }
  }, [shouldAutoOpenReview, canReview, hasExistingReview])

  /* ── Submit review ── */
  const handleSubmitReview = async (formData: FormData) => {
    setReviewSubmitting(true)
    try {
      // Upload new images first if any
      const mediaFiles = formData.getAll('images') as File[]
      const videoFiles = formData.getAll('videos') as File[]
      const uploadedImages: Array<{ url: string; publicId: string }> = []
      const uploadedVideos: Array<{ url: string; publicId: string }> = []

      if (mediaFiles.length > 0 || videoFiles.length > 0) {
        const uploadForm = new FormData()
        mediaFiles.forEach((f) => uploadForm.append('images', f))
        videoFiles.forEach((f) => uploadForm.append('videos', f))
        try {
          const uploadRes = await fetch('/api/customer/reviews/upload-media', {
            method: 'POST',
            body: uploadForm,
          })
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            if (uploadData.images) uploadedImages.push(...uploadData.images)
            if (uploadData.videos) uploadedVideos.push(...uploadData.videos)
          }
        } catch {
          // Continue even if upload fails
        }
      }

      const reviewId = formData.get('reviewId') as string | null
      const isEdit = !!reviewId

      // Parse existing images that the user wants to keep (for edit mode)
      let existingImagesKept: Array<{ url: string; publicId: string }> = []
      let existingVideosKept: Array<{ url: string; publicId: string }> = []
      if (isEdit) {
        try {
          const existingImagesStr = formData.get('existingImages') as string | null
          if (existingImagesStr) {
            existingImagesKept = JSON.parse(existingImagesStr)
          }
        } catch {
          // If parsing fails, no existing images to keep
        }
        try {
          const existingVideosStr = formData.get('existingVideos') as string | null
          if (existingVideosStr) {
            existingVideosKept = JSON.parse(existingVideosStr)
          }
        } catch {
          // If parsing fails, no existing videos to keep
        }
      }

      // Combine: existing kept images + newly uploaded images
      const allImages = [...existingImagesKept, ...uploadedImages]
      // Combine: existing kept videos + newly uploaded videos
      const allVideos = [...existingVideosKept, ...uploadedVideos]

      const body: Record<string, unknown> = {
        productId: formData.get('productId'),
        rating: Number(formData.get('rating')),
        title: formData.get('title'),
        comment: formData.get('comment'),
        pros: formData.get('pros') || null,
        cons: formData.get('cons') || null,
        images: allImages,
        videos: allVideos,
      }

      if (isEdit) {
        body.reviewId = reviewId
      } else if (eligibleItems.length > 0) {
        // Include order info for new reviews from eligible delivered items
        body.orderId = eligibleItems[0].orderId
        body.orderItemId = eligibleItems[0].orderItemId
      }

      const res = await fetch('/api/customer/reviews', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setReviewModalOpen(false)
        setEditingReview(null)
        fetchReviews()
        checkCanReview()
      }
    } catch {
      // Silently fail
    } finally {
      setReviewSubmitting(false)
    }
  }

  /* ── Edit review ── */
  const handleEditReview = (review: Review) => {
    setEditingReview(review)
    setReviewModalOpen(true)
  }

  /* ── Delete review ── */
  const handleDeleteReview = async (reviewId: string) => {
    try {
      const res = await fetch('/api/customer/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId }),
      })
      if (res.ok) {
        fetchReviews()
        checkCanReview()
      }
    } catch {
      // Silently fail
    }
  }

  /* ── Helpful vote ── */
  const handleHelpful = async (reviewId: string) => {
    setHelpfulLoading(reviewId)
    try {
      await fetch('/api/customer/reviews/helpful', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, vote: 'helpful' }),
      })
      fetchReviews()
    } catch {
      // Silently fail
    } finally {
      setHelpfulLoading(null)
    }
  }

  /* ── Open write review ── */
  const openWriteReview = () => {
    setEditingReview(null)
    setReviewModalOpen(true)
  }

  /* ── Filtered reviews ── */
  const filteredReviews = reviews.filter((r) => {
    if (reviewFilter === 'positive') return r.rating >= 4
    if (reviewFilter === 'critical') return r.rating <= 2
    if (reviewFilter === 'photos') return r.media && r.media.some(m => m.mediaType !== 'video')
    if (reviewFilter === 'videos') return r.media && r.media.some(m => m.mediaType === 'video')
    return true
  })

  // Group variants by attribute (new model: variantAttributes + variants)
  const variantGroups = useMemo(() => {
    if (!product?.variantAttributes?.length || !product?.variants?.length) return {} as Record<string, string[]>
    const groups: Record<string, string[]> = {}
    product.variantAttributes.forEach((attr) => {
      const values = new Set<string>()
      product.variants!.forEach(v => {
        if (v.isActive && v.attributes[attr]) {
          values.add(v.attributes[attr])
        }
      })
      if (values.size > 0) {
        groups[attr] = Array.from(values)
      }
    })
    return groups
  }, [product?.variantAttributes, product?.variants])

  // Whether the product has a "size" attribute in variants
  const hasSizeAttribute = Object.keys(variantGroups).some(attr => attr.toLowerCase() === 'size')

  // Whether size chart data is available
  const hasSizeChart = !!(product?.sizeChart && (
    (product.sizeChart.imageUrl) ||
    (product.sizeChart.headers?.length > 0 && product.sizeChart.rows?.length > 0)
  ))

  // Show size chart button only when attribute is "size" AND size chart exists
  const showSizeChartButton = hasSizeAttribute && hasSizeChart

  // Check if a variant value is in stock for the current selections
  const isVariantValueAvailable = (attribute: string, value: string) => {
    const testAttrs = { ...selectedVariantAttrs, [attribute]: value }
    return product?.variants?.some(v => {
      if (!v.isActive) return false
      return Object.entries(testAttrs).every(([k, val]) => v.attributes[k] === val) && v.stock > 0
    }) ?? false
  }

  const handleAddToCart = async () => {
    if (!product) return
    // If already in cart, navigate to cart instead of re-adding
    if (inCart) {
      router.push('/customer?tab=cart')
      return
    }
    const success = await addToCart({
      productId: product._id,
      name: product.name,
      price: currentMrp,
      sellingPrice: currentSellingPrice,
      effectivePrice: currentEffectivePrice,
      hasDiscount: hasCurrentDiscount,
      discountPercent: currentDiscountPercent,
      imageUrl: product.imageUrl,
      stock: currentStock,
      seller: product.seller,
      brand: product.brand,
      selectedVariant: selectedVariantAttrs,
      quantity,
    })
    if (success) {
      setAddedToCart(true)
      setTimeout(() => setAddedToCart(false), 2000)
    }
  }

  const handleBuyNow = async () => {
    if (!product) return
    if (!inCart) {
      const success = await addToCart({
        productId: product._id,
        name: product.name,
        price: currentMrp,
        sellingPrice: currentSellingPrice,
        effectivePrice: currentEffectivePrice,
        hasDiscount: hasCurrentDiscount,
        discountPercent: currentDiscountPercent,
        imageUrl: product.imageUrl,
        stock: currentStock,
        seller: product.seller,
        brand: product.brand,
        selectedVariant: selectedVariantAttrs,
        quantity,
      })
      if (!success) return // Don't navigate if add failed
    }
    router.push('/customer?tab=cart')
  }

  const handleToggleWishlist = () => {
    if (!product) return
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

  // ── Share Product ──
  // Uses the Web Share API (native share sheet on mobile) with a fallback
  // to a custom share dialog (WhatsApp, Copy Link, etc.) for desktop browsers.
  // Also stores the share record in the backend so the customer can view all
  // their shared products in the Shared Products page.
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  const handleShareProduct = async () => {
    if (!product) return
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/customer/product/${product._id}`
      : `/customer/product/${product._id}`
    const shareText = t('productDetail.shareText', { name: product.name, price: product.effectivePrice.toLocaleString('en-IN') })

    // Try native Web Share API (mobile / secure context)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: product.name,
          text: shareText,
          url: shareUrl,
        })
        // Share succeeded — store the record
        storeShareRecord()
        return
      } catch {
        // User cancelled or share failed — fall through to custom dialog
      }
    }

    // Fallback: open custom share dialog
    setShareUrl(shareUrl)
    setShareTextValue(shareText)
    setShareDialogOpen(true)
  }

  // State for custom share dialog
  const [shareUrl, setShareUrl] = useState('')
  const [shareTextValue, setShareTextValue] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  // Store the share record in the backend (fire-and-forget)
  const storeShareRecord = async () => {
    if (!product) return
    try {
      await fetch('/api/customer/shared-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product._id,
          name: product.name,
          imageUrl: product.imageUrl,
          effectivePrice: product.effectivePrice,
          mrp: product.mrp,
          brand: product.brand,
          category: product.category,
        }),
      })
    } catch {
      // Non-critical — share still worked
    }
  }

  // Copy link to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareTextValue} ${shareUrl}`)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
      storeShareRecord()
    } catch {
      // Fallback: create a temporary textarea
      const textarea = document.createElement('textarea')
      textarea.value = `${shareTextValue} ${shareUrl}`
      document.body.appendChild(textarea)
      textarea.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(textarea)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
      storeShareRecord()
    }
  }

  // Share via WhatsApp
  const handleShareWhatsApp = () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareTextValue} ${shareUrl}`)}`
    window.open(whatsappUrl, '_blank')
    storeShareRecord()
    setShareDialogOpen(false)
  }

  // Share via SMS
  const handleShareSMS = () => {
    const smsUrl = `sms:?body=${encodeURIComponent(`${shareTextValue} ${shareUrl}`)}`
    window.location.href = smsUrl
    storeShareRecord()
    setShareDialogOpen(false)
  }

  // Share via email
  const handleShareEmail = () => {
    const emailUrl = `mailto:?subject=${encodeURIComponent(product?.name || 'Check out this product')}&body=${encodeURIComponent(`${shareTextValue} ${shareUrl}`)}`
    window.location.href = emailUrl
    storeShareRecord()
    setShareDialogOpen(false)
  }

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
        <div className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 animate-pulse" />
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <div className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
          <div className="space-y-3">
            <div className="h-5 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-7 w-3/4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-8 w-1/3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  /* ── Error state ── */
  if (error || !product) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex flex-col">
        <div className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4">
          <button onClick={() => router.back()} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <Package className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">
              {error || t('productDetail.productNotFound')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">{t('productDetail.productUnavailable')}</p>
            <button
              onClick={() => router.push('/customer')}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {t('common.browseProducts')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Render ── */
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24 lg:pb-6">
      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap line-clamp-1 max-w-[180px]">
              {product.name}
            </h1>
          </div>

          {/* Right Icons: Wishlist → Cart */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => router.push('/customer?tab=wishlist')}
              className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <Heart className={cn('h-5 w-5', isWishlisted ? 'fill-red-500 text-red-500' : '')} />
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {wishlistCount > 99 ? '99+' : wishlistCount}
                </span>
              )}
            </button>
            <button
              onClick={() => router.push('/customer?tab=cart')}
              className="h-9 w-9 relative text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* ── Image Gallery ── */}
        <div className="p-4">
          <ImageGallery
            images={galleryImages}
            productName={product.name}
            isWishlisted={isWishlisted}
            onToggleWishlist={handleToggleWishlist}
          />
        </div>

        {/* ── Product Info Section (Flipkart/Amazon-style) ── */}
        <div className="bg-white dark:bg-gray-900 rounded-t-3xl -mt-2 relative z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="p-4">
            {/* 1. Product Title */}
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-3 mb-2">
              {product.name}
            </h1>

            {/* 2. Rating Row */}
            {(product.avgRating ?? 0) > 0 || reviewStats.totalReviews > 0 ? (
              <div
                className="flex items-center gap-2 cursor-pointer mb-3"
                onClick={() => {
                  const el = document.getElementById('reviews-section')
                  el?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold',
                    ratingBadgeClass(product.avgRating ?? reviewStats.averageRating)
                  )}
                >
                  {((product.avgRating ?? reviewStats.averageRating) || 0).toFixed(1)}
                  <Star className="h-2.5 w-2.5 fill-current" />
                </span>
                <StarRatingDisplay rating={product.avgRating ?? reviewStats.averageRating} size={12} />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('productDetail.ratingsCount', { count: (product.totalReviews ?? reviewStats.totalReviews) })}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">{t('productDetail.noRatings')}</span>
              </div>
            )}

            {/* 4. Price Block — with wishlist toggle (moved here from image overlay) */}
            <div className="mb-3 space-y-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">
                  {formatPrice(currentEffectivePrice)}
                </span>
                {hasCurrentDiscount && (
                  <>
                    <span className="text-sm text-gray-400 line-through">
                      {formatPrice(currentMrp)}
                    </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {t('productDetail.percentOff', { percent: currentDiscountPercent })}
                    </span>
                  </>
                )}
                {/* Wishlist toggle + Share button — side by side.
                    Wishlist is on the left, Share is on the right. */}
                <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleToggleWishlist}
                    className="h-9 w-9 flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title={isWishlisted ? t('productDetail.removeFromWishlist') : t('productDetail.addToWishlist')}
                    aria-label={isWishlisted ? t('productDetail.removeFromWishlist') : t('productDetail.addToWishlist')}
                    aria-pressed={isWishlisted}
                  >
                    <Heart className={cn('h-5 w-5 transition-colors', isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-500 hover:text-red-500')} />
                  </button>
                  <button
                    onClick={handleShareProduct}
                    className="h-9 w-9 flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    title={t('productDetail.shareProduct')}
                    aria-label={t('productDetail.shareProduct')}
                  >
                    <Share2 className="h-5 w-5 text-gray-500 hover:text-emerald-500 transition-colors" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{t('productDetail.inclusiveOfTaxes')}</p>

              {/* EMI info */}
              {currentEffectivePrice >= 3000 && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  <CreditCard className="h-3 w-3 inline -mt-0.5 mr-0.5" />
                  {t('productDetail.emiFrom', { amount: formatPrice(Math.ceil(currentEffectivePrice / 6)) })}
                </p>
              )}
            </div>

            {/* 5. Free Delivery / Delivery Info
                Production-grade logic (mirrors Flipkart/Amazon/Meesho):
                  - "Free Delivery" badge is shown ONLY when delivery is actually
                    free for THIS product at its current effective price:
                      a) seller explicitly marked the product as freeDelivery, OR
                      b) per-product freeDeliveryAbove threshold is set AND the
                         product's effective price meets/exceeds that threshold.
                  - Otherwise, show "Delivery: ₹X" with "(Free above ₹Y)" hint
                    so the customer knows the charge AND the threshold to unlock
                    free delivery.
                  - If neither an explicit charge nor a threshold is configured
                    on the product, we don't show a static badge here — the
                    DeliveryChecker component below will fetch the actual
                    estimate from the delivery engine after the customer enters
                    their pincode (the engine applies platform defaults). */}
            {(() => {
              const shipFreeDeliveryAbove = product.shipping?.freeDeliveryAbove ?? 0
              const shipDeliveryCharge = product.shipping?.deliveryCharge ?? 0
              // Free if seller explicitly marked the product free OR the price
              // meets the per-product free-delivery threshold.
              const isActuallyFree =
                product.freeDelivery === true ||
                (shipFreeDeliveryAbove > 0 && currentEffectivePrice >= shipFreeDeliveryAbove)

              if (isActuallyFree) {
                return (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
                      <Truck className="h-3.5 w-3.5" />
                      {t('common.freeDelivery')}
                    </span>
                    {(product.totalSold ?? 0) > 0 && (
                      <span className="text-xs text-gray-400">{t('productDetail.soldCount', { count: product.totalSold ?? 0 })}</span>
                    )}
                  </div>
                )
              }

              // Not free — show the delivery charge (if known) + threshold hint
              // so the customer knows exactly what they'll pay and how to unlock
              // free delivery. Mirrors Flipkart's "Delivery: ₹49 (Free above ₹499)".
              if (shipDeliveryCharge > 0 || shipFreeDeliveryAbove > 0) {
                return (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      <Truck className="h-3.5 w-3.5 inline -mt-0.5 mr-0.5" />
                      {shipDeliveryCharge > 0
                        ? <>{t('productDetail.deliveryCharge', { amount: formatPrice(shipDeliveryCharge) })}</>
                        : <>{t('productDetail.deliveryChargeApplies')}</>
                      }
                      {shipFreeDeliveryAbove > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400"> {t('productDetail.freeAbove', { amount: formatPrice(shipFreeDeliveryAbove) })}</span>
                      )}
                    </span>
                    {(product.totalSold ?? 0) > 0 && (
                      <span className="text-xs text-gray-400">{t('productDetail.soldCount', { count: product.totalSold ?? 0 })}</span>
                    )}
                  </div>
                )
              }

              // No per-product delivery config — let the DeliveryChecker handle it
              return null
            })()}

            {/* 6. Select Variants (Flipkart-style chips/pills) */}
            {Object.keys(variantGroups).length > 0 && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4">
                {Object.entries(variantGroups).map(([attribute, values]) => (
                  <div key={attribute}>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {t('productDetail.selectAttribute', { attribute })}
                        {selectedVariantAttrs[attribute] && (
                          <span className="text-gray-400 font-normal ml-1">: {selectedVariantAttrs[attribute]}</span>
                        )}
                      </p>
                      {attribute.toLowerCase() === 'size' && showSizeChartButton && (
                        <button
                          onClick={() => setShowSizeChart(true)}
                          className="flex items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700"
                        >
                          {t('productDetail.sizeChart')}
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(values as string[]).map((val) => {
                        const isSelected = selectedVariantAttrs[attribute] === val
                        const isAvailable = isVariantValueAvailable(attribute, val)

                        return (
                          <button
                            key={val}
                            onClick={() => {
                              setSelectedVariantAttrs(prev => ({
                                ...prev,
                                [attribute]: isSelected ? '' : val
                              }))
                            }}
                            disabled={!isAvailable && !isSelected}
                            className={cn(
                              'px-4 py-2 rounded-full text-xs font-medium transition-all border relative',
                              isSelected
                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                : isAvailable
                                  ? 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-600'
                                  : 'border-gray-200 dark:border-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed line-through'
                            )}
                          >
                            {val}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Stock status */}
                {!currentInStock && Object.keys(selectedVariantAttrs).length > 0 && (
                  <p className="text-xs text-red-500 font-medium mt-2">{t('productDetail.variantOutOfStock')}</p>
                )}
              </div>
            )}

            {/* 7. Quantity + Brand selector (same row) */}
            {currentInStock && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 flex items-center gap-3 flex-wrap">
                {product.brand && (
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Brand : </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{product.brand}</span>
                  </span>
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('productDetail.qty')}</span>
                <div className="flex items-center gap-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="h-8 w-8 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="h-8 w-10 flex items-center justify-center text-sm font-semibold text-gray-900 dark:text-gray-100 border-x border-gray-200 dark:border-gray-700">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(q => Math.min(currentStock, q + 1))}
                    disabled={quantity >= currentStock}
                    className="h-8 w-8 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {currentStock <= 5 && currentStock > 0 && (
                  <span className="text-xs text-red-500 font-medium">{t('productDetail.onlyLeft', { count: currentStock })}</span>
                )}
              </div>
            )}

            {/* Brand display when out of stock (quantity selector not shown) */}
            {!currentInStock && product.brand && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Brand : </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{product.brand}</span>
                </span>
              </div>
            )}

            {/* 8. Seller Info Row — with Follow button + Seller Rating (Meesho-style) */}
            {product.seller && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-3">
                <div className="flex items-center justify-between gap-2">
                  {/* Clickable seller info → opens seller profile page */}
                  <button
                    onClick={() => router.push(`/customer/seller?storeName=${encodeURIComponent(product.seller)}`)}
                    className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity text-left"
                    aria-label={t('productDetail.viewSellerProfile', { seller: product.seller })}
                  >
                    {/* Store avatar */}
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden">
                      {product.sellerProfileImage ? (
                        <img src={product.sellerProfileImage} alt={product.seller} className="w-full h-full object-cover" />
                      ) : (
                        product.seller.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('productDetail.soldBy')}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{product.seller}</span>
                        <BadgeCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      </div>
                      {/* Seller rating row (Meesho/Flipkart-style) */}
                      {sellerRating.total > 0 ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{sellerRating.avg.toFixed(1)}</span>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={cn(
                                  'h-2.5 w-2.5',
                                  s <= Math.round(sellerRating.avg)
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-gray-200 dark:text-gray-700'
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] text-gray-400">({sellerRating.total})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star key={s} className="h-2.5 w-2.5 text-gray-200 dark:text-gray-700" />
                            ))}
                          </div>
                          <span className="text-[10px] text-gray-400">{t('productDetail.newSeller')}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 ml-1" />
                  </button>
                  {/* Follow / Following button */}
                  {authenticated && (
                    <button
                      onClick={handleToggleFollowSeller}
                      disabled={followLoading}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex-shrink-0',
                        isFollowingSeller
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400'
                          : 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95'
                      )}
                    >
                      {followLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isFollowingSeller ? (
                        <>
                          <UserCheck className="h-3 w-3" />
                          {t('productDetail.following')}
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3 w-3" />
                          {t('productDetail.follow')}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 9. Delivery Info Section — Interactive pincode checker (Flipkart/Amazon-style) */}
            <DeliveryChecker
              productId={product._id}
              sellerId={product.seller}
              freeDelivery={product.freeDelivery}
              shipping={product.shipping ? {
                deliveryCharge: product.shipping.deliveryCharge,
                freeDeliveryAbove: product.shipping.freeDeliveryAbove,
              } : undefined}
              productPrice={currentEffectivePrice}
              variant="full"
            />

            {/* 10. Return Policy & Warranty */}
            {(product.returnPolicy || product.warranty) && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
                {product.returnPolicy && (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">{product.returnPolicy}</span>
                  </div>
                )}
                {product.warranty && (
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">{product.warranty}</span>
                  </div>
                )}
              </div>
            )}

            {/* 11. Trust Badges Row */}
            <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-5 pb-2">
              <div className="flex items-center justify-around">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-9 w-9 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                    <BadgeCheck className="h-5 w-5 text-emerald-500" />
                  </div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">{t('productDetail.lowestPrice')}<br/>{t('productDetail.price')}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-9 w-9 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-emerald-500" />
                  </div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">{t('productDetail.cashOn')}<br/>{t('productDetail.delivery')}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-9 w-9 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 text-emerald-500" />
                  </div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">
                    {product.returnPolicy ? product.returnPolicy.split(' ')[0] : t('productDetail.defaultReturnDays')}<br/>{t('productDetail.returnsLabel')}
                  </span>
                </div>
                {product.warranty && (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="h-9 w-9 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-emerald-500" />
                    </div>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">{t('productDetail.warranty')}<br/>{t('productDetail.included')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Specifications Section ── */}
        {product.specifications && product.specifications.length > 0 && (
          <div className="bg-white dark:bg-gray-900 mt-2 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{t('productDetail.specifications')}</h3>
            </div>
            <SpecificationsTable specs={product.specifications} />
          </div>
        )}

        {/* ── Product Description ── */}
        <div className="bg-white dark:bg-gray-900 mt-2 p-4">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">{t('productDetail.productDescription')}</h3>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-line">
            {product.description}
          </p>
        </div>

        {/* ── Ratings & Reviews Section ── */}
        <div id="reviews-section" className="bg-white dark:bg-gray-900 mt-2 p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{t('productDetail.ratingsAndReviews')}</h3>
            {canReview && !hasExistingReview && (
              <button
                onClick={openWriteReview}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              >
                <Edit2 className="h-3 w-3" />
                {t('productDetail.writeReview')}
              </button>
            )}
          </div>

          {reviewsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Rating Overview — only when reviews exist */}
              {reviewStats.totalReviews === 0 ? (
                /* Empty state */
                <div className="text-center py-8">
                  <MessageSquare className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('productDetail.noReviews')}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('productDetail.beFirstToReview')}</p>
                  {canReview && !hasExistingReview && (
                    <button
                      onClick={openWriteReview}
                      className="mt-3 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl transition-colors"
                    >
                      {t('productDetail.writeReview')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex gap-5 mb-5">
                  {/* Big number */}
                  <div className="flex flex-col items-center justify-center min-w-[80px]">
                    <span className="text-4xl font-extrabold text-gray-900 dark:text-gray-100">
                      {reviewStats.averageRating.toFixed(1)}
                    </span>
                    <StarRatingDisplay rating={reviewStats.averageRating} size={14} />
                    <span className="text-[11px] text-gray-400 mt-1">
                      {t('productDetail.reviewsCount', { count: reviewStats.totalReviews })}
                    </span>
                  </div>

                  {/* Bars */}
                  <div className="flex-1 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((star) => (
                      <RatingBar
                        key={star}
                        stars={star}
                        count={reviewStats.ratingDistribution[star] || 0}
                        total={reviewStats.totalReviews}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Images & Videos Gallery — only when reviews with media exist */}
              {reviewStats.totalReviews > 0 && reviews.some(r => r.media && r.media.length > 0) && (() => {
                const allMedia = reviews
                  .filter(r => r.media && r.media.length > 0)
                  .flatMap(r => r.media.map(m => ({ ...m, customerName: r.customerName, rating: r.rating })))
                const imageMedia = allMedia.filter(m => m.mediaType !== 'video')
                const videoMedia = allMedia.filter(m => m.mediaType === 'video')

                return (
                  <div className="flex gap-4 mb-5">
                    {/* Customer Images — Left */}
                    {imageMedia.length > 0 && (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-2">
                          <ImageIcon className="h-3.5 w-3.5 text-gray-500" />
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('productDetail.customerImages')}</span>
                          <span className="text-[10px] text-gray-400">({imageMedia.length})</span>
                        </div>
                        <div className="flex gap-2">
                          {imageMedia.slice(0, 2).map((item, idx) => {
                            const isLast = idx === Math.min(imageMedia.length, 2) - 1
                            const remainingCount = imageMedia.length - 2
                            return (
                              <button
                                key={`img-${idx}`}
                                onClick={() => {
                                  setGalleryModal({ type: 'image', items: imageMedia })
                                  setLightboxIndex(idx)
                                  setLightboxImage(item.mediaUrl)
                                  setLightboxAsVideo(false)
                                }}
                                className="relative w-[72px] h-[72px] sm:w-[80px] sm:h-[80px] flex-shrink-0 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 hover:ring-2 hover:ring-amber-400/50 transition-all group bg-gray-50 dark:bg-gray-800"
                              >
                                {failedGalleryImages.has(`gal-img-${idx}`) ? (
                                  <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                                    <ImageIcon className="h-5 w-5 text-gray-400" />
                                  </div>
                                ) : (
                                  <img
                                    src={item.thumbnailUrl || item.mediaUrl}
                                    alt={t('productDetail.customerPhoto', { index: idx + 1 })}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    onError={() => { console.warn('[Gallery] Image failed to load:', item.thumbnailUrl || item.mediaUrl); setFailedGalleryImages(prev => new Set(prev).add(`gal-img-${idx}`)) }}
                                  />
                                )}
                                {isLast && remainingCount > 0 && (
                                  <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">+{remainingCount}</span>
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Customer Videos — Right */}
                    {videoMedia.length > 0 && (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Video className="h-3.5 w-3.5 text-gray-500" />
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('productDetail.customerVideos')}</span>
                          <span className="text-[10px] text-gray-400">({videoMedia.length})</span>
                        </div>
                        <div className="flex gap-2">
                          {videoMedia.slice(0, 2).map((item, idx) => {
                            const isLast = idx === Math.min(videoMedia.length, 2) - 1
                            const remainingCount = videoMedia.length - 2
                            return (
                              <button
                                key={`vid-${idx}`}
                                onClick={() => {
                                  setGalleryModal({ type: 'video', items: videoMedia })
                                  setLightboxIndex(idx)
                                  setLightboxImage(item.mediaUrl)
                                  setLightboxAsVideo(true)
                                }}
                                className="relative w-[72px] h-[72px] sm:w-[80px] sm:h-[80px] flex-shrink-0 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 hover:ring-2 hover:ring-amber-400/50 transition-all group bg-gray-50 dark:bg-gray-800"
                              >
                                {item.thumbnailUrl && !failedVideoThumbnails.has(`gal-vid-${idx}`) ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={t('productDetail.customerVideo', { index: idx + 1 })}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    onError={() => {
                                      console.warn('[Gallery] Video thumbnail failed to load:', item.thumbnailUrl || item.mediaUrl)
                                      setFailedVideoThumbnails(prev => new Set(prev).add(`gal-vid-${idx}`))
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700">
                                    <Video className="h-5 w-5 text-gray-400" />
                                  </div>
                                )}
                                {/* Play button overlay */}
                                <div className="absolute inset-0 bg-black/15 flex items-center justify-center pointer-events-none">
                                  <div className="h-6 w-6 rounded-full bg-white/85 flex items-center justify-center shadow-md">
                                    <Play className="h-3 w-3 text-gray-800 fill-gray-800 ml-0.5" />
                                  </div>
                                </div>
                                {isLast && remainingCount > 0 && (
                                  <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">+{remainingCount}</span>
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Filter Tabs & Review List — only when reviews exist */}
              {reviewStats.totalReviews > 0 && (
                <>
                  {/* Filter Tabs */}
                  <div className="flex gap-2 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {[
                      { key: 'all' as const, label: t('common.all') },
                      { key: 'positive' as const, label: 'Positive (4-5★)' },
                      { key: 'critical' as const, label: 'Critical (1-2★)' },
                      { key: 'photos' as const, label: '📷 With Photos' },
                      { key: 'videos' as const, label: '🎥 With Videos' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setReviewFilter(key)
                          setVisibleReviews(3)
                        }}
                        className={cn(
                          'flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all border',
                          reviewFilter === key
                            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Review List */}
                  <div>
                    {filteredReviews.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-gray-400">{t('productDetail.noReviewsMatchFilter')}</p>
                      </div>
                    ) : (
                      <>
                        {filteredReviews.slice(0, visibleReviews).map((review) => (
                          <ReviewCard
                            key={review._id}
                            review={review}
                            isOwn={authenticated && !!user && review.customerId === user.id}
                            onEdit={handleEditReview}
                            onDelete={handleDeleteReview}
                            onHelpful={handleHelpful}
                            helpfulLoading={helpfulLoading}
                            onImageClick={(url) => setLightboxImage(url)}
                          />
                        ))}

                        {/* See More */}
                        {visibleReviews < filteredReviews.length && (
                          <button
                            onClick={() => setVisibleReviews((prev) => prev + 5)}
                            className="w-full py-3 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 transition-colors"
                          >
                            {t('productDetail.seeMoreReviews', { remaining: filteredReviews.length - visibleReviews })}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ── You might also like ── */}
        {relatedProducts.length > 0 && (
          <div className="bg-white dark:bg-gray-900 mt-2 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{t('productDetail.youMightAlsoLike')}</h3>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">{t('productDetail.ad')}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {relatedProducts.map((rp, rpIdx) => (
                <RelatedProductCard key={rp._id || `rp-${rpIdx}`} product={rp} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky Bottom Bar ── */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 safe-area-bottom transition-transform duration-300",
        (galleryModal || lightboxImage || reviewModalOpen || showSizeChart) && "translate-y-full"
      )}>

        <div className="flex items-stretch gap-3 h-14 max-w-4xl mx-auto px-4 py-1.5">
          {/* Add to Cart */}
          <button
            onClick={handleAddToCart}
            disabled={!currentInStock}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-sm transition-all border-2',
              addedToCart
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                : currentInStock
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-gray-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                  : 'border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
            )}
          >
            {addedToCart ? (
              <>
                <Check className="h-5 w-5" />
                {t('productDetail.added')}
              </>
            ) : (
              <>
                <ShoppingCart className="h-5 w-5" />
                {inCart ? t('productDetail.goToCart') : t('productDetail.addToCart')}
              </>
            )}
          </button>

          {/* Buy Now */}
          <button
            onClick={handleBuyNow}
            disabled={!currentInStock}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-sm transition-all',
              currentInStock
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white active:scale-[0.98]'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            )}
          >
            <Zap className="h-5 w-5" />
            {t('productDetail.buyNow')}
          </button>
        </div>
      </div>

      {/* ── Size Chart Modal ── */}
      <SizeChartModal
        open={showSizeChart}
        onClose={() => setShowSizeChart(false)}
        sizeChart={product.sizeChart ?? null}
        selectedSize={selectedVariantAttrs['Size']}
      />

      {/* ── Review Form Modal ── */}
      <AnimatePresence>
        {reviewModalOpen && (
          <ReviewFormModal
            open={reviewModalOpen}
            onClose={() => {
              setReviewModalOpen(false)
              setEditingReview(null)
            }}
            onSubmit={handleSubmitReview}
            submitting={reviewSubmitting}
            editingReview={editingReview}
            productId={productId}
          />
        )}
      </AnimatePresence>

      {/* ── Review Media Gallery Modal ── */}
      <AnimatePresence>
        {galleryModal && (
          <>
            {/* Backdrop */}
            <motion.div
              key="gallery-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setGalleryModal(null)}
            />
            {/* Modal — bottom sheet style matching review edit modal */}
            <motion.div
              key="gallery-modal"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  {galleryModal.type === 'image' ? (
                    <>
                      <ImageIcon className="h-5 w-5 text-gray-500" />
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('productDetail.customerImages')}</h3>
                      <span className="text-sm text-gray-400">({galleryModal.items.length})</span>
                    </>
                  ) : (
                    <>
                      <Video className="h-5 w-5 text-gray-500" />
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('productDetail.customerVideos')}</h3>
                      <span className="text-sm text-gray-400">({galleryModal.items.length})</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setGalleryModal(null)}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              {/* Grid content */}
              <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {galleryModal.items.map((item, idx) => (
                    <button
                      key={`${item.mediaUrl}-${idx}`}
                      onClick={() => {
                        setLightboxIndex(idx)
                        setLightboxImage(item.mediaUrl)
                      }}
                      className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 hover:ring-2 hover:ring-amber-400/50 transition-all group bg-gray-50 dark:bg-gray-800"
                    >
                      {item.mediaType === 'video' ? (
                        <>
                          {item.thumbnailUrl && !failedGalleryModalThumbs.has(`modal-${idx}`) ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={t('productDetail.customerVideo', { index: idx + 1 })}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              onError={() => {
                                console.warn('[GalleryModal] Video thumbnail failed to load:', item.thumbnailUrl || item.mediaUrl)
                                setFailedGalleryModalThumbs(prev => new Set(prev).add(`modal-${idx}`))
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700">
                              <Video className="h-5 w-5 text-gray-400" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/30 transition-colors pointer-events-none">
                            <div className="h-7 w-7 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                              <Play className="h-3.5 w-3.5 text-gray-800 fill-gray-800 ml-0.5" />
                            </div>
                          </div>
                        </>
                      ) : failedGalleryModalThumbs.has(`modal-${idx}`) ? (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700">
                          <ImageIcon className="h-5 w-5 text-gray-400" />
                        </div>
                      ) : (
                        <img
                          src={item.thumbnailUrl || item.mediaUrl}
                          alt={t('productDetail.customerPhoto', { index: idx + 1 })}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onError={() => {
                            console.warn('[GalleryModal] Image failed to load:', item.thumbnailUrl || item.mediaUrl)
                            setFailedGalleryModalThumbs(prev => new Set(prev).add(`modal-${idx}`))
                          }}
                        />
                      )}
                      {item.customerName && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 pointer-events-none">
                          <span className="text-[9px] text-white/90 font-medium truncate block">{item.customerName}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Image/Video Lightbox with Navigation ── */}
      <AnimatePresence mode="wait">
        {lightboxImage && (
          <>
            <motion.div
              key="lightbox-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
              onClick={() => {
                setLightboxImage(null)
                setLightboxAsVideo(false)
              }}
            />
            <motion.div
              key={`lightbox-content-${lightboxIndex}`}
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center"
            >
              <div
                className="relative max-w-lg w-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl"
              >
                {/* Close button */}
                <button
                  onClick={() => {
                    setLightboxImage(null)
                    setLightboxAsVideo(false)
                  }}
                  className="absolute top-2 right-2 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Navigation: Previous button */}
                {galleryModal && galleryModal.items.length > 1 && lightboxIndex > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const prevIdx = lightboxIndex - 1
                      setLightboxIndex(prevIdx)
                      setLightboxImage(galleryModal.items[prevIdx].mediaUrl)
                      setLightboxAsVideo(false)
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}

                {/* Navigation: Next button */}
                {galleryModal && galleryModal.items.length > 1 && lightboxIndex < galleryModal.items.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const nextIdx = lightboxIndex + 1
                      setLightboxIndex(nextIdx)
                      setLightboxImage(galleryModal.items[nextIdx].mediaUrl)
                      setLightboxAsVideo(false)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}

                {/* Counter badge */}
                {galleryModal && galleryModal.items.length > 1 && (
                  <div className="absolute top-2 left-2 z-10 bg-black/40 text-white text-[11px] font-medium px-2.5 py-1 rounded-full">
                    {t('productDetail.imageCounter', { current: lightboxIndex + 1, total: galleryModal.items.length })}
                  </div>
                )}

                {/* Swipeable media display */}
                <motion.div
                  drag={galleryModal && galleryModal.items.length > 1 ? 'x' : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.3}
                  onDragEnd={(_, info) => {
                    if (!galleryModal || galleryModal.items.length <= 1) return
                    const swipeThreshold = 50
                    if (info.offset.x < -swipeThreshold && lightboxIndex < galleryModal.items.length - 1) {
                      // Swipe left → next
                      const nextIdx = lightboxIndex + 1
                      setLightboxIndex(nextIdx)
                      setLightboxImage(galleryModal.items[nextIdx].mediaUrl)
                      setLightboxAsVideo(false)
                    } else if (info.offset.x > swipeThreshold && lightboxIndex > 0) {
                      // Swipe right → previous
                      const prevIdx = lightboxIndex - 1
                      setLightboxIndex(prevIdx)
                      setLightboxImage(galleryModal.items[prevIdx].mediaUrl)
                      setLightboxAsVideo(false)
                    }
                  }}
                  className="touch-pan-y"
                >
                  {(() => {
                    // Determine if current lightbox item is a video
                    // First check galleryModal data (most reliable), then fall back to URL patterns
                    const currentItem = galleryModal?.items[lightboxIndex]
                    const isVideo = lightboxAsVideo
                      || currentItem?.mediaType === 'video'
                      || lightboxImage.match(/\.(mp4|webm|mov|avi)($|\?)/i) !== null
                      || lightboxImage.includes('/video/')
                      || lightboxImage.includes('review-vid-')
                    return isVideo ? (
                      <video
                        key={lightboxImage}
                        src={lightboxImage}
                        controls
                        autoPlay
                        className="w-full max-h-[70vh]"
                      >
                        {t('productDetail.videoNotSupported')}
                      </video>
                    ) : (
                      <img
                        key={lightboxImage}
                        src={lightboxImage}
                        alt={t('productDetail.reviewMedia')}
                        className="w-full max-h-[70vh] object-contain"
                        onError={() => {
                          // If image fails to load, try showing as video if URL looks like a video
                          const src = lightboxImage || ''
                          if (src.match(/\.(mp4|webm|mov|avi)($|\?)/i) || src.includes('/video/')) {
                            setLightboxAsVideo(true)
                          }
                        }}
                      />
                    )
                  })()}
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Custom Share Dialog (fallback when Web Share API is not available) ── */}
      <AnimatePresence>
        {shareDialogOpen && (
          <>
            <motion.div
              key="share-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setShareDialogOpen(false)}
            />
            <motion.div
              key="share-modal"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl pb-6"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Share Product</h3>
                <button onClick={() => setShareDialogOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              {/* Share options */}
              <div className="px-5 py-4 space-y-2">
                {/* WhatsApp */}
                <button
                  onClick={handleShareWhatsApp}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                    <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm0 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10zm5.4-7.3c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4z"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">WhatsApp</p>
                    <p className="text-xs text-gray-400">Share via WhatsApp</p>
                  </div>
                </button>
                {/* SMS */}
                <button
                  onClick={handleShareSMS}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">SMS</p>
                    <p className="text-xs text-gray-400">Share via text message</p>
                  </div>
                </button>
                {/* Email */}
                <button
                  onClick={handleShareEmail}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                    <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Email</p>
                    <p className="text-xs text-gray-400">Share via email</p>
                  </div>
                </button>
                {/* Copy Link */}
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
                    {linkCopied ? (
                      <Check className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{linkCopied ? 'Copied!' : 'Copy Link'}</p>
                    <p className="text-xs text-gray-400">{linkCopied ? 'Link copied to clipboard' : 'Copy product link to clipboard'}</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
