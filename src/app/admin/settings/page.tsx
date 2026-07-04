'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useSiteLogo } from '@/hooks/use-site-logo'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Cloud,
  CloudOff,
  Sparkles,
  FileImage,
  ArrowRight,
  RotateCcw,
  ExternalLink,
  Key,
  Settings2,
  Percent,
  IndianRupee,
  Clock,
  CalendarDays,
  Timer,
  Save,
  Receipt,
  Calculator,
  Truck,
  Building2,
  FileText,
  Banknote,
  Weight,
  Mail,
  Send,
  Server,
  Eye,
  EyeOff,
  HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Image from 'next/image'

/* ------------------------------------------------------------------ */
/*  Animation variants                                                  */
/* ------------------------------------------------------------------ */

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
}

const toastSlide = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
}

/* ------------------------------------------------------------------ */
/*  Cloudinary config status type                                       */
/* ------------------------------------------------------------------ */

interface CloudinaryStatus {
  configured: boolean
  missingVars: string[]
  cloudName: string | null
  apiKeySet: boolean
  apiSecretSet: boolean
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        {/* Page header */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
        >
          <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your website configuration and preferences.
          </p>
        </motion.div>

        {/* Cloudinary Config Section */}
        <CloudinaryConfigSection />

        {/* Logo Upload Section */}
        <LogoUploadSection />

        {/* Email / SMTP Settings Section */}
        <EmailSettingsSection />

        {/* GST & Tax Settings Section */}
        <TaxSettingsSection />

        {/* Commission & Fees Section */}
        <CommissionSettingsSection />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Cloudinary Configuration Section                                     */
/* ------------------------------------------------------------------ */

function CloudinaryConfigSection() {
  const [status, setStatus] = useState<CloudinaryStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      // Use the public upload-status endpoint (no admin auth required)
      // This avoids the 401 error that was causing "Cloudinary Not Configured" display
      const res = await fetch('/api/upload-status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch (err) {
      console.error('[Cloudinary Status] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  if (loading) {
    return (
      <motion.section initial="hidden" animate="visible" variants={fadeInUp}
        className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-6">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking Cloudinary status...
        </div>
      </motion.section>
    )
  }

  const isConfigured = status?.configured ?? false

  return (
    <motion.section initial="hidden" animate="visible" variants={staggerContainer} className="space-y-3">
      <motion.div variants={fadeInUp}
        className={`rounded-2xl border backdrop-blur-sm overflow-hidden ${
          isConfigured
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        }`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
          <div className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${
            isConfigured
              ? 'bg-emerald-500/15 text-emerald-600'
              : 'bg-amber-500/15 text-amber-600'
          }`}>
            {isConfigured ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">Cloudinary Image Storage</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              All images are stored on Cloudinary CDN
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${
            isConfigured
              ? 'bg-emerald-500/15 text-emerald-600'
              : 'bg-amber-500/15 text-amber-600'
          }`}>
            {isConfigured ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                Not Configured
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {isConfigured ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cloudinary is properly configured. Images will be uploaded to the cloud with automatic optimization, format conversion (WebP/AVIF), and CDN delivery.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Key className="h-3 w-3" />
                  Cloud: <span className="font-mono text-foreground">{status?.cloudName}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  API Key set
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  API Secret set
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
                  Image uploads are disabled
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
                  Cloudinary credentials are missing. Categories and logos cannot include images until configured. You can still create categories without images.
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Setup Instructions</h4>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">1</span>
                    <span>Sign up for a <strong className="text-foreground">free</strong> Cloudinary account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">2</span>
                    <span>Copy your credentials from the dashboard</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">3</span>
                    <span>Add them to your <code className="px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono">.env</code> file</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">4</span>
                    <span>Restart the development server</span>
                  </li>
                </ol>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add to .env file:</p>
                <code className="block text-xs font-mono text-foreground leading-relaxed whitespace-pre">CLOUDINARY_CLOUD_NAME=your_cloud_name{'\n'}CLOUDINARY_API_KEY=your_api_key{'\n'}CLOUDINARY_API_SECRET=your_api_secret</code>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="https://cloudinary.com/users/register_free"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" className="h-8 text-xs gap-1.5 rounded-lg">
                    <ExternalLink className="h-3 w-3" />
                    Sign Up Free
                  </Button>
                </a>
                <a
                  href="https://console.cloudinary.com/settings/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg">
                    <Key className="h-3 w-3" />
                    Get API Keys
                  </Button>
                </a>
              </div>

              {status?.missingVars && status.missingVars.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>Missing:</span>
                  {status.missingVars.map((v) => (
                    <span key={v} className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono">
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.section>
  )
}

/* ------------------------------------------------------------------ */
/*  Logo Upload Section — Compact & Attractive                          */
/* ------------------------------------------------------------------ */

function LogoUploadSection() {
  const { logo, loading: logoLoading, refetch } = useSiteLogo()
  const [cloudinaryReady, setCloudinaryReady] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check upload status via public endpoint
  useEffect(() => {
    fetch('/api/upload-status')
      .then(res => res.json())
      .then(data => setCloudinaryReady(data.configured))
      .catch(() => {})
  }, [])

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  const handleUpload = useCallback(
    async (file: File) => {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']
      if (!allowedTypes.includes(file.type)) {
        setMessage({ type: 'error', text: 'Invalid file type. Allowed: PNG, JPEG, WebP, SVG, GIF' })
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'File too large. Maximum size: 5 MB' })
        return
      }

      setUploading(true)
      setMessage(null)

      try {
        const formData = new FormData()
        formData.append('logo', file)
        const res = await fetch('/api/admin/logo', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        setMessage({ type: 'success', text: 'Logo uploaded successfully!' })
        await refetch()
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to upload logo' })
      } finally {
        setUploading(false)
      }
    },
    [refetch],
  )

  const handleDelete = useCallback(async () => {
    setUploading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/logo', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Delete failed')
      }
      setMessage({ type: 'success', text: 'Logo removed successfully!' })
      await refetch()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete logo' })
    } finally {
      setUploading(false)
    }
  }, [refetch])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      const files = e.dataTransfer.files
      if (files.length > 0) void handleUpload(files[0])
    },
    [handleUpload],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) void handleUpload(files[0])
      e.target.value = ''
    },
    [handleUpload],
  )

  if (logoLoading) {
    return (
      <motion.section
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-6"
      >
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading logo settings...
        </div>
      </motion.section>
    )
  }

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-3"
    >
      {/* Toast Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            variants={toastSlide}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border border-destructive/20 text-destructive'
            }`}
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

      {/* Main Card */}
      <motion.div
        variants={fadeInUp}
        className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        {/* Card Header — Compact */}
        <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">Website Logo</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Displayed across sidebar, login & public pages
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/8 text-primary text-[10px] font-medium">
            <Cloud className="h-3 w-3" />
            Cloudinary
          </div>
        </div>

        {/* Content — Compact Two-Column Layout */}
        <div className="p-5">
          {!cloudinaryReady && (
            <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Cloudinary not configured</p>
                <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70">
                  Logo upload requires Cloudinary. See the Cloudinary section above for setup instructions.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-5">
            {/* Left: Logo Preview */}
            <div className="flex flex-col items-center gap-3">
              <motion.div
                variants={scaleIn}
                className="relative"
                whileHover={{ scale: 1.04 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                {logo ? (
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary/8 to-primary/3 border border-border/30 flex items-center justify-center">
                    <Image
                      src={logo.url}
                      alt="Site Logo"
                      width={72}
                      height={72}
                      className="w-[72px] h-[72px] object-contain"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 flex items-center justify-center text-primary-foreground font-bold text-2xl">
                    RC
                  </div>
                )}
                {/* Pulse ring when logo exists */}
                {logo && (
                  <motion.div
                    className="absolute inset-0 rounded-xl border-2 border-primary/30"
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.12, opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
              </motion.div>

              {/* Logo meta — compact */}
              {logo && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center space-y-0.5"
                >
                  <p className="text-[10px] font-medium text-foreground/80">
                    {logo.width} × {logo.height}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {(logo.size / 1024).toFixed(0)} KB · {logo.format.toUpperCase()}
                  </p>
                </motion.div>
              )}
            </div>

            {/* Right: Upload + Actions */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Drop Zone — Compact */}
              <motion.div
                onDragOver={cloudinaryReady ? handleDragOver : undefined}
                onDragLeave={cloudinaryReady ? handleDragLeave : undefined}
                onDrop={cloudinaryReady ? handleDrop : undefined}
                onClick={() => cloudinaryReady && !uploading && fileInputRef.current?.click()}
                className={`relative flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-dashed transition-colors duration-200 ${
                  !cloudinaryReady
                      ? 'border-border/20 bg-muted/20 cursor-not-allowed opacity-60'
                      : dragOver
                        ? 'border-primary bg-primary/5 cursor-pointer'
                        : 'border-border/40 hover:border-primary/40 hover:bg-primary/3 cursor-pointer'
                } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
                whileHover={cloudinaryReady ? { scale: 1.01 } : undefined}
                whileTap={cloudinaryReady ? { scale: 0.99 } : undefined}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  onChange={handleFileChange}
                  disabled={!cloudinaryReady}
                  className="hidden"
                />

                {uploading ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 w-full"
                  >
                    <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                    <div>
                      <p className="text-xs font-medium">Uploading & optimizing...</p>
                      <p className="text-[10px] text-muted-foreground">Processing via Cloudinary</p>
                    </div>
                  </motion.div>
                ) : (
                  <>
                    <motion.div
                      animate={dragOver ? { scale: 1.15, rotate: -8 } : { scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0"
                    >
                      <Upload className="h-4 w-4" />
                    </motion.div>
                    <div>
                      <p className="text-xs font-medium">
                        {!cloudinaryReady ? 'Cloudinary required' : dragOver ? 'Drop it here!' : 'Drag & drop or click'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {!cloudinaryReady ? 'Configure Cloudinary first' : 'PNG, JPEG, WebP, SVG, GIF · Max 5 MB'}
                      </p>
                    </div>
                    {cloudinaryReady && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 ml-auto shrink-0" />}
                  </>
                )}
              </motion.div>

              {/* Action Buttons — Compact Row */}
              <div className="flex items-center gap-2">
                {logo ? (
                  <>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cloudinaryReady && fileInputRef.current?.click()}
                        disabled={uploading || !cloudinaryReady}
                        className="h-8 text-xs gap-1.5 rounded-lg"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Replace
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDelete}
                        disabled={uploading}
                        className="h-8 text-xs gap-1.5 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </Button>
                    </motion.div>
                  </>
                ) : (
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      size="sm"
                      onClick={() => cloudinaryReady && fileInputRef.current?.click()}
                      disabled={uploading || !cloudinaryReady}
                      className="h-8 text-xs gap-1.5 rounded-lg"
                    >
                      <Upload className="h-3 w-3" />
                      Upload Logo
                    </Button>
                  </motion.div>
                )}
              </div>

              {/* Tips — Collapsed Compact Row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
                <span className="flex items-center gap-1">
                  <FileImage className="h-2.5 w-2.5" />
                  Square images work best
                </span>
                <span className="flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  Auto-optimized via CDN
                </span>
                <span className="flex items-center gap-1">
                  <Cloud className="h-2.5 w-2.5" />
                  Stored on Cloudinary
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.section>
  )
}

/* ------------------------------------------------------------------ */
/*  GST & Tax Settings Section                                          */
/* ------------------------------------------------------------------ */

function TaxSettingsSection() {
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/tax-settings')
      if (res.ok) {
        const data = await res.json()
        setSettings({
          isTaxInclusive: data.isTaxInclusive ?? DEFAULT_TAX_SETTINGS.isTaxInclusive,
          defaultGstRate: data.defaultGstRate ?? DEFAULT_TAX_SETTINGS.defaultGstRate,
          platformGstin: data.platformGstin ?? DEFAULT_TAX_SETTINGS.platformGstin,
          enableGstInvoice: data.enableGstInvoice ?? DEFAULT_TAX_SETTINGS.enableGstInvoice,
          tdsRate: data.tdsRate ?? DEFAULT_TAX_SETTINGS.tdsRate,
          tcsRate: data.tcsRate ?? DEFAULT_TAX_SETTINGS.tcsRate,
          gstOnCommissionRate: data.gstOnCommissionRate ?? DEFAULT_TAX_SETTINGS.gstOnCommissionRate,
          codFee: data.codFee ?? DEFAULT_TAX_SETTINGS.codFee,
          platformFee: data.platformFee ?? DEFAULT_TAX_SETTINGS.platformFee,
          deliveryBaseCharge: data.deliveryBaseCharge ?? DEFAULT_TAX_SETTINGS.deliveryBaseCharge,
          freeDeliveryAbove: data.freeDeliveryAbove ?? DEFAULT_TAX_SETTINGS.freeDeliveryAbove,
          deliveryPer500g: data.deliveryPer500g ?? DEFAULT_TAX_SETTINGS.deliveryPer500g,
          deliveryBaseWeight: data.deliveryBaseWeight ?? DEFAULT_TAX_SETTINGS.deliveryBaseWeight,
          updatedAt: data.updatedAt ?? null,
        })
      }
    } catch (err) {
      console.error('[Tax Settings] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  const handleNumberChange = useCallback((key: keyof TaxSettings, value: string) => {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      setSettings(prev => ({ ...prev, [key]: num }))
    }
  }, [])

  const handleSave = useCallback(async () => {
    // Client-side GSTIN validation
    if (settings.platformGstin) {
      const gstin = settings.platformGstin.trim().toUpperCase()
      if (gstin.length !== 15 || !/^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
        setMessage({ type: 'error', text: 'Invalid GSTIN format. Must be a valid 15-character GSTIN.' })
        return
      }
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/tax-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isTaxInclusive: settings.isTaxInclusive,
          defaultGstRate: settings.defaultGstRate,
          platformGstin: settings.platformGstin.trim().toUpperCase(),
          enableGstInvoice: settings.enableGstInvoice,
          tdsRate: settings.tdsRate,
          tcsRate: settings.tcsRate,
          gstOnCommissionRate: settings.gstOnCommissionRate,
          codFee: settings.codFee,
          platformFee: settings.platformFee,
          deliveryBaseCharge: settings.deliveryBaseCharge,
          freeDeliveryAbove: settings.freeDeliveryAbove,
          deliveryPer500g: settings.deliveryPer500g,
          deliveryBaseWeight: settings.deliveryBaseWeight,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')
      setSettings(prev => ({ ...prev, updatedAt: data.updatedAt }))
      setMessage({ type: 'success', text: 'Tax settings saved successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }, [settings])

  if (loading) {
    return (
      <motion.section
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-6"
      >
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tax settings...
        </div>
      </motion.section>
    )
  }

  const taxNumberFields: {
    key: keyof TaxSettings
    label: string
    description: string
    suffix: string
    icon: React.ComponentType<{ className?: string }>
    min: number
    max: number
    step: number
    color: string
  }[] = [
    {
      key: 'tdsRate',
      label: 'TDS Rate',
      description: 'Section 194-O',
      suffix: '%',
      icon: Calculator,
      min: 0,
      max: 5,
      step: 0.1,
      color: 'amber',
    },
    {
      key: 'tcsRate',
      label: 'TCS Rate',
      description: 'Section 52 of IGST Act',
      suffix: '%',
      icon: Calculator,
      min: 0,
      max: 5,
      step: 0.1,
      color: 'violet',
    },
    {
      key: 'gstOnCommissionRate',
      label: 'GST on Commission',
      description: 'GST applied on platform commission',
      suffix: '%',
      icon: Percent,
      min: 0,
      max: 28,
      step: 0.5,
      color: 'emerald',
    },
    {
      key: 'codFee',
      label: 'COD Convenience Fee',
      description: 'Extra charge for cash on delivery',
      suffix: '₹',
      icon: Banknote,
      min: 0,
      max: 9999,
      step: 1,
      color: 'rose',
    },
    {
      key: 'platformFee',
      label: 'Platform Fee',
      description: 'Per-order platform handling charge',
      suffix: '₹',
      icon: IndianRupee,
      min: 0,
      max: 9999,
      step: 1,
      color: 'sky',
    },
    {
      key: 'deliveryBaseCharge',
      label: 'Delivery Base Charge',
      description: 'Base delivery fee per order',
      suffix: '₹',
      icon: Truck,
      min: 0,
      max: 9999,
      step: 1,
      color: 'amber',
    },
    {
      key: 'freeDeliveryAbove',
      label: 'Free Delivery Above',
      description: 'Orders above this amount get free delivery',
      suffix: '₹',
      icon: IndianRupee,
      min: 0,
      max: 99999,
      step: 1,
      color: 'emerald',
    },
    {
      key: 'deliveryPer500g',
      label: 'Delivery Charge per 500g',
      description: 'Extra charge per 500g above base weight',
      suffix: '₹',
      icon: Weight,
      min: 0,
      max: 9999,
      step: 1,
      color: 'violet',
    },
    {
      key: 'deliveryBaseWeight',
      label: 'Delivery Base Weight',
      description: 'Weight covered by base delivery charge',
      suffix: 'g',
      icon: Weight,
      min: 100,
      max: 10000,
      step: 100,
      color: 'sky',
    },
  ]

  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/20' },
    sky: { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/20' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/20' },
  }

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-3"
    >
      {/* Toast Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            variants={toastSlide}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border border-destructive/20 text-destructive'
            }`}
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

      {/* Main Card */}
      <motion.div
        variants={fadeInUp}
        className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        {/* Card Header */}
        <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500/15 to-amber-500/5 text-amber-600 shrink-0">
            <Receipt className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">GST & Tax Settings</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Configure GST rates, TDS/TCS, invoices & delivery charges
            </p>
          </div>
          {settings.updatedAt && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground text-[10px] font-medium">
              <Clock className="h-3 w-3" />
              Updated {new Date(settings.updatedAt).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* ---- GST Configuration ---- */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3 flex items-center gap-1.5">
              <Building2 className="h-3 w-3" />
              GST Configuration
            </p>
            <div className="space-y-4">
              {/* Pricing Mode Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.emerald.bg} ${colorClasses.emerald.text} shrink-0`}>
                    <Receipt className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs font-medium leading-tight">Pricing Mode</Label>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {settings.isTaxInclusive ? 'Tax is included in listed prices' : 'Tax is added on top of listed prices'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={`text-[11px] font-medium ${!settings.isTaxInclusive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Exclusive
                  </span>
                  <Switch
                    checked={settings.isTaxInclusive}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, isTaxInclusive: checked }))}
                    disabled={saving}
                  />
                  <span className={`text-[11px] font-medium ${settings.isTaxInclusive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Inclusive
                  </span>
                </div>
              </div>

              {/* Default GST Rate Select */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.amber.bg} ${colorClasses.amber.text} shrink-0`}>
                    <Percent className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs font-medium leading-tight">Default GST Rate</Label>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Applied when product has no specific rate
                    </p>
                  </div>
                </div>
                <Select
                  value={String(settings.defaultGstRate)}
                  onValueChange={(val) => setSettings(prev => ({ ...prev, defaultGstRate: parseFloat(val) }))}
                  disabled={saving}
                >
                  <SelectTrigger className="h-9 text-sm font-mono w-[180px]" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATE_OPTIONS.map((rate) => (
                      <SelectItem key={rate} value={String(rate)}>
                        {rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Platform GSTIN */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.sky.bg} ${colorClasses.sky.text} shrink-0`}>
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs font-medium leading-tight">Platform GSTIN</Label>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Your business GST Identification Number
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="text"
                    value={settings.platformGstin}
                    onChange={(e) => setSettings(prev => ({ ...prev, platformGstin: e.target.value.toUpperCase() }))}
                    placeholder="e.g. 22AAAAA0000A1Z5"
                    maxLength={15}
                    className="h-9 text-sm font-mono max-w-[220px]"
                    disabled={saving}
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {settings.platformGstin.length}/15 chars
                  </span>
                </div>
              </div>

              {/* Enable GST Invoices Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${colorClasses.violet.bg} ${colorClasses.violet.text} shrink-0`}>
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs font-medium leading-tight">Enable GST Invoices</Label>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Auto-generate GST invoices for orders
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={`text-[11px] font-medium ${!settings.enableGstInvoice ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Off
                  </span>
                  <Switch
                    checked={settings.enableGstInvoice}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enableGstInvoice: checked }))}
                    disabled={saving}
                  />
                  <span className={`text-[11px] font-medium ${settings.enableGstInvoice ? 'text-foreground' : 'text-muted-foreground'}`}>
                    On
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ---- TDS / TCS / Commission GST ---- */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3 flex items-center gap-1.5">
              <Calculator className="h-3 w-3" />
              TDS / TCS / Commission GST
            </p>
            <div className="space-y-4">
              {taxNumberFields.slice(0, 3).map((field) => {
                const Icon = field.icon
                const colors = colorClasses[field.color] ?? colorClasses.emerald
                return (
                  <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                      <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${colors.bg} ${colors.text} shrink-0`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <Label className="text-xs font-medium leading-tight">{field.label}</Label>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{field.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1 max-w-[180px]">
                        <Input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={settings[field.key] as number}
                          onChange={(e) => handleNumberChange(field.key, e.target.value)}
                          className="h-9 text-sm font-mono pr-12"
                          disabled={saving}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none">
                          {field.suffix}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {field.min}–{field.max}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ---- Fees & Delivery ---- */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3 flex items-center gap-1.5">
              <Truck className="h-3 w-3" />
              Fees & Delivery
            </p>
            <div className="space-y-4">
              {taxNumberFields.slice(3).map((field) => {
                const Icon = field.icon
                const colors = colorClasses[field.color] ?? colorClasses.emerald
                return (
                  <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                      <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${colors.bg} ${colors.text} shrink-0`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <Label className="text-xs font-medium leading-tight">{field.label}</Label>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{field.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1 max-w-[180px]">
                        <Input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={settings[field.key] as number}
                          onChange={(e) => handleNumberChange(field.key, e.target.value)}
                          className="h-9 text-sm font-mono pr-12"
                          disabled={saving}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none">
                          {field.suffix}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {field.min}–{field.max}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Divider & Save */}
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
                <span className="flex items-center gap-1">
                  <Receipt className="h-2.5 w-2.5" />
                  Indian GST compliance
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  Changes take effect immediately
                </span>
              </div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-8 text-xs gap-1.5 rounded-lg"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" />
                      Save Changes
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.section>
  )
}

/* ------------------------------------------------------------------ */
/*  Commission & Fees Section                                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Tax Settings types & defaults                                        */
/* ------------------------------------------------------------------ */

interface TaxSettings {
  isTaxInclusive: boolean
  defaultGstRate: number
  platformGstin: string
  enableGstInvoice: boolean
  tdsRate: number
  tcsRate: number
  gstOnCommissionRate: number
  codFee: number
  platformFee: number
  deliveryBaseCharge: number
  freeDeliveryAbove: number
  deliveryPer500g: number
  deliveryBaseWeight: number
  updatedAt: string | null
}

const DEFAULT_TAX_SETTINGS: TaxSettings = {
  isTaxInclusive: true,
  defaultGstRate: 18,
  platformGstin: '',
  enableGstInvoice: true,
  tdsRate: 1,
  tcsRate: 1,
  gstOnCommissionRate: 18,
  codFee: 40,
  platformFee: 5,
  deliveryBaseCharge: 49,
  freeDeliveryAbove: 499,
  deliveryPer500g: 20,
  deliveryBaseWeight: 500,
  updatedAt: null,
}

const GST_RATE_OPTIONS = [0, 0.25, 5, 12, 18, 28] as const

interface CommissionSettings {
  commissionRate: number
  deliveryFee: number
  rtoCharge: number
  returnWindowDays: number
  autoCancelHours: number
  updatedAt: string | null
}

const DEFAULT_SETTINGS: CommissionSettings = {
  commissionRate: 10,
  deliveryFee: 40,
  rtoCharge: 50,
  returnWindowDays: 7,
  autoCancelHours: 48,
  updatedAt: null,
}

const commissionFields = [
  {
    key: 'commissionRate' as const,
    label: 'Platform Commission Rate',
    description: 'Percentage taken from each sale',
    suffix: '%',
    icon: Percent,
    min: 0,
    max: 100,
    step: 0.5,
    color: 'emerald',
  },
  {
    key: 'deliveryFee' as const,
    label: 'Delivery Fee',
    description: 'Charged to customer per order',
    suffix: '₹',
    icon: IndianRupee,
    min: 0,
    max: 9999,
    step: 1,
    color: 'amber',
  },
  {
    key: 'rtoCharge' as const,
    label: 'RTO Charge (Return to Origin)',
    description: 'Charged to seller on each return (covers return logistics & processing)',
    suffix: '₹',
    icon: IndianRupee,
    min: 0,
    max: 9999,
    step: 1,
    color: 'orange',
  },
  {
    key: 'returnWindowDays' as const,
    label: 'Return Window',
    description: 'Max days after delivery for returns',
    suffix: 'days',
    icon: CalendarDays,
    min: 1,
    max: 365,
    step: 1,
    color: 'sky',
  },
  {
    key: 'autoCancelHours' as const,
    label: 'Auto-Cancel Window',
    description: 'Auto-cancel if seller doesn\'t accept',
    suffix: 'hrs',
    icon: Timer,
    min: 1,
    max: 720,
    step: 1,
    color: 'violet',
  },
] as const

function CommissionSettingsSection() {
  const [settings, setSettings] = useState<CommissionSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/commission')
      if (res.ok) {
        const data = await res.json()
        setSettings({
          commissionRate: data.commissionRate ?? DEFAULT_SETTINGS.commissionRate,
          deliveryFee: data.deliveryFee ?? DEFAULT_SETTINGS.deliveryFee,
          rtoCharge: data.rtoCharge ?? DEFAULT_SETTINGS.rtoCharge,
          returnWindowDays: data.returnWindowDays ?? DEFAULT_SETTINGS.returnWindowDays,
          autoCancelHours: data.autoCancelHours ?? DEFAULT_SETTINGS.autoCancelHours,
          updatedAt: data.updatedAt ?? null,
        })
      }
    } catch (err) {
      console.error('[Commission Settings] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  const handleChange = useCallback((key: keyof CommissionSettings, value: string) => {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      setSettings(prev => ({ ...prev, [key]: num }))
    }
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/commission', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commissionRate: settings.commissionRate,
          deliveryFee: settings.deliveryFee,
          rtoCharge: settings.rtoCharge,
          returnWindowDays: settings.returnWindowDays,
          autoCancelHours: settings.autoCancelHours,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')
      setSettings(prev => ({ ...prev, updatedAt: data.updatedAt }))
      setMessage({ type: 'success', text: 'Commission settings saved successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }, [settings])

  if (loading) {
    return (
      <motion.section
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-6"
      >
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading commission settings...
        </div>
      </motion.section>
    )
  }

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-3"
    >
      {/* Toast Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            variants={toastSlide}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border border-destructive/20 text-destructive'
            }`}
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

      {/* Main Card */}
      <motion.div
        variants={fadeInUp}
        className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        {/* Card Header */}
        <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-600 shrink-0">
            <Settings2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">Commission & Fees</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Configure platform rates, fees & policies
            </p>
          </div>
          {settings.updatedAt && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground text-[10px] font-medium">
              <Clock className="h-3 w-3" />
              Updated {new Date(settings.updatedAt).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {commissionFields.map((field) => {
            const Icon = field.icon
            const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
              emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
              amber: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
              rose: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/20' },
              sky: { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/20' },
              violet: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/20' },
            }
            const colors = colorClasses[field.color] ?? colorClasses.emerald

            return (
              <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2.5 sm:w-[260px] shrink-0">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${colors.bg} ${colors.text} shrink-0`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs font-medium leading-tight">{field.label}</Label>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{field.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1 max-w-[180px]">
                    <Input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={settings[field.key]}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="h-9 text-sm font-mono pr-12"
                      disabled={saving}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none">
                      {field.suffix}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {field.min}–{field.max}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Divider */}
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
                <span className="flex items-center gap-1">
                  <Percent className="h-2.5 w-2.5" />
                  Applied to all sellers
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  Changes take effect immediately
                </span>
              </div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-8 text-xs gap-1.5 rounded-lg"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" />
                      Save Changes
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.section>
  )
}

/* ------------------------------------------------------------------ */
/*  Email / SMTP Settings Section                                        */
/*                                                                      */
/*  Allows the admin to configure SMTP credentials from the UI so       */
/*  that order confirmation emails, invoices, credit notes, delivery    */
/*  and return notifications are actually delivered to customers.       */
/*  Without SMTP configured, all emails are queued in the DB and        */
/*  never sent.                                                         */
/* ------------------------------------------------------------------ */

interface EmailSettings {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
  smtpPassSet: boolean
  smtpFrom: string
  configured: boolean
  configuredVia: 'database' | 'env' | 'none'
  updatedAt: string | null
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  smtpPassSet: false,
  smtpFrom: '',
  configured: false,
  configuredVia: 'none',
  updatedAt: null,
}

function EmailSettingsSection() {
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [flushing, setFlushing] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [testEmailAddr, setTestEmailAddr] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/email-settings')
      if (res.ok) {
        const data = await res.json()
        setSettings({
          smtpHost: data.smtpHost || '',
          smtpPort: data.smtpPort ?? 587,
          smtpSecure: data.smtpSecure ?? false,
          smtpUser: data.smtpUser || '',
          smtpPass: '',
          smtpPassSet: data.smtpPassSet ?? false,
          smtpFrom: data.smtpFrom || '',
          configured: data.configured ?? false,
          configuredVia: data.configuredVia ?? 'none',
          updatedAt: data.updatedAt ?? null,
        })
      }
    } catch (err) {
      console.error('[Email Settings] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [message])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/email-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpSecure: settings.smtpSecure,
          smtpUser: settings.smtpUser,
          smtpPass: settings.smtpPass,
          smtpFrom: settings.smtpFrom,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save email settings')
      setMessage({ type: 'success', text: data.message || 'Email settings saved successfully!' })
      fetchSettings()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }, [settings, fetchSettings])

  const handleTest = useCallback(async () => {
    if (!testEmailAddr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailAddr)) {
      setMessage({ type: 'error', text: 'Please enter a valid email address to send a test to.' })
      return
    }
    setTesting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/email-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailAddr }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Test email failed')
      setMessage({ type: 'success', text: data.message || 'Test email sent successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send test email' })
    } finally {
      setTesting(false)
    }
  }, [testEmailAddr])

  const handleFlush = useCallback(async () => {
    setFlushing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/email-settings/flush', {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Queue flush failed')
      setMessage({ type: 'success', text: data.message || 'Email queue flushed.' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to flush queue' })
    } finally {
      setFlushing(false)
    }
  }, [])

  if (loading) {
    return (
      <motion.section
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-6"
      >
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading email settings...
        </div>
      </motion.section>
    )
  }

  const isConfigured = settings.configured
  const configuredViaDb = settings.configuredVia === 'database'
  const configuredViaEnv = settings.configuredVia === 'env'

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-3"
    >
      <AnimatePresence>
        {message && (
          <motion.div
            variants={toastSlide}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border border-destructive/20 text-destructive'
            }`}
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

      <motion.div
        variants={fadeInUp}
        className={`rounded-2xl border backdrop-blur-sm overflow-hidden ${
          isConfigured
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        }`}
      >
        <div className="px-5 py-4 border-b border-border/30 flex items-center gap-3">
          <div className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${
            isConfigured
              ? 'bg-emerald-500/15 text-emerald-600'
              : 'bg-amber-500/15 text-amber-600'
          }`}>
            {isConfigured ? <Mail className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">Email / SMTP Configuration</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Order confirmations, invoices, credit notes &amp; notifications
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${
            isConfigured
              ? 'bg-emerald-500/15 text-emerald-600'
              : 'bg-amber-500/15 text-amber-600'
          }`}>
            {isConfigured ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                {configuredViaDb ? 'DB' : configuredViaEnv ? 'ENV' : 'OK'}
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                Not Configured
              </>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {!isConfigured && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
                Emails are not being delivered
              </p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
                Without SMTP configured, all customer emails (order confirmations, invoices, credit notes, delivery/return notifications) are queued in the database but never actually sent. Configure SMTP below to enable email delivery.
              </p>
            </div>
          )}

          {/* SMTP Host */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:w-[220px] shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
                <Server className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs font-medium leading-tight">SMTP Host</Label>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">e.g. smtp.gmail.com</p>
              </div>
            </div>
            <Input
              type="text"
              placeholder="smtp.gmail.com"
              value={settings.smtpHost}
              onChange={(e) => setSettings(prev => ({ ...prev, smtpHost: e.target.value }))}
              className="h-9 text-sm flex-1 max-w-[300px]"
              disabled={saving}
            />
          </div>

          {/* SMTP Port + Secure — auto-synced (port 465 ↔ secure:true, port 587 ↔ secure:false) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:w-[220px] shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                <Key className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs font-medium leading-tight">Port &amp; Security</Label>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  587 (STARTTLS) or 465 (direct SSL)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-1">
              <Input
                type="number"
                placeholder="587"
                value={settings.smtpPort}
                onChange={(e) => {
                  const port = parseInt(e.target.value) || 587
                  // Auto-sync the secure flag to match the port:
                  //   465 → secure:true (direct TLS)
                  //   anything else → secure:false (STARTTLS)
                  // This prevents the wrong-combo TLS errors that were
                  // blocking email delivery (e.g. secure:true on port 587).
                  const secure = port === 465
                  setSettings(prev => ({ ...prev, smtpPort: port, smtpSecure: secure }))
                }}
                className="h-9 text-sm font-mono w-20"
                disabled={saving}
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={settings.smtpSecure}
                  onCheckedChange={(checked) => {
                    // Auto-sync the port to match the toggle:
                    //   secure ON  → port 465 (direct TLS)
                    //   secure OFF → port 587 (STARTTLS)
                    const port = checked ? 465 : 587
                    setSettings(prev => ({ ...prev, smtpSecure: checked, smtpPort: port }))
                  }}
                  disabled={saving}
                />
                <span className="text-xs text-muted-foreground">
                  Direct SSL (port 465)
                </span>
              </label>
            </div>
          </div>

          {/* Port/secure mismatch warning — defensive; should rarely show because of auto-sync */}
          {((settings.smtpPort === 465 && !settings.smtpSecure) ||
            ([587, 25, 2525].includes(settings.smtpPort) && settings.smtpSecure)) && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 ml-[244px] -mt-2 flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>
                Port {settings.smtpPort} requires <strong>secure={settings.smtpPort === 465 ? 'true' : 'false'}</strong>.
                Saving will auto-correct this. ({settings.smtpPort === 465 ? 'Use direct SSL/TLS' : 'Use STARTTLS'} on port {settings.smtpPort}.)
              </span>
            </div>
          )}

          {/* SMTP User */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:w-[220px] shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Mail className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs font-medium leading-tight">SMTP Username</Label>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Usually your email address</p>
              </div>
            </div>
            <Input
              type="text"
              placeholder="your-email@gmail.com"
              value={settings.smtpUser}
              onChange={(e) => setSettings(prev => ({ ...prev, smtpUser: e.target.value }))}
              className="h-9 text-sm flex-1 max-w-[300px]"
              disabled={saving}
            />
          </div>

          {/* SMTP Password (write-only) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:w-[220px] shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                <Key className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs font-medium leading-tight">SMTP Password</Label>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {settings.smtpPassSet ? 'Already set (enter new to replace)' : 'App password for Gmail'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-[300px]">
              <div className="relative flex-1">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={settings.smtpPassSet ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (kept)' : 'Enter password'}
                  value={settings.smtpPass}
                  onChange={(e) => setSettings(prev => ({ ...prev, smtpPass: e.target.value }))}
                  className="h-9 text-sm pr-9"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {settings.smtpPassSet && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Set
                </span>
              )}
            </div>
          </div>

          {/* From Address */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:w-[220px] shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <Send className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs font-medium leading-tight">From Address</Label>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  Must match SMTP user (or be a verified alias)
                </p>
              </div>
            </div>
            <Input
              type="text"
              placeholder="Realcart <realdigitaldeveloper@gmail.com>"
              value={settings.smtpFrom}
              onChange={(e) => setSettings(prev => ({ ...prev, smtpFrom: e.target.value }))}
              className="h-9 text-sm flex-1 max-w-[300px]"
              disabled={saving}
            />
          </div>

          {/* Setup guide — collapsible help */}
          <details className="group rounded-lg border border-border/40 bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer flex items-center gap-1.5 font-medium text-foreground/80 select-none">
              <HelpCircle className="h-3 w-3 inline" />
              How to configure SMTP (Gmail example)
              <span className="ml-auto text-[10px] text-muted-foreground group-open:hidden">show</span>
              <span className="ml-auto text-[10px] text-muted-foreground hidden group-open:inline">hide</span>
            </summary>
            <ol className="mt-2 space-y-1.5 pl-5 list-decimal leading-relaxed">
              <li>Use a Gmail account with <strong>2-Step Verification</strong> enabled (required for App Passwords).</li>
              <li>Go to <em>Google Account → Security → App Passwords</em> and generate a 16-char password for "Mail".</li>
              <li>Set <strong>SMTP Host</strong> = <code>smtp.gmail.com</code>.</li>
              <li>Set <strong>Port</strong> = <code>587</code> (STARTTLS — recommended) or <code>465</code> (direct SSL). The toggle auto-syncs.</li>
              <li>Set <strong>Username</strong> = your Gmail address (e.g. <code>you@gmail.com</code>).</li>
              <li>Set <strong>Password</strong> = the 16-char App Password (NOT your Gmail password). Format: <code>xxxx xxxx xxxx xxxx</code> (spaces optional).</li>
              <li>Set <strong>From Address</strong> = <code>Your Brand &lt;you@gmail.com&gt;</code> (must match the SMTP user).</li>
              <li>Click <strong>Save Settings</strong>. The queue of pending emails (order confirmations, invoices, credit notes) auto-flushes on save.</li>
              <li>Click <strong>Test</strong> with your own email to verify delivery (check spam folder on first send).</li>
            </ol>
            <p className="mt-2 text-[10px] text-muted-foreground/80">
              The system auto-corrects port↔secure mismatches, forces IPv4 to avoid IPv6 unreachable errors, and retries failed emails. Common errors are explained in the dev log.
            </p>
          </details>

          {/* Divider */}
          <div className="border-t border-border/30 pt-4 space-y-3">
            {/* Test Email Row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:w-[220px] shrink-0">
                <span className="text-xs font-medium text-muted-foreground">Send Test Email</span>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="email"
                  placeholder="test@example.com"
                  value={testEmailAddr}
                  onChange={(e) => setTestEmailAddr(e.target.value)}
                  className="h-9 text-sm flex-1 max-w-[220px]"
                  disabled={testing}
                />
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTest}
                    disabled={testing || !isConfigured}
                    className="h-8 text-xs gap-1.5 rounded-lg"
                  >
                    {testing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Test
                  </Button>
                </motion.div>
              </div>
            </div>

            {/* Action Row */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap items-center gap-2">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFlush}
                    disabled={flushing || !isConfigured}
                    className="h-8 text-xs gap-1.5 rounded-lg"
                  >
                    {flushing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Flush Queue
                  </Button>
                </motion.div>
                <span className="text-[10px] text-muted-foreground">
                  Sends all queued emails (created before SMTP was configured)
                </span>
              </div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-8 text-xs gap-1.5 rounded-lg"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" />
                      Save Settings
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.section>
  )
}
