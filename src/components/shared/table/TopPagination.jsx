import { useState } from 'react'

// Compact Odoo-style pagination — a range indicator + prev/next arrows, shown top-right in a
// table's own header row (via Table's `actions` slot) instead of a bottom numbered-page footer.
// Replaces every table's old buildPageList/flat-list bottom pagination across the app, one table
// at a time (SmartFleet first, as the pilot).
//
// `page`/`pageSize`/`total`/`onPageChange` are exactly what every table already tracks today —
// no renaming needed at call sites. `zeroIndexed` (only Field Service Dashboard needs it) only
// affects the displayed range math; onPageChange(page-1)/(page+1) is identical either way, since
// incrementing/decrementing by 1 works the same regardless of where the count starts.
//
// The range text is click-to-edit: typing a row number (matching the displayed "start" number,
// not an abstract page number — there's no numbered-page concept left in the UI to type instead)
// and pressing Enter jumps to whichever page contains that row. Escape/blur cancel without
// navigating; an out-of-range number clamps to the first/last page rather than being rejected.
export default function TopPagination({ page, pageSize, total, onPageChange, zeroIndexed = false }) {
  const index = zeroIndexed ? page : page - 1
  const start = total === 0 ? 0 : index * pageSize + 1
  const end = Math.min(start + pageSize - 1, total)
  const canPrev = index > 0
  const canNext = end < total

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit() {
    if (total === 0) return
    setDraft(String(start))
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  function commitEdit() {
    const n = parseInt(draft, 10)
    if (!Number.isNaN(n)) {
      const clamped = Math.min(Math.max(n, 1), total)
      const targetIndex = Math.floor((clamped - 1) / pageSize)
      onPageChange(zeroIndexed ? targetIndex : targetIndex + 1)
    }
    setEditing(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commitEdit()
    else if (e.key === 'Escape') cancelEdit()
  }

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <span className="flex items-center gap-1 text-[11.5px] text-text-muted whitespace-nowrap">
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={handleKeyDown}
            onBlur={cancelEdit}
            onFocus={(e) => e.target.select()}
            className="w-10 text-[11.5px] text-text bg-surface border border-primary/40 rounded px-1 py-0.5 text-center outline-none"
          />
          -{end} / {total}
        </span>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          title="Click to jump to a row"
          className="text-[11.5px] text-text-muted whitespace-nowrap hover:text-text hover:underline decoration-dotted underline-offset-2"
        >
          {start}-{end} / {total}
        </button>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
          className="w-6 h-6 flex items-center justify-center rounded-md border border-border bg-surface-2 text-text disabled:opacity-40 disabled:cursor-default"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          aria-label="Next page"
          className="w-6 h-6 flex items-center justify-center rounded-md border border-border bg-surface-2 text-text disabled:opacity-40 disabled:cursor-default"
        >
          ›
        </button>
      </div>
    </div>
  )
}
