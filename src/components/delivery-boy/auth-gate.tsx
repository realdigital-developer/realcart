'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDeliveryBoyAuth } from '@/hooks/use-delivery-boy-auth'
import { usePhoneOtp } from '@/hooks/use-phone-otp'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Truck,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Sparkles,
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
  Package,
  MapPin,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { useSiteLogo } from '@/hooks/use-site-logo'
import { ThemeToggle } from '@/components/admin/theme-toggle'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
/* ------------------------------------------------------------------ */

const authSlideVariants = {
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

const authFadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* ------------------------------------------------------------------ */
/*  Step Types for Auth Flow                                            */
/* ------------------------------------------------------------------ */

type AuthStep = 'mobile' | 'otp' | 'create-passcode' | 'confirm-passcode' | 'enter-passcode'

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
                  ? 'border-orange-500 ring-4 ring-orange-500/20 bg-orange-50/50 dark:bg-orange-950/20 scale-110'
                  : isFilled
                    ? 'border-orange-400 bg-orange-50/30 dark:bg-orange-950/10 dark:border-orange-700'
                    : 'border-muted-foreground/20 bg-muted/20 dark:bg-muted/10'
              )}
            >
              {isFilled ? (
                <span className={cn('text-foreground', !showValue && 'text-2xl')}>{displayValue[i]}</span>
              ) : (
                <span className="text-muted-foreground/30 text-sm">&mdash;</span>
              )}
              {isCurrent && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-orange-500 animate-pulse" />
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
/*  Full-Page Auth Gate                                                 */
/* ------------------------------------------------------------------ */

export function DeliveryBoyAuthGate() {
  const { login, register } = useDeliveryBoyAuth()
  const { logo } = useSiteLogo()

  // Firebase Phone Auth hook — handles OTP send/verify (with dev-mode fallback)
  const phoneOtp = usePhoneOtp()

  const [step, setStep] = useState<AuthStep>('mobile')
  const [direction, setDirection] = useState(1)
  const [mobile, setMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [passcode, setPasscode] = useState('')
  const [confirmPasscode, setConfirmPasscode] = useState('')
  const [isNewDeliveryBoy, setIsNewDeliveryBoy] = useState(false)
  const [showCreatePasscode, setShowCreatePasscode] = useState(false)
  const [showConfirmPasscode, setShowConfirmPasscode] = useState(false)
  const [showLoginPasscode, setShowLoginPasscode] = useState(false)

  const [error, setError] = useState('')
  const [loadingAction, setLoadingAction] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Surface errors from the Firebase phone OTP hook into the UI's error state
  useEffect(() => {
    if (phoneOtp.error) setError(phoneOtp.error)
  }, [phoneOtp.error])

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
      const res = await fetch('/api/auth/delivery-boy/check-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: cleanMobile }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      if (data.exists) {
        setIsNewDeliveryBoy(false)
        goToStep('enter-passcode')
      } else {
        // New delivery boy — send OTP via Firebase Phone Auth (client-side).
        setIsNewDeliveryBoy(true)
        await phoneOtp.sendOtp(cleanMobile)
        setResendTimer(60)
        goToStep('otp')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process request')
    } finally {
      setLoadingAction(false)
    }
  }, [mobile, goToStep, phoneOtp])

  const handleVerifyOTP = useCallback(async () => {
    const cleanOtp = otp.replace(/\D/g, '')
    if (cleanOtp.length < 4) {
      setError('Please enter the complete OTP')
      return
    }
    setLoadingAction(true)
    setError('')
    try {
      // Step 1: Verify OTP via Firebase Phone Auth → get Firebase ID token
      const { idToken } = await phoneOtp.verifyOtp(cleanOtp)
      // Step 2: Send the ID token to backend for server-side verification
      const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
      const res = await fetch('/api/auth/delivery-boy/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: cleanMobile, idToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Invalid OTP')
      goToStep('create-passcode')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP')
    } finally {
      setLoadingAction(false)
    }
  }, [otp, mobile, goToStep, phoneOtp])

  const handleResendOTP = useCallback(async () => {
    if (resendTimer > 0) return
    setLoadingAction(true)
    setError('')
    try {
      const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
      // Resend OTP via Firebase Phone Auth (client-side)
      await phoneOtp.sendOtp(cleanMobile)
      setResendTimer(60)
      setOtp('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP')
    } finally {
      setLoadingAction(false)
    }
  }, [mobile, resendTimer, phoneOtp])

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
      title: 'Delivery Partner Portal',
      description: 'Enter your mobile number to get started',
      subtitle: 'Deliver smiles, one order at a time',
      icon: <Truck className="h-6 w-6" />,
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
  const progressSteps = isNewDeliveryBoy
    ? ['mobile', 'otp', 'create-passcode', 'confirm-passcode']
    : ['mobile', 'enter-passcode']
  const currentStepIndex = progressSteps.indexOf(step)

  return (
    <div className="min-h-dvh flex relative overflow-hidden">
      {/* reCAPTCHA container for Firebase Phone Auth (invisible — no visual impact) */}
      <div id="recaptcha-container" style={{ position: 'fixed', bottom: 0, right: 0, zIndex: -1 }} />
      {/* Left Panel - Branding & Visual */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-orange-600 via-amber-600 to-yellow-600">
        {/* Animated background shapes */}
        <motion.div
          animate={{ y: [0, -30, 0], x: [0, 15, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-2xl"
        />
        <motion.div
          animate={{ y: [0, 20, 0], x: [0, -15, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-20 right-20 w-96 h-96 bg-orange-300/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ y: [0, -15, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-yellow-300/8 rounded-full blur-2xl"
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
                RC
              </div>
            )}
            <span className="text-2xl font-bold text-white tracking-tight">RealCart</span>
            <span className="text-sm text-white/60 font-medium ml-1">Delivery</span>
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
                <span className="text-sm text-white/90 font-medium">Fast & Reliable Delivery Partner</span>
              </div>

              <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-6">
                Deliver Faster,<br />
                <span className="text-orange-200">Earn More</span>
              </h1>

              <p className="text-lg text-white/70 leading-relaxed mb-10">
                Join thousands of delivery partners on RealCart. Manage your deliveries,
                track your earnings, and enjoy flexible work hours — all from one app.
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
                { value: '5K+', label: 'Deliveries/day', icon: <Package className="h-5 w-5" /> },
                { value: '2K+', label: 'Partners', icon: <Truck className="h-5 w-5" /> },
                { value: '24/7', label: 'Support', icon: <Clock className="h-5 w-5" /> },
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
              <span>Insured Deliveries</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>Live Tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Instant Payouts</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex flex-col relative bg-background">
        {/* Mobile logo header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-border/30">
          <div className="flex items-center gap-2.5">
            {logo?.url ? (
              <img src={logo.url} alt="RealCart" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white font-bold text-sm">
                RC
              </div>
            )}
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              RealCart Delivery
            </span>
          </div>
          <ThemeToggle />
        </div>

        {/* Theme toggle for desktop */}
        <div className="hidden lg:block absolute top-6 right-6 z-10">
          <ThemeToggle />
        </div>

        {/* Auth Form Container */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-8">
          <motion.div
            variants={authFadeUp}
            initial="hidden"
            animate="visible"
            className="w-full max-w-sm"
          >
            {/* Step Icon */}
            <motion.div
              key={step + '-icon'}
              initial={{ scale: 0.7, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="mx-auto mb-6 flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-xl shadow-orange-500/25"
            >
              {currentStepInfo.icon}
            </motion.div>

            {/* Title & Description */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight">{currentStepInfo.title}</h2>
              <p className="text-sm text-muted-foreground mt-2">{currentStepInfo.description}</p>
              {currentStepInfo.subtitle && step === 'mobile' && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">{currentStepInfo.subtitle}</p>
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
                        ? 'w-8 bg-orange-500'
                        : i < currentStepIndex
                          ? 'w-6 bg-orange-400'
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
                      <Label htmlFor="delivery-auth-mobile" className="text-sm font-medium">Mobile Number</Label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">+91</span>
                        <Input
                          id="delivery-auth-mobile"
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
                      className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-orange-500/25 gap-2"
                    >
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                    </Button>

                    {/* Trust indicators */}
                    <div className="pt-4 space-y-3">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <ShieldCheck className="h-4 w-4 text-orange-500 shrink-0" />
                        <span>Your data is safe with bank-grade encryption</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Fingerprint className="h-4 w-4 text-orange-500 shrink-0" />
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
                      className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-orange-500/25 gap-2"
                    >
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Verify OTP <ShieldCheck className="h-4 w-4" /></>}
                    </Button>
                    <div className="text-center text-sm">
                      {resendTimer > 0 ? (
                        <span className="text-muted-foreground">Resend OTP in <span className="font-semibold text-foreground">{resendTimer}s</span></span>
                      ) : (
                        <button onClick={handleResendOTP} disabled={loadingAction} className="text-orange-600 hover:text-orange-700 font-medium inline-flex items-center gap-1">
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
                    <Button onClick={handleCreatePasscode} disabled={loadingAction || passcode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-orange-500/25 gap-2">
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
                    <Button onClick={handleConfirmPasscode} disabled={loadingAction || confirmPasscode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-orange-500/25 gap-2">
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
                    <Button onClick={handleLogin} disabled={loadingAction || passcode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-base font-semibold shadow-lg shadow-orange-500/25 gap-2">
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Lock className="h-4 w-4" />Login</>}
                    </Button>
                    <button onClick={() => { setPasscode(''); goToStep('mobile') }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" />Use different number
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Footer */}
            <div className="mt-8 pt-5 border-t border-border/40">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
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
