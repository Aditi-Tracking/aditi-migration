// Ported from old-portal/js/mapping.js's mpUpdateProgress. Total/Mapped/Unmapped are
// click-to-filter; Total Vehicles is informational only (cursor:default in production).
//
// Deliberate fix, not a byte-for-byte port: production's active-highlight ring only updates on
// the next region switch/reload (mpFilterStatus toggles nonexistent `mp-st-*` ids, never the KPI
// tiles' own `active` class — that's set only by mpUpdateProgress, which never runs on a KPI
// click). Here the highlight derives directly from the current `status` prop on every render, so
// it moves immediately on click — approved fix, see MIGRATION-NOTES.md.
export default function MappingKpiCards({ kpis, status, onStatusClick }) {
  const tiles = [
    { key: 'all', label: 'Total Customers', value: kpis.total, sub: 'GPS Portal', color: '#6366f1', clickable: true, barPct: 100 },
    { key: 'mapped', label: '✅ Mapped', value: kpis.mapped, sub: `${kpis.mappedPct}% complete`, color: '#10b981', clickable: true, barPct: kpis.mappedPct },
    { key: 'unmapped', label: '❌ Unmapped', value: kpis.unmapped, sub: `${kpis.unmappedPct}% remaining`, color: '#ef4444', clickable: true, barPct: kpis.unmappedPct },
    { key: 'vehicles', label: '🚗 Total Vehicles', value: kpis.vehicles, sub: 'Mapped customers', color: '#f59e0b', clickable: false, barPct: 100 },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {tiles.map((t) => {
        const isActive = t.clickable && status === t.key
        return (
          <button
            key={t.key}
            type="button"
            disabled={!t.clickable}
            onClick={() => t.clickable && onStatusClick(t.key)}
            className={`text-left rounded-xl border p-3.5 overflow-hidden bg-surface ${t.clickable ? '' : 'cursor-default'}`}
            style={{ borderColor: isActive ? t.color : 'var(--color-border)' }}
          >
            <div className="text-[11px] text-text-muted">{t.label}</div>
            <div className="text-[19px] font-bold mt-0.5" style={{ color: t.color }}>{t.value.toLocaleString()}</div>
            <div className="text-[10.5px] text-text-muted mt-0.5">{t.sub}</div>
            <div className="h-1 rounded-full bg-surface-2 mt-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${t.barPct}%`, background: t.color }} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
