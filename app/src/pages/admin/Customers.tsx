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

/** RFC-4180 escaping: quote a field containing comma/quote/newline, double inner quotes. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** §6.5 client-side CSV: exact header `name,phone,joined_date`, Blob download. */
function downloadCustomersCsv(customers: Customer[]): void {
  const rows = customers.map(customer =>
    [customer.name, customer.phone, customer.joined_date].map(csvField).join(',')
  )
  const csv = ['name,phone,joined_date', ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'hijab-haven-customers.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

// /admin/customers per §3.2/§6.5: gate-signup list (newest first via the query's
// created_at ordering) + client-side search + CSV export. Pre-migration the
// customers SELECT 500s for admins (admin_users RLS recursion, §4.2) — the
// ErrorBlock + retry below is the graceful path until the migration lands.
export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Effects only invoke the fetch; all setState happens in the async
  // callbacks (react-hooks/set-state-in-effect — Dashboard's pattern).
  const load = useCallback(() => {
    fetchCustomers()
      .then(data => {
        setCustomers(data)
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return customers
    return customers.filter(
      customer =>
        customer.name.toLowerCase().includes(query) || customer.phone.includes(query)
    )
  }, [customers, search])

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorBlock message={error} onRetry={retry} />

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-heading text-3xl text-mocha">Customers</h1>
        <button
          onClick={() => downloadCustomersCsv(customers)}
          disabled={customers.length === 0}
          className="bg-rose text-white border-none px-5 py-2.5 text-xs tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Export CSV
        </button>
      </div>

      <div className="mb-4 max-w-sm">
        <label htmlFor="customer-search" className="sr-only">
          Search customers
        </label>
        <input
          id="customer-search"
          type="search"
          placeholder="Search by name or phone…"
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="w-full border border-blush rounded px-3.5 py-2.5 text-sm text-mocha bg-white outline-none focus:border-rose transition-colors"
        />
      </div>

      {customers.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">No customer signups yet.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">No customers match “{search}”.</p>
      ) : (
        <div className="bg-white rounded-lg overflow-x-auto">
          <table className="w-full text-sm text-mocha">
            <thead>
              <tr className="text-left text-[0.65rem] tracking-[0.12em] uppercase text-warm border-b border-blush">
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Phone</th>
                <th className="px-4 py-3 font-normal">Joined</th>
                <th className="px-4 py-3 font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(customer => (
                <tr key={customer.id} className="border-b border-blush/40 last:border-b-0">
                  <td className="px-4 py-3">{customer.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a
                      href={waLink(phone91(customer.phone), '')}
                      target="_blank"
                      rel="noreferrer"
                      className="text-rose no-underline hover:text-mocha transition-colors"
                    >
                      {customer.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{customer.joined_date}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => window.open(waLink(phone91(customer.phone), ''))}
                      className="bg-transparent border border-rose text-rose px-3.5 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-rose hover:text-white transition-colors"
                    >
                      Message
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-warm mt-3">
        {filtered.length} of {customers.length} customers
      </p>
    </div>
  )
}
