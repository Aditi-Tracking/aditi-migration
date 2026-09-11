import { useState } from 'react'
import { ACCENT_PRESETS, ICON_PRESETS, createSection } from '../../../lib/homeContent'

// Ported from old-portal/js/homeContent.js's _hcRenderAddSectionAffordance/
// hcConfirmAddSection.
export default function AddSectionForm({ nextOrder, myEmail, onCreated }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState(ICON_PRESETS[0])
  const [accentColor, setAccentColor] = useState(ACCENT_PRESETS[0].key)
  const [saving, setSaving] = useState(false)

  function reset() {
    setTitle('')
    setIcon(ICON_PRESETS[0])
    setAccentColor(ACCENT_PRESETS[0].key)
  }

  async function handleCreate() {
    const t = title.trim()
    if (!t) {
      alert('❌ Title is required.')
      return
    }
    setSaving(true)
    try {
      await createSection({ title: t, icon, accent_color: accentColor, displayOrder: nextOrder, createdBy: myEmail })
      setOpen(false)
      reset()
      onCreated()
    } catch (e) {
      alert('❌ Failed to create section: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-center text-text-muted text-[12.5px]"
      >
        + Add Section
      </button>
    )
  }

  return (
    <div className="rounded-2xl border-[1.5px] border-dashed border-border p-4">
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Section title, e.g. Employee of the Quarter"
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text mb-2.5"
      />
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {ICON_PRESETS.map((ic) => (
          <button
            key={ic}
            type="button"
            onClick={() => setIcon(ic)}
            className={`text-[16px] px-2.5 py-1.5 rounded-md border ${
              ic === icon ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'
            }`}
          >
            {ic}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {ACCENT_PRESETS.map((c) => (
          <button
            key={c.key}
            type="button"
            title={c.key}
            onClick={() => setAccentColor(c.key)}
            style={{ background: c.hex }}
            className={`w-6 h-6 rounded-full border-2 ${accentColor === c.key ? 'border-text' : 'border-transparent'}`}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className="flex-1 rounded-md bg-primary text-white text-[12.5px] font-semibold py-2 disabled:opacity-60"
        >
          Create Section
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            reset()
          }}
          className="rounded-md border border-border px-4 py-2 text-[12.5px] text-text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
