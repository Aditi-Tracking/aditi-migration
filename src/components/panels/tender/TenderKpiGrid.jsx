// Clickable KPI tiles — matches this app's standard KPI-tile pattern (icon box + big number +
// label + a filter affordance), same shape as EnterpriseKpiGrid/FMSKpiGrid, instead of the earlier
// plain static bordered boxes. Clicking one filters the Explorer table below to just that bucket;
// clicking the active one again clears it.
const TILES = [
  { key: 'total', icon: '📋', label: 'Total Tenders' },
  { key: 'submitted', icon: '✅', label: 'Submitted' },
  { key: 'pipeline', icon: '⏳', label: 'In Pipeline' },
  { key: 'notSubmitted', icon: '❌', label: 'Not Submitted' },
  { key: 'dueIn7Days', icon: '⏰', label: 'Due in Next 7 Days' },
]

export default function TenderKpiGrid({ kpis, activeFilter, onFilterClick }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
      {TILES.map((t) => {
        const isActive = activeFilter === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onFilterClick(t.key)}
            className={`text-left rounded-xl border p-3.5 transition-colors ${isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface hover:border-primary/40'}`}
          >
            <div className="w-8 h-8 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-[15px] mb-2">{t.icon}</div>
            <div className="text-[20px] font-extrabold text-text leading-none">{kpis[t.key].toLocaleString()}</div>
            <div className="text-[11px] text-text-muted mt-1">{t.label}</div>
            <div className="text-[10px] text-primary mt-1.5">{isActive ? '✕ Clear' : '↗ Filter'}</div>
          </button>
        )
      })}
    </div>
  )
}
