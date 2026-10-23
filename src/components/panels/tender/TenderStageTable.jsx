// Breaks the Submitted bucket down by what's actually happening with each bid right now — matches
// the reference dashboard's "Submitted Bids — Current Stage" table. Sourced from free-text stage
// notes (see lib/tenderDashboard.js's computeStageBreakdown for the bucketing rules), not a
// controlled dropdown value, so this is a best-effort classification of whatever engineers typed.
export default function TenderStageTable({ breakdown }) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-[13px] font-bold text-text">Submitted Bids — Current Stage</div>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-surface-2 text-text-muted text-left">
            <th className="px-3 py-2 font-semibold">Stage</th>
            <th className="px-3 py-2 font-semibold text-center">No. of Bids</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((b) => (
            <tr key={b.label} className="border-t border-border">
              <td className="px-3 py-2 text-text font-medium">{b.label}</td>
              <td className="px-3 py-2 text-center text-text font-semibold">{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
