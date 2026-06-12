import { NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

const TABS = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/orders', label: 'Orders', end: false },
  { to: '/account/wishlist', label: 'Wishlist', end: false },
]

export default function AccountLayout() {
  const { signOut } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Sign out failed', 'error')
    }
  }

  return (
    <section className="min-h-[70vh] pt-28 pb-16 px-[5%] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl text-mocha">My Account</h1>
        <button
          onClick={handleSignOut}
          className="bg-transparent border border-sand text-warm px-4 py-2 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors"
        >
          Sign out
        </button>
      </div>

      <div className="flex gap-2 border-b border-sand mb-8">
        {TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `px-4 py-2.5 text-xs tracking-[0.14em] uppercase no-underline -mb-px border-b-2 transition-colors ${
                isActive
                  ? 'border-rose text-rose'
                  : 'border-transparent text-warm hover:text-rose'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </section>
  )
}
