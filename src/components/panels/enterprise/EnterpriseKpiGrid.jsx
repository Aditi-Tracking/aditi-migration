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
  const pct = (v) => (kpis.validLeads ? ((v / kpis.validLeads) * 100).toFixed(1) : null)

  const tiles = [
    { key: 'total', icon: '📊', label: 'Total Leads', value: kpis.total.toLocaleString(), sub: `${kpis.total} lead${kpis.total !== 1 ? 's' : ''} tracked`, clickable: true },
    // Lead Quality — Valid is the headline number, Invalid rides along as the smaller sub-count,
    // same "big number + secondary breakdown" shape the old "No. of Calls" tile (removed) used.
    { key: 'validLead', icon: '✅', label: 'Valid Leads', value: kpis.validLeads.toLocaleString(), sub: `${kpis.invalidLeads} invalid`, clickable: true },
    { key: 'demo', icon: '🖥', label: 'Demo', value: kpis.demo.toLocaleString(), sub: pct(kpis.demo) != null ? `${pct(kpis.demo)}% of valid` : '—', clickable: true },
    { key: 'quotation', icon: '📄', label: 'Quotation', value: kpis.quotation.toLocaleString(), sub: pct(kpis.quotation) != null ? `${pct(kpis.quotation)}% of valid` : '—', clickable: true },
    // Last Known Stage = 'Trials In Progress' or 'PO/LOI' — both counted together.
    { key: 'trials', icon: '🧪', label: 'Trails', value: kpis.trials.toLocaleString(), sub: pct(kpis.trials) != null ? `${pct(kpis.trials)}% of valid` : '—', clickable: true },
    { key: 'won', icon: '✅', label: 'Won', value: kpis.won.toLocaleString(), sub: pct(kpis.won) != null ? `${pct(kpis.won)}% win rate` : '—', clickable: true },
    // value = ACV total (the headline figure), sub = Received + Balance both — the two pieces ACV
    // splits into (what's actually come in vs what's still owed).
    { key: 'revenue', icon: '💰', label: 'Collected', value: '₹' + formatINR(kpis.revenue), sub: `₹${formatINR(kpis.received)} received\n₹${formatINR(kpis.balance)} balance`, clickable: true },
    { key: 'lost', icon: '❌', label: 'Lost', value: kpis.lost.toLocaleString(), sub: pct(kpis.lost) != null ? `${pct(kpis.lost)}% of valid` : '—', clickable: true },
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
            <div className="text-[10.5px] font-semibold text-primary mt-1 whitespace-pre-line">{t.sub}</div>
            <div className="text-[10px] text-primary mt-1">{isActive && t.key !== 'total' ? '✕ Clear' : '↗ Filter'}</div>
          </button>
        )
      })}
    </div>
  )
}
