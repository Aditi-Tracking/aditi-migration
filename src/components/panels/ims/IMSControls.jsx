import { IMS_LOCATIONS, formatImsDate } from '../../../lib/ims'

const STATUS_BUTTONS = [
  { key: 'all', label: 'All' },
  { key: 'zero', label: '🔴 Zero Stock' },
  { key: 'low', label: '🟡 Low Stock' },
  { key: 'ok', label: '🟢 Healthy' },
]

// Ported from old-portal/js/ims.js's location <select> + _imsBuildDateFilter + search + the 4
// status buttons. Approved fix (see IMSPanel.jsx): status buttons now drive the same shared
// `filter` state the KPI tiles use, so they refresh the charts too — no longer table-only.
export default function IMSControls({ location, onLocationChange, dateHeaders, dateIdx, todayIdx, onDateChange, search, onSearchChange, filter, onFilterChange }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold text-text-muted whitespace-nowrap">📍 Location:</span>
        <select
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          className="rounded-md border border-primary/40 bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-bold text-primary outline-none min-w-[160px]"
        >
          {IMS_LOCATIONS.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {dateHeaders.length > 0 && (
          <>
            <select
              value={dateIdx}
              onChange={(e) => onDateChange(parseInt(e.target.value))}
              className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none min-w-[140px]"
            >
              {dateHeaders.map((d, i) => (
                <option key={i} value={i}>
                  {formatImsDate(d)}
                  {i === todayIdx ? ' ★' : ''}
                </option>
              ))}
            </select>
            <div className="w-px h-5 bg-border" />
          </>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search item or SKU code…"
          className="flex-1 min-w-[180px] rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-text outline-none"
        />
        {STATUS_BUTTONS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => onFilterChange(b.key)}
            className={`text-[12px] font-semibold rounded-md px-2.5 py-1.5 border whitespace-nowrap ${filter === b.key ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'}`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}
