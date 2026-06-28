'use client'

import { useState, useCallback, useEffect } from 'react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone,
  ShieldCheck,
  Loader2,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  CheckCircle2,
  RefreshCw,
  Fingerprint,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                  */
/* ------------------------------------------------------------------ */

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    transition: { duration: 0.2 },
  }),
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* ------------------------------------------------------------------ */
/*  Step Types                                                          */
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
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: maxLength }, (_, i) => {
          const isFilled = i < value.length
          const isCurrent = i === value.length

          return (
            <div
              key={i}
              className={cn(
                'relative flex items-center justify-center w-11 h-13 rounded-xl border-2 text-lg font-semibold transition-all duration-200',
                isCurrent
                  ? 'border-emerald-500 ring-4 ring-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 scale-105'
                  : isFilled
                    ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10 dark:border-emerald-700'
                    : 'border-muted-foreground/20 bg-muted/20 dark:bg-muted/10'
              )}
            >
              {isFilled ? (
                <span className={cn('text-foreground', !showValue && 'text-2xl')}>
                  {displayValue[i]}
                </span>
              ) : (
                <span className="text-muted-foreground/30 text-xs">&mdash;</span>
              )}
              {isCurrent && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-emerald-500 animate-pulse" />
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
/*  Main Customer Login Page                                            */
/* ------------------------------------------------------------------ */

export default function CustomerLoginPage() {
  const { authenticated, loading, login, register } = useCustomerAuth()
  const router = useRouter()

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
  const [otpSent, setOtpSent] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Redirect if authenticated
  useEffect(() => {
    if (!loading && authenticated) {
      router.replace('/customer')
    }
  }, [authenticated, loading, router])

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
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      if (data.exists) {
        setIsNewCustomer(false)
        goToStep('enter-passcode')
      } else {
        setIsNewCustomer(true)
        setOtpSent(true)
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
      const res = await fetch('/api/auth/customer/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: mobile.replace(/\D/g, '').slice(-10), otp: cleanOtp }),
      })
      const data = await res.json()
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
      const res = await fetch('/api/auth/customer/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: cleanMobile }),
      })
      const data = await res.json()
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

  const stepInfo: Record<AuthStep, { title: string; description: string; icon: React.ReactNode }> = {
    mobile: {
      title: 'Welcome to RealCart',
      description: 'Enter your mobile number to continue',
      icon: <Phone className="h-5 w-5" />,
    },
    otp: {
      title: 'Verify OTP',
      description: `We've sent a verification code to +91 ${mobile.replace(/\D/g, '').slice(-10)}`,
      icon: <ShieldCheck className="h-5 w-5" />,
    },
    'create-passcode': {
      title: 'Create Passcode',
      description: 'Set a 6-digit numeric passcode for your account',
      icon: <KeyRound className="h-5 w-5" />,
    },
    'confirm-passcode': {
      title: 'Confirm Passcode',
      description: 'Re-enter your 6-digit passcode to confirm',
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    'enter-passcode': {
      title: 'Enter Passcode',
      description: `Welcome back! Enter your passcode for +91 ${mobile.replace(/\D/g, '').slice(-10)}`,
      icon: <Lock className="h-5 w-5" />,
    },
  }

  const currentStepInfo = stepInfo[step]

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  if (authenticated) return null

  return (
    <div className="min-h-dvh flex items-center justify-center relative overflow-hidden p-4 sm:p-6">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/20" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl" />

      {/* Main Card */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="relative w-full max-w-md"
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-emerald-500/20 rounded-2xl blur-xl" />
        <Card className="relative shadow-2xl shadow-emerald-500/10 border-border/30 bg-card/95 backdrop-blur-sm">
          {/* Header */}
          <CardHeader className="text-center pb-2">
            <motion.div
              key={step + '-icon'}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="mx-auto mb-3 flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25"
            >
              {currentStepInfo.icon}
            </motion.div>
            <CardTitle className="text-xl">{currentStepInfo.title}</CardTitle>
            <CardDescription className="text-sm">{currentStepInfo.description}</CardDescription>
          </CardHeader>

          <CardContent className="pt-2">
            {/* Error Alert */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2"
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
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-4"
              >
                {step === 'mobile' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="mobile" className="text-sm font-medium">Mobile Number</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">+91</span>
                        <Input
                          id="mobile"
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="Enter 10-digit number"
                          value={mobile}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                            setMobile(val)
                            setError('')
                          }}
                          className="pl-12 h-12 text-lg rounded-xl tracking-wider"
                          maxLength={10}
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleCheckMobile()}
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleCheckMobile}
                      disabled={loadingAction || mobile.replace(/\D/g, '').length !== 10}
                      className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-medium shadow-lg shadow-emerald-500/25 gap-2"
                    >
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                    </Button>
                  </div>
                )}

                {step === 'otp' && (
                  <div className="space-y-4">
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
                      className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-medium shadow-lg shadow-emerald-500/25 gap-2"
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Create 6-Digit Passcode</Label>
                      <PasscodeInput value={passcode} onChange={(val) => { setPasscode(val); setError('') }} showValue={showCreatePasscode} onToggleShow={() => setShowCreatePasscode(!showCreatePasscode)} autoFocus />
                      <p className="text-xs text-muted-foreground text-center">This passcode will be used to login to your account</p>
                    </div>
                    <Button onClick={handleCreatePasscode} disabled={loadingAction || passcode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-medium shadow-lg shadow-emerald-500/25 gap-2">
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                    </Button>
                    <button onClick={() => { setPasscode(''); goToStep('otp') }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" />Back to OTP verification
                    </button>
                  </div>
                )}

                {step === 'confirm-passcode' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Confirm 6-Digit Passcode</Label>
                      <PasscodeInput value={confirmPasscode} onChange={(val) => { setConfirmPasscode(val); setError('') }} showValue={showConfirmPasscode} onToggleShow={() => setShowConfirmPasscode(!showConfirmPasscode)} autoFocus />
                    </div>
                    <Button onClick={handleConfirmPasscode} disabled={loadingAction || confirmPasscode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-medium shadow-lg shadow-emerald-500/25 gap-2">
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <><UserPlus className="h-4 w-4" />Create Account</>}
                    </Button>
                    <button onClick={() => { setConfirmPasscode(''); goToStep('create-passcode') }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" />Change passcode
                    </button>
                  </div>
                )}

                {step === 'enter-passcode' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Enter Your Passcode</Label>
                      <PasscodeInput value={passcode} onChange={(val) => { setPasscode(val); setError('') }} showValue={showLoginPasscode} onToggleShow={() => setShowLoginPasscode(!showLoginPasscode)} autoFocus />
                    </div>
                    <Button onClick={handleLogin} disabled={loadingAction || passcode.replace(/\D/g, '').length !== 6} className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-base font-medium shadow-lg shadow-emerald-500/25 gap-2">
                      {loadingAction ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Lock className="h-4 w-4" />Login</>}
                    </Button>
                    <button onClick={() => { setPasscode(''); goToStep('mobile') }} className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
                      <ArrowLeft className="h-3.5 w-3.5" />Use different number
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 pt-4 border-t border-border/40">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Fingerprint className="h-3.5 w-3.5" />
                <span>Secured with end-to-end encryption</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
