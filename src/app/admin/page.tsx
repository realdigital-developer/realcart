'use client'

import { useState } from 'react'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useSiteLogo } from '@/hooks/use-site-logo'
import { Eye, EyeOff, LogIn, Loader2, ShieldCheck, Fingerprint } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/admin/theme-toggle'
import Image from 'next/image'

function LoginForm({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center relative overflow-hidden p-4 sm:p-6">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-primary/5 to-background" />

      {/* Decorative orbs - smaller on mobile */}
      <div className="absolute top-1/4 -left-20 sm:-left-32 w-48 sm:w-64 h-48 sm:h-64 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 sm:-right-32 w-56 sm:w-80 h-56 sm:h-80 bg-primary/8 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-primary/3 rounded-full blur-3xl" />

      {/* Theme toggle - safe area on notched phones */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 safe-area-top-right">
        <ThemeToggle />
      </div>

      {/* Login card */}
      <div className="relative w-full max-w-md">
        {/* Glow effect behind card */}
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl" />

        <Card className="relative shadow-2xl shadow-primary/10 border-border/30 bg-card/95 backdrop-blur-sm">
          <CardHeader className="text-center space-y-4 sm:space-y-5 pb-3 pt-6 sm:pt-8 px-6 sm:px-8">
            {/* Logo with glow */}
            <LogoDisplay />

            <div className="space-y-1.5 sm:space-y-2">
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Sign in to access the RealCart admin panel
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pt-2 pb-6 sm:pb-8 px-6 sm:px-8">
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@realcart.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11 sm:h-12 rounded-xl border-border/60 bg-secondary/30 focus:bg-background transition-colors placeholder:text-muted-foreground/50 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 sm:h-12 pr-10 rounded-xl border-border/60 bg-secondary/30 focus:bg-background transition-colors placeholder:text-muted-foreground/50 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 sm:h-12 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary via-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
            </form>

            <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-border/50">
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground text-center px-2">
                <Fingerprint className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span>Secured admin access. Unauthorized attempts are logged.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Logo Display Component (used in both login and loading states)       */
/* ------------------------------------------------------------------ */

function LogoDisplay({ size = 'large' }: { size?: 'large' | 'small' }) {
  const { logo } = useSiteLogo()
  const isLarge = size === 'large'

  return (
    <div className="relative mx-auto">
      {isLarge && <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />}
      {logo ? (
        <div
          className={cn(
            'relative mx-auto flex items-center justify-center',
            isLarge ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-12 h-12',
          )}
        >
          <Image
            src={logo.url}
            alt="Site Logo"
            width={isLarge ? 80 : 48}
            height={isLarge ? 80 : 48}
            className={cn(
              'object-contain',
              isLarge ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-12 h-12',
            )}
            unoptimized
          />
        </div>
      ) : (
        <div
          className={cn(
            'relative mx-auto rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 flex items-center justify-center text-primary-foreground font-bold',
            isLarge ? 'w-14 h-14 sm:w-16 sm:h-16 text-xl sm:text-2xl' : 'w-12 h-12 text-lg',
            isLarge && 'shadow-lg shadow-primary/30',
          )}
        >
          RC
        </div>
      )}
    </div>
  )
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function AdminPage() {
  const { authenticated, loading, login } = useAdminAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-background relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative flex flex-col items-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-lg animate-pulse" />
            <LogoDisplay size="small" />
          </div>
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading session...
          </div>
        </div>
      </div>
    )
  }

  if (authenticated) {
    return null
  }

  return <LoginForm onLogin={login} />
}
