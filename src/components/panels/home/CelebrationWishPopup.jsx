import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useCelebrations } from '../../../context/CelebrationsContext'
import { hasAlreadyWished, ordinal, sendWish } from '../../../lib/celebrations'
import OverlayShell from '../../shared/OverlayShell'

const MAX_LEN = 200

// Ported from old-portal/js/celebrations.js's _openCelebPopup/sendWish +
// the canvas confetti engine (_startConfetti/_stopConfetti). Global overlay
// (see CelebrationsContext's file header) — can appear over any panel, not
// just Home. Colors use the single primary palette per the design system
// (production's amber/pink/teal gradients aren't replicated); confetti
// itself stays multi-colored since that's the actual subject matter, not
// UI chrome.
export default function CelebrationWishPopup() {
  const { currentUser } = useAuth()
  const { popup, closeWishPopup, empList, refreshSelfWishCount } = useCelebrations()
  const canvasRef = useRef(null)

  const [wishText, setWishText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [alreadyWished, setAlreadyWished] = useState(null) // null = checking (others-mode only)

  const isSelf = popup?.mode === 'birthday-self' || popup?.mode === 'anniversary-self'
  const celebType = popup?.mode?.includes('birthday') ? 'birthday' : 'anniversary'

  useEffect(() => {
    if (!popup) return
    // Reset the form fresh each time a new popup opens — it stays mounted between opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWishText('')
    setSending(false)
    setSent(false)
    setError('')
    setAlreadyWished(null)

    const type = popup.mode.includes('birthday') ? 'birthday' : 'anniversary'
    if (popup.mode === 'birthday-self' || popup.mode === 'anniversary-self') {
      refreshSelfWishCount(popup.person.email || currentUser?.email, type, popup.person.empId || null)
    } else {
      // DB-authoritative — resolved async so nothing wrong flashes before it settles.
      hasAlreadyWished(currentUser, popup.person, type, empList).then(setAlreadyWished)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when a new popup opens
  }, [popup])

  // Confetti — full-bleed canvas behind the card content, torn down on close/unmount.
  useEffect(() => {
    if (!popup) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth || 480
    canvas.height = canvas.offsetHeight || 400

    const isBirthday = popup.mode.includes('birthday')
    const colors = isBirthday
      ? ['#f0a500', '#ffcc44', '#ff5c7c', '#00d4aa', '#4e9af1', '#ff9f43', '#ff6b9d']
      : ['#4e9af1', '#00d4aa', '#f0a500', '#b8e0ff', '#48dbfb']

    const parts = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: 7 + Math.random() * 9,
      h: 5 + Math.random() * 7,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: 1.2 + Math.random() * 2.2,
      angle: Math.random() * 360,
      spin: (Math.random() - 0.5) * 4,
      swing: (Math.random() - 0.5) * 1.5,
      opacity: 0.7 + Math.random() * 0.3,
    }))

    let frame
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      parts.forEach((p) => {
        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.translate(p.x, p.y)
        ctx.rotate((p.angle * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
        p.y += p.speed
        p.x += p.swing
        p.angle += p.spin
        if (p.y > canvas.height) {
          p.y = -10
          p.x = Math.random() * canvas.width
        }
      })
      frame = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [popup])

  async function handleSend() {
    if (!wishText.trim()) {
      setError('Please write something')
      return
    }
    setSending(true)
    setError('')
    try {
      await sendWish(currentUser, popup.person, celebType, wishText.trim(), empList)
      setSent(true)
      setTimeout(() => closeWishPopup(), 2500)
    } catch (e) {
      setSending(false)
      setError(e.message || 'Could not send wish')
    }
  }

  if (!popup) return null

  const { mode, person, years } = popup
  const firstName = (person.name || '').split(' ')[0]
  const y = years || 0

  let emoji, title, name, subtitle, milestone
  if (mode === 'birthday-self') {
    emoji = '🎂'
    title = "🎉 Happy Birthday!"
    name = person.name || currentUser?.name
    subtitle = 'Wishing you a wonderful birthday filled with joy, laughter, and all the happiness in the world! 🎈✨ The entire Aditi Tracking family wishes you the best!'
  } else if (mode === 'anniversary-self') {
    emoji = '🥳'
    title = '🌟 Work Anniversary!'
    name = person.name || currentUser?.name
    subtitle = `Congratulations on completing ${ordinal(y)} year${y > 1 ? 's' : ''} with Aditi Tracking! Your dedication and hard work inspire us all. Here's to many more years of growth and success! 🚀`
    if (y > 0) milestone = `🏆 ${ordinal(y)} Work Anniversary`
  } else if (mode === 'birthday-others') {
    emoji = '🎂'
    title = `Happy Birthday, ${firstName}!`
    name = person.name
    subtitle = `Today is ${firstName}'s special day! 🎊 Send a warm wish and make their birthday extra special!`
  } else {
    emoji = '🥳'
    title = 'Work Anniversary!'
    name = person.name
    subtitle = `${firstName} is celebrating their ${ordinal(y)} work anniversary today! 🎊 Appreciate their journey and send your best wishes!`
    if (y > 0) milestone = `⭐ ${ordinal(y)} Work Anniversary`
  }

  return (
    <OverlayShell open={!!popup} onClose={closeWishPopup} maxWidth="max-w-md">
      <canvas ref={canvasRef} className="absolute inset-0 rounded-2xl pointer-events-none" />
      <div className="relative z-10">
        <div className="h-1.5 -mx-6 -mt-6 mb-4 rounded-t-2xl bg-primary" />
        <div className="text-center">
          <div className="text-[40px] leading-none mb-2">{emoji}</div>
          <div className="text-[16px] font-semibold text-text">{title}</div>
          <div className="text-[14px] font-medium text-primary mt-1">{name}</div>
          <div className="text-[12px] text-text-muted mt-2.5 leading-relaxed">{subtitle}</div>
          {milestone && (
            <div className="inline-block mt-3 text-[11.5px] font-semibold text-primary bg-primary-tint border border-primary/20 rounded-full px-3 py-1">
              {milestone}
            </div>
          )}
        </div>

        {!isSelf && alreadyWished === true && (
          <div className="mt-4 rounded-xl bg-primary-tint border border-primary/20 text-primary text-[12.5px] font-semibold text-center px-3.5 py-3">
            ✅ You've already sent a wish today!
          </div>
        )}

        {!isSelf && alreadyWished === false && !sent && (
          <div className="mt-4">
            <textarea
              value={wishText}
              onChange={(e) => setWishText(e.target.value.slice(0, MAX_LEN))}
              placeholder={`Write a wish for ${firstName}...`}
              rows={3}
              className={`w-full rounded-lg border bg-surface-2 px-3 py-2.5 text-[12.5px] text-text outline-none resize-none ${error ? 'border-danger' : 'border-border'}`}
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10.5px] text-text-muted">{wishText.length}/{MAX_LEN}</span>
              {error && <span className="text-[10.5px] text-danger">{error}</span>}
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="w-full mt-2.5 rounded-lg bg-primary text-white text-[13px] font-semibold py-2.5 disabled:opacity-60"
            >
              {sending ? '⏳ Sending...' : '🎉 Send Wish!'}
            </button>
          </div>
        )}

        {!isSelf && sent && (
          <div className="mt-4 rounded-xl bg-primary-tint border border-primary/20 text-primary text-[12.5px] font-medium text-center px-3.5 py-3">
            ✅ Your wish has been sent! 🎊
            <div className="text-[11px] opacity-80 mt-1">
              — "{wishText.length > 60 ? wishText.slice(0, 60) + '…' : wishText}"
            </div>
          </div>
        )}
      </div>
    </OverlayShell>
  )
}
