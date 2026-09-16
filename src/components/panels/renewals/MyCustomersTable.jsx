import { useEffect, useRef, useState } from 'react'
import EditableCell from './EditableCell'
import CalendarCallCell from './CalendarCallCell'
import CallLogPanel from './CallLogPanel'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import {
  RU_CRM_STATUS_OPTIONS,
  RU_SORTABLE_KEYS,
  currentOutstandingValue,
  lastCallText,
  assignedPersonName,
  updateCustomerField,
  updateCustomerStatus,
} from '../../../lib/renewals'

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
//
// Migrated onto the shared table system (src/components/shared/table/).
// One real wrinkle this table has that no earlier migrated table did: the
// per-row call-log panel is a genuine <tr> sibling, opened independently
// per row (multiple can be open at once) — see Tr's own `zebra`/`striped`
// props. Data rows here pass `zebra={false}` + an explicit `striped`
// computed from the row's own index in `rows`, not its DOM position, so
// the interleaved panel row (rendered as a plain, unstriped <tr>, never
// Tr) can never shift any row's stripe out of sync, regardless of how
// many panels are open. The status <select> stays a live dropdown, not
// StatusBadge — confirmed out of scope, a real dynamic-color control.
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
          <TableHead>
            <Th sortable={RU_SORTABLE_KEYS.has('billing_name')} sortKey="billing_name" activeSortKey={sortKey} sortDir={sortDir} onSort={onSort}>
              Billing Name
            </Th>
            {columns.map((col) => (
              <Th
                key={col.key}
                sortable={RU_SORTABLE_KEYS.has(col.key)}
                sortKey={col.key}
                align={col.align}
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              >
                {col.label}
              </Th>
            ))}
            <Th align="center">Action</Th>
            {dates.map((d) => (
              <th key={d} className="px-1.5 py-1.5 text-center whitespace-nowrap">
                {formatDateHeader(d)}
              </th>
            ))}
          </TableHead>
          <tbody>
            {rows.map((c, idx) => (
              <CustomerRow
                key={c.id}
                customer={c}
                striped={idx % 2 === 1}
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
// reveal the newest date column after Prev/Next" intent. Wraps the shared
// Table shell (title carries the "{category} (count) — freq" text as one
// string — the freq suffix doesn't fit Table's separate count/countLabel
// slot) rather than its own bespoke card chrome.
function CategoryCard({ category, freq, count, start, end, children }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
  }, [start, end])

  return (
    <div className="mb-5">
      <Table ref={scrollRef} title={`${category} (${count})${freq ? ` — ${freq}` : ''}`}>
        {children}
      </Table>
    </div>
  )
}

function CustomerRow({
  customer: c,
  striped,
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
      <Tr zebra={false} striped={striped} onClick={onOpenDetail}>
        <Td className="max-w-[220px] truncate" title={c.billing_name || ''}>
          {c.billing_name}
        </Td>
        {columns.map((col) => (
          <ColumnCell key={col.key} colKey={col.key} customer={c} persons={persons} onStatusChange={onStatusChange} afterMutation={afterMutation} />
        ))}
        <Td align="center" className="whitespace-nowrap">
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
        </Td>
        {dates.map((d) => (
          <CalendarCallCell key={d} customerId={c.id} date={d} call={callsMap ? callsMap.get(`${c.id}|${d}`) : null} />
        ))}
      </Tr>
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
    case 'assigned_to': {
      const name = assignedPersonName(c, persons) || '— Unassigned —'
      return (
        <Td className="max-w-[130px] truncate" title={name}>
          {name}
        </Td>
      )
    }
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
          inputClassName="max-w-[140px] truncate"
        />
      )
    case 'frequency':
      return <Td className="whitespace-nowrap">{c.calling_frequency || '—'}</Td>
    case 'outstanding':
      return (
        <Td align="right" numeric className="whitespace-nowrap">
          {c._snapshot ? Number(c._snapshot.grand_total).toLocaleString('en-IN') : '—'}
        </Td>
      )
    case 'last_call':
      return <Td className="whitespace-nowrap">{lastCallText(c)}</Td>
    case 'crm_status':
      return <StatusCell customer={c} onStatusChange={onStatusChange} />
    case 'recovered_amount':
      return (
        <Td align="right" numeric className="whitespace-nowrap text-text-muted" title="Derived from logged calls — log a call to update this">
          {Number(c.recovered_amount || 0).toLocaleString('en-IN')}
        </Td>
      )
    case 'current_outstanding': {
      const v = currentOutstandingValue(c)
      return (
        <Td align="right" numeric className="whitespace-nowrap">
          {v !== null ? v.toLocaleString('en-IN') : '—'}
        </Td>
      )
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
