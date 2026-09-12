import { assigneeColor } from '../../../lib/crmVehicle'

const TIER_BADGE = {
  Platinum: 'bg-[#a855f722] text-[#a855f7]',
  Gold: 'bg-[#f59e0b22] text-[#f59e0b]',
  Silver: 'bg-[var(--color-text-muted)]/15 text-text-muted',
}
const TIER_ICON = { Platinum: '💎', Gold: '🥇', Silver: '🥈' }

// Ported from old-portal/js/crm.js's crmRenderTable/crmSelectRow/crmClearSelection. Clicking a row
// toggles the "selected company" KPI override (see CRMKpiCards) and shows an inline info bar above
// the search row — no separate detail modal exists in production for this module.
export default function CRMCustomerTable({ rows, search, onSearchChange, selectedRow, onSelectRow }) {
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
        <div className="text-[12px] text-text-muted">
          Showing <span className="font-bold text-text">{rows.length}</span> companies
        </div>
      </div>
      <div className="text-[11px] text-text-muted italic mb-2.5">Data syncs every 5 minutes · Click any row to see details</div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b-2 border-border">
                {['#', 'Customer Name', 'Tier', 'Total', 'Running', 'Idle', 'Stop', 'Inactive', 'Status Bar', 'Assigned To', 'Last Synced'].map(
                  (h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted whitespace-nowrap">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-text-muted">
                    No companies found
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => <CustomerRow key={`${r.company}-${r.region}-${i}`} row={r} index={i} isSelected={selectedRow === r} onSelect={onSelectRow} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
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
    <tr
      onClick={() => onSelect(isSelected ? null : r)}
      title={`Click to see ${r.company || ''} details in cards`}
      className={`border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer ${isSelected ? 'bg-primary-tint' : ''}`}
    >
      <td className="px-3 py-2.5 text-text-muted">{index + 1}</td>
      <td className="px-3 py-2.5 font-semibold max-w-[200px] truncate" title={r.company || ''}>
        {r.company || '—'}
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold ${TIER_BADGE[r.tier] || 'bg-surface-2 text-text-muted'}`}>
          {TIER_ICON[r.tier] || ''} {r.tier || '—'}
        </span>
      </td>
      <td className="px-3 py-2.5 font-bold" style={{ color: '#0a7bc4' }}>
        {(r.total_vehicles || 0).toLocaleString()}
      </td>
      <td className="px-3 py-2.5 font-semibold" style={{ color: '#10b981' }}>
        {(r.running_count || 0).toLocaleString()}
      </td>
      <td className="px-3 py-2.5 font-semibold" style={{ color: '#f59e0b' }}>
        {(r.idle_count || 0).toLocaleString()}
      </td>
      <td className="px-3 py-2.5 font-semibold" style={{ color: '#64748b' }}>
        {(r.stop_count || 0).toLocaleString()}
      </td>
      <td className="px-3 py-2.5 font-semibold" style={{ color: '#ef4444' }}>
        {(r.inactive_count || 0).toLocaleString()}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex h-2 w-20 overflow-hidden rounded-full bg-border">
          <div style={{ width: bR, background: '#10b981' }} />
          <div style={{ width: bI, background: '#f59e0b' }} />
          <div style={{ width: bS, background: '#64748b' }} />
          <div style={{ width: bN, background: '#ef4444' }} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11.5px]">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          {r.assigned_to || '—'}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[11px] text-text-muted whitespace-nowrap">{synced}</td>
    </tr>
  )
}
