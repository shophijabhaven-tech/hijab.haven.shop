import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { supabase } from '@/lib/supabase'

// /auth/reset — destination of the resetPasswordForEmail link. Supabase appends
// recovery tokens to the redirect URL; supabase-js (detectSessionInUrl, on by
// default) exchanges them for a session during client init, and AuthContext's
// getSession() only resolves after that exchange. So once isLoading is false,
// "no user" reliably means the link was invalid or expired (Supabase strips
// the tokens and redirects with an error fragment instead of a session).

const MIN_PASSWORD_LENGTH = 8

const inputClass =
  'w-full border-[1.5px] border-sand bg-white px-3 py-3 text-sm text-mocha outline-none rounded-md focus:border-rose transition-colors'

const labelClass = 'block text-[0.68rem] tracking-[0.14em] uppercase text-warm mb-1 font-medium'

const primaryButtonClass =
  'w-full bg-rose text-white border-none py-3 text-xs tracking-[0.15em] uppercase rounded-md cursor-pointer hover:bg-mocha transition-colors disabled:opacity-50'

export default function AuthReset() {
  const { user, isAdmin, isLoading, isRoleLoading } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Wait for the recovery session AND the role to settle before rendering, so
  // the post-save redirect can route by role — same race-safe idiom as
  // Auth.tsx (§12.3).
  if (isLoading || (user && isRoleLoading)) return <LoadingSpinner fullPage />

  async function savePassword() {
    if (busy) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    showToast("Password updated — you're signed in.", 'success')
    navigate(isAdmin ? '/admin' : '/', { replace: true })
  }

  return (
    <section className="min-h-[80vh] pt-28 pb-16 px-[5%] flex items-start justify-center">
      <div className="bg-white rounded-2xl overflow-hidden max-w-[400px] w-full shadow-[0_24px_70px_rgba(74,46,38,0.18)] border border-sand animate-pop-in">
        {/* Brand header — same gate-style framing as /auth */}
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
          {user ? (
            <>
              <h2 className="font-heading text-2xl text-mocha text-center mb-2">
                Choose a new password
              </h2>
              <p className="text-sm text-warm text-center leading-relaxed mb-5 font-light">
                Set a new password for {user.email}.
              </p>
              <div className="mb-4">
                <label className={labelClass}>New Password (min 8 characters)</label>
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
                  onKeyDown={event => event.key === 'Enter' && void savePassword()}
                  placeholder="Repeat your password"
                  className={inputClass}
                />
              </div>
              <button
                onClick={() => void savePassword()}
                disabled={busy}
                className={primaryButtonClass}
              >
                {busy ? 'Saving...' : 'Save New Password'}
              </button>
              {error && (
                <p className="text-rose text-sm text-center mt-3 bg-rose/10 px-3 py-2 rounded-md border border-rose/30">
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-warm text-center leading-relaxed mb-5 font-light">
                This reset link is invalid or has expired.
              </p>
              <Link
                to="/auth"
                className="block w-full text-center text-xs text-warm underline"
              >
                ← Back to sign in to request a new link
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
