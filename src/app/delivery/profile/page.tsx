'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  MapPin,
  Truck,
  FileText,
  Star,
  Loader2,
  Save,
  Shield,
  CheckCircle2,
  Edit3,
  X,
  AlertCircle,
  Camera,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'
import { cn } from '@/lib/utils'
import AdminModal, {
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface DeliveryBoyProfile {
  _id: string
  name: string
  mobile: string
  status: string
  isAvailable: boolean
  vehicleType: string
  vehicleNumber: string
  profileImage: string
  profileImageMeta: { url: string; publicId: string } | null
  address: string
  aadhaarNumber: string
  panNumber: string
  role: string
  totalDeliveries: number
  rating: number
  totalRatings: number
  createdAt: string | null
  updatedAt: string | null
  lastLoginAt: string | null
}

/* ------------------------------------------------------------------ */
/*  Profile Cache — stale-while-revalidate strategy                     */
/*                                                                     */
/*  Uses in-memory + sessionStorage cache so the profile page renders   */
/*  INSTANTLY on every visit (no loading spinner). Fresh data is        */
/*  fetched silently in the background and updates the UI seamlessly.   */
/* ------------------------------------------------------------------ */

const CACHE_KEY = 'delivery_profile_v1'

interface CachedData {
  profile: DeliveryBoyProfile
  cachedAt: number
}

// Module-level in-memory cache (survives React remounts within same page lifecycle)
let memoryCache: CachedData | null = null

function readCache(): CachedData | null {
  // 1. In-memory cache (fastest — survives component remounts)
  if (memoryCache) return memoryCache

  // 2. Session storage (survives page navigations within same tab session)
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as CachedData
        // Only use cache if less than 10 minutes old
        if (Date.now() - parsed.cachedAt < 10 * 60 * 1000) {
          memoryCache = parsed
          return parsed
        }
        // Expired — remove
        sessionStorage.removeItem(CACHE_KEY)
      }
    } catch {
      // Ignore parse/storage errors
    }
  }
  return null
}

function writeCache(profile: DeliveryBoyProfile) {
  const cached: CachedData = { profile, cachedAt: Date.now() }
  memoryCache = cached
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    } catch {
      // Ignore quota errors
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Polling Configuration                                               */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL_VISIBLE = 60_000  // 60s when tab is visible (profile changes rarely)
const POLL_INTERVAL_HIDDEN  = 180_000 // 3min when tab is hidden

/* ------------------------------------------------------------------ */
/*  Toast Slide Animation                                               */
/* ------------------------------------------------------------------ */

const toastSlide = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/*  Profile Page                                                        */
/* ------------------------------------------------------------------ */

export default function DeliveryProfilePage() {
  const { user, logout, refreshSession, handleAuthFailure } = useDeliveryBoyAuth()

  // ── Initialize state with EMPTY defaults (SSR-safe — matches server render) ──
  const [profile, setProfile] = useState<DeliveryBoyProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)

  // Whether we have ANY data (from cache or fetch)
  const hasData = profile !== null

  // Use a ref for hasData to avoid it being a useCallback dependency
  // (changing hasData would recreate fetchProfile, causing polling loops)
  const hasDataRef = useRef(hasData)
  hasDataRef.current = hasData

  // Modal state
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Message state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Edit form state
  const [formData, setFormData] = useState({
    name: '',
    vehicleType: '',
    vehicleNumber: '',
    address: '',
    aadhaarNumber: '',
    panNumber: '',
  })

  // Profile image upload state
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refs for polling management
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFetchingRef = useRef(false)
  const mountedRef = useRef(false)

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  /* ---------------------------------------------------------------- */
  /*  Fetch Profile — always silent (no loading spinner)               */
  /* ---------------------------------------------------------------- */

  const fetchProfile = useCallback(async () => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const res = await fetch('/api/delivery-boy/profile', {
        signal: controller.signal,
        credentials: 'include',
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        const data = await res.json()
        setProfile(data.profile)
        setIsAvailable(data.profile.isAvailable)
        setError(null)

        // Persist to cache for instant future visits
        writeCache(data.profile)

        // Sync form data with latest profile (only if modal is closed)
        if (!editOpen) {
          setFormData({
            name: data.profile.name || '',
            vehicleType: data.profile.vehicleType || '',
            vehicleNumber: data.profile.vehicleNumber || '',
            address: data.profile.address || '',
            aadhaarNumber: data.profile.aadhaarNumber || '',
            panNumber: data.profile.panNumber || '',
          })
        }
      } else if (res.status === 401) {
        // Ask auth provider to verify the session — may be transient
        const authResult = await handleAuthFailure()
        if (authResult === 'session_valid') {
          // The 401 was transient — retry the request immediately
          isFetchingRef.current = false
          fetchProfile()
          return
        } else if (authResult === 'session_expired') {
          if (!hasDataRef.current) {
            setError('Session expired. Redirecting to login...')
          }
        } else {
          // network_error — show retry message, not "session expired"
          if (!hasDataRef.current) {
            setError('Connection issue. Retrying...')
          }
        }
      } else {
        if (!hasDataRef.current) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || 'Failed to load profile.')
        }
      }
    } catch (err) {
      if (!hasDataRef.current) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Request timed out. Please check your connection.')
        } else {
          setError('Network error. Please try again.')
        }
      }
      // On background refresh, silently keep existing data
    } finally {
      isFetchingRef.current = false
    }
  }, [handleAuthFailure, editOpen])

  /* ---------------------------------------------------------------- */
  /*  Hydrate from cache AFTER mount (prevents SSR mismatch)           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const cached = readCache()
    if (cached?.profile) {
      setProfile(cached.profile)
      setIsAvailable(cached.profile.isAvailable)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Initial fetch on mount                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    mountedRef.current = true
    fetchProfile()
    return () => {
      mountedRef.current = false
    }
  }, [fetchProfile])

  /* ---------------------------------------------------------------- */
  /*  Real-time polling with visibility-aware pause/resume             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const startPolling = (intervalMs: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        if (mountedRef.current) fetchProfile()
      }, intervalMs)
    }

    startPolling(POLL_INTERVAL_VISIBLE)

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible — immediately refresh + resume fast polling
        fetchProfile()
        startPolling(POLL_INTERVAL_VISIBLE)
      } else {
        // Tab hidden — switch to slow polling
        startPolling(POLL_INTERVAL_HIDDEN)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchProfile])

  /* ---------------------------------------------------------------- */
  /*  Open Edit Modal                                                  */
  /* ---------------------------------------------------------------- */

  const openEdit = useCallback(() => {
    setFormData({
      name: profile?.name || '',
      vehicleType: profile?.vehicleType || '',
      vehicleNumber: profile?.vehicleNumber || '',
      address: profile?.address || '',
      aadhaarNumber: profile?.aadhaarNumber || '',
      panNumber: profile?.panNumber || '',
    })
    setEditOpen(true)
  }, [profile])

  /* ---------------------------------------------------------------- */
  /*  Reset form                                                       */
  /* ---------------------------------------------------------------- */

  const resetForm = useCallback(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        vehicleType: profile.vehicleType || '',
        vehicleNumber: profile.vehicleNumber || '',
        address: profile.address || '',
        aadhaarNumber: profile.aadhaarNumber || '',
        panNumber: profile.panNumber || '',
      })
    }
  }, [profile])

  /* ---------------------------------------------------------------- */
  /*  Handle Save                                                      */
  /* ---------------------------------------------------------------- */

  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Name is required' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/delivery-boy/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update profile')

      setEditOpen(false)

      if (data.profile) {
        setProfile(data.profile)
        setIsAvailable(data.profile.isAvailable)
        writeCache(data.profile)
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' })
      fetchProfile()
      refreshSession()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }, [formData, fetchProfile, refreshSession])

  /* ---------------------------------------------------------------- */
  /*  Close edit modal                                                 */
  /* ---------------------------------------------------------------- */

  const closeEditModal = useCallback(() => {
    setEditOpen(false)
    resetForm()
  }, [resetForm])

  /* ---------------------------------------------------------------- */
  /*  Handle Profile Image Upload                                       */
  /* ---------------------------------------------------------------- */

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF' })
      return
    }

    if (file.size > 3.1 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File too large. Maximum size: 3.1 MB' })
      return
    }

    setUploading(true)
    setMessage(null)

    try {
      const formPayload = new FormData()
      formPayload.append('file', file)

      const res = await fetch('/api/delivery-boy/profile', {
        method: 'POST',
        body: formPayload,
        credentials: 'include',
      })

      const data = await res.json()

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to upload image' })
        return
      }

      // Update local profile state with new image URL
      if (data.profileImage && profile) {
        const updated = {
          ...profile,
          profileImage: data.profileImage.url,
          profileImageMeta: {
            url: data.profileImage.url,
            publicId: data.profileImage.publicId,
          },
        }
        setProfile(updated)
        writeCache(updated)
      }

      setMessage({ type: 'success', text: 'Profile image updated!' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to upload image. Please try again.' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [profile])

  /* ---------------------------------------------------------------- */
  /*  Error (only when no cached data exists at all)                   */
  /* ---------------------------------------------------------------- */

  if (error && !hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-destructive/10 text-destructive">
          <User className="h-7 w-7" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">Auto-retrying in background...</p>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Render — ALWAYS instant, never a loading spinner                 */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
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
            <button
              onClick={() => setMessage(null)}
              className="text-current opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Compact Profile Card ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            {/* Row 1: Avatar + Name/Mobile + Edit */}
            <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
              {/* Avatar with availability indicator + camera upload */}
              <button
                type="button"
                onClick={() => !uploading && fileInputRef.current?.click()}
                disabled={uploading}
                className="relative shrink-0 group"
                aria-label="Upload profile image"
              >
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-lg font-bold shadow-md ring-2 ring-background overflow-hidden">
                  {profile?.profileImage ? (
                    <img src={profile.profileImage} alt={profile.name || 'Profile'} className="h-full w-full object-cover" />
                  ) : (
                    profile?.name?.charAt(0).toUpperCase() || 'D'
                  )}
                </div>
                {/* Camera overlay */}
                <div className={cn(
                  'absolute inset-0 rounded-xl flex items-center justify-center transition-all duration-200',
                  uploading
                    ? 'bg-black/50 opacity-100'
                    : 'bg-black/0 opacity-0 group-hover:bg-black/40 group-hover:opacity-100'
                )}>
                  {uploading ? (
                    <Loader2 className="h-4 w-4 text-white animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 text-white drop-shadow-md" />
                  )}
                </div>
                {/* Availability indicator dot */}
                <div className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card flex items-center justify-center',
                  isAvailable ? 'bg-emerald-500' : 'bg-red-500'
                )}>
                  <div className="h-1 w-1 rounded-full bg-white" />
                </div>
              </button>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                onChange={handleImageUpload}
                className="hidden"
              />

              {/* Name + Mobile */}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold truncate leading-tight">{profile?.name || 'Delivery Partner'}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">+91 {profile?.mobile}</p>
              </div>

              {/* Edit button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={openEdit}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-orange-600"
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            </div>

            {/* Row 2: Full-width 3-column stats */}
            <div className="grid grid-cols-3 border-t border-border/50">
              {/* Deliveries */}
              <div className="flex flex-col items-center justify-center py-2.5 px-2 border-r border-border/50">
                <div className="flex items-center justify-center h-5 w-5 rounded-md bg-orange-100 dark:bg-orange-900/30 mb-1">
                  <Truck className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                </div>
                <p className="text-base font-bold text-foreground leading-none">{profile?.totalDeliveries || 0}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Deliveries</p>
              </div>

              {/* Rating */}
              <div className="flex flex-col items-center justify-center py-2.5 px-2 border-r border-border/50">
                <div className="flex items-center justify-center h-5 w-5 rounded-md bg-yellow-100 dark:bg-yellow-900/30 mb-1">
                  <Star className="h-3 w-3 text-yellow-600 dark:text-yellow-400 fill-yellow-500" />
                </div>
                <p className="text-base font-bold text-foreground leading-none">{profile?.rating || '-'}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{profile?.totalRatings || 0} ratings</p>
              </div>

              {/* Status */}
              <div className="flex flex-col items-center justify-center py-2.5 px-2">
                <div className={cn(
                  'flex items-center justify-center h-5 w-5 rounded-md mb-1',
                  profile?.status === 'Active'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : 'bg-red-100 dark:bg-red-900/30'
                )}>
                  <CheckCircle2 className={cn(
                    'h-3 w-3',
                    profile?.status === 'Active'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  )} />
                </div>
                <p className={cn(
                  'text-base font-bold leading-none',
                  profile?.status === 'Active'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                )}>
                  {profile?.status || 'Active'}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Status</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Vehicle Details ── */}
      <Card className="border-border/50">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <Truck className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-sm font-semibold">Vehicle</span>
        </div>
        <CardContent className="pt-1 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
              <p className="text-xs font-medium mt-0.5">
                {profile?.vehicleType ? profile.vehicleType.charAt(0).toUpperCase() + profile.vehicleType.slice(1) : 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Number</p>
              <p className="text-xs font-medium mt-0.5">{profile?.vehicleNumber || 'Not set'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Address & Documents ── */}
      <Card className="border-border/50">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <MapPin className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-sm font-semibold">Address & Documents</span>
        </div>
        <CardContent className="pt-1 pb-3 space-y-2.5">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Address</p>
            <p className="text-xs font-medium mt-0.5">{profile?.address || 'Not set'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Shield className="h-2.5 w-2.5" /> Aadhaar
              </p>
              <p className="text-xs font-medium mt-0.5">{profile?.aadhaarNumber || 'Not set'}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FileText className="h-2.5 w-2.5" /> PAN
              </p>
              <p className="text-xs font-medium mt-0.5">{profile?.panNumber || 'Not set'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Account Info ── */}
      <Card className="border-border/50">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <User className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-sm font-semibold">Account</span>
        </div>
        <CardContent className="pt-1 pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Mobile</span>
            <span className="text-xs font-medium">+91 {profile?.mobile}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Role</span>
            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0 text-[10px] px-1.5 py-0">
              Delivery Partner
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Member Since</span>
            <span className="text-xs font-medium">
              {profile?.createdAt
                ? new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : 'N/A'}
            </span>
          </div>
          {profile?.lastLoginAt && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Last Login</span>
              <span className="text-xs font-medium">
                {new Date(profile.lastLoginAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Logout ── */}
      <Button
        variant="outline"
        onClick={logout}
        className="w-full h-9 rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/30 text-xs"
      >
        Sign Out
      </Button>

      {/* ── Edit Profile Modal ── */}
      <AdminModal
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) closeEditModal()
          else setEditOpen(true)
        }}
        type="form"
        size="lg"
        title="Edit Profile"
        description="Update your delivery partner profile information"
        footer={
          <>
            <ModalCancelButton onClick={closeEditModal} disabled={saving} />
            <ModalSubmitButton onClick={handleSave} submitting={saving} icon={Save}>
              Save Changes
            </ModalSubmitButton>
          </>
        }
        submitting={saving}
      >
        <div className="space-y-5">
          {/* Personal Information Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Personal Information</h3>
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="pl-10 h-11 rounded-xl"
                  placeholder="Enter your full name"
                />
              </div>
            </div>
          </div>

          {/* Vehicle Information Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Vehicle Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Vehicle Type</Label>
                <Select value={formData.vehicleType} onValueChange={(v) => setFormData({ ...formData, vehicleType: v })}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select vehicle type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bicycle">Bicycle</SelectItem>
                    <SelectItem value="motorcycle">Motorcycle</SelectItem>
                    <SelectItem value="scooter">Scooter</SelectItem>
                    <SelectItem value="car">Car</SelectItem>
                    <SelectItem value="truck">Truck</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Vehicle Number</Label>
                <div className="relative">
                  <Truck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  <Input
                    value={formData.vehicleNumber}
                    onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                    className="pl-10 h-11 rounded-xl"
                    placeholder="MH-01-AB-1234"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Address</h3>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/50" />
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="pl-10 h-11 rounded-xl"
                  placeholder="Enter your address"
                />
              </div>
            </div>
          </div>

          {/* Documents Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Documents</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Aadhaar Number
                </Label>
                <Input
                  value={formData.aadhaarNumber}
                  onChange={(e) => setFormData({ ...formData, aadhaarNumber: e.target.value })}
                  className="h-11 rounded-xl"
                  placeholder="XXXX XXXX XXXX"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  PAN Number
                </Label>
                <Input
                  value={formData.panNumber}
                  onChange={(e) => setFormData({ ...formData, panNumber: e.target.value })}
                  className="h-11 rounded-xl"
                  placeholder="AAAAA0000A"
                />
              </div>
            </div>
          </div>
        </div>
      </AdminModal>
    </div>
  )
}
