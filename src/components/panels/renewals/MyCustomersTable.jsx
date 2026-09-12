import { useEffect, useRef } from 'react'
import EditableCell from './EditableCell'
import CalendarCallCell from './CalendarCallCell'
import {
  RU_CRM_STATUS_OPTIONS,
  RU_SORTABLE_KEYS,
  currentOutstandingValue,
  lastCallText,
  assignedPersonName,
  updateCustomerField,
  updateCustomerStatus,
  reassignCustomer,
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
// ruCustomerRowHtml — everything except the Call button + its inline
// call-log panel (Phase 1b) and the row-click customer detail modal
// (also Phase 1b, since that's where the call history it shows lives).
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
  onReassigned,
  afterMutation,
  emptyMessage,
}) {
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

  async function handleReassignChange(customer, e) {
    const value = e.target.value
    if (!value) return
    const newPersonId = value === '__unassign__' ? null : value
    const label =
      value === '__unassign__' ? 'move this customer to the unassigned pool' : 'reassign this customer to the selected person'
    if (!confirm(`Are you sure you want to ${label}? It will disappear from your list.`)) {
      e.target.value = ''
      return
    }
    try {
      await reassignCustomer({ customerId: customer.id, newPersonId })
      onReassigned(customer.id)
    } catch (err) {
      alert('❌ Could not reassign: ' + err.message)
      e.target.value = ''
    }
  }

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
                callsMap={callsMap}
                crmPerson={crmPerson}
                persons={persons}
                onStatusChange={handleStatusChange}
                onReassignChange={handleReassignChange}
                afterMutation={afterMutation}
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

function CustomerRow({ customer: c, columns, dates, callsMap, crmPerson, persons, onStatusChange, onReassignChange, afterMutation }) {
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-2/60">
      <td className="px-2.5 py-1.5 text-text whitespace-normal break-words min-w-[220px]">{c.billing_name}</td>
      {columns.map((col) => (
        <ColumnCell key={col.key} colKey={col.key} customer={c} persons={persons} onStatusChange={onStatusChange} afterMutation={afterMutation} />
      ))}
      <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
        <ReassignSelect customer={c} persons={persons} crmPerson={crmPerson} onReassignChange={onReassignChange} />
      </td>
      {dates.map((d) => (
        <CalendarCallCell key={d} customerId={c.id} date={d} call={callsMap ? callsMap.get(`${c.id}|${d}`) : null} />
      ))}
    </tr>
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
    <td className="px-2.5 py-1.5">
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

function ReassignSelect({ customer: c, persons, crmPerson, onReassignChange }) {
  return (
    <select
      defaultValue=""
      onChange={(e) => onReassignChange(c, e)}
      className="rounded-md border border-border bg-surface-2 text-text text-[11.5px] px-1.5 py-1"
    >
      <option value="">Reassign…</option>
      <option value="__unassign__">— Move to unassigned pool —</option>
      {persons
        .filter((p) => p.id !== crmPerson?.id)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  )
}
