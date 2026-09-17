import { groupSum, pctChange } from '../../../../lib/fieldServiceDashboard'

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderKpis. Two different data
// sources feed these 4 tiles — NOT a bug, a deliberate split: `kpiComparisons` (Today/This
// Week/This Month) is fetched independent of the active date-range filter, so those 3 stay fixed
// to real calendar windows no matter what preset is selected; only "Highest Jobs Done in a Day"
// reads from `summaryRows`, the one fetch actually scoped by the active range/job-type/engineer
// filters.
//
// Accent stripe + uppercase label mirror production's shared .kpi-card CSS (the same one FMS's
// KPI grid picked up) — confirmed none of these 4 tiles carry a per-tile --card-accent override
// in production, so a single primary-color stripe matches production's own behavior here, not
// just our unified-palette convention. Deliberately no hover-lift, unlike FMS's KPI grid: all 4
// tiles here are purely informational (no onClick, matching production's _fsdRenderKpis, which
// never attaches one either) — lifting a non-clickable card on hover would imply clickability
// that isn't there.
//
// Padding/gap/label size here are tighter than FMS's KPI grid — measured against production's own
// #fsDashboardTab-scoped CSS overrides (padding:13px 13px 9px, kpi-grid gap:8px;margin-bottom:11px,
// kpi-label font-size:0.62rem), part of fitting the whole dashboard (KPI + 3 charts) within one
// viewport height without scrolling.
function AccentStripe() {
  return <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-primary" />
}

export default function DashboardKpiTiles({ summaryRows, kpiComparisons }) {
  const kc = kpiComparisons || { today: 0, thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 }

  // Highest single-day count within the selected range — daily_stats rows are grouped by
  // (engineer_id, job_type, entry_date), so multiple rows can share a date; group by date first
  // to get each day's real total before taking the max.
  const byDate = groupSum(summaryRows, 'entry_date')
  let maxDay = null
  let maxCount = 0
  byDate.forEach((count, date) => {
    if (count > maxCount) {
      maxCount = count
      maxDay = date
    }
  })

  // Same UTC-vs-local pitfall applies to display, not just comparison — parse the 'YYYY-MM-DD'
  // string into local date parts explicitly instead of letting `new Date(maxDay)` reinterpret it
  // as UTC midnight.
  const maxDayLabel = (() => {
    if (!maxDay) return 'No data'
    const [y, mo, da] = maxDay.split('-').map(Number)
    return new Date(y, mo - 1, da).toLocaleDateString()
  })()

  const tiles = [
    { label: 'Jobs Done Today', value: kc.today },
    { label: 'This Week', value: kc.thisWeek, sub: `vs ${kc.lastWeek} last week (${pctChange(kc.thisWeek, kc.lastWeek)})` },
    { label: 'This Month', value: kc.thisMonth, sub: `vs ${kc.lastMonth} last month (${pctChange(kc.thisMonth, kc.lastMonth)})` },
    { label: 'Highest Jobs Done in a Day', value: maxCount, sub: maxDayLabel },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2.5">
      {tiles.map((t) => (
        <div key={t.label} className="relative overflow-hidden rounded-xl border border-border bg-surface pt-3 px-3 pb-2">
          <AccentStripe />
          <div className="text-[10px] text-text-muted uppercase tracking-wide">{t.label}</div>
          <div className="text-[19px] font-bold text-text mt-0.5">{t.value.toLocaleString()}</div>
          {t.sub && <div className="text-[10.5px] text-text-muted mt-0.5">{t.sub}</div>}
        </div>
      ))}
    </div>
  )
}
