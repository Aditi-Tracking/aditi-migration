import { RU_NOT_CONNECTED_REASON_LABELS } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's _ruOverviewActivityHtml. Fixed
// column widths (not just narrower padding) are what actually stop Note —
// free text, usually the widest column by far — from overlapping Customer;
// every column needs an explicit width for that to work, so all six are set
// even though only Note/Customer truly need the room.
export default function RecentActivityTable({ activity }) {
  const rows = activity || []

  return (
    <div className="rounded-xl border border-border bg-surface mb-5 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-[13px] font-semibold text-text">Recent Activity</span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[12.5px] w-full table-fixed">
          <thead>
            <tr className="bg-surface-2 text-text-muted text-left border-b border-border">
              <th className="px-2 py-1.5 w-[9%]">Date</th>
              <th className="px-2 py-1.5 w-[23%]">Customer</th>
              <th className="px-2 py-1.5 w-[13%]">By</th>
              <th className="px-2 py-1.5 w-[9%] text-center">Connected</th>
              <th className="px-2 py-1.5 w-[31%]">Note</th>
              <th className="px-2 py-1.5 w-[15%] text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((a, i) => {
                const note = a.connected
                  ? a.note || '—'
                  : RU_NOT_CONNECTED_REASON_LABELS[a.note] || a.note || '—'
                const amount = a.amount_recovered ? `₹${Number(a.amount_recovered).toLocaleString('en-IN')}` : '—'
                return (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-1.5 whitespace-nowrap">{a.call_date}</td>
                    <td className="px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap" title={a.customer_name}>
                      {a.customer_name}
                    </td>
                    <td className="px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap" title={a.person_name}>
                      {a.person_name}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-block w-[9px] h-[9px] rounded-full ${a.connected ? 'bg-primary' : 'bg-danger'}`} />
                    </td>
                    <td className="px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap" title={note}>
                      {note}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{amount}</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-text-muted">
                  No calls logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
