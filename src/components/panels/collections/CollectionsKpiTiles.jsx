import { formatLakh } from '../../../lib/collectionsDashboard'

// Same accent-stripe tile pattern as Field Service Dashboard's DashboardKpiTiles.jsx.
function AccentStripe() {
  return <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-primary" />
}

export default function CollectionsKpiTiles({ rows }) {
  const totalCallsPlanned = rows.reduce((s, r) => s + r.commitmentCalls, 0)
  const totalCallsDone = rows.reduce((s, r) => s + r.connectCall, 0)
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)
  const totalResale = rows.reduce((s, r) => s + r.resale, 0)
  const totalCommitment = rows.reduce((s, r) => s + r.commitment, 0)
  // Commitment is a target, not realized business — Grand Total counts only what was actually
  // achieved (Outstanding + Repeat Orders).
  const grandTotal = totalOutstanding + totalResale

  // Commitment (Target) pinned to the 3rd tile — everything else keeps its relative order.
  const tiles = [
    { label: 'Calls Planned', value: totalCallsPlanned.toLocaleString('en-IN') },
    { label: 'Calls Done', value: totalCallsDone.toLocaleString('en-IN') },
    { label: 'Commitment (Target)', value: formatLakh(totalCommitment) },
    { label: 'Outstanding', value: formatLakh(totalOutstanding) },
    { label: 'Repeat Orders (Resale)', value: formatLakh(totalResale) },
    { label: 'Grand Total', value: formatLakh(grandTotal) },
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
