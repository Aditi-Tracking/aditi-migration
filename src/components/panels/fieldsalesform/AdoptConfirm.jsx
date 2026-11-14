import OverlayShell from '../../shared/OverlayShell'
import Icon from '../../shared/Icon'
import { BTN_GHOST, BTN_PRIMARY } from './visitFormStyles'

// "This number is already in your pipeline" — shown when the rep's own Enquiry Sheet enquiry or SCOT contact matches the number (from the phone check, or from
// the server's 23505 "adoptable:<source>" refusal on submit). It names what would be adopted and asks before the visit is logged against it; confirming
// resubmits with adopt = true. `info` = { source: 'enquiry' | 'scot', name, company, city, status } (the caller's OWN row; null when the details could not be fetched).
// Props: open, source, info, busy, onConfirm(), onCancel().
const WHAT = {
  enquiry: {
    where: 'your enquiry in the Enquiry Capture Sheet',
    effect: 'No new enquiry is created: this visit is added to that one. Once the demo is recorded it moves into Sales FMS (if it is not there yet) and its open stages are completed.',
  },
  scot: {
    where: 'your contact in SCOT Calls',
    effect: 'When the demo is recorded a new enquiry is created in Sales FMS and this SCOT contact is linked to it, so winning the deal closes the contact.',
  },
}

export default function AdoptConfirm({ open, source, info, busy = false, onConfirm, onCancel }) {
  if (!open) return null
  const w = WHAT[source] || WHAT.enquiry
  const lines = [info?.name, info?.company, info?.city].filter(Boolean)
  return (
    <OverlayShell open onClose={busy ? () => {} : onCancel} maxWidth="max-w-md" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[16px] font-semibold text-text mb-2 pr-10">Log this visit against your existing lead?</div>
      <div className="text-[13.5px] text-text mb-3">
        This number is already {w.where}
        {lines.length ? ':' : '.'}
      </div>
      {lines.length > 0 && (
        <div data-role="adopt-info" className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 mb-3 text-[13.5px]">
          {info?.name && <div className="font-semibold text-text break-words">{info.name}</div>}
          {info?.company && <div className="text-text break-words">{info.company}</div>}
          {info?.city && <div className="text-text-muted break-words">{info.city}</div>}
        </div>
      )}
      <div className="text-[12.5px] text-text-muted mb-4">{w.effect}</div>
      <div className="flex gap-2.5">
        <button type="button" onClick={onConfirm} disabled={busy} className={`${BTN_PRIMARY} flex-1`} data-role="adopt-confirm">
          {busy ? (
            <>
              <Icon name="loader" size={15} />
              Saving…
            </>
          ) : (
            'Log the visit against it'
          )}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={BTN_GHOST} data-role="adopt-cancel">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
