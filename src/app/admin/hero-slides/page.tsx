'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Upload,
  GripVertical,
  ExternalLink,
  ImageIcon,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import AdminModal, {
  AdminDeleteModal,
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface HeroSlide {
  _id: string
  title: string
  imageUrl: string | null
  imagePublicId: string | null
  redirectUrl: string
  status: 'Active' | 'Draft'
  displayOrder: number
  startDate: string | null
  endDate: string | null
  createdAt: string | null
  updatedAt: string | null
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                   */
/* ------------------------------------------------------------------ */

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const toastSlide = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function HeroSlidesPage() {
  const { authenticated, loading: authLoading } = useAdminAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.replace('/admin')
    }
  }, [authenticated, authLoading, router])

  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  if (!authenticated) return null

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <HeroSlidesContent />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Hero Slides Content                                                  */
/* ------------------------------------------------------------------ */

function HeroSlidesContent() {
  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [cloudinaryReady, setCloudinaryReady] = useState(false)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [editingSlide, setEditingSlide] = useState<HeroSlide | null>(null)
  const [deletingSlide, setDeletingSlide] = useState<HeroSlide | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form states — only 4 fields: title, image, redirectUrl, dates
  const [formTitle, setFormTitle] = useState('')
  const [formRedirectUrl, setFormRedirectUrl] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null)
  const [formImageFile, setFormImageFile] = useState<File | null>(null)
  const [formImageRemoved, setFormImageRemoved] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  // Fetch slides
  const fetchSlides = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/hero-slides')
      if (!res.ok) throw new Error('Failed to fetch slides')
      const data = await res.json()
      setSlides(data.slides || [])
      setCloudinaryReady(data.cloudinaryConfigured ?? false)
    } catch (err) {
      console.error('Fetch error:', err)
      setMessage({ type: 'error', text: 'Failed to load hero slides' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSlides()
  }, [fetchSlides])

  // Reset form
  const resetForm = useCallback(() => {
    setFormTitle('')
    setFormRedirectUrl('')
    setFormStartDate('')
    setFormEndDate('')
    setFormImagePreview(null)
    setFormImageFile(null)
    setFormImageRemoved(false)
  }, [])

  // Fill form for editing
  const fillForm = useCallback((slide: HeroSlide) => {
    setFormTitle(slide.title)
    setFormRedirectUrl(slide.redirectUrl)
    setFormStartDate(slide.startDate ? slide.startDate.slice(0, 10) : '')
    setFormEndDate(slide.endDate ? slide.endDate.slice(0, 10) : '')
    setFormImagePreview(slide.imageUrl)
    setFormImageFile(null)
    setFormImageRemoved(false)
  }, [])

  // Image handling
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFormImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setFormImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const removeImage = () => {
    setFormImagePreview(null)
    setFormImageFile(null)
    setFormImageRemoved(true)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  // Create slide
  const handleCreate = async () => {
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('title', formTitle)
      formData.append('redirectUrl', formRedirectUrl)
      formData.append('startDate', formStartDate)
      formData.append('endDate', formEndDate)
      if (formImageFile) formData.append('image', formImageFile)

      const res = await fetch('/api/admin/hero-slides', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create slide')

      setMessage({ type: 'success', text: `Slide "${formTitle}" created successfully` })
      setCreateOpen(false)
      resetForm()
      fetchSlides()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create slide' })
    } finally {
      setSubmitting(false)
    }
  }

  // Edit slide
  const handleEdit = async () => {
    if (!editingSlide) return
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('_id', editingSlide._id)
      formData.append('title', formTitle)
      formData.append('redirectUrl', formRedirectUrl)
      formData.append('startDate', formStartDate)
      formData.append('endDate', formEndDate)
      if (formImageFile) formData.append('image', formImageFile)
      if (formImageRemoved) formData.append('removeImage', 'true')

      const res = await fetch('/api/admin/hero-slides', { method: 'PUT', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update slide')

      setMessage({ type: 'success', text: `Slide "${formTitle}" updated successfully` })
      setEditOpen(false)
      resetForm()
      fetchSlides()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update slide' })
    } finally {
      setSubmitting(false)
    }
  }

  // Delete slide
  const handleDelete = async () => {
    if (!deletingSlide) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/hero-slides', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: deletingSlide._id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete slide')

      setMessage({ type: 'success', text: `Slide "${deletingSlide.title}" deleted` })
      setDeleteOpen(false)
      setDeletingSlide(null)
      fetchSlides()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete slide' })
    } finally {
      setSubmitting(false)
    }
  }

  // Open edit dialog
  const openEdit = (slide: HeroSlide) => {
    setEditingSlide(slide)
    fillForm(slide)
    setEditOpen(true)
  }

  // Open delete dialog
  const openDelete = (slide: HeroSlide) => {
    setDeletingSlide(slide)
    setDeleteOpen(true)
  }

  // Open create dialog
  const openCreate = () => {
    resetForm()
    setCreateOpen(true)
  }

  // Check if create form is valid (title + image required)
  const isCreateValid = formTitle.trim() && (formImageFile || formImagePreview)

  // Check if edit form is valid (title required; image optional since it may already exist)
  const isEditValid = formTitle.trim() && (formImageFile || formImagePreview || !formImageRemoved)

  return (
    <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.05 } } }}>
      {/* Toast */}
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
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span className="flex-1">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-current opacity-50 hover:opacity-100 transition-opacity">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Hero Slides</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload predesigned banner images for the customer home page hero slider.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={fetchSlides}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.button>
        </div>
        <motion.div className="flex items-center gap-2">
          {slides.length > 1 && (
            <Button
              onClick={() => setReorderOpen(true)}
              variant="outline"
              className="gap-2 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              title="Drag and drop to reorder slides"
            >
              <GripVertical className="h-4 w-4" />
              Reorder
            </Button>
          )}
          <Button
            onClick={openCreate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-lg shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Create Slide
          </Button>
        </motion.div>
      </motion.div>

      {/* Cloudinary warning */}
      {!cloudinaryReady && (
        <motion.div variants={fadeInUp} className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Cloudinary is not configured. Slide image uploads require Cloudinary setup in the environment variables.
          </p>
        </motion.div>
      )}

      {/* Slides Grid */}
      <motion.div variants={fadeInUp} className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : slides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No hero slides yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 mb-4">Upload your first predesigned banner image to appear on the customer home page.</p>
            <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-lg">
              <Plus className="h-4 w-4" />
              Create First Slide
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {slides.map((slide, idx) => (
              <SlideCard
                key={slide._id}
                slide={slide}
                index={idx}
                onEdit={() => openEdit(slide)}
                onDelete={() => openDelete(slide)}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* Create Dialog */}
      <AdminModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        type="form"
        size="lg"
        title="Create New Hero Slide"
      >
        <SlideForm
          formTitle={formTitle} setFormTitle={setFormTitle}
          formRedirectUrl={formRedirectUrl} setFormRedirectUrl={setFormRedirectUrl}
          formStartDate={formStartDate} setFormStartDate={setFormStartDate}
          formEndDate={formEndDate} setFormEndDate={setFormEndDate}
          formImagePreview={formImagePreview}
          onImageChange={handleImageChange}
          onRemoveImage={removeImage}
          imageInputRef={imageInputRef}
          cloudinaryReady={cloudinaryReady}
          isEdit={false}
        />
        <div className="flex items-center justify-end gap-2 mt-6">
          <ModalCancelButton onClick={() => { setCreateOpen(false); resetForm() }} disabled={submitting} />
          <ModalSubmitButton onClick={handleCreate} loading={submitting} disabled={!isCreateValid}>
            Create Slide
          </ModalSubmitButton>
        </div>
      </AdminModal>

      {/* Edit Dialog */}
      <AdminModal
        open={editOpen}
        onOpenChange={setEditOpen}
        type="form"
        size="lg"
        title="Edit Hero Slide"
      >
        <SlideForm
          formTitle={formTitle} setFormTitle={setFormTitle}
          formRedirectUrl={formRedirectUrl} setFormRedirectUrl={setFormRedirectUrl}
          formStartDate={formStartDate} setFormStartDate={setFormStartDate}
          formEndDate={formEndDate} setFormEndDate={setFormEndDate}
          formImagePreview={formImagePreview}
          onImageChange={handleImageChange}
          onRemoveImage={removeImage}
          imageInputRef={imageInputRef}
          cloudinaryReady={cloudinaryReady}
          isEdit={true}
        />
        <div className="flex items-center justify-end gap-2 mt-6">
          <ModalCancelButton onClick={() => { setEditOpen(false); resetForm() }} disabled={submitting} />
          <ModalSubmitButton onClick={handleEdit} loading={submitting} disabled={!isEditValid}>
            Save Changes
          </ModalSubmitButton>
        </div>
      </AdminModal>

      {/* Delete Dialog */}
      <AdminDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName="hero slide"
        name={deletingSlide?.title || ''}
        submitting={submitting}
        onDelete={handleDelete}
        onCancel={() => { setDeleteOpen(false); setDeletingSlide(null) }}
      />

      {/* Reorder Modal */}
      <ReorderSlidesModal
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        slides={slides}
        onMessage={setMessage}
        onSaved={fetchSlides}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Slide Card — preview card shown in the grid                         */
/* ------------------------------------------------------------------ */

function SlideCard({ slide, index, onEdit, onDelete }: {
  slide: HeroSlide
  index: number
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      variants={fadeInUp}
      className="group rounded-xl border border-border/60 bg-card overflow-hidden hover:shadow-lg transition-shadow"
    >
      {/* Image Preview */}
      <div className="relative aspect-[2.1/1] overflow-hidden bg-muted/30">
        {slide.imageUrl ? (
          <img
            src={slide.imageUrl}
            alt={slide.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}

        {/* Position badge */}
        <div className="absolute top-2 left-2 h-6 w-6 rounded-full bg-black/60 text-white text-[11px] font-bold flex items-center justify-center backdrop-blur-sm">
          {index + 1}
        </div>

        {/* Scheduling indicator */}
        {(slide.startDate || slide.endDate) && (
          <div className="absolute top-2 right-2 h-6 px-2 rounded-full bg-blue-500/80 text-white text-[10px] font-medium flex items-center gap-1 backdrop-blur-sm" title="Scheduled">
            <Calendar className="h-3 w-3" />
            {(slide.startDate ? new Date(slide.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '')}
            {(slide.startDate && slide.endDate) ? ' - ' : ''}
            {(slide.endDate ? new Date(slide.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '')}
          </div>
        )}
      </div>

      {/* Footer with title + redirect + actions */}
      <div className="p-3 border-t border-border/40">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">{slide.title}</h3>
            {slide.redirectUrl ? (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{slide.redirectUrl}</span>
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">No redirect link</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Slide Form — simplified: title, image, redirect URL, dates          */
/* ------------------------------------------------------------------ */

function SlideForm({
  formTitle, setFormTitle,
  formRedirectUrl, setFormRedirectUrl,
  formStartDate, setFormStartDate,
  formEndDate, setFormEndDate,
  formImagePreview,
  onImageChange,
  onRemoveImage,
  imageInputRef,
  cloudinaryReady,
  isEdit,
}: {
  formTitle: string; setFormTitle: (v: string) => void
  formRedirectUrl: string; setFormRedirectUrl: (v: string) => void
  formStartDate: string; setFormStartDate: (v: string) => void
  formEndDate: string; setFormEndDate: (v: string) => void
  formImagePreview: string | null
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: () => void
  imageInputRef: React.RefObject<HTMLInputElement>
  cloudinaryReady: boolean
  isEdit: boolean
}) {
  return (
    <div className="space-y-4">
      {/* ── Image Upload (required for create, optional for edit) ── */}
      <div>
        <Label className="text-xs font-medium mb-1.5 block">
          Slide Image {isEdit ? '(optional — leave to keep existing)' : '*'} 
        </Label>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'relative w-40 h-20 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors flex-shrink-0',
              formImagePreview
                ? 'border-emerald-300 dark:border-emerald-700'
                : 'border-border/50 hover:border-emerald-400/50 hover:bg-accent/30'
            )}
            onClick={() => imageInputRef.current?.click()}
          >
            {formImagePreview ? (
              <img src={formImagePreview} alt="Slide preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-0.5">
                <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                <span className="text-[9px] text-muted-foreground">Click to upload</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onImageChange}
              className="hidden"
            />
            <p className="text-[11px] text-muted-foreground mb-1.5">
              Upload a high-resolution predesigned banner. Recommended: <strong>1600×800px</strong> (2:1 ratio). PNG, JPEG, WebP, GIF. Max 10MB.
            </p>
            <p className="text-[10px] text-muted-foreground/70 mb-2">
              The image is shown as-is on the customer home page — design your banner with all text, graphics, and branding baked in.
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => imageInputRef.current?.click()}
                className="text-xs h-7 gap-1.5"
                disabled={!cloudinaryReady}
              >
                <Upload className="h-3 w-3" />
                {formImagePreview ? 'Change Image' : 'Upload Image'}
              </Button>
              {formImagePreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRemoveImage}
                  className="text-xs h-7 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                >
                  <X className="h-3 w-3" />
                  Remove
                </Button>
              )}
            </div>
            {!cloudinaryReady && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                Cloudinary not configured — image upload disabled
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Title (internal identifier) ── */}
      <div>
        <Label className="text-xs font-medium mb-1.5 block">Title (to identify this slide) *</Label>
        <Input
          value={formTitle}
          onChange={(e) => setFormTitle(e.target.value)}
          placeholder="e.g., Summer Sale Banner, Diwali Mega Offer, etc."
          className="bg-background"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          This title is only for admin identification — it is NOT shown to customers.
        </p>
      </div>

      {/* ── Redirect URL (where to navigate on click) ── */}
      <div>
        <Label className="text-xs font-medium mb-1.5 block">Redirect to Page (on click)</Label>
        <Input
          value={formRedirectUrl}
          onChange={(e) => setFormRedirectUrl(e.target.value)}
          placeholder="e.g., /customer?tab=products or /customer?tab=products&category=Electronics"
          className="bg-background"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          When a customer clicks the slide, they will be redirected to this page. Use internal paths (starting with /) or full URLs (https://...).
        </p>
      </div>

      {/* ── Date Scheduling ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium mb-1.5 block">Start Date (optional)</Label>
          <Input
            type="date"
            value={formStartDate}
            onChange={(e) => setFormStartDate(e.target.value)}
            className="bg-background"
          />
        </div>
        <div>
          <Label className="text-xs font-medium mb-1.5 block">End Date (optional)</Label>
          <Input
            type="date"
            value={formEndDate}
            onChange={(e) => setFormEndDate(e.target.value)}
            className="bg-background"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-2">
        Leave dates empty to always show the slide. Slides only appear within the date range (if set).
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Reorder Modal — drag-and-drop reordering of slides                  */
/* ------------------------------------------------------------------ */

function ReorderSlidesModal({
  open,
  onOpenChange,
  slides,
  onMessage,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slides: HeroSlide[]
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void
  onSaved: () => void
}) {
  const [localSlides, setLocalSlides] = useState<HeroSlide[]>([])
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (open) {
      setLocalSlides(slides)
      setHasChanges(false)
    }
  }, [open, slides])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setLocalSlides((items) => {
      const oldIndex = items.findIndex((i) => i._id === active.id)
      const newIndex = items.findIndex((i) => i._id === over.id)
      if (oldIndex === -1 || newIndex === -1) return items
      setHasChanges(true)
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  const saveOrder = async () => {
    setSaving(true)
    try {
      const items = localSlides.map((s, idx) => ({ _id: s._id, displayOrder: idx }))
      const res = await fetch('/api/admin/hero-slides', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save order')
      }
      setHasChanges(false)
      onMessage({ type: 'success', text: `Reordered ${items.length} slides` })
      onSaved()
    } catch (err) {
      onMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save order' })
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (saving) return
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="bg-background rounded-2xl shadow-2xl border border-border/60 w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <GripVertical className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Reorder Hero Slides</h3>
              <p className="text-[11px] text-muted-foreground">Drag to reorder. This affects the customer home page.</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {localSlides.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No slides to reorder</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localSlides.map((s) => s._id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {localSlides.map((slide, idx) => (
                    <SortableSlideRow key={slide._id} slide={slide} index={idx} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/40 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            {hasChanges ? '⚠ Unsaved changes — click Save to apply' : `${localSlides.length} slides`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={saving} className="rounded-lg">
              Close
            </Button>
            <Button
              size="sm"
              onClick={saveOrder}
              disabled={saving || !hasChanges}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {saving ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Save Order
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sortable Slide Row — draggable row in the reorder modal             */
/* ------------------------------------------------------------------ */

function SortableSlideRow({ slide, index }: { slide: HeroSlide; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto' as const,
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border bg-card transition-all',
        isDragging
          ? 'border-emerald-400 shadow-lg shadow-emerald-500/10'
          : 'border-border/60 hover:border-border',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Drag ${slide.title} to reorder`}
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-[11px] font-bold text-muted-foreground flex-shrink-0">
        {index + 1}
      </div>

      {/* Slide thumbnail */}
      <div className="w-20 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-muted/30">
        {slide.imageUrl ? (
          <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold truncate block">{slide.title}</span>
        {slide.redirectUrl && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
            <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{slide.redirectUrl}</span>
          </span>
        )}
      </div>
    </div>
  )
}
