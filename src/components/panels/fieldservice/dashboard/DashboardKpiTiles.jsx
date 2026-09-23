import { useAuth } from '../../../../context/AuthContext'
import { groupSum } from '../../../../lib/fieldServiceDashboard'
import { engineerName } from '../../../../lib/fieldService'

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderKpis, since revised: all 4 tiles
// now read from `summaryRows`, the same active-filter-scoped dataset the charts use — the earlier
// split (3 tiles pinned to real calendar windows via a separate fetchKpiComparisonStats() fetch)
// is gone, along with that fetch and sumWindows()/pctChange()/monthBounds().
//
// Click-to-filter is an intentional, agreed design change from this component's earlier "purely
// informational, no onClick" convention: Total Jobs, Top Engineer, and Highest Jobs Done in a Day
// are now click-to-filter; Avg Jobs per Engineer stays non-clickable by design — there's no single
// engineer/date/job-type an average could sensibly filter to.
//
// Padding/gap/label size here are tighter than FMS's KPI grid — measured against production's own
// #fsDashboardTab-scoped CSS overrides (padding:13px 13px 9px, kpi-grid gap:8px;margin-bottom:11px,
// kpi-label font-size:0.62rem), part of fitting the whole dashboard (KPI + 3 charts) within one
// viewport height without scrolling.
function AccentStripe() {
  return <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-primary" />
}

export default function DashboardKpiTiles({ summaryRows, viewAll, onChange, onScrollToEntries }) {
  const { currentUser } = useAuth()

  const totalJobs = summaryRows.reduce((sum, r) => sum + Number(r.entry_count || 0), 0)

  const byEngineer = groupSum(summaryRows, 'engineer_id')
  const avgPerEngineer = byEngineer.size ? totalJobs / byEngineer.size : 0

  let topEngineerId = null
  let topEngineerCount = 0
  byEngineer.forEach((count, id) => {
    if (count > topEngineerCount) {
      topEngineerCount = count
      topEngineerId = id
    }
  })
  // engineerName()'s cache is only ever populated for viewAll users (see useFieldServiceDashboard's
  // fetchEngineerOptions gate) — an own-scope viewer's data only ever contains their own uid, so
  // fall back to their own known name rather than showing a raw uid.
  const topEngineerName = topEngineerId ? (viewAll ? engineerName(topEngineerId) : currentUser?.name || engineerName(topEngineerId)) : 'No data'

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
    { label: 'Total Jobs', value: totalJobs, onClick: onScrollToEntries },
    { label: 'Avg Jobs per Engineer', value: Math.round(avgPerEngineer * 10) / 10 },
    {
      label: 'Top Engineer',
      value: topEngineerName,
      sub: topEngineerId ? `${topEngineerCount.toLocaleString()} jobs` : undefined,
      onClick: topEngineerId ? () => onChange({ engineerId: topEngineerId }) : undefined,
    },
    {
      label: 'Highest Jobs Done in a Day',
      value: maxCount,
      sub: maxDayLabel,
      onClick: maxDay ? () => onChange({ preset: 'custom', customFrom: maxDay, customTo: maxDay }) : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2.5">
      {tiles.map((t) => {
        const Wrapper = t.onClick ? 'button' : 'div'
        return (
          <Wrapper
            key={t.label}
            {...(t.onClick ? { type: 'button', onClick: t.onClick } : {})}
            className={`relative overflow-hidden rounded-xl border border-border bg-surface pt-3 px-3 pb-2 text-left ${
              t.onClick ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''
            }`}
          >
            <AccentStripe />
            <div className="text-[10px] text-text-muted uppercase tracking-wide">{t.label}</div>
            <div className="text-[19px] font-bold text-text mt-0.5">{t.value.toLocaleString()}</div>
            {t.sub && <div className="text-[10.5px] text-text-muted mt-0.5">{t.sub}</div>}
          </Wrapper>
        )
      })}
    </div>
  )
}
