import { useMemo } from 'react'
import { engineerName } from '../../../../lib/fieldService'

// "Google Reviews by Engineer" — view_all / branch-access only (a non-view_all viewer's RLS-scoped
// data would be just themselves, which the Reviews Taken tile already shows). Counts the already-
// fetched engineer_id list per engineer, sorted by count desc; the same list's length is the tile's
// count, so the card's counts always sum to the tile.
export default function DashboardReviewsByEngineerCard({ engineerIds, engineerOptions, loading, error }) {
  // engineerOptions isn't read in the body (engineerName() reads the module cache) — it's a
  // deliberate recompute trigger for when fetchEngineerOptions() resolves, same as Top Engineers.
  const rows = useMemo(() => {
    const counts = new Map()
    engineerIds.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1))
    return [...counts.entries()]
      .map(([id, count]) => ({ id, name: engineerName(id), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engineerOptions is a recompute trigger, not read in the body
  }, [engineerIds, engineerOptions])

  const max = rows.length ? rows[0].count : 0

  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5 min-w-0">
      <div className="text-[13px] font-semibold text-text mb-1.5">Google Reviews by Engineer</div>
      <div className="max-h-[140px] overflow-y-auto lg:max-h-none lg:h-[234px]">
        {loading ? (
          <div className="h-full min-h-[60px] flex items-center justify-center text-text-muted text-[13px]">⏳ Loading…</div>
        ) : error ? (
          <div className="h-full min-h-[60px] flex items-center justify-center text-danger text-[13px]">⚠️ Could not load reviews</div>
        ) : !rows.length ? (
          <div className="h-full min-h-[60px] flex items-center justify-center text-text-muted text-[13px]">No reviews in this period</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1 text-[12px]">
              <div className="w-[38%] shrink-0 truncate text-text" title={r.name}>
                {r.name}
              </div>
              <div className="flex-1 h-1.5 rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              <div className="w-8 shrink-0 text-right font-semibold text-text">{r.count}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
