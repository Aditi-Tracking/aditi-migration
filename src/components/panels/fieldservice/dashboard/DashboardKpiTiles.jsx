import { groupSum, pctChange } from '../../../../lib/fieldServiceDashboard'

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderKpis. Two different data
// sources feed these 4 tiles — NOT a bug, a deliberate split: `kpiComparisons` (Today/This
// Week/This Month) is fetched independent of the active date-range filter, so those 3 stay fixed
// to real calendar windows no matter what preset is selected; only "Highest Jobs Done in a Day"
// reads from `summaryRows`, the one fetch actually scoped by the active range/job-type/engineer
// filters.
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-border bg-surface p-3.5">
          <div className="text-[11px] text-text-muted">{t.label}</div>
          <div className="text-[19px] font-bold text-text mt-0.5">{t.value.toLocaleString()}</div>
          {t.sub && <div className="text-[10.5px] text-text-muted mt-0.5">{t.sub}</div>}
        </div>
      ))}
    </div>
  )
}
