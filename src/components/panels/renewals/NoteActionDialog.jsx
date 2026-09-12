import { useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { flagCustomerToAccounts, resolveAccountsFlag } from '../../../lib/renewals'

const MODE_CONFIG = {
  flag: {
    title: 'Flag to Accounts',
    hint: 'Describe the issue for the Accounts team — this note is required.',
    submitLabel: 'Flag to Accounts',
  },
  resolve: {
    title: 'Resolve Flag',
    hint: 'Add a closing note explaining the resolution — this note is required.',
    submitLabel: 'Mark Resolved',
  },
}

// Ported from old-portal/js/renewals.js's ruOpenFlagDialog/ruOpenResolveDialog/
// ruSubmitNoteAction — one shared dialog for both actions, since they're
// structurally identical: a customer id + a required note + a submit that
// calls one of two RPCs. Neither RPC ever touches assigned_crm_person_id —
// flagging/resolving is a parallel status, not a reassignment. Used
// independently by MyCustomersTab (flag only) and AccountsDetailModal
// (resolve only) — each owns its own open state rather than lifting it,
// since the two tabs are never mounted simultaneously.
export default function NoteActionDialog({ open, mode, customerId, onClose, onSubmitted }) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const config = MODE_CONFIG[mode] || MODE_CONFIG.flag

  function handleClose() {
    setNote('')
    onClose()
  }

  async function handleSubmit() {
    const trimmed = note.trim()
    if (!trimmed) {
      alert('❌ A note is required.')
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'resolve') await resolveAccountsFlag({ customerId, note: trimmed })
      else await flagCustomerToAccounts({ customerId, note: trimmed })
      setNote('')
      onSubmitted(mode, customerId)
    } catch (e) {
      alert('❌ ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OverlayShell open={open} onClose={handleClose} maxWidth="max-w-sm">
      <div className="text-[15px] font-semibold text-primary mb-1.5">{config.title}</div>
      <div className="text-[12px] text-text-muted mb-3.5">{config.hint}</div>
      <label className="block text-[11px] font-semibold text-text-muted mb-1">Note *</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        className="w-full box-border rounded-lg border border-border bg-surface-2 text-text px-3 py-2 text-[13px] outline-none resize-y mb-3.5"
      />
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-primary text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {config.submitLabel}
        </button>
        <button type="button" onClick={handleClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
