import { useEffect, useState } from 'react'
import { CHANNEL_LABELS, CLIENT_TYPE_OPTIONS, formatEnquiryDate, productOptions, statusLabel, statusOptions, statusRule, statusTone, updateEnquiry } from '../../../lib/enquiries'
import Icon from '../../shared/Icon'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import { CheckboxTd } from '../../shared/table/CheckboxCell'
import StatusBadge from '../../shared/table/StatusBadge'
import { InlineMultiSelectCell, InlineSelectCell, InlineTextCell } from '../../shared/table/InlineCells'
import { COL, managedOptions } from './enquirySheetLayout'

const required = (label) => (v) => (v ? null : `${label} is required.`)

// The per-row save queue (see the component comment). Plain closure state rather than refs: the stamp and
// the chain are not rendering data.
function createRowSaver(initialStamp) {
  let stamp = initialStamp
  let inflight = 0
  let queue = Promise.resolve()
  return {
    follow(next) {
      if (!inflight) stamp = next
    },
    save(id, patch, onSaved) {
      inflight += 1
      const result = queue.then(async () => {
        const saved = await updateEnquiry(id, stamp, patch)
        stamp = saved.updated_at
        onSaved(saved)
        return saved
      })
      queue = result.catch(() => {}) // the chain itself never rejects; the caller still sees the failure
      return result.finally(() => {
        inflight -= 1
      })
    },
  }
}

// Every sheet row is pinned to h-9 (36px): the tallest natural cell differs by a pixel or two between row kinds
// (a checkbox, a StatusBadge, an inline control), and rows must all be exactly the same height.
// One saved enquiry as a spreadsheet row: every form column is edited in place and saved on its own
// (optimistic lock — see updateEnquiry). A row that has been sent to FMS is locked, so its cells render as
// plain text; the server enforces that too.
//
// SAVES ARE QUEUED PER ROW. Every save carries the row's updated_at and the trigger bumps it, so a second
// save must use the stamp RETURNED by the first. Left alone, editing Name and then Phone within a second
// would fire two PATCHes with the same stamp and the second would be rejected as a conflict. The queue
// runs them one after another, each with the stamp the previous one produced. A failed save leaves the
// stamp alone, so the next one tries the same version (and fails the same way if the row really changed).
//
// OPENING THE DETAIL VIEW. An editable cell stops its own clicks (so editing never opens the modal), which leaves little bare
// row to click on an unsent row. So the view opens from three deliberate places — the row-number gutter (like Excel's row
// header), the Channel cell and the FMS cell — and, on a LOCKED row (sent, or a view-only user: every cell is plain text),
// from a click anywhere on the row. Never from the padding around an editable cell: a near-miss on a field must not pop a modal.
//
// Props: row; rowNumber (its position in the current view, shown in the gutter); canEdit (false = a view-only user: every cell is read-only); selectable/selected/onToggle (the shared checkbox column — Send to FMS and Delete both act on it); selectableSent (a SENT row also gets a checkbox — enquiry_delete_sent: only Delete acts on it); onAutoSent(row) (a status change to an AUTO status was saved: the database has sent the row — the sheet re-reads it); showChannel (admin column); dropdowns
// (the managed lists, null while loading — Source / Sales Person stay read-only until they arrive);
// onDetails(id); onRowSaved(savedRow) — the sheet patches its copy, no refetch; onError(error) — an error
// from any cell (error.code 'conflict' | 'locked' | 'gone' | 'denied' for lock failures) for the sheet's toast.
export default function EnquiryRow({ row, rowNumber, canEdit = true, selectable, selectableSent = false, selected, onToggle, showChannel, dropdowns, onDetails, onRowSaved, onError, onManage, onAutoSent }) {
  const [saver] = useState(() => createRowSaver(row.updated_at))
  // Follow a refetch (the saver ignores it while a save is in flight — that save is about to produce a newer stamp).
  useEffect(() => {
    saver.follow(row.updated_at)
  }, [saver, row.updated_at])

  const sent = !!row.sent_to_fms_at
  const locked = sent || !canEdit
  const open = () => onDetails(row.id)
  // A locked row opens from anywhere on it (its cells are plain text); an editable one only from the gutter, Channel and FMS cells.
  const rowOpen = locked ? open : undefined
  const cellOpen = locked ? undefined : open
  const openCell = locked ? '' : 'cursor-pointer hover:bg-surface-2/60'
  const save = (field) => (value) => saver.save(row.id, { [field]: value }, onRowSaved).then(() => undefined)
  // Status: a change to an AUTO status sends the lead to Sales FMS and locks it — so it asks first, and re-reads the row afterwards (the row the
  // update returns is the state before the database's auto-send ran).
  const autoStatus = (value) => !sent && statusRule(dropdowns, value) === 'auto'
  const confirmStatus = (value) => !autoStatus(value) || confirm(`Set “${row.name}” to ${statusLabel(value)}?\n\nThis sends the lead to Sales FMS straight away and locks it from editing here. It can't be undone from the portal.`)
  const saveStatus = async (value) => {
    await save('status')(value)
    if (autoStatus(value)) await onAutoSent?.(row)
  }
  const text = (field, label, cls, extra = {}) => (
    <InlineTextCell value={row[field]} onSave={save(field)} editable={!locked} onError={onError} ariaLabel={`${label}, ${row.name}`} className={cls} {...extra} />
  )
  const managed = (field, label, cls, list) => (
    <InlineSelectCell value={row[field]} options={managedOptions(list)} onSave={save(field)} editable={!locked && !!dropdowns} allowBlank onError={onError} ariaLabel={`${label}, ${row.name}`} className={cls} />
  )

  return (
    <Tr className="h-9" onClick={rowOpen} title={locked ? 'Click row to view details' : undefined}>
      {selectable && (sent && !selectableSent ? <td className="px-2 py-2 w-8" /> : <CheckboxTd checked={selected} onChange={onToggle} />)}
      <Td className={`${COL.details} text-center whitespace-nowrap ${openCell}`} onClick={cellOpen}>
        <button type="button" aria-label={`Details for ${row.name}`} title="View all details" className="inline-flex align-middle items-center justify-center min-w-5 h-5 px-0.5 rounded bg-transparent border-none text-[11.5px] tabular-nums text-text-muted hover:text-primary hover:underline">
          {rowNumber}
        </button>
        {row.import_flag === 'duplicate_phone' && (
          <span className="ml-0.5 inline-flex align-middle text-warning" role="img" aria-label="Duplicate phone number" title="Duplicate phone number within its Excel import">
            <Icon name="alert" size={13} />
          </span>
        )}
      </Td>
      {locked ? (
        <Td className={`${COL.date} whitespace-nowrap`}>{formatEnquiryDate(row.enquiry_date)}</Td>
      ) : (
        text('enquiry_date', 'Date', COL.date, { type: 'date', validate: required('Date') })
      )}
      {text('name', 'Name', COL.name, { validate: required('Name') })}
      {text('company_name', 'Company', COL.company)}
      {text('phone', 'Phone', COL.phone, { validate: required('Phone'), inputMode: 'tel' })}
      {text('email', 'Email', COL.email, { type: 'email' })}
      <InlineMultiSelectCell
        value={row.requirement}
        options={productOptions(dropdowns)}
        onSave={save('requirement')}
        editable={!locked && !!dropdowns}
        onError={onError}
        ariaLabel={`Requirement, ${row.name}`}
        title="Products"
        manage={onManage ? { label: 'Manage products', onClick: (el) => onManage('requirement', el) } : undefined}
        className={COL.requirement}
      />
      {managed('source', 'Source', COL.source, dropdowns?.source)}
      {managed('sales_person_accountable', 'Sales person', COL.salesPerson, dropdowns?.sales_person)}
      <InlineSelectCell value={row.client_type} options={CLIENT_TYPE_OPTIONS} onSave={save('client_type')} editable={!locked} allowBlank onError={onError} ariaLabel={`Client type, ${row.name}`} className={COL.clientType} />
      <InlineSelectCell
        value={row.status}
        options={statusOptions(dropdowns)}
        onSave={saveStatus}
        confirm={confirmStatus}
        editable={!locked}
        display={<StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>}
        onError={onError}
        ariaLabel={`Status, ${row.name}`}
        className={COL.status}
      />
      {showChannel && (
        <Td className={`${COL.channel} whitespace-nowrap ${openCell}`} onClick={cellOpen} title={locked ? undefined : 'Click to view details'}>
          <StatusBadge tone="neutral">{CHANNEL_LABELS[row.entry_channel] || row.entry_channel}</StatusBadge>
        </Td>
      )}
      <Td className={`${COL.fms} whitespace-nowrap ${openCell}`} onClick={cellOpen} title={sent ? `Sent ${new Date(row.sent_to_fms_at).toLocaleString('en-IN')}` : 'Click to view details'}>
        {sent ? <StatusBadge tone="success">
            <span className="inline-flex items-center gap-1">
              <Icon name="check" size={11} />
              Sent
            </span>
          </StatusBadge> : <span className="text-text-muted">—</span>}
      </Td>
    </Tr>
  )
}
