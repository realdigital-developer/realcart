'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Star,
  MessageSquare,
  ThumbsUp,
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  Filter,
  Package,
  Image as ImageIcon,
  Play,
  Video,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface ReviewMedia {
  _id: string
  url: string
  mediaUrl: string
  publicId: string
  mediaType?: 'image' | 'video'
  thumbnailUrl?: string | null
}

interface ReviewReply {
  _id: string
  sellerId: string
  sellerName: string
  comment: string
  createdAt: string
}

interface Review {
  _id: string
  productId: string
  productName: string
  customerId: string
  customerName: string
  rating: number
  title: string
  comment: string
  pros: string
  cons: string
  verified: boolean
  variant: string
  sellerId: string
  hasMedia: boolean
  helpful: number
  notHelpful: number
  status: string
  createdAt: string
  updatedAt: string
  media: ReviewMedia[]
  replies: ReviewReply[]
}

interface RatingDistribution {
  1: number
  2: number
  3: number
  4: number
  5: number
}

interface ReviewStats {
  averageRating: number
  totalReviews: number
  ratingDistribution: RatingDistribution
  repliedCount: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
/* ------------------------------------------------------------------ */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

/* ------------------------------------------------------------------ */
/*  Rating color helper                                                 */
/* ------------------------------------------------------------------ */

function getRatingColor(rating: number): string {
  if (rating >= 4) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
  if (rating >= 3) return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800'
  return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800'
}

function getRatingStarColor(rating: number): string {
  if (rating >= 4) return 'text-emerald-500'
  if (rating >= 3) return 'text-amber-500'
  return 'text-red-500'
}

/* ------------------------------------------------------------------ */
/*  Date formatter                                                      */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loader                                                     */
/* ------------------------------------------------------------------ */

function ReviewsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-32 bg-muted animate-pulse rounded-md" />
        </div>
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>

      {/* Filters skeleton */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 w-40 bg-muted animate-pulse rounded-lg" />
      </div>

      {/* Review cards skeleton */}
      {[...Array(3)].map((_, i) => (
        <div key={i} className="p-4 sm:p-5 border rounded-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-5 w-32 bg-muted animate-pulse rounded" />
            <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
          </div>
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
          <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
          <div className="flex gap-2">
            <div className="h-16 w-16 bg-muted animate-pulse rounded-lg" />
            <div className="h-16 w-16 bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stat Card Component                                                 */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon: Icon,
  bgClass,
  textClass,
  gradientClass,
  sublabel,
}: {
  label: string
  value: string
  icon: typeof Star
  bgClass: string
  textClass: string
  gradientClass: string
  sublabel?: string
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="group relative overflow-hidden bg-card rounded-xl border border-border hover:shadow-lg transition-all duration-300 hover:border-border/80"
    >
      <div className={cn('absolute top-0 left-0 right-0 h-1 rounded-t-xl', gradientClass)} />
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', bgClass)}>
            <Icon className={cn('h-5 w-5', textClass)} />
          </div>
        </div>
        <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{value}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground">{label}</p>
          {sublabel && (
            <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
              {sublabel}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Star Display Component                                              */
/* ------------------------------------------------------------------ */

function StarDisplay({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={cn(
            sizeClass,
            star <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : star - 0.5 <= rating
                ? 'fill-amber-200 text-amber-400'
                : 'fill-muted text-muted-foreground/30'
          )}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Rating Distribution Bar                                             */
/* ------------------------------------------------------------------ */

function RatingDistributionBar({ distribution, total }: { distribution: RatingDistribution; total: number }) {
  const maxCount = Math.max(distribution[5], distribution[4], distribution[3], distribution[2], distribution[1], 1)

  return (
    <motion.div variants={itemVariants}>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Rating Distribution</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map(star => {
              const count = distribution[star as keyof RatingDistribution]
              const pct = total > 0 ? (count / total) * 100 : 0
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground w-3 text-right">{star}</span>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                  <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / maxCount) * 100}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                      className="h-full rounded-full bg-emerald-500"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {pct > 0 ? `${pct.toFixed(0)}%` : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground/60 w-6 text-right">({count})</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Review Card Component                                               */
/* ------------------------------------------------------------------ */

function ReviewCard({
  review,
  onReply,
  onMediaClick,
}: {
  review: Review
  onReply: (reviewId: string) => void
  onMediaClick: (media: ReviewMedia[], index: number) => void
}) {
  const hasReply = review.replies && review.replies.length > 0
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  const handleImageError = (mediaId: string) => {
    setFailedImages(prev => new Set(prev).add(mediaId))
  }

  return (
    <motion.div
      variants={itemVariants}
      className="group relative bg-card rounded-xl border border-border hover:shadow-md transition-all duration-200 hover:border-border/80 overflow-hidden"
    >
      <div className="p-4 sm:p-5 space-y-3">
        {/* ── Top row: Product + Rating + Verified ── */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/product/${review.productId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
            <Package className="h-3.5 w-3.5" />
            {review.productName}
          </Link>
          <Badge className={cn('text-xs font-semibold border px-2 py-0.5 rounded-full', getRatingColor(review.rating))}>
            {review.rating}★
          </Badge>
          {review.verified && (
            <Badge variant="secondary" className="gap-1 text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0">
              <ShieldCheck className="h-3 w-3" />
              Verified Purchase
            </Badge>
          )}
        </div>

        {/* ── Customer name + Date ── */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{review.customerName || 'Anonymous'}</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{formatDate(review.createdAt)}</span>
          {review.variant && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">{review.variant}</span>
            </>
          )}
        </div>

        {/* ── Stars ── */}
        <StarDisplay rating={review.rating} size="sm" />

        {/* ── Title ── */}
        {review.title && (
          <p className="text-sm font-semibold text-foreground">{review.title}</p>
        )}

        {/* ── Comment ── */}
        {review.comment && (
          <p className="text-sm text-muted-foreground leading-relaxed">{review.comment}</p>
        )}

        {/* ── Pros / Cons ── */}
        {(review.pros || review.cons) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {review.pros && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                <ThumbsUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-emerald-800 dark:text-emerald-300">{review.pros}</span>
              </div>
            )}
            {review.cons && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                <ThumbsUp className="h-3.5 w-3.5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0 rotate-180" />
                <span className="text-xs text-red-800 dark:text-red-300">{review.cons}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Media thumbnails ── */}
        {review.media && review.media.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {review.media.map((media, index) => (
              <button
                key={media._id}
                type="button"
                onClick={() => onMediaClick(review.media, index)}
                className="h-24 w-24 rounded-lg border border-border overflow-hidden hover:ring-2 hover:ring-emerald-400 transition-all relative bg-muted/30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {failedImages.has(media._id) ? (
                  <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/70 gap-1">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                    <span className="text-[8px] text-muted-foreground/50 font-medium">Unavailable</span>
                  </div>
                ) : media.mediaType === 'video' ? (
                  <>
                    {media.thumbnailUrl ? (
                      <img
                        src={media.thumbnailUrl}
                        alt="Review video"
                        className="h-full w-full object-cover"
                        onError={() => handleImageError(media._id)}
                      />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/70 gap-1">
                        <Video className="h-5 w-5 text-muted-foreground/50" />
                        <span className="text-[8px] text-muted-foreground/50 font-medium">Video</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Play className="h-5 w-5 text-white fill-white" />
                    </div>
                    <span className="absolute bottom-1 right-1 text-[8px] bg-black/70 text-white px-1.5 py-0.5 rounded font-medium">VIDEO</span>
                  </>
                ) : (
                  <img
                    src={media.thumbnailUrl || media.mediaUrl || media.url}
                    alt="Review media"
                    className="h-full w-full object-cover"
                    onError={() => handleImageError(media._id)}
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Helpful count ── */}
        {review.helpful > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ThumbsUp className="h-3 w-3" />
            <span>{review.helpful} found this helpful</span>
          </div>
        )}

        {/* ── Seller reply ── */}
        {hasReply && (
          <div className="ml-2 pl-3 border-l-2 border-emerald-300 dark:border-emerald-700 space-y-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Your Reply</span>
              <span className="text-[10px] text-muted-foreground">
                {formatDate(review.replies[0].createdAt)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{review.replies[0].comment}</p>
          </div>
        )}

        {/* ── Reply button ── */}
        {!hasReply && (
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs rounded-lg border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => onReply(review._id)}
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Reply
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Link helper (avoid top-level import conflict)                       */
/* ------------------------------------------------------------------ */

import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Main Reviews Page Component                                         */
/* ------------------------------------------------------------------ */

export default function SellerReviewsPage() {
  const { authenticated, loading, user, logout } = useSellerAuth()
  const router = useRouter()
  const { toast } = useToast()

  // ── Data state ──
  const [reviews, setReviews] = useState<Review[]>([])
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [loadingData, setLoadingData] = useState(true)

  // ── Filter state ──
  const [ratingFilter, setRatingFilter] = useState<string>('')
  const [sort, setSort] = useState<string>('newest')
  const [page, setPage] = useState(1)

  // ── Reply dialog state ──
  const [replyDialogOpen, setReplyDialogOpen] = useState(false)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)

  // ── Lightbox state ──
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [lightboxMedia, setLightboxMedia] = useState<ReviewMedia[]>([])

  // ── Auth guard ──
  useEffect(() => {
    if (!loading && !authenticated) router.replace('/seller')
  }, [authenticated, loading, router])

  // ── Fetch reviews ──
  const fetchReviews = useCallback(async () => {
    if (!authenticated) return
    setLoadingData(true)

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        sort,
      })
      if (ratingFilter) params.set('rating', ratingFilter)

      const res = await fetch(`/api/seller/reviews?${params.toString()}`)

      if (res.status === 401 || res.status === 403) {
        await logout()
        router.replace('/seller')
        return
      }

      if (!res.ok) throw new Error('Failed to fetch')

      const data = await res.json()
      setReviews(data.reviews || [])
      setStats(data.stats || null)
      setPagination(data.pagination || { page, limit: 10, total: 0, totalPages: 0 })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load reviews. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingData(false)
    }
  }, [authenticated, page, ratingFilter, sort, logout, router, toast])

  useEffect(() => {
    if (authenticated) fetchReviews()
  }, [authenticated, fetchReviews])

  // ── Reply handler ──
  const handleOpenReply = (reviewId: string) => {
    setReplyingToId(reviewId)
    setReplyText('')
    setReplyDialogOpen(true)
  }

  const handleSubmitReply = async () => {
    if (!replyingToId || !replyText.trim()) return

    setSubmittingReply(true)
    try {
      const res = await fetch('/api/seller/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: replyingToId, replyText: replyText.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit reply')
      }

      toast({
        title: 'Reply Submitted',
        description: 'Your reply has been posted successfully.',
      })

      setReplyDialogOpen(false)
      setReplyingToId(null)
      setReplyText('')

      // Refresh reviews
      await fetchReviews()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to submit reply.',
        variant: 'destructive',
      })
    } finally {
      setSubmittingReply(false)
    }
  }

  // ── Loading states ──
  if (loading || !authenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadingData && !stats) {
    return <ReviewsSkeleton />
  }

  // ── Computed values ──
  const ratingOptions = [
    { label: 'All Ratings', value: '' },
    { label: '5★', value: '5' },
    { label: '4★', value: '4' },
    { label: '3★', value: '3' },
    { label: '2★', value: '2' },
    { label: '1★', value: '1' },
  ]

  const sortOptions = [
    { label: 'Newest', value: 'newest' },
    { label: 'Oldest', value: 'oldest' },
    { label: 'Highest Rating', value: 'highest' },
    { label: 'Lowest Rating', value: 'lowest' },
  ]

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ──────────────────────── Page Header ──────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Reviews
            </h1>
            <Badge
              variant="secondary"
              className="gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs"
            >
              <Star className="h-3 w-3" />
              {stats?.totalReviews || 0} Total
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            View and reply to customer reviews for your products
          </p>
        </div>
      </motion.div>

      {/* ──────────────────────── Stats Grid ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Avg. Rating"
          value={stats && stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'}
          icon={Star}
          bgClass="bg-amber-50 dark:bg-amber-950/30"
          textClass="text-amber-600 dark:text-amber-400"
          gradientClass="bg-gradient-to-r from-amber-500 to-yellow-400"
          sublabel={stats && stats.averageRating > 0 ? 'out of 5.0' : undefined}
        />
        <StatCard
          label="Total Reviews"
          value={stats?.totalReviews?.toString() || '0'}
          icon={MessageSquare}
          bgClass="bg-blue-50 dark:bg-blue-950/30"
          textClass="text-blue-600 dark:text-blue-400"
          gradientClass="bg-gradient-to-r from-blue-500 to-cyan-400"
        />
        <StatCard
          label="Replied"
          value={stats?.repliedCount?.toString() || '0'}
          icon={Send}
          bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          textClass="text-emerald-600 dark:text-emerald-400"
          gradientClass="bg-gradient-to-r from-emerald-500 to-teal-400"
          sublabel={
            stats && stats.totalReviews > 0
              ? `${Math.round((stats.repliedCount / stats.totalReviews) * 100)}% response rate`
              : undefined
          }
        />
        <StatCard
          label="Pending Reply"
          value={
            stats
              ? (stats.totalReviews - stats.repliedCount).toString()
              : '0'
          }
          icon={Filter}
          bgClass="bg-violet-50 dark:bg-violet-950/30"
          textClass="text-violet-600 dark:text-violet-400"
          gradientClass="bg-gradient-to-r from-violet-500 to-purple-400"
        />
      </div>

      {/* ──────────────────────── Rating Distribution ──────────────────────── */}
      {stats && stats.totalReviews > 0 && (
        <RatingDistributionBar
          distribution={stats.ratingDistribution}
          total={stats.totalReviews}
        />
      )}

      {/* ──────────────────────── Filters ──────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-wrap items-center gap-3"
      >
        {/* Rating filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground mr-1">Rating:</span>
          {ratingOptions.map(opt => (
            <Button
              key={opt.value}
              variant={ratingFilter === opt.value ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-8 text-xs rounded-lg px-3',
                ratingFilter === opt.value
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                  : 'border-border hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-700 dark:hover:text-emerald-400'
              )}
              onClick={() => {
                setRatingFilter(opt.value)
                setPage(1)
              }}
            >
              {opt.value ? (
                <span className="flex items-center gap-1">
                  {opt.label}
                  <Star className="h-3 w-3 fill-current" />
                </span>
              ) : (
                opt.label
              )}
            </Button>
          ))}
        </div>

        {/* Sort select */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs font-medium text-muted-foreground">Sort:</span>
          <Select value={sort} onValueChange={(val) => { setSort(val); setPage(1) }}>
            <SelectTrigger className="h-8 w-[160px] text-xs rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* ──────────────────────── Review List ──────────────────────── */}
      {loadingData ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4 sm:p-5 border rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-16 w-16 rounded-lg" />
                <Skeleton className="h-16 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
            <MessageSquare className="h-7 w-7 text-emerald-500/60 dark:text-emerald-400/60" />
          </div>
          <p className="text-sm font-semibold text-foreground">No reviews yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
            {ratingFilter
              ? 'No reviews match the selected filter. Try a different rating.'
              : 'Customer reviews will appear here when buyers review your products.'}
          </p>
          {ratingFilter && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 text-xs rounded-lg border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => { setRatingFilter(''); setPage(1) }}
            >
              Clear Filter
            </Button>
          )}
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`${ratingFilter}-${sort}-${page}`}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {reviews.map(review => (
              <ReviewCard
                key={review._id}
                review={review}
                onReply={handleOpenReply}
                onMediaClick={(media, index) => {
                  setLightboxMedia(media)
                  setLightboxIndex(index)
                  setLightboxOpen(true)
                }}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ──────────────────────── Pagination ──────────────────────── */}
      {pagination.totalPages > 1 && (
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between"
        >
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} reviews
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg"
              disabled={pagination.page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* ──────────────────────── Reply Dialog ──────────────────────── */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Reply to Review
            </DialogTitle>
            <DialogDescription>
              Write a professional response to this customer review. Your reply will be visible publicly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              placeholder="Type your reply here..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value.slice(0, 1000))}
              rows={4}
              className="resize-none text-sm"
            />
            <div className="flex items-center justify-between">
              <p className={cn(
                'text-xs',
                replyText.length >= 950 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                replyText.length >= 1000 && 'text-red-600 dark:text-red-400'
              )}>
                {replyText.length}/1000 characters
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs rounded-lg"
              onClick={() => setReplyDialogOpen(false)}
              disabled={submittingReply}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSubmitReply}
              disabled={submittingReply || !replyText.trim()}
            >
              {submittingReply ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Submit Reply
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────── Media Lightbox ──────────────────────── */}
      <AnimatePresence>
        {lightboxOpen && lightboxMedia.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxOpen(false)}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Counter badge */}
            <div className="absolute top-4 left-4 z-10 bg-black/50 text-white text-sm px-3 py-1.5 rounded-full font-medium">
              {lightboxIndex + 1} / {lightboxMedia.length}
            </div>

            {/* Previous button */}
            {lightboxMedia.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex(prev => (prev - 1 + lightboxMedia.length) % lightboxMedia.length)
                }}
                className="absolute left-4 z-10 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            {/* Next button */}
            {lightboxMedia.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex(prev => (prev + 1) % lightboxMedia.length)
                }}
                className="absolute right-4 z-10 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}

            {/* Media content */}
            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {lightboxMedia[lightboxIndex]?.mediaType === 'video' ? (
                <video
                  src={lightboxMedia[lightboxIndex].mediaUrl || lightboxMedia[lightboxIndex].url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
                >
                  <track kind="captions" />
                </video>
              ) : (
                <img
                  src={lightboxMedia[lightboxIndex]?.mediaUrl || lightboxMedia[lightboxIndex]?.url}
                  alt="Review media"
                  className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
