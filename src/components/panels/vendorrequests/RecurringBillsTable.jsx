import { canEditRecurringBills, canPayRecurringBills, canReviewRecurringBills, dueDistance, ordinal, submittedThisCycle } from '../../../lib/recurringBills'
import { formatINR } from '../../../lib/vendorRequests'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import { CheckboxTd } from '../../shared/table/CheckboxCell'
import StatusBadge from '../../shared/table/StatusBadge'

const STATUS_TONE = { Approved: 'primary', Declined: 'danger', 'On Hold': 'warning' }

// Ported from old-portal/js/vendor.js's _rpRenderTable. Migrated onto the shared table system —
// the checkbox moves into its own dedicated column, matching VendorRequestsTable's own precedent.
// Highlighting is capped at the first 2 urgent (overdue-or-due-today, not-yet-submitted-this-
// cycle) rows — a 3rd equally-urgent bill gets no visual highlight, matching production's
// `urgentLeft` counter exactly, not a bug; it's a mutable variable closed over across .map(),
// relying on its guaranteed left-to-right execution order, unchanged by this migration.
//
// Urgent/just-submitted rows pass zebra={false} + their own highlight className to Tr, so that
// color always wins outright over the zebra stripe — two background utility classes on one
// element are resolved by stylesheet order, not JSX prop order, so nothing here can be relied on
// to "win" without opting out (same escape hatch Renewals' interleaved-row case used, for a
// different reason). History-mode rows get no highlight class at all, so plain default zebra
// applies to them with no conflict — confirmed, not assumed.
export default function RecurringBillsTable({ rows, histActive, recentIds, currentUser, permissions, selectedIds, onToggleSelect, onRowClick }) {
  const canReview = canReviewRecurringBills(currentUser, permissions)
  const canPay = canPayRecurringBills(currentUser, permissions)
  const canEdit = canEditRecurringBills(currentUser, permissions)
  let urgentLeft = 2

  return (
    <Table>
      <TableHead>
        <th className="px-2 py-2 w-8" />
        <Th>Vendor</Th>
        <Th>Product / Service</Th>
        <Th>Location</Th>
        <Th align="center">Due Day</Th>
        <Th align="right">This Month (₹)</Th>
        <Th>Submitted On</Th>
        <Th>Status</Th>
        <Th>Payment</Th>
        <Th>Action</Th>
      </TableHead>
      <tbody>
        {!rows.length ? (
          <tr>
            <Td colSpan={10} align="center" className="py-10 text-text-muted">
              No recurring bills found
            </Td>
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

            const highlightClass = isRecent ? 'bg-primary-tint' : isUrgent ? 'bg-danger-tint' : ''
            const rowTitle = histActive
              ? 'Historical record — read-only'
              : isRecent
                ? 'Just submitted'
                : isUrgent
                  ? dueDist < 0
                    ? `Overdue by ${-dueDist} day(s) — needs submitting`
                    : 'Due today — needs submitting'
                  : 'Click row to view / edit / approve / pay'

            return (
              <Tr
                key={r.id}
                onClick={histActive ? undefined : () => onRowClick(r.id)}
                title={rowTitle}
                zebra={!highlightClass}
                className={highlightClass}
              >
                {!histActive && (canApproveRow || canPayRow) ? (
                  <CheckboxTd
                    checked={selectedIds.has(r.id)}
                    onChange={(checked) => onToggleSelect(r.id, canApproveRow ? 'approve' : 'pay', checked)}
                    title={`Select for bulk ${canApproveRow ? 'approve' : 'pay'}`}
                  />
                ) : (
                  <td className="px-2 py-2 w-8" onClick={(e) => e.stopPropagation()} />
                )}
                <Td className="font-semibold text-text">
                  <span className="max-w-[160px] truncate inline-block align-middle" title={r.vendor_name || ''}>
                    {r.vendor_name || '—'}
                  </span>
                  {isRecent && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary-tint text-primary">
                      ✅ Just Submitted
                    </span>
                  )}
                  {isUrgent && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-danger-tint text-danger">
                      {dueDist < 0 ? `🔴 Late by ${-dueDist}d` : '⚠️ Submit This'}
                    </span>
                  )}
                </Td>
                <Td className="max-w-[180px] truncate" title={r.product_name || ''}>
                  {r.product_name || <span className="text-text-muted">— not set —</span>}
                </Td>
                <Td className="max-w-[110px] truncate" title={r.location || ''}>
                  {r.location || <span className="text-text-muted">— not set —</span>}
                </Td>
                <Td align="center">{r.due_date != null ? ordinal(r.due_date) : '—'}</Td>
                <Td align="right" numeric className="font-bold whitespace-nowrap">
                  {submitted && r.amount != null ? formatINR(r.amount) : <span className="text-text-muted font-normal">Not submitted</span>}
                </Td>
                <Td className="whitespace-nowrap">
                  {submitted && r.submitted_at ? (
                    new Date(r.submitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </Td>
                <Td>
                  {submitted ? (
                    <StatusBadge tone={STATUS_TONE[r.status] || 'warning'}>{r.status}</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">—</StatusBadge>
                  )}
                </Td>
                {/* Deliberately no fallback here when !submitted — production shows nothing at
                    all for Payment (unlike Status, which shows a neutral "—"), a confirmed
                    asymmetry ported exactly, not normalized. */}
                <Td>{submitted && (r.payment_status === 'Paid' ? <StatusBadge tone="purple">💳 Paid</StatusBadge> : <StatusBadge tone="neutral">Unpaid</StatusBadge>)}</Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  {histActive ? (
                    <span className="text-text-muted">🔒</span>
                  ) : (
                    canEdit && (
                      <button type="button" onClick={() => onRowClick(r.id)} className="px-2 py-1 rounded-md border border-primary/35 bg-primary-tint text-primary">
                        ✏️ Edit
                      </button>
                    )
                  )}
                </Td>
              </Tr>
            )
          })
        )}
      </tbody>
    </Table>
  )
}
