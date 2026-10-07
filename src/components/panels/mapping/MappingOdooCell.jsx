import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isOptionInUse, ODOO_SEARCH_DEBOUNCE_MS, ODOO_SEARCH_MIN_CHARS, searchOdooCustomers } from '../../../lib/customerMapping'
import StatusBadge from '../../shared/table/StatusBadge'

// One Odoo-name cell of one display row (a GPS company with 3 Odoo names renders 3 of these).
//   - read-only users: plain truncated text
//   - a row that already has an Odoo name: that name as text + ✕ (unlink) + "+" on the last row.
//     Existing links are never edited in place — change one by unlinking it, then picking again.
//   - an unmapped company, or the pending "+" row: <OdooPicker>, a search-as-you-type dropdown
//     over search_odoo_aliases. An unmapped row shows a lightweight placeholder button and only
//     mounts the picker (input, refs, listeners) once clicked, so a table with thousands of
//     unmapped companies carries a handful of live inputs, not one per row.
// All API calls and state patching live in MappingPanel; this component only reports intent.

function KindBadge({ isCompany }) {
  if (isCompany === true) return <StatusBadge tone="primary">Company</StatusBadge>
  if (isCompany === false) return <StatusBadge tone="neutral">Person</StatusBadge>
  return null
}

const BOX = 'flex items-center gap-1.5 border border-border rounded-md bg-surface-2 h-[30px] px-2 min-w-0'

// What an option may do for this company: pick it, or show why it can't be picked. A stale link
// (customer nobody uses, in_use = false) is free: no marker, selectable, no confirm.
function optionState(company, o) {
  if (!isOptionInUse(o)) return { disabled: false, note: null }
  const inUse = o.in_use_by || 'another customer'
  if (company.customer_id != null && o.customer_id === company.customer_id) return { disabled: true, note: 'already added' }
  if (company.customer_id != null) return { disabled: true, note: `in use: ${inUse}` }
  return { disabled: false, note: `in use: ${inUse}` }
}

function OdooPicker({ company, onPick, onCancel, onDismiss, autoFocus }) {
  const [value, setValue] = useState('')
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const busyRef = useRef(false)

  // The pending "+" row and a clicked placeholder mount already focused, ready to type.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
      abortRef.current?.abort()
    },
    []
  )

  // The dropdown is portalled to <body> with position:fixed so the table's overflow-x-auto /
  // overflow-hidden wrappers can never clip it. Fixed coordinates go stale on scroll, so any
  // scroll outside the list (or a resize) simply closes it.
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (e.type === 'scroll' && listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function openDropdown() {
    const r = inputRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, 340)
    const below = window.innerHeight - r.bottom
    const up = below < 260 && r.top > below
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      ...(up ? { bottom: window.innerHeight - r.top + 2 } : { top: r.bottom + 2 }),
    })
    setOpen(true)
  }

  function runSearch(q) {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStatus('loading')
    searchOdooCustomers(q, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return
        setResults(data || [])
        setActive(-1)
        setStatus('done')
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setResults([])
        setStatus('error')
      })
  }

  function handleChange(e) {
    const v = e.target.value
    setValue(v)
    openDropdown()
    clearTimeout(timerRef.current)
    const q = v.trim()
    if (q.length < ODOO_SEARCH_MIN_CHARS) {
      abortRef.current?.abort()
      setResults([])
      setStatus('idle')
      return
    }
    timerRef.current = setTimeout(() => runSearch(q), ODOO_SEARCH_DEBOUNCE_MS)
  }

  async function choose(o) {
    if (busyRef.current || optionState(company, o).disabled) return
    busyRef.current = true
    setOpen(false)
    setValue(o.odoo_name)
    const ok = await onPick(company, o)
    busyRef.current = false
    if (!ok) setValue('') // on success this component unmounts (the row now has a link)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) openDropdown()
      if (!results.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + results.length) % results.length)
    } else if (e.key === 'Enter' && active >= 0 && results[active]) {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      if (open) setOpen(false)
      else if (onCancel) onCancel()
    }
  }

  const short = value.trim().length < ODOO_SEARCH_MIN_CHARS

  return (
    <div className="flex items-center gap-1 min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder="Search Odoo customer..."
        autoComplete="off"
        onChange={handleChange}
        onFocus={openDropdown}
        onBlur={() => {
          setOpen(false)
          if (onDismiss && !value.trim()) onDismiss() // clicked in, typed nothing, left: back to the placeholder
        }}
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-0 h-[30px] px-2 border border-border rounded-md bg-surface-2 text-[12px] text-text outline-none"
      />
      {onCancel && (
        <button type="button" onClick={onCancel} title="Cancel" className="px-1.5 text-[15px] leading-none text-text-muted shrink-0">
          ✕
        </button>
      )}
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: 280 }}
            className="z-[60] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg"
          >
            {short || status === 'idle' ? (
              <div className="px-3 py-2 text-[12px] text-text-muted">Type at least {ODOO_SEARCH_MIN_CHARS} characters…</div>
            ) : status === 'error' ? (
              <div className="px-3 py-2 text-[12px] text-danger">Search failed — try again.</div>
            ) : status === 'loading' && !results.length ? (
              <div className="px-3 py-2 text-[12px] text-text-muted">Searching…</div>
            ) : !results.length ? (
              <div className="px-3 py-2 text-[12px] text-text-muted">No Odoo customers match.</div>
            ) : (
              results.map((o, i) => {
                const st = optionState(company, o)
                const parent = o.is_company === false && o.parent_name ? `↳ ${o.parent_name}` : ''
                return (
                  <div
                    key={o.id}
                    role="option"
                    aria-disabled={st.disabled}
                    onMouseDown={(e) => {
                      e.preventDefault() // keep the input focused so blur doesn't close the list first
                      choose(o)
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`px-3 py-1.5 border-b border-border last:border-0 ${
                      st.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    } ${i === active ? 'bg-surface-2' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex-1 min-w-0 truncate text-[13px] text-text" title={o.odoo_name}>
                        {o.odoo_name}
                      </span>
                      <KindBadge isCompany={o.is_company} />
                    </div>
                    {(parent || st.note) && (
                      <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
                        <span className="truncate">{parent}</span>
                        {st.note && <span className="shrink-0 italic">{st.note}</span>}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

export default function MappingOdooCell({ row, canEdit, onPick, onUnlink, onAdd, onCancelAdd }) {
  const [editing, setEditing] = useState(false)
  const { company, link, pending } = row
  // A mapped company with no linked Odoo alias: legacy data from before Odoo names were tracked
  // per company. Shown by its customer's canonical name so nothing looks unmapped.
  const legacyName = !link && company.is_mapped && !pending ? company.canonical_name : ''
  const name = link ? link.odoo_name : legacyName
  const parent = link && link.is_company === false && link.parent_name ? link.parent_name : ''

  if (!canEdit) {
    return (
      <div className={`truncate ${name ? 'text-text' : 'text-text-muted italic'}`} title={name ? `${name}${parent ? ` — ${parent}` : ''}` : 'Not mapped'}>
        {name || 'Not mapped'}
      </div>
    )
  }

  if (pending) return <OdooPicker company={company} onPick={onPick} onCancel={onCancelAdd} autoFocus />
  if (!name) {
    return editing ? (
      <OdooPicker company={company} onPick={onPick} onDismiss={() => setEditing(false)} autoFocus />
    ) : (
      <button type="button" onClick={() => setEditing(true)} className={`${BOX} w-full text-left text-[12px] text-text-muted`}>
        Search Odoo customer...
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      <div className={`${BOX} flex-1`} title={`${name}${parent ? ` — ${parent}` : ''}`}>
        <span className="truncate text-[12px] text-text">{name}</span>
        {link && <KindBadge isCompany={link.is_company} />}
        {parent && <span className="truncate text-[11px] text-text-muted">↳ {parent}</span>}
      </div>
      <button
        type="button"
        onClick={() => onUnlink(company, link)}
        title={link ? 'Unlink this Odoo name' : 'Clear mapping'}
        className="px-1.5 text-[15px] leading-none text-danger shrink-0"
      >
        ✕
      </button>
      {row.last && (
        <button
          type="button"
          onClick={() => onAdd(company.gps_alias_id)}
          title="Add another Odoo name for this GPS company"
          className="w-6 h-6 rounded-md border border-border bg-surface text-[14px] leading-none text-primary shrink-0"
        >
          +
        </button>
      )}
    </div>
  )
}
