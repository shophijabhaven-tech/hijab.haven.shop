import { useCallback, useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'
import { useToast } from '@/context/ToastContext'
import { formatDate, inr } from '@/lib/format'
import {
  fetchAllOrders,
  getPaymentProofUrl,
  updateOrderStatus,
  updatePaymentStatus,
} from '@/lib/queries'
import { waLink } from '@/lib/whatsapp'
import type { Order, OrderStatus, PaymentStatus, ShippingAddress } from '@/lib/supabase'

// 'proof_submitted' is the §12.6 quick-filter on payment_status; the rest
// filter on the order-status lifecycle.
type StatusFilter = 'all' | OrderStatus | 'proof_submitted'

const FILTERS: StatusFilter[] = [
  'all',
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
  'proof_submitted',
]

// §6.3 allowed-transition matrix — the UI's single source of truth.
// delivered and cancelled are terminal (empty list → no buttons rendered).
const TRANSITIONS: Record<OrderStatus, { label: string; next: OrderStatus }[]> = {
  pending: [
    { label: 'Confirm', next: 'confirmed' },
    { label: 'Cancel', next: 'cancelled' },
  ],
  confirmed: [
    { label: 'Mark Shipped', next: 'shipped' },
    { label: 'Cancel', next: 'cancelled' },
  ],
  shipped: [{ label: 'Mark Delivered', next: 'delivered' }],
  delivered: [],
  cancelled: [],
}

// §12.6 payment-badge palette: awaiting_proof=sand, proof_submitted=rose
// (needs attention), verified=mocha, rejected=warm. Deliberately a local pill
// — StatusBadge stays order-status-only.
const PAYMENT_CLASSES: Record<PaymentStatus, string> = {
  awaiting_proof: 'bg-sand text-mocha',
  proof_submitted: 'bg-rose text-white',
  verified: 'bg-mocha text-blush',
  rejected: 'bg-warm text-white',
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  awaiting_proof: 'awaiting proof',
  proof_submitted: 'proof submitted',
  verified: 'payment verified',
  rejected: 'payment rejected',
}

// `status` is undefined at runtime only during the pre-002 deploy window
// (column not yet migrated) — default to the DB default rather than crash.
function PaymentBadge({ status }: { status: PaymentStatus | undefined }) {
  const resolved: PaymentStatus = status ?? 'awaiting_proof'
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-[0.65rem] tracking-[0.12em] uppercase whitespace-nowrap ${PAYMENT_CLASSES[resolved]}`}
    >
      {PAYMENT_LABELS[resolved]}
    </span>
  )
}

function orderCode(order: Order): string {
  return order.order_code ?? `#${order.id}`
}

/**
 * Checkout stores the raw user-entered phone (trimmed, no normalization).
 * For wa.me we strip non-digits and prefix India's 91 when it looks like a
 * bare 10-digit mobile number; anything longer (e.g. already 91-prefixed)
 * passes through as digits.
 */
function waNumber(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

/** Non-empty ShippingAddress lines — guest orders carry only address_line1. */
function addressLines(address: ShippingAddress | null): string[] {
  if (!address) return []
  const cityLine = [address.city, address.state, address.pincode].filter(Boolean).join(', ')
  return [
    address.full_name,
    address.phone,
    address.address_line1,
    address.address_line2,
    cityLine,
  ].filter(Boolean)
}

const SECTION_LABEL = 'text-[0.65rem] tracking-[0.12em] uppercase text-warm mb-2'
const PRIMARY_BTN =
  'bg-rose text-white border-none px-5 py-2 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors disabled:opacity-50 disabled:cursor-default'
const SECONDARY_BTN =
  'bg-transparent border border-sand text-warm px-5 py-2 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors disabled:opacity-50 disabled:cursor-default'

// /admin/orders per §3.2 + §6.3: full order list (newest first from the
// query), client-side status filter chips with counts, row expansion with
// items/address/wa.me/admin_note, and lifecycle transition buttons.
export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({})
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [viewingProofId, setViewingProofId] = useState<number | null>(null)
  const { showToast } = useToast()

  // Lint-safe fetch pattern (Dashboard idiom): the effect only invokes load;
  // all setState happens in the async settle callbacks. Pre-migration the
  // orders table may not exist — fetchAllOrders throws a typed Error and we
  // land in the ErrorBlock-with-retry branch instead of crashing.
  const load = useCallback(() => {
    void fetchAllOrders().then(
      data => {
        setOrders(data)
        setIsLoading(false)
      },
      (err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load orders')
        setIsLoading(false)
      }
    )
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function retry() {
    setIsLoading(true)
    setLoadError(null)
    load()
  }

  function toggleExpand(order: Order) {
    setExpandedId(prev => (prev === order.id ? null : order.id))
    // Seed the note draft once per order so in-progress edits survive collapse.
    setNoteDrafts(prev =>
      order.id in prev ? prev : { ...prev, [order.id]: order.admin_note || '' }
    )
  }

  // §6.3: optimistic status flip + toast; on error revert + error toast.
  function transition(order: Order, next: OrderStatus) {
    const previous = order.status
    setUpdatingId(order.id)
    setOrders(current => current.map(o => (o.id === order.id ? { ...o, status: next } : o)))
    void updateOrderStatus(order.id, next).then(
      () => {
        setUpdatingId(null)
        showToast(`Order ${orderCode(order)} ${next}`, 'success')
      },
      (err: unknown) => {
        setOrders(current =>
          current.map(o => (o.id === order.id ? { ...o, status: previous } : o))
        )
        setUpdatingId(null)
        showToast(err instanceof Error ? err.message : 'Failed to update order', 'error')
      }
    )
  }

  // §12.6 Verify/Reject: same optimistic-flip-and-revert shape as transition().
  // Buttons render only while payment_status === 'proof_submitted' (per spec
  // verified/rejected just display their state; resubmission re-opens it).
  function transitionPayment(order: Order, next: 'verified' | 'rejected') {
    const previous = order.payment_status
    setUpdatingId(order.id)
    setOrders(current =>
      current.map(o => (o.id === order.id ? { ...o, payment_status: next } : o))
    )
    void updatePaymentStatus(order.id, next).then(
      () => {
        setUpdatingId(null)
        showToast(`Payment for ${orderCode(order)} ${next}`, 'success')
      },
      (err: unknown) => {
        setOrders(current =>
          current.map(o => (o.id === order.id ? { ...o, payment_status: previous } : o))
        )
        setUpdatingId(null)
        showToast(err instanceof Error ? err.message : 'Failed to update payment status', 'error')
      }
    )
  }

  // §12.6 View proof: open the tab synchronously inside the click (popup-
  // blocker safe), then point it at the 300s signed URL once it resolves.
  function viewProof(order: Order) {
    const path = order.payment_proof_path
    if (!path || viewingProofId !== null) return
    setViewingProofId(order.id)
    const proofWindow = window.open('about:blank', '_blank')
    void getPaymentProofUrl(path).then(
      url => {
        setViewingProofId(null)
        if (proofWindow) proofWindow.location.href = url
        else window.open(url, '_blank', 'noreferrer')
      },
      (err: unknown) => {
        setViewingProofId(null)
        proofWindow?.close()
        showToast(err instanceof Error ? err.message : 'Failed to load payment proof', 'error')
      }
    )
  }

  // Reuses updateOrderStatus(id, status, adminNote) with the current status —
  // the UPDATE patch then carries both fields and status is a no-op write.
  function saveNote(order: Order) {
    const draft = noteDrafts[order.id] ?? ''
    setSavingNoteId(order.id)
    void updateOrderStatus(order.id, order.status, draft).then(
      () => {
        setOrders(current =>
          current.map(o => (o.id === order.id ? { ...o, admin_note: draft } : o))
        )
        setSavingNoteId(null)
        showToast('Note saved', 'success')
      },
      (err: unknown) => {
        setSavingNoteId(null)
        showToast(err instanceof Error ? err.message : 'Failed to save note', 'error')
      }
    )
  }

  if (isLoading) return <LoadingSpinner />
  if (loadError) {
    return (
      <div>
        <h1 className="font-heading text-3xl text-mocha mb-6">Orders</h1>
        <ErrorBlock message={loadError} onRetry={retry} />
      </div>
    )
  }

  // Counts are derived from the fully-loaded list (cheap; orders are all
  // client-side), so chips double as a status breakdown. proof_submitted
  // counts on payment_status — the §12.6 "needs verification" inbox.
  const counts: Record<StatusFilter, number> = {
    all: orders.length,
    pending: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    proof_submitted: 0,
  }
  for (const order of orders) {
    counts[order.status] += 1
    if (order.payment_status === 'proof_submitted') counts.proof_submitted += 1
  }

  const visibleOrders =
    filter === 'all'
      ? orders
      : filter === 'proof_submitted'
        ? orders.filter(o => o.payment_status === 'proof_submitted')
        : orders.filter(o => o.status === filter)

  return (
    <div>
      <h1 className="font-heading text-3xl text-mocha mb-6">Orders</h1>

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter orders by status">
        {FILTERS.map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`px-4 py-1.5 rounded-full text-[0.65rem] tracking-[0.12em] uppercase border-none cursor-pointer transition-colors ${
              filter === key ? 'bg-mocha text-blush' : 'bg-white text-warm hover:bg-blush/50'
            }`}
          >
            {key.replace('_', ' ')} ({counts[key]})
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">No orders yet.</p>
      ) : visibleOrders.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">
          No {filter.replace('_', ' ')} orders.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map(order => {
            const isExpanded = expandedId === order.id
            const isUpdating = updatingId === order.id
            const items = Array.isArray(order.items) ? order.items : []
            const lines = addressLines(order.shipping_address)
            return (
              <div key={order.id} className="bg-white rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleExpand(order)}
                  aria-expanded={isExpanded}
                  className="w-full grid grid-cols-2 md:grid-cols-[8rem_1fr_6rem_7.5rem_9rem_6.5rem] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm text-mocha bg-transparent border-none cursor-pointer hover:bg-blush/20 transition-colors"
                >
                  <span className="font-medium">{orderCode(order)}</span>
                  <span className="truncate">{order.customer_name}</span>
                  <span>{inr(order.total)}</span>
                  <span>
                    <StatusBadge status={order.status} />
                  </span>
                  <span>
                    <PaymentBadge status={order.payment_status} />
                  </span>
                  <span className="text-xs text-warm whitespace-nowrap md:text-right">
                    {formatDate(order.created_at)}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-blush px-4 py-4 grid gap-6 md:grid-cols-2">
                    <div>
                      <h3 className={SECTION_LABEL}>Items</h3>
                      <ul className="list-none p-0 m-0 space-y-2">
                        {items.map(item => (
                          <li
                            key={item.product_id}
                            className="flex items-center gap-3 text-sm text-mocha"
                          >
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt=""
                                loading="lazy"
                                className="w-10 h-10 rounded object-cover shrink-0"
                              />
                            ) : (
                              <span className="w-10 h-10 rounded bg-blush shrink-0" />
                            )}
                            <span>
                              {item.name} × {item.quantity} = {inr(item.price * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-sm text-mocha font-medium mt-3">
                        Total: {inr(order.total)}
                      </p>
                    </div>

                    <div>
                      <h3 className={SECTION_LABEL}>Shipping address</h3>
                      {lines.length > 0 ? (
                        <div className="text-sm text-mocha leading-relaxed">
                          {lines.map(line => (
                            <p key={line} className="m-0">
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-warm m-0">No address provided.</p>
                      )}

                      <h3 className={`${SECTION_LABEL} mt-4`}>Customer phone</h3>
                      <a
                        href={waLink(
                          waNumber(order.customer_phone),
                          `Hi ${order.customer_name}, this is Hijab Haven about your order ${orderCode(order)}.`
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-rose no-underline hover:text-mocha transition-colors"
                      >
                        {order.customer_phone} — WhatsApp ↗
                      </a>
                    </div>

                    {/* ── Payment verification (§12.6) ── */}
                    <div className="md:col-span-2 border-t border-blush/60 pt-4">
                      <h3 className={SECTION_LABEL}>Payment</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <PaymentBadge status={order.payment_status} />
                        <span className="text-sm text-mocha">
                          Payment ID:{' '}
                          <span className="font-medium">{order.payment_ref ?? '—'}</span>
                        </span>
                        {order.proof_submitted_at && (
                          <span className="text-xs text-warm whitespace-nowrap">
                            Proof submitted {formatDate(order.proof_submitted_at)}
                          </span>
                        )}
                        {order.payment_proof_path && (
                          <button
                            onClick={() => viewProof(order)}
                            disabled={viewingProofId !== null}
                            className={SECONDARY_BTN}
                          >
                            {viewingProofId === order.id ? 'Opening…' : 'View proof ↗'}
                          </button>
                        )}
                        {order.payment_status === 'proof_submitted' && (
                          <>
                            <button
                              disabled={isUpdating}
                              onClick={() => transitionPayment(order, 'verified')}
                              className={PRIMARY_BTN}
                            >
                              Verify payment
                            </button>
                            <button
                              disabled={isUpdating}
                              onClick={() => transitionPayment(order, 'rejected')}
                              className={SECONDARY_BTN}
                            >
                              Reject payment
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor={`admin-note-${order.id}`} className={`block ${SECTION_LABEL}`}>
                        Admin note
                      </label>
                      <textarea
                        id={`admin-note-${order.id}`}
                        rows={2}
                        value={noteDrafts[order.id] ?? ''}
                        onChange={e =>
                          setNoteDrafts(prev => ({ ...prev, [order.id]: e.target.value }))
                        }
                        placeholder="Internal note (only admins see this)"
                        className="w-full bg-cream border border-sand rounded p-3 text-sm text-mocha resize-y focus:outline-none focus:border-rose"
                      />
                      <button
                        onClick={() => saveNote(order)}
                        disabled={savingNoteId === order.id}
                        className={`${SECONDARY_BTN} mt-2`}
                      >
                        {savingNoteId === order.id ? 'Saving…' : 'Save note'}
                      </button>
                    </div>

                    <div className="md:col-span-2 flex flex-wrap items-center gap-3 border-t border-blush/60 pt-4">
                      {TRANSITIONS[order.status].length === 0 ? (
                        <p className="text-xs text-warm m-0">
                          This order is {order.status} — no further actions.
                        </p>
                      ) : (
                        TRANSITIONS[order.status].map(action => (
                          <button
                            key={action.next}
                            disabled={isUpdating}
                            onClick={() =>
                              action.next === 'cancelled'
                                ? setCancelTarget(order)
                                : transition(order, action.next)
                            }
                            className={action.next === 'cancelled' ? SECONDARY_BTN : PRIMARY_BTN}
                          >
                            {action.label}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel order"
        message={
          cancelTarget
            ? `Cancel order ${orderCode(cancelTarget)}? Stock is NOT auto-restocked.`
            : ''
        }
        confirmLabel="Cancel order"
        onConfirm={() => {
          if (cancelTarget) transition(cancelTarget, 'cancelled')
          setCancelTarget(null)
        }}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  )
}
