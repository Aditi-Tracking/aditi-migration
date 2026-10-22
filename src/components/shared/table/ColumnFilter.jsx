import { useEffect, useRef, useState } from 'react'
import PortalPopover from '../PortalPopover'
import Icon from '../Icon'
import { BLANK, MAX_FILTER_VALUES, describeFilter, emptyFilterValue, isFilterActive } from '../../../lib/tableFilters'

const SEARCH_THRESHOLD = 8 // a static checklist longer than this gets a search box (a loaded one always has it)
const LIST_HEIGHT = 'h-[240px]' // FIXED, never max-h: the popover must not change height as the list is searched or loaded
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b)
// Enter applies. preventDefault matters: closing hands focus back to the trigger button, and without it the
// same Enter's keypress would land on that button and click it open again.
const onEnter = (fn) => (e) => {
  if (e.key !== 'Enter') return
  e.preventDefault()
  fn()
}
const BTN = 'px-3 py-1.5 rounded-lg text-[12px] font-semibold'
const SORT_LABELS = {
  text: ['Sort A to Z', 'Sort Z to A'],
  number: ['Sort smallest to largest', 'Sort largest to smallest'],
  date: ['Sort oldest to newest', 'Sort newest to oldest'],
  boolean: ['Sort No to Yes', 'Sort Yes to No'],
}
const SORT_WORDS = { asc: 'ascending', desc: 'descending' }

// One reserved line under a popover's controls for messages (a limit hit, a truncation note, a bad date range):
// always rendered, so a message appearing or disappearing never moves the buttons below it.
function Notice({ tone, children }) {
  return (
    <div aria-live="polite" className={`mt-1.5 min-h-[18px] text-[11.5px] leading-[18px] ${tone === 'danger' ? 'text-danger font-semibold' : 'text-text-muted'}`}>
      {children}
    </div>
  )
}

function Footer({ onApply, onClear, applyDisabled, summary }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <button type="button" data-role="apply" disabled={applyDisabled} onClick={onApply} className={`${BTN} bg-primary text-white border-none disabled:opacity-50`}>
        Apply
      </button>
      <button type="button" data-role="clear" onClick={onClear} className={`${BTN} border border-border text-text-muted bg-transparent`}>
        Clear
      </button>
      <span className="ml-auto text-[11px] text-text-muted">{summary}</span>
    </div>
  )
}

// Excel's "Sort A to Z / Z to A". A sort applies at once (it is not staged like the filter below it) and closes the
// popover; picking the sort that is already active clears it.
function SortSection({ sort, onPick }) {
  const [ascLabel, descLabel] = SORT_LABELS[sort.kind] || SORT_LABELS.text
  const row = (dir, label, icon) => (
    <button
      type="button"
      data-role={`sort-${dir}`}
      aria-pressed={sort.current === dir}
      onClick={() => onPick(sort.current === dir ? null : dir)}
      className={`flex items-center gap-2 w-full h-8 px-2 rounded text-[12.5px] font-medium text-left border-none ${sort.current === dir ? 'bg-primary-tint text-primary' : 'bg-transparent text-text hover:bg-surface-2'}`}
    >
      <Icon name={icon} size={14} />
      <span className="flex-1">{label}</span>
      <Icon name="check" size={13} strokeWidth={2.5} className={sort.current === dir ? '' : 'opacity-0'} />
    </button>
  )
  return (
    <div data-role="sort" className="mb-2 pb-2 border-b border-border">
      {row('asc', ascLabel, 'arrow-up')}
      {row('desc', descLabel, 'arrow-down')}
    </div>
  )
}

function ChecklistBody({ items, dynamic, status, errorText, onRetry, notice, noticeTone, draft, setDraft, applyDisabled, onApply, onClear, manage, onManage }) {
  const [q, setQ] = useState('')
  const allRef = useRef(null)
  const needle = q.trim().toLowerCase()
  const visible = needle ? items.filter((o) => o.label.toLowerCase().includes(needle)) : items
  const selected = new Set(draft)
  const visibleSelected = visible.filter((o) => selected.has(o.value)).length
  const allVisible = visible.length > 0 && visibleSelected === visible.length
  const someVisible = visibleSelected > 0 && !allVisible
  const showSearch = dynamic || items.length > SEARCH_THRESHOLD
  const ready = status === 'ready'

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someVisible
  }, [someVisible])

  function toggle(value, checked) {
    setDraft(checked ? [...draft, value] : draft.filter((v) => v !== value))
  }
  // "Select all" acts on what is VISIBLE (like Excel's "Select all search results").
  function toggleAll(checked) {
    const vis = new Set(visible.map((o) => o.value))
    setDraft(checked ? [...draft, ...visible.map((o) => o.value).filter((v) => !selected.has(v))] : draft.filter((v) => !vis.has(v)))
  }

  return (
    <div>
      {showSearch && (
        <input
          type="text"
          data-autofocus
          data-role="search"
          aria-label="Search values"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onEnter(onApply)}
          placeholder="Search…"
          className="w-full mb-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none focus:border-primary"
        />
      )}
      <div data-role="list" className={`overflow-y-auto -mx-1 ${showSearch ? LIST_HEIGHT : ''}`}>
        {status === 'loading' && <div className="px-2 py-3 text-[12px] text-text-muted">Loading values…</div>}
        {status === 'error' && (
          <div className="px-2 py-3 text-[12px] text-danger">
            {errorText || 'Could not load the values.'}
            <button type="button" data-role="retry" onClick={onRetry} className="ml-2 underline bg-transparent border-none text-danger font-bold">
              Retry
            </button>
          </div>
        )}
        {ready && visible.length > 0 && (
          <label className="flex items-center gap-2 h-[26px] px-2 text-[12.5px] text-text-muted cursor-pointer select-none">
            <input ref={allRef} type="checkbox" data-role="select-all" checked={allVisible} onChange={(e) => toggleAll(e.target.checked)} />
            {needle ? '(Select all search results)' : '(Select all)'}
          </label>
        )}
        {ready &&
          visible.map((o) => (
            <label key={o.value} title={o.label} className="flex items-center gap-2 h-[26px] px-2 rounded hover:bg-surface-2 text-[12.5px] text-text cursor-pointer select-none">
              <input type="checkbox" data-value={o.value} checked={selected.has(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} />
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="ml-auto pl-2 text-[11px] text-text-muted shrink-0">{o.hint}</span>}
            </label>
          ))}
        {ready && !visible.length && <div className="px-2 py-3 text-[12px] text-text-muted">{items.length ? 'No matching values.' : 'No values yet.'}</div>}
      </div>
      <Notice tone={noticeTone}>{notice}</Notice>
      {manage && (
        <button type="button" data-role="manage" onClick={onManage} className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary bg-transparent border-none px-1">
          <Icon name="settings" size={13} />
          {manage.label}
        </button>
      )}
      <Footer onApply={onApply} onClear={onClear} applyDisabled={applyDisabled} summary={draft.length ? `${draft.length} selected` : ''} />
    </div>
  )
}

function DateRangeBody({ draft, setDraft, onApply, onClear }) {
  const reversed = !!(draft.from && draft.to && draft.from > draft.to)
  const field = 'w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none focus:border-primary'
  return (
    <div>
      <label className="block text-[11px] font-semibold text-text-muted mb-1">From</label>
      <input type="date" data-autofocus data-role="from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={`${field} mb-2.5`} />
      <label className="block text-[11px] font-semibold text-text-muted mb-1">To</label>
      <input type="date" data-role="to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} onKeyDown={onEnter(() => !reversed && onApply())} className={field} />
      <Notice tone="danger">{reversed ? '“From” is after “To”.' : ''}</Notice>
      <Footer onApply={onApply} onClear={onClear} applyDisabled={reversed} />
    </div>
  )
}

// The little chevron in a column header (<Th filter={<ColumnFilter … />}>) and the popover it opens — Excel's column
// dropdown: sort, then filter. Generic: the module owns the filter and sort STATE (lib/tableFilters.js has the value
// model, the PostgREST builder and buildOrderParam) and passes it in.
//   sort  { kind: 'text'|'number'|'date'|'boolean', current: 'asc'|'desc'|null, onSort(dir|null) } — adds "Sort A to Z /
//         Z to A" at the top. The sort applies immediately and closes the popover (the filter below is staged, so an
//         unapplied tick is discarded — like Excel); the active sort picked again clears it.
//   kind  'checklist' | 'dateRange' | 'none' (a SORT-ONLY column: no filter section)
//   checklist, two sources for its values:
//     options [{ value, label, hint? }]   a known list (a pick-list, an enum). includeBlanks adds "(Blanks)" (NULL rows);
//                                         nonNullable says the column can never be NULL, so "everything ticked" is the
//                                         same as no filter and is stored as none.
//     loadValues() → { values, hasBlank, truncated }   the distinct values of a free-text column, fetched when the popover
//                                         opens (see lib/columnValues.js). "(Blanks)" appears only if a row has one; values
//                                         currently applied but no longer in the list stay (marked "no rows") so they can
//                                         still be unticked; a truncated list says so.
//   Apply is refused above maxSelected picked values (default MAX_FILTER_VALUES — the URL-length limit) — after the
//   "everything ticked = no filter" rule, so ticking ALL of a long list is still fine.
//   kind 'dateRange'  from / to (inclusive, either may be empty)
// Filter edits are STAGED: nothing reaches onChange until Apply (one query per decision, not one per tick); Clear applies
// "no filter" and closes; Esc or an outside press discards them. Optional manage={{ label, onClick(triggerEl) }} adds a
// "Manage …" link that closes this popover and hands the trigger to the module (the manage-list editor anchors there).
// LAYOUT STABILITY (a standing rule for this module): nothing in the header or the popover moves because something
// else appeared — the trigger is always 14×14 (a sorted column swaps the chevron for an arrow in the same box, the
// filter dot is absolutely positioned), the list area has a fixed height, and messages have a reserved line.
// The trigger stops click propagation, so it never toggles the column's sort. The table renders each header twice (the
// real one and the sticky clone), so each instance has its own open state — both read the same `value`.
export default function ColumnFilter({ label, kind = 'checklist', value, onChange, options = [], loadValues, includeBlanks = false, nonNullable = false, manage, sort, maxSelected = MAX_FILTER_VALUES, width = 260 }) {
  const anchorRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [load, setLoad] = useState({ status: 'idle' })
  const filterable = kind !== 'none'
  const dynamic = kind === 'checklist' && !!loadValues
  const active = filterable && isFilterActive(kind, value)
  const sorted = !!sort?.current

  // Each load is stamped with its own token; a response only lands if its token is still the current one, so a slow
  // answer from an earlier open (or an earlier Retry) can never overwrite a newer load.
  function startLoad() {
    const token = Symbol('load')
    setLoad({ status: 'loading', token })
    loadValues()
      .then((r) => setLoad((cur) => (cur.token === token ? { status: 'ready', token, ...r } : cur)))
      .catch((e) => setLoad((cur) => (cur.token === token ? { status: 'error', token, message: e.message } : cur)))
  }

  function toggle(e) {
    e.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    setDraft(structuredClone(value ?? emptyFilterValue(kind))) // stage a COPY — edits must not leak into the applied value
    setOpen(true)
    if (dynamic) startLoad()
  }

  // ---- the checklist's items: a known list, or what the column actually holds ----
  let items = []
  let status = 'ready'
  let truncated = false
  if (kind === 'checklist') {
    if (dynamic) {
      status = load.status === 'ready' ? 'ready' : load.status === 'error' ? 'error' : 'loading'
      if (load.status === 'ready') {
        truncated = !!load.truncated
        const have = new Set(load.values)
        const missing = (Array.isArray(draft) ? draft : []).filter((v) => v !== BLANK && !have.has(v))
        items = [...(load.hasBlank || (Array.isArray(draft) && draft.includes(BLANK)) ? [{ value: BLANK, label: '(Blanks)' }] : []), ...load.values.map((v) => ({ value: v, label: v })), ...missing.map((v) => ({ value: v, label: v, hint: 'no rows' }))]
      }
    } else {
      items = includeBlanks ? [{ value: BLANK, label: '(Blanks)' }, ...options] : options
    }
  }
  const labelByValue = new Map((dynamic ? [] : options).map((o) => [o.value, o.label]))

  function commit(next) {
    if (!sameValue(next, value)) onChange(next)
    setOpen(false)
  }

  // Ticking every value is the same as no filter — when that is actually true.
  function normalizeChecklist(list) {
    const real = items.filter((o) => o.value !== BLANK && o.hint !== 'no rows').map((o) => o.value)
    if (!real.length || !real.every((v) => list.includes(v))) return list
    const hasBlankItem = items.some((o) => o.value === BLANK)
    if (hasBlankItem) return list.includes(BLANK) ? [] : list
    if (dynamic) return truncated ? list : [] // no NULL rows in view and every value ticked; a truncated list can't prove "all"
    return nonNullable ? [] : list
  }
  const normalized = kind === 'checklist' && Array.isArray(draft) ? normalizeChecklist(draft) : null
  const pickedCount = normalized ? normalized.filter((v) => v !== BLANK).length : 0
  const overCap = pickedCount > maxSelected
  const apply = () => {
    if (kind === 'checklist') {
      if (overCap || status !== 'ready') return
      return commit(normalized)
    }
    return commit(draft)
  }
  const clear = () => commit(emptyFilterValue(kind))

  function pickSort(dir) {
    sort.onSort(dir)
    setOpen(false)
  }

  const sortText = sorted ? `sorted ${SORT_WORDS[sort.current]}` : ''
  const filterText = active ? `filtered: ${describeFilter(kind, value, (v) => labelByValue.get(v) ?? v)}` : ''
  const title = [label, sortText, filterText].filter(Boolean).join(' — ') || (filterable ? `Sort and filter ${label}` : `Sort ${label}`)
  const notice = overCap ? `Select up to ${maxSelected} values (${pickedCount} selected).` : truncated ? 'Showing the values found in the first 5,000 rows.' : ''
  const bodyProps = { draft, setDraft, onApply: apply, onClear: clear }
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`${filterable ? 'Filter' : 'Sort'} ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={toggle}
        className={`relative ml-1 inline-flex items-center justify-center w-[14px] h-[14px] align-middle rounded-sm bg-transparent border-none p-0 normal-case font-normal ${
          active || sorted ? 'text-primary' : 'text-text-muted/60 hover:text-text-muted'
        }`}
      >
        <Icon name={sorted ? (sort.current === 'asc' ? 'arrow-up' : 'arrow-down') : 'chevron-down'} size={12} strokeWidth={2.5} />
        {active && <span data-role="active-dot" className="absolute -top-px -right-px w-[5px] h-[5px] rounded-full bg-primary" />}
      </button>
      <PortalPopover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={width} ariaLabel={`${filterable ? 'Filter' : 'Sort'} ${label}`}>
        {open && draft !== null && (
          <div className="p-3 normal-case font-normal tracking-normal">
            {sort && <SortSection sort={sort} onPick={pickSort} />}
            {kind === 'checklist' && (
              <ChecklistBody
                {...bodyProps}
                items={items}
                dynamic={dynamic}
                status={status}
                errorText={load.message}
                onRetry={startLoad}
                notice={notice}
                noticeTone={overCap ? 'danger' : undefined}
                applyDisabled={overCap || status !== 'ready'}
                manage={manage}
                onManage={() => {
                  setOpen(false)
                  manage.onClick(anchorRef.current)
                }}
              />
            )}
            {kind === 'dateRange' && <DateRangeBody {...bodyProps} />}
          </div>
        )}
      </PortalPopover>
    </>
  )
}
