import { PAGE_SIZE, buildPageList } from '../../../lib/smartFleet'
import { enterpriseStageColor } from '../../../lib/enterpriseLead'

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
// Collapsible via `open`/`onToggleOpen`, sortable/paginated exactly as production.
export default function EnterpriseTable({ rows, open, onToggleOpen, page, onPageChange, sortKey, sortDir, onSort }) {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <button type="button" onClick={onToggleOpen} className="w-full flex items-center justify-between px-4 py-3 border-b border-border text-left">
        <span className="text-[13px] font-semibold text-text">Lead Explorer</span>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-text-muted">
            {total} lead{total !== 1 ? 's' : ''}
          </span>
          <span className="text-[14px] text-text-muted">{open ? '−' : '+'}</span>
        </div>
      </button>

      {open && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  {COLUMNS.map((c) => (
                    <th
                      key={c.label}
                      onClick={() => c.sortable && onSort(c.key)}
                      className={`text-left font-semibold text-text-muted uppercase text-[10px] tracking-wide px-3.5 py-2.5 whitespace-nowrap ${c.sortable ? 'cursor-pointer' : ''}`}
                    >
                      {c.label}
                      {c.sortable && sortKey === c.key ? (sortDir === 1 ? ' ↑' : ' ↓') : c.sortable ? ' ↕' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!pageRows.length && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="text-center py-10 text-text-muted">
                      No leads found
                    </td>
                  </tr>
                )}
                {pageRows.map((r, i) => (
                  <LeadRow key={`${r.Name}-${r.SrNo}-${i}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 px-4 py-3 border-t border-border flex-wrap">
              <span className="text-[11px] text-text-muted mr-2">
                Page {page} of {totalPages}
              </span>
              <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} className="text-[11.5px] rounded-md border border-border bg-surface-2 text-text px-2.5 py-1 disabled:opacity-40">
                ‹
              </button>
              {buildPageList(page, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`e${i}`} className="text-text-muted px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPageChange(p)}
                    className={`text-[11.5px] rounded-md border px-2.5 py-1 ${p === page ? 'bg-primary text-white border-primary' : 'border-border bg-surface-2 text-text'}`}
                  >
                    {p}
                  </button>
                )
              )}
              <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="text-[11.5px] rounded-md border border-border bg-surface-2 text-text px-2.5 py-1 disabled:opacity-40">
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LeadRow({ r }) {
  const col = enterpriseStageColor(r.CurrentStage)
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2.5 text-text-muted whitespace-nowrap">{r.EntryRaw || '—'}</td>
      <td className="px-3.5 py-2.5 font-semibold text-text max-w-[170px] truncate">{r.Name || '—'}</td>
      <td className="px-3.5 py-2.5 text-text-muted">{r.City || '—'}</td>
      <td className="px-3.5 py-2.5 text-text-muted">{r.Phone || '—'}</td>
      <td className="px-3.5 py-2.5 text-text-muted">{r.Source}</td>
      <td className="px-3.5 py-2.5 text-text-muted">{r.Product}</td>
      <td className="px-3.5 py-2.5 text-text-muted">{r.Owner}</td>
      <td className="px-3.5 py-2.5">
        <span className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: col + '22', color: col }}>
          {r.CurrentStage}
        </span>
      </td>
      <td className="px-3.5 py-2.5 text-center">{r.CallsMade}</td>
      <td className="px-3.5 py-2.5 font-semibold text-primary">{r.Revenue ? '₹' + r.Revenue.toLocaleString('en-IN') : '—'}</td>
    </tr>
  )
}
