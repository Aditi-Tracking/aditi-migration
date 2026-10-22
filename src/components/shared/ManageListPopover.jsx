import { useRef, useState } from 'react'
import Icon from './Icon'
import PortalPopover from './PortalPopover'

const SEARCH_THRESHOLD = 12 // a search box appears for longer lists
const LINK = 'shrink-0 inline-flex items-center justify-center bg-transparent border-none px-1.5 py-0.5 rounded text-[11.5px] font-semibold'

function ManageBody({ label, items, onAdd, onSetActive, rules, onSetRule, ruleCaption, numberField }) {
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const [confirmId, setConfirmId] = useState(null) // the row showing "Remove “X”? Yes / No"
  const [pendingId, setPendingId] = useState(null) // the row (or 'add') with a request in flight
  const [error, setError] = useState('')
  const addRef = useRef(null)

  const needle = q.trim().toLowerCase()
  const shown = needle ? items.filter((o) => (o.label ?? o.value).toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)) : items
  const active = shown.filter((o) => o.is_active)
  const retired = shown.filter((o) => !o.is_active)

  async function guarded(id, task) {
    if (pendingId) return
    setPendingId(id)
    setError('')
    try {
      await task()
      return true
    } catch (e) {
      setError(e?.message || 'Something went wrong.')
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function add() {
    const v = text.trim().replace(/\s+/g, ' ')
    if (!v) return
    const hit = items.find((o) => o.value.toLowerCase() === v.toLowerCase())
    if (hit) {
      setError(hit.is_active ? `“${hit.value}” is already in this list.` : `“${hit.value}” is already here but retired — use Restore.`)
      return
    }
    if (await guarded('add', () => onAdd(v))) {
      setText('')
      addRef.current?.focus()
    }
  }

  async function setActive(item, value) {
    setConfirmId(null)
    await guarded(item.id, () => onSetActive(item, value))
  }

  // the optional number beside a row (numberField): saved on Enter or when the box is left; empty = none; anything but a whole number in range is refused in place
  async function setNumber(o, input) {
    const raw = input.value.trim()
    const next = raw === '' ? null : Number(raw)
    if ((next ?? null) === (o.number ?? null)) return
    if (next !== null && (!Number.isInteger(next) || next < (numberField.min ?? 0) || next > (numberField.max ?? 365))) {
      setError(numberField.invalidMessage || `Enter a whole number from ${numberField.min ?? 0} to ${numberField.max ?? 365}, or leave it empty.`)
      input.value = o.number ?? ''
      return
    }
    setError('')
    const done = await guarded(o.id, () => numberField.onSet(o, next))
    if (done === false) input.value = o.number ?? ''
  }

  const row = (o) => {
    const confirming = confirmId === o.id
    const busy = pendingId === o.id
    const withRule = !!rules && o.is_active && !confirming
    const withNumber = !!numberField && o.is_active && !confirming
    const numberNote = withNumber ? numberField.lockedNote?.(o) : null
    return (
      <div key={o.id} data-row={o.value} className={`flex items-center gap-1 h-[26px] px-2 rounded hover:bg-surface-2 text-[12.5px] ${o.is_active ? 'text-text' : 'text-text-muted'}`}>
        <span className="truncate" title={o.label ?? o.value}>
          {confirming ? `Remove “${o.label ?? o.value}”?` : (o.label ?? o.value)}
        </span>
        {withRule && (
          <select
            data-role="rule"
            aria-label={`${ruleCaption || 'Rule'} for ${o.label ?? o.value}`}
            value={o.rule ?? rules[0].value}
            disabled={!!pendingId}
            onChange={(e) => guarded(o.id, () => onSetRule(o, e.target.value))}
            className="ml-auto shrink-0 h-5 w-[96px] rounded border border-border bg-surface px-1 text-[11.5px] text-text outline-none focus:border-primary disabled:opacity-60"
          >
            {rules.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        )}
        {withNumber && (
          <span className="ml-auto shrink-0 flex items-center justify-end">
            {numberNote ? (
              <span data-role="number-locked" className="max-w-[150px] truncate text-[11px] text-text-muted" title={numberNote}>
                {numberNote}
              </span>
            ) : (
              <input
                key={`${o.id}:${o.number ?? ''}`}
                type="number"
                inputMode="numeric"
                min={numberField.min ?? 0}
                max={numberField.max ?? 365}
                step={1}
                data-role="number"
                aria-label={`${numberField.ariaLabel || 'Days'} for ${o.label ?? o.value}`}
                placeholder={numberField.placeholder || ''}
                defaultValue={o.number ?? ''}
                disabled={!!pendingId}
                onBlur={(e) => setNumber(o, e.target)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  setNumber(o, e.target)
                }}
                className="h-5 w-[64px] rounded border border-border bg-surface px-1 text-[11.5px] text-text outline-none focus:border-primary disabled:opacity-60 placeholder:text-text-muted"
              />
            )}
          </span>
        )}
        <span className={`${withRule || withNumber ? '' : 'ml-auto '}flex items-center justify-end shrink-0 min-w-[84px]`}>
          {o.locked ? (
            <span data-role="builtin" className="px-1.5 text-[11px] text-text-muted" title="Built in — it is part of how the portal works and can't be removed">
              Built in
            </span>
          ) : confirming ? (
            <>
              <button type="button" data-role="confirm-yes" disabled={!!pendingId} onClick={() => setActive(o, false)} className={`${LINK} text-danger`}>
                Yes
              </button>
              <button type="button" data-role="confirm-no" autoFocus onClick={() => setConfirmId(null)} className={`${LINK} text-text-muted`}>
                No
              </button>
            </>
          ) : o.is_active ? (
            <button type="button" data-role="remove" disabled={!!pendingId} onClick={() => { setError(''); setConfirmId(o.id) }} aria-label={`Remove ${o.value}`} className={`${LINK} text-danger`}>
              {busy ? <Icon name="loader" size={12} /> : 'Remove'}
            </button>
          ) : (
            <button type="button" data-role="restore" disabled={!!pendingId} onClick={() => setActive(o, true)} aria-label={`Restore ${o.value}`} className={`${LINK} text-primary`}>
              {busy ? <Icon name="loader" size={12} /> : 'Restore'}
            </button>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="p-3 normal-case font-normal tracking-normal">
      <div className="text-[12.5px] font-semibold text-text mb-2">Manage {label}</div>
      {rules && (
        <div data-role="rule-caption" className="mb-2 text-[11px] leading-4 text-text-muted">
          {ruleCaption}
        </div>
      )}
      {numberField?.caption && (
        <div data-role="number-caption" className="mb-2 text-[11px] leading-4 text-text-muted">
          {numberField.caption}
        </div>
      )}
      {items.length > SEARCH_THRESHOLD && (
        <input
          type="text"
          data-autofocus
          data-role="search"
          aria-label={`Search ${label}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full mb-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none focus:border-primary"
        />
      )}
      <div data-role="list" className="max-h-[240px] overflow-y-auto -mx-1">
        {active.map(row)}
        {retired.length > 0 && <div className="px-2 pt-2 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Retired</div>}
        {retired.map(row)}
        {!shown.length && <div className="px-2 py-3 text-[12px] text-text-muted">{items.length ? 'No matching values.' : 'No values yet.'}</div>}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <input
          ref={addRef}
          type="text"
          data-role="add-input"
          {...(items.length > SEARCH_THRESHOLD ? {} : { 'data-autofocus': true })}
          aria-label={`New ${label} value`}
          maxLength={100}
          value={text}
          readOnly={pendingId === 'add'} // not disabled: a disabled input can't take the refocus that follows a successful add
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            add()
          }}
          placeholder={`Add new ${label}…`}
          className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none focus:border-primary"
        />
        <button type="button" data-role="add" disabled={!text.trim() || !!pendingId} onClick={add} className="shrink-0 w-[60px] inline-flex items-center justify-center py-1.5 rounded-lg text-[12px] font-semibold bg-primary text-white border-none disabled:opacity-50">
          {pendingId === 'add' ? <Icon name="loader" size={13} /> : 'Add'}
        </button>
      </div>
      {/* A reserved line: an error appearing must not grow (and re-anchor) the popover. */}
      <div role="alert" data-role="error" className="mt-2 min-h-[18px] text-[12px] leading-[18px] text-danger">
        {error}
      </div>
    </div>
  )
}

// The "Manage …" editor for a managed value list (Source, Sales Person, Lead Stage …): add a value,
// Remove one (soft-delete — the value stops being offered, existing rows keep it), Restore a retired one.
// Generic over the list — it never talks to the database itself:
//   items       [{ id, value, is_active, label?, locked? }]  active first, then a "Retired" group, each in the order given.
//               `label` is shown instead of `value` when set; `locked` marks a built-in that has no Remove (the database refuses it too).
//   onAdd(value)             → promise; throws to report a failure (shown in the popover)
//   onSetActive(item, bool)  → promise; same
// Optional per-row setting (used by Status: "Sends to FMS"): pass `rules` [{ value, label }], `onSetRule(item, ruleValue)` → promise (throws to
// report a failure) and `ruleCaption` (a one-line explanation shown above the list); each ACTIVE row then carries a small select, and
// `item.rule` is its current value. A list that passes none looks and behaves exactly as before.
// Optional per-row NUMBER (used by the SCOT call outcomes: days until the next call): pass `numberField` { caption, placeholder, ariaLabel, min (0), max (365), onSet(item, n | null) → promise
// (throws to report a failure), lockedNote(item) → a short text instead of the input for a row that may not carry one (or null) } and `item.number` = the current value.
// Each ACTIVE row then shows a small box (saved on Enter or when left; empty = none). A list that passes none looks and behaves exactly as before.
// The module updates `items` after each call (refetch / local state); the popover just renders them.
// Removing asks inline ("Remove “X”?  Yes / No", No is focused), restoring does not. A duplicate typed into
// Add is caught client-side, with a pointer to Restore when the existing value is retired. Anchor it to the
// header's menu trigger (ColumnFilter's manage.onClick hands over that element):
//   manage={{ label: 'Manage sources', onClick: (el) => { anchorRef.current = el; setManageOpen(true) } }}
export default function ManageListPopover({ anchorRef, open, onClose, label, items, onAdd, onSetActive, rules, onSetRule, ruleCaption, numberField, width = 300, align = 'start' }) {
  return (
    <PortalPopover anchorRef={anchorRef} open={open} onClose={onClose} width={width} align={align} ariaLabel={`Manage ${label}`}>
      {open && <ManageBody label={label} items={items} onAdd={onAdd} onSetActive={onSetActive} rules={rules} onSetRule={onSetRule} ruleCaption={ruleCaption} numberField={numberField} />}
    </PortalPopover>
  )
}
