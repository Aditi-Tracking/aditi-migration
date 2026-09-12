import { canBulkPay, canDeleteVendorRequest, canEditVendorRequest, formatINR } from '../../../lib/vendorRequests'
import { VendorPayBadge, VendorStatusBadge } from './VendorBadges'

// Ported from old-portal/js/vendor.js's _vrRenderTable.
export default function VendorRequestsTable({ rows, nameMap, currentUser, permissions, selectedIds, onToggleSelect, onRowClick, onEdit, onDelete }) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-border">
              {['Date', 'Requested By', 'Vendor', 'Product / Service', 'Qty', 'Amount (₹)', 'Location', 'Status', 'Payment', 'Attachment', 'Action'].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={11} className="text-center py-10 text-text-muted">
                  No requests found. Try a different filter or submit a new request.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const nameDisplay = nameMap[String(r.submitted_by || '').toLowerCase()] || r.submitted_by || '—'
                const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
                const canPayRow = canBulkPay(r, currentUser, permissions)
                const canDel = canDeleteVendorRequest(r, currentUser, permissions)
                const canEd = canEditVendorRequest(r, currentUser, permissions)
                return (
                  <tr key={r.id} onClick={() => onRowClick(r.id)} title="Click row to view details" className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer">
                    <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">{dateStr}</td>
                    <td className="px-3 py-2.5 font-semibold text-text">{nameDisplay}</td>
                    <td className="px-3 py-2.5 font-semibold text-text">{r.vendor_name || '—'}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate" title={r.product_name || ''}>
                      {r.product_name || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">{r.qty || '—'}</td>
                    <td className="px-3 py-2.5 font-bold text-right whitespace-nowrap">{r.amount != null ? formatINR(r.amount) : '—'}</td>
                    <td className="px-3 py-2.5">{r.location || '—'}</td>
                    <td className="px-3 py-2.5">
                      <VendorStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <VendorPayBadge status={r.payment_status} />
                    </td>
                    <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      {r.invoice_link ? (
                        <a href={r.invoice_link} target="_blank" rel="noopener noreferrer" title="View uploaded invoice / quotation" className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary-tint border border-primary/30 text-primary">
                          📎
                        </a>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {canPayRow && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={(e) => onToggleSelect(r.id, e.target.checked)}
                          title="Select to mark as Paid"
                          className="w-4 h-4 cursor-pointer mr-1.5 align-middle"
                        />
                      )}
                      {canEd && (
                        <button type="button" onClick={() => onEdit(r.id)} title="Edit request" className="px-2 py-1 rounded-md border border-primary/35 bg-primary-tint text-primary ml-1">
                          ✏️ Edit
                        </button>
                      )}
                      {canDel && (
                        <button type="button" onClick={() => onDelete(r.id)} title="Delete request" className="px-2 py-1 rounded-md border border-danger/30 bg-danger-tint text-danger ml-1">
                          🗑
                        </button>
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
