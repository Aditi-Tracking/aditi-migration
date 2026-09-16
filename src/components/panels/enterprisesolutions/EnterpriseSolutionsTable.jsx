import { PAGE_SIZE, avatarFor, buildPageList } from '../../../lib/enterpriseSolutions'

// Ported from old-portal/js/entsol.js's esolRenderTable/esolGoPage. The SR NO column is
// SORTABLE (sorts the underlying array by each row's real srNo), but the DISPLAYED number is a
// recomputed page-relative position (dispSrNo = (page-1)*PAGE_SIZE + i + 1), not the row's own
// srNo value — a confirmed, real production quirk (sorting by another column still shows 1,2,3…
// in page order for this column). Ported exactly, not "fixed" to show the real srNo.
export default function EnterpriseSolutionsTable({ tab, rows, open, onToggleOpen, page, onPageChange, sortKey, sortDir, onSort, totalLicenses }) {
  const isCt = tab === 'clicktask'
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const columns = isCt
    ? [
        { key: 'srNo', label: 'SR NO', sortable: true },
        { key: 'customer', label: 'CUSTOMER', sortable: true },
        { key: '_Type', label: 'TYPE', sortable: true },
        { key: null, label: 'LOCATION', sortable: false },
        { key: 'licenseCount', label: 'LICENSES', sortable: true },
      ]
    : [
        { key: 'srNo', label: 'SR NO', sortable: true },
        { key: 'school', label: 'SCHOOL', sortable: true },
        { key: '_Type', label: 'TYPE', sortable: true },
        { key: null, label: 'LOCATION', sortable: false },
        { key: 'licenseCount', label: 'LICENSES', sortable: true },
        { key: 'buses', label: 'BUSES', sortable: true },
        { key: null, label: 'SHARE OF TOTAL', sortable: false },
      ]

  return (
    <div className="rounded-2xl bg-white border border-[#e9ecf5] shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <button type="button" onClick={onToggleOpen} className="w-full flex items-center justify-between px-4 py-3 border-b border-[#eef0f7] text-left">
        <span className="text-[13.5px] font-bold text-[#1e293b]">{isCt ? 'ClickTask Deployments' : 'CoolBus Deployments'}</span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] rounded-full bg-[#f4f6fb] text-[#64748b] px-2.5 py-1">
            {total} {isCt ? 'record' : 'school'}
            {total !== 1 ? 's' : ''}
          </span>
          <span className="text-[15px] font-bold text-[#94a0b8]">{open ? '−' : '+'}</span>
        </div>
      </button>

      {open && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="bg-[#f8f9fc]">
                  {columns.map((c) => (
                    <th
                      key={c.label}
                      onClick={() => c.sortable && onSort(c.key)}
                      className={`text-left px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-[#8891a5] whitespace-nowrap border-b border-[#eef0f7] ${c.sortable ? 'cursor-pointer' : ''}`}
                    >
                      {c.label}
                      {c.sortable && sortKey === c.key ? (sortDir === 1 ? ' ↑' : ' ↓') : c.sortable ? ' ↕' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!pageRows.length ? (
                  <tr>
                    <td colSpan={columns.length} className="text-center py-9 text-[#94a0b8]">
                      No records found
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r, i) => {
                    const dispSrNo = (page - 1) * PAGE_SIZE + i + 1
                    const name = isCt ? r.customer : r.school
                    const av = avatarFor(name)
                    const badgeStyle = r._Type === 'Trial' ? { background: 'rgba(240,165,0,0.14)', color: '#f0a500' } : { background: 'rgba(0,212,170,0.14)', color: '#00d4aa' }
                    const sharePct = !isCt && totalLicenses ? ((r.licenseCount || 0) / totalLicenses) * 100 : 0
                    return (
                      <tr key={`${name}-${i}`} className="even:bg-[#fafbff] border-b border-[#f2f4f9] last:border-0">
                        <td className="px-3.5 py-2.5 text-[#94a0b8] tabular-nums">{dispSrNo}</td>
                        <td className="px-3.5 py-2.5 font-semibold max-w-[220px] truncate" title={name || ''}>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white mr-2" style={{ background: av.color }}>
                            {av.initial}
                          </span>
                          {name || '—'}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold" style={badgeStyle}>
                            {r._Type}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-[#334155] max-w-[180px] truncate" title={r.location || ''}>
                          {r.location || '—'}
                        </td>
                        <td className="px-3.5 py-2.5 font-bold tabular-nums" style={{ color: '#6d28d9' }}>
                          {(r.licenseCount || 0).toLocaleString('en-IN')}
                        </td>
                        {!isCt && (
                          <>
                            <td className="px-3.5 py-2.5 font-bold tabular-nums" style={{ color: '#f97316' }}>
                              {(r.buses || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-[#eef0f7] overflow-hidden max-w-[70px]">
                                  <div className="h-full rounded-full bg-[#7c3aed]" style={{ width: `${sharePct.toFixed(1)}%` }} />
                                </div>
                                <span className="text-[11.5px] text-[#94a0b8] tabular-nums">{sharePct.toFixed(1)}%</span>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 px-4 py-3 border-t border-[#eef0f7] flex-wrap">
              <span className="text-[11px] text-[#94a0b8] mr-2">
                Page {page} of {totalPages}
              </span>
              <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} className="text-[11.5px] rounded-md border border-[#e9ecf5] bg-[#f4f6fb] text-[#64748b] px-2.5 py-1 disabled:opacity-40">
                ‹
              </button>
              {buildPageList(page, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`e${i}`} className="text-[#94a0b8] px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPageChange(p)}
                    className="text-[11.5px] rounded-md border px-2.5 py-1"
                    style={p === page ? { background: '#7c3aed', borderColor: '#7c3aed', color: '#fff' } : { borderColor: '#e9ecf5', background: '#f4f6fb', color: '#64748b' }}
                  >
                    {p}
                  </button>
                )
              )}
              <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="text-[11.5px] rounded-md border border-[#e9ecf5] bg-[#f4f6fb] text-[#64748b] px-2.5 py-1 disabled:opacity-40">
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
