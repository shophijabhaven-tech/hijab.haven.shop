import { useCallback, useEffect, useRef, useState } from 'react'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useToast } from '@/context/ToastContext'
import { fetchShopSettings, updateShopSettings, uploadSettingsQr } from '@/lib/queries'
import type { ShopSettings } from '@/lib/supabase'

const inputClasses =
  'w-full border border-blush rounded px-3.5 py-2.5 text-sm text-mocha bg-cream/50 outline-none focus:border-rose transition-colors'

const labelClasses = 'block text-xs tracking-[0.12em] uppercase text-warm mb-1.5'

// §9.6 mirror of the bucket limits — friendlier client-side message.
const MAX_QR_BYTES = 5 * 1024 * 1024
const ALLOWED_QR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Same shape the gate uses (§12.2) — good enough for a notification address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FormState = {
  upi_id: string
  shop_email: string
  whatsapp: string
}

// /admin/settings per §12.5: the single shop_settings row (id = 1). Text
// fields save via updateShopSettings; the QR image uploads to the public
// product-images bucket under settings/ (uploadSettingsQr) and the returned
// URL is saved immediately, so the checkout QR swaps without a redeploy.
// upi_qr_url may still be the local /images/upi-qr.jpg seed/fallback.
export default function Settings() {
  const { showToast } = useToast()

  const [settings, setSettings] = useState<ShopSettings | null>(null)
  const [form, setForm] = useState<FormState>({ upi_id: '', shop_email: '', whatsapp: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingQr, setIsUploadingQr] = useState(false)
  const qrInputRef = useRef<HTMLInputElement>(null)

  // Lint-safe fetch pattern (Dashboard idiom): the effect only invokes load;
  // all setState happens in the async settle callbacks. Pre-002 the table
  // doesn't exist — fetchShopSettings throws and we land in ErrorBlock+retry.
  const load = useCallback(() => {
    void fetchShopSettings().then(
      data => {
        setSettings(data)
        setForm({ upi_id: data.upi_id, shop_email: data.shop_email, whatsapp: data.whatsapp })
        setLoadError(null)
        setIsLoading(false)
      },
      (error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Failed to load settings')
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

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const upiId = form.upi_id.trim()
    if (!upiId) {
      showToast('Please enter the UPI ID — customers pay to it at checkout.', 'error')
      return
    }
    const email = form.shop_email.trim().toLowerCase()
    if (email && !EMAIL_RE.test(email)) {
      showToast('Please enter a valid email address (or leave it blank).', 'error')
      return
    }
    const whatsapp = form.whatsapp.replace(/\D/g, '')
    if (whatsapp.length < 10) {
      showToast('WhatsApp number needs at least 10 digits (include the country code).', 'error')
      return
    }

    setIsSaving(true)
    try {
      const saved = await updateShopSettings({
        upi_id: upiId,
        shop_email: email,
        whatsapp,
      })
      setSettings(saved)
      setForm({ upi_id: saved.upi_id, shop_email: saved.shop_email, whatsapp: saved.whatsapp })
      showToast('Settings saved.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save settings', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // §12.5 QR flow: validate → upload to storage → persist the public URL →
  // the preview re-renders from the saved row (no optimistic state to revert).
  async function handleQrChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || isUploadingQr) return
    if (!ALLOWED_QR_TYPES.includes(file.type)) {
      showToast('QR image must be a JPEG, PNG, WebP, or GIF file.', 'error')
      if (qrInputRef.current) qrInputRef.current.value = ''
      return
    }
    if (file.size > MAX_QR_BYTES) {
      showToast('QR image must be 5 MB or smaller.', 'error')
      if (qrInputRef.current) qrInputRef.current.value = ''
      return
    }

    setIsUploadingQr(true)
    try {
      const url = await uploadSettingsQr(file)
      const saved = await updateShopSettings({ upi_qr_url: url })
      setSettings(saved)
      showToast('UPI QR code updated.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update QR code', 'error')
    } finally {
      setIsUploadingQr(false)
      if (qrInputRef.current) qrInputRef.current.value = ''
    }
  }

  if (isLoading) return <LoadingSpinner />
  if (loadError || !settings) {
    return (
      <div>
        <h1 className="font-heading text-3xl text-mocha mb-6">Settings</h1>
        <ErrorBlock message={loadError ?? 'Failed to load settings'} onRetry={retry} />
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-heading text-3xl text-mocha mb-6">Settings</h1>

      {/* ── Payment & contact details ── */}
      <div className="bg-white rounded-lg p-5 md:p-6 mb-8 max-w-2xl">
        <h2 className="font-heading text-xl text-mocha mb-4">Payment & contact</h2>

        <form onSubmit={handleSave} noValidate>
          <div className="mb-4">
            <label htmlFor="settings-upi" className={labelClasses}>
              UPI ID
            </label>
            <input
              id="settings-upi"
              type="text"
              value={form.upi_id}
              onChange={event => setField('upi_id', event.target.value)}
              className={inputClasses}
            />
            <p className="text-xs text-warm mt-1.5">
              Shown to customers at checkout next to the QR code.
            </p>
          </div>

          <div className="mb-4">
            <label htmlFor="settings-email" className={labelClasses}>
              Notification email
            </label>
            <input
              id="settings-email"
              type="email"
              value={form.shop_email}
              onChange={event => setField('shop_email', event.target.value)}
              className={inputClasses}
            />
            <p className="text-xs text-warm mt-1.5">
              Optional — payment-proof notifications are emailed here. The Orders panel always
              shows proofs either way.
            </p>
          </div>

          <div className="mb-5">
            <label htmlFor="settings-whatsapp" className={labelClasses}>
              WhatsApp number
            </label>
            <input
              id="settings-whatsapp"
              type="tel"
              value={form.whatsapp}
              onChange={event => setField('whatsapp', event.target.value)}
              className={inputClasses}
            />
            <p className="text-xs text-warm mt-1.5">
              Digits only, with country code — e.g. 919820517390. Order messages open this chat.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="bg-rose text-white border-none px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors disabled:opacity-60 disabled:cursor-default"
          >
            {isSaving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </div>

      {/* ── UPI QR image (§12.5: upload → save URL → preview updates) ── */}
      <div className="bg-white rounded-lg p-5 md:p-6 max-w-2xl">
        <h2 className="font-heading text-xl text-mocha mb-4">UPI QR code</h2>

        <div className="flex flex-col sm:flex-row items-start gap-5">
          <img
            src={settings.upi_qr_url}
            alt="Current UPI QR code"
            className="w-40 h-40 rounded object-contain border border-blush bg-cream/50 shrink-0"
          />
          <div>
            <p className="text-sm text-warm leading-relaxed mb-3">
              This QR is shown to every customer on the checkout payment step. Upload a new image
              to replace it instantly — no redeploy needed.
            </p>
            <label htmlFor="settings-qr" className={labelClasses}>
              {isUploadingQr ? 'Uploading…' : 'Upload new QR image'}
            </label>
            <input
              ref={qrInputRef}
              id="settings-qr"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={isUploadingQr}
              onChange={handleQrChange}
              className="text-sm text-warm file:mr-3 file:bg-blush file:text-mocha file:border-none file:rounded file:px-4 file:py-2 file:text-xs file:tracking-[0.12em] file:uppercase file:cursor-pointer disabled:opacity-60"
            />
            <p className="text-xs text-warm mt-1.5">JPEG, PNG, WebP, or GIF — 5 MB max.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
