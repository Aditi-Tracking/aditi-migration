import { formatINR } from '../../../lib/smartFleet'

// Ported from old-portal/js/leads.js's lRenderKPIs. Values always reflect
// the full source-scoped list (never re-filtered by the active KPI click
// itself) — only the "active" highlight and the resulting chart/table
// filtering respond to the click. Colors unified to the single primary
// palette (production uses a distinct pastel background per tile).
export default function SmartFleetKpiGrid({ summary, activeKpi, onKpiClick }) {
  const pct = (v) => (summary.total ? ((v / summary.total) * 100).toFixed(0) : 0)
  const todayLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

  const tiles = [
    { key: 'all', icon: '📊', label: 'Total Leads', value: summary.total, sub: 'All time', clickable: true },
    { key: 'calls', icon: '📞', label: 'No. of Calls', value: summary.calls, sub: `${pct(summary.calls)}% of leads`, clickable: true },
    { key: 'demo', icon: '🖥', label: 'Demo', value: summary.demo, sub: `${pct(summary.demo)}% of leads`, clickable: true },
    { key: 'quoted', icon: '📄', label: 'Quotation', value: summary.quoted, sub: `${pct(summary.quoted)}% of leads`, clickable: true },
    { key: 'won', icon: '✅', label: 'Won Lead', value: summary.wonCount, sub: `${pct(summary.wonCount)}% conv.`, clickable: true },
    {
      key: null,
      icon: '💰',
      label: 'Total Revenue',
      value: '₹' + formatINR(summary.wonRevenue),
      sub: `${summary.wonCount} won deal${summary.wonCount !== 1 ? 's' : ''}`,
      clickable: false,
    },
    { key: 'today', icon: '📅', label: 'Daily Lead', value: summary.todayCount, sub: `Today · ${todayLabel}`, clickable: true },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-5">
      {tiles.map((t) => {
        const isActive = t.clickable && activeKpi === t.key && activeKpi !== 'all'
        return (
          <button
            key={t.label}
            type="button"
            disabled={!t.clickable}
            onClick={() => t.clickable && onKpiClick(t.key)}
            className={`text-left rounded-xl border p-3.5 ${
              isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface'
            } ${t.clickable ? '' : 'cursor-default'}`}
          >
            <div className="w-8 h-8 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-[15px] mb-2">
              {t.icon}
            </div>
            <div className="text-[19px] font-bold text-text">{t.value}</div>
            <div className="text-[11px] text-text-muted mt-0.5">{t.label}</div>
            <div className="text-[10.5px] font-semibold text-primary mt-1">{t.sub}</div>
            {t.clickable && <div className="text-[10px] text-primary mt-1">{isActive ? '✕ Clear' : '↗ Filter'}</div>}
          </button>
        )
      })}
    </div>
  )
}
