import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { postPortalUpdate, updatePortalUpdate } from '../../../lib/announcements'
import { useAuth } from '../../../context/AuthContext'

// Ported from old-portal/js/announcements.js's openPostUpdateModal/
// editPortalUpdate/submitPortalUpdate — same validation, same new-vs-edit
// POST/PATCH split.
export default function PostUpdateModal({ open, editingUpdate, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form fresh each time the modal opens
    setTitle(editingUpdate?.title || '')
    setBody(editingUpdate?.body || '')
    setError('')
    setSaving(false)
  }, [open, editingUpdate])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    const t = title.trim()
    const b = body.trim()
    if (!t) {
      setError('⚠️ Title is required.')
      return
    }
    if (!b) {
      setError('⚠️ Message cannot be empty.')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (editingUpdate) {
        await updatePortalUpdate(editingUpdate.id, { title: t, body: b })
      } else {
        await postPortalUpdate({ title: t, body: b, postedBy: currentUser?.name || 'MIS Team' })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError('❌ Error: ' + (err.message || 'Please try again.'))
      setSaving(false)
    }
  }

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="text-[15px] font-semibold text-text mb-4 pr-8">
        {editingUpdate ? '✏️ Edit Update' : '✨ Post Update'}
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Message</label>
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary text-white text-[13px] font-medium py-2.5 disabled:opacity-60"
        >
          {editingUpdate ? '💾 Save Changes' : '🚀 Publish Update'}
        </button>
        {error && <div className="rounded-md bg-danger-tint text-danger px-3 py-2 text-[12px] font-medium text-center">{error}</div>}
      </form>
    </OverlayShell>
  )
}
