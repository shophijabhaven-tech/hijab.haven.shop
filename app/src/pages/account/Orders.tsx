import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import { formatDate, inr } from '@/lib/format'
import { fetchMyOrders } from '@/lib/queries'
import type { Order } from '@/lib/supabase'

// WP-07: own order history (RLS scopes the SELECT). The orders table may not
// exist until the WP-02 migration runs — a fetch error renders ErrorBlock (§9.1).
export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [version, setVersion] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // loading starts true and is re-armed by retry() — no synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false
    fetchMyOrders()
      .then(rows => {
        if (!cancelled) setOrders(rows)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load your orders')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [version])

  function retry() {
    setLoading(true)
    setLoadError('')
    setVersion(current => current + 1)
  }

  if (loading) return <LoadingSpinner />
  if (loadError) return <ErrorBlock message={loadError} onRetry={retry} />

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <div className="text-5xl mb-3">📦</div>
        <p className="text-sm text-warm mb-5">No orders yet</p>
        <Link
          to="/shop"
          className="inline-block bg-rose text-white no-underline px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded hover:bg-mocha transition-colors"
        >
          Browse the Shop
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {orders.map(order => {
        const expanded = expandedId === order.id
        const address = order.shipping_address
        return (
          <div key={order.id} className="bg-white rounded-md mb-3 border border-sand overflow-hidden">
            <button
              onClick={() => setExpandedId(expanded ? null : order.id)}
              aria-expanded={expanded}
              className="w-full flex flex-wrap items-center justify-between gap-2 bg-transparent border-none p-4 cursor-pointer text-left"
            >
              <div>
                <p className="text-sm text-mocha font-medium">{order.order_code ?? `#${order.id}`}</p>
                <p className="text-xs text-warm mt-0.5">{formatDate(order.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={order.status} />
                <span className="text-sm font-medium text-mocha">{inr(order.total)}</span>
                <span className="text-xs text-warm">{expanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded && (
              <div className="px-4 pb-4 border-t border-sand/60 animate-fade-in">
                <p className="text-[0.68rem] tracking-[0.14em] uppercase text-warm mt-3 mb-2 font-medium">
                  Items
                </p>
                {order.items.map((item, index) => (
                  <div
                    key={`${item.product_id}-${index}`}
                    className="flex justify-between items-center text-sm py-1"
                  >
                    <span className="text-mocha">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="text-warm">{inr(item.price * item.quantity)}</span>
                  </div>
                ))}

                <p className="text-[0.68rem] tracking-[0.14em] uppercase text-warm mt-4 mb-2 font-medium">
                  Shipping Address
                </p>
                <p className="text-xs text-warm leading-relaxed">
                  {address.full_name}
                  <br />
                  {address.address_line1}
                  {address.address_line2 ? `, ${address.address_line2}` : ''}
                  <br />
                  {address.city}, {address.state} - {address.pincode}
                  <br />
                  {address.phone}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
