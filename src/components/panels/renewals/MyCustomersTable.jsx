import { useEffect, useRef, useState } from 'react'
import EditableCell from './EditableCell'
import CalendarCallCell from './CalendarCallCell'
import CallLogPanel from './CallLogPanel'
import {
  RU_CRM_STATUS_OPTIONS,
  RU_SORTABLE_KEYS,
  currentOutstandingValue,
  lastCallText,
  assignedPersonName,
  updateCustomerField,
  updateCustomerStatus,
} from '../../../lib/renewals'

function SortArrow({ active, dir }) {
  if (!active) return <span className="text-text-muted/50 ml-1">↕</span>
  return <span className="text-primary ml-1">{dir === 1 ? '▲' : '▼'}</span>
}

function SortableHeader({ colKey, label, align, sortKey, sortDir, onSort }) {
  const alignClass = align === 'right' ? 'text-right' : ''
  if (!RU_SORTABLE_KEYS.has(colKey)) return <th className={`px-2.5 py-1.5 whitespace-nowrap ${alignClass}`}>{label}</th>
  return (
    <th className={`px-2.5 py-1.5 whitespace-nowrap cursor-pointer select-none ${alignClass}`} onClick={() => onSort(colKey)}>
      {label}
      <SortArrow active={sortKey === colKey} dir={sortDir} />
    </th>
  )
}

function formatDateHeader(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

// Ported from old-portal/js/renewals.js's _ruRenderMyCustomersTableBody/
// ruCustomerRowHtml, including the Call button + its inline call-log panel
// (ruToggleCallPanel — multiple rows' panels can be open at once, since
// toggling one never closes any other) and the row-click customer detail
// modal. Reassign is NOT rendered inline here — production's row has no
// reassign select at all; it only exists inside the customer detail modal
// (see CustomerDetailModal), which is where a Phase 1a mistake had placed
// one here instead.
//
// One deliberate simplification vs. byte-for-byte production: the synced
// top-scrollbar-strip + separate "frozen header" table (a workaround for a
// real CSS quirk — position:sticky on a thead inside an overflow-x:auto
// container doesn't stick against the page) is dropped in favor of a plain
// horizontally-scrollable table with a normal (non-sticky) header. Pure UX
// simplification, no data/business-logic change. The "always land on the
// newest/today column after Prev/Next" behavior is kept, just done by
// resetting scrollLeft to 0 on window change instead of the 3-way sync.
export default function MyCustomersTable({
  groups,
  dates,
  start,
  end,
  callsMap,
  calendarLoading,
  crmPerson,
  persons,
  columns,
  sortKey,
  sortDir,
  onSort,
  afterMutation,
  onOpenDetail,
  onCallSaved,
  onOpenFlagDialog,
  emptyMessage,
}) {
  const [openCallRowIds, setOpenCallRowIds] = useState(new Set())

  if (calendarLoading && callsMap === null) {
    return <p className="text-text-muted text-[13px]">Loading call history…</p>
  }

  if (!groups.length) {
    return <p className="text-text-muted text-[13px]">{emptyMessage}</p>
  }

  async function handleStatusChange(customerId, value) {
    try {
      await updateCustomerStatus(customerId, value)
      afterMutation(customerId, (c) => ({ ...c, crm_status: value || null }))
    } catch (e) {
      // Force a re-render with a fresh object reference so the controlled
      // <select> snaps back to the last-known-good value (it isn't tracking
      // its own draft state — see StatusCell) — mirrors production's revert.
      afterMutation(customerId, (c) => ({ ...c }))
      alert('❌ Could not save: ' + e.message)
    }
  }

  function toggleCallPanel(customerId) {
    setOpenCallRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  function closeCallPanel(customerId) {
    setOpenCallRowIds((prev) => {
      if (!prev.has(customerId)) return prev
      const next = new Set(prev)
      next.delete(customerId)
      return next
    })
  }

  function handleCallSaved(customerId, info) {
    closeCallPanel(customerId)
    onCallSaved(customerId, info)
  }

  const colCount = 1 + columns.length + 1 + dates.length

  return (
    <div>
      {groups.map(({ category, freq, rows }) => (
        <CategoryCard key={category} category={category} freq={freq} count={rows.length} start={start} end={end}>
          <thead>
            <tr className="bg-surface-2 text-text-muted text-left border-b border-border">
              <SortableHeader colKey="billing_name" label="Billing Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              {columns.map((col) => (
                <SortableHeader
                  key={col.key}
                  colKey={col.key}
                  label={col.label}
                  align={col.align}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              ))}
              <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Action</th>
              {dates.map((d) => (
                <th key={d} className="px-1.5 py-1.5 text-center whitespace-nowrap">
                  {formatDateHeader(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <CustomerRow
                key={c.id}
                customer={c}
                columns={columns}
                dates={dates}
                colCount={colCount}
                callsMap={callsMap}
                crmPerson={crmPerson}
                persons={persons}
                callPanelOpen={openCallRowIds.has(c.id)}
                onToggleCallPanel={() => toggleCallPanel(c.id)}
                onCallSaved={(info) => handleCallSaved(c.id, info)}
                onStatusChange={handleStatusChange}
                afterMutation={afterMutation}
                onOpenDetail={() => onOpenDetail(c.id)}
                onOpenFlagDialog={onOpenFlagDialog}
              />
            ))}
          </tbody>
        </CategoryCard>
      ))}
    </div>
  )
}

// Owns the horizontal scroller for one category's table — resets scrollLeft
// to 0 (leftmost = newest/today, since date columns render newest-first)
// whenever the calendar window changes, matching production's "always
// reveal the newest date column after Prev/Next" intent.
function CategoryCard({ category, freq, count, start, end, children }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
  }, [start, end])

  return (
    <div className="rounded-xl border border-border bg-surface mb-5 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[13px] font-semibold text-text">
          {category} ({count}){freq ? ` — ${freq}` : ''}
        </span>
      </div>
      <div className="overflow-x-auto" ref={scrollRef}>
        <table className="border-collapse text-[12.5px] w-full">{children}</table>
      </div>
    </div>
  )
}

function CustomerRow({
  customer: c,
  columns,
  dates,
  colCount,
  callsMap,
  crmPerson,
  persons,
  callPanelOpen,
  onToggleCallPanel,
  onCallSaved,
  onStatusChange,
  afterMutation,
  onOpenDetail,
  onOpenFlagDialog,
}) {
  const isFlagged = c.accounts_flag_status === 'open'
  return (
    <>
      <tr className="border-b border-border last:border-b-0 hover:bg-surface-2/60 cursor-pointer" onClick={onOpenDetail}>
        <td className="px-2.5 py-1.5 text-text whitespace-normal break-words min-w-[220px]">{c.billing_name}</td>
        {columns.map((col) => (
          <ColumnCell key={col.key} colKey={col.key} customer={c} persons={persons} onStatusChange={onStatusChange} afterMutation={afterMutation} />
        ))}
        <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
          <div className="inline-flex items-center gap-1.5">
            {/* Logging a call requires attributing it to a real crm_persons
                row (collection_calls.called_by is NOT NULL) — MIS/owner
                accounts don't have one, so there's nothing valid to log the
                call under. */}
            {crmPerson && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCallPanel()
                }}
                className="rounded-lg border border-primary/40 bg-primary-tint text-primary font-bold text-[11.5px] px-3 py-1"
              >
                Call
              </button>
            )}
            {/* Every row visible in My Customers is already one the current
                viewer can act on (the fetch itself is pre-scoped unless
                MIS/full-access) — no extra per-row permission check needed
                to flag it. */}
            {isFlagged ? (
              <span
                title="With Accounts"
                className="rounded-full border border-[#f0a50055] bg-[#f0a50018] text-[#f0a500] font-bold text-[11px] px-3 py-1 whitespace-nowrap"
              >
                With Accounts
              </span>
            ) : (
              <button
                type="button"
                title="Send this customer to Accounts"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenFlagDialog(c.id)
                }}
                className="rounded-lg border border-border text-text-muted font-bold text-[11px] px-2.5 py-1 whitespace-nowrap"
              >
                Send to Accounts
              </button>
            )}
          </div>
        </td>
        {dates.map((d) => (
          <CalendarCallCell key={d} customerId={c.id} date={d} call={callsMap ? callsMap.get(`${c.id}|${d}`) : null} />
        ))}
      </tr>
      {callPanelOpen && (
        <tr>
          <td colSpan={colCount} className="px-2 pb-2.5 pt-0">
            <CallLogPanel customer={c} crmPerson={crmPerson} onSaved={onCallSaved} onCancel={onToggleCallPanel} />
          </td>
        </tr>
      )}
    </>
  )
}

function ColumnCell({ colKey, customer: c, persons, onStatusChange, afterMutation }) {
  switch (colKey) {
    case 'assigned_to':
      return <td className="px-2.5 py-1.5 whitespace-nowrap">{assignedPersonName(c, persons) || '— Unassigned —'}</td>
    case 'city':
    case 'contact_person':
    case 'contact_number':
      return (
        <EditableCell
          value={c[colKey]}
          onSave={async (v) => {
            await updateCustomerField(c.id, colKey, v)
            afterMutation(c.id, (row) => ({ ...row, [colKey]: v || null }))
          }}
          className="px-2.5 py-1.5"
        />
      )
    case 'frequency':
      return <td className="px-2.5 py-1.5 whitespace-nowrap">{c.calling_frequency || '—'}</td>
    case 'outstanding':
      return (
        <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
          {c._snapshot ? Number(c._snapshot.grand_total).toLocaleString('en-IN') : '—'}
        </td>
      )
    case 'last_call':
      return <td className="px-2.5 py-1.5 whitespace-nowrap">{lastCallText(c)}</td>
    case 'crm_status':
      return <StatusCell customer={c} onStatusChange={onStatusChange} />
    case 'recovered_amount':
      return (
        <td
          className="px-2.5 py-1.5 text-right whitespace-nowrap text-text-muted"
          title="Derived from logged calls — log a call to update this"
        >
          {Number(c.recovered_amount || 0).toLocaleString('en-IN')}
        </td>
      )
    case 'current_outstanding': {
      const v = currentOutstandingValue(c)
      return <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{v !== null ? v.toLocaleString('en-IN') : '—'}</td>
    }
    default:
      return <td />
  }
}

function StatusCell({ customer: c, onStatusChange }) {
  const current = c.crm_status || ''
  const opt = RU_CRM_STATUS_OPTIONS.find((o) => o.value === current)
  const color = opt ? opt.color : '#9aa3b2'
  return (
    <td className="px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
      <select
        value={current}
        onChange={(e) => onStatusChange(c.id, e.target.value)}
        className="min-w-[172px] w-full box-border px-2 py-1 rounded-full text-[11.5px] font-bold"
        style={{ border: `1px solid ${color}55`, background: `${color}18`, color }}
      >
        <option value="">—</option>
        {RU_CRM_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value}
          </option>
        ))}
      </select>
    </td>
  )
}
