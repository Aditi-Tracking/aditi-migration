import { PAGE_SIZE, buildPageList, repBg, repColor } from '../../../lib/smartFleet'

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
  { key: 'revenue', label: 'Revenue', sortable: true },
]

// Ported from old-portal/js/leads.js's lRenderTable/lSort/lGoPage/lPageList.
export default function SmartFleetTable({ rows, page, onPageChange, sortKey, sortDir, onSort }) {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold text-text">All Leads</span>
        <span className="text-[11.5px] text-text-muted">
          {total} lead{total !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  onClick={() => c.sortable && onSort(c.key)}
                  className={`text-left font-semibold text-text-muted uppercase text-[10px] tracking-wide px-3.5 py-2.5 whitespace-nowrap ${
                    c.sortable ? 'cursor-pointer' : ''
                  }`}
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
              <LeadRow key={`${r.contact_name || r.lead_name}-${i}`} r={r} />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 px-4 py-3 border-t border-border flex-wrap">
          <span className="text-[11px] text-text-muted mr-2">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="text-[11.5px] rounded-md border border-border bg-surface-2 text-text px-2.5 py-1 disabled:opacity-40"
          >
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
                className={`text-[11.5px] rounded-md border px-2.5 py-1 ${
                  p === page ? 'bg-primary text-white border-primary' : 'border-border bg-surface-2 text-text'
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="text-[11.5px] rounded-md border border-border bg-surface-2 text-text px-2.5 py-1 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}

function LeadRow({ r }) {
  const pr = r.probability || 0
  const prColor = pr >= 70 ? 'text-primary' : pr >= 40 ? 'text-primary' : 'text-danger'
  const prBarColor = pr >= 70 ? 'bg-primary' : pr >= 40 ? 'bg-primary/60' : 'bg-danger'
  const stage = r.Stage
  const stageLabel = stage === 'Won' ? '✓ Won' : stage === 'Lost' ? '✕ Lost' : `● ${r.PendingSubStage || 'Pending'}`
  const stageClass =
    stage === 'Won'
      ? 'bg-primary-tint text-primary border-primary/20'
      : stage === 'Lost'
        ? 'bg-danger-tint text-danger border-danger/20'
        : 'bg-surface-2 text-text-muted border-border'
  const name = r.contact_name || r.lead_name || '—'
  const rep = r.RepName || '—'

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2.5">
        <div className="font-semibold text-text max-w-[150px] truncate">{name}</div>
        <div className="text-[11px] text-text-muted">{r.city || ''}</div>
      </td>
      <td className="px-3.5 py-2.5 text-text-muted">{r.source_channel || '—'}</td>
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{ background: repBg(r.salesperson_email), color: repColor(r.salesperson_email) }}
          >
            {rep[0]?.toUpperCase()}
          </span>
          <span className="text-text">{rep}</span>
        </div>
      </td>
      <td className="px-3.5 py-2.5 text-text-muted max-w-[140px] truncate">{r.hero_product || '—'}</td>
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className={`h-full ${prBarColor}`} style={{ width: `${pr}%` }} />
          </div>
          <span className={`text-[11.5px] font-semibold ${prColor}`}>{Math.round(pr)}%</span>
        </div>
      </td>
      <td className="px-3.5 py-2.5">
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${stageClass}`}>
          {stageLabel}
        </span>
      </td>
      <td className={`px-3.5 py-2.5 ${r.calls_made === true ? 'text-primary' : 'text-text-muted'}`}>
        {r.calls_made === true ? '✓ Yes' : '✕ No'}
      </td>
      <td className={`px-3.5 py-2.5 ${r.demo_given === true ? 'text-primary' : 'text-text-muted'}`}>
        {r.demo_given === true ? '✓ Yes' : '✕ No'}
      </td>
      <td className={`px-3.5 py-2.5 ${r.quotation_sent === true ? 'text-primary' : 'text-text-muted'}`}>
        {r.quotation_sent === true ? '✓ Sent' : '✕ No'}
      </td>
      <td className={`px-3.5 py-2.5 font-semibold ${r.effective_revenue ? 'text-text' : 'text-text-muted'}`}>
        {r.effective_revenue ? '₹' + r.effective_revenue.toLocaleString('en-IN') : '—'}
      </td>
    </tr>
  )
}
