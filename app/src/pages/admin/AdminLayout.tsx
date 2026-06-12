import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

type AdminNavItem = {
  to: string
  label: string
  end?: boolean
}

// Sidebar shell per §3.2 + §12.3 (V2 nav order: Dashboard, Orders, Products,
// Collections, Customers, Broadcast, Settings, Admins). The "Admins" item
// renders only for super_admin — RLS enforces the writes regardless (§5.4).
// V2 (§12.11) adds the mobile shell: below md the sidebar collapses into a
// sticky top bar + slide-over drawer so the panel stays usable at 390px.
export default function AdminLayout() {
  const { adminRole, signOut } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const navItems: AdminNavItem[] = [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/orders', label: 'Orders' },
    { to: '/admin/products', label: 'Products' },
    { to: '/admin/collections', label: 'Collections' },
    { to: '/admin/customers', label: 'Customers' },
    { to: '/admin/broadcast', label: 'Broadcast' },
    { to: '/admin/settings', label: 'Settings' },
    ...(adminRole === 'super_admin' ? [{ to: '/admin/admins', label: 'Admins' }] : []),
  ]

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/admin/login')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Sign out failed', 'error')
    }
  }

  const brandLink = (
    <Link to="/" className="flex items-center gap-2.5 no-underline">
      <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-rose shrink-0">
        <img src="/images/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
      </div>
      <span className="font-heading text-lg text-blush">Hijab Haven</span>
    </Link>
  )

  // Shared by the desktop sidebar and the mobile drawer; the drawer closes on
  // every navigation so the page behind it is immediately visible.
  function renderNavLinks(onNavigate?: () => void) {
    return navItems.map(item => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `px-5 py-2.5 text-xs tracking-[0.12em] uppercase no-underline transition-colors ${
            isActive
              ? 'bg-warm/40 text-blush border-r-2 border-rose'
              : 'text-blush/60 hover:text-blush'
          }`
        }
      >
        {item.label}
      </NavLink>
    ))
  }

  const signOutButton = (
    <button
      onClick={handleSignOut}
      className="m-4 bg-transparent border border-rose text-rose px-4 py-2 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-rose hover:text-white transition-colors"
    >
      Sign out
    </button>
  )

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-cream">
      {/* ── Mobile top bar (<md) ── */}
      <header className="md:hidden sticky top-0 z-[940] flex items-center justify-between bg-mocha px-4 py-3">
        {brandLink}
        <button
          onClick={() => setMobileNavOpen(open => !open)}
          aria-expanded={mobileNavOpen}
          aria-controls="admin-mobile-nav"
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          className="bg-transparent border border-blush/40 text-blush rounded px-3 py-2 text-base leading-none cursor-pointer hover:border-rose transition-colors"
        >
          {mobileNavOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* ── Mobile slide-over drawer ── */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-[945]">
          <button
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
            className="absolute inset-0 w-full h-full bg-mocha/55 border-none cursor-pointer"
          />
          <div
            id="admin-mobile-nav"
            className="absolute top-0 left-0 bottom-0 w-64 max-w-[85vw] bg-mocha flex flex-col shadow-2xl"
          >
            <div className="px-5 py-5 border-b border-warm/40">{brandLink}</div>
            <nav className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto">
              {renderNavLinks(() => setMobileNavOpen(false))}
            </nav>
            {signOutButton}
          </div>
        </div>
      )}

      {/* ── Desktop sidebar (md+) ── */}
      <aside className="hidden md:flex w-52 shrink-0 bg-mocha flex-col">
        <div className="px-5 py-5 border-b border-warm/40">{brandLink}</div>
        <nav className="flex-1 py-4 flex flex-col gap-1">{renderNavLinks()}</nav>
        {signOutButton}
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  )
}
