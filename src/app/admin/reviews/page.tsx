'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star,
  MessageSquare,
  Eye,
  EyeOff,
  Flag,
  Shield,
  CheckCircle2,
  Package,
  ThumbsUp,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  RefreshCw,
  Calendar,
  Loader2,
  Play,
  Image as ImageIcon,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import AdminModal, {
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'
import { cn } from '@/lib/utils'

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
  productSellerId: string
  customerId: string
  customerName: string
  customerEmail: string
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
  flaggedReason: string
  createdAt: string
  updatedAt: string
  media: ReviewMedia[]
  replies: ReviewReply[]
}

interface StatusSummary {
  active: number
  hidden: number
  flagged: number
}

interface RatingSummary {
  averageRating: number
  distribution: Record<number, number>
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                   */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const toastSlide = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(isoString: string | null): string {
  if (!isoString) return '\u2014'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function shortId(id: string): string {
  return `#${id.slice(-5).toUpperCase()}`
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

function ratingColor(rating: number): string {
  if (rating >= 4) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
  if (rating >= 3) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
  return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
}

function statusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    case 'hidden':
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
    case 'flagged':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
    default:
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Active'
    case 'hidden': return 'Hidden'
    case 'flagged': return 'Flagged'
    default: return status
  }
}

function starLabel(rating: number): string {
  return `${rating}\u2605`
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function ReviewsPage() {
  const { authenticated, loading } = useAdminAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/admin')
    }
  }, [authenticated, loading, router])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <ReviewsContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Reviews Content                                                     */
/* ------------------------------------------------------------------ */

function ReviewsContent() {
  // Data state
  const [reviews, setReviews] = useState<Review[]>([])
  const [totalReviews, setTotalReviews] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [statusSummary, setStatusSummary] = useState<StatusSummary>({ active: 0, hidden: 0, flagged: 0 })
  const [ratingSummary, setRatingSummary] = useState<RatingSummary>({ averageRating: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [ratingFilter, setRatingFilter] = useState<string>('all')
  const [sortFilter, setSortFilter] = useState<string>('newest')
  const [currentPage, setCurrentPage] = useState(1)

  // Dialog states
  const [flagOpen, setFlagOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [flaggingReview, setFlaggingReview] = useState<Review | null>(null)
  const [viewingReview, setViewingReview] = useState<Review | null>(null)
  const [flagReason, setFlagReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [lightboxMedia, setLightboxMedia] = useState<ReviewMedia[]>([])

  // Message state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const itemsPerPage = 10

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch reviews                                                    */
  /* ---------------------------------------------------------------- */

  const fetchReviews = useCallback(async () => {
    setLoadingData(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (ratingFilter && ratingFilter !== 'all') params.set('rating', ratingFilter)
      params.set('sort', sortFilter)
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())

      const res = await fetch(`/api/admin/reviews?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch reviews')
      const data = await res.json()

      setReviews(data.reviews || [])
      setTotalReviews(data.pagination?.total || 0)
      setStatusSummary(data.statusSummary || { active: 0, hidden: 0, flagged: 0 })
      setRatingSummary(data.ratingSummary || { averageRating: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load reviews' })
    } finally {
      setLoadingData(false)
    }
  }, [searchQuery, statusFilter, ratingFilter, sortFilter, currentPage])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, ratingFilter, sortFilter])

  const totalPages = Math.max(1, Math.ceil(totalReviews / itemsPerPage))

  /* ---------------------------------------------------------------- */
  /*  Review actions                                                   */
  /* ---------------------------------------------------------------- */

  const handleAction = useCallback(async (reviewId: string, action: 'hide' | 'unhide' | 'flag' | 'unflag', flaggedReason?: string) => {
    setSubmitting(true)
    try {
      const body: { reviewId: string; action: string; flaggedReason?: string } = { reviewId, action }
      if (action === 'flag' && flaggedReason) {
        body.flaggedReason = flaggedReason
      }

      const res = await fetch('/api/admin/reviews', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')

      const actionLabels: Record<string, string> = {
        hide: 'hidden',
        unhide: 'restored',
        flag: 'flagged',
        unflag: 'unflagged',
      }
      setMessage({ type: 'success', text: `Review ${actionLabels[action]} successfully!` })
      fetchReviews()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Action failed' })
    } finally {
      setSubmitting(false)
    }
  }, [fetchReviews])

  const openFlagDialog = useCallback((review: Review) => {
    setFlaggingReview(review)
    setFlagReason('')
    setFlagOpen(true)
  }, [])

  const handleFlagSubmit = useCallback(() => {
    if (!flaggingReview || !flagReason.trim()) return
    handleAction(flaggingReview._id, 'flag', flagReason.trim())
    setFlagOpen(false)
    setFlaggingReview(null)
    setFlagReason('')
  }, [flaggingReview, flagReason, handleAction])

  const openViewDialog = useCallback((review: Review) => {
    setViewingReview(review)
    setViewOpen(true)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Stats computed from summary                                      */
  /* ---------------------------------------------------------------- */

  const totalAll = statusSummary.active + statusSummary.hidden + statusSummary.flagged

  const stats = [
    {
      label: 'Total Reviews',
      value: totalAll,
      icon: MessageSquare,
      color: 'text-foreground',
      bg: 'bg-muted/50',
    },
    {
      label: 'Active',
      value: statusSummary.active,
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Hidden',
      value: statusSummary.hidden,
      icon: EyeOff,
      color: 'text-gray-600 dark:text-gray-400',
      bg: 'bg-gray-500/10',
    },
    {
      label: 'Flagged',
      value: statusSummary.flagged,
      icon: Flag,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Avg. Rating',
      value: ratingSummary.averageRating || 0,
      icon: Star,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      isDecimal: true,
    },
  ]

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-5"
    >
      {/* ── Toast ── */}
      <AnimatePresence>
        {message && (
          <motion.div
            variants={toastSlide}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm shadow-lg border',
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-current opacity-50 hover:opacity-100 transition-opacity">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Reviews Management</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              View and moderate customer reviews.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={fetchReviews}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>
      </motion.div>

      {/* ── Stats Summary ── */}
      <motion.div variants={fadeInUp} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-4 flex items-center gap-3"
          >
            <div className={cn('flex items-center justify-center w-10 h-10 rounded-lg shrink-0', stat.bg)}>
              <stat.icon className={cn('h-5 w-5', stat.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
              <p className={cn('text-lg font-semibold', stat.color)}>
                {stat.isDecimal ? stat.value.toFixed(1) : stat.value.toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── Toolbar ── */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search product, customer, title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 rounded-lg bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] bg-muted/50 border-0 text-xs">
              <Shield className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
            </SelectContent>
          </Select>

          {/* Rating Filter */}
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="w-[110px] bg-muted/50 border-0 text-xs">
              <Star className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ratings</SelectItem>
              <SelectItem value="5">5 ★</SelectItem>
              <SelectItem value="4">4 ★</SelectItem>
              <SelectItem value="3">3 ★</SelectItem>
              <SelectItem value="2">2 ★</SelectItem>
              <SelectItem value="1">1 ★</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortFilter} onValueChange={setSortFilter}>
            <SelectTrigger className="w-[130px] bg-muted/50 border-0 text-xs">
              <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* ── Table ── */}
      <motion.div variants={fadeInUp} className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        {loadingData ? (
          <div className="flex items-center justify-center py-20 gap-2.5 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading reviews...
          </div>
        ) : (
          <>
            {/* Desktop table view */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rating</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {reviews.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-40 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <MessageSquare className="h-8 w-8 opacity-40" />
                            <p className="text-sm">No reviews found</p>
                            <p className="text-xs">Try adjusting your search or filters</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      reviews.map((review) => (
                        <ReviewRowDesktop
                          key={review._id}
                          review={review}
                          onView={openViewDialog}
                          onFlag={openFlagDialog}
                          onAction={handleAction}
                          submitting={submitting}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3 p-4">
              {reviews.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground py-12">
                  <MessageSquare className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No reviews found</p>
                  <p className="text-xs">Try adjusting your search or filters</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {reviews.map((review) => (
                    <ReviewCardMobile
                      key={review._id}
                      review={review}
                      onView={openViewDialog}
                      onFlag={openFlagDialog}
                      onAction={handleAction}
                      submitting={submitting}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </>
        )}

        {/* ── Pagination ── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            {loadingData ? 'Loading...' : (
              <>
                Showing {totalReviews === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}&#8211;
                {Math.min(currentPage * itemsPerPage, totalReviews)} of {totalReviews} reviews
              </>
            )}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
              Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2)
            ).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium transition-colors',
                  currentPage === page
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Flag Dialog ── */}
      <AdminModal
        open={flagOpen}
        onOpenChange={setFlagOpen}
        type="form"
        size="md"
        title="Flag Review"
        description={`Flag review by ${flaggingReview?.customerName || 'Unknown'} for moderation`}
        footer={
          <>
            <ModalCancelButton onClick={() => setFlagOpen(false)} disabled={submitting} />
            <ModalSubmitButton
              onClick={handleFlagSubmit}
              submitting={submitting}
              disabled={!flagReason.trim()}
              icon={Flag}
            >
              Flag Review
            </ModalSubmitButton>
          </>
        }
      >
        {flaggingReview && (
          <div className="space-y-4">
            {/* Review preview */}
            <div className="p-3 rounded-lg bg-muted/30 space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge className={cn('px-2 py-0.5 text-xs font-medium rounded-full', ratingColor(flaggingReview.rating))}>
                  {starLabel(flaggingReview.rating)}
                </Badge>
                <span className="text-sm font-medium">{flaggingReview.title || 'Untitled'}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {flaggingReview.comment || 'No comment'}
              </p>
            </div>

            {/* Flag reason */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Reason for flagging <span className="text-destructive">*</span>
              </label>
              <Textarea
                placeholder="Describe why this review is being flagged (e.g., inappropriate content, spam, fake review)..."
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={4}
                className="resize-none rounded-lg"
              />
              <p className="text-xs text-muted-foreground">
                This reason will be sent to the customer as a notification.
              </p>
            </div>
          </div>
        )}
      </AdminModal>

      {/* ── View Review Detail Modal ── */}
      <AdminModal
        open={viewOpen}
        onOpenChange={setViewOpen}
        type="view"
        size="lg"
        title={viewingReview?.title || 'Review Details'}
        description={viewingReview ? `${shortId(viewingReview._id)} \u00b7 ${viewingReview.productName}` : undefined}
      >
        {viewingReview && (
          <div className="space-y-4">
            {/* Rating + Status */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className={cn('px-3 py-1 text-sm font-semibold rounded-full', ratingColor(viewingReview.rating))}>
                {starLabel(viewingReview.rating)}
              </Badge>
              <Badge className={cn('px-2.5 py-0.5 text-xs font-medium rounded-full', statusColor(viewingReview.status))}>
                {statusLabel(viewingReview.status)}
              </Badge>
              {viewingReview.verified && (
                <Badge className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Verified Purchase
                </Badge>
              )}
            </div>

            {/* Product & Customer Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Product</p>
                  <p className="text-sm font-medium">{viewingReview.productName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="text-sm font-medium">{viewingReview.customerName}</p>
                  {viewingReview.customerEmail && (
                    <p className="text-xs text-muted-foreground">{viewingReview.customerEmail}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Comment */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comment</h4>
              <p className="text-sm leading-relaxed">{viewingReview.comment || 'No comment provided'}</p>
            </div>

            {/* Pros & Cons */}
            {(viewingReview.pros || viewingReview.cons) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {viewingReview.pros && (
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Pros</h4>
                    <p className="text-sm">{viewingReview.pros}</p>
                  </div>
                )}
                {viewingReview.cons && (
                  <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">Cons</h4>
                    <p className="text-sm">{viewingReview.cons}</p>
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Helpfulness & Date */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <ThumbsUp className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Helpful</p>
                  <p className="text-sm font-medium">{viewingReview.helpful}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm font-medium">{formatDate(viewingReview.createdAt)}</p>
                </div>
              </div>
              {viewingReview.variant && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Variant</p>
                    <p className="text-sm font-medium">{viewingReview.variant}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Flagged reason */}
            {viewingReview.status === 'flagged' && viewingReview.flaggedReason && (
              <>
                <Separator />
                <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive mb-1">Flag Reason</h4>
                  <p className="text-sm">{viewingReview.flaggedReason}</p>
                </div>
              </>
            )}

            {/* Media */}
            {viewingReview.media && viewingReview.media.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Media ({viewingReview.media.length})
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {viewingReview.media.map((m, idx) => (
                      <button
                        key={m._id}
                        type="button"
                        onClick={() => {
                          setLightboxMedia(viewingReview.media!)
                          setLightboxIndex(idx)
                          setLightboxOpen(true)
                        }}
                        className="relative h-24 w-24 rounded-lg overflow-hidden border border-border/40 hover:ring-2 hover:ring-amber-400 transition-all bg-muted/30 cursor-pointer group"
                      >
                        {m.mediaType === 'video' ? (
                          <>
                            {m.thumbnailUrl ? (
                              <img
                                src={m.thumbnailUrl}
                                alt="Review video"
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  const target = e.currentTarget
                                  target.style.display = 'none'
                                  const sibling = target.nextElementSibling as HTMLElement | null
                                  if (sibling) sibling.style.display = 'flex'
                                }}
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/70">
                                <Video className="h-6 w-6 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                              <Play className="h-5 w-5 text-white fill-white" />
                            </div>
                            <span className="absolute bottom-1 right-1 text-[8px] bg-black/70 text-white px-1.5 py-0.5 rounded-sm font-medium">VIDEO</span>
                          </>
                        ) : (
                          <img
                            src={m.thumbnailUrl || m.mediaUrl || m.url}
                            alt="Review media"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget
                              target.style.display = 'none'
                              const placeholder = target.nextElementSibling as HTMLElement | null
                              if (placeholder) placeholder.style.display = 'flex'
                            }}
                          />
                        )}
                        {/* Fallback placeholder for broken images */}
                        <div
                          className="absolute inset-0 bg-gradient-to-br from-muted to-muted/70 flex-col items-center justify-center gap-1 text-muted-foreground"
                          style={{ display: 'none' }}
                        >
                          <ImageIcon className="h-5 w-5" />
                          <span className="text-[8px] font-medium">Unavailable</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Seller Replies */}
            {viewingReview.replies && viewingReview.replies.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Seller Replies ({viewingReview.replies.length})
                  </h4>
                  {viewingReview.replies.map((reply) => (
                    <div key={reply._id} className="p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{reply.sellerName || 'Seller'}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(reply.createdAt)}</span>
                      </div>
                      <p className="text-sm">{reply.comment}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </AdminModal>

      {/* ── Lightbox / Media Viewer ── */}
      <AnimatePresence>
        {lightboxOpen && lightboxMedia.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxOpen(false)}
          >
            {/* Close button */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Counter badge */}
            <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-black/50 text-white text-sm font-medium">
              {lightboxIndex + 1} / {lightboxMedia.length}
            </div>

            {/* Prev button */}
            {lightboxMedia.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((prev) => (prev - 1 + lightboxMedia.length) % lightboxMedia.length)
                }}
                className="absolute left-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            {/* Next button */}
            {lightboxMedia.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((prev) => (prev + 1) % lightboxMedia.length)
                }}
                className="absolute right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
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
                  Your browser does not support the video tag.
                </video>
              ) : (
                <img
                  src={lightboxMedia[lightboxIndex]?.mediaUrl || lightboxMedia[lightboxIndex]?.url}
                  alt="Review media"
                  className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
                  onError={(e) => {
                    const target = e.currentTarget
                    target.style.display = 'none'
                    const placeholder = target.nextElementSibling as HTMLElement | null
                    if (placeholder) placeholder.style.display = 'flex'
                  }}
                />
              )}
              {/* Fallback for broken lightbox images */}
              {lightboxMedia[lightboxIndex]?.mediaType !== 'video' && (
                <div
                  className="absolute inset-0 bg-muted/90 flex-col items-center justify-center gap-3 text-muted-foreground rounded-lg"
                  style={{ display: 'none' }}
                >
                  <ImageIcon className="h-12 w-12" />
                  <p className="text-sm font-medium">Image unavailable</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Desktop Row Component                                               */
/* ------------------------------------------------------------------ */

function ReviewRowDesktop({
  review,
  onView,
  onFlag,
  onAction,
  submitting,
}: {
  review: Review
  onView: (r: Review) => void
  onFlag: (r: Review) => void
  onAction: (id: string, action: 'hide' | 'unhide' | 'flag' | 'unflag') => void
  submitting: boolean
}) {
  return (
    <motion.tr
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      className="group hover:bg-muted/30 transition-colors"
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/50 shrink-0">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[160px]">{review.productName}</p>
            <p className="text-xs text-muted-foreground font-mono">{shortId(review._id)}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate max-w-[130px]">{review.customerName}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[130px]">{review.customerEmail || '\u2014'}</p>
        </div>
      </TableCell>
      <TableCell>
        <Badge className={cn('px-2.5 py-0.5 text-xs font-semibold rounded-full', ratingColor(review.rating))}>
          {starLabel(review.rating)}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="min-w-0 max-w-[220px]">
          <p className="text-sm font-medium truncate">{review.title || 'Untitled'}</p>
          <p className="text-xs text-muted-foreground truncate">{truncateText(review.comment, 60)}</p>
          {review.hasMedia && (
            <div className="flex items-center gap-1 mt-0.5">
              <ImageIcon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Has media</span>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge className={cn('px-2.5 py-0.5 text-xs font-medium rounded-full w-fit', statusColor(review.status))}>
            {statusLabel(review.status)}
          </Badge>
          {review.verified && (
            <Badge className="px-2 py-0.5 text-[10px] font-medium rounded-full w-fit bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
              Verified
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(review.createdAt)}
      </TableCell>
      <TableCell className="text-right pr-6">
        <div className="flex items-center justify-end gap-1">
          {/* View */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onView(review)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </motion.button>

          {/* Status-based action buttons */}
          {review.status === 'active' && (
            <>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onAction(review._id, 'hide')}
                disabled={submitting}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                title="Hide Review"
              >
                <EyeOff className="h-4 w-4" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onFlag(review)}
                disabled={submitting}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                title="Flag Review"
              >
                <Flag className="h-4 w-4" />
              </motion.button>
            </>
          )}
          {review.status === 'hidden' && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onAction(review._id, 'unhide')}
              disabled={submitting}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50"
              title="Unhide Review"
            >
              <Eye className="h-4 w-4" />
            </motion.button>
          )}
          {review.status === 'flagged' && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onAction(review._id, 'unflag')}
              disabled={submitting}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-50"
              title="Unflag Review"
            >
              <Shield className="h-4 w-4" />
            </motion.button>
          )}
        </div>
      </TableCell>
    </motion.tr>
  )
}

/* ------------------------------------------------------------------ */
/*  Mobile Card Component                                               */
/* ------------------------------------------------------------------ */

function ReviewCardMobile({
  review,
  onView,
  onFlag,
  onAction,
  submitting,
}: {
  review: Review
  onView: (r: Review) => void
  onFlag: (r: Review) => void
  onAction: (id: string, action: 'hide' | 'unhide' | 'flag' | 'unflag') => void
  submitting: boolean
}) {
  return (
    <motion.div
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      className="rounded-xl border border-border/40 bg-card/80 p-4 space-y-3"
    >
      {/* Top row: product + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/50 shrink-0">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{review.productName}</p>
            <p className="text-xs text-muted-foreground">{review.customerName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge className={cn('px-2 py-0.5 text-xs font-semibold rounded-full', ratingColor(review.rating))}>
            {starLabel(review.rating)}
          </Badge>
          <Badge className={cn('px-2 py-0.5 text-xs font-medium rounded-full', statusColor(review.status))}>
            {statusLabel(review.status)}
          </Badge>
        </div>
      </div>

      {/* Review content */}
      <div className="space-y-1">
        <p className="text-sm font-medium">{review.title || 'Untitled'}</p>
        <p className="text-xs text-muted-foreground line-clamp-2">{review.comment || 'No comment'}</p>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {review.verified && (
          <Badge className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            Verified Purchase
          </Badge>
        )}
        {review.status === 'flagged' && review.flaggedReason && (
          <Badge className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
            <Flag className="h-2.5 w-2.5 mr-0.5" />
            {truncateText(review.flaggedReason, 30)}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onView(review)}
          className="h-8 text-xs gap-1.5 rounded-lg"
        >
          <Eye className="h-3.5 w-3.5" />
          View
        </Button>

        {review.status === 'active' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction(review._id, 'hide')}
              disabled={submitting}
              className="h-8 text-xs gap-1.5 rounded-lg text-gray-500 hover:text-gray-700"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Hide
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFlag(review)}
              disabled={submitting}
              className="h-8 text-xs gap-1.5 rounded-lg text-red-500 hover:text-red-700"
            >
              <Flag className="h-3.5 w-3.5" />
              Flag
            </Button>
          </>
        )}
        {review.status === 'hidden' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction(review._id, 'unhide')}
            disabled={submitting}
            className="h-8 text-xs gap-1.5 rounded-lg text-emerald-600 hover:text-emerald-700"
          >
            <Eye className="h-3.5 w-3.5" />
            Unhide
          </Button>
        )}
        {review.status === 'flagged' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction(review._id, 'unflag')}
            disabled={submitting}
            className="h-8 text-xs gap-1.5 rounded-lg text-emerald-600 hover:text-emerald-700"
          >
            <Shield className="h-3.5 w-3.5" />
            Unflag
          </Button>
        )}
      </div>
    </motion.div>
  )
}
