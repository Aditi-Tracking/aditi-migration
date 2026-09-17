import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  EVENT_TYPE_OPTIONS,
  buildEmployeeFilterOptions,
  computeStats,
  eventIcon,
  fetchActivityLogRows,
  fetchEmpNames,
  filterRows,
  formatDuration,
  getEmpDisplayName,
} from '../../../lib/activityLog'
import TopPagination from '../../shared/table/TopPagination'

const PER_PAGE = 50

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

// Ported from old-portal/js/activitylog.js's loadActivityLog/
// applyActLogFilters/renderActLogTable/renderActLogStats — Part A (read-
// only reporting) only, see MIGRATION-NOTES.md for the deferred write-side
// retrofit. The SQL-migration banner and the (non-functional — its result
// target DOM id doesn't exist in production either) Test-connection button
// are intentionally not ported; net visible behavior is unchanged either
// way. "Cards Opened" is kept as an always-empty stat/filter for exact
// parity — card_open events are deliberately never persisted upstream.
export default function ActivityLogPanel() {
  const { permissions } = useAuth()
  const canView = permissions.can_view_activitylog === 'true'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [allRows, setAllRows] = useState([])
  const [names, setNames] = useState({ empIdNameMap: {}, emailNameMap: {} })
  const [page, setPage] = useState(1)

  const [eventType, setEventType] = useState('')
  const [empEmail, setEmpEmail] = useState('')
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())

  function load() {
    if (!canView) return
    setLoading(true)
    setError('')
    fetchActivityLogRows()
      .then(async (rows) => {
        setAllRows(rows)
        setPage(1)
        const n = await fetchEmpNames(rows)
        setNames(n)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch, gated on the permission resolving
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on an explicit Refresh click, not on every render
  }, [canView])

  const employeeOptions = useMemo(() => buildEmployeeFilterOptions(allRows, names), [allRows, names])

  const filtered = useMemo(
    () => filterRows(allRows, { eventType, empEmail, dateFrom, dateTo }),
    [allRows, eventType, empEmail, dateFrom, dateTo]
  )
  const stats = useMemo(() => computeStats(filtered), [filtered])

  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  function clearFilters() {
    setEventType('')
    setEmpEmail('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  function onFilterChange(setter) {
    return (value) => {
      setter(value)
      setPage(1)
    }
  }

  const activeFilterChips = []
  if (empEmail) {
    const match = employeeOptions.find((o) => o.email === empEmail)
    activeFilterChips.push(`👤 ${match?.name || empEmail}`)
  }
  if (eventType) activeFilterChips.push(`⚡ ${eventType.replace(/_/g, ' ')}`)
  if (dateFrom) activeFilterChips.push(`📅 From: ${dateFrom}`)
  if (dateTo) activeFilterChips.push(`📅 To: ${dateTo}`)

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-16 text-center">
        <div className="text-[13px] text-text-muted">⛔ Access denied. This section is restricted.</div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">📋 Activity Log</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Activity Log</div>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
        >
          ↻ Refresh
        </button>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading activity logs…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ Error loading logs: {error}</div>}

      {!loading && !error && (
        <div className="mt-5">
          {/* Filter bar */}
          <div className="rounded-xl border border-border bg-surface p-3.5 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 min-w-[180px] flex-1">
              <label className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">👤 Employee</label>
              <select
                value={empEmail}
                onChange={(e) => onFilterChange(setEmpEmail)(e.target.value)}
                className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-text outline-none"
              >
                <option value="">All Employees</option>
                {employeeOptions.map((o) => (
                  <option key={o.email} value={o.email}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-[160px] flex-1">
              <label className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">⚡ Event Type</label>
              <select
                value={eventType}
                onChange={(e) => onFilterChange(setEventType)(e.target.value)}
                className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-text outline-none"
              >
                {EVENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">📅 From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => onFilterChange(setDateFrom)(e.target.value)}
                className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-text outline-none"
              />
            </div>

            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">📅 To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => onFilterChange(setDateTo)(e.target.value)}
                className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-text outline-none"
              />
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className="text-[12px] font-medium text-text-muted border border-border rounded-md px-3 py-1.5 whitespace-nowrap"
            >
              ✕ Clear
            </button>
          </div>

          {!!activeFilterChips.length && (
            <div className="flex flex-wrap gap-2 mb-3 text-[11.5px] text-text-muted items-center">
              <span className="font-semibold text-primary">Filtering:</span>
              {activeFilterChips.map((c) => (
                <span key={c} className="bg-surface-2 border border-border rounded-full px-2.5 py-0.5">
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-surface p-3.5">
                <div className="text-[18px] mb-1">{s.icon}</div>
                <div className="text-[18px] font-bold text-primary">{s.value}</div>
                <div className="text-[10.5px] text-text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold text-text">Activity Records</span>
              <TopPagination page={page} pageSize={PER_PAGE} total={filtered.length} onPageChange={setPage} />
            </div>

            {!filtered.length && (
              <div className="text-center py-12 text-text-muted text-[12.5px]">
                <div className="text-[28px] mb-2">🗒️</div>
                <div>No activity records found.</div>
                {(dateFrom || dateTo) && (
                  <div className="text-[11px] mt-1.5">
                    No activity found for the selected date{dateTo && dateTo !== dateFrom ? ` range: ${dateFrom} → ${dateTo}` : `: ${dateFrom || dateTo}`}. Change the date filter to view past data.
                  </div>
                )}
              </div>
            )}

            {!!filtered.length && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] border-collapse">
                    <thead>
                      <tr className="bg-surface-2 border-b border-border">
                        {['Time', 'Employee', 'Event', 'Page', 'Card / Detail', 'Duration', 'Video', 'Device'].map((h) => (
                          <th key={h} className="text-left font-semibold text-text-muted uppercase text-[10px] tracking-wide px-3.5 py-2.5 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, i) => (
                        <ActLogRow key={row.id ?? i} row={row} names={names} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ActLogRow({ row, names }) {
  const dt = row.created_at ? new Date(row.created_at) : null
  const dateStr = dt ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const timeStr = dt ? dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
  const empName = getEmpDisplayName(row, names)
  const emp = row.employee_email || '—'
  const dur = formatDuration(row.duration_seconds)
  const cardDetail = row.card_name || row.event_detail || '—'

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2.5 whitespace-nowrap text-text-muted">
        {dateStr}
        <br />
        <span className="text-[10.5px]">{timeStr}</span>
      </td>
      <td className="px-3.5 py-2.5">
        <div className="font-semibold text-text">{empName}</div>
        <div className="text-[10.5px] text-text-muted">{emp !== '—' ? emp : ''}</div>
      </td>
      <td className="px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint text-primary border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
          {eventIcon(row.event_type)} {(row.event_type || '').replace(/_/g, ' ')}
        </span>
        {!!row.session_duration_seconds && (
          <div className="text-[10.5px] text-text-muted mt-1">Session: {formatDuration(row.session_duration_seconds)}</div>
        )}
      </td>
      <td className="px-3.5 py-2.5 text-text-muted whitespace-nowrap">{row.page_name || '—'}</td>
      <td className="px-3.5 py-2.5 text-text-muted max-w-[180px] truncate" title={cardDetail}>
        {cardDetail}
      </td>
      <td className={`px-3.5 py-2.5 whitespace-nowrap ${dur !== '—' ? 'text-primary font-semibold' : 'text-text-muted'}`}>{dur}</td>
      <td className="px-3.5 py-2.5 min-w-[140px] max-w-[220px]">
        {row.video_title ? (
          <>
            <div className="truncate" title={row.video_title}>
              {row.video_title}
            </div>
            {row.video_watch_percent != null && (
              <div className="text-[10.5px] text-text-muted">{row.video_watch_percent}% watched</div>
            )}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3.5 py-2.5 text-center" title={row.device || ''}>
        {row.device === 'mobile' ? '📱' : '💻'}
      </td>
    </tr>
  )
}
