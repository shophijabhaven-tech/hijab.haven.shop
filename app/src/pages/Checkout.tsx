import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { inr } from '@/lib/format'
import {
  addAddress,
  DEFAULT_SETTINGS,
  fetchMyAddresses,
  fetchProducts,
  fetchShopSettings,
  notifyPaymentEmail,
  placeOrder,
  readCachedSettings,
  submitPaymentProof,
  uploadPaymentProof,
} from '@/lib/queries'
import type { Address, ShippingAddress, ShopSettings } from '@/lib/supabase'
import { buildOrderMessage, OWNER_WA, UPI_ID, waLink } from '@/lib/whatsapp'
import type { OrderMessageInput } from '@/lib/whatsapp'

// WP-06: 3-step checkout per §6.1 (guest) / §6.2 (logged-in deltas), with the
// §9.3 RPC error map and the §9.4 business-continuity rule: no Supabase failure
// may ever block the customer from reaching step 3 and the WhatsApp link.
// WP-V2-07: settings-driven UPI on step 2 (§12.5) and the payment-ref +
// optional proof upload on step 3 (§12.6) — both layered on top of §9.4.

type Step = 1 | 2 | 3

const STEP_TITLES: Record<Step, string> = {
  1: 'Confirm Details',
  2: 'Scan & Pay',
  3: 'Order Confirmed!',
}

// Form styling shared with Profile.tsx (ported from the live .co-form rules).
const inputClass =
  'w-full border-[1.5px] border-sand bg-white px-3 py-2.5 text-sm text-mocha outline-none rounded-md focus:border-rose transition-colors'
const labelClass = 'block text-[0.68rem] tracking-[0.14em] uppercase text-warm mb-1 font-medium'
const nextBtnClass =
  'w-full bg-rose text-white border-none py-3 rounded-md text-xs tracking-[0.15em] uppercase cursor-pointer hover:bg-mocha transition-colors disabled:opacity-50'

type NewAddressFields = {
  address_line1: string
  address_line2: string
  city: string
  state: string
  pincode: string
}

const EMPTY_NEW_ADDRESS: NewAddressFields = {
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
}

// §12.6 proof upload — client-side checks mirror the bucket caps.
const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const PROOF_TYPES = PROOF_ACCEPT.split(',')
const PROOF_MAX_BYTES = 5 * 1024 * 1024

type ProofState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'done' }
  | { phase: 'error'; message: string }

/** Guest prefill source: the gate's localStorage hh_user (live-site key). */
function readGateUser(): { name?: string; phone?: string } | null {
  try {
    const raw = localStorage.getItem('hh_user')
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as { name?: string; phone?: string })
      : null
  } catch {
    return null
  }
}

/** "line1, line2, city, state - pincode" with empty parts dropped. */
function formatStructuredAddress(address: NewAddressFields): string {
  const parts = [address.address_line1, address.address_line2, address.city, address.state]
    .map(part => part.trim())
    .filter(part => part !== '')
  const pincode = address.pincode.trim()
  return pincode ? `${parts.join(', ')} - ${pincode}` : parts.join(', ')
}

export default function Checkout() {
  const { items, cartTotal, removeFromCart, clearCart } = useCart()
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const gateUser = useMemo(() => readGateUser(), [])
  const [step, setStep] = useState<Step>(1)

  // null = untouched → derive from profile (preferred) then hh_user (§6.1/§6.2
  // prefill order). Deriving keeps a late-arriving profile from overwriting input.
  const [nameInput, setNameInput] = useState<string | null>(null)
  const [phoneInput, setPhoneInput] = useState<string | null>(null)
  const name = nameInput ?? (profile?.full_name || gateUser?.name || '')
  const phone = phoneInput ?? (profile?.phone || gateUser?.phone || '')

  // ── Address state ──
  const [addressText, setAddressText] = useState('')
  const [addresses, setAddresses] = useState<Address[]>([])
  const [addrFetch, setAddrFetch] = useState<'pending' | 'done' | 'failed'>('pending')
  const [selected, setSelected] = useState<number | 'new'>('new')
  const [newAddress, setNewAddress] = useState<NewAddressFields>(EMPTY_NEW_ADDRESS)
  const [saveNewAddress, setSaveNewAddress] = useState(false)

  // ── Order placement ──
  const [placing, setPlacing] = useState(false)
  const [orderCode, setOrderCode] = useState<string | null>(null)
  const [paymentRef, setPaymentRef] = useState<string | null>(null)
  const [waUrl, setWaUrl] = useState('')

  // ── Shop settings (§12.5) — fallback chain: fetch → cache → baked-in.
  // The lazy initializer seeds cache-or-default synchronously, so a failed
  // fetch needs no handling beyond staying on the seed (§9.4: never block).
  const [settings, setSettings] = useState<ShopSettings>(
    () => readCachedSettings() ?? DEFAULT_SETTINGS
  )
  const [proof, setProof] = useState<ProofState>({ phase: 'idle' })

  useEffect(() => {
    let cancelled = false
    fetchShopSettings()
      .then(fresh => {
        if (!cancelled) setSettings(fresh)
      })
      .catch(() => {
        // Seed (cache or DEFAULT_SETTINGS) stays in place — §9.4 continuity.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const userId = user?.id ?? null
  // 'textarea' (guest, or fetch failed → silent degrade per §6.2) | 'loading' | 'saved'
  const addrMode: 'textarea' | 'loading' | 'saved' =
    !userId || addrFetch === 'failed' ? 'textarea' : addrFetch === 'pending' ? 'loading' : 'saved'

  // Empty cart → no dead checkout page; step 3 is exempt (cart was cleared there).
  const redirectedRef = useRef(false)
  useEffect(() => {
    if (step === 3 || items.length > 0 || redirectedRef.current) return
    redirectedRef.current = true
    showToast('Your cart is empty — add some items first 🌸')
    navigate('/shop', { replace: true })
  }, [items.length, step, navigate, showToast])

  // Saved addresses for logged-in users. Failure degrades silently to the
  // textarea path (§6.2) — checkout must never block on this fetch.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchMyAddresses()
      .then(rows => {
        if (cancelled) return
        setAddresses(rows)
        setSelected(rows.find(row => row.is_default)?.id ?? rows[0]?.id ?? 'new')
        setAddrFetch('done')
      })
      .catch(() => {
        if (!cancelled) setAddrFetch('failed')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Clear the pending auto-open timer if the page unmounts within the 800ms window.
  const openTimerRef = useRef(0)
  useEffect(() => () => window.clearTimeout(openTimerRef.current), [])

  function handleNext() {
    if (!name.trim() || !phone.trim()) {
      showToast('Please fill your name and WhatsApp number.', 'error')
      return
    }
    if (addrMode === 'textarea' && !addressText.trim()) {
      showToast('Please enter your delivery address.', 'error')
      return
    }
    if (addrMode === 'saved' && selected === 'new') {
      const required = [newAddress.address_line1, newAddress.city, newAddress.state, newAddress.pincode]
      if (required.some(field => field.trim() === '')) {
        showToast('Please fill the address — line 1, city, state and pincode.', 'error')
        return
      }
    }
    setStep(2)
  }

  /** Shipping JSONB for place_order + the display string for the WhatsApp message. */
  function resolveShipping(): { shipping: ShippingAddress; display: string } {
    const contact = { full_name: name.trim(), phone: phone.trim() }
    if (addrMode === 'saved' && selected !== 'new') {
      const saved = addresses.find(address => address.id === selected)
      if (saved) {
        const shipping: ShippingAddress = {
          full_name: saved.full_name,
          phone: saved.phone,
          address_line1: saved.address_line1,
          address_line2: saved.address_line2,
          city: saved.city,
          state: saved.state,
          pincode: saved.pincode,
        }
        return { shipping, display: formatStructuredAddress(shipping) }
      }
    }
    if (addrMode === 'saved') {
      const shipping: ShippingAddress = {
        ...contact,
        address_line1: newAddress.address_line1.trim(),
        address_line2: newAddress.address_line2.trim(),
        city: newAddress.city.trim(),
        state: newAddress.state.trim(),
        pincode: newAddress.pincode.trim(),
      }
      return { shipping, display: formatStructuredAddress(shipping) }
    }
    // Guest free-text → address_line1, everything else empty (§4.6).
    const shipping: ShippingAddress = {
      ...contact,
      address_line1: addressText.trim(),
      address_line2: '',
      city: '',
      state: '',
      pincode: '',
    }
    return { shipping, display: addressText.trim() }
  }

  /** Success-path entry to step 3 — the ONLY place the cart is cleared (both the
   *  RPC-success and §9.4 continuity paths count: the order was sent). */
  function enterStep3(code: string | null, payRef: string | null, url: string) {
    setOrderCode(code)
    setPaymentRef(payRef)
    setWaUrl(url)
    setStep(3)
    clearCart()
    // §6.1: auto-open after ~800ms. Popup blockers may eat this — the manual
    // "Share Payment Screenshot" button on step 3 re-opens the same link.
    openTimerRef.current = window.setTimeout(() => {
      window.open(url, '_blank')
    }, 800)
  }

  /** §9.3 error map. The four cart-validation codes keep the user on step 2/1;
   *  anything else takes the §9.4 continuity path to step 3 + WhatsApp. */
  async function handleOrderError(
    message: string,
    messageBase: Omit<OrderMessageInput, 'orderCode' | 'paymentRef'>
  ) {
    if (message.includes('EMPTY_ORDER')) {
      showToast('Your cart looks empty — please re-add items.', 'error')
      return
    }
    if (message.includes('BAD_QUANTITY')) {
      showToast('Quantity must be between 1 and 50.', 'error')
      return
    }
    if (message.includes('MISSING_CONTACT')) {
      showToast('Please fill your name and WhatsApp number.', 'error')
      setStep(1)
      return
    }
    if (message.includes('UNKNOWN_PRODUCT')) {
      showToast('An item in your cart is no longer available. It was removed.', 'error')
      // The RPC doesn't name the offender — refresh the catalog and prune cart
      // items that no longer exist. If the refresh itself fails the cart is left
      // untouched and the user can simply retry.
      try {
        const fresh = await fetchProducts()
        const freshIds = new Set(fresh.map(product => product.id))
        for (const item of items) {
          if (!freshIds.has(item.id)) removeFromCart(item.id)
        }
      } catch {
        // Documented degrade: prune skipped, toast already shown.
      }
      return
    }
    const stockPrefix = 'OUT_OF_STOCK:'
    const stockIndex = message.indexOf(stockPrefix)
    if (stockIndex !== -1) {
      const productName = message.slice(stockIndex + stockPrefix.length).trim()
      showToast(`${productName} just sold out. Please adjust your cart.`, 'error')
      return
    }
    // Network / RPC missing / any other infra failure → §9.4: the WhatsApp
    // message IS the order; proceed without the order-code / Payment ID lines.
    enterStep3(null, null, waLink(OWNER_WA, buildOrderMessage({ orderCode: null, ...messageBase })))
    showToast('Order sent on WhatsApp; saving to our system failed — the owner will record it manually.')
  }

  async function confirmOrder() {
    if (placing) return
    setPlacing(true)
    const { shipping, display } = resolveShipping()
    // Snapshot everything needed for the WhatsApp message BEFORE clearCart().
    const messageBase: Omit<OrderMessageInput, 'orderCode' | 'paymentRef'> = {
      name: name.trim(),
      phone: phone.trim(),
      address: display,
      items: items.map(item => ({ name: item.name, quantity: item.qty, price: item.price })),
      total: cartTotal,
      upiId: settings.upi_id,
    }
    try {
      const result = await placeOrder({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        address: shipping,
        items: items.map(item => ({ product_id: item.id, quantity: item.qty })),
      })
      // §6.2: "Save this address" persists only on order success; best-effort —
      // a failure surfaces a toast but never blocks step 3.
      if (user && addrMode === 'saved' && selected === 'new' && saveNewAddress) {
        addAddress(user.id, {
          label: 'Home',
          full_name: shipping.full_name,
          phone: shipping.phone,
          address_line1: shipping.address_line1,
          address_line2: shipping.address_line2,
          city: shipping.city,
          state: shipping.state,
          pincode: shipping.pincode,
          is_default: false,
        }).catch(() => {
          showToast('Order placed, but the address could not be saved to your address book.', 'error')
        })
      }
      enterStep3(
        result.order_code,
        result.payment_ref,
        waLink(
          OWNER_WA,
          buildOrderMessage({
            orderCode: result.order_code,
            paymentRef: result.payment_ref,
            ...messageBase,
          })
        )
      )
    } catch (error) {
      await handleOrderError(error instanceof Error ? error.message : '', messageBase)
    } finally {
      setPlacing(false)
    }
  }

  /** §12.6 optional proof upload: upload to storage → bind via RPC → best-effort
   *  email. Validation toasts keep phase 'idle'; RPC/storage failures land in
   *  'error' with the input still rendered so the customer can retry. */
  async function handleProofUpload(file: File) {
    if (!orderCode || !paymentRef || proof.phase === 'uploading') return
    if (!PROOF_TYPES.includes(file.type)) {
      showToast('Please choose a JPG, PNG, WEBP image or a PDF.', 'error')
      return
    }
    if (file.size > PROOF_MAX_BYTES) {
      showToast('File is too large — maximum size is 5MB.', 'error')
      return
    }
    setProof({ phase: 'uploading' })
    try {
      const path = await uploadPaymentProof(orderCode, file)
      await submitPaymentProof(orderCode, paymentRef, path)
      setProof({ phase: 'done' })
      // Fire-and-forget (§12.7): notifyPaymentEmail never throws, never awaited.
      void notifyPaymentEmail(orderCode, paymentRef)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setProof({
        phase: 'error',
        message: message.includes('ALREADY_VERIFIED')
          ? "This order's payment is already verified."
          : "Couldn't attach the proof — please send it on WhatsApp instead.",
      })
    }
  }

  return (
    <section className="min-h-screen pt-32 pb-16 px-[5%]">
      <div className="max-w-[480px] mx-auto">
        <p className="text-xs tracking-[0.18em] uppercase text-rose mb-2 text-center">
          ✦ Almost There
        </p>
        <h1 className="font-heading text-4xl text-mocha text-center mb-6">{STEP_TITLES[step]}</h1>

        {/* Step indicator dots (live .step-dots / .sd) */}
        <div className="flex gap-2 justify-center mb-6">
          {([1, 2, 3] as const).map(dot => (
            <div
              key={dot}
              className={`w-7 h-[5px] rounded-[3px] transition-colors ${dot <= step ? 'bg-rose' : 'bg-sand'}`}
            />
          ))}
        </div>

        {/* ── STEP 1: Confirm Details ── */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="bg-blush rounded-md px-4 py-4 mb-5">
              <p className="font-heading text-lg text-mocha mb-3">Order Summary</p>
              {items.map(item => (
                <div key={item.id} className="flex justify-between text-[0.8rem] text-warm mb-1.5">
                  <span>
                    {item.name} × {item.qty}
                  </span>
                  <span>{inr(item.price * item.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-medium text-mocha border-t border-sand mt-2 pt-2">
                <span>Total</span>
                <span>{inr(cartTotal)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelClass} htmlFor="co-name">
                  Full Name
                </label>
                <input
                  id="co-name"
                  value={name}
                  onChange={event => setNameInput(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="co-phone">
                  WhatsApp Number
                </label>
                <input
                  id="co-phone"
                  value={phone}
                  onChange={event => setPhoneInput(event.target.value)}
                  placeholder="10-digit number"
                  type="tel"
                  autoComplete="tel"
                  className={inputClass}
                />
              </div>

              {addrMode === 'loading' && <LoadingSpinner />}

              {addrMode === 'textarea' && (
                <div>
                  <label className={labelClass} htmlFor="co-address">
                    Delivery Address
                  </label>
                  <textarea
                    id="co-address"
                    value={addressText}
                    onChange={event => setAddressText(event.target.value)}
                    placeholder="Full address with pincode..."
                    rows={3}
                    className={`${inputClass} resize-y min-h-[70px]`}
                  />
                </div>
              )}

              {addrMode === 'saved' && (
                <div>
                  <span className={labelClass}>Delivery Address</span>
                  <div className="space-y-2">
                    {addresses.map(address => (
                      <button
                        key={address.id}
                        type="button"
                        onClick={() => setSelected(address.id)}
                        className={`w-full text-left rounded-md p-3 border-[1.5px] cursor-pointer transition-colors ${
                          selected === address.id
                            ? 'border-rose bg-blush'
                            : 'border-sand bg-white hover:border-rose'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs bg-blush text-rose px-2 py-0.5 rounded">
                            {address.label}
                          </span>
                          <span className="text-sm text-mocha font-medium">{address.full_name}</span>
                        </div>
                        <p className="text-xs text-warm">
                          {address.address_line1}
                          {address.address_line2 ? `, ${address.address_line2}` : ''}
                        </p>
                        <p className="text-xs text-warm">
                          {address.city}, {address.state} - {address.pincode}
                        </p>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelected('new')}
                      className={`w-full text-left rounded-md p-3 border-[1.5px] border-dashed cursor-pointer transition-colors text-sm ${
                        selected === 'new'
                          ? 'border-rose bg-blush text-rose'
                          : 'border-sand bg-transparent text-warm hover:border-rose hover:text-rose'
                      }`}
                    >
                      + Use a new address
                    </button>
                  </div>

                  {selected === 'new' && (
                    <div className="space-y-3 mt-3 animate-fade-in">
                      <input
                        placeholder="Address Line 1"
                        value={newAddress.address_line1}
                        onChange={event =>
                          setNewAddress({ ...newAddress, address_line1: event.target.value })
                        }
                        className={inputClass}
                      />
                      <input
                        placeholder="Address Line 2 (optional)"
                        value={newAddress.address_line2}
                        onChange={event =>
                          setNewAddress({ ...newAddress, address_line2: event.target.value })
                        }
                        className={inputClass}
                      />
                      <div className="grid grid-cols-3 gap-3">
                        <input
                          placeholder="City"
                          value={newAddress.city}
                          onChange={event => setNewAddress({ ...newAddress, city: event.target.value })}
                          className={inputClass}
                        />
                        <input
                          placeholder="State"
                          value={newAddress.state}
                          onChange={event =>
                            setNewAddress({ ...newAddress, state: event.target.value })
                          }
                          className={inputClass}
                        />
                        <input
                          placeholder="Pincode"
                          value={newAddress.pincode}
                          onChange={event =>
                            setNewAddress({ ...newAddress, pincode: event.target.value })
                          }
                          className={inputClass}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-warm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveNewAddress}
                          onChange={event => setSaveNewAddress(event.target.checked)}
                        />
                        Save this address
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={addrMode === 'loading'}
              className={`${nextBtnClass} mt-5`}
            >
              Next: Payment →
            </button>
          </div>
        )}

        {/* ── STEP 2: Scan & Pay ── */}
        {step === 2 && (
          <div className="text-center animate-fade-in">
            <p className="text-[0.82rem] text-warm mb-1">
              Pay the exact amount to complete your order
            </p>
            <p className="font-heading text-2xl text-rose font-semibold mb-2">{inr(cartTotal)}</p>
            {/* src: `||` (not `??`) — an empty-string upi_qr_url must still fall back (§9.4). */}
            <img
              src={settings.upi_qr_url || DEFAULT_SETTINGS.upi_qr_url}
              alt="UPI QR code"
              onError={event => {
                // Broken remote URL → swap to the baked-in local QR once; the
                // guard prevents an error loop if the local file is missing too.
                const img = event.currentTarget
                if (!img.src.endsWith(DEFAULT_SETTINGS.upi_qr_url)) {
                  img.src = DEFAULT_SETTINGS.upi_qr_url
                }
              }}
              className="w-[200px] rounded-lg mx-auto my-4 border-[3px] border-rose block"
            />
            <div className="bg-blush rounded-md px-4 py-3 mb-4">
              <p className="text-[0.66rem] tracking-[0.16em] uppercase text-warm mb-1">UPI ID</p>
              <p className="text-mocha font-medium">{settings.upi_id || UPI_ID}</p>
            </div>
            <p className="text-[0.78rem] text-warm mb-4">After paying, click below to confirm 👇</p>
            <button onClick={() => void confirmOrder()} disabled={placing} className={nextBtnClass}>
              {placing ? 'Placing your order...' : "✅ I've Paid — Confirm Order"}
            </button>
            <button
              onClick={() => setStep(1)}
              className="block w-full text-center mt-3 text-[0.74rem] text-warm bg-transparent border-none cursor-pointer underline"
            >
              ← Back
            </button>
          </div>
        )}

        {/* ── STEP 3: Order Confirmed ── */}
        {step === 3 && (
          <div className="text-center py-6 px-2 animate-fade-in">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="font-heading text-3xl text-mocha mb-3">Thank You!</h2>
            {orderCode && (
              <p className="text-sm text-mocha mb-3">
                Order <strong>{orderCode}</strong>
                {paymentRef && (
                  <>
                    {' · '}Payment ID <strong>{paymentRef}</strong>
                  </>
                )}
              </p>
            )}
            <p className="text-[0.86rem] text-warm leading-[1.8] mb-6">
              Your order has been placed! 🧕💕
              <br />
              <br />
              <strong>Share your payment screenshot</strong> on our WhatsApp Group so we can confirm
              and process your order quickly.
              <br />
              <br />
              Your order will be on its way soon — stay connected! 🌸
            </p>
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-7 py-3 rounded-full no-underline text-[0.79rem] tracking-[0.12em] uppercase"
            >
              💬 Share Payment Screenshot
            </a>

            {/* §12.6 optional proof upload — renders only when the DB save
                succeeded (order_code + payment_ref). On the §9.4 continuity
                path this block is absent and WhatsApp stays the only channel. */}
            {orderCode && paymentRef && (
              <div className="mt-6 bg-blush rounded-md px-4 py-4 text-left">
                {proof.phase === 'done' ? (
                  <p className="text-sm text-mocha">
                    Proof received ✅ — the owner will verify shortly.
                  </p>
                ) : (
                  <>
                    <label className={labelClass} htmlFor="co-proof">
                      Upload payment screenshot (optional)
                    </label>
                    <input
                      id="co-proof"
                      type="file"
                      accept={PROOF_ACCEPT}
                      disabled={proof.phase === 'uploading'}
                      onChange={event => {
                        const file = event.target.files?.[0]
                        // Reset so re-selecting the same file after an error re-fires.
                        event.target.value = ''
                        if (file) void handleProofUpload(file)
                      }}
                      className="block w-full text-xs text-warm cursor-pointer file:mr-3 file:bg-rose file:text-white file:border-none file:px-3 file:py-2 file:rounded-md file:cursor-pointer disabled:opacity-50"
                    />
                    {proof.phase === 'uploading' && (
                      <p className="text-xs text-warm mt-2">Uploading your screenshot...</p>
                    )}
                    {proof.phase === 'error' && (
                      <p className="text-xs text-rose mt-2">{proof.message}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {user && (
              <p className="mt-5 text-sm">
                <Link to="/account/orders" className="text-rose underline">
                  Track it in My Orders
                </Link>
              </p>
            )}
            <div>
              <button
                onClick={() => {
                  clearCart()
                  navigate('/shop')
                }}
                className="mt-4 text-xs text-warm bg-transparent border-none cursor-pointer underline"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
