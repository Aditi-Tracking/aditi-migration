import { useEffect, useState } from 'react'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import StatusBadge from '../../shared/table/StatusBadge'
import { fmtDay, fmtMoment } from '../../../lib/fmsFormat'
import { CALL_STATE_LABELS, CALL_STATE_TONE, CREATED_VIA_LABELS, STATUS_LABELS, ScotError, closeScotClient, fetchScotCalls, reopenScotClient, scotFormFromRow, scotPayload, updateScotClient, validateScotForm } from '../../../lib/scot'
import ScotFields from './ScotFields'

const BTN = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'
const INPUT = 'h-8 w-full rounded-lg border border-border bg-surface-2 px-2 text-[12.5px] text-text outline-none focus:border-primary disabled:opacity-60'
const TH = 'px-3 py-2 font-semibold text-text-muted uppercase text-[10px] tracking-wide whitespace-nowrap text-left'
const PIPELINE_WORDS = { open: 'Open', interested: 'Interested', rnr: 'RNR', future_lead: 'Future lead', lost: 'Lost', won: 'Won' }

// The detail of ONE contact: who and how to reach them, what they may buy, when the next call is due, the call log (newest first), and what the viewer may do:
//   canUpdate  Log a call (an active client), Edit, Close the follow-up as Won back / Dropped, Reopen a closed one
// Edit saves with the version stamp the row carried (a lost race says "someone else changed this" with a Reload). Everything that writes tells the list to
// re-read this one client (onChanged) so the row, the tiles and the other tabs follow.
// Props: row (the list row), canUpdate, onClose, onLogCall(row) — open the Log-a-call dialog, onChanged(row), notify(toast), reloadKey (changes when a call was logged)
export default function ScotClientModal({ row, canUpdate, onClose, onLogCall, onChanged, notify, reloadKey }) {
  const [calls, setCalls] = useState({ key: null, rows: [], error: '' })
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => scotFormFromRow(row))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(null) // 'won_back' | 'dropped' | 'reopen' | null — the little form open under the buttons
  const [note, setNote] = useState('')
  const [reopenDate, setReopenDate] = useState('')
  const active = row.status === 'active'
  const key = `${row.id}|${reloadKey}`

  useEffect(() => {
    if (calls.key === key) return undefined
    let cancelled = false
    fetchScotCalls(row.id)
      .then((rows) => !cancelled && setCalls({ key, rows, error: '' }))
      .catch((e) => !cancelled && setCalls({ key, rows: [], error: e.message }))
    return () => {
      cancelled = true
    }
  }, [key, calls.key, row.id])
  const loading = calls.key !== key

  async function save() {
    const found = validateScotForm(form)
    setErrors(found)
    if (Object.keys(found).length) return
    const before = scotFormFromRow(row)
    const payload = scotPayload(form)
    const patch = Object.fromEntries(Object.keys(payload).filter((k) => String(form[k] ?? '').trim() !== before[k]).map((k) => [k, payload[k]]))
    if (!Object.keys(patch).length) return setErrors({ contact_name: 'Nothing was changed.' })
    setBusy(true)
    try {
      await updateScotClient(row.id, row.updated_at, patch)
      notify({ tone: 'success', text: `${row.contact_name} saved.` })
      setEditing(false)
      onChanged(row)
    } catch (e) {
      if (e instanceof ScotError && (e.code === 'invalid' || e.code === 'duplicate')) setErrors(e.code === 'duplicate' ? { phone: e.message } : { contact_name: e.message })
      else if (e instanceof ScotError && e.code === 'conflict') notify({ tone: 'error', text: e.message, action: { label: 'Reload', onClick: () => { setEditing(false); onChanged(row) } } })
      else notify({ tone: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    setBusy(true)
    try {
      if (closing === 'reopen') {
        await reopenScotClient(row.id, reopenDate || null)
        notify({ tone: 'success', text: `${row.contact_name} is back in the follow-ups.` })
      } else {
        await closeScotClient(row.id, closing, note.trim())
        notify({ tone: 'success', text: `${row.contact_name} was closed as ${STATUS_LABELS[closing]}.` })
      }
      setClosing(null)
      setNote('')
      setReopenDate('')
      onChanged(row)
    } catch (e) {
      notify({ tone: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const facts = [
    ['Phone', row.phone],
    ['Email', row.email],
    ['City', row.city],
    ['Sales person', row.sales_person],
    ['Opportunity', row.opportunity],
    ['Source', row.lead_source],
    ['Remark', row.remark],
    ['Next call', row.next_call_date ? fmtDay(row.next_call_date, true) : null],
    ['Last called', row.last_called_at ? fmtMoment(row.last_called_at, true) : null],
    ['Calls logged', String(row.call_count)],
    ['In the sales pipeline', row.pipeline_status ? `Yes — ${PIPELINE_WORDS[row.pipeline_status] || row.pipeline_status}` : row.converted_enquiry_id ? 'Was added; no longer there' : null],
    ['How it got here', `${CREATED_VIA_LABELS[row.created_via] || row.created_via}${row.lost_count > 1 ? ` · lost ${row.lost_count} times` : ''}`],
  ]

  return (
    <OverlayShell open onClose={busy ? () => {} : onClose} maxWidth="max-w-5xl" closeIcon={<Icon name="x" size={16} />}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 mb-1 pr-10">
        <div className="text-[17px] font-extrabold text-text break-words min-w-0">{row.contact_name}</div>
        <StatusBadge tone={CALL_STATE_TONE[row.call_state] || 'neutral'}>{CALL_STATE_LABELS[row.call_state] || row.call_state}</StatusBadge>
        {!active && row.closed_at && <span className="text-[12px] text-text-muted self-center">closed {fmtMoment(row.closed_at, true)}{row.closed_note ? ` — ${row.closed_note}` : ''}</span>}
      </div>
      <div className="text-[12.5px] text-text-muted mb-3">{STATUS_LABELS[row.status]} follow-up</div>

      <div className="flex flex-wrap items-center gap-2 mb-3" data-role="actions">
        {canUpdate && active && !editing && (
          <button type="button" data-role="log-call" disabled={busy} onClick={() => onLogCall(row)} className={`${BTN} ${PRIMARY}`}>
            <Icon name="check" size={13} />
            Log a call
          </button>
        )}
        {canUpdate && !editing && (
          <button type="button" data-role="edit" disabled={busy} onClick={() => { setForm(scotFormFromRow(row)); setErrors({}); setEditing(true); setClosing(null) }} className={BTN}>
            Edit
          </button>
        )}
        {canUpdate && active && !editing && (
          <>
            <button type="button" data-role="won-back" disabled={busy} onClick={() => setClosing(closing === 'won_back' ? null : 'won_back')} className={BTN}>
              Won back
            </button>
            <button type="button" data-role="dropped" disabled={busy} onClick={() => setClosing(closing === 'dropped' ? null : 'dropped')} className={BTN}>
              Drop
            </button>
          </>
        )}
        {canUpdate && !active && !editing && (
          <button type="button" data-role="reopen" disabled={busy} onClick={() => setClosing(closing === 'reopen' ? null : 'reopen')} className={BTN}>
            <Icon name="undo" size={13} />
            Reopen
          </button>
        )}
      </div>

      {closing && (
        <div className="mb-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 flex flex-wrap items-end gap-3" data-role="closing">
          {closing === 'reopen' ? (
            <label className="text-[11.5px] text-text-muted">
              Next call date (optional)
              <input type="date" className={`${INPUT} mt-0.5 !w-[180px]`} value={reopenDate} disabled={busy} aria-label="Next call date" onChange={(e) => setReopenDate(e.target.value)} />
            </label>
          ) : (
            <label className="text-[11.5px] text-text-muted flex-1 min-w-[260px]">
              {closing === 'won_back' ? 'Note (optional) — what did they order?' : 'Note (optional) — why is it dropped?'}
              <input type="text" maxLength={500} className={`${INPUT} mt-0.5`} value={note} disabled={busy} aria-label="Note" onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
          <button type="button" data-role="confirm-close" disabled={busy} onClick={finish} className={`${BTN} ${PRIMARY}`}>
            <Icon name={busy ? 'loader' : 'check'} size={13} />
            {closing === 'reopen' ? 'Reopen' : closing === 'won_back' ? 'Close as Won back' : 'Close as Dropped'}
          </button>
          <button type="button" disabled={busy} onClick={() => setClosing(null)} className={BTN}>
            Cancel
          </button>
        </div>
      )}

      {editing ? (
        <div className="mb-4 rounded-xl border border-border px-3 py-3" data-role="editor">
          <ScotFields form={form} errors={errors} disabled={busy} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
          <div className="flex items-center gap-2 mt-1">
            <button type="button" data-role="save" disabled={busy} onClick={save} className={`${BTN} ${PRIMARY} w-[96px]`}>
              <Icon name={busy ? 'loader' : 'check'} size={13} />
              Save
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className={BTN}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mb-4 text-[12.5px]" data-role="facts">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
              <dd className="m-0 text-text break-words">{value ? value : <span className="text-text-muted">—</span>}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="text-[12.5px] font-semibold text-text mb-1.5">Call log{!loading && ` (${calls.rows.length})`}</div>
      <div className="h-[220px] overflow-y-auto rounded-lg border border-border" data-role="call-log">
        {calls.error ? (
          <div className="py-10 text-center text-danger text-[13px]">Could not load the calls: {calls.error}</div>
        ) : loading ? (
          <div className="py-10 text-center text-text-muted text-[13px]">Loading…</div>
        ) : !calls.rows.length ? (
          <div className="py-10 text-center text-text-muted text-[13px]">No calls logged yet.</div>
        ) : (
          <table className="w-full text-[12.5px] border-collapse">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border">
                <th className={TH}>When</th>
                <th className={TH}>Outcome</th>
                <th className={TH}>Notes</th>
                <th className={TH}>Next call</th>
              </tr>
            </thead>
            <tbody>
              {calls.rows.map((c) => (
                <tr key={c.id} className="h-8 border-b border-border last:border-b-0 align-top">
                  <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{fmtMoment(c.called_at, true)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap font-semibold text-text">{c.outcome}</td>
                  <td className="px-3 py-1.5 text-text-muted break-words">{c.notes || '—'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{c.next_call_date ? fmtDay(c.next_call_date, true) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </OverlayShell>
  )
}
