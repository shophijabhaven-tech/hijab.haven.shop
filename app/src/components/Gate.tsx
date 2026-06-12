import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { registerCustomerV2 } from '@/lib/queries'

// Entry gate overlay (§3.1/§5.2, signup form per §12.2) — exact #gate design +
// behavior from the live index.html, plus a required email field. Shows once
// per device (localStorage hh_user); never on /admin/* because admin routes
// don't use CustomerLayout. registerCustomerV2 is fire-and-forget: Supabase
// failures must never block entry (§9.4).

type GateField = 'name' | 'phone' | 'email'

type GateError = { message: string; field: GateField }

// §12.2 email rule: required, standard pattern after trim+lowercase.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Live error copy + rule, ported verbatim from index.html enterShop():
// digits = phone with non-digits stripped; valid when digits.length >= 10.
// Validation order per §12.2: name → phone → email.
function validate(name: string, phone: string, email: string): GateError | null {
  const digits = phone.replace(/\D/g, '')
  if (!name && !phone) return { message: 'Please enter your name and WhatsApp number ✦', field: 'name' }
  if (!name) return { message: 'Please enter your name to continue 🌸', field: 'name' }
  if (!phone || digits.length < 10)
    return { message: 'Please enter a valid 10-digit WhatsApp number ✦', field: 'phone' }
  if (!EMAIL_RE.test(email)) return { message: 'Please enter a valid email address ✦', field: 'email' }
  return null
}

const inputClasses = (hasError: boolean) =>
  `w-full border-[1.5px] ${hasError ? 'border-[#e05]' : 'border-sand'} bg-white px-[0.95rem] py-[0.72rem] font-body text-[0.9rem] text-mocha outline-none rounded-md transition-colors focus:border-rose`

export default function Gate() {
  // Lazy init: returning visitors (hh_user present) never see the gate.
  const [open, setOpen] = useState(() => localStorage.getItem('hh_user') === null)
  const [closing, setClosing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errField, setErrField] = useState<GateField | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const errTimerRef = useRef(0)
  const fieldTimerRef = useRef(0)
  const { showToast } = useToast()

  // Lock body scroll while the gate is visible (live parity).
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  // Live behavior: error pill auto-hides after 3.5s; offending input flashes
  // its border for 1.5s and receives focus.
  const showError = (gateError: GateError) => {
    window.clearTimeout(errTimerRef.current)
    window.clearTimeout(fieldTimerRef.current)
    setError(gateError.message)
    setErrField(gateError.field)
    const input =
      gateError.field === 'name'
        ? nameRef.current
        : gateError.field === 'phone'
          ? phoneRef.current
          : emailRef.current
    input?.focus()
    errTimerRef.current = window.setTimeout(() => setError(null), 3500)
    fieldTimerRef.current = window.setTimeout(() => setErrField(null), 1500)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    const trimmedEmail = email.trim().toLowerCase()
    const gateError = validate(trimmedName, trimmedPhone, trimmedEmail)
    if (gateError) {
      showError(gateError)
      return
    }
    // Same shape the live site stores (joinedTs included for parity); §12.2
    // adds email — readers only access name/phone, so the shape stays
    // backward-compatible.
    const user = {
      name: trimmedName,
      phone: trimmedPhone,
      email: trimmedEmail,
      joinedDate: new Date().toLocaleDateString('en-IN'),
      joinedTs: Date.now(),
    }
    localStorage.setItem('hh_user', JSON.stringify(user))
    // Fire-and-forget — the gate must never block on Supabase (§9.4).
    registerCustomerV2(trimmedName, trimmedPhone, trimmedEmail).catch(() => {})
    // Live exit feel: 0.4s opacity fade, then remove; welcome toast at ~500ms.
    setClosing(true)
    window.setTimeout(() => setOpen(false), 420)
    window.setTimeout(() => showToast(`Welcome, ${trimmedName.split(' ')[0]}! 💕`, 'success'), 500)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Hijab Haven"
      className={`fixed inset-0 z-[9999] bg-gradient-to-br from-mocha to-warm flex items-center justify-center p-4 transition-opacity duration-[400ms] ${closing ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="bg-cream rounded-2xl overflow-hidden max-w-[400px] w-full shadow-[0_40px_100px_rgba(0,0,0,0.4)] animate-pop-in max-[380px]:m-2">
        {/* Head */}
        <div className="bg-gradient-to-br from-mocha to-warm px-6 pt-8 pb-[1.4rem] text-center max-[380px]:px-4 max-[380px]:pt-6 max-[380px]:pb-4">
          <div className="w-[100px] h-[100px] rounded-full overflow-hidden border-4 border-white/30 mx-auto mb-[0.9rem] shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
            <img src="/images/logo.jpg" alt="Hijab Haven logo" className="w-full h-full object-cover block" />
          </div>
          <div className="font-heading text-[1.9rem] max-[380px]:text-2xl text-white font-normal">Hijab Haven</div>
          <div className="text-[0.72rem] text-white/65 tracking-[0.18em] uppercase mt-[0.3rem]">
            ✦ Navi Mumbai · Online Store
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} noValidate className="p-[1.6rem] max-[380px]:p-[1.2rem]">
          <p className="text-[0.84rem] text-warm leading-[1.7] mb-[1.2rem] text-center font-light">
            Enter your details to browse our collection and get exclusive WhatsApp offers 💕
          </p>
          <div className="mb-[0.85rem]">
            <label
              htmlFor="gate-name"
              className="block text-[0.68rem] tracking-[0.14em] uppercase text-warm mb-[0.3rem] font-medium"
            >
              Your Name *
            </label>
            <input
              id="gate-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  phoneRef.current?.focus()
                }
              }}
              placeholder="e.g. Fatima Shaikh"
              autoComplete="name"
              className={inputClasses(errField === 'name')}
            />
          </div>
          <div className="mb-[0.85rem]">
            <label
              htmlFor="gate-phone"
              className="block text-[0.68rem] tracking-[0.14em] uppercase text-warm mb-[0.3rem] font-medium"
            >
              WhatsApp Number *
            </label>
            <input
              id="gate-phone"
              ref={phoneRef}
              type="tel"
              value={phone}
              onChange={event => setPhone(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  emailRef.current?.focus()
                }
              }}
              placeholder="e.g. 9876543210"
              maxLength={15}
              autoComplete="tel"
              className={inputClasses(errField === 'phone')}
            />
          </div>
          <div className="mb-[0.85rem]">
            <label
              htmlFor="gate-email"
              className="block text-[0.68rem] tracking-[0.14em] uppercase text-warm mb-[0.3rem] font-medium"
            >
              Email *
            </label>
            <input
              id="gate-email"
              ref={emailRef}
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="e.g. fatima@gmail.com"
              autoComplete="email"
              className={inputClasses(errField === 'email')}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-rose text-white border-none p-[0.95rem] font-body text-[0.82rem] tracking-[0.15em] uppercase cursor-pointer rounded-md transition-colors hover:bg-mocha mt-[0.4rem]"
          >
            Enter the Shop ✨
          </button>
          {error && (
            <div
              role="alert"
              className="text-rose text-[0.8rem] text-center mt-[0.7rem] bg-[#fff0ed] px-[0.8rem] py-2 rounded-md border border-rose/30"
            >
              {error}
            </div>
          )}
          <p className="text-center text-[0.72rem] text-[#bbb] mt-[0.9rem] leading-normal">
            🔒 We only use your info to send order updates &amp; offers.
          </p>
        </form>
      </div>
    </div>
  )
}
