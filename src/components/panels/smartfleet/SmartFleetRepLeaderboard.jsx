import { formatINR, repBg, repColor } from '../../../lib/smartFleet'

// Ported from old-portal/js/leads.js's lRenderRepLB — collapsed by
// default. Deliberately reads `leads` (source-switch-scoped only), NOT the
// KPI/chart/stage/search-filtered view — expanding this and then applying
// an Explorer filter does not change these numbers, matching production.
export default function SmartFleetRepLeaderboard({ leads, active, onToggle }) {
  const board = (() => {
    if (!active) return []
    const reps = {}
    leads.forEach((r) => {
      const key = r.salesperson_email || r.RepName || 'unassigned'
      if (!reps[key]) {
        reps[key] = { name: r.RepName || 'Unassigned', email: r.salesperson_email, total: 0, demo: 0, quoted: 0, won: 0, revenue: 0 }
      }
      const s = reps[key]
      s.total++
      if (r.demo_reached === true) s.demo++
      if (r.quotation_reached === true) s.quoted++
      if (r.Stage === 'Won') {
        s.won++
        s.revenue += r.effective_revenue
      }
    })
    return Object.values(reps).sort((a, b) => b.revenue - a.revenue)
  })()

  return (
    <div className="rounded-xl border border-border bg-surface p-4 mt-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <span className="text-[13px] font-semibold text-text flex items-center gap-1.5">
          👥 Performance of Sales Rep
        </span>
        <button
          type="button"
          onClick={onToggle}
          className={`text-[11.5px] font-medium rounded-md px-3 py-1.5 border ${
            active ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
          }`}
        >
          {active ? 'Hide performance' : 'Click here to see performance'}
        </button>
      </div>

      {active && (
        <div className="flex flex-col gap-2 mt-2">
          {board.map((b, i) => {
            const avgOrder = b.won ? b.revenue / b.won : 0
            const convRate = b.total ? (b.won / b.total) * 100 : 0
            return (
              <div key={b.email || b.name} className="flex items-center gap-3 rounded-lg bg-surface-2 border border-border px-3 py-2.5 flex-wrap">
                <span className="text-[13px] w-6 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)}</span>
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                  style={{ background: repBg(b.email), color: repColor(b.email) }}
                >
                  {(b.name || '?')[0].toUpperCase()}
                </span>
                <span className="text-[12.5px] font-semibold text-text w-[150px] truncate shrink-0">{b.name}</span>
                <div className="flex flex-1 justify-between flex-wrap gap-2 min-w-[280px]">
                  <Stat label="TOTAL" value={b.total} />
                  <Stat label="DEMO" value={b.demo} color="text-primary" />
                  <Stat label="QUOTE" value={b.quoted} color="text-primary" />
                  <Stat label="WON" value={b.won} color="text-primary" />
                  <Stat label="AVG ORDER" value={'₹' + formatINR(avgOrder)} />
                  <Stat label="CONVERSION" value={convRate.toFixed(0) + '%'} color="text-primary" />
                  <Stat label="REVENUE" value={'₹' + formatINR(b.revenue)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-text' }) {
  return (
    <div className="text-center min-w-[52px]">
      <div className={`text-[13px] font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-text-muted">{label}</div>
    </div>
  )
}
