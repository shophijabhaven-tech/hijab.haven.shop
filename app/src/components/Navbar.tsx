import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'

// Ported from App Build; styling mirrors the live site's nav (§8).
// Links per §7 as amended by §12.8: Home, Shop, Hampers (/#hampers) —
// the Payment (/#payment) link is removed with the Home #payment section.
export default function Navbar() {
  const { user, isAdmin } = useAuth()
  const { cartCount, openCart } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)

  const links = [
    { to: '/', label: 'Home' },
    { to: '/shop', label: 'Shop' },
    { to: '/#hampers', label: 'Hampers' },
  ]

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-[500] flex items-center justify-between px-[4%] py-3 bg-cream/[.93] backdrop-blur-[14px] border-b border-rose/[.18]">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <div className="w-11 h-11 rounded-full overflow-hidden border-[2.5px] border-rose shrink-0">
            <img src="/images/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <span className="font-heading text-xl font-semibold text-mocha">Hijab Haven</span>
        </Link>

        <ul className="hidden md:flex gap-8 list-none">
          {links.map(link => (
            <li key={link.to}>
              <Link
                to={link.to}
                className="no-underline text-warm text-xs tracking-[0.15em] uppercase hover:text-rose transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <button
            onClick={openCart}
            className="relative border-2 border-rose text-rose px-3 py-1.5 text-xs rounded flex items-center gap-1.5 hover:bg-rose hover:text-white transition-all cursor-pointer"
          >
            🛒 Cart
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-mocha text-white w-[18px] h-[18px] rounded-full text-[0.65rem] flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>

          {user ? (
            // Role-aware button per §12.3: admins get "⚙ Owner Panel" → /admin
            // (same single button as V1, relabeled); customers get Account.
            <Link
              to={isAdmin ? '/admin' : '/account'}
              className="bg-mocha text-blush border-none px-3 py-1.5 text-xs tracking-[0.1em] uppercase rounded hover:bg-warm transition-colors no-underline cursor-pointer"
            >
              {isAdmin ? '⚙ Owner Panel' : '👤 Account'}
            </Link>
          ) : (
            <Link
              to="/auth"
              className="bg-mocha text-blush border-none px-3 py-1.5 text-xs tracking-[0.1em] uppercase rounded hover:bg-warm transition-colors no-underline cursor-pointer"
            >
              Sign In
            </Link>
          )}

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
            className="md:hidden bg-transparent border-none cursor-pointer p-2 z-[501]"
          >
            <span
              className={`block w-[22px] h-[2px] bg-mocha my-[5px] rounded transition-all ${mobileOpen ? 'rotate-45 translate-y-[7px]' : ''}`}
            />
            <span
              className={`block w-[22px] h-[2px] bg-mocha my-[5px] rounded transition-all ${mobileOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`block w-[22px] h-[2px] bg-mocha my-[5px] rounded transition-all ${mobileOpen ? '-rotate-45 -translate-y-[7px]' : ''}`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile Nav Overlay (parity with live #mobileNav) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[499] bg-cream/[.98] backdrop-blur-[10px] flex flex-col items-center justify-center gap-8">
          {links.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className="no-underline text-mocha text-xl tracking-[0.15em] uppercase font-medium px-8 py-3 rounded-md hover:bg-blush hover:text-rose transition-all"
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className="no-underline text-mocha text-xl tracking-[0.15em] uppercase font-medium px-8 py-3 rounded-md hover:bg-blush hover:text-rose transition-all"
            >
              ⚙ Owner Panel
            </Link>
          )}
        </div>
      )}
    </>
  )
}
