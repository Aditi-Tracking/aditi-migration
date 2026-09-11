import { useMemo } from 'react'

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'done', label: '✅ Done' },
  { value: 'pending', label: '⏳ Pending' },
  { value: 'ongoing', label: '🔄 Ongoing' },
]

// Ported from old-portal/js/tasks.js's filters-bar + tPopulateFilters.
// Date range and Location are hidden for non-privileged users (see
// canSeeDateRange/canSeeLocationFilter in lib/taskChecklist.js) — a plain
// employee always implicitly views "today" with no way to change it.
export default function TaskFilterBar({
  search,
  onSearchChange,
  showDateRange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  rows,
  department,
  onDepartmentChange,
  person,
  onPersonChange,
  freq,
  onFreqChange,
  showLocation,
  location,
  onLocationChange,
  status,
  onStatusChange,
}) {
  const departments = useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), [rows])
  const persons = useMemo(() => [...new Set(rows.map((r) => r.name).filter(Boolean))].sort(), [rows])
  const freqs = useMemo(() => [...new Set(rows.map((r) => r.freq).filter(Boolean))].sort(), [rows])
  const locations = useMemo(() => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort(), [rows])

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 mb-4">
      <span className="text-[11px] font-semibold text-text-muted">Filter:</span>
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="🔍 Name, task, dept..."
        className="flex-1 min-w-[160px] rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-text outline-none"
      />

      {showDateRange && (
        <>
          <span className="text-[11px] text-text-muted">📅 From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
          />
          <span className="text-[11px] text-text-muted">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
          />
        </>
      )}

      <select
        value={department || ''}
        onChange={(e) => onDepartmentChange(e.target.value)}
        className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
      >
        <option value="">All Departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select
        value={person || ''}
        onChange={(e) => onPersonChange(e.target.value)}
        className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
      >
        <option value="">All People</option>
        {persons.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        value={freq || ''}
        onChange={(e) => onFreqChange(e.target.value)}
        className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
      >
        <option value="">All Frequency</option>
        {freqs.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      {showLocation && (
        <select
          value={location || ''}
          onChange={(e) => onLocationChange(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
        >
          <option value="">All Locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}

      <select
        value={status || ''}
        onChange={(e) => onStatusChange(e.target.value)}
        className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
