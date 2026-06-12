import { Navigate, Outlet, useLocation } from 'react-router'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'

// NOTE: RLS is the security boundary — this guard is UX convenience only (§5.4).
// Even if it is bypassed, every query behind it returns zero rows without a
// session whose auth.uid() owns the data.
export default function RequireAuth() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <LoadingSpinner fullPage />
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />
  return <Outlet />
}
