import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { empName, submitReassign } from '../../../lib/fms'

// Ported from old-portal/js/fms.js's fmsOpenReassignOverlay/fmsSubmitReassign.
// Drops the currently-assigned person from the list — reassigning to
// yourself makes no sense.
export default function ReassignModal({ open, order, supportPersons, empMap, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const [newAssignee, setNewAssignee] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the overlay opens
    setNewAssignee('')
    setNotes('')
    setError('')
  }, [open])

  if (!order) return null

  const currentEmail = (order.assigned_to_support || '').toLowerCase().trim()
  const options = supportPersons.filter((p) => p.email !== currentEmail)

  async function handleSubmit() {
    if (!newAssignee) {
      setError('❌ Select a support person')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await submitReassign({
        order,
        newAssignee,
        notes: notes.trim(),
        myEmail: currentUser?.email || '',
        myName: empName(empMap, currentUser?.email),
      })
      onSaved?.()
      onClose()
    } catch (e) {
      setError('❌ Error: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none'

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-sm">
      <div className="text-[15px] font-semibold text-text mb-3">🔁 Reassign Order</div>
      <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 mb-3.5 text-[12.5px] text-text leading-relaxed">
        <div>
          <strong>SO:</strong> {order.so_number} &nbsp;|&nbsp; <strong>Client:</strong> {order.client_name || '—'}
        </div>
        <div>
          <strong>Currently Assigned To:</strong> {empName(empMap, order.assigned_to_support)}
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Reassign To *</label>
        <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className={inputClass}>
          <option value="">Select support person...</option>
          {options.map((p) => (
            <option key={p.email} value={p.email}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3.5">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Notes (optional)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for reassignment..." className={inputClass} />
      </div>

      {error && <div className="text-[12.5px] text-danger mb-2.5">{error}</div>}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-primary text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {submitting ? '⏳ Reassigning...' : '🔁 Reassign'}
        </button>
        <button type="button" onClick={onClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
