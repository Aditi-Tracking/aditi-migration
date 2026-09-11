import { scoreColor } from '../../../lib/taskChecklist'

// Ported from old-portal/js/tasks.js's tRenderKPIs. Colors unified to the
// single primary palette (production uses a distinct color per tile) —
// score keeps its own semantic color band (green→red) since that's the
// one place a color genuinely encodes meaning, not decoration.
export default function TaskKpiGrid({ summary, activeKpi, onKpiClick }) {
  const pct = summary.total ? Math.round((summary.done / summary.total) * 100) : 0
  const tiles = [
    { id: 'all', label: 'Total Tasks', value: summary.total, sub: summary.ongoingCount ? `${summary.ongoingCount} ongoing excluded` : 'All records' },
    { id: 'done', label: 'Completed', value: summary.done, sub: `${pct}% completion` },
    { id: 'pending', label: 'Pending', value: summary.pending, sub: `${100 - pct}% remaining` },
    { id: 'ongoing', label: '🔄 Ongoing', value: summary.ongoingCount, sub: 'Click to view all' },
    { id: 'emp', label: 'Total Employees', value: summary.uniqueEmployees, sub: 'Active members' },
    { id: 'score', label: 'Score', value: `${summary.score}%`, sub: summary.ongoingCount ? 'Ongoing excluded' : 'Overall Rate', color: scoreColor(summary.score) },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      {tiles.map((t) => {
        const isActive = activeKpi === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onKpiClick(t.id)}
            className={`text-left rounded-xl border p-3.5 ${isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface'}`}
          >
            <div className="text-[11px] text-text-muted">{t.label}</div>
            <div className="text-[19px] font-bold mt-1" style={{ color: t.color || 'var(--color-primary)' }}>
              {t.value}
            </div>
            <div className="text-[10.5px] text-text-muted mt-0.5">{t.sub}</div>
            <div className="text-[10px] text-primary mt-1">{isActive ? '✕ Clear' : '↗ Filter'}</div>
          </button>
        )
      })}
    </div>
  )
}
