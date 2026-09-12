import { useState } from 'react'

// Ported from old-portal/js/renewals.js's _ruEditableCellHtml/
// ruSaveInlineField — save-on-blur/Enter, revert + alert on failure.
// Implemented as a borderless <input> rather than a contentEditable cell
// (React-idiomatic technique swap — contentEditable fights React's own
// render/state model) but the same interaction: click in, type, blur or
// Enter commits.
export default function EditableCell({ value, onSave, className = '' }) {
  const [draft, setDraft] = useState(value || '')
  const [flash, setFlash] = useState(null) // 'success' | 'error' | null

  async function commit() {
    const newValue = draft.trim()
    if (newValue === (value || '')) return // nothing changed — don't round-trip for free
    try {
      await onSave(newValue)
      setFlash('success')
    } catch (e) {
      setDraft(value || '') // revert the visible edit — the write never landed
      setFlash('error')
      alert('❌ Could not save: ' + e.message)
    } finally {
      setTimeout(() => setFlash(null), 700)
    }
  }

  return (
    <td
      className={className}
      style={{
        background: flash === 'success' ? 'rgba(0,212,170,0.18)' : flash === 'error' ? 'rgba(255,92,124,0.18)' : undefined,
        transition: 'background 0.15s',
      }}
    >
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-full bg-transparent outline-none text-[12.5px] text-text"
      />
    </td>
  )
}
