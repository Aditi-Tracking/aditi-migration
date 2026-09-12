import { dayDiff, fmtDate } from '../../../lib/hrEmployee'
import ChecklistBadge from './ChecklistBadge'

const KPI_COLORS = { total: '#00d4ff', perm: '#00d4aa', prob: '#f0a500', exited: '#ff5c7c' }

// Ported from old-portal/js/hrEmployee.js's heRenderOverview/heRenderLocationBreakdown/
// heRenderUpcomingProbation/heRenderRecentlyExited.
//
// The "Upcoming Probation Completions (next 30 days)" title is production's own — the actual
// filter has NO 30-day upper bound, it's just "not overdue, soonest 5." Ported as-is, including
// the mismatch: ported the code's real behavior, not the title's claim.
export default function OverviewTab({ employees, exitDetailsByEmployeeId, checklistStatusAll, checklistItemsLength, onOpenChecklist }) {
  const total = employees.length
  const perm = employees.filter((e) => e.category === 'Permanent Staff').length
  const prob = employees.filter((e) => e.category === 'Probationary Staff').length
  const exited = employees.filter((e) => e.category === 'Exited Staff').length

  const locationCounts = {}
  employees.forEach((e) => {
    const loc = (e.location || '').trim() || 'Unspecified'
    locationCounts[loc] = (locationCounts[loc] || 0) + 1
  })
  const locationRows = Object.entries(locationCounts).sort((a, b) => b[1] - a[1])
  const maxLocationCount = locationRows.length ? locationRows[0][1] : 1

  const upcomingProbation = employees
    .filter((e) => e.category === 'Probationary Staff' && e.probation_completion_date)
    .map((e) => ({ e, diff: dayDiff(e.probation_completion_date) }))
    .filter((x) => x.diff !== null && x.diff >= 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5)

  const recentlyExited = employees
    .filter((e) => e.category === 'Exited Staff')
    .map((e) => ({ e, exitInfo: exitDetailsByEmployeeId[e.id] }))
    .sort((a, b) => {
      const da = a.exitInfo?.exit_date ? new Date(a.exitInfo.exit_date) : new Date(0)
      const db = b.exitInfo?.exit_date ? new Date(b.exitInfo.exit_date) : new Date(0)
      return db - da
    })
    .slice(0, 10)

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Employees', value: total, sub: 'All categories', color: KPI_COLORS.total },
          { label: 'Permanent', value: perm, sub: 'Permanent Staff', color: KPI_COLORS.perm },
          { label: 'Probationary', value: prob, sub: 'Probationary Staff', color: KPI_COLORS.prob },
          { label: 'Exited', value: exited, sub: 'Exited Staff', color: KPI_COLORS.exited },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-surface p-3.5">
            <div className="text-[11px] text-text-muted">{t.label}</div>
            <div className="text-[19px] font-bold mt-0.5" style={{ color: t.color }}>
              {t.value}
            </div>
            <div className="text-[10.5px] text-text-muted mt-0.5">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[13px] font-bold text-text mb-3">📍 Location-wise Breakdown</div>
          {!locationRows.length ? (
            <div className="text-text-muted text-[12.5px] py-4">No location data.</div>
          ) : (
            locationRows.map(([loc, count]) => (
              <div key={loc} className="flex items-center gap-2.5 py-1.5">
                <div className="w-[100px] shrink-0 text-[12.5px] font-semibold text-text truncate">{loc}</div>
                <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((count / maxLocationCount) * 100)}%` }} />
                </div>
                <div className="w-8 text-right text-[12.5px] font-semibold text-text-muted">{count}</div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[13px] font-bold text-text mb-3">⏳ Upcoming Probation Completions (next 30 days)</div>
          {!upcomingProbation.length ? (
            <div className="text-text-muted text-[12.5px] py-4">No upcoming probation completions.</div>
          ) : (
            upcomingProbation.map(({ e, diff }) => {
              const tone = diff <= 7 ? 'bg-danger-tint text-danger' : diff <= 15 ? 'bg-[#f0a500]/15 text-[#f0a500]' : 'bg-primary-tint text-primary'
              return (
                <div key={e.id} className="flex items-center justify-between gap-2.5 py-2 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-text">{e.full_name}</div>
                    <div className="text-[11px] text-text-muted">
                      {e.department || '—'} · {fmtDate(e.probation_completion_date)}
                    </div>
                  </div>
                  <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${tone}`}>{diff === 0 ? 'Today' : `${diff}d left`}</span>
                </div>
              )
            })
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 lg:col-span-2">
          <div className="text-[13px] font-bold text-text mb-3">🚪 Recently Exited — Checklist Status</div>
          {!recentlyExited.length ? (
            <div className="text-text-muted text-[12.5px] py-4">No exited employees yet.</div>
          ) : (
            recentlyExited.map(({ e, exitInfo }) => (
              <div
                key={e.id}
                onClick={() => onOpenChecklist(e.id)}
                className="flex items-center justify-between gap-2.5 py-2 border-b border-border last:border-0 cursor-pointer hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-text">{e.full_name}</div>
                  <div className="text-[11px] text-text-muted">Exited {exitInfo?.exit_date ? fmtDate(exitInfo.exit_date) : '—'}</div>
                </div>
                <ChecklistBadge employeeId={e.id} checklistStatusAll={checklistStatusAll} checklistItemsLength={checklistItemsLength} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
