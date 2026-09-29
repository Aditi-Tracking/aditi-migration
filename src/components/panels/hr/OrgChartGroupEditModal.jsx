import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import ColorSwatchPicker from './ColorSwatchPicker'
import FontSizePicker from './FontSizePicker'

// Edits label + color + font size for one department heading. Delete has no confirm dialog,
// matching this module's other low-stakes toggles (Reactivate in HR Employee Master) rather than
// its destructive ones (Remove employee) — a heading is a cosmetic label, not linked data, so
// removing one loses nothing but the label itself.
export default function OrgChartGroupEditModal({ group, onClose, onSave, onDelete }) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('primary')
  const [fontSize, setFontSize] = useState(36)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (group) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form to whichever group was clicked
      setLabel(group.label || '')
      setColor(group.bg_color || 'primary')
      setFontSize(group.font_size || 36)
      setError('')
    }
  }, [group])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await onSave({ label, bgColor: color, fontSize })
      onClose()
    } catch (e) {
      setError('❌ Failed to save: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await onDelete()
      onClose()
    } catch (e) {
      setError('❌ Failed to delete: ' + e.message)
      setSaving(false)
    }
  }

  return (
    <OverlayShell open={!!group} onClose={onClose} maxWidth="max-w-sm">
      <div className="text-[15px] font-semibold text-text mb-4">Edit Heading</div>

      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
        />
      </div>

      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Color</label>
        <ColorSwatchPicker value={color} onChange={setColor} />
      </div>

      <div className="mb-1">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Text Size</label>
        <FontSizePicker value={fontSize} onChange={setFontSize} />
      </div>

      {error && <div className="text-danger text-[12px] mt-2.5">{error}</div>}

      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !label.trim()}
          className="rounded-lg px-4 py-2 font-bold text-white bg-primary disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="rounded-lg px-4 py-2 font-semibold text-danger border border-danger/30 disabled:opacity-50"
        >
          Delete
        </button>
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold border border-border text-text">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
