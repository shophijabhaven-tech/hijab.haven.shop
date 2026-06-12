import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { registerCustomerV2, upsertMyProfile } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

// Single login surface for everyone — customers AND admins. Owner directive
// (supersedes §12.3's owner-only password toggle): email+password is the
// DEFAULT sign-in for all users; email-OTP remains as an alternate mode and
// signup creates password accounts. No is_admin gating at sign-in time: the
// role decides the view after login, not the surface.

type AuthMode = 'signin' | 'signup' | 'otp' | 'forgot'

const RESEND_COOLDOWN_S = 30
const MIN_PASSWORD_LENGTH = 8

const inputClass =
  'w-full border-[1.5px] border-sand bg-white px-3 py-3 text-sm text-mocha outline-none rounded-md focus:border-rose transition-colors'

const labelClass = 'block text-[0.68rem] tracking-[0.14em] uppercase text-warm mb-1 font-medium'

const primaryButtonClass =
  'w-full bg-rose text-white border-none py-3 text-xs tracking-[0.15em] uppercase rounded-md cursor-pointer hover:bg-mocha transition-colors disabled:opacity-50'

const linkButtonClass =
  'block w-full text-center mt-3 text-xs text-warm bg-transparent border-none cursor-pointer underline'

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

  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  // Signup-only fields — the retired entry gate's data collection now lives
  // here (owner directive, supersedes §12.2).
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Simple resend cooldown: tick down once per second while > 0.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(current => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  // Race-safe post-login redirect (§12.3), shared by ALL modes (password,
  // signup-with-session, OTP) and by already-logged-in visitors: once
  // onAuthStateChange lands the session, wait for the is_admin RPC to settle
  // (isRoleLoading), THEN route by role. Without the wait, an admin would be
  // sent to `from`/'/' before isAdmin resolves.
  if (user && isRoleLoading) return <LoadingSpinner fullPage />
  if (user) return <Navigate to={isAdmin ? '/admin' : from} replace />

  async function signIn() {
    if (loading) return
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
    setNotice('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setLoading(false)
      setError(
        /invalid login credentials/i.test(signInError.message)
          ? 'Wrong email or password. New here? Create an account below — or sign in with a code instead.'
          : friendlyAuthError(signInError),
      )
      return
    }
    // No explicit navigate: loading stays true until onAuthStateChange sets
    // `user`, at which point the declarative redirect above takes over.
  }

  async function signUp() {
    if (loading) return
    // Validation order mirrors the retired gate (name → phone) then the
    // existing email/password rules. Phone rule is the gate's, verbatim:
    // valid when ≥10 digits remain after stripping non-digits.
    const trimmedName = fullName.trim()
    const trimmedPhone = phone.trim()
    if (!trimmedName) {
      setError('Please enter your name')
      return
    }
    if (trimmedPhone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit WhatsApp number')
      return
    }
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) {
      setLoading(false)
      if (/already registered/i.test(signUpError.message)) {
        // Existing account → bounce to sign-in with the email prefilled.
        switchMode('signin')
        setError('This email already has an account — sign in instead.')
        return
      }
      setError(friendlyAuthError(signUpError))
      return
    }
    // The retired gate's job, now done at signup: populate the customers
    // table (broadcast list) fire-and-forget — Supabase failures must never
    // block the signup (§9.4) — and store hh_user for checkout prefill.
    registerCustomerV2(trimmedName, trimmedPhone, email).catch(() => {})
    localStorage.setItem(
      'hh_user',
      JSON.stringify({
        name: trimmedName,
        phone: trimmedPhone,
        email,
        joinedDate: new Date().toLocaleDateString('en-IN'),
        joinedTs: Date.now(),
      }),
    )
    if (data.session) {
      // Autoconfirm ON: session is live. Create the profile row (§5.3) with
      // the signup's name + phone; failure must not block the session —
      // degrade like AuthContext (§9).
      if (data.user) {
        try {
          await upsertMyProfile({
            id: data.user.id,
            email: data.user.email ?? null,
            full_name: trimmedName,
            phone: trimmedPhone,
          })
        } catch (profileError) {
          console.error('Profile upsert after sign-up failed:', profileError)
        }
      }
      // loading stays true; declarative redirect finishes the job.
      return
    }
    // No session ⇒ email confirmation required: back to sign-in, prefilled.
    setLoading(false)
    switchMode('signin')
    setNotice('Check your email to confirm your account, then sign in.')
  }

  async function sendOtp() {
    if (loading) return
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
    if (loading) return
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

  async function sendResetLink() {
    if (loading) return
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth/reset',
    })
    setLoading(false)
    if (resetError) {
      setError(friendlyAuthError(resetError))
      return
    }
    // Deliberately non-revealing: the same notice whether or not the account
    // exists, so the form can't be used to probe for registered emails.
    setNotice(`If an account exists for ${email}, a reset link is on its way — check your inbox.`)
  }

  function resetToEmailStep() {
    setStep('email')
    setOtp('')
    setError('')
  }

  // Mode switches keep the email (prefill) but clear the signup fields,
  // passwords, codes and messages.
  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setStep('email')
    setOtp('')
    setFullName('')
    setPhone('')
    setPassword('')
    setConfirmPassword('')
    setError('')
    setNotice('')
  }

  return (
    <section className="min-h-[80vh] pt-28 pb-16 px-[5%] flex items-start justify-center">
      <div className="bg-white rounded-2xl overflow-hidden max-w-[400px] w-full shadow-[0_24px_70px_rgba(74,46,38,0.18)] border border-sand animate-pop-in">
        {/* Brand header — gate-style framing */}
        <div className="bg-gradient-to-br from-mocha to-warm px-6 py-8 text-center">
          {/* Full emblem incl. script text (owner directive A): contain at 84%
              over the artwork's own cream so nothing is cropped by the ring. */}
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white/30 mx-auto mb-4 shadow-[0_8px_30px_rgba(0,0,0,.25)] bg-[#f7e8dc] flex items-center justify-center">
            <img src="/images/logo.jpg" alt="Hijab Haven" className="w-[84%] h-[84%] object-contain" />
          </div>
          <h1 className="font-heading text-3xl text-white font-normal">Hijab Haven</h1>
          <p className="text-xs text-white/60 tracking-[0.18em] uppercase mt-1">
            Elegance in Every Drape
          </p>
        </div>

        <div className="p-6">
          <p className="text-sm text-warm text-center leading-relaxed mb-5 font-light">
            {mode === 'signin'
              ? 'Welcome back — sign in with your email and password.'
              : mode === 'signup'
                ? 'Create your account to start shopping.'
                : mode === 'forgot'
                  ? "Enter your email and we'll send you a password reset link."
                  : step === 'email'
                    ? "We'll send a sign-in code to your email."
                    : `Enter the 6-digit code sent to ${email}`}
          </p>

          {mode === 'signin' ? (
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
                  onKeyDown={event => event.key === 'Enter' && void signIn()}
                  placeholder="Your password"
                  className={inputClass}
                />
              </div>
              <button onClick={() => void signIn()} disabled={loading} className={primaryButtonClass}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button onClick={() => switchMode('signup')} className={linkButtonClass}>
                New here? Create an account
              </button>
              <button onClick={() => switchMode('forgot')} className={`${linkButtonClass} mt-2`}>
                Forgot password?
              </button>
              <button onClick={() => switchMode('otp')} className={`${linkButtonClass} mt-2 text-warm/70`}>
                Prefer a code? Email me a sign-in code
              </button>
            </>
          ) : mode === 'signup' ? (
            <>
              <div className="mb-4">
                <label className={labelClass}>Your Name</label>
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  placeholder="e.g. Fatima Shaikh"
                  className={inputClass}
                />
              </div>
              <div className="mb-4">
                <label className={labelClass}>WhatsApp Number</label>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={event => setPhone(event.target.value)}
                  placeholder="e.g. 9876543210"
                  maxLength={15}
                  className={inputClass}
                />
              </div>
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
                <label className={labelClass}>Password (min 8 characters)</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  className={inputClass}
                />
              </div>
              <div className="mb-4">
                <label className={labelClass}>Confirm Password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && void signUp()}
                  placeholder="Repeat your password"
                  className={inputClass}
                />
              </div>
              <button onClick={() => void signUp()} disabled={loading} className={primaryButtonClass}>
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
              <button onClick={() => switchMode('signin')} className={linkButtonClass}>
                Already have an account? Sign in
              </button>
            </>
          ) : mode === 'forgot' ? (
            <>
              <div className="mb-4">
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && void sendResetLink()}
                  placeholder="your@email.com"
                  className={inputClass}
                />
              </div>
              <button
                onClick={() => void sendResetLink()}
                disabled={loading}
                className={primaryButtonClass}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button onClick={() => switchMode('signin')} className={linkButtonClass}>
                ← Back to sign in
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
              <button onClick={() => void sendOtp()} disabled={loading} className={primaryButtonClass}>
                {loading ? 'Sending...' : 'Send Verification Code'}
              </button>
              <button onClick={() => switchMode('signin')} className={linkButtonClass}>
                ← Sign in with password
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
              <button onClick={() => void verifyOtp()} disabled={loading} className={primaryButtonClass}>
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>
              <button
                onClick={() => void sendOtp()}
                disabled={loading || cooldown > 0}
                className={`${linkButtonClass} disabled:opacity-50 disabled:cursor-default`}
              >
                {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
              </button>
              <button onClick={resetToEmailStep} className={`${linkButtonClass} mt-2`}>
                Use a different email
              </button>
            </>
          )}

          {error && (
            <p className="text-rose text-sm text-center mt-3 bg-rose/10 px-3 py-2 rounded-md border border-rose/30">
              {error}
            </p>
          )}

          {notice && (
            <p className="text-mocha text-sm text-center mt-3 bg-sand/30 px-3 py-2 rounded-md border border-sand">
              {notice}
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
