import { enterpriseStageColor } from '../../../lib/enterpriseLead'

// A per-stage breakdown of "Last Known Stage", same collapsible-card shape as
// EnterpriseRepLeaderboard's "Performance of Lead Owner" (collapsed by default, a button toggles
// it open) — but grouped by stage instead of owner. Reads `rows` as handed to it (the panel passes
// `periodRows`, already scoped by the Period filter), so picking e.g. "Yesterday" changes both the
// Total Leads count and every stage's count together, same as every other view on this dashboard.
// Clicking a stage row applies the same `status` cross-filter the Lead Status Breakdown donut
// chart's own click already uses — one dimension, two ways to filter it.
export default function EnterpriseLeadJourney({ rows, active, onToggle, statusFilter, onStatusClick }) {
  const total = rows.length

  const breakdown = (() => {
    if (!active) return []
    const counts = {}
    rows.forEach((r) => {
      const stage = r.CurrentStage || 'Not Contacted'
      counts[stage] = (counts[stage] || 0) + 1
    })
    return Object.entries(counts)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count)
  })()

  return (
    <div className="rounded-xl border border-border bg-surface p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <span className="text-[13px] font-semibold text-text flex items-center gap-1.5">🧭 Lead Journey</span>
        <button
          type="button"
          onClick={onToggle}
          className={`text-[11.5px] font-medium rounded-md px-3 py-1.5 border ${active ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'}`}
        >
          {active ? 'Hide lead journey' : 'Click here to see lead journey'}
        </button>
      </div>

      {active && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <div className="rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="text-[18px] font-bold text-text">{total.toLocaleString()}</div>
            <div className="text-[11px] text-text-muted mt-0.5">Total Leads</div>
          </div>
          {breakdown.map((b) => {
            const pct = total ? ((b.count / total) * 100).toFixed(1) : '0.0'
            const col = enterpriseStageColor(b.stage)
            const isActive = statusFilter === b.stage
            return (
              <button
                key={b.stage}
                type="button"
                onClick={() => onStatusClick(b.stage)}
                className={`text-left rounded-xl border p-3.5 transition-colors ${isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface'}`}
              >
                <div className="text-[18px] font-bold text-text">{b.count.toLocaleString()}</div>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col }} />
                  <span className="text-[11px] text-text-muted truncate">{b.stage}</span>
                </div>
                <div className="text-[10px] text-primary mt-1">{pct}%</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
