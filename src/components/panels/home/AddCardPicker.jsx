import { useMemo, useState } from 'react'
import { addItem } from '../../../lib/homeContent'

// Ported from old-portal/js/homeContent.js's _hcRenderAddCardTile/
// _hcRenderAddCardSearchStep/_hcRenderAddCardConfirmStep — search an
// employee, confirm, add. subtitle/location/photo always come from
// Employee_details, never manual entry.
export default function AddCardPicker({ open, onOpen, onClose, sectionId, empDirectory, existingNames, nextOrder, myEmail, onAdded }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [extraLabel, setExtraLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const results = useMemo(() => {
    const dir = empDirectory || []
    const q = query.trim().toLowerCase()
    const filtered = q ? dir.filter((e) => (e.Employee_name || '').toLowerCase().includes(q)) : dir
    return filtered.slice(0, 40)
  }, [empDirectory, query])

  function reset() {
    setQuery('')
    setSelected(null)
    setExtraLabel('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function confirmAdd() {
    if (!selected) return
    setSaving(true)
    try {
      await addItem({
        sectionId,
        employee: selected,
        extraLabel: extraLabel.trim(),
        displayOrder: nextOrder,
        createdBy: myEmail,
      })
      handleClose()
      onAdded()
    } catch (e) {
      alert('❌ Failed to add card: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title="Add a card"
        className="w-[190px] h-[150px] rounded-xl border-[1.5px] border-dashed border-border flex items-center justify-center text-text-muted text-[26px]"
      >
        +
      </button>
    )
  }

  const isDuplicate = selected && existingNames.includes((selected.Employee_name || '').trim().toLowerCase())

  return (
    <div className="relative w-[190px] h-[150px]">
      <div className="absolute top-0 left-0 w-[260px] bg-surface border border-border rounded-xl p-3 z-20 shadow-lg text-left">
        {!selected ? (
          <>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 Search employee name…"
              className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text mb-2"
            />
            <div className="max-h-[180px] overflow-y-auto flex flex-col gap-0.5">
              {empDirectory === null && <div className="text-[11.5px] text-text-muted px-1 py-1.5">Loading employees…</div>}
              {empDirectory !== null && !results.length && (
                <div className="text-[11.5px] text-text-muted px-1 py-1.5">No matches.</div>
              )}
              {results.map((emp) => (
                <button
                  key={emp.Employee_name}
                  type="button"
                  onClick={() => setSelected(emp)}
                  className="text-left rounded-md px-2 py-1.5 hover:bg-surface-2"
                >
                  <div className="text-[12px] font-medium text-text">{emp.Employee_name}</div>
                  <div className="text-[10.5px] text-text-muted">{emp.Employee_Dept || '—'}</div>
                </button>
              ))}
            </div>
            <button type="button" onClick={handleClose} className="mt-2 w-full rounded-md border border-border py-1 text-[11.5px] text-text-muted">
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="text-[12.5px] font-semibold text-text mb-1">{selected.Employee_name}</div>
            <div className="text-[11px] text-text-muted mb-1.5">
              {selected.Employee_Dept || '—'}
              {selected.Location ? ` · ${selected.Location}` : ''}
            </div>
            <div className="text-[10.5px] text-text-muted mb-2.5">
              {selected.avatar_url || selected.Link ? '📷 Profile photo will be used' : '⚠️ No profile photo on file'}
            </div>
            {isDuplicate && (
              <div className="text-[11px] text-primary bg-primary-tint border border-primary/20 rounded-md px-2 py-1.5 mb-2.5">
                ⚠️ {selected.Employee_name} already has an active card in this section. Add anyway?
              </div>
            )}
            <label className="block text-[10.5px] text-text-muted mb-1">Extra label (optional)</label>
            <input
              type="text"
              value={extraLabel}
              onChange={(e) => setExtraLabel(e.target.value)}
              placeholder="e.g. June 2026"
              className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text mb-2.5"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmAdd}
                disabled={saving}
                className="flex-1 rounded-md py-1.5 text-[12px] font-semibold text-white bg-primary disabled:opacity-60"
              >
                {isDuplicate ? 'Add Anyway' : 'Add'}
              </button>
              <button type="button" onClick={handleClose} className="rounded-md border border-border px-3 py-1.5 text-[12px] text-text-muted">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
