import { statusForRow, stockForRow } from '../../../lib/ims'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'

const STATUS_FILL = { zero: '#ff5c7c', low: '#f0a500', ok: '#00d4aa' }
const STATUS_LABEL = { zero: 'Zero', low: 'Low', ok: 'OK' }
const ROW_TINT = { zero: 'bg-[#ff5c7c0f]', low: 'bg-[#f0a5000d]', ok: '' }

// Ported from old-portal/js/ims.js's _imsRenderTable/imsApplyFilter. No pagination in
// production — the full filtered list renders at once, just inside a scrollable card. Migrated
// onto the shared table system, custom header bar (title + count) kept outside a bare Table, same
// pattern as Enterprise Lead/CRMCustomerTable. Status badge uses StatusBadge's color escape hatch
// uniformly (zero/low/ok) — low's #f0a500 happens to be byte-identical to the warning tone anyway,
// so branching onto tone="warning" would render identically with more code, same reasoning as
// Enterprise Lead's Stage badge. ROW_TINT is a real highlight that needs to win outright over the
// zebra stripe's own background-color utility (the same class-order gotcha Recurring Bills' urgent
// rows needed) — zero/low rows get zebra={false} + their existing tint; ok rows get the default
// zebra={true} and pick up the normal alternating stripe among themselves. Item Name gained
// truncate+tooltip — previously untruncated at all, and no detail modal exists for this table
// (view-only, confirmed) to fall back on, so tooltip-only is the fix, same as every other
// view-only table this session.
export default function IMSTable({ rows, effIdx, maxStock, dateLabel, total }) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[13.5px] font-semibold text-text">📦 Inventory Items</span>
        <span className="text-[11.5px] text-text-muted">
          {rows.length} / {total} items
        </span>
      </div>
      <Table>
        <TableHead>
          <Th>Item Name</Th>
          <Th>SKU Code</Th>
          <Th align="right" className="text-primary">
            📅 {dateLabel} (Stock)
          </Th>
          <Th>Status</Th>
        </TableHead>
        <tbody>
          {!rows.length ? (
            <tr>
              <Td colSpan={4} align="center" className="py-9 text-text-muted">
                No items found
              </Td>
            </tr>
          ) : (
            rows.map((r, i) => {
              const stock = stockForRow(r, effIdx)
              const status = statusForRow(r, effIdx)
              const pct = Math.round(Math.min(stock / maxStock, 1) * 100)
              return (
                <Tr key={r.skuCode + i} zebra={status === 'ok'} className={ROW_TINT[status]}>
                  <Td className="font-semibold text-text max-w-[220px] truncate" title={r.itemName || ''}>
                    {r.itemName || '—'}
                  </Td>
                  <Td className="text-text-muted">{r.skuCode}</Td>
                  <Td>
                    <div className="flex items-center gap-2 justify-end min-w-[90px]">
                      <div className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden max-w-[70px]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_FILL[status] }} />
                      </div>
                      <span className="font-bold" style={{ color: STATUS_FILL[status] }}>
                        {stock}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge color={STATUS_FILL[status]}>{STATUS_LABEL[status]}</StatusBadge>
                  </Td>
                </Tr>
              )
            })
          )}
        </tbody>
      </Table>
    </div>
  )
}
