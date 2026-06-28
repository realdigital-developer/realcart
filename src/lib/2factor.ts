/**
 * 2factor.in API integration for OTP delivery
 * Docs: https://2factor.in/API/
 */

const API_KEY = process.env.TWOFACTOR_API_KEY || process.env['2FACTOR_API_KEY'] || ''
const BASE_URL = 'https://2factor.in/API/V1'

// When API key is not configured, use a test OTP system
// NOTE: We intentionally do NOT check NODE_ENV here — if a valid API key is
// provided, real OTPs should be sent even in development mode.
const isDevMode = !API_KEY
const TEST_OTP = '123456'

// Log OTP mode on module load
if (isDevMode) {
  console.log('[2Factor] Running in DEV mode — OTP is always 123456. Set 2FACTOR_API_KEY in .env for real OTPs.')
} else {
  console.log('[2Factor] API key configured — real OTPs will be sent via 2factor.in')
}

interface OTPResponse {
  Status: 'Success' | 'Error'
  Details: string
  otp?: string // Only in test mode
}

interface VerifyResponse {
  Status: 'Success' | 'Error'
  Details: string
}

/**
 * Send OTP to a mobile number via 2factor.in
 * Returns the session ID (Details field) which is needed for verification
 */
export async function sendOTP(mobile: string): Promise<{ sessionId: string }> {
  // In dev mode (or no API key), use a test OTP
  if (isDevMode) {
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
    if (cleanMobile.length !== 10) {
      throw new Error('Invalid mobile number. Must be 10 digits.')
    }
    // Return a fake session ID — OTP is always 123456 in dev mode
    return { sessionId: `test-session-${cleanMobile}` }
  }

  // Format: +91XXXXXXXXXX or just 10-digit number
  const cleanMobile = mobile.replace(/\D/g, '').slice(-10)

  if (cleanMobile.length !== 10) {
    throw new Error('Invalid mobile number. Must be 10 digits.')
  }

  const url = `${BASE_URL}/${API_KEY}/SMS/+91${cleanMobile}/AUTOGEN`

  console.log(`[2Factor] Sending OTP to +91${cleanMobile.slice(0, 2)}****${cleanMobile.slice(-2)}`)

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  const data: OTPResponse = await response.json()

  if (data.Status !== 'Success') {
    console.error('[2Factor] OTP send failed:', data.Details)
    throw new Error(data.Details || 'Failed to send OTP')
  }

  console.log('[2Factor] OTP sent successfully, session:', data.Details.slice(0, 8) + '...')
  return { sessionId: data.Details }
}

/**
 * Verify OTP entered by the user
 * @param sessionId - The session ID returned by sendOTP
 * @param otp - The OTP entered by the user
 */
export async function verifyOTP(sessionId: string, otp: string): Promise<boolean> {
  const cleanOTP = otp.replace(/\D/g, '')

  if (cleanOTP.length < 4 || cleanOTP.length > 6) {
    throw new Error('Invalid OTP length')
  }

  // In dev mode (no API key), accept ONLY the test OTP '123456'
  if (isDevMode) {
    return cleanOTP === TEST_OTP
  }

  if (!API_KEY) {
    throw new Error('2FACTOR_API_KEY is not configured')
  }

  const url = `${BASE_URL}/${API_KEY}/SMS/VERIFY/${sessionId}/${cleanOTP}`

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  const data: VerifyResponse = await response.json()

  if (data.Status === 'Success') {
    return true
  }

  return false
}
