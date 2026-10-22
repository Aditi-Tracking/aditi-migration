import { useRef, useState } from 'react'
import Icon from '../../shared/Icon'
import PortalPopover from '../../shared/PortalPopover'

// ONE link in the bar — "N data issues" — that opens the list of what is wrong with the numbers of this period. Nothing is rendered when there is
// nothing to warn about, so the bar never shifts. An admin who can manage gets a "Set up" button inside the list (that is where unlinked names are fixed).
// Props: lines (lib/salesMeca.js warningLines), canSetup, onSetup()
export default function MecaWarnings({ lines, canSetup, onSetup }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  if (!lines.length) return null
  return (
    <>
      <button ref={anchor} type="button" data-role="warnings" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 h-8 px-2 rounded-lg border-none bg-transparent text-[12px] font-semibold text-[#B77900] hover:bg-surface-2">
        <Icon name="alert" size={14} />
        {lines.length === 1 ? '1 data issue' : `${lines.length} data issues`}
      </button>
      <PortalPopover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={380} align="end" ariaLabel="Data issues">
        <div className="p-3">
          <div className="text-[12px] font-semibold text-text mb-1.5">Data issues in this period</div>
          <ul data-role="warning-list" className="m-0 pl-4 text-[12px] leading-[18px] text-text-muted list-disc">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {canSetup && (
            <button type="button" data-role="warnings-setup" onClick={() => { setOpen(false); onSetup() }} className="mt-2.5 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text">
              <Icon name="settings" size={14} />
              Set up
            </button>
          )}
        </div>
      </PortalPopover>
    </>
  )
}
