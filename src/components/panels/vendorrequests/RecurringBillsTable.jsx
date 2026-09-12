import { canEditRecurringBills, canPayRecurringBills, canReviewRecurringBills, dueDistance, ordinal, submittedThisCycle } from '../../../lib/recurringBills'
import { formatINR } from '../../../lib/vendorRequests'
import { VendorPayBadge, VendorStatusBadge } from './VendorBadges'

// Ported from old-portal/js/vendor.js's _rpRenderTable. Highlighting is capped at the first 2
// urgent (overdue-or-due-today, not-yet-submitted-this-cycle) rows — a 3rd equally-urgent bill
// gets no visual highlight, matching production's `urgentLeft` counter exactly, not a bug.
export default function RecurringBillsTable({ rows, histActive, recentIds, currentUser, permissions, selectedIds, onToggleSelect, onRowClick }) {
  const canReview = canReviewRecurringBills(currentUser, permissions)
  const canPay = canPayRecurringBills(currentUser, permissions)
  const canEdit = canEditRecurringBills(currentUser, permissions)
  let urgentLeft = 2

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-border">
              {['Vendor', 'Product / Service', 'Location', 'Due Day', 'This Month (₹)', 'Submitted On', 'Status', 'Payment', 'Action'].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-text-muted">
                  No recurring bills found
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const submitted = histActive ? true : submittedThisCycle(r)
                const dueDist = dueDistance(r)
                const isUrgent = !histActive && !submitted && dueDist <= 0 && urgentLeft > 0
                if (isUrgent) urgentLeft--
                const isRecent = !histActive && recentIds.has(r.id)
                const canApproveRow = submitted && r.status === 'On Hold' && canReview
                const canPayRow = submitted && r.status === 'Approved' && r.payment_status !== 'Paid' && canPay

                const rowClass = isRecent
                  ? 'bg-primary-tint'
                  : isUrgent
                    ? 'bg-danger-tint'
                    : histActive
                      ? ''
                      : 'cursor-pointer hover:bg-surface-2'
                const title = histActive
                  ? 'Historical record — read-only'
                  : isRecent
                    ? 'Just submitted'
                    : isUrgent
                      ? dueDist < 0
                        ? `Overdue by ${-dueDist} day(s) — needs submitting`
                        : 'Due today — needs submitting'
                      : 'Click row to view / edit / approve / pay'

                return (
                  <tr key={r.id} onClick={histActive ? undefined : () => onRowClick(r.id)} title={title} className={`border-b border-border last:border-0 ${rowClass}`}>
                    <td className="px-3 py-2.5 font-semibold text-text">
                      {r.vendor_name || '—'}
                      {isRecent && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary-tint text-primary">✅ Just Submitted</span>}
                      {isUrgent && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-danger-tint text-danger">
                          {dueDist < 0 ? `🔴 Late by ${-dueDist}d` : '⚠️ Submit This'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate" title={r.product_name || ''}>
                      {r.product_name || <span className="text-text-muted">— not set —</span>}
                    </td>
                    <td className="px-3 py-2.5">{r.location || <span className="text-text-muted">— not set —</span>}</td>
                    <td className="px-3 py-2.5 text-center">{r.due_date != null ? ordinal(r.due_date) : '—'}</td>
                    <td className="px-3 py-2.5 font-bold text-right whitespace-nowrap">{submitted && r.amount != null ? formatINR(r.amount) : <span className="text-text-muted font-normal">Not submitted</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{submitted && r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : <span className="text-text-muted">—</span>}</td>
                    <td className="px-3 py-2.5">{submitted ? <VendorStatusBadge status={r.status} /> : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-2 text-text-muted border border-border">—</span>}</td>
                    <td className="px-3 py-2.5">{submitted && <VendorPayBadge status={r.payment_status} />}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {histActive ? (
                        <span className="text-text-muted">🔒</span>
                      ) : (
                        <>
                          {(canApproveRow || canPayRow) && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(r.id)}
                              onChange={(e) => onToggleSelect(r.id, canApproveRow ? 'approve' : 'pay', e.target.checked)}
                              title={`Select for bulk ${canApproveRow ? 'approve' : 'pay'}`}
                              className="w-4 h-4 cursor-pointer mr-1.5 align-middle"
                            />
                          )}
                          {canEdit && (
                            <button type="button" onClick={() => onRowClick(r.id)} className="px-2 py-1 rounded-md border border-primary/35 bg-primary-tint text-primary">
                              ✏️ Edit
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
