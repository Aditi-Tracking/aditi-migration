import { useAuth } from '../../context/AuthContext'

// Restyled version of old-portal's showIdleWarning(). Dismissing this only
// hides the toast (matches the original — clicking its × doesn't reset the
// idle timer, only real activity does).
export default function IdleWarningToast() {
  const { idleWarning, dismissIdleWarning } = useAuth()
  if (!idleWarning) return null

  return (
    <div className="fixed bottom-6 right-5 z-[200] max-w-[340px] rounded-xl border border-primary/30 bg-surface shadow-xl px-4 py-3.5 flex items-start gap-3">
      <span className="text-[20px] leading-none mt-0.5">⏱️</span>
      <div className="flex-1">
        <div className="text-[12.5px] font-semibold text-primary mb-1">Session Expiring Soon</div>
        <div className="text-[11.5px] text-text-muted leading-relaxed">
          You will be automatically logged out in <strong className="text-text">5 minutes</strong> due to
          inactivity.
        </div>
        <div className="text-[10.5px] text-text-muted mt-1">Click anywhere to stay logged in.</div>
      </div>
      <button
        type="button"
        onClick={dismissIdleWarning}
        className="text-text-muted text-[13px] leading-none shrink-0 mt-0.5"
      >
        ✕
      </button>
    </div>
  )
}
