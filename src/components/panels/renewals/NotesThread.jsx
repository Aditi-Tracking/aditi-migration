import { useEffect, useState } from 'react'
import { RU_NOTE_TYPE_STYLE, addCustomerNote, fetchCustomerNotes } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's _ruLoadNotesForCustomer/
// _ruNotesThreadHtml/_ruNotesInputHtml/_ruRenderNotesInto/_ruSubmitNoteFor.
// Deliberately generic (just a customer id) — production's own comment
// describes this as shared by two call sites, but the Accounts detail
// modal is the only one that actually exists in the current code; built
// this way anyway to match that intent rather than hardcoding one caller's
// assumptions into it. `resolveAuthorName` is a callback, not a prop this
// component looks up itself — name resolution depends on the owning tab's
// crm_persons/Employee_details maps, which this component has no business
// knowing about.
export default function NotesThread({ customerId, isAccounts, resolveAuthorName }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch whenever a (possibly different) customer's notes open
    setLoading(true)
    fetchCustomerNotes(customerId).then((rows) => {
      if (cancelled) return
      setNotes(rows)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [customerId])

  async function handleSubmit() {
    const note = draft.trim()
    if (!note) return
    setSubmitting(true)
    try {
      await addCustomerNote({ customerId, note, isAccounts })
      setDraft('')
      const rows = await fetchCustomerNotes(customerId)
      setNotes(rows)
    } catch (e) {
      alert('❌ Could not add note: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="text-[12px] text-text-muted">Loading notes…</div>

  return (
    <div>
      {notes.length ? (
        <div className="max-h-[280px] overflow-y-auto mb-3">
          {notes.map((n) => {
            const style = RU_NOTE_TYPE_STYLE[n.note_type] || RU_NOTE_TYPE_STYLE.system
            return (
              <div key={n.id} className="py-2.5 border-b border-border last:border-b-0">
                <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                  <span className="text-[12px] font-bold" style={{ color: style.color }}>
                    {resolveAuthorName(n.author_email)}
                  </span>
                  <span className="text-[10.5px] text-text-muted">{n.created_at ? new Date(n.created_at).toLocaleString('en-IN') : ''}</span>
                </div>
                <div className="text-[12.5px] text-text whitespace-pre-wrap leading-relaxed">{n.note}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[12.5px] text-text-muted py-2.5">No notes yet — add one below to share an update.</div>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder="e.g. Payment discrepancy found, following up with client..."
        className="w-full box-border rounded-lg border border-border bg-surface-2 text-text px-2.5 py-2 text-[12.5px] outline-none resize-y mb-2"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="rounded-lg bg-primary text-white font-bold text-[12.5px] px-4 py-2 disabled:opacity-60"
      >
        + Add Note
      </button>
    </div>
  )
}
