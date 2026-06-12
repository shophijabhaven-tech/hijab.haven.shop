import type { ToastEntry, ToastKind } from '@/context/ToastContext'

// Pill styling ported from the live site's .toast (bottom-center, mocha pill).
const KIND_CLASSES: Record<ToastKind, string> = {
  success: 'bg-mocha text-blush',
  info: 'bg-mocha text-blush',
  error: 'bg-rose text-white',
}

export default function Toast({ toasts }: { toasts: ToastEntry[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9000] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`${KIND_CLASSES[toast.kind]} px-6 py-3 rounded-full text-sm shadow-lg animate-fade-in whitespace-nowrap`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
