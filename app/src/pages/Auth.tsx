import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { upsertMyProfile } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

// Single login surface for everyone — customers AND the owner (§12.3).
// Default mode is the V1 email-OTP flow; a discreet toggle switches to
// email+password (signInWithPassword). No is_admin gating at sign-in time:
// the role decides the view after login, not the surface.

const RESEND_COOLDOWN_S = 30

const inputClass =
  'w-full border-[1.5px] border-sand bg-white px-3 py-3 text-sm text-mocha outline-none rounded-md focus:border-rose transition-colors'

const labelClass = 'block text-[0.68rem] tracking-[0.14em] uppercase text-warm mb-1 font-medium'

const primaryButtonClass =
  'w-full bg-rose text-white border-none py-3 text-xs tracking-[0.15em] uppercase rounded-md cursor-pointer hover:bg-mocha transition-colors disabled:opacity-50'

/** §9.5: rate-limit responses get a friendly line; everything else shows the auth message inline. */
function friendlyAuthError(error: { status?: number; message: string }): string {
  if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) {
    return 'Too many attempts — please wait a moment before requesting another code.'
  }
  return error.message
}

export default function Auth() {
  const { user, isAdmin, isRoleLoading } = useAuth()
  const location = useLocation()

  const [mode, setMode] = useState<'otp' | 'password'>('otp')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Simple resend cooldown: tick down once per second while > 0.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(current => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  // Race-safe post-login redirect (§12.3), shared by BOTH the OTP and password
  // paths and by already-logged-in visitors: once onAuthStateChange lands the
  // session, wait for the is_admin RPC to settle (isRoleLoading), THEN route by
  // role. Without the wait, an admin would be sent to `from`/'/' before isAdmin
  // resolves.
  if (user && isRoleLoading) return <LoadingSpinner fullPage />
  if (user) return <Navigate to={isAdmin ? '/admin' : from} replace />

  async function sendOtp() {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }
    setLoading(true)
    setError('')
    const { error: otpError } = await supabase.auth.signInWithOtp({ email })
    setLoading(false)
    if (otpError) {
      setError(friendlyAuthError(otpError))
      return
    }
    setCooldown(RESEND_COOLDOWN_S)
    setStep('otp')
  }

  async function verifyOtp() {
    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit code')
      return
    }
    setLoading(true)
    setError('')
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })
    if (verifyError) {
      setLoading(false)
      setError(friendlyAuthError(verifyError))
      return
    }
    // Create/update profile after sign-in (§5.3). Failure must not block the
    // session that already exists — degrade like AuthContext does (§9); the row
    // is recreated on the next profile save.
    if (data.user) {
      try {
        await upsertMyProfile({ id: data.user.id, email: data.user.email ?? null })
      } catch (profileError) {
        console.error('Profile upsert after sign-in failed:', profileError)
      }
    }
    // No explicit navigate: loading stays true until onAuthStateChange sets
    // `user`, at which point the declarative branch above takes over.
  }

  async function signInWithPassword() {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }
    if (!password) {
      setError('Please enter your password')
      return
    }
    setLoading(true)
    setError('')
    const { error: passwordError } = await supabase.auth.signInWithPassword({ email, password })
    if (passwordError) {
      setLoading(false)
      // Wrong password etc. → inline supabase error. No is_admin check here:
      // any user with a password may sign in this way (§12.3).
      setError(friendlyAuthError(passwordError))
      return
    }
    // Same hand-off as verifyOtp: the declarative redirect finishes the job.
  }

  function resetToEmailStep() {
    setStep('email')
    setOtp('')
    setError('')
  }

  function switchMode(nextMode: 'otp' | 'password') {
    setMode(nextMode)
    setStep('email')
    setOtp('')
    setPassword('')
    setError('')
  }

  return (
    <section className="min-h-[80vh] pt-28 pb-16 px-[5%] flex items-start justify-center">
      <div className="bg-white rounded-2xl overflow-hidden max-w-[400px] w-full shadow-[0_24px_70px_rgba(74,46,38,0.18)] border border-sand animate-pop-in">
        {/* Brand header — gate-style framing */}
        <div className="bg-gradient-to-br from-mocha to-warm px-6 py-8 text-center">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/30 mx-auto mb-4 shadow-[0_8px_30px_rgba(0,0,0,.25)]">
            <img src="/images/logo.jpg" alt="Hijab Haven" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-heading text-3xl text-white font-normal">Hijab Haven</h1>
          <p className="text-xs text-white/60 tracking-[0.18em] uppercase mt-1">
            Elegance in Every Drape
          </p>
        </div>

        <div className="p-6">
          <p className="text-sm text-warm text-center leading-relaxed mb-5 font-light">
            {mode === 'password'
              ? 'Owner sign-in — enter your email and password.'
              : step === 'email'
                ? "Sign in or create an account — we'll send a code to your email."
                : `Enter the 6-digit code sent to ${email}`}
          </p>

          {mode === 'password' ? (
            <>
              <div className="mb-4">
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="your@email.com"
                  className={inputClass}
                />
              </div>
              <div className="mb-4">
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && void signInWithPassword()}
                  placeholder="Your password"
                  className={inputClass}
                />
              </div>
              <button
                onClick={() => void signInWithPassword()}
                disabled={loading}
                className={primaryButtonClass}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button
                onClick={() => switchMode('otp')}
                className="block w-full text-center mt-3 text-xs text-warm bg-transparent border-none cursor-pointer underline"
              >
                ← Back to code sign-in
              </button>
            </>
          ) : step === 'email' ? (
            <>
              <div className="mb-4">
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && void sendOtp()}
                  placeholder="your@email.com"
                  className={inputClass}
                />
              </div>
              <button
                onClick={() => void sendOtp()}
                disabled={loading}
                className={primaryButtonClass}
              >
                {loading ? 'Sending...' : 'Send Verification Code'}
              </button>
              <button
                onClick={() => switchMode('password')}
                className="block w-full text-center mt-3 text-xs text-warm/70 bg-transparent border-none cursor-pointer underline"
              >
                Owner? Sign in with password
              </button>
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className={labelClass}>Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={event => event.key === 'Enter' && void verifyOtp()}
                  placeholder="123456"
                  maxLength={6}
                  className={`${inputClass} text-xl text-center tracking-[0.5em] font-medium`}
                />
              </div>
              <button
                onClick={() => void verifyOtp()}
                disabled={loading}
                className={primaryButtonClass}
              >
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>
              <button
                onClick={() => void sendOtp()}
                disabled={loading || cooldown > 0}
                className="block w-full text-center mt-3 text-xs text-warm bg-transparent border-none cursor-pointer underline disabled:opacity-50 disabled:cursor-default"
              >
                {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
              </button>
              <button
                onClick={resetToEmailStep}
                className="block w-full text-center mt-2 text-xs text-warm bg-transparent border-none cursor-pointer underline"
              >
                Use a different email
              </button>
            </>
          )}

          {error && (
            <p className="text-rose text-sm text-center mt-3 bg-rose/10 px-3 py-2 rounded-md border border-rose/30">
              {error}
            </p>
          )}

          <p className="text-center text-[0.72rem] text-warm/60 mt-4 leading-relaxed">
            By signing in you agree to our Terms &amp; Privacy Policy
          </p>
        </div>
      </div>
    </section>
  )
}
