import { useEffect, useState } from 'react'

// Brand splash (§12.1) — full-viewport overlay above the gate (z-[10001] >
// gate's z-[9999]), shown once per browser session via sessionStorage
// hh_splash_seen. Fixed 1.8s, then a 400ms opacity fade (same exit feel as
// the gate) and unmount. The gate mounts beneath from the start; zero
// coupling between the two components. sessionStorage failures are treated
// as "seen" — the splash must never be able to brick entry.

const SPLASH_MS = 1800
const FADE_MS = 400

function hasSeenSplash(): boolean {
  try {
    return sessionStorage.getItem('hh_splash_seen') === '1'
  } catch {
    return true
  }
}

export default function Splash() {
  // Lazy init: seen-this-session renders null immediately (§12.1).
  const [visible, setVisible] = useState(() => !hasSeenSplash())
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!visible) return
    // Flag is set when the fade starts (§12.1).
    const fadeTimer = window.setTimeout(() => {
      try {
        sessionStorage.setItem('hh_splash_seen', '1')
      } catch {
        // Ignore — the unmount timer still reveals the app.
      }
      setFading(true)
    }, SPLASH_MS)
    const unmountTimer = window.setTimeout(() => setVisible(false), SPLASH_MS + FADE_MS)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(unmountTimer)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-label="Loading Hijab Haven"
      className={`fixed inset-0 z-[10001] bg-gradient-to-br from-mocha to-warm flex flex-col items-center justify-center p-4 transition-opacity duration-[400ms] ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="w-[110px] h-[110px] rounded-full overflow-hidden border-4 border-white/30 shadow-[0_8px_30px_rgba(0,0,0,0.25)] animate-splash-blink">
        <img src="/images/logo.jpg" alt="" className="w-full h-full object-cover block" />
      </div>
      <div className="font-heading text-[2rem] text-white font-normal mt-5">Hijab Haven</div>
      <div className="w-[180px] h-[3px] rounded-full bg-white/20 overflow-hidden mt-6">
        <div className="h-full rounded-full bg-rose animate-splash-bar" />
      </div>
    </div>
  )
}
