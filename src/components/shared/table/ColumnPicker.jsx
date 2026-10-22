import { useRef, useState } from 'react'
import Icon from '../Icon'
import PortalPopover from '../PortalPopover'

const BTN = 'inline-flex items-center justify-center gap-1.5 h-7 min-w-7 px-2 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text'

// "Columns": a toolbar button that opens a checklist of every column of a table, to show or hide each one (Odoo-style). Built on PortalPopover, so the table can
// never clip it. The parent owns the choice (lib/columnPrefs.js useColumnPrefs) and renders only the visible columns; this component only asks.
//   columns       [{ key, label, locked? }]  in table order; a locked column is always shown (ticked, greyed, "always shown")
//   isVisible(key), onToggle(key, on), onReset()
//   filteredKeys  Set of column keys that currently have a filter applied: such a column cannot be HIDDEN (ticked, greyed, "filtered"), so a list is never
//                 silently filtered by something that cannot be seen. A filtered column that is already hidden can still be shown.
//   customised    enables "Reset to default"
// The structural columns of a table (the selection checkbox, the row number, an action button) are not columns of data: leave them out of `columns`.
export default function ColumnPicker({ columns, isVisible, onToggle, onReset, filteredKeys = new Set(), customised = false, label = 'Columns' }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  return (
    <>
      <button ref={anchor} type="button" data-role="columns" aria-label="Choose columns" aria-haspopup="dialog" aria-expanded={open} title="Show or hide columns" onClick={() => setOpen((o) => !o)} className={BTN}>
        <Icon name="settings" size={13} />
        {label}
      </button>
      <PortalPopover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={240} align="end" ariaLabel="Choose columns">
        <div className="p-2" data-role="column-picker">
          <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Show columns</div>
          {columns.map((c) => {
            const on = isVisible(c.key)
            const filtered = filteredKeys.has(c.key)
            const fixed = !!c.locked || (on && filtered)
            return (
              <label key={c.key} data-column={c.key} className={`flex items-center gap-2 h-[26px] px-2 rounded text-[12.5px] ${fixed ? 'text-text-muted' : 'text-text hover:bg-surface-2 cursor-pointer'}`}>
                <input type="checkbox" checked={on} disabled={fixed} onChange={(e) => onToggle(c.key, e.target.checked)} />
                <span className="flex-1 truncate">{c.label}</span>
                {c.locked ? <span className="text-[10.5px]">always shown</span> : filtered ? <span className="text-[10.5px]">filtered</span> : null}
              </label>
            )
          })}
          <div className="mt-1 pt-1.5 border-t border-border px-2">
            <button
              type="button"
              data-role="columns-reset"
              disabled={!customised}
              onClick={onReset}
              className="bg-transparent border-none p-0 text-[12px] font-semibold text-primary underline disabled:no-underline disabled:text-text-muted disabled:opacity-60"
            >
              Reset to default
            </button>
          </div>
        </div>
      </PortalPopover>
    </>
  )
}
