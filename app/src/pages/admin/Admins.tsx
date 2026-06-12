import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { addAdminUser, fetchAdminUsers, removeAdminUser, updateAdminRole } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import type { AdminRole, AdminUser } from '@/lib/supabase'

const inputClasses =
  'w-full border border-blush rounded px-3.5 py-2.5 text-sm text-mocha bg-cream/50 outline-none focus:border-rose transition-colors'

const labelClasses = 'block text-xs tracking-[0.12em] uppercase text-warm mb-1.5'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function RoleBadge({ role }: { role: AdminRole }) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full text-[0.6rem] tracking-[0.12em] uppercase ${
        role === 'super_admin' ? 'bg-rose text-white' : 'bg-sand text-mocha'
      }`}
    >
      {role === 'super_admin' ? 'Super admin' : 'Admin'}
    </span>
  )
}

// /admin/admins per §3.2/§5.4: super_admin gets full management; plain admin
// gets a read-only list with a notice (plus the send-password-reset action,
// which only emails a link — no data mutation). The adminRole check here is UX only —
// RLS on admin_users is the real boundary, so even a forced render of the
// management UI cannot write anything without a super_admin session.
export default function Admins() {
  const { user, adminRole } = useAuth()
  const { showToast } = useToast()

  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Add-admin form (super_admin only)
  const [newId, setNewId] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newRole, setNewRole] = useState<AdminRole>('admin')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Per-row mutations
  const [pendingRemove, setPendingRemove] = useState<AdminUser | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const isSuperAdmin = adminRole === 'super_admin'

  // Effects only invoke the fetch; all setState happens in the async
  // callbacks (react-hooks/set-state-in-effect — Dashboard's pattern).
  const load = useCallback(() => {
    fetchAdminUsers()
      .then(data => {
        setAdmins(data)
        setError(null)
        setIsLoading(false)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Failed to load admins')
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

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = newId.trim()
    if (!UUID_PATTERN.test(id)) {
      showToast('That does not look like a valid auth user UUID.', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      await addAdminUser({
        id,
        email: newEmail.trim(),
        display_name: newDisplayName.trim(),
        role: newRole,
      })
      showToast('Admin added.', 'success')
      setNewId('')
      setNewEmail('')
      setNewDisplayName('')
      setNewRole('admin')
      load()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Failed to add admin', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleRole(admin: AdminUser) {
    const nextRole: AdminRole = admin.role === 'super_admin' ? 'admin' : 'super_admin'
    setBusyId(admin.id)
    try {
      await updateAdminRole(admin.id, nextRole)
      showToast(`${admin.display_name || admin.email} is now ${nextRole.replace('_', ' ')}.`, 'success')
      load()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Failed to update role', 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Any admin may send this — it only emails a recovery link; the recipient
  // still has to open their inbox to act on it.
  async function handleSendReset(admin: AdminUser) {
    setBusyId(admin.id)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(admin.email, {
      redirectTo: window.location.origin + '/auth/reset',
    })
    setBusyId(null)
    if (resetError) {
      showToast(resetError.message, 'error')
      return
    }
    showToast(`Reset link sent to ${admin.email}`, 'success')
  }

  async function handleRemove() {
    if (!pendingRemove) return
    const target = pendingRemove
    setPendingRemove(null)
    setBusyId(target.id)
    try {
      await removeAdminUser(target.id)
      showToast(`${target.display_name || target.email} removed.`, 'success')
      load()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Failed to remove admin', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorBlock message={error} onRetry={retry} />

  return (
    <div>
      <h1 className="font-heading text-3xl text-mocha mb-6">Admins</h1>

      {!isSuperAdmin && (
        <p className="text-sm text-warm bg-blush/40 rounded px-4 py-3 mb-6">
          Super admin only — you can view but not modify.
        </p>
      )}

      {admins.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">No admin accounts found.</p>
      ) : (
        <div className="bg-white rounded-lg overflow-x-auto mb-8">
          <table className="w-full text-sm text-mocha">
            <thead>
              <tr className="text-left text-[0.65rem] tracking-[0.12em] uppercase text-warm border-b border-blush">
                <th className="px-4 py-3 font-normal">Email</th>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Role</th>
                <th className="px-4 py-3 font-normal">Added</th>
                <th className="px-4 py-3 font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => {
                const isSelf = admin.id === user?.id
                const isBusy = busyId === admin.id
                return (
                  <tr key={admin.id} className="border-b border-blush/40 last:border-b-0">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {admin.email}
                      {isSelf && <span className="text-xs text-warm ml-1.5">(you)</span>}
                    </td>
                    <td className="px-4 py-3">{admin.display_name}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={admin.role} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(admin.created_at)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => void handleSendReset(admin)}
                        disabled={isBusy}
                        className="bg-transparent border border-sand text-warm px-3 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Send password reset
                      </button>
                      {isSuperAdmin && (
                        <>
                          <button
                            onClick={() => void handleToggleRole(admin)}
                            disabled={isBusy}
                            className="bg-transparent border border-sand text-warm px-3 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ml-2 mr-2"
                          >
                            {admin.role === 'super_admin' ? 'Make admin' : 'Make super admin'}
                          </button>
                          <button
                            onClick={() => setPendingRemove(admin)}
                            disabled={isSelf || isBusy}
                            title={isSelf ? 'You cannot remove your own account' : undefined}
                            className="bg-transparent border border-rose text-rose px-3 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-rose hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-rose"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {isSuperAdmin && (
        <div className="bg-white rounded-lg p-5 max-w-lg">
          <h2 className="font-heading text-xl text-mocha mb-2">Add admin</h2>
          <p className="text-xs text-warm leading-relaxed mb-4">
            The person must first have an account — create their auth user in Supabase Dashboard
            → Authentication → Users, then paste the User UID here.
          </p>

          <form onSubmit={event => void handleAdd(event)} className="flex flex-col gap-4">
            <div>
              <label htmlFor="admin-uuid" className={labelClasses}>
                Auth user UUID
              </label>
              <input
                id="admin-uuid"
                type="text"
                required
                placeholder="00000000-0000-0000-0000-000000000000"
                value={newId}
                onChange={event => setNewId(event.target.value)}
                className={inputClasses}
              />
            </div>

            <div>
              <label htmlFor="admin-new-email" className={labelClasses}>
                Email
              </label>
              <input
                id="admin-new-email"
                type="email"
                required
                value={newEmail}
                onChange={event => setNewEmail(event.target.value)}
                className={inputClasses}
              />
            </div>

            <div>
              <label htmlFor="admin-display-name" className={labelClasses}>
                Display name
              </label>
              <input
                id="admin-display-name"
                type="text"
                required
                value={newDisplayName}
                onChange={event => setNewDisplayName(event.target.value)}
                className={inputClasses}
              />
            </div>

            <div>
              <label htmlFor="admin-role" className={labelClasses}>
                Role
              </label>
              <select
                id="admin-role"
                value={newRole}
                onChange={event => setNewRole(event.target.value === 'super_admin' ? 'super_admin' : 'admin')}
                className={inputClasses}
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-rose text-white border-none px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adding…' : 'Add admin'}
            </button>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove admin?"
        message={`${pendingRemove?.display_name || pendingRemove?.email || 'This admin'} will lose all admin access immediately.`}
        confirmLabel="Remove"
        onConfirm={() => void handleRemove()}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}
