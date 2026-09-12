import { statusForRow, stockForRow } from '../../../lib/ims'

const STATUS_FILL = { zero: '#ff5c7c', low: '#f0a500', ok: '#00d4aa' }
const STATUS_BADGE = {
  zero: 'bg-[#ff5c7c22] text-[#ff5c7c] border-[#ff5c7c40]',
  low: 'bg-[#f0a50022] text-[#f0a500] border-[#f0a50040]',
  ok: 'bg-[#00d4aa22] text-[#00d4aa] border-[#00d4aa40]',
}
const STATUS_LABEL = { zero: 'Zero', low: 'Low', ok: 'OK' }
const ROW_TINT = { zero: 'bg-[#ff5c7c0f]', low: 'bg-[#f0a5000d]', ok: '' }

// Ported from old-portal/js/ims.js's _imsRenderTable/imsApplyFilter. No pagination in
// production — the full filtered list renders at once, just inside a scrollable card.
export default function IMSTable({ rows, effIdx, maxStock, dateLabel, total }) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[13.5px] font-semibold text-text">📦 Inventory Items</span>
        <span className="text-[11.5px] text-text-muted">
          {rows.length} / {total} items
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] whitespace-nowrap">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              <th className="text-left px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted">Item Name</th>
              <th className="text-left px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted">SKU Code</th>
              <th className="text-right px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-primary">📅 {dateLabel} (Stock)</th>
              <th className="text-left px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted">Status</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={4} className="text-center py-9 text-text-muted">
                  No items found
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const stock = stockForRow(r, effIdx)
                const status = statusForRow(r, effIdx)
                const pct = Math.round(Math.min(stock / maxStock, 1) * 100)
                return (
                  <tr key={r.skuCode + i} className={`border-b border-border last:border-0 ${ROW_TINT[status]}`}>
                    <td className="px-3.5 py-2.5 font-semibold text-text">{r.itemName || '—'}</td>
                    <td className="px-3.5 py-2.5 text-text-muted">{r.skuCode}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2 justify-end min-w-[90px]">
                        <div className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden max-w-[70px]">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_FILL[status] }} />
                        </div>
                        <span className="font-bold" style={{ color: STATUS_FILL[status] }}>
                          {stock}
                        </span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
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
