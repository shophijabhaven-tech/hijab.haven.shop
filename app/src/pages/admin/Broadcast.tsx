import { useCallback, useEffect, useMemo, useState } from 'react'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import { fetchCustomers } from '@/lib/queries'
import type { Customer } from '@/lib/supabase'
import { waLink } from '@/lib/whatsapp'

/** 10-digit Indian numbers get the 91 country prefix; longer values pass through. */
function phone91(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

type BroadcastPhase = 'idle' | 'running' | 'done'

// /admin/broadcast per §6.5: compose + live preview, customer checklist
// (default all checked), then a sequential one-tap-per-customer wa.me flow —
// WhatsApp offers no free bulk-send API, so this preserves the live admin
// panel's manual broadcast with progress tracking.
export default function Broadcast() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [phase, setPhase] = useState<BroadcastPhase>('idle')
  const [openedCount, setOpenedCount] = useState(0)

  // Effects only invoke the fetch; all setState happens in the async
  // callbacks (react-hooks/set-state-in-effect — Dashboard's pattern).
  const load = useCallback(() => {
    fetchCustomers()
      .then(data => {
        setCustomers(data)
        setSelectedIds(new Set(data.map(customer => customer.id))) // default: all checked
        setError(null)
        setIsLoading(false)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Failed to load customers')
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function retry() {
    setIsLoading(true)
    setError(null)
    load()
  }

  // Compose + checklist are locked while a run is in progress, so this list
  // is stable for the whole run (targets in list order, i.e. newest first).
  const targets = useMemo(
    () => customers.filter(customer => selectedIds.has(customer.id)),
    [customers, selectedIds]
  )

  const total = targets.length
  const allSelected = customers.length > 0 && selectedIds.size === customers.length
  const isLocked = phase !== 'idle'
  const canStart = message.trim().length > 0 && total > 0

  function toggleCustomer(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(customers.map(customer => customer.id)))
  }

  function openNextChat() {
    const target = targets[openedCount]
    if (!target) return
    window.open(waLink(phone91(target.phone), message))
    const next = openedCount + 1
    setOpenedCount(next)
    if (next >= total) setPhase('done')
  }

  function restart() {
    setOpenedCount(0)
    setPhase('running')
  }

  function stop() {
    setOpenedCount(0)
    setPhase('idle')
  }

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorBlock message={error} onRetry={retry} />

  const nextTarget = targets[openedCount]
  const progressPercent = total === 0 ? 0 : Math.round((openedCount / total) * 100)

  return (
    <div>
      <h1 className="font-heading text-3xl text-mocha mb-6">Broadcast</h1>

      {customers.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">
          No customers yet — the broadcast list comes from gate signups.
        </p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* Compose + preview + run controls */}
          <div className="bg-white rounded-lg p-5">
            <label
              htmlFor="broadcast-message"
              className="block text-xs tracking-[0.12em] uppercase text-warm mb-1.5"
            >
              Message
            </label>
            <textarea
              id="broadcast-message"
              rows={5}
              value={message}
              disabled={isLocked}
              onChange={event => setMessage(event.target.value)}
              placeholder={'New arrivals at Hijab Haven! 🧕💕\nUse *asterisks* for bold on WhatsApp.'}
              className="w-full border border-blush rounded px-3.5 py-2.5 text-sm text-mocha bg-cream/50 outline-none focus:border-rose transition-colors resize-y disabled:opacity-60"
            />

            <p className="text-xs tracking-[0.12em] uppercase text-warm mt-4 mb-1.5">Preview</p>
            <div className="bg-cream rounded-lg rounded-bl-none border border-blush px-4 py-3 min-h-12">
              {message.trim() ? (
                <p className="text-sm text-mocha leading-relaxed whitespace-pre-wrap">{message}</p>
              ) : (
                <p className="text-sm text-warm italic">Your message preview appears here.</p>
              )}
            </div>

            <div className="mt-5 pt-5 border-t border-blush/60">
              {phase === 'idle' && (
                <>
                  <button
                    onClick={() => setPhase('running')}
                    disabled={!canStart}
                    className="w-full bg-rose text-white border-none px-7 py-3 text-xs tracking-[0.15em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Start broadcast
                  </button>
                  {!canStart && (
                    <p className="text-xs text-warm mt-2 text-center">
                      {message.trim().length === 0
                        ? 'Write a message to start.'
                        : 'Select at least one customer.'}
                    </p>
                  )}
                </>
              )}

              {phase === 'running' && nextTarget && (
                <button
                  onClick={openNextChat}
                  className="w-full bg-rose text-white border-none px-7 py-3 text-xs tracking-[0.15em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors"
                >
                  Open chat {openedCount + 1} of {total} — {nextTarget.name}
                </button>
              )}

              {phase === 'done' && (
                <p
                  role="status"
                  className="text-center text-sm text-mocha bg-blush/40 rounded px-4 py-3"
                >
                  Done — {total} chats opened.
                </p>
              )}

              {isLocked && (
                <>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={openedCount}
                    aria-label="Broadcast progress"
                    className="mt-4 h-1.5 bg-blush/60 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-rose rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-warm mt-1.5 text-center">
                    {openedCount} of {total} opened
                  </p>

                  <div className="flex justify-center gap-3 mt-3">
                    <button
                      onClick={restart}
                      className="bg-transparent border border-sand text-warm px-4 py-2 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors"
                    >
                      Restart
                    </button>
                    <button
                      onClick={stop}
                      className="bg-transparent border border-rose text-rose px-4 py-2 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-rose hover:text-white transition-colors"
                    >
                      Stop
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Customer checklist */}
          <div className="bg-white rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-xl text-mocha">
                Recipients{' '}
                <span className="text-sm text-warm font-sans">({selectedIds.size} selected)</span>
              </h2>
              <button
                onClick={toggleAll}
                disabled={isLocked}
                className="bg-transparent border border-sand text-warm px-3.5 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {allSelected ? 'Select none' : 'Select all'}
              </button>
            </div>

            <ul className="max-h-[26rem] overflow-y-auto divide-y divide-blush/40">
              {customers.map(customer => (
                <li key={customer.id}>
                  <label className="flex items-center gap-3 px-1 py-2.5 text-sm text-mocha cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(customer.id)}
                      disabled={isLocked}
                      onChange={() => toggleCustomer(customer.id)}
                      className="accent-rose w-4 h-4 shrink-0"
                    />
                    <span className="flex-1 truncate">{customer.name}</span>
                    <span className="text-xs text-warm whitespace-nowrap">{customer.phone}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
