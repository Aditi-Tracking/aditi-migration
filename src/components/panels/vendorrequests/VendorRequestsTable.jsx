import { canBulkPay, canDeleteVendorRequest, canEditVendorRequest, formatINR } from '../../../lib/vendorRequests'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import { CheckboxTd } from '../../shared/table/CheckboxCell'
import StatusBadge from '../../shared/table/StatusBadge'

const STATUS_TONE = { Approved: 'primary', Declined: 'danger', 'On Hold': 'warning' }

// Ported from old-portal/js/vendor.js's _vrRenderTable. Migrated onto the
// shared table system — the per-row "pay" checkbox moves out of the Action
// cell into its own dedicated column (pure layout reorg, same canBulkPay
// gating and onToggleSelect semantics; CheckboxTd's built-in stopPropagation
// replaces the manual wrapper this cell used to need). A header select-all
// is deliberately NOT added this pass — flagged and deferred, since scoping
// it correctly to only canBulkPay-eligible rows is its own decision, not
// implied by the visual migration.
export default function VendorRequestsTable({ rows, nameMap, currentUser, permissions, selectedIds, onToggleSelect, onRowClick, onEdit, onDelete }) {
  return (
    <Table>
      <TableHead>
        <th className="px-2 py-2 w-8" />
        <Th>Date</Th>
        <Th>Requested By</Th>
        <Th>Vendor</Th>
        <Th>Product / Service</Th>
        <Th align="right">Qty</Th>
        <Th align="right">Amount (₹)</Th>
        <Th>Location</Th>
        <Th>Status</Th>
        <Th>Payment</Th>
        <Th align="center">Attachment</Th>
        <Th>Action</Th>
      </TableHead>
      <tbody>
        {!rows.length ? (
          <tr>
            <Td colSpan={12} align="center" className="py-10 text-text-muted">
              No requests found. Try a different filter or submit a new request.
            </Td>
          </tr>
        ) : (
          rows.map((r) => {
            const nameDisplay = nameMap[String(r.submitted_by || '').toLowerCase()] || r.submitted_by || '—'
            const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
            const canPayRow = canBulkPay(r, currentUser, permissions)
            const canDel = canDeleteVendorRequest(r, currentUser, permissions)
            const canEd = canEditVendorRequest(r, currentUser, permissions)
            const status = r.status || 'On Hold'
            return (
              <Tr key={r.id} onClick={() => onRowClick(r.id)} title="Click row to view details">
                {canPayRow ? (
                  <CheckboxTd checked={selectedIds.has(r.id)} onChange={(checked) => onToggleSelect(r.id, checked)} />
                ) : (
                  <td className="px-2 py-2 w-8" />
                )}
                <Td className="text-text-muted whitespace-nowrap">{dateStr}</Td>
                <Td className="font-semibold text-text">{nameDisplay}</Td>
                <Td className="font-semibold text-text">{r.vendor_name || '—'}</Td>
                <Td className="max-w-[240px]" title={r.product_name || ''}>
                  {r.product_name || '—'}
                </Td>
                <Td align="right" numeric>
                  {r.qty || '—'}
                </Td>
                <Td align="right" numeric className="font-bold whitespace-nowrap">
                  {r.amount != null ? formatINR(r.amount) : '—'}
                </Td>
                <Td>{r.location || '—'}</Td>
                <Td>
                  <StatusBadge tone={STATUS_TONE[status] || 'warning'}>{status}</StatusBadge>
                </Td>
                <Td>
                  {r.payment_status === 'Paid' ? <StatusBadge tone="purple">💳 Paid</StatusBadge> : <StatusBadge tone="neutral">Unpaid</StatusBadge>}
                </Td>
                <Td align="center" onClick={(e) => e.stopPropagation()}>
                  {r.invoice_link ? (
                    <a
                      href={r.invoice_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View uploaded invoice / quotation"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary-tint border border-primary/30 text-primary"
                    >
                      📎
                    </a>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {canEd && (
                    <button
                      type="button"
                      onClick={() => onEdit(r.id)}
                      title="Edit request"
                      className="px-2 py-1 rounded-md border border-primary/35 bg-primary-tint text-primary ml-1"
                    >
                      ✏️ Edit
                    </button>
                  )}
                  {canDel && (
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      title="Delete request"
                      className="px-2 py-1 rounded-md border border-danger/30 bg-danger-tint text-danger ml-1"
                    >
                      🗑
                    </button>
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
