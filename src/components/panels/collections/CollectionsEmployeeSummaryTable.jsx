import { useEffect, useMemo, useRef, useState } from 'react'
import { filterRowsByWeek, formatMoneyAdaptive, isoDateStr, summarizeByEmployee } from '../../../lib/collectionsDashboard'

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

// Commitment/Calls Planned/Monthly Target come from the separate targets sheet merged in by
// normalizeCollectionsRows — 0 for any row from before that sheet's Aug-2026 start (see
// lib/collectionsDashboard.js's header comment).
const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'callsPlanned', label: 'Calls Planned' },
  { key: 'callsDone', label: 'Calls Done' },
  { key: 'monthlyTarget', label: 'Monthly Target' },
  { key: 'commitment', label: 'Commitment (Target)' },
  { key: 'resale', label: 'Repeat Orders (Resale)' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'achievementPct', label: 'Achievement (%)' },
  { key: 'total', label: 'Total' },
]

// Traffic-light read on Achievement % — >=100% hit target, 50-99% partial, below that behind.
// Hardcoded hex (not the theme-aware text-danger token) so all three shades stay consistent with
// each other in both light and dark mode, matching this table's own bg-primary-tint accent below.
function achievementColor(pct) {
  if (pct >= 100) return '#10b981'
  if (pct >= 50) return '#f0a500'
  return '#ff5c7c'
}

// Per-employee rollup, replacing the old date-by-date trend chart. `rows`/`weeks` both come from
// the dashboard's OTHER filters (month/week-number/date/location/employee) already applied
// upstream, so this table and its week/date lists always stay consistent with them — e.g. picking
// Month=September narrows `weeks` down to September's weeks only.
//
// A Daily/Weekly/Monthly period toggle decides how `rows` gets scoped further before summing:
// - Monthly: `rows` as-is, no extra scoping — the whole currently-filtered month.
// - Weekly: the existing Mon-Sat week picker (this sheet's own work week, no Sunday rows).
// - Daily: a single calendar day, picked via a native date input.
// The week picker defaults to the latest available week automatically, and re-defaults every time
// its *set* of options actually changes (tracked by a signature ref, not weekKey) — e.g. switching
// the month filter reissues a new `weeks` array, so this snaps to that scope's latest week instead
// of silently keeping a now-out-of-range selection. A plain "did weekKey change" effect would also
// fire when the user themselves picks "All Weeks" (weekKey -> ''), immediately overriding their
// choice — comparing the weeks signature avoids that, since picking a value never changes `weeks`
// itself. The date picker is simpler: it just defaults once to the real current date, regardless of
// whether that day has any real data yet.
//
// `isCurrentMonth` (whether the dashboard's own Month filter is pinned to the real current month)
// drives which period this table itself defaults to: Daily makes sense while looking at the month
// that's actually in progress, but "today" means nothing once the user has picked a past month (or
// "All Months") — e.g. Month=October (current) -> Daily/today; Month=September (past) -> Monthly.
// Only reacts when isCurrentMonth itself actually flips (prevIsCurrentMonthRef), so it sets the
// period once per such switch and doesn't keep overriding the user's own later period pick on every
// render.
export default function CollectionsEmployeeSummaryTable({ rows, weeks, isCurrentMonth }) {
  const [period, setPeriod] = useState(isCurrentMonth ? 'daily' : 'monthly')
  const [weekKey, setWeekKey] = useState('')
  const [dateKey, setDateKey] = useState('')
  const weeksSignatureRef = useRef(null)
  const didDefaultDateRef = useRef(false)
  const prevIsCurrentMonthRef = useRef(isCurrentMonth)

  useEffect(() => {
    const signature = weeks.map((w) => w.key).join(',')
    if (signature === weeksSignatureRef.current) return
    weeksSignatureRef.current = signature
    setWeekKey(weeks.length ? weeks[weeks.length - 1].key : '')
  }, [weeks])

  // Defaults the Daily period's date picker to the REAL current date — only fires once per mount
  // (didDefaultDateRef), so it never fights the user's own later pick.
  useEffect(() => {
    if (didDefaultDateRef.current) return
    didDefaultDateRef.current = true
    setDateKey(isoDateStr(new Date()))
  }, [])

  useEffect(() => {
    if (prevIsCurrentMonthRef.current === isCurrentMonth) return
    prevIsCurrentMonthRef.current = isCurrentMonth
    setPeriod(isCurrentMonth ? 'daily' : 'monthly')
  }, [isCurrentMonth])

  const summary = useMemo(() => {
    let scoped = rows
    if (period === 'weekly') scoped = filterRowsByWeek(rows, weekKey, weeks)
    else if (period === 'daily') scoped = dateKey ? rows.filter((r) => isoDateStr(r.date) === dateKey) : rows
    return summarizeByEmployee(scoped).sort((a, b) => b.total - a.total)
  }, [rows, period, weekKey, weeks, dateKey])

  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="text-[14.5px] font-semibold text-text">Employee Summary</div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[13px]"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {period === 'weekly' && (
            <select
              value={weekKey}
              onChange={(e) => setWeekKey(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[13px]"
            >
              <option value="">All Weeks</option>
              {weeks.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
          )}
          {period === 'daily' && (
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[13px]"
            />
          )}
        </div>
      </div>

      {!summary.length && <div className="text-center py-10 text-text-muted text-[14px]">No entries found.</div>}

      {!!summary.length && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-primary-tint border-b-2 border-primary/30">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2.5 py-2.5 text-[11.5px] font-bold uppercase tracking-wide text-primary whitespace-nowrap text-center">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map((s, i) => (
                <tr key={s.name} className={`border-b border-border last:border-0 hover:bg-primary-tint/60 transition-colors ${i % 2 ? 'bg-surface-2/50' : ''}`}>
                  <td className="px-2.5 py-2 whitespace-nowrap text-center font-semibold text-text">{s.name}</td>
                  <td className="px-2.5 py-2 text-center">{s.callsPlanned.toLocaleString('en-IN')}</td>
                  <td className="px-2.5 py-2 text-center">{s.callsDone.toLocaleString('en-IN')}</td>
                  <td className="px-2.5 py-2 text-center">{formatMoneyAdaptive(s.monthlyTarget)}</td>
                  <td className="px-2.5 py-2 text-center">{formatMoneyAdaptive(s.commitment)}</td>
                  <td className="px-2.5 py-2 text-center">{formatMoneyAdaptive(s.resale)}</td>
                  <td className="px-2.5 py-2 text-center">{formatMoneyAdaptive(s.outstanding)}</td>
                  <td className="px-2.5 py-2 text-center font-semibold" style={{ color: achievementColor(s.achievementPct) }}>
                    {s.achievementPct.toFixed(1)}%
                  </td>
                  <td className="px-2.5 py-2 text-center font-bold text-primary">{formatMoneyAdaptive(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
