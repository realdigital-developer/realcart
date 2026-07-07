'use client'

import { useState, useEffect, useCallback } from 'react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart,
  Heart,
  ShieldCheck,
  Truck,
  RotateCcw,
  Star,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  TrendingUp,
  Eye,
  EyeOff,
  Phone,
  UserPlus,
  KeyRound,
  Lock,
  RefreshCw,
  Fingerprint,
  Loader2,
  CheckCircle2,
  ShoppingBag,
  BadgeCheck,
  CreditCard,
  Shield,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { useSiteLogo } from '@/hooks/use-site-logo'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
/* ------------------------------------------------------------------ */

export const authSlideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 200 : -200,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 200 : -200,
    opacity: 0,
    transition: { duration: 0.2 },
  }),
}

export const authFadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* ------------------------------------------------------------------ */
/*  Step Types for Auth Flow                                            */
/* ------------------------------------------------------------------ */

export type AuthStep = 'mobile' | 'otp' | 'create-passcode' | 'confirm-passcode' | 'enter-passcode'

/* ------------------------------------------------------------------ */
/*  Custom Passcode Input with Box UI                                   */
/* ------------------------------------------------------------------ */

function PasscodeInput({
  value,
  onChange,
  showValue,
  onToggleShow,
  maxLength = 6,
  autoFocus = false,
}: {
  value: string
  onChange: (val: string) => void
  showValue: boolean
  onToggleShow: () => void
  maxLength?: number
  autoFocus?: boolean
}) {
  const displayValue = showValue ? value : value.replace(/\d/g, '\u2022')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-2.5">
        {Array.from({ length: maxLength }, (_, i) => {
          const isFilled = i < value.length
          const isCurrent = i === value.length

          return (
            <div
              key={i}
              className={cn(
                'relative flex items-center justify-center w-12 h-14 rounded-xl border-2 text-xl font-semibold transition-all duration-200',
                isCurrent
                  ? 'border-emerald-500 ring-4 ring-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 scale-110'
                  : isFilled
                    ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10 dark:border-emerald-700'
                    : 'border-muted-foreground/20 bg-muted/20 dark:bg-muted/10'
              )}
            >
              {isFilled ? (
                <span className={cn('text-foreground', !showValue && 'text-2xl')}>{displayValue[i]}</span>
              ) : (
                <span className="text-muted-foreground/30 text-sm">&mdash;</span>
              )}
              {isCurrent && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
          )
        })}
      </div>

      <input
        type={showValue ? 'tel' : 'password'}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={value}
        onChange={(e) => {
          const val = e.target.value.replace(/\D/g, '').slice(0, maxLength)
          onChange(val)
        }}
        maxLength={maxLength}
        autoFocus={autoFocus}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        aria-label="Enter passcode"
      />

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggleShow}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showValue ? 'Hide' : 'Show'} passcode
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Trust Badges Component                                              */
/* ------------------------------------------------------------------ */

function TrustBadges() {
  const badges = [
    { icon: <Shield className="h-4 w-4" />, label: 'Secure', color: 'text-emerald-500' },
    { icon: <BadgeCheck className="h-4 w-4" />, label: 'Verified', color: 'text-blue-500' },
    { icon: <CreditCard className="h-4 w-4" />, label: 'Encrypted', color: 'text-purple-500' },
    { icon: <Globe className="h-4 w-4" />, label: 'Trusted', color: 'text-amber-500' },
  ]

  return (
    <div className="flex items-center justify-center gap-4">
      {badges.map((badge) => (
        <div key={badge.label} className="flex flex-col items-center gap-1">
          <div className={cn('p-1.5', badge.color)}>
            {badge.icon}
          </div>
          <span className="text-[9px] text-muted-foreground font-medium">{badge.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Full-Page Auth Gate                                                 */
/* ------------------------------------------------------------------ */

export function AuthGate() {
  const { login, register } = useCustomerAuth()
  const { logo } = useSiteLogo()

  const [step, setStep] = useState<AuthStep>('mobile')
  const [direction, setDirection] = useState(1)
  const [mobile, setMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [passcode, setPasscode] = useState('')
  const [confirmPasscode, setConfirmPasscode] = useState('')
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [showCreatePasscode, setShowCreatePasscode] = useState(false)
  const [showConfirmPasscode, setShowConfirmPasscode] = useState(false)
  const [showLoginPasscode, setShowLoginPasscode] = useState(false)

  const [error, setError] = useState('')
  const [loadingAction, setLoadingAction] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  useEffect(() => {
    if (resendTimer <= 0) return
    const timer = setTimeout(() => setResendTimer((t) => t - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendTimer])

  useEffect(() => {
    if (step === 'create-passcode' || step === 'confirm-passcode' || step === 'enter-passcode') {
      setTimeout(() => {
        const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
        input?.focus()
      }, 300)
    }
  }, [step])

  const goToStep = useCallback((nextStep: AuthStep) => {
    setDirection(nextStep === 'mobile' ? -1 : 1)
    setError('')
    setStep(nextStep)
  }, [])

  const handleCheckMobile = useCallback(async () => {
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
    if (cleanMobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number')
      return
    }
    setLoadingAction(true)
    setError('')
    try {
      const res = await fetch('/api/auth/customer/check-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: cleanMobile }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      if (data.exists) {
        setIsNewCustomer(false)
        goToStep('enter-passcode')
      } else {
        // New customer — OTP was sent by the backend via SMS gateway.
        setIsNewCustomer(true)
        setResendTimer(60)
        goToStep('otp')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process request')
    } finally {
      setLoadingAction(false)
    }
  }, [mobile, goToStep])

  const handleVerifyOTP = useCallback(async () => {
    const cleanOtp = otp.replace(/\D/g, '')
    if (cleanOtp.length < 4) {
      setError('Please enter the complete OTP')
      return
    }
    setLoadingAction(true)
    setError('')
    try {
      // Send { mobile, otp } to backend — server verifies via SMS gateway
      const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
      const res = await fetch('/api/auth/customer/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: cleanMobile, otp: cleanOtp }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Invalid OTP')
      goToStep('create-passcode')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP')
    } finally {
      setLoadingAction(false)
    }
  }, [otp, mobile, goToStep])

  const handleResendOTP = useCallback(async () => {
    if (resendTimer > 0) return
    setLoadingAction(true)
    setError('')
    try {
      const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
      // Resend OTP via the backend SMS gateway
      const res = await fetch('/api/auth/customer/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: cleanMobile }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to resend OTP')
      setResendTimer(60)
      setOtp('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP')
    } finally {
      setLoadingAction(false)
    }
  }, [mobile, resendTimer])

  const handleCreatePasscode = useCallback(() => {
    const cleanPasscode = passcode.replace(/\D/g, '')
    if (cleanPasscode.length !== 6) {
      setError('Passcode must be exactly 6 digits')
      return
    }
    setError('')
    goToStep('confirm-passcode')
  }, [passcode, goToStep])

  const handleConfirmPasscode = useCallback(async () => {
    const cleanPasscode = passcode.replace(/\D/g, '')
    const cleanConfirm = confirmPasscode.replace(/\D/g, '')
    if (cleanConfirm.length !== 6) {
      setError('Please enter the complete 6-digit passcode')
      return
    }
    if (cleanPasscode !== cleanConfirm) {
      setError('Passcodes do not match. Please try again.')
      return
    }
    setLoadingAction(true)
    setError('')
    try {
      const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
      await register(cleanMobile, cleanPasscode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoadingAction(false)
    }
  }, [passcode, confirmPasscode, mobile, register])

  const handleLogin = useCallback(async () => {
    const cleanPasscode = passcode.replace(/\D/g, '')
    if (!cleanPasscode || cleanPasscode.length !== 6) {
      setError('Please enter your 6-digit passcode')
      return
    }
    setLoadingAction(true)
    setError('')
    try {
      const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
      await login(cleanMobile, cleanPasscode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoadingAction(false)
    }
  }, [mobile, login, passcode])

  const stepInfo: Record<AuthStep, { title: string; description: string; icon: React.ReactNode; subtitle?: string }> = {
    mobile: {
      title: 'Welcome to RealCart',
      description: 'Enter your mobile number to get started',
      subtitle: 'Shop millions of products at the best prices',
      icon: <Phone className="h-6 w-6" />,
    },
    otp: {
      title: 'Verify Your Number',
      description: `We've sent a 6-digit code to +91 ${mobile.replace(/\D/g, '').slice(-10)}`,
      icon: <ShieldCheck className="h-6 w-6" />,
    },
    'create-passcode': {
      title: 'Create Your Passcode',
      description: 'Set a secure 6-digit passcode for your account',
      icon: <KeyRound className="h-6 w-6" />,
    },
    'confirm-passcode': {
      title: 'Confirm Your Passcode',
      description: 'Re-enter your 6-digit passcode to confirm',
      icon: <CheckCircle2 className="h-6 w-6" />,
    },
    'enter-passcode': {
      title: 'Welcome Back!',
      description: `Enter your passcode for +91 ${mobile.replace(/\D/g, '').slice(-10)}`,
      icon: <Lock className="h-6 w-6" />,
    },
  }

  const currentStepInfo = stepInfo[step]
  const progressSteps = isNewCustomer
    ? ['mobile', 'otp', 'create-passcode', 'confirm-passcode']
    : ['mobile', 'enter-passcode']
  const currentStepIndex = progressSteps.indexOf(step)

  return (
    <div className="min-h-dvh flex relative overflow-hidden">
      {/* Left Panel - Branding & Visual */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700">
        {/* Animated background shapes */}
        <motion.div
          animate={{ y: [0, -30, 0], x: [0, 15, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-2xl"
        />
        <motion.div
          animate={{ y: [0, 20, 0], x: [0, -15, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-20 right-20 w-96 h-96 bg-emerald-300/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ y: [0, -15, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-300/8 rounded-full blur-2xl"
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3"
          >
            {logo?.url ? (
              <img src={logo.url} alt="RealCart" className="h-10 w-10 rounded-xl object-cover bg-white/20 p-1" />
            ) : (
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/20 text-white font-bold text-sm backdrop-blur-sm">
                <ShoppingBag className="h-5 w-5" />
              </div>
            )}
            <span className="text-2xl font-bold text-white tracking-tight">RealCart</span>
          </motion.div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 mb-8">
                <Sparkles className="h-4 w-4 text-yellow-300" />
                <span className="text-sm text-white/90 font-medium">India&apos;s Trusted Shopping Platform</span>
              </div>

              <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-6">
                Shop Smarter,<br />
                <span className="text-emerald-200">Live Better</span>
              </h1>

              <p className="text-lg text-white/70 leading-relaxed mb-10">
                Discover millions of products at unbeatable prices. From electronics to fashion,
                home essentials to groceries — everything you need, delivered to your doorstep.
              </p>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex items-center gap-8"
            >
              {[
                { value: '10M+', label: 'Products', icon: <ShoppingBag className="h-5 w-5" /> },
                { value: '50K+', label: 'Sellers', icon: <TrendingUp className="h-5 w-5" /> },
                { value: '98%', label: 'Satisfaction', icon: <Star className="h-5 w-5" /> },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/10 backdrop-blur-sm text-white/80">
                    {stat.icon}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{stat.value}</p>
                    <p className="text-xs text-white/50">{stat.label}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Bottom features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex items-center gap-6 text-white/60 text-sm"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>Secure Payments</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              <span>Free Delivery</span>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              <span>Easy Returns</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex flex-col relative bg-background">
        {/* Top navbar removed from login screen per design requirement */}

        {/* Auth Form Container — added top padding so the form stays vertically
            centered now that the mobile logo header is gone. On mobile the form
            now sits in the upper-middle of the screen with comfortable breathing
            room above it. */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-10 sm:py-12">
          <motion.div
            variants={authFadeUp}
            initial="hidden"
            animate="visible"
            className="w-full max-w-sm"
          >
            {/* Brand Logo / Step Icon
                - On the 'mobile' step (initial login), 'otp' step (OTP verification),
                  and 'enter-passcode' step (returning-user passcode login), show the
                  brand logo fetched from the database via useSiteLogo. This replaces
                  the previous Phone, ShieldCheck (security), and Lock icons on those
                  steps. Falls back to ShoppingBag icon if the API fails or no logo
                  is configured.
                - On 'create-passcode' and 'confirm-passcode' steps (new-user
                  registration flow), keep the original KeyRound and CheckCircle2
                  icons — those steps benefit from distinct visual cues. */}
            <motion.div
              key={step + '-icon'}
              initial={{ scale: 0.7, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="mx-auto mb-6 flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/25 overflow-hidden"
            >
              {step === 'mobile' || step === 'otp' || step === 'enter-passcode' ? (
                // Brand logo from database (useSiteLogo hook) — shown on:
                //   - mobile step (initial login — replaces Phone icon)
                //   - otp step (OTP verification — replaces ShieldCheck/security icon)
                //   - enter-passcode step (returning-user passcode — replaces Lock icon)
                logo?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo.url}
                    alt="RealCart"
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  // Fallback: ShoppingBag icon (gradient bg already on container)
                  <ShoppingBag className="h-6 w-6" />
                )
              ) : (
                // Other steps (create-passcode, confirm-passcode): keep their
                // original step icons (KeyRound, CheckCircle2)
                currentStepInfo.icon
              )}
            </motion.div>

            {/* Title & Description */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight">{currentStepInfo.title}</h2>
              <p className="text-sm text-muted-foreground mt-2">{currentStepInfo.description}</p>
              {currentStepInfo.subtitle && step === 'mobile' && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">{currentStepInfo.subtitle}</p>
              )}
            </div>

            {/* Progress Indicator */}
            {progressSteps.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 mb-8">
                {progressSteps.map((s, i) => (
                  <div
                    key={s}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300',
                      i === currentStepIndex
                        ? 'w-8 bg-emerald-500'
                        : i < currentStepIndex
                          ? 'w-6 bg-emerald-400'
                          : 'w-6 bg-muted-foreground/15'
                    )}
                  />
                ))}
              </div>
            )}

            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="mb-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2"
                >
                  <span className="shrink-0 mt-0.5">&#9888;</span>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step Content */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={authSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-5"
              >
                {step === 'mobile' && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="auth-mobile" className="text-sm font-medium">Mobile Number</Label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">+91</span>
                        <Input
                          id="auth-mobile"
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="Enter 10-digit number"
                          value={mobile}
                          onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 10); setMobile(val); setError('') }}
                          className="pl-14 h-13 text-lg rounded-xl tracking-wider font-medium"
                          maxLength={10}
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleCheckMobile()}
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleCheckMobile}
                      disabled={loadingAction || mobile.replace(/\D/g, '').length !== 10}
                      className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-emerald-500/25 gap-2"
                    >
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                    </Button>

                    {/* Trust indicators */}
                    <div className="pt-4 space-y-3">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span>Your data is safe with bank-grade encryption</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Fingerprint className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span>Quick login with just your mobile & passcode</span>
                      </div>
                    </div>
                  </div>
                )}

                {step === 'otp' && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Enter OTP</Label>
                      <div className="flex justify-center py-2">
                        <InputOTP maxLength={6} value={otp} onChange={(val) => { setOtp(val); setError('') }} pattern="^[0-9]+$">
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>
                    <Button
                      onClick={handleVerifyOTP}
                      disabled={loadingAction || otp.replace(/\D/g, '').length < 4}
                      className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-emerald-500/25 gap-2"
                    >
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Verify OTP <ShieldCheck className="h-4 w-4" /></>}
                    </Button>
                    <div className="text-center text-sm">
                      {resendTimer > 0 ? (
                        <span className="text-muted-foreground">Resend OTP in <span className="font-semibold text-foreground">{resendTimer}s</span></span>
                      ) : (
                        <button onClick={handleResendOTP} disabled={loadingAction} className="text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1">
                          <RefreshCw className="h-3.5 w-3.5" />Resend OTP
                        </button>
                      )}
                    </div>
                    <button onClick={() => { setOtp(''); goToStep('mobile') }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" />Change mobile number
                    </button>
                  </div>
                )}

                {step === 'create-passcode' && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Create 6-Digit Passcode</Label>
                      <PasscodeInput value={passcode} onChange={(val) => { setPasscode(val); setError('') }} showValue={showCreatePasscode} onToggleShow={() => setShowCreatePasscode(!showCreatePasscode)} autoFocus />
                      <p className="text-xs text-muted-foreground text-center">This passcode will be used to login to your account</p>
                    </div>
                    <Button onClick={handleCreatePasscode} disabled={loadingAction || passcode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-emerald-500/25 gap-2">
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                    </Button>
                    <button onClick={() => { setPasscode(''); goToStep('otp') }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" />Back to OTP verification
                    </button>
                  </div>
                )}

                {step === 'confirm-passcode' && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Confirm 6-Digit Passcode</Label>
                      <PasscodeInput value={confirmPasscode} onChange={(val) => { setConfirmPasscode(val); setError('') }} showValue={showConfirmPasscode} onToggleShow={() => setShowConfirmPasscode(!showConfirmPasscode)} autoFocus />
                    </div>
                    <Button onClick={handleConfirmPasscode} disabled={loadingAction || confirmPasscode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-emerald-500/25 gap-2">
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <><UserPlus className="h-4 w-4" />Create Account</>}
                    </Button>
                    <button onClick={() => { setConfirmPasscode(''); goToStep('create-passcode') }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" />Change passcode
                    </button>
                  </div>
                )}

                {step === 'enter-passcode' && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Enter Your Passcode</Label>
                      <PasscodeInput value={passcode} onChange={(val) => { setPasscode(val); setError('') }} showValue={showLoginPasscode} onToggleShow={() => setShowLoginPasscode(!showLoginPasscode)} autoFocus />
                    </div>
                    <Button onClick={handleLogin} disabled={loadingAction || passcode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-emerald-500/25 gap-2">
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Lock className="h-4 w-4" />Login</>}
                    </Button>
                    <button onClick={() => { setPasscode(''); goToStep('mobile') }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" />Use different number
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Footer with Trust Badges */}
            <div className="mt-8 pt-5 border-t border-border/40">
              <TrustBadges />
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-3">
                <Fingerprint className="h-3.5 w-3.5" />
                <span>Secured with end-to-end encryption</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
