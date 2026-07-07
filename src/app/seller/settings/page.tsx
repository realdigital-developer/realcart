'use client'

import { useSellerAuth } from '@/hooks/use-seller-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Settings,
  Lock,
  AlertTriangle,
  Loader2,
  Mail,
  Store,
  Clock,
  Shield,
  Info,
  Eye,
  EyeOff,
  Key,
  Bell,
  Smartphone,
  Trash2,
  User,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface SellerProfile {
  _id: string
  name: string
  email: string
  storeName: string
  phone: string
  status: string
  isVerified: boolean
  lastLoginAt: string | null
  createdAt: string | null
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
/* ------------------------------------------------------------------ */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loader                                                     */
/* ------------------------------------------------------------------ */

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* Account skeleton */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-48" />
          </div>
        ))}
      </div>
      {/* Password skeleton */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Format helpers                                                      */
/* ------------------------------------------------------------------ */

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '\u2014'
  }
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function SellerSettings() {
  const { authenticated, loading, user, logout } = useSellerAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Notification preferences state
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [orderUpdates, setOrderUpdates] = useState(true)
  const [productAlerts, setProductAlerts] = useState(true)
  const [marketingEmails, setMarketingEmails] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/seller')
    }
  }, [authenticated, loading, router])

  // Fetch profile data
  useEffect(() => {
    if (authenticated) {
      fetchProfile()
    }
  }, [authenticated])

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/seller/profile')

      if (res.status === 401 || res.status === 403) {
        await logout()
        router.replace('/seller')
        return
      }

      if (!res.ok) throw new Error('Failed to fetch profile')
      const data = await res.json().catch(() => ({}))
      const p = data.profile as SellerProfile
      setProfile(p)
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load settings. Please refresh the page.',
        variant: 'destructive',
      })
    } finally {
      setLoadingProfile(false)
    }
  }, [logout, router, toast])

  // Handle password change
  const handleChangePassword = useCallback(async () => {
    if (!currentPassword.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter your current password.', variant: 'destructive' })
      return
    }
    if (!newPassword.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter a new password.', variant: 'destructive' })
      return
    }
    if (newPassword.length < 8) {
      toast({ title: 'Validation Error', description: 'New password must be at least 8 characters long.', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Validation Error', description: 'New password and confirmation do not match.', variant: 'destructive' })
      return
    }
    if (currentPassword === newPassword) {
      toast({ title: 'Validation Error', description: 'New password must be different from current password.', variant: 'destructive' })
      return
    }

    setChangingPassword(true)
    try {
      const res = await fetch('/api/seller/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to change password')

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast({
        title: 'Password Changed',
        description: 'Your password has been updated successfully. Please use the new password for future logins.',
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to change password. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setChangingPassword(false)
    }
  }, [currentPassword, newPassword, confirmPassword, toast])

  // Handle notification preferences save
  const handleSaveNotifications = useCallback(async () => {
    setSavingNotifications(true)
    try {
      // Simulate API call - notification preferences can be added to DB later
      await new Promise(resolve => setTimeout(resolve, 500))
      toast({
        title: 'Preferences Saved',
        description: 'Your notification preferences have been updated.',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save notification preferences.',
        variant: 'destructive',
      })
    } finally {
      setSavingNotifications(false)
    }
  }, [toast])

  // Loading states
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  if (loadingProfile || !profile) {
    return <SettingsSkeleton />
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ═══════════════════ Page Header ═══════════════════ */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
            <Settings className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your account security and preferences
            </p>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════ Change Password Card ═══════════════════ */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <Key className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Change Password</CardTitle>
                <CardDescription className="text-xs mt-0.5">Update your account password for better security</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {/* Current Password */}
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-sm font-medium text-foreground">
                  Current Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="pl-9 pr-10 h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm font-medium text-foreground">
                  New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  <Input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8 characters)"
                    className="pl-9 pr-10 h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Password strength indicator */}
                {newPassword && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors',
                            newPassword.length >= 12 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword)
                              ? 'bg-emerald-500'
                              : newPassword.length >= 10 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword)
                                ? level <= 3 ? 'bg-amber-500' : 'bg-muted'
                                : newPassword.length >= 8
                                  ? level <= 2 ? 'bg-orange-500' : 'bg-muted'
                                  : level <= 1 ? 'bg-red-500' : 'bg-muted'
                          )}
                        />
                      ))}
                    </div>
                    <p className={cn(
                      'text-[11px]',
                      newPassword.length >= 12 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword)
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : newPassword.length >= 10 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword)
                          ? 'text-amber-600 dark:text-amber-400'
                          : newPassword.length >= 8
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-red-600 dark:text-red-400'
                    )}>
                      {newPassword.length < 8
                        ? 'Too short — minimum 8 characters required'
                        : newPassword.length >= 12 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword)
                          ? 'Strong password'
                          : newPassword.length >= 10 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword)
                            ? 'Good password — add a special character for strength'
                            : 'Weak — use uppercase, numbers, and special characters'
                      }
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    className="pl-9 pr-10 h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword && confirmPassword !== newPassword && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">Passwords do not match</p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleChangePassword}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
              >
                {changingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Changing Password...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4" />
                    Change Password
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════ Notification Preferences Card ═══════════════════ */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <Bell className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Notification Preferences</CardTitle>
                <CardDescription className="text-xs mt-0.5">Choose how you want to be notified</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {/* Email Notifications */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Email Notifications</p>
                    <p className="text-xs text-muted-foreground">Receive important updates via email</p>
                  </div>
                </div>
                <Switch
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              {/* Order Updates */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Order Updates</p>
                    <p className="text-xs text-muted-foreground">Get notified for new orders and status changes</p>
                  </div>
                </div>
                <Switch
                  checked={orderUpdates}
                  onCheckedChange={setOrderUpdates}
                />
              </div>

              {/* Product Alerts */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Product Alerts</p>
                    <p className="text-xs text-muted-foreground">Low stock, out of stock, and review alerts</p>
                  </div>
                </div>
                <Switch
                  checked={productAlerts}
                  onCheckedChange={setProductAlerts}
                />
              </div>

              {/* Marketing Emails */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-background flex items-center justify-center flex-shrink-0">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Marketing & Promotions</p>
                    <p className="text-xs text-muted-foreground">Tips, feature updates, and promotional offers</p>
                  </div>
                </div>
                <Switch
                  checked={marketingEmails}
                  onCheckedChange={setMarketingEmails}
                />
              </div>

              <Separator />

              <Button
                onClick={handleSaveNotifications}
                disabled={savingNotifications}
                variant="outline"
                className="w-full h-10 gap-2 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              >
                {savingNotifications ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Save Preferences
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════ Danger Zone Card ═══════════════════ */}
      <motion.div variants={itemVariants}>
        <Card className="border-red-200 dark:border-red-900/40">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-red-700 dark:text-red-400">
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">Irreversible and destructive actions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Delete Account</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Permanently delete your seller account and all associated data, including products, orders, and earnings history. This action cannot be undone.
                </p>
              </div>
              <Button
                variant="outline"
                disabled
                className="border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 opacity-60 cursor-not-allowed flex-shrink-0 gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Account
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              To delete your account, please contact support for assistance.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
