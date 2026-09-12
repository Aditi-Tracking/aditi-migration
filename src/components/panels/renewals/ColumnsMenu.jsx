import { useEffect, useRef, useState } from 'react'
import { RU_COLUMNS, isColumnVisible } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's _ruColumnsMenuHtml — a checkbox
// dropdown for optional column visibility, persisted via columnPrefs (owned
// by MyCustomersTab, see lib/renewals.js's loadColumnPrefs/saveColumnPrefs).
// Click-outside-closes is done the React-idiomatic way (local state + a
// document listener scoped to this component) instead of production's
// global document click listener + module-level "was it open" flag.
export default function ColumnsMenu({ columnPrefs, isMIS, fullDataAccess, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-border bg-surface-2 text-text-muted px-3.5 py-1.5 text-[12.5px] font-bold"
      >
        Columns
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[500] bg-surface border border-border rounded-[10px] px-3.5 py-2 min-w-[190px] max-h-[280px] overflow-y-auto shadow-lg">
          {RU_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 text-[12.5px] text-text py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isColumnVisible(columnPrefs, col.key, { isMIS, fullDataAccess })}
                onChange={(e) => onToggle(col.key, e.target.checked)}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
