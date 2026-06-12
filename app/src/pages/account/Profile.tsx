import { useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import {
  addAddress,
  deleteAddress,
  fetchMyAddresses,
  fetchMyProfile,
  updateAddress,
  upsertMyProfile,
} from '@/lib/queries'
import type { AddressInput } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import type { Address } from '@/lib/supabase'

// WP-07: profile form (full_name + phone, email read-only) + address book CRUD.
// Ported from App Build account page, split per §3.1 and aligned to §9 states.

const inputClass =
  'w-full border-[1.5px] border-sand bg-white px-3 py-2.5 text-sm text-mocha outline-none rounded-md focus:border-rose transition-colors'
const labelClass = 'block text-[0.68rem] tracking-[0.14em] uppercase text-warm mb-1 font-medium'

const EMPTY_ADDRESS: AddressInput = {
  label: 'Home',
  full_name: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
  is_default: false,
}

export default function Profile() {
  const { user } = useAuth()
  const { showToast } = useToast()

  // ── Profile form ──
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [profileVersion, setProfileVersion] = useState(0)
  const [saving, setSaving] = useState(false)

  // ── Address book ──
  const [addresses, setAddresses] = useState<Address[]>([])
  const [addrLoading, setAddrLoading] = useState(true)
  const [addrError, setAddrError] = useState('')
  const [addrVersion, setAddrVersion] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<AddressInput>(EMPTY_ADDRESS)
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Address | null>(null)

  // ── Password (set/change — lets OTP-born users adopt a password) ──
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const userId = user?.id ?? null

  // Both loading flags start true and are re-armed by the retry/reload handlers —
  // no synchronous setState in the effect bodies (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchMyProfile(userId)
      .then(profile => {
        if (cancelled) return
        setFullName(profile?.full_name ?? '')
        setPhone(profile?.phone ?? '')
      })
      .catch((error: unknown) => {
        if (!cancelled) setProfileError(error instanceof Error ? error.message : 'Failed to load profile')
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, profileVersion])

  useEffect(() => {
    let cancelled = false
    fetchMyAddresses()
      .then(rows => {
        if (!cancelled) setAddresses(rows)
      })
      .catch((error: unknown) => {
        if (!cancelled) setAddrError(error instanceof Error ? error.message : 'Failed to load addresses')
      })
      .finally(() => {
        if (!cancelled) setAddrLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [addrVersion])

  // Behind RequireAuth — user is always present here; guard satisfies the types.
  if (!user) return null

  function retryProfile() {
    setProfileLoading(true)
    setProfileError('')
    setProfileVersion(version => version + 1)
  }

  function reloadAddresses() {
    setAddrLoading(true)
    setAddrError('')
    setAddrVersion(version => version + 1)
  }

  async function saveProfile() {
    if (!user) return
    setSaving(true)
    try {
      await upsertMyProfile({
        id: user.id,
        email: user.email ?? null,
        full_name: fullName.trim(),
        phone: phone.trim(),
      })
      showToast('Profile saved', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  function openAddForm() {
    setEditingId(null)
    setForm(EMPTY_ADDRESS)
    setFormError('')
    setShowForm(true)
  }

  function openEditForm(address: Address) {
    setEditingId(address.id)
    setForm({
      label: address.label,
      full_name: address.full_name,
      phone: address.phone,
      address_line1: address.address_line1,
      address_line2: address.address_line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      is_default: address.is_default,
    })
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_ADDRESS)
    setFormError('')
  }

  async function submitAddress() {
    if (!user) return
    const required: (keyof AddressInput)[] = [
      'label',
      'full_name',
      'phone',
      'address_line1',
      'city',
      'state',
      'pincode',
    ]
    if (required.some(field => String(form[field]).trim() === '')) {
      setFormError('Please fill all fields (address line 2 is optional).')
      return
    }
    setFormBusy(true)
    setFormError('')
    try {
      if (editingId === null) await addAddress(user.id, form)
      else await updateAddress(editingId, form)
      showToast(editingId === null ? 'Address added' : 'Address updated', 'success')
      closeForm()
      reloadAddresses()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to save address')
    } finally {
      setFormBusy(false)
    }
  }

  async function savePassword() {
    if (passwordBusy) return
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    setPasswordBusy(true)
    setPasswordError('')
    // Supabase updates the password on the current session — no current
    // password required.
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordBusy(false)
    if (error) {
      setPasswordError(error.message)
      return
    }
    setNewPassword('')
    setConfirmNewPassword('')
    showToast('Password updated — you can now sign in with it.', 'success')
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    try {
      await deleteAddress(target.id)
      showToast('Address deleted', 'success')
      reloadAddresses()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete address', 'error')
    }
  }

  return (
    <div className="animate-fade-in">
      {/* ── Profile details ── */}
      {profileLoading ? (
        <LoadingSpinner />
      ) : profileError ? (
        <ErrorBlock message={profileError} onRetry={retryProfile} />
      ) : (
        <div className="space-y-4 mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Full Name</label>
              <input
                value={fullName}
                onChange={event => setFullName(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                value={user.email ?? ''}
                disabled
                className="w-full border-[1.5px] border-sand bg-sand/30 px-3 py-2.5 text-sm text-warm outline-none rounded-md"
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                value={phone}
                onChange={event => setPhone(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <button
            onClick={() => void saveProfile()}
            disabled={saving}
            className="bg-rose text-white px-8 py-3 rounded-md text-xs tracking-[0.14em] uppercase hover:bg-mocha transition-colors cursor-pointer border-none disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* ── Password ── */}
      <h2 className="font-heading text-2xl text-mocha mb-4">Password</h2>
      <div className="bg-white rounded-md p-4 mb-10 border border-sand space-y-3">
        <p className="text-xs text-warm">
          Set a password to sign in without an email code.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>New Password (min 8 characters)</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Confirm Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={event => setConfirmNewPassword(event.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        {passwordError && <p className="text-rose text-xs">{passwordError}</p>}
        <button
          onClick={() => void savePassword()}
          disabled={passwordBusy}
          className="bg-rose text-white px-8 py-3 rounded-md text-xs tracking-[0.14em] uppercase hover:bg-mocha transition-colors cursor-pointer border-none disabled:opacity-50"
        >
          {passwordBusy ? 'Saving...' : 'Set Password'}
        </button>
      </div>

      {/* ── Address book ── */}
      <h2 className="font-heading text-2xl text-mocha mb-4">Address Book</h2>
      {addrLoading ? (
        <LoadingSpinner />
      ) : addrError ? (
        <ErrorBlock message={addrError} onRetry={reloadAddresses} />
      ) : (
        <>
          {addresses.length === 0 && !showForm && (
            <p className="text-sm text-warm mb-3">No saved addresses yet.</p>
          )}

          {addresses.map(address => (
            <div
              key={address.id}
              className="bg-white rounded-md p-4 mb-3 border border-sand flex justify-between items-start gap-3"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-blush text-rose px-2 py-0.5 rounded">{address.label}</span>
                  {address.is_default && (
                    <span className="text-[0.6rem] tracking-[0.1em] uppercase bg-mocha text-blush px-2 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-mocha font-medium">{address.full_name}</p>
                <p className="text-xs text-warm">
                  {address.address_line1}
                  {address.address_line2 ? `, ${address.address_line2}` : ''}
                </p>
                <p className="text-xs text-warm">
                  {address.city}, {address.state} - {address.pincode}
                </p>
                <p className="text-xs text-warm">{address.phone}</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => openEditForm(address)}
                  className="text-xs text-warm hover:text-rose bg-transparent border-none cursor-pointer underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => setPendingDelete(address)}
                  aria-label={`Delete address ${address.label}`}
                  className="text-sm text-sand hover:text-rose bg-transparent border-none cursor-pointer"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}

          {showForm ? (
            <div className="bg-white rounded-md p-4 border border-sand space-y-3 animate-fade-in">
              <h3 className="font-heading text-lg text-mocha">
                {editingId === null ? 'New Address' : 'Edit Address'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Label (Home/Office)"
                  value={form.label}
                  onChange={event => setForm({ ...form, label: event.target.value })}
                  className={inputClass}
                />
                <input
                  placeholder="Full Name"
                  value={form.full_name}
                  onChange={event => setForm({ ...form, full_name: event.target.value })}
                  className={inputClass}
                />
              </div>
              <input
                placeholder="Phone"
                value={form.phone}
                onChange={event => setForm({ ...form, phone: event.target.value })}
                className={inputClass}
              />
              <input
                placeholder="Address Line 1"
                value={form.address_line1}
                onChange={event => setForm({ ...form, address_line1: event.target.value })}
                className={inputClass}
              />
              <input
                placeholder="Address Line 2 (optional)"
                value={form.address_line2}
                onChange={event => setForm({ ...form, address_line2: event.target.value })}
                className={inputClass}
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  placeholder="City"
                  value={form.city}
                  onChange={event => setForm({ ...form, city: event.target.value })}
                  className={inputClass}
                />
                <input
                  placeholder="State"
                  value={form.state}
                  onChange={event => setForm({ ...form, state: event.target.value })}
                  className={inputClass}
                />
                <input
                  placeholder="Pincode"
                  value={form.pincode}
                  onChange={event => setForm({ ...form, pincode: event.target.value })}
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-warm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={event => setForm({ ...form, is_default: event.target.checked })}
                />
                Set as default
              </label>
              {formError && <p className="text-rose text-xs">{formError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => void submitAddress()}
                  disabled={formBusy}
                  className="bg-rose text-white px-6 py-2 rounded-md text-xs uppercase tracking-wider hover:bg-mocha transition-colors cursor-pointer border-none disabled:opacity-50"
                >
                  {formBusy ? 'Saving...' : 'Save Address'}
                </button>
                <button
                  onClick={closeForm}
                  className="text-xs text-warm bg-transparent border-none cursor-pointer underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={openAddForm}
              className="w-full border-2 border-dashed border-sand text-warm py-4 rounded-md text-sm hover:border-rose hover:text-rose transition-colors cursor-pointer bg-transparent"
            >
              + Add New Address
            </button>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete address?"
        message={`"${pendingDelete?.label ?? ''}" will be removed from your address book.`}
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
