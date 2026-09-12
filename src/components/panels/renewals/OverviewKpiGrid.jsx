import { computeTrend, formatIndianCompact } from '../../../lib/renewals'

function TrendArrow({ trend }) {
  if (!trend) return null
  return (
    <span className={`font-bold ml-1 ${trend.isGood ? 'text-primary' : 'text-danger'}`}>
      {trend.isUp ? '↑' : '↓'} {trend.pct.toFixed(1)}%
    </span>
  )
}

// Ported from old-portal/js/renewals.js's _ruOverviewFinancialHtml. Plain
// display tiles, not interactive — the KPI drilldown modal that used to
// open on click is confirmed frontend-dead (the RPC itself is untouched,
// just nothing client-side calls it anymore).
export default function OverviewKpiGrid({ financial }) {
  const f = financial || {}
  const byCategory = f.outstanding_by_category || {}
  const prevByCategory = f.outstanding_by_category_prev_month || {}
  const cat = (name) => byCategory[name] || { total: 0, count: 0 }
  const prevCat = (name) => prevByCategory[name] || { total: 0, count: 0 }
  const trend = f.monthly_recovery_trend || []
  const prevMonthReceived = trend.length >= 2 ? trend[trend.length - 2].recovered : null

  const tiles = [
    {
      label: 'Total Outstanding',
      count: f.total_outstanding_count,
      amount: formatIndianCompact(f.total_outstanding),
      trend: computeTrend(f.total_outstanding, f.total_outstanding_prev_month, 'outstanding'),
    },
    {
      label: 'Platinum Outstanding',
      count: cat('Platinum').count,
      amount: formatIndianCompact(cat('Platinum').total),
      trend: computeTrend(cat('Platinum').total, prevCat('Platinum').total, 'outstanding'),
    },
    {
      label: 'Gold Outstanding',
      count: cat('Gold').count,
      amount: formatIndianCompact(cat('Gold').total),
      trend: computeTrend(cat('Gold').total, prevCat('Gold').total, 'outstanding'),
    },
    {
      label: 'Silver Outstanding',
      count: cat('Silver').count,
      amount: formatIndianCompact(cat('Silver').total),
      trend: computeTrend(cat('Silver').total, prevCat('Silver').total, 'outstanding'),
    },
    {
      label: 'Received This Month',
      count: f.total_recovered_this_month_count,
      amount: formatIndianCompact(f.total_recovered_this_month),
      trend: computeTrend(f.total_recovered_this_month, prevMonthReceived, 'received'),
    },
    // Cumulative — no meaningful MoM comparison, hardcoded no trend.
    { label: 'Received All-Time', count: f.total_recovered_all_time_count, amount: formatIndianCompact(f.total_recovered_all_time), trend: null },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-border bg-surface p-3">
          <div className="text-[11px] text-text-muted">{t.label}</div>
          <div className="text-[17px] font-bold text-text mt-1">{t.amount}</div>
          <div className="text-[10.5px] text-text-muted mt-0.5">
            {t.count ?? 0} customers
            <TrendArrow trend={t.trend} />
          </div>
        </div>
      ))}
    </div>
  )
}
