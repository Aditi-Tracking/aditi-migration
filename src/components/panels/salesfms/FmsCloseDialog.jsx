import { useState } from 'react'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import { fmtMoment, inputToMoment } from '../../../lib/fmsFormat'
import { FmsError, closeLead } from '../../../lib/salesFms'

const INPUT = 'h-8 w-full rounded-lg border border-border bg-surface-2 px-2 text-[12.5px] text-text outline-none focus:border-primary disabled:opacity-60'
const BTN = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'

// Close a lead Won or Lost. A Lost lead takes only a comment (why it was lost); a Won lead may also carry the SO number and the order amount (MeCa's
// turnover reads the amount until Odoo supplies it from the SO number). The closing time is NOW — only an administrator may enter another one
// (a correction), so the field appears for them alone. Closing also sets the enquiry's status. Messages: a rule the user broke shows in place; any
// other failure goes to the module's toast.
// Props: row (the list row), canAdmin, onClose, onDone(row) — the lead was closed — and notify(toast).
export default function FmsCloseDialog({ row, canAdmin, onClose, onDone, notify }) {
  const [outcome, setOutcome] = useState('won')
  const [comment, setComment] = useState('')
  const [so, setSo] = useState('')
  const [amount, setAmount] = useState('')
  const [at, setAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const won = outcome === 'won'

  async function submit() {
    if (busy) return
    if (amount !== '' && (Number.isNaN(Number(amount)) || Number(amount) < 0)) return setError('The amount cannot be negative.')
    if (at && !inputToMoment(at)) return setError('Enter the closing time as a date and time.')
    setBusy(true)
    setError('')
    try {
      await closeLead({ enquiryId: row.enquiry_id, outcome, comment: comment.trim(), soNumber: won ? so.trim() : '', amount: won && amount !== '' ? Number(amount) : null, closedAt: canAdmin && at ? inputToMoment(at) : null })
      notify({ tone: 'success', text: `${row.name} was marked ${won ? 'Won' : 'Lost'}.` })
      onDone(row)
    } catch (e) {
      if (e instanceof FmsError && e.code === 'invalid') setError(e.message)
      else {
        notify({ tone: 'error', text: e.message })
        if (e instanceof FmsError && (e.code === 'gone' || e.code === 'denied')) onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <OverlayShell open onClose={busy ? () => {} : onClose} maxWidth="max-w-lg" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[16px] font-semibold text-text pr-10">Close {row.name}</div>
      <div className="text-[12.5px] text-text-muted mb-4">
        {[row.company_name, row.phone].filter(Boolean).join(' · ')} {row.sent_to_fms_at ? `· in Sales FMS since ${fmtMoment(row.sent_to_fms_at, true)}` : ''}
      </div>

      <div role="group" aria-label="Outcome" className="inline-flex rounded-lg border border-border overflow-hidden h-8 mb-3">
        {['won', 'lost'].map((o) => (
          <button key={o} type="button" aria-pressed={outcome === o} data-outcome={o} disabled={busy} onClick={() => { setOutcome(o); setError('') }} className={`px-5 text-[12.5px] font-semibold border-none ${outcome === o ? (o === 'won' ? 'bg-[#16A34A] text-white' : 'bg-danger text-white') : 'bg-surface-2 text-text-muted'}`}>
            {o === 'won' ? 'Won' : 'Lost'}
          </button>
        ))}
      </div>

      <label className="block text-[11.5px] text-text-muted mb-3">
        {won ? 'Comment (optional)' : 'Why was it lost?'}
        <input type="text" maxLength={500} className={`${INPUT} mt-0.5`} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
      </label>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <label className="block text-[11.5px] text-text-muted">
          SO number{won ? ' (optional)' : ''}
          <input type="text" maxLength={40} className={`${INPUT} mt-0.5`} value={won ? so : ''} disabled={busy || !won} onChange={(e) => setSo(e.target.value)} aria-label="SO number" placeholder={won ? 'e.g. S00123' : 'Won leads only'} />
        </label>
        <label className="block text-[11.5px] text-text-muted">
          Order amount ₹{won ? ' (optional)' : ''}
          <input type="number" min="0" step="0.01" className={`${INPUT} mt-0.5`} value={won ? amount : ''} disabled={busy || !won} onChange={(e) => setAmount(e.target.value)} aria-label="Order amount" placeholder={won ? '' : 'Won leads only'} />
        </label>
      </div>

      {canAdmin && (
        <label className="block text-[11.5px] text-text-muted mb-3">
          Closing time (administrator — leave empty for now)
          <input type="datetime-local" className={`${INPUT} mt-0.5 !w-[220px]`} value={at} disabled={busy} onChange={(e) => setAt(e.target.value)} aria-label="Closing time" />
        </label>
      )}

      <div className="text-[11.5px] text-text-muted mb-1">Closing sets the enquiry's status to {won ? 'Won' : 'Lost'}. Only an administrator can reopen a closed lead.</div>
      <div role="alert" data-role="error" className="min-h-[18px] text-[12px] leading-[18px] text-danger mb-2">
        {error}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" data-role="close-lead" disabled={busy} onClick={submit} className={`${BTN} ${PRIMARY} w-[150px]`}>
          <Icon name={busy ? 'loader' : 'check'} size={13} />
          {busy ? 'Closing…' : `Close as ${won ? 'Won' : 'Lost'}`}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className={BTN}>
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
