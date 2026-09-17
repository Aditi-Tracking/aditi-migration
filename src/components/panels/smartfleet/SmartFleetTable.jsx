import { PAGE_SIZE, repBg, repColor } from '../../../lib/smartFleet'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'
import AvatarChip from '../../shared/table/AvatarChip'
import TopPagination from '../../shared/table/TopPagination'

const COLUMNS = [
  { key: 'contact_name', label: 'Customer', sortable: true },
  { key: 'source_channel', label: 'Source', sortable: true },
  { key: null, label: 'Sales Rep', sortable: false },
  { key: null, label: 'Hero Product', sortable: false },
  { key: 'probability', label: 'Probability', sortable: true },
  { key: 'Stage', label: 'Stage', sortable: true },
  { key: null, label: 'Calls', sortable: false },
  { key: null, label: 'Demo', sortable: false },
  { key: null, label: 'Quotation', sortable: false },
  { key: 'revenue', label: 'Revenue', sortable: true, align: 'right' },
]

// Ported from old-portal/js/leads.js's lRenderTable/lSort/lGoPage/lPageList.
// Pilot migration onto the shared table system (src/components/shared/table/)
// — the only real behavior change is Revenue now being right-aligned;
// everything else (px-3.5 py-2.5 cell padding, hairline row dividers,
// bg-surface-2 header) already matched the new shared convention exactly.
export default function SmartFleetTable({ rows, page, onPageChange, sortKey, sortDir, onSort, onRowClick }) {
  const total = rows.length
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <Table title="All Leads" actions={<TopPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={onPageChange} />}>
      <TableHead>
        {COLUMNS.map((c) => (
          <Th key={c.label} align={c.align} sortable={c.sortable} sortKey={c.key} activeSortKey={sortKey} sortDir={sortDir} onSort={onSort}>
            {c.label}
          </Th>
        ))}
      </TableHead>
      <tbody>
        {!pageRows.length && (
          <tr>
            <Td colSpan={COLUMNS.length} align="center" className="py-10 text-text-muted">
              No leads found
            </Td>
          </tr>
        )}
        {pageRows.map((r, i) => (
          <LeadRow key={`${r.contact_name || r.lead_name}-${i}`} r={r} onRowClick={onRowClick} />
        ))}
      </tbody>
    </Table>
  )
}

function LeadRow({ r, onRowClick }) {
  const pr = r.probability || 0
  const prColor = pr >= 70 ? 'text-primary' : pr >= 40 ? 'text-primary' : 'text-danger'
  const prBarColor = pr >= 70 ? 'bg-primary' : pr >= 40 ? 'bg-primary/60' : 'bg-danger'
  const stage = r.Stage
  const stageLabel = stage === 'Won' ? '✓ Won' : stage === 'Lost' ? '✕ Lost' : `● ${r.PendingSubStage || 'Pending'}`
  const stageTone = stage === 'Won' ? 'primary' : stage === 'Lost' ? 'danger' : 'neutral'
  const name = r.contact_name || r.lead_name || '—'
  const rep = r.RepName || '—'

  return (
    <Tr onClick={() => onRowClick(r)}>
      <Td>
        <div className="font-semibold text-text max-w-[150px] truncate">{name}</div>
        <div className="max-w-[150px] truncate text-[11px] text-text-muted" title={r.city || ''}>
          {r.city || ''}
        </div>
      </Td>
      <Td className="max-w-[120px] truncate text-text-muted" title={r.source_channel || ''}>
        {r.source_channel || '—'}
      </Td>
      <Td>
        <div className="flex items-center gap-2">
          <AvatarChip name={rep} color={repColor(r.salesperson_email)} bg={repBg(r.salesperson_email)} />
          <span className="max-w-[110px] truncate text-text" title={rep}>
            {rep}
          </span>
        </div>
      </Td>
      <Td className="text-text-muted max-w-[140px] truncate">{r.hero_product || '—'}</Td>
      <Td>
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className={`h-full ${prBarColor}`} style={{ width: `${pr}%` }} />
          </div>
          <span className={`text-[11.5px] font-semibold ${prColor}`}>{Math.round(pr)}%</span>
        </div>
      </Td>
      <Td>
        <StatusBadge tone={stageTone}>{stageLabel}</StatusBadge>
      </Td>
      <Td className={r.calls_made === true ? 'text-primary' : 'text-text-muted'}>{r.calls_made === true ? '✓ Yes' : '✕ No'}</Td>
      <Td className={r.demo_given === true ? 'text-primary' : 'text-text-muted'}>{r.demo_given === true ? '✓ Yes' : '✕ No'}</Td>
      <Td className={r.quotation_sent === true ? 'text-primary' : 'text-text-muted'}>{r.quotation_sent === true ? '✓ Sent' : '✕ No'}</Td>
      <Td align="right" numeric className={`font-semibold ${r.effective_revenue ? 'text-text' : 'text-text-muted'}`}>
        {r.effective_revenue ? '₹' + r.effective_revenue.toLocaleString('en-IN') : '—'}
      </Td>
    </Tr>
  )
}
