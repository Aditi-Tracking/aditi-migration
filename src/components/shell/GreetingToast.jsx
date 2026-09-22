import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'

// Restyled version of old-portal's showGreetingAnimation() — same 2.2s
// auto-dismiss trigger (on justLoggedIn), compact instead of a full-screen
// gold overlay.
export default function GreetingToast() {
  const { currentUser, justLoggedIn, clearJustLoggedIn } = useAuth()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!justLoggedIn) return
    // Deferred a frame so the mount-time opacity-0 state actually paints
    // before flipping to opacity-100 — otherwise the fade-in transition has
    // nothing to transition from.
    const raf = requestAnimationFrame(() => setVisible(true))
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(clearJustLoggedIn, 300)
    }, 2200)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [justLoggedIn, clearJustLoggedIn])

  if (!justLoggedIn) return null

  const name = (currentUser?.name || currentUser?.email?.split('@')[0] || '').split(' ')[0]

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] rounded-lg bg-primary text-white px-5 py-3 shadow-lg transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
    >
      <div className="text-[15px] font-bold">👋 Hello, {name}!</div>
      <div className="text-[13px] text-white/80 mt-0.5">Welcome back</div>
    </div>
  )
}
