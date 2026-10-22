import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../Icon'
import PortalPopover from '../PortalPopover'
import Td from './Td'

// Spreadsheet-style cells for the shared <Table>: edit a saved row in place (InlineTextCell /
// InlineSelectCell) or fill in a not-yet-saved row (DraftTextCell / DraftSelectCell). Each renders its own
// <Td>, so it drops straight into a <Tr>.
//
// Row height is fixed, always: the control is exactly one text line tall (h-5) inside the normal Td padding,
// so a row of inline cells is the same height as a row of plain text, and long text is truncated with an
// ellipsis (never wrapped). The full value is still typeable/selectable, and is in the tooltip.
//
// Saved-row cells follow Renewals' EditableCell (commit on blur/Enter, revert on failure) with four changes:
//   - failure is shown IN the cell (red tint + tooltip with the message, plus an optional onError callback so
//     the module can show a banner) instead of a blocking alert()
//   - Esc cancels the edit
//   - the cell follows its `value` prop, so a refetch / another save is reflected
//   - `editable={false}` renders plain truncated text (rows the user may not edit), same box as the editable
//     version so nothing shifts
// onSave(next) must return a promise and THROW to signal failure (optimistic-lock conflicts included — the
// module decides what to PATCH and with which updated_at guard). The cell never saves an unchanged value.
// Clicks and key presses inside a cell do not bubble to the row, so a clickable <Tr> doesn't open on an edit.

const FIELD = 'block h-5 w-[calc(100%+0.5rem)] max-w-none -mx-1 px-1 rounded bg-transparent text-[12.5px] leading-5 text-text outline-none border-0 truncate focus:bg-surface focus:ring-1 focus:ring-primary disabled:opacity-60'
const EDITABLE_HOVER = 'hover:bg-surface-2 cursor-text'
const INVALID = 'ring-1 ring-danger bg-danger-tint'
const TINT = { ok: 'rgba(22,163,74,0.16)', error: 'rgba(255,92,124,0.18)' }
// Selects get pl-0: a native <select> already insets its text ~4px, which would otherwise sit 4px right of
// the read-only text and of the text cells.
const stop = (e) => e.stopPropagation()

// Save lifecycle shared by the two saved-row cells: idle → saving → ok (flashes) | error (shows ~4 s).
function useSaver(onError) {
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const busy = useRef(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  function settle(next, ms) {
    clearTimeout(timer.current)
    setStatus(next)
    if (ms) timer.current = setTimeout(() => setStatus('idle'), ms)
  }
  function fail(msg) {
    setMessage(msg)
    settle('error', 4000)
  }
  // → true when saved. A second commit while one is in flight is ignored (Enter + blur, double change).
  async function run(task) {
    if (busy.current) return false
    busy.current = true
    setMessage('')
    settle('saving')
    try {
      await task()
      settle('ok', 700)
      return true
    } catch (e) {
      fail(e?.message || 'Could not save')
      onError?.(e)
      return false
    } finally {
      busy.current = false
    }
  }
  return { status, message, run, fail }
}

const tdStyle = (status) => ({ background: TINT[status], transition: 'background 0.15s' })

// ---- saved row, text ----
export function InlineTextCell({ value, onSave, editable = true, validate, onError, ariaLabel, type = 'text', inputMode, maxLength, placeholder, className = '' }) {
  const [draft, setDraft] = useState(value ?? '')
  const [seen, setSeen] = useState(value)
  const [focused, setFocused] = useState(false)
  const cancelled = useRef(false)
  const { status, message, run, fail } = useSaver(onError)

  // Follow the prop (a refetch, or the row saved elsewhere) — but never overwrite what is being typed.
  if (value !== seen) {
    setSeen(value)
    if (!focused) setDraft(value ?? '')
  }

  if (!editable) {
    return (
      <Td className={className}>
        <span title={value ?? ''} className="block truncate text-[12.5px] leading-5 text-text">
          {value || <span className="text-text-muted">—</span>}
        </span>
      </Td>
    )
  }

  async function commit() {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const next = draft.trim()
    if (next === (value ?? '')) {
      setDraft(value ?? '') // nothing changed — don't round-trip; also tidies stray whitespace
      return
    }
    const problem = validate?.(next)
    if (problem) {
      setDraft(value ?? '')
      fail(problem)
      return
    }
    const saved = await run(() => onSave(next))
    setDraft(saved ? next : value ?? '')
  }

  return (
    <Td className={className} onClick={stop} onKeyDown={stop} style={tdStyle(status)} title={status === 'error' ? message : undefined}>
      <input
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={status === 'error' || undefined}
        value={draft}
        disabled={status === 'saving'}
        title={status === 'error' ? message : draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            cancelled.current = true
            setDraft(value ?? '')
            e.currentTarget.blur()
          }
        }}
        className={`${FIELD} ${EDITABLE_HOVER} ${status === 'error' ? INVALID : ''}`}
      />
    </Td>
  )
}

// ---- saved row, dropdown ----
// options [{ value, label }]. A current value that is not among them (a retired option, legacy data) is
// appended so the cell never silently shows the wrong thing. `display` (a node, e.g. a StatusBadge) is what a
// non-editable cell shows instead of the plain label.
// `confirm(next)` (optional): asked BEFORE saving a changed value; returning false cancels quietly — the select goes back, nothing is sent.
export function InlineSelectCell({ value, options, onSave, editable = true, allowBlank = false, blankLabel = '—', display, onError, ariaLabel, className = '', confirm }) {
  const [shown, setShown] = useState(value ?? '')
  const [seen, setSeen] = useState(value)
  const { status, message, run } = useSaver(onError)
  if (value !== seen) {
    setSeen(value)
    setShown(value ?? '')
  }
  const known = options.some((o) => o.value === value)
  const all = value && !known ? [...options, { value, label: value }] : options
  const labelOf = (v) => all.find((o) => o.value === v)?.label ?? v

  if (!editable) {
    return (
      <Td className={className}>
        {display ?? (
          <span title={labelOf(value)} className="block truncate text-[12.5px] leading-5 text-text">
            {value ? labelOf(value) : <span className="text-text-muted">—</span>}
          </span>
        )}
      </Td>
    )
  }

  async function change(e) {
    const next = e.target.value
    const prev = value ?? ''
    if (confirm && !confirm(next)) {
      setShown(prev)
      return
    }
    setShown(next)
    const saved = await run(() => onSave(next))
    if (!saved) setShown(prev)
  }

  return (
    <Td className={className} onClick={stop} onKeyDown={stop} style={tdStyle(status)} title={status === 'error' ? message : undefined}>
      <select
        aria-label={ariaLabel}
        aria-invalid={status === 'error' || undefined}
        value={shown}
        disabled={status === 'saving'}
        title={status === 'error' ? message : labelOf(shown)}
        onChange={change}
        className={`${FIELD} ${EDITABLE_HOVER} cursor-pointer pl-0 ${status === 'error' ? INVALID : ''}`}
      >
        {allowBlank && <option value="">{blankLabel}</option>}
        {all.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Td>
  )
}

// ---- multi-select (a list of values, e.g. the products of a Requirement) ----
// The cell shows the picked values on one truncated line; clicking it opens a checklist popover. Ticks are STAGED:
// Apply commits them in one go (one save), Esc or an outside press discards them — so ticking three products is one
// PATCH, not three, and a half-made choice never reaches the database. A value the row already holds that is not (or
// no longer) in `options` stays in the list, ticked and marked "not in list", so editing a legacy row never drops it
// silently. Fixed list height and a reserved message line: nothing in the popover changes size while it is used.
const MULTI_SEARCH_AT = 10
const MULTI_TRIGGER = 'flex items-center gap-1 h-5 w-[calc(100%+0.5rem)] max-w-none -mx-1 px-1 rounded bg-transparent border-0 text-left text-[12.5px] leading-5 text-text outline-none focus-visible:ring-1 focus-visible:ring-primary'

function MultiPickBody({ title, options, current, onApply, manage, onManage, busy, error }) {
  const [picked, setPicked] = useState(() => new Set(current))
  const [q, setQ] = useState('')
  const known = new Set(options.map((o) => o.value))
  const items = [...options.map((o) => ({ value: o.value, label: o.label })), ...current.filter((v) => !known.has(v)).map((v) => ({ value: v, label: v, note: 'not in list' }))]
  const needle = q.trim().toLowerCase()
  const shown = needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items
  const toggle = (v, on) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(v)
      else next.delete(v)
      return next
    })
  return (
    <div className="p-3 normal-case font-normal tracking-normal">
      <div className="text-[12.5px] font-semibold text-text mb-2">{title}</div>
      {items.length > MULTI_SEARCH_AT && (
        <input type="text" data-autofocus data-role="search" aria-label={`Search ${title}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full mb-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none focus:border-primary" />
      )}
      <div data-role="list" className="h-[200px] overflow-y-auto -mx-1">
        {shown.map((i) => (
          <label key={i.value} data-row={i.value} className="flex items-center gap-2 h-[26px] px-2 rounded hover:bg-surface-2 cursor-pointer text-[12.5px] text-text">
            <input type="checkbox" data-value={i.value} checked={picked.has(i.value)} onChange={(e) => toggle(i.value, e.target.checked)} className="shrink-0" />
            <span className="truncate" title={i.label}>
              {i.label}
            </span>
            {i.note && <span className="ml-auto shrink-0 text-[11px] text-text-muted">{i.note}</span>}
          </label>
        ))}
        {!shown.length && <div className="px-2 py-3 text-[12px] text-text-muted">{items.length ? 'No matching values.' : 'No values yet.'}</div>}
      </div>
      <div role="alert" data-role="error" className="mt-1.5 min-h-[18px] text-[12px] leading-[18px] text-danger">
        {error}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {manage && (
          <button type="button" data-role="manage" onClick={onManage} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary bg-transparent border-none px-1">
            <Icon name="settings" size={12} />
            {manage.label}
          </button>
        )}
        <span className="ml-auto text-[11.5px] text-text-muted">{picked.size} selected</span>
        <button
          type="button"
          data-role="apply"
          disabled={busy}
          onClick={() => onApply(items.filter((i) => picked.has(i.value)).map((i) => i.value))}
          className="shrink-0 w-[64px] inline-flex items-center justify-center py-1.5 rounded-lg text-[12px] font-semibold bg-primary text-white border-none disabled:opacity-50"
        >
          {busy ? <Icon name="loader" size={13} /> : 'Apply'}
        </button>
      </div>
    </div>
  )
}

// The trigger + popover, shared by the saved-row and the draft-row cell. (The cell's <Td> must NOT stop key events: React's
// stopPropagation on a portal's ancestor also blocks the document-level Escape listener PortalPopover relies on.) `onApply(list)` may be async and THROW; the
// popover then stays open with the message on its reserved line.
function MultiPicker({ list, options, ariaLabel, title, manage, onApply, busy, error, invalid, tinted }) {
  const [open, setOpen] = useState(false)
  const [el, setEl] = useState(null)
  const anchor = useMemo(() => ({ current: el }), [el]) // PortalPopover wants a ref-shaped anchor
  const text = list.join(', ')
  return (
    <>
      <button
        type="button"
        ref={setEl}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        title={text}
        onClick={() => setOpen((o) => !o)}
        className={`${MULTI_TRIGGER} ${tinted ? EDITABLE_HOVER : 'bg-surface ring-1 ring-border'} cursor-pointer ${invalid ? INVALID : ''}`}
      >
        <span className={`min-w-0 flex-1 truncate ${text ? '' : 'text-text-muted/70'}`}>{text || '—'}</span>
        <Icon name="chevron-down" size={12} className="text-text-muted" />
      </button>
      <PortalPopover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={280} ariaLabel={title}>
        {open && (
          <MultiPickBody
            title={title}
            options={options}
            current={list}
            busy={busy}
            error={error}
            manage={manage}
            onManage={() => {
              setOpen(false)
              manage.onClick(el)
            }}
            onApply={async (next) => {
              if ((await onApply(next)) !== false) setOpen(false)
            }}
          />
        )}
      </PortalPopover>
    </>
  )
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : [])
const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v))

// saved row. onSave(list) → promise (throws to fail), like the other saved-row cells. `editable={false}` shows plain text.
export function InlineMultiSelectCell({ value, options, onSave, editable = true, onError, ariaLabel, title = 'Values', manage, className = '' }) {
  const list = asList(value)
  const { status, message, run } = useSaver(onError)
  if (!editable) {
    return (
      <Td className={className}>
        <span title={list.join(', ')} className="block truncate text-[12.5px] leading-5 text-text">
          {list.length ? list.join(', ') : <span className="text-text-muted">—</span>}
        </span>
      </Td>
    )
  }
  return (
    <Td className={className} onClick={stop} style={tdStyle(status)} title={status === 'error' ? message : undefined}>
      <MultiPicker list={list} options={options} ariaLabel={ariaLabel} title={title} manage={manage} busy={status === 'saving'} error={status === 'error' ? message : ''} invalid={status === 'error'} tinted onApply={(next) => (sameSet(next, list) ? true : run(() => onSave(next)))} />
    </Td>
  )
}

// new (unsaved) row: controlled by the module; Apply just reports the list.
export function DraftMultiSelectCell({ value, onChange, options, invalid = false, ariaLabel, title = 'Values', manage, className = '' }) {
  return (
    <Td className={className} onClick={stop}>
      <MultiPicker list={asList(value)} options={options} ariaLabel={ariaLabel} title={title} manage={manage} invalid={invalid} onApply={(next) => onChange(next)} />
    </Td>
  )
}

// ---- new (unsaved) row: controlled by the module, nothing is saved by the cell ----
// `invalid` outlines the cell red (set after a failed submit); the module owns the message.
// `onEnter` (optional) runs when Enter is pressed in the field — "save this row", spreadsheet-style.
// `autoFocus` focuses the field when the row appears (a freshly added row is for typing into).
export function DraftTextCell({ value, onChange, onEnter, autoFocus = false, placeholder, invalid = false, ariaLabel, type = 'text', inputMode, maxLength, className = '' }) {
  return (
    <Td className={className} onClick={stop}>
      <input
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        value={value}
        title={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={
          onEnter
            ? (e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                onEnter()
              }
            : undefined
        }
        className={`${FIELD} bg-surface ring-1 ring-border placeholder:text-text-muted/70 ${invalid ? INVALID : ''}`}
      />
    </Td>
  )
}

export function DraftSelectCell({ value, onChange, options, placeholder = 'Select…', invalid = false, ariaLabel, className = '' }) {
  return (
    <Td className={className} onClick={stop}>
      <select
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        value={value}
        title={options.find((o) => o.value === value)?.label ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} bg-surface ring-1 ring-border cursor-pointer pl-0 ${value ? '' : 'text-text-muted'} ${invalid ? INVALID : ''}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Td>
  )
}
