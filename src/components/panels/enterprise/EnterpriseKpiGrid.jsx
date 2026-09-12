import { formatINR } from '../../../lib/smartFleet'

// Ported from old-portal/js/enterprise.js's enRenderKPIs. Values always reflect the full lead set
// (never re-filtered by the active KPI click itself). Colors unified to the single primary
// palette — production uses a distinct pastel gradient per tile, same unification already applied
// to SmartFleetKpiGrid.
//
// Approved fix, not a byte-for-byte port: production's enKpiClick sets ENkpi=null (not 'total')
// when Total is clicked, so its own highlight check (ENkpi==='total') is never true — the Total
// tile never visually highlights, even though it's functionally the "no filter" state. Here it
// highlights whenever no milestone is active, same category as the Mapping KPI-highlight fix.
export default function EnterpriseKpiGrid({ kpis, activeMilestone, onKpiClick }) {
  const pct = (v) => (kpis.total ? ((v / kpis.total) * 100).toFixed(1) : null)

  const tiles = [
    { key: 'total', icon: '📊', label: 'Total Leads', value: kpis.total.toLocaleString(), sub: `${kpis.total} lead${kpis.total !== 1 ? 's' : ''} tracked`, clickable: true },
    {
      key: 'contacted',
      icon: '📞',
      label: 'No. of Calls',
      value: kpis.totalCalls.toLocaleString(),
      sub: `${kpis.totalConnected} connected · ${kpis.totalCalls - kpis.totalConnected} no answer`,
      clickable: true,
    },
    { key: 'demo', icon: '🖥', label: 'Demo', value: kpis.demo.toLocaleString(), sub: pct(kpis.demo) != null ? `${pct(kpis.demo)}% of leads` : '—', clickable: true },
    { key: 'quotation', icon: '📄', label: 'Quotation', value: kpis.quotation.toLocaleString(), sub: pct(kpis.quotation) != null ? `${pct(kpis.quotation)}% of leads` : '—', clickable: true },
    { key: 'won', icon: '✅', label: 'Won', value: kpis.won.toLocaleString(), sub: pct(kpis.won) != null ? `${pct(kpis.won)}% win rate` : '—', clickable: true },
    { key: 'revenue', icon: '💰', label: 'Revenue', value: '₹' + formatINR(kpis.revenue), sub: `${kpis.won} won deal${kpis.won !== 1 ? 's' : ''}`, clickable: true },
    { key: 'lost', icon: '❌', label: 'Lost', value: kpis.lost.toLocaleString(), sub: pct(kpis.lost) != null ? `${pct(kpis.lost)}% of leads` : '—', clickable: true },
    { key: 'today', icon: '📅', label: 'Daily Lead', value: kpis.todayLeads.toLocaleString(), sub: 'Added today', clickable: true },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
      {tiles.map((t) => {
        const isActive = activeMilestone === t.key || (t.key === 'total' && activeMilestone == null)
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onKpiClick(t.key)}
            className={`text-left rounded-xl border p-3.5 ${isActive && t.key !== 'total' ? 'border-primary bg-primary-tint' : 'border-border bg-surface'}`}
          >
            <div className="w-8 h-8 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-[15px] mb-2">{t.icon}</div>
            <div className="text-[18px] font-bold text-text">{t.value}</div>
            <div className="text-[11px] text-text-muted mt-0.5">{t.label}</div>
            <div className="text-[10.5px] font-semibold text-primary mt-1">{t.sub}</div>
            <div className="text-[10px] text-primary mt-1">{isActive && t.key !== 'total' ? '✕ Clear' : '↗ Filter'}</div>
          </button>
        )
      })}
    </div>
  )
}
