import { INSTAGRAM_URL } from '@/lib/whatsapp'

// Ported from App Build; styling mirrors the live site's footer (§8).
export default function Footer() {
  return (
    <footer className="bg-[#2a1a12] text-blush/55 text-center py-7 px-[5%] text-xs">
      <div className="flex items-center justify-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-rose">
          <img src="/images/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
        </div>
        <span className="font-heading text-lg text-blush">Hijab Haven</span>
      </div>
      <p>
        © 2025 Hijab Haven · Navi Mumbai ·{' '}
        <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="text-rose no-underline">
          @_hijab__haven_
        </a>{' '}
        · Made with ❤️
      </p>
    </footer>
  )
}
