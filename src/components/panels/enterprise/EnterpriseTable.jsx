import { PAGE_SIZE } from '../../../lib/smartFleet'
import { enterpriseStageColor } from '../../../lib/enterpriseLead'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'
import TopPagination from '../../shared/table/TopPagination'

// Columns + sortability ported from enRenderTable's `heads` — only Date/Name/Stage/Calls/Revenue
// are sortable, matching production's `s:true` flags exactly (City/Phone/Source/Product/Owner stay
// unsortable).
const COLUMNS = [
  { key: 'EntryTs', label: 'Date', sortable: true },
  { key: 'Name', label: 'Lead Name', sortable: true },
  { key: null, label: 'City', sortable: false },
  { key: null, label: 'Phone', sortable: false },
  { key: null, label: 'Source', sortable: false },
  { key: null, label: 'Product', sortable: false },
  { key: null, label: 'Owner', sortable: false },
  { key: 'CurrentStage', label: 'Stage', sortable: true },
  { key: 'CallsMade', label: 'Calls', sortable: true },
  { key: 'Revenue', label: 'Revenue', sortable: true },
]

// Ported from old-portal/js/enterprise.js's enRenderTable/enToggleTable/enGoPage/enPagerHTML.
// Collapsible via `open`/`onToggleOpen`, sortable/paginated exactly as production. The
// collapsible header (title + lead count + +/− toggle) stays custom, outside the shared Table —
// it's panel-level chrome, not table structure, same as how CRMCustomerTable's own search/count
// row sits outside a bare Table. No detail modal exists for this table (confirmed, no onClick
// anywhere) — Lead Name's existing truncation gains the title tooltip it was missing (a real gap:
// it truncated with no way to see the full value at all); City/Phone/Source/Product/Owner stay
// untruncated, short bounded categorical values unlike Task Delegation's freeform Title/Note.
// Stage badge uses StatusBadge's color escape hatch uniformly for every stage — enterpriseStageColor
// always returns a literal hex, and "demo"'s #f0a500 happens to be byte-identical to the warning
// tone's own definition anyway, so branching onto tone="warning" would render identically with more
// code. No zebra escape hatch needed — no highlight state, no interleaved rows, no selection.
export default function EnterpriseTable({ rows, open, onToggleOpen, page, onPageChange, sortKey, sortDir, onSort }) {
  const total = rows.length
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="w-full flex items-center justify-between px-4 py-3 border-b border-border">
        <button type="button" onClick={onToggleOpen} className="flex items-center gap-3 text-left flex-1">
          <span className="text-[13px] font-semibold text-text">Lead Explorer</span>
          <span className="text-[14px] text-text-muted">{open ? '−' : '+'}</span>
        </button>
        {open && <TopPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={onPageChange} />}
      </div>

      {open && (
        <Table>
          <TableHead>
            {COLUMNS.map((c) => (
              <Th key={c.label} sortable={c.sortable} sortKey={c.key} activeSortKey={sortKey} sortDir={sortDir} onSort={onSort}>
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
              <LeadRow key={`${r.Name}-${r.SrNo}-${i}`} r={r} />
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

function LeadRow({ r }) {
  const col = enterpriseStageColor(r.CurrentStage)
  return (
    <Tr>
      <Td className="text-text-muted whitespace-nowrap">{r.EntryRaw || '—'}</Td>
      <Td className="font-semibold text-text max-w-[170px] truncate" title={r.Name || ''}>
        {r.Name || '—'}
      </Td>
      <Td className="text-text-muted">{r.City || '—'}</Td>
      <Td className="text-text-muted">{r.Phone || '—'}</Td>
      <Td className="text-text-muted">{r.Source}</Td>
      <Td className="text-text-muted">{r.Product}</Td>
      <Td className="text-text-muted">{r.Owner}</Td>
      <Td>
        <StatusBadge color={col}>{r.CurrentStage}</StatusBadge>
      </Td>
      <Td align="center">{r.CallsMade}</Td>
      <Td className="font-semibold text-primary">{r.Revenue ? '₹' + r.Revenue.toLocaleString('en-IN') : '—'}</Td>
    </Tr>
  )
}
