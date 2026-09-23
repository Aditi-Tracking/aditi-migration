import { useAuth } from '../../../../context/AuthContext'
import { describeActiveFilters, groupSum } from '../../../../lib/fieldServiceDashboard'
import { engineerName, JOB_TYPE_CONFIG } from '../../../../lib/fieldService'

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderKpis, since revised twice:
// first to read all 4 tiles from summaryRows instead of a separate fetchKpiComparisonStats()
// fetch, then to this 5-tile shape — Total Jobs (with a filter-description subtitle), Avg Jobs
// per Day, Top Service, Today's Jobs (its own lightweight fetch, independent of the active date
// preset), and Highest Jobs Done in a Day. Total Jobs/Top Service/Today's Jobs/Highest Day are
// click-to-filter, each toggle-aware (clicking an already-active value clears it back to
// default rather than re-applying it); Avg Jobs per Day stays non-clickable by design — there's
// no single engineer/date/job-type an average could sensibly filter to.
function AccentStripe() {
  return <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-primary" />
}

export default function DashboardKpiTiles({ summaryRows, viewAll, filters, todayCount, onChange, onScrollToEntries }) {
  const { currentUser } = useAuth()

  const totalJobs = summaryRows.reduce((sum, r) => sum + Number(r.entry_count || 0), 0)

  const filterDescription = describeActiveFilters(
    filters,
    (jt) => (JOB_TYPE_CONFIG[jt] && JOB_TYPE_CONFIG[jt].label) || jt,
    (id) => (viewAll ? engineerName(id) : currentUser?.name || engineerName(id))
  )

  const byDate = groupSum(summaryRows, 'entry_date')
  const avgPerDay = byDate.size ? totalJobs / byDate.size : 0

  const byJobType = groupSum(summaryRows, 'job_type')
  let topJobType = null
  let topJobTypeCount = 0
  byJobType.forEach((count, jt) => {
    if (count > topJobTypeCount) {
      topJobTypeCount = count
      topJobType = jt
    }
  })
  const topJobTypeLabel = topJobType ? (JOB_TYPE_CONFIG[topJobType]?.label || topJobType) : 'No data'

  // Highest single-day count within the selected range — daily_stats rows are grouped by
  // (engineer_id, job_type, entry_date), so multiple rows can share a date; group by date first
  // to get each day's real total before taking the max.
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
  const isMaxDayActive = !!maxDay && filters.preset === 'custom' && filters.customFrom === maxDay && filters.customTo === maxDay

  const tiles = [
    { label: 'Total Jobs', value: totalJobs, sub: filterDescription, onClick: onScrollToEntries },
    { label: 'Avg Jobs per Day', value: Math.round(avgPerDay * 10) / 10 },
    {
      label: 'Top Service',
      value: topJobTypeLabel,
      sub: topJobType ? `${topJobTypeCount.toLocaleString()} jobs` : undefined,
      onClick: topJobType ? () => onChange({ jobType: filters.jobType === topJobType ? '' : topJobType }) : undefined,
    },
    {
      label: "Today's Jobs",
      value: todayCount,
      onClick: () => onChange(filters.preset === 'today' ? { preset: '30d', customFrom: '', customTo: '' } : { preset: 'today' }),
    },
    {
      label: 'Highest Jobs Done in a Day',
      value: maxCount,
      sub: maxDayLabel,
      onClick: maxDay
        ? () => onChange(isMaxDayActive ? { preset: '30d', customFrom: '', customTo: '' } : { preset: 'custom', customFrom: maxDay, customTo: maxDay })
        : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-2.5">
      {tiles.map((t) => {
        const Wrapper = t.onClick ? 'button' : 'div'
        return (
          <Wrapper
            key={t.label}
            {...(t.onClick ? { type: 'button', onClick: t.onClick } : {})}
            className={`relative overflow-hidden rounded-xl border border-border bg-surface pt-3 px-3 pb-2 text-left min-w-0 ${
              t.onClick ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''
            }`}
          >
            <AccentStripe />
            <div className="text-[10px] text-text-muted uppercase tracking-wide">{t.label}</div>
            <div className="text-[19px] font-bold text-text mt-0.5">{t.value.toLocaleString()}</div>
            {t.sub && <div className="text-[10.5px] text-text-muted mt-0.5 truncate">{t.sub}</div>}
          </Wrapper>
        )
      })}
    </div>
  )
}
