import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'

// A confirm box whose DEFAULT button is Cancel — window.confirm() can't do that (Enter always
// hits OK). Used where an action takes a link away from several GPS companies at once, so a stray
// Enter/Space can never confirm it. Escape and a backdrop click also cancel.
//
// dialog: { title, message, names?: string[], more?: number, confirmLabel, onConfirm: async () => void }
export default function MappingConfirmDialog({ dialog, onClose }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!dialog) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, onClose])

  if (!dialog) return null

  async function confirm() {
    setBusy(true)
    try {
      await dialog.onConfirm()
    } finally {
      setBusy(false)
      onClose()
    }
  }

  return (
    <OverlayShell open onClose={onClose} maxWidth="max-w-md">
      <div className="pr-8">
        <div className="text-[15px] font-bold text-text">{dialog.title}</div>
        <div className="mt-2 text-[12.5px] text-text-muted">{dialog.message}</div>
        {dialog.names?.length > 0 && (
          <ul className="mt-3 max-h-[240px] overflow-y-auto rounded-lg border border-border bg-surface-2 py-1.5 text-[12.5px] text-text">
            {dialog.names.map((n, i) => (
              <li key={`${i}:${n}`} className="px-3 py-0.5 truncate" title={n}>
                • {n}
              </li>
            ))}
            {dialog.more > 0 && <li className="px-3 py-0.5 text-text-muted">and {dialog.more} more</li>}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="text-[12.5px] font-semibold rounded-md px-3.5 py-1.5 border border-primary bg-primary-tint text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={confirm}
          className="text-[12.5px] font-semibold rounded-md px-3.5 py-1.5 border border-border bg-surface text-danger disabled:opacity-50"
        >
          {busy ? 'Working…' : dialog.confirmLabel || 'Confirm'}
        </button>
      </div>
    </OverlayShell>
  )
}
