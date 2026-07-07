'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  Phone,
  Mail,
  Edit3,
  Check,
  X,
  Loader2,
  Calendar,
  ShieldCheck,
  Camera,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { CustomerProfile } from './types'

export function ProfilePage({ onBack }: { onBack?: () => void } = {}) {
  const { user, refreshUser } = useCustomerAuth()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/customer/profile')
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        setProfile(data.profile)
        setForm({
          name: data.profile.name || '',
          email: data.profile.email || '',
        })
      }
    } catch (err) {
      console.error('Fetch profile error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'Failed to update profile')
        return
      }

      setProfile(data.profile)
      setEditing(false)
      setSuccess('Profile updated successfully')
      setTimeout(() => setSuccess(''), 3000)

      // ── Refresh the auth context ──────────────────────────────────
      // The account page, sidebar, navbar, etc. all read the customer
      // name from useCustomerAuth().user.name. Without refreshing the
      // session, those components would keep showing the OLD name (e.g.
      // "User 4132") until the customer logs out and back in.
      // refreshUser() re-fetches /api/auth/customer/session which now
      // reads the FRESH name from the DB.
      try {
        await refreshUser()
      } catch {
        // Non-critical — the profile DB update already succeeded
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Client-side validation
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Allowed: PNG, JPEG, WebP, GIF')
      setTimeout(() => setError(''), 3000)
      return
    }

    if (file.size > 3.1 * 1024 * 1024) {
      setError('File too large. Maximum size: 3.1 MB')
      setTimeout(() => setError(''), 3000)
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/customer/profile', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'Failed to upload image')
        setTimeout(() => setError(''), 3000)
        return
      }

      // Update local profile state with new image
      setProfile(prev => prev ? {
        ...prev,
        profileImage: data.profileImage
          ? { url: data.profileImage.url, publicId: data.profileImage.publicId }
          : null,
      } : prev)

      setSuccess('Profile image updated')
      setTimeout(() => setSuccess(''), 3000)

      // Refresh auth context so the new profile image appears in the
      // sidebar, account page, navbar, etc. immediately.
      try {
        await refreshUser()
      } catch {
        // Non-critical — the image DB update already succeeded
      }
    } catch (err) {
      setError('Failed to upload image. Please try again.')
      setTimeout(() => setError(''), 3000)
    } finally {
      setUploading(false)
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const getInitials = (name: string) => {
    if (!name) return 'U'
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  const profileImageUrl = profile?.profileImage?.url || user?.profileImage || null

  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600 px-4 pt-3 pb-16">
        {/* Back button row — shown when onBack is provided (replaces the
            old sub-tab header that was rendered by home-content-wrapper) */}
        {onBack && (
          <div className="flex items-center h-9 mb-1">
            <button
              onClick={onBack}
              className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          {/* Avatar — clickable to upload profile image */}
          <button
            onClick={() => !uploading && fileInputRef.current?.click()}
            className="relative mx-auto block"
            disabled={uploading}
          >
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold mx-auto border-2 border-white/30 overflow-hidden">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{getInitials(profile?.name || user?.name || '')}</span>
              )}
            </div>
            {/* Camera overlay */}
            <div className="absolute bottom-0 right-0 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-200">
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 text-emerald-600 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5 text-emerald-600" />
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
            onChange={handleImageUpload}
            className="hidden"
          />
          <h2 className="text-lg font-bold text-white mt-3">
            {profile?.name || user?.name || 'Customer'}
          </h2>
        </motion.div>
      </div>

      {/* Profile Card */}
      <div className="px-4 -mt-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 overflow-hidden"
        >
          <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Personal Information</h3>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 text-xs font-semibold transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                EDIT
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditing(false)
                    setForm({ name: profile?.name || '', email: profile?.email || '' })
                    setError('')
                  }}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-xs font-semibold transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  CANCEL
                </button>
              </div>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Success Message */}
            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg"
                >
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-400">{success}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
                >
                  <X className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Name Field */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase font-medium">Full Name</p>
                {editing ? (
                  <input
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Enter your name"
                    className="w-full h-10 px-3 mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">
                    {profile?.name || user?.name || 'Not set'}
                  </p>
                )}
              </div>
            </div>

            {/* Mobile Field */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Phone className="h-4 w-4 text-orange-500 dark:text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase font-medium">Mobile Number</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">
                  +91 {profile?.mobile || user?.mobile || '—'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Verified • Cannot be changed
                </p>
              </div>
            </div>

            {/* Email Field */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase font-medium">Email Address</p>
                {editing ? (
                  <input
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="Enter your email"
                    type="email"
                    className="w-full h-10 px-3 mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">
                    {profile?.email || 'Not set'}
                  </p>
                )}
              </div>
            </div>

            {/* Member Since */}
            {profile?.createdAt && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Calendar className="h-4 w-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase font-medium">Member Since</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">
                    {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          <AnimatePresence>
            {editing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-3 border-t border-gray-100 dark:border-gray-800"
              >
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim()}
                  className={cn(
                    'w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors',
                    !saving && form.name.trim()
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                  )}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  SAVE CHANGES
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
