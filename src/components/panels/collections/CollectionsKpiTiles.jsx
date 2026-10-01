import { formatMoneyAdaptive } from '../../../lib/collectionsDashboard'

// Same accent-stripe tile pattern as Field Service Dashboard's DashboardKpiTiles.jsx.
function AccentStripe() {
  return <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-primary" />
}

// Commitment/Commitment Calls come from the separate targets sheet merged in by
// normalizeCollectionsRows — 0 for any row from before that sheet's Aug-2026 start (see
// lib/collectionsDashboard.js's header comment). Money tiles use formatMoneyAdaptive (steps
// k/L/Cr by magnitude), not formatLakh's fixed "always divide by 100000" — a filtered view this
// small reads much better as "₹13.0k" than "₹0.13L", matching the Employee Summary table's own
// adaptive formatting. "MTD" is this dashboard's name for what was the Grand Total tile — same
// number (sum of the currently filtered scope's own `total`, already includes nbd — see lib
// comment), just renamed; it is NOT separately re-bounded to the real calendar month, since
// whichever Month/Week/Date filter the user has picked already defines what "to date" means here.
export default function CollectionsKpiTiles({ rows }) {
  const totalCallsPlanned = rows.reduce((s, r) => s + r.commitmentCalls, 0)
  const totalCallsDone = rows.reduce((s, r) => s + r.connectCall, 0)
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)
  const totalResale = rows.reduce((s, r) => s + r.resale, 0)
  const totalCommitment = rows.reduce((s, r) => s + r.commitment, 0)
  const mtdTotal = rows.reduce((s, r) => s + r.total, 0)

  const tiles = [
    { label: 'Calls Planned', value: totalCallsPlanned.toLocaleString('en-IN') },
    { label: 'Calls Done', value: totalCallsDone.toLocaleString('en-IN') },
    { label: 'Commitment (Target)', value: formatMoneyAdaptive(totalCommitment) },
    { label: 'Outstanding', value: formatMoneyAdaptive(totalOutstanding) },
    { label: 'Repeat Orders (Resale)', value: formatMoneyAdaptive(totalResale) },
    { label: 'MTD', value: formatMoneyAdaptive(mtdTotal) },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-2.5">
      {tiles.map((t) => (
        <div key={t.label} className="relative overflow-hidden rounded-xl border border-border bg-surface pt-4 px-3.5 pb-3.5 min-h-[92px] text-left min-w-0">
          <AccentStripe />
          <div className="text-[12px] font-bold text-text-muted uppercase tracking-wide">{t.label}</div>
          <div className="text-[20px] font-bold text-text mt-1.5 leading-tight">{t.value}</div>
        </div>
      ))}
    </div>
  )
}
