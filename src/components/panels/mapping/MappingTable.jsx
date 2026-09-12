import MappingOdooCell from './MappingOdooCell'

const TIER_BADGE = {
  Platinum: 'bg-[#a855f722] text-[#a855f7]',
  Gold: 'bg-[#f59e0b22] text-[#f59e0b]',
  Silver: 'bg-[var(--color-text-muted)]/15 text-text-muted',
}

// Ported from old-portal/js/mapping.js's mpRenderTable. canEdit gates whether the Odoo Customer
// cell is the live-search inline editor (MappingOdooCell) or plain read-only text.
export default function MappingTable({ rows, canEdit, callerEmail, onRowSaved }) {
  return (
    // Note: for rows near the bottom, MappingOdooCell's dropdown can get visually clipped by this
    // scroll container — a real, pre-existing limitation of production's own
    // `.mp-table-wrap{overflow-x:auto}` CSS (no `overflow-y:visible` override there either), not
    // something introduced by this port. Not worth a portal-based fix production itself doesn't have.
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-border">
              {['#', 'GPS Company Name', 'Region', 'Tier', 'Vehicles', 'Odoo Customer', 'Status'].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-text-muted">
                  No customers found.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.gps_alias_id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 text-text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5 font-semibold max-w-[180px] truncate" title={r.gps_name}>{r.gps_name}</td>
                  <td className="px-3 py-2.5 text-text-muted">{r.region || '—'}</td>
                  <td className="px-3 py-2.5">
                    {r.tier ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold ${TIER_BADGE[r.tier] || 'bg-surface-2 text-text-muted'}`}>
                        {r.tier}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: '#10b981' }}>{r.total_vehicles || 0}</td>
                  <td className="px-3 py-2.5 min-w-[200px]">
                    {canEdit ? (
                      <MappingOdooCell row={r} callerEmail={callerEmail} onSaved={onRowSaved} />
                    ) : (
                      <span className={r.canonical_name ? 'text-text' : 'text-text-muted italic'}>{r.canonical_name || 'Not mapped'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.is_mapped ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#10b98122] text-[#10b981]">✅ Mapped</span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ef444422] text-[#ef4444]">❌ Unmapped</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
