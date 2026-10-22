import { useState } from 'react'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import StatusBadge from '../../shared/table/StatusBadge'
import { fmtHours, fmtMoment, fmtMoney, inputToMoment, momentToInput } from '../../../lib/fmsFormat'
import { PIPELINE_STATE_LABELS, PIPELINE_STATE_TONE, FmsError, STAGES, isClosed, reasonOptions, reopenLead, saveStage, stageFacts, stageLabel } from '../../../lib/salesFms'

const INPUT = 'h-8 w-full rounded-lg border border-border bg-surface-2 px-2 text-[12.5px] text-text outline-none focus:border-primary disabled:opacity-60'
const BTN = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'
const GRID = 'grid grid-cols-[170px_150px_150px_84px_84px_minmax(0,1fr)_64px] gap-x-3 items-center'

// The detail of ONE lead: its four stages with planned / actual / delay / how long each took / reason, and the closure with what was recorded
// (outcome, time, comment, SO number, amount). Read-only for everyone except:
//   canUpdate   a Close button on an open lead (opens the close dialog)
//   canAdmin    an Edit button on every stage (correct its planned time, actual time or reason — the stage version stamp guards against a lost
//               race) and Reopen on a closed lead
// Props: row (the list row), reasons (the managed reason lists, null while loading), canUpdate, canAdmin, onClose, onChanged(row) — something was
// written: re-read the row, onClosing(row) — open the close dialog, notify(toast).
export default function FmsLeadModal({ row, reasons, canUpdate, canAdmin, onClose, onChanged, onClosing, notify }) {
  const [editing, setEditing] = useState(null) // the stage key being corrected
  const [busy, setBusy] = useState(false)
  const closed = isClosed(row)

  async function reopen() {
    if (busy || !confirm(`Reopen “${row.name}”?\n\nThe closure (outcome, comment, SO number and amount) is removed and the enquiry's status goes back to Interested.`)) return
    setBusy(true)
    try {
      await reopenLead(row.enquiry_id)
      notify({ tone: 'success', text: `${row.name} was reopened.` })
      onChanged(row)
    } catch (e) {
      notify({ tone: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <OverlayShell open onClose={onClose} maxWidth="max-w-6xl" closeIcon={<Icon name="x" size={16} />}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 mb-1 pr-10">
        <div className="text-[17px] font-extrabold text-text break-words min-w-0">{row.name}</div>
        <StatusBadge tone={PIPELINE_STATE_TONE[row.pipeline_state] || 'neutral'}>{PIPELINE_STATE_LABELS[row.pipeline_state] || row.pipeline_state}</StatusBadge>
      </div>
      <div className="text-[12.5px] text-text-muted mb-4 break-words">
        {[row.company_name, row.phone, row.email, row.source, row.sales_person_accountable && `Sales: ${row.sales_person_accountable}`, `Entered ${fmtMoment(row.fc_planned, true)}`].filter(Boolean).join(' · ')}
      </div>

      <div className={`${GRID} text-[10.5px] font-semibold uppercase tracking-wide text-text-muted px-1 pb-1.5`}>
        <span>Stage</span>
        <span>Planned</span>
        <span>Actual</span>
        <span>Delay</span>
        <span>Took</span>
        <span>Reason</span>
        <span />
      </div>
      <div className="rounded-xl border border-border divide-y divide-border" data-role="stages">
        {STAGES.map((s, i) => {
          const f = stageFacts(row, i)
          const open = editing === s.key
          return (
            <div key={s.key} data-stage={s.key}>
              <div className={`${GRID} px-2 py-1.5 min-h-[44px]`}>
                <span className="text-[12.5px] font-semibold text-text truncate" title={s.label}>
                  {s.label}
                </span>
                <span className="text-[12.5px] text-text tabular-nums">{fmtMoment(f.planned)}</span>
                <span className="text-[12.5px] text-text tabular-nums">{fmtMoment(f.actual)}</span>
                <span className={`text-[12.5px] tabular-nums ${f.delayH >= 1 ? 'text-danger font-semibold' : f.delayH <= -1 ? 'text-[#16A34A] font-semibold' : 'text-text'}`} data-role="delay" title="Actual minus planned">
                  {f.delayH === null ? '—' : f.delayH >= 1 ? `+${fmtHours(f.delayH)}` : f.delayH <= -1 ? `-${fmtHours(f.delayH)}` : 'on time'}
                </span>
                <span className="text-[12.5px] tabular-nums text-text" data-role="cycle" title="Time since the previous stage was done (the first call: since the lead was entered)">
                  {f.cycleH === null ? '—' : fmtHours(f.cycleH)}
                </span>
                <span className="text-[12.5px] text-text truncate" title={f.reason || (s.hasReason ? '' : 'Negotiation has no reason')}>
                  {s.hasReason ? f.reason || <span className="text-text-muted">—</span> : <span className="text-text-muted">no reason for this stage</span>}
                </span>
                <span className="text-right">
                  {canAdmin && (
                    <button type="button" data-role="edit-stage" aria-label={`Correct ${s.label}`} onClick={() => setEditing(open ? null : s.key)} className="bg-transparent border-none text-[12px] font-semibold text-primary px-1">
                      {open ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </span>
              </div>
              {open && <StageEditor key={`${s.key}|${f.stamp}`} row={row} index={i} reasons={reasons} onDone={() => { setEditing(null); onChanged(row) }} notify={notify} onCancel={() => setEditing(null)} />}
            </div>
          )
        })}
      </div>

      <div className="mt-3 rounded-xl border border-border bg-surface-2/50 px-3 py-3" data-role="closure">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[12.5px] font-semibold text-text">{closed ? 'Closure' : 'Closure — not closed yet'}</span>
          {closed && (
            <span className="text-[12.5px] text-text-muted break-words min-w-0">
              {[row.outcome === 'won' ? 'Won' : 'Lost', fmtMoment(row.closed_at, true), row.so_number && `SO ${row.so_number}`, row.closed_amount != null && fmtMoney(row.closed_amount), row.closure_comment].filter(Boolean).join(' · ')}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {!closed && canUpdate && (
              <button type="button" data-role="close-lead" onClick={() => onClosing(row)} className={`${BTN} ${PRIMARY}`}>
                <Icon name="check" size={13} />
                Close this lead
              </button>
            )}
            {closed && canAdmin && (
              <button type="button" data-role="reopen" disabled={busy} onClick={reopen} className={BTN}>
                <Icon name={busy ? 'loader' : 'undo'} size={13} />
                Reopen
              </button>
            )}
          </span>
        </div>
        {!closed && !canUpdate && <div className="mt-1 text-[12px] text-text-muted">Closing a lead needs the Sales FMS update permission.</div>}
        <div className="mt-1.5 text-[11.5px] text-text-muted">Current stage: {row.current_stage ? stageLabel(row.current_stage) : 'closed'}. Closure has no planned time.</div>
      </div>
    </OverlayShell>
  )
}

// Administrator: correct ONE stage. Only what was changed is sent; an emptied time field clears that time. Setting an actual where there was
// none plans the next stage (the database does it).
function StageEditor({ row, index, reasons, onDone, onCancel, notify }) {
  const s = STAGES[index]
  const f = stageFacts(row, index)
  const [planned, setPlanned] = useState(momentToInput(f.planned))
  const [actual, setActual] = useState(momentToInput(f.actual))
  const [reason, setReason] = useState(f.reason || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = s.hasReason ? reasonOptions(reasons, s.key) : []
  const known = options.some((o) => o.value === reason)

  async function save() {
    const patch = {}
    if (planned !== momentToInput(f.planned)) {
      if (planned && !inputToMoment(planned)) return setError('Enter the planned time as a date and time.')
      patch.planned_at = planned ? inputToMoment(planned) : null
    }
    if (actual !== momentToInput(f.actual)) {
      if (actual && !inputToMoment(actual)) return setError('Enter the actual time as a date and time.')
      patch.actual_at = actual ? inputToMoment(actual) : null
    }
    if (s.hasReason && reason !== (f.reason || '')) patch.reason = reason || null
    if (!Object.keys(patch).length) return setError('Nothing was changed.')
    setBusy(true)
    setError('')
    try {
      await saveStage(row.enquiry_id, s.key, patch, f.stamp)
      notify({ tone: 'success', text: `${s.label} corrected.` })
      onDone()
    } catch (e) {
      if (e instanceof FmsError && e.code === 'invalid') setError(e.message)
      else if (e instanceof FmsError && e.code === 'conflict') notify({ tone: 'error', text: e.message, action: { label: 'Reload', onClick: onDone } })
      else notify({ tone: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-3 pb-3 pt-1 bg-surface-2/40" data-role="stage-editor">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-text-muted">
          Planned
          <input type="datetime-local" aria-label={`${s.label} planned time`} className={`${INPUT} mt-0.5 !w-[210px]`} value={planned} disabled={busy} onChange={(e) => setPlanned(e.target.value)} />
        </label>
        <label className="text-[11px] text-text-muted">
          Actual
          <input type="datetime-local" aria-label={`${s.label} actual time`} className={`${INPUT} mt-0.5 !w-[210px]`} value={actual} disabled={busy} onChange={(e) => setActual(e.target.value)} />
        </label>
        {s.hasReason && (
          <label className="text-[11px] text-text-muted">
            Reason
            <select aria-label={`${s.label} reason`} className={`${INPUT} mt-0.5 !w-[190px]`} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)}>
              <option value="">—</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {reason && !known && <option value={reason}>{reason}</option>}
            </select>
          </label>
        )}
        <button type="button" data-role="save-stage" disabled={busy} onClick={save} className={`${BTN} ${PRIMARY} w-[96px]`}>
          <Icon name={busy ? 'loader' : 'check'} size={13} />
          Save
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={BTN}>
          Cancel
        </button>
      </div>
      <div className="mt-1 text-[11px] text-text-muted">Times are India time. Empty a time to clear it. A correction sets exactly what you enter — choosing a reason here does not stamp the actual time (set it too).</div>
      <div role="alert" data-role="stage-error" className="min-h-[18px] text-[12px] leading-[18px] text-danger">
        {error}
      </div>
    </div>
  )
}
