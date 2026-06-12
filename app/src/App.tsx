import { Suspense, lazy } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import CartDrawer from '@/components/CartDrawer'
import Footer from '@/components/Footer'
import LoadingSpinner from '@/components/LoadingSpinner'
import Navbar from '@/components/Navbar'
import Splash from '@/components/Splash'
import RequireAdmin from '@/components/guards/RequireAdmin'
import RequireAuth from '@/components/guards/RequireAuth'
import Auth from '@/pages/Auth'
import AuthReset from '@/pages/AuthReset'
import Checkout from '@/pages/Checkout'
import Home from '@/pages/Home'
import NotFound from '@/pages/NotFound'
import Product from '@/pages/Product'
import Shop from '@/pages/Shop'
import AccountLayout from '@/pages/account/AccountLayout'
import AccountOrders from '@/pages/account/Orders'
import AccountWishlist from '@/pages/account/Wishlist'
import Profile from '@/pages/account/Profile'

// Admin pages are lazy-loaded so customers never download the admin bundle (QA WP-12 P2-1).
const AdminCollections = lazy(() => import('@/pages/admin/Collections'))
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminOrders = lazy(() => import('@/pages/admin/Orders'))
const AdminProducts = lazy(() => import('@/pages/admin/Products'))
const AdminSettings = lazy(() => import('@/pages/admin/Settings'))
const Admins = lazy(() => import('@/pages/admin/Admins'))
const Broadcast = lazy(() => import('@/pages/admin/Broadcast'))
const Customers = lazy(() => import('@/pages/admin/Customers'))
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'))

// Customer chrome: Splash overlay + Navbar + page + Footer + CartDrawer.
// The entry gate is retired (owner directive, supersedes §12.1/§12.2): the
// splash plays once per session, then visitors go straight into the shop.
// New-customer data collection now lives in the /auth signup form. Splash
// never renders on /admin/* because admin routes use AdminLayout (§3.1).
function CustomerLayout() {
  return (
    <>
      <Splash />
      <Navbar />
      <main className="min-h-screen">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}

// Route tree per §3. Guards are UX only — RLS is the security boundary (§5.4).
export default function App() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/shop/:category" element={<Shop />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/reset" element={<AuthReset />} />
        <Route element={<RequireAuth />}>
          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<Profile />} />
            <Route path="orders" element={<AccountOrders />} />
            <Route path="wishlist" element={<AccountWishlist />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Permanent redirect: /admin/login is superseded by the unified /auth (§12.3);
          old bookmarks keep working. */}
      <Route path="/admin/login" element={<Navigate to="/auth" replace />} />
      <Route element={<RequireAdmin />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="collections" element={<AdminCollections />} />
          <Route path="customers" element={<Customers />} />
          <Route path="broadcast" element={<Broadcast />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="admins" element={<Admins />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  )
}
