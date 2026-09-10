// Generic backdrop + centered card + close button, shared by every
// old-portal overlay (they're all fixed-position dark-backdrop cards with
// an X button in the same spot — HR Docs / Org Chart / Directory / Holiday
// overlays now, more modules will reuse this later).
export default function OverlayShell({ open, onClose, maxWidth = 'max-w-2xl', children }) {
  if (!open) return null
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[100] bg-black/60 overflow-y-auto p-4"
    >
      <div className={`relative mx-auto my-8 w-full ${maxWidth} bg-surface border border-border rounded-2xl shadow-2xl p-6`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-2 border border-border text-text-muted flex items-center justify-center z-10"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
