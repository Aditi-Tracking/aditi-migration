import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

const TONE = {
  success: 'bg-primary-tint text-primary border-primary/30',
  warn: 'bg-[#f0a500]/15 text-[#f0a500] border-[#f0a500]/40',
  error: 'bg-danger-tint text-danger border-danger/30',
}

// A message that appears OVER the page instead of in it. An inline banner pushes the table (or the Submit button)
// down when it appears and pulls it back up when it goes — a control moving because of an unrelated message. This is
// position: fixed, so showing, replacing or dismissing it can never move anything.
// One toast at a time: `toast` is { tone: 'success' | 'warn' | 'error', text, action?: { label, onClick } } or null,
// and the module keeps it in its own state (a NEW object each time, so a repeat message restarts the timer).
//   success  — a pure success, e.g. "Sent 3 to FMS": fades by itself after 6 s (hovering pauses it)
//   warn     — a partial outcome ("Sent 2 · 1 was already sent"): stays until dismissed, like an error — the reason
//              exists only in this text, so it must not vanish before it has been read
//   error    — stays until dismissed
// Sits above modals (z-100) and popovers (z-600). The opaque surface underneath keeps the tinted message readable over
// whatever is behind it.
export default function Toast({ toast, onDismiss, autoDismissMs = 6000 }) {
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  })
  const [pausedToast, setPausedToast] = useState(null) // the toast the pointer is over (identity, so a new toast starts unpaused)
  const auto = toast?.tone === 'success'
  const paused = pausedToast === toast

  useEffect(() => {
    if (!toast || !auto || paused) return
    const t = setTimeout(() => dismissRef.current?.(), autoDismissMs)
    return () => clearTimeout(t)
  }, [toast, auto, paused, autoDismissMs])

  if (!toast) return null
  const tone = TONE[toast.tone] ? toast.tone : 'error'
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[700] w-[min(560px,calc(100vw-1.5rem))] pointer-events-none">
      <div className="pointer-events-auto rounded-lg bg-surface shadow-lg" onMouseEnter={() => setPausedToast(toast)} onMouseLeave={() => setPausedToast(null)}>
        <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 px-3.5 py-2.5 rounded-lg border text-[13px] font-semibold ${TONE[tone]}`}>
          <span className="min-w-0 flex-1 break-words">{toast.text}</span>
          {toast.action && (
            <button type="button" onClick={toast.action.onClick} className="shrink-0 underline bg-transparent border-none text-current font-bold p-0">
              {toast.action.label}
            </button>
          )}
          <button type="button" onClick={() => onDismiss?.()} aria-label="Dismiss" className="shrink-0 mt-0.5 bg-transparent border-none text-current p-0 leading-none">
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
