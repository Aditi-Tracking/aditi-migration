// Month-by-month breakdown with a TOTAL footer row — matches the reference dashboard's
// "Month-wise Summary" table exactly (Month / Total / Submitted / Pipeline / Not Submitted).
export default function TenderMonthSummaryTable({ summary }) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-[13px] font-bold text-text">Month-wise Summary</div>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-surface-2 text-text-muted text-left">
            <th className="px-3 py-2 font-semibold">Month</th>
            <th className="px-3 py-2 font-semibold text-center">Total</th>
            <th className="px-3 py-2 font-semibold text-center text-[#15803d]">Submitted</th>
            <th className="px-3 py-2 font-semibold text-center text-[#b45309]">Pipeline</th>
            <th className="px-3 py-2 font-semibold text-center text-[#b91c1c]">Not Submitted</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((m) => (
            <tr key={m.month} className="border-t border-border">
              <td className="px-3 py-2 text-text font-medium">{m.month}</td>
              <td className="px-3 py-2 text-center text-text">{m.total}</td>
              <td className="px-3 py-2 text-center text-[#15803d] font-semibold">{m.submitted}</td>
              <td className="px-3 py-2 text-center text-[#b45309] font-semibold">{m.pipeline}</td>
              <td className="px-3 py-2 text-center text-[#b91c1c] font-semibold">{m.notSubmitted}</td>
            </tr>
          ))}
          {!summary.rows.length && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-text-muted">
                No data
              </td>
            </tr>
          )}
          <tr className="border-t-2 border-border bg-surface-2 font-bold">
            <td className="px-3 py-2 text-text">TOTAL</td>
            <td className="px-3 py-2 text-center text-text">{summary.totals.total}</td>
            <td className="px-3 py-2 text-center text-[#15803d]">{summary.totals.submitted}</td>
            <td className="px-3 py-2 text-center text-[#b45309]">{summary.totals.pipeline}</td>
            <td className="px-3 py-2 text-center text-[#b91c1c]">{summary.totals.notSubmitted}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
