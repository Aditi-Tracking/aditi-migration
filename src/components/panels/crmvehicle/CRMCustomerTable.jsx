import { CRM_TABLE_PAGE_SIZE, assigneeColor } from '../../../lib/crmVehicle'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'
import TopPagination from '../../shared/table/TopPagination'

// Platinum's #a855f7 is byte-identical to StatusBadge's own purple tone —
// tone="purple" directly. Gold's #f59e0b doesn't match StatusBadge's
// warning tone (#F0A500, a different amber) and this exact hex is reused
// elsewhere in this same table (idle-count text, the status bar's idle
// segment) — preserved exactly via the color escape hatch rather than
// approximated. Silver's original color is var(--color-text-muted), which
// the color escape hatch can't take (it string-concatenates an alpha
// suffix onto whatever's passed, which only works for a literal hex) —
// tone="neutral" is the only clean option, sharing the same text-muted
// color but a different background hue (the app's neutral surface token,
// not a tint of text-muted itself) — a minor, confirmed, expected
// difference, not a bug.
const TIER_ICON = { Platinum: '💎', Gold: '🥇', Silver: '🥈' }

// Ported from old-portal/js/crm.js's crmRenderTable/crmSelectRow/crmClearSelection. Clicking a row
// toggles the "selected company" KPI override (see CRMKpiCards) and shows an inline info bar above
// the search row — no separate detail modal exists in production for this module. Migrated onto
// the shared table system. Running/Idle/Stop/Inactive are quantitative displays (plain colored
// numbers + a proportional status bar), not status labels — confirmed they don't map onto
// StatusBadge at all, unlike the tier pill. Numeric columns stay left-aligned, an existing,
// intentional design choice, not something this migration should "fix."
//
// `page`/`onPageChange` — not a port, added after profiling confirmed this table's own unbounded
// render (at the real ~3,938-row volume) as the dominant lag source. `rows` here is still the full
// filtered list (search/tier/status already applied by the caller); this component only slices to
// the current page for rendering, mirroring SmartFleetTable's page/onPageChange contract exactly.
export default function CRMCustomerTable({ rows, search, onSearchChange, selectedRow, onSelectRow, page, onPageChange }) {
  const pageRows = rows.slice((page - 1) * CRM_TABLE_PAGE_SIZE, page * CRM_TABLE_PAGE_SIZE)

  return (
    <div>
      {selectedRow && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-primary/25 bg-primary-tint px-4 py-3 mb-3">
          <div>
            <div className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">Selected Company</div>
            <div className="text-[14px] font-bold text-text">{selectedRow.company || '—'}</div>
          </div>
          <div className="flex flex-wrap gap-3 text-[12px] font-semibold">
            <span style={{ color: '#0a7bc4' }}>🚗 {(selectedRow.total_vehicles || 0).toLocaleString()} Total</span>
            <span style={{ color: '#10b981' }}>🟢 {(selectedRow.running_count || 0).toLocaleString()} Running</span>
            <span style={{ color: '#f59e0b' }}>🟡 {(selectedRow.idle_count || 0).toLocaleString()} Idle</span>
            <span style={{ color: '#64748b' }}>⚫ {(selectedRow.stop_count || 0).toLocaleString()} Stop</span>
            <span style={{ color: '#ef4444' }}>🔴 {(selectedRow.inactive_count || 0).toLocaleString()} Inactive</span>
            <span style={{ color: '#7c3aed' }}>{selectedRow.tier || '—'}</span>
          </div>
          <button type="button" onClick={() => onSelectRow(null)} className="text-[12px] font-semibold text-primary">
            ✕ Clear
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="🔍  Search company name..."
          className="flex-1 min-w-[220px] box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
        />
        <TopPagination page={page} pageSize={CRM_TABLE_PAGE_SIZE} total={rows.length} onPageChange={onPageChange} />
      </div>
      <div className="text-[11px] text-text-muted italic mb-2.5">Data syncs every 5 minutes · Click any row to see details</div>

      <Table>
        <TableHead>
          <Th>#</Th>
          <Th>Customer Name</Th>
          <Th>Tier</Th>
          <Th>Total</Th>
          <Th>Running</Th>
          <Th>Idle</Th>
          <Th>Stop</Th>
          <Th>Inactive</Th>
          <Th>Status Bar</Th>
          <Th>Assigned To</Th>
          <Th>Last Synced</Th>
        </TableHead>
        <tbody>
          {!rows.length ? (
            <tr>
              <Td colSpan={11} align="center" className="py-10 text-text-muted">
                No companies found
              </Td>
            </tr>
          ) : (
            pageRows.map((r, i) => (
              <CustomerRow
                key={`${r.company}-${r.region}-${i}`}
                row={r}
                index={(page - 1) * CRM_TABLE_PAGE_SIZE + i}
                isSelected={selectedRow === r}
                onSelect={onSelectRow}
              />
            ))
          )}
        </tbody>
      </Table>
    </div>
  )
}

function CustomerRow({ row: r, index, isSelected, onSelect }) {
  const total = r.total_vehicles || 1
  const bR = Math.round(((r.running_count || 0) / total) * 80)
  const bI = Math.round(((r.idle_count || 0) / total) * 80)
  const bS = Math.round(((r.stop_count || 0) / total) * 80)
  const bN = Math.max(0, 80 - bR - bI - bS)
  const synced = r.last_synced ? new Date(r.last_synced).toLocaleString() : '—'
  const color = assigneeColor(r.assigned_to)

  return (
    <Tr
      onClick={() => onSelect(isSelected ? null : r)}
      title={`Click to see ${r.company || ''} details in cards`}
      zebra={!isSelected}
      className={isSelected ? 'bg-primary-tint' : ''}
    >
      <Td className="text-text-muted">{index + 1}</Td>
      <Td className="font-semibold max-w-[200px] truncate" title={r.company || ''}>
        {r.company || '—'}
      </Td>
      <Td>
        {r.tier === 'Platinum' ? (
          <StatusBadge tone="purple">
            {TIER_ICON.Platinum} {r.tier}
          </StatusBadge>
        ) : r.tier === 'Gold' ? (
          <StatusBadge color="#f59e0b">
            {TIER_ICON.Gold} {r.tier}
          </StatusBadge>
        ) : r.tier === 'Silver' ? (
          <StatusBadge tone="neutral">
            {TIER_ICON.Silver} {r.tier}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral">—</StatusBadge>
        )}
      </Td>
      <Td className="font-bold" style={{ color: '#0a7bc4' }}>
        {(r.total_vehicles || 0).toLocaleString()}
      </Td>
      <Td className="font-semibold" style={{ color: '#10b981' }}>
        {(r.running_count || 0).toLocaleString()}
      </Td>
      <Td className="font-semibold" style={{ color: '#f59e0b' }}>
        {(r.idle_count || 0).toLocaleString()}
      </Td>
      <Td className="font-semibold" style={{ color: '#64748b' }}>
        {(r.stop_count || 0).toLocaleString()}
      </Td>
      <Td className="font-semibold" style={{ color: '#ef4444' }}>
        {(r.inactive_count || 0).toLocaleString()}
      </Td>
      <Td>
        <div className="flex h-2 w-20 overflow-hidden rounded-full bg-border">
          <div style={{ width: bR, background: '#10b981' }} />
          <div style={{ width: bI, background: '#f59e0b' }} />
          <div style={{ width: bS, background: '#64748b' }} />
          <div style={{ width: bN, background: '#ef4444' }} />
        </div>
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] max-w-[110px]">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="truncate" title={r.assigned_to || ''}>
            {r.assigned_to || '—'}
          </span>
        </span>
      </Td>
      <Td className="text-[11px] text-text-muted whitespace-nowrap">{synced}</Td>
    </Tr>
  )
}
