// Generic backdrop + centered card + close button, shared by every
// old-portal overlay (they're all fixed-position dark-backdrop cards with
// an X button in the same spot — HR Docs / Org Chart / Directory / Holiday
// overlays now, more modules will reuse this later).
//
// The backdrop centers the card with flex (not the earlier `overflow-y-auto`
// + `mx-auto my-8` approach, which made the backdrop itself the scroll
// container — so a tall modal's card scrolled along with the page instead
// of staying centered). The card caps itself at max-h-[90vh] with its own
// overflow-y-auto, so only the card's content scrolls once it's taller than
// that, while the card stays centered in the viewport regardless of scroll.
// Confirmed no consumer (45 across the app) has JS logic tied to the old
// backdrop-scrolls behavior (no scrollIntoView/scrollTop/scroll listeners
// anywhere touching this) before making this the default for all of them.
export default function OverlayShell({ open, onClose, maxWidth = 'max-w-2xl', children }) {
  if (!open) return null
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
    >
      <div className={`relative w-full ${maxWidth} max-h-[90vh] overflow-y-auto bg-surface border border-border rounded-2xl shadow-2xl p-6`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-2 border border-border text-text-muted flex items-center justify-center z-20"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
