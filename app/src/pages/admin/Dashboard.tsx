import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import { formatDate, inr } from '@/lib/format'
import { fetchAdminCounts, fetchAllOrders } from '@/lib/queries'
import type { AdminCounts } from '@/lib/queries'
import type { Order } from '@/lib/supabase'

type StatCard = {
  label: string
  value: number | null
  to: string
}

const RECENT_LIMIT = 5

// /admin index per §3.2: stat-card counts + 5 most recent orders. Counts and
// the orders list load independently so a pre-migration table failure
// degrades one section instead of crashing the dashboard (§9).
export default function Dashboard() {
  const [counts, setCounts] = useState<AdminCounts | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // setState only inside the settle callback (AuthContext's effect pattern):
  // initial state already reads loading/no-error, and the retry path resets
  // both before re-invoking. fetchAdminCounts never rejects (per-count
  // allSettled inside); fetchAllOrders may, and only takes down the
  // recent-orders section.
  const load = useCallback(() => {
    void Promise.allSettled([fetchAdminCounts(), fetchAllOrders()]).then(
      ([countsResult, ordersResult]) => {
        setCounts(countsResult.status === 'fulfilled' ? countsResult.value : null)
        if (ordersResult.status === 'fulfilled') {
          setRecentOrders(ordersResult.value.slice(0, RECENT_LIMIT))
        } else {
          setOrdersError(
            ordersResult.reason instanceof Error
              ? ordersResult.reason.message
              : 'Failed to load orders'
          )
        }
        setIsLoading(false)
      }
    )
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function retry() {
    setIsLoading(true)
    setOrdersError(null)
    load()
  }

  if (isLoading) return <LoadingSpinner />

  const cards: StatCard[] = [
    { label: 'Pending Orders', value: counts?.pendingOrders ?? null, to: '/admin/orders' },
    { label: 'Total Orders', value: counts?.totalOrders ?? null, to: '/admin/orders' },
    { label: 'Products', value: counts?.products ?? null, to: '/admin/products' },
    { label: 'Customers', value: counts?.customers ?? null, to: '/admin/customers' },
  ]

  return (
    <div>
      <h1 className="font-heading text-3xl text-mocha mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(card => (
          <Link
            key={card.label}
            to={card.to}
            className="bg-white rounded-lg p-5 no-underline hover:shadow-md transition-shadow"
          >
            <p className="text-[0.65rem] tracking-[0.12em] uppercase text-warm mb-2">
              {card.label}
            </p>
            <p className="font-heading text-3xl text-mocha">{card.value ?? '—'}</p>
          </Link>
        ))}
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-heading text-xl text-mocha">Recent Orders</h2>
        <Link
          to="/admin/orders"
          className="text-xs tracking-[0.12em] uppercase text-rose no-underline hover:text-mocha transition-colors"
        >
          View all →
        </Link>
      </div>

      {ordersError ? (
        <ErrorBlock message={ordersError} onRetry={retry} />
      ) : recentOrders.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">No orders yet.</p>
      ) : (
        <div className="bg-white rounded-lg overflow-hidden">
          <table className="w-full text-sm text-mocha">
            <thead>
              <tr className="text-left text-[0.65rem] tracking-[0.12em] uppercase text-warm border-b border-blush">
                <th className="px-4 py-3 font-normal">Order</th>
                <th className="px-4 py-3 font-normal">Customer</th>
                <th className="px-4 py-3 font-normal">Total</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(order => (
                <tr key={order.id} className="border-b border-blush/40 last:border-b-0">
                  <td className="px-4 py-3">{order.order_code ?? `#${order.id}`}</td>
                  <td className="px-4 py-3">{order.customer_name}</td>
                  <td className="px-4 py-3">{inr(order.total)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
