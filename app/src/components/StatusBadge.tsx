import type { OrderStatus } from '@/lib/supabase'

// Status pill colors per §6.2:
// pending=sand, confirmed=blush, shipped=rose, delivered=mocha, cancelled=warm.
const STATUS_CLASSES: Record<OrderStatus, string> = {
  pending: 'bg-sand text-mocha',
  confirmed: 'bg-blush text-mocha',
  shipped: 'bg-rose text-white',
  delivered: 'bg-mocha text-blush',
  cancelled: 'bg-warm text-white',
}

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-[0.65rem] tracking-[0.12em] uppercase ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  )
}
