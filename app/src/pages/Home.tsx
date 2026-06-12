import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useCollections } from '@/context/CollectionsContext'
import { useToast } from '@/context/ToastContext'
import { HAMPER_GROUP_URL, INSTAGRAM_URL } from '@/lib/whatsapp'

// Marketing home (§3.1) — hero, marquee, categories, quote, hampers, why,
// instagram. All copy ported character-for-character from the live
// index.html (§8.3); category cards link to /shop/:category instead of
// opening the legacy modal. V2 (§12.8): the #payment section is removed —
// payment renders only in Checkout; category cards are collection-driven (§12.4).

const MARQUEE_ITEMS = [
  'Hijabs',
  'Hampers',
  'Accessories',
  'Online Payments Only',
  'Navi Mumbai',
  'Hijab & Happiness',
]

const HAMPERS = [
  {
    emoji: '🌸',
    gradient: 'bg-gradient-to-br from-blush to-sand',
    tag: 'Most Loved',
    name: 'Blossom Hamper',
    desc: 'Pastel hijabs, floral pins, and a beautiful underscarve — perfect for new brides or Eid.',
  },
  {
    emoji: '🎀',
    gradient: 'bg-gradient-to-br from-sand to-[#dbb89e]',
    tag: 'Bestseller',
    name: 'Celebration Set',
    desc: 'Three handpicked hijabs, accessories, and a personalised message card.',
  },
  {
    emoji: '💝',
    gradient: 'bg-gradient-to-br from-rose to-warm',
    tag: 'Luxury Pick',
    name: 'Royal Hamper',
    desc: 'Five premium hijabs, gold-tone accessories, and exquisite packaging.',
  },
]

const WHY_ITEMS = [
  {
    title: 'Handpicked Quality',
    desc: 'Every hijab carefully selected for fabric quality, drape, and durability.',
  },
  {
    title: 'Based in Navi Mumbai',
    desc: 'A local brand you can trust, with a team that understands your style needs.',
  },
  {
    title: 'Secure Online Payments',
    desc: 'Fast, secure UPI payments from the comfort of your home.',
  },
  {
    title: 'Growing Community',
    desc: 'A family of hijabi women sharing style inspiration, tips, and sisterhood.',
  },
]

// Live .stag / .stitle / .ssub section header (em inside title renders rose italic).
function SectionHeader({ tag, title, sub, center = false }: { tag: string; title: ReactNode; sub: string; center?: boolean }) {
  return (
    <div className={`reveal ${center ? 'text-center' : ''}`}>
      <span className="inline-block text-rose text-[0.69rem] tracking-[0.24em] uppercase mb-[0.7rem] font-medium">
        {tag}
      </span>
      <h2 className="font-heading text-[clamp(1.9rem,3.8vw,3.2rem)] max-[560px]:text-[clamp(1.5rem,6vw,2rem)] font-light text-mocha leading-[1.15] mb-[0.9rem] [&_em]:text-rose">
        {title}
      </h2>
      <p className={`text-warm text-[0.88rem] leading-[1.8] font-light max-w-[520px] ${center ? 'mx-auto' : ''}`}>
        {sub}
      </p>
    </div>
  )
}

export default function Home() {
  const { showToast } = useToast()
  const { collections } = useCollections()
  const { hash } = useLocation()
  const pageRef = useRef<HTMLDivElement>(null)

  // Navbar links to /#hampers — client-side hash changes don't
  // scroll natively, so handle it here.
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [hash])

  // Scroll-reveal, identical to the live IntersectionObserver (threshold .1,
  // 80ms stagger per batch, unobserve once visible).
  useEffect(() => {
    const root = pageRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      entries =>
        entries.forEach((entry, index) => {
          if (entry.isIntersecting) {
            window.setTimeout(() => entry.target.classList.add('visible'), index * 80)
            observer.unobserve(entry.target)
          }
        }),
      { threshold: 0.1 }
    )
    root.querySelectorAll('.reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Share handlers ported verbatim from the live shareWA/shareCopy/shareNative.
  const shareWhatsApp = () => {
    window.open(
      'https://wa.me/?text=' + encodeURIComponent('Check out Hijab Haven! 🧕💕 ' + window.location.href),
      '_blank'
    )
  }
  const shareCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(window.location.href)
        .then(() => showToast('Link copied! 🔗', 'success'))
        .catch(() => showToast('Could not copy the link', 'error'))
    } else {
      window.prompt('Copy this link:', window.location.href)
    }
  }
  const shareNative = () => {
    if (navigator.share) {
      navigator
        .share({ title: 'Hijab Haven', text: 'Check out Hijab Haven! 🧕', url: window.location.href })
        .catch(() => {})
    } else {
      shareWhatsApp()
    }
  }

  return (
    <div ref={pageRef}>
      {/* HERO */}
      <section
        id="hero"
        className="relative min-h-screen grid grid-cols-1 min-[901px]:grid-cols-2 items-center gap-8 min-[901px]:gap-0 overflow-hidden px-[5%] pt-24 min-[901px]:pt-[7rem] pb-16 text-center min-[901px]:text-left"
      >
        {/* Animated gradient orbs */}
        <div className="absolute w-[500px] h-[500px] rounded-full bg-blush blur-[80px] opacity-50 pointer-events-none top-[-10%] right-[5%] animate-float" />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-sand blur-[80px] opacity-50 pointer-events-none bottom-[5%] left-[-5%] animate-float-delay" />

        <div className="relative z-[2]">
          <span className="inline-block bg-blush text-rose text-[0.71rem] max-[560px]:text-[0.62rem] tracking-[0.2em] uppercase px-4 py-[0.38rem] max-[560px]:px-[0.7rem] max-[560px]:py-[0.3rem] mb-6 rounded-full">
            ✦ Navi Mumbai's Favourite Hijab Store
          </span>
          <h1 className="font-heading text-[clamp(2.8rem,5vw,5rem)] max-[560px]:text-[clamp(1.8rem,8vw,2.8rem)] font-light leading-[1.08] text-mocha mb-[1.3rem] [&_em]:text-rose">
            From casual
            <br />
            to <em>elegant,</em>
            <br />
            always a statement.
          </h1>
          <p className="text-[0.9rem] leading-[1.8] text-warm max-w-[400px] mb-[2.2rem] font-light mx-auto min-[901px]:mx-0">
            Curated hijabs, hampers &amp; accessories crafted for every woman. Because modesty is your most beautiful expression.
          </p>
          <div className="flex gap-4 flex-wrap justify-center min-[901px]:justify-start">
            <Link
              to="/shop"
              className="bg-rose text-white px-8 py-[0.82rem] max-[560px]:px-[1.4rem] max-[560px]:py-[0.7rem] no-underline text-[0.78rem] max-[560px]:text-[0.72rem] tracking-[0.14em] uppercase border-2 border-rose rounded transition-all hover:bg-mocha hover:border-mocha"
            >
              Shop Now
            </Link>
            <a
              href={HAMPER_GROUP_URL}
              target="_blank"
              rel="noreferrer"
              className="bg-transparent text-rose px-8 py-[0.82rem] max-[560px]:px-[1.4rem] max-[560px]:py-[0.7rem] no-underline text-[0.78rem] max-[560px]:text-[0.72rem] tracking-[0.14em] uppercase border-2 border-rose rounded transition-all hover:bg-rose hover:text-white"
            >
              Join WhatsApp
            </a>
          </div>
        </div>

        <div className="relative z-[2] flex flex-col items-center gap-[0.8rem]">
          <div className="w-[220px] h-[220px] max-md:w-40 max-md:h-40 max-[380px]:w-[130px] max-[380px]:h-[130px] rounded-full overflow-hidden border-[5px] border-rose shadow-[0_20px_60px_rgba(201,137,122,0.35)]">
            <img src="/images/logo.jpg" alt="Hijab Haven" className="w-full h-full object-cover block" />
          </div>
          <div className="font-heading text-[2.2rem] max-md:text-[1.7rem] font-semibold text-mocha text-center">
            Hijab Haven
          </div>
          <div className="text-[0.72rem] tracking-[0.22em] uppercase text-warm text-center">
            ✦ Hijab · Hampers · Accessories ✦
          </div>
        </div>
      </section>

      {/* MARQUEE — duplicated list for the seamless 22s loop */}
      <div className="bg-mocha text-blush py-[0.85rem] overflow-hidden whitespace-nowrap">
        <div className="inline-flex gap-10 animate-marquee">
          {[0, 1].map(copy =>
            MARQUEE_ITEMS.map(item => (
              <span
                key={`${copy}-${item}`}
                aria-hidden={copy === 1}
                className="inline-flex gap-10 text-[0.7rem] tracking-[0.2em] uppercase"
              >
                {item}
                <span className="text-rose">✦</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* CATEGORIES */}
      <section id="categories" className="bg-blush py-[5.5rem] px-[5%] max-md:py-14 max-md:px-[4%]">
        <SectionHeader
          tag="✦ What We Offer"
          title={
            <>
              Styled for every <em>occasion</em>
            </>
          }
          sub="Whether it's a casual day out or a special celebration, we have the perfect hijab for you."
        />
        <div className="reveal grid grid-cols-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1 gap-[1.3rem] mt-[2.8rem]">
          {collections.map(collection => (
            <Link
              key={collection.key}
              to={`/shop/${collection.key}`}
              className="block bg-cream rounded-md px-[1.6rem] py-[2.2rem] max-[560px]:px-[1.2rem] max-[560px]:py-6 text-center relative overflow-hidden no-underline transition-all duration-300 hover:-translate-y-[5px] hover:shadow-[0_18px_50px_rgba(74,46,38,0.12)] after:content-[''] after:absolute after:bottom-0 after:inset-x-0 after:h-[3px] after:bg-rose after:scale-x-0 after:origin-left after:transition-transform after:duration-[350ms] hover:after:scale-x-100"
            >
              <div className="text-[2.6rem] mb-[0.9rem]">{collection.icon}</div>
              <h3 className="font-heading text-[1.35rem] text-mocha mb-[0.4rem]">{collection.label}</h3>
              <p className="text-[0.78rem] text-warm leading-[1.6] font-light">{collection.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* QUOTE */}
      <section className="bg-mocha text-center py-[4.5rem] px-[5%]">
        <blockquote className="reveal font-heading text-[clamp(1.7rem,3.2vw,2.8rem)] font-light italic text-blush leading-[1.4] max-w-[720px] mx-auto mb-4">
          "From casual to elegant, hijab is always a statement."
        </blockquote>
        <p className="reveal text-rose text-[0.76rem] tracking-[0.2em] uppercase">— Hijab Haven</p>
      </section>

      {/* HAMPERS */}
      <section id="hampers" className="py-[5.5rem] px-[5%] max-md:py-14 max-md:px-[4%]">
        <SectionHeader
          tag="✦ Gift with Love"
          title={
            <>
              Curated <em>Hampers</em>
            </>
          }
          sub="Thoughtfully assembled gift sets. Perfect for birthdays, Eid, weddings, and more."
        />
        <div className="reveal grid grid-cols-3 max-[900px]:grid-cols-1 gap-[1.6rem] mt-[2.8rem]">
          {HAMPERS.map(hamper => (
            <div
              key={hamper.name}
              className="bg-white rounded-md overflow-hidden transition-all duration-300 hover:-translate-y-[5px] hover:shadow-[0_18px_50px_rgba(74,46,38,0.12)]"
            >
              <div className={`${hamper.gradient} h-[190px] max-[560px]:h-[140px] flex items-center justify-center text-[3.8rem]`}>
                {hamper.emoji}
              </div>
              <div className="p-6">
                <p className="text-[0.64rem] tracking-[0.18em] uppercase text-rose mb-[0.4rem]">{hamper.tag}</p>
                <h3 className="font-heading text-[1.25rem] text-mocha mb-[0.4rem]">{hamper.name}</h3>
                <p className="text-[0.78rem] text-warm leading-[1.6] font-light">{hamper.desc}</p>
                <a
                  href={HAMPER_GROUP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-[0.7rem] tracking-[0.15em] uppercase text-rose no-underline border-b border-rose pb-[2px]"
                >
                  Enquire →
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY */}
      <section id="why" className="bg-blush py-[5.5rem] px-[5%] max-md:py-14 max-md:px-[4%]">
        <div className="grid grid-cols-2 max-[900px]:grid-cols-1 gap-16 items-center">
          <div>
            <SectionHeader
              tag="✦ Why Choose Us"
              title={
                <>
                  Hijab &amp; <em>Happiness</em>
                </>
              }
              sub="We believe every woman deserves to feel beautiful, confident, and celebrated."
            />
            <ul className="reveal list-none flex flex-col gap-[1.6rem] mt-[1.8rem]">
              {WHY_ITEMS.map((item, index) => (
                <li key={item.title} className="flex gap-[1.2rem] items-start">
                  <div className="w-10 h-10 min-w-10 bg-rose text-white flex items-center justify-center font-heading text-[1.1rem] font-semibold rounded-full shrink-0">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-[0.9rem] font-medium text-mocha mb-1">{item.title}</p>
                    <p className="text-[0.8rem] text-warm leading-[1.7] font-light">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="reveal max-[900px]:hidden grid grid-cols-2 gap-[0.9rem] h-[380px]">
            <div className="row-span-2 rounded-md flex flex-col items-center justify-center text-[2.8rem] gap-2 bg-gradient-to-br from-blush to-sand">
              <span>🧕</span>
              <span className="text-[0.7rem] tracking-[0.14em] uppercase text-warm">Style First</span>
            </div>
            <div className="rounded-md flex flex-col items-center justify-center text-[2.8rem] gap-2 bg-gradient-to-br from-sand to-[#dbb89e]">
              <span>✨</span>
              <span className="text-[0.7rem] tracking-[0.14em] uppercase text-warm">Premium</span>
            </div>
            <div className="rounded-md flex flex-col items-center justify-center text-[2.8rem] gap-2 bg-gradient-to-br from-rose to-warm text-white">
              <span>❤️</span>
              <span className="text-[0.7rem] tracking-[0.14em] uppercase text-white/75">Made with Love</span>
            </div>
          </div>
        </div>
      </section>

      {/* INSTAGRAM */}
      <section id="instagram" className="bg-gradient-to-br from-mocha to-warm text-center py-20 px-[5%]">
        <h2 className="reveal font-heading text-[clamp(1.7rem,3.2vw,2.8rem)] text-blush font-light mb-[0.7rem]">
          Follow the Journey
        </h2>
        <p className="reveal text-blush/75 text-[0.86rem] leading-[1.7] mb-[1.8rem] font-light">
          101 posts · 274 followers · Countless happy hijabis.
          <br />
          Join our community and find your perfect style.
        </p>
        <div className="reveal mb-[1.6rem]">
          <span className="inline-block bg-white/[.12] text-blush px-[1.3rem] py-[0.45rem] text-[0.82rem] tracking-[0.1em] rounded-full border border-white/20">
            @_hijab__haven_
          </span>
        </div>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className="reveal inline-flex items-center gap-[0.55rem] bg-rose text-white px-[2.2rem] py-[0.85rem] max-[560px]:px-6 max-[560px]:py-[0.7rem] no-underline text-[0.78rem] max-[560px]:text-[0.72rem] tracking-[0.14em] uppercase rounded transition-all hover:bg-white hover:text-rose"
        >
          📸 Visit our Instagram
        </a>
        <div className="reveal mt-8">
          <p className="text-blush/75 text-[0.76rem] tracking-[0.18em] uppercase mb-[0.9rem]">
            Share this website
          </p>
          <div className="flex justify-center gap-[0.8rem] flex-wrap max-[560px]:flex-col max-[560px]:items-center">
            <button
              onClick={shareWhatsApp}
              className="inline-flex items-center gap-[0.45rem] px-[1.3rem] py-[0.6rem] rounded-full text-[0.74rem] tracking-[0.1em] uppercase border-[1.5px] border-white/30 text-blush bg-white/[.08] transition-all cursor-pointer hover:bg-white/20 font-body"
            >
              💬 WhatsApp
            </button>
            <button
              onClick={shareCopy}
              className="inline-flex items-center gap-[0.45rem] px-[1.3rem] py-[0.6rem] rounded-full text-[0.74rem] tracking-[0.1em] uppercase border-[1.5px] border-white/30 text-blush bg-white/[.08] transition-all cursor-pointer hover:bg-white/20 font-body"
            >
              🔗 Copy Link
            </button>
            <button
              onClick={shareNative}
              className="inline-flex items-center gap-[0.45rem] px-[1.3rem] py-[0.6rem] rounded-full text-[0.74rem] tracking-[0.1em] uppercase border-[1.5px] border-white/30 text-blush bg-white/[.08] transition-all cursor-pointer hover:bg-white/20 font-body"
            >
              📤 Share
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
