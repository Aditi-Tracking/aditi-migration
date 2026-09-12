const DELTA_TONE_CLASS = { up: 'text-[#10b981]', down: 'text-danger', neutral: 'text-text-muted' }

function DeltaLine({ delta }) {
  if (!delta) return null
  return <div className={`text-[10.5px] font-semibold mt-1 ${DELTA_TONE_CLASS[delta.tone] || 'text-text-muted'}`}>{delta.text}</div>
}

// Ported from old-portal/js/crm.js's crmRenderCards/crmSelectRow. Customers/Total/Active are
// informational only ("no-click" in production); Running/Idle/Stop/Inactive are click-to-filter.
// When a company row is selected, values switch to that company's own stats — but the delta lines
// underneath keep showing the last-loaded AGGREGATE deltas, never recomputed per-company, matching
// production's crmSelectRow (which never touches the delta elements at all).
export default function CRMKpiCards({ aggregate, selectedRow, tierLabel, deltas, totalDelta, activeStatus, onStatusClick }) {
  const view = selectedRow
    ? {
        customers: 1,
        total: selectedRow.total_vehicles || 0,
        running: selectedRow.running_count || 0,
        idle: selectedRow.idle_count || 0,
        stop: selectedRow.stop_count || 0,
        inactive: selectedRow.inactive_count || 0,
      }
    : aggregate
  const active = view.running + view.idle + view.stop
  const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '—')

  const tiles = [
    {
      key: 'customers',
      label: 'Customers',
      value: view.customers,
      sub: selectedRow ? 'selected company' : tierLabel ? `${tierLabel} tier` : 'all servers',
      clickable: false,
    },
    {
      key: 'total',
      label: 'Total Vehicles',
      value: view.total,
      sub: selectedRow ? selectedRow.company || '—' : `${view.customers} companies`,
      delta: selectedRow ? null : totalDelta,
      clickable: false,
    },
    {
      key: 'active',
      label: 'Active',
      value: active,
      sub: view.total ? `${pct(active, view.total)} of ${selectedRow ? 'this company' : 'total fleet'}` : 'running+idle+stop',
      delta: selectedRow ? null : deltas?.active,
      clickable: false,
    },
    {
      key: 'RUNNING',
      label: 'Running',
      value: view.running,
      sub: active ? `${pct(view.running, active)} of active` : 'in motion',
      delta: selectedRow ? null : deltas?.running,
      clickable: true,
    },
    {
      key: 'IDLE',
      label: 'Idle',
      value: view.idle,
      sub: active ? `${pct(view.idle, active)} of active` : 'engine on',
      delta: selectedRow ? null : deltas?.idle,
      clickable: true,
    },
    {
      key: 'STOP',
      label: 'Stop',
      value: view.stop,
      sub: active ? `${pct(view.stop, active)} of active` : 'parked',
      delta: selectedRow ? null : deltas?.stop,
      clickable: true,
    },
    {
      key: 'INACTIVE',
      label: 'Inactive',
      value: view.inactive,
      sub: view.total ? `${pct(view.inactive, view.total)} of ${selectedRow ? 'company' : 'fleet'}` : 'no signal',
      delta: selectedRow ? null : deltas?.inactive,
      clickable: true,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
      {tiles.map((t) => {
        const isActive = t.clickable && activeStatus === t.key
        return (
          <button
            key={t.key}
            type="button"
            disabled={!t.clickable}
            onClick={() => t.clickable && onStatusClick(t.key)}
            className={`text-left rounded-xl border p-3.5 ${isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface'} ${
              t.clickable ? '' : 'cursor-default'
            }`}
          >
            <div className="text-[11px] text-text-muted">{t.label}</div>
            <div className="text-[19px] font-bold text-text mt-0.5">{t.value.toLocaleString()}</div>
            <div className="text-[10.5px] text-text-muted mt-0.5">{t.sub}</div>
            <DeltaLine delta={t.delta} />
          </button>
        )
      })}
    </div>
  )
}
