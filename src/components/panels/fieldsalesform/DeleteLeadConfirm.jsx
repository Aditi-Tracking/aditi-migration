import OverlayShell from '../../shared/OverlayShell'
import Icon from '../../shared/Icon'
import { BTN_DANGER, BTN_GHOST } from './visitFormStyles'

// "Delete this lead?" — asked before a lead is deleted (from a list row or from the lead's detail window). It says plainly what goes with it, because a delete
// is a full one: the lead and ALL its visits, the enquiry it created and every Sales FMS stage on it (including anything Sales FMS recorded since), and the
// meeting its Discovery visit counted in Sales Rep MeCa (and the Won client, if it was closed Won). The line about the enquiry is only shown when there is one.
// `lead` is the list row (field_sales_lead_state): { business_name, contact_person, contact_number, visit_count, enquiry_id, outcome }.
// Props: lead (null = closed), busy, onConfirm(), onCancel().
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`

export default function DeleteLeadConfirm({ lead, busy = false, onConfirm, onCancel }) {
  if (!lead) return null
  const visits = Number(lead.visit_count) || 0
  return (
    <OverlayShell open onClose={busy ? () => {} : onCancel} maxWidth="max-w-md" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[16px] font-semibold text-text mb-2 pr-10">Delete this lead?</div>
      <div data-role="delete-info" className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 mb-3 text-[13.5px]">
        <div className="font-semibold text-text break-words">{lead.business_name}</div>
        <div className="text-text-muted break-words">{[lead.contact_person, lead.contact_number].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="text-[13px] text-text mb-1.5">Deleting it will remove:</div>
      <ul data-role="delete-effects" className="m-0 mb-3 pl-5 text-[13px] text-text flex flex-col gap-1">
        <li>
          the lead and {visits ? `its ${plural(visits, 'visit')}` : 'all its visits'}
        </li>
        <li>the meeting its Discovery visit counted in Sales Rep MeCa</li>
        {lead.enquiry_id && (
          <li>
            its enquiry and <b>all its Sales FMS stage data</b>, including anything Sales FMS has recorded on it since. (If this lead was adopted from your Enquiry Sheet, that Sheet enquiry stays.)
          </li>
        )}
        {lead.outcome === 'won' && <li>the Won deal: it no longer counts as a client in Sales Rep MeCa</li>}
        {lead.outcome === 'lost' && <li>its Lost closure</li>}
      </ul>
      <div className="text-[12.5px] text-text-muted mb-4">The phone number becomes free to enter again. This cannot be undone from the portal.</div>
      <div className="flex gap-2.5">
        <button type="button" onClick={onConfirm} disabled={busy} className={`${BTN_DANGER} flex-1`} data-role="delete-confirm">
          {busy ? (
            <>
              <Icon name="loader" size={15} />
              Deleting…
            </>
          ) : (
            <>
              <Icon name="trash" size={15} />
              Delete lead
            </>
          )}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={BTN_GHOST} data-role="delete-cancel">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
