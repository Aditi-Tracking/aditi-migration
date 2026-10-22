import { useState } from 'react'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import { fmtDay, fmtMoment, inputToMoment } from '../../../lib/fmsFormat'
import { fetchDropdownOptions } from '../../../lib/enquiries'
import { NEXT_CALL_SHORTCUTS, ScotError, autoNextCallDate, closeScotClient, isMeetingOutcome, logScotCall, outcomeOptions, shortcutDate, suggestsDrop } from '../../../lib/scot'

const INPUT = 'h-8 w-full rounded-lg border border-border bg-surface-2 px-2 text-[12.5px] text-text outline-none focus:border-primary disabled:opacity-60'
const BTN = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'

// Log ONE call on a client: what came of it (an outcome from the managed list), notes, and WHEN TO CALL NEXT — chosen here, with shortcuts, or left empty
// ("Not scheduled"). The call time is now; only an administrator may enter an earlier one (a correction). A rule the user broke shows in place; any other
// failure goes to the module's toast.
// The next-call date FILLS ITSELF when an outcome is chosen, from that outcome's configured days (the gear beside Last Outcome) — until the person types a date,
// picks a shortcut or presses Clear, after which it is theirs and is never touched again. Changing the outcome re-fills a date that is still automatic (and empties
// it for an outcome with no days, and for Meeting Scheduled, which always needs a meeting date chosen by hand). What the dialog shows is what is saved.
// "Meeting Scheduled" puts the contact back into the live pipeline, so the dialog also asks for the Sales Person (required; pre-filled from the contact; the
// active names of the Sales Person list) and treats the date as the MEETING date (required): the database creates the enquiry and plans the Demo for that date.
// After a "Not Interested" or "Invalid number" call the dialog OFFERS to close the follow-up as Dropped — a deliberate click, never automatic; the call itself
// is already saved either way, and dismissing the offer keeps the follow-up going.
// Props: row (the list row), outcomes (null while loading), canAdmin, onClose, onDone(row) — the call was logged — and notify(toast).
export default function ScotLogCallDialog({ row, outcomes, canAdmin, onClose, onDone, notify }) {
  const options = outcomeOptions(outcomes)
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [next, setNext] = useState('')
  const [nextTouched, setNextTouched] = useState(false) // the person has set or cleared the date themselves: the automatic fill leaves it alone
  const [at, setAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [offer, setOffer] = useState(null) // { outcome } — the call is logged; the "close as Dropped?" question is showing
  const [dropNote, setDropNote] = useState('')
  const [people, setPeople] = useState(null) // the active Sales Person names, loaded the first time Meeting Scheduled is chosen
  const [salesPerson, setSalesPerson] = useState(row.sales_person || '')
  const meeting = isMeetingOutcome(outcome)

  const calledOn = (atValue) => (canAdmin && atValue ? atValue.slice(0, 10) : null)

  function choose(value) {
    setOutcome(value)
    setError('')
    if (!nextTouched) setNext(autoNextCallDate(outcomes, value, calledOn(at)))
    if (isMeetingOutcome(value) && people === null) {
      fetchDropdownOptions()
        .then((d) => {
          const names = (d.sales_person || []).filter((o) => o.is_active).map((o) => o.value)
          setPeople(names)
          setSalesPerson((cur) => names.find((n) => n.toLowerCase() === String(cur).trim().toLowerCase()) || '')
        })
        .catch((e) => {
          setPeople([])
          setError(`Could not load the Sales Person list: ${e.message}`)
        })
    }
  }

  async function drop() {
    if (busy) return
    setBusy(true)
    try {
      await closeScotClient(row.id, 'dropped', dropNote.trim())
      notify({ tone: 'success', text: `${row.contact_name} was closed as Dropped.` })
    } catch (e) {
      notify({ tone: 'error', text: e.message })
    } finally {
      setBusy(false)
      onDone(row)
    }
  }

  async function submit() {
    if (busy) return
    if (!outcome) return setError('Choose what came of the call.')
    if (meeting && !salesPerson) return setError('Choose the Sales Person for this meeting.')
    if (meeting && !next) return setError('Choose the meeting date.')
    if (at && !inputToMoment(at)) return setError('Enter the call time as a date and time.')
    setBusy(true)
    setError('')
    try {
      const res = await logScotCall({ clientId: row.id, outcome, notes: notes.trim(), nextCallDate: next || null, calledAt: canAdmin && at ? inputToMoment(at) : null, salesPerson: meeting ? salesPerson : null })
      if (meeting && res?.enquiry_created) notify({ tone: 'success', text: `Call logged — ${row.contact_name} was added to the Enquiry Capture Sheet and Sales FMS for ${salesPerson}; the demo is planned for ${fmtDay(next)}.` })
      else if (meeting && res?.enquiry_id) notify({ tone: 'success', text: `Call logged — ${row.contact_name} is already in the sales pipeline, so no second enquiry was created.` })
      else notify({ tone: 'success', text: `Call logged for ${row.contact_name}${next ? ` — next call ${fmtDay(next)}` : ''}.` })
      if (suggestsDrop(outcome)) setOffer({ outcome })
      else onDone(row)
    } catch (e) {
      if (e instanceof ScotError && e.code === 'invalid') setError(e.message)
      else {
        notify({ tone: 'error', text: e.message })
        if (e instanceof ScotError && (e.code === 'gone' || e.code === 'denied')) onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <OverlayShell open onClose={busy ? () => {} : offer ? () => onDone(row) : onClose} maxWidth="max-w-lg" closeIcon={<Icon name="x" size={16} />}>
      {offer ? (
        <div data-role="offer">
          <div className="text-[16px] font-semibold text-text pr-10">Call logged — {row.contact_name}</div>
          <div className="text-[12.5px] text-text-muted mb-4">
            The outcome was "{offer.outcome}". Close this follow-up as Dropped? It stays in the list as a closed entry and can be reopened later.
          </div>
          <label className="block text-[11.5px] text-text-muted mb-3">
            Note (optional) — why is it dropped?
            <input type="text" maxLength={500} className={`${INPUT} mt-0.5`} value={dropNote} disabled={busy} aria-label="Note" onChange={(e) => setDropNote(e.target.value)} />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" data-role="offer-drop" disabled={busy} onClick={drop} className={`${BTN} ${PRIMARY}`}>
              <Icon name={busy ? 'loader' : 'check'} size={13} />
              Close as Dropped
            </button>
            <button type="button" data-role="offer-keep" disabled={busy} onClick={() => onDone(row)} className={BTN}>
              Keep following up
            </button>
          </div>
        </div>
      ) : (
      <>
      <div className="text-[16px] font-semibold text-text pr-10">Log a call — {row.contact_name}</div>
      <div className="text-[12.5px] text-text-muted mb-4">
        {[row.phone, row.opportunity, row.last_called_at ? `last called ${fmtMoment(row.last_called_at, true)}${row.last_outcome ? ` (${row.last_outcome})` : ''}` : 'not called yet'].filter(Boolean).join(' · ')}
      </div>

      <label className="block text-[11.5px] text-text-muted mb-3">
        Outcome *
        <select className={`${INPUT} mt-0.5`} value={outcome} disabled={busy || !outcomes} aria-label="Outcome" onChange={(e) => choose(e.target.value)}>
          <option value="">{outcomes ? 'Choose…' : 'Loading…'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {meeting && (
        <label className="block text-[11.5px] text-text-muted mb-3" data-role="sales-person">
          Sales person * (who will meet them)
          <select className={`${INPUT} mt-0.5`} value={salesPerson} disabled={busy || people === null} aria-label="Sales person" onChange={(e) => { setSalesPerson(e.target.value); setError('') }}>
            <option value="">{people === null ? 'Loading…' : 'Choose…'}</option>
            {(people || []).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-[11.5px] text-text-muted mb-3">
        Notes
        <textarea rows={3} maxLength={1000} className={`${INPUT} mt-0.5 !h-[72px] py-1.5 resize-none`} value={notes} disabled={busy} aria-label="Notes" onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="mb-3">
        <label className="block text-[11.5px] text-text-muted">
          {meeting ? 'Meeting date *' : 'Next call date (leave empty if none is planned yet)'}
          <input type="date" className={`${INPUT} mt-0.5 !w-[180px]`} value={next} disabled={busy} aria-label="Next call date" onChange={(e) => { setNext(e.target.value); setNextTouched(true); setError('') }} />
        </label>
        {!next && outcome && !meeting && !suggestsDrop(outcome) && (
          <div className="mt-1 text-[11.5px] text-text-muted" data-role="no-next-hint">
            No next call planned — this contact won't come up for a call.
          </div>
        )}
        {meeting && (
          <div className="mt-1 text-[11.5px] text-text-muted" data-role="meeting-note">
            This adds the contact to the Enquiry Capture Sheet and Sales FMS (First Call done, Demo planned for this date), unless they are already in the pipeline.
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1.5" data-role="shortcuts">
          {NEXT_CALL_SHORTCUTS.map(([label, days]) => (
            <button key={days} type="button" disabled={busy} onClick={() => { setNext(shortcutDate(days)); setNextTouched(true) }} className={`${BTN} !h-7 !px-2`}>
              {label}
            </button>
          ))}
          {next && (
            <button type="button" disabled={busy} onClick={() => { setNext(''); setNextTouched(true) }} className={`${BTN} !h-7 !px-2`}>
              Clear
            </button>
          )}
        </div>
      </div>

      {canAdmin && (
        <label className="block text-[11.5px] text-text-muted mb-3">
          Call time (administrator — leave empty for now)
          <input type="datetime-local" className={`${INPUT} mt-0.5 !w-[220px]`} value={at} disabled={busy} aria-label="Call time" onChange={(e) => { setAt(e.target.value); if (!nextTouched) setNext(autoNextCallDate(outcomes, outcome, calledOn(e.target.value))) }} />
        </label>
      )}

      <div role="alert" data-role="error" className="min-h-[18px] text-[12px] leading-[18px] text-danger mb-2">
        {error}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" data-role="log-call" disabled={busy} onClick={submit} className={`${BTN} ${PRIMARY} w-[120px]`}>
          <Icon name={busy ? 'loader' : 'check'} size={13} />
          {busy ? 'Saving…' : 'Log call'}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className={BTN}>
          Cancel
        </button>
      </div>
      </>
      )}
    </OverlayShell>
  )
}
