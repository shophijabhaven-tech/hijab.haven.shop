import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'

// NOTE: RLS is the security boundary — this guard is UX convenience only (§5.4).
// Even if an attacker forces /admin/* to render, every query returns zero rows /
// permission errors without a session whose auth.uid() is in admin_users.
export default function RequireAdmin() {
  const { user, isAdmin, isLoading, isRoleLoading, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // "Sign in with a different account" on the not-authorized block below.
  async function signInDifferently() {
    try {
      await signOut()
    } catch (signOutError) {
      // Navigate regardless: a lingering non-admin session still cannot
      // pass RLS (§5.4).
      console.error('Sign out failed:', signOutError)
    }
    void navigate('/auth')
  }

  // Wait for BOTH the session restore and the role resolution (§12.3) —
  // redirecting or rendering the block before isRoleLoading settles would
  // flash the wrong state at admins whose is_admin RPC is still in flight.
  if (isLoading || (user && isRoleLoading)) return <LoadingSpinner fullPage />

  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />

  if (!isAdmin) {
    // Signed in but not the owner: polite branded block, NOT a silent
    // redirect (§12.3) — a bounce to '/' reads as a bug to a customer who
    // tapped a stale admin link.
    return (
      <section className="min-h-screen flex items-center justify-center bg-cream px-[5%]">
        <div className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-xs tracking-[0.18em] uppercase text-rose mb-2">✦ Owner Access</p>
          <h1 className="font-heading text-3xl text-mocha mb-3">Not authorized</h1>
          <p className="text-sm text-warm leading-relaxed mb-6">
            This area is for the shop owner.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to="/"
              className="w-full bg-rose text-white px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded no-underline hover:bg-mocha transition-colors"
            >
              Home
            </Link>
            <button
              onClick={() => void signInDifferently()}
              className="w-full bg-transparent border-none text-xs text-warm underline cursor-pointer"
            >
              Sign in with a different account
            </button>
          </div>
        </div>
      </section>
    )
  }

  return <Outlet />
}
