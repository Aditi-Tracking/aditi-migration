import { filteredActivityTxns } from '../../../lib/enterpriseSolutions'

const SCOPES = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
]

const METRICS = [
  { key: 'buses', label: '🚌 Buses' },
  { key: 'license', label: '🏷️ Licenses' },
]

// Ported from old-portal/js/entsol.js's esolRenderActivity/_esolActFilteredTxns. The
// License/Buses metric toggle only shows on the CoolBus tab (ClickTask only ever has license
// deltas). Scope (Today/Month/All) is deliberately NOT reset on a tab switch — matches
// esolSwitchTab, which resets type/sort/page/search/crossFilter but leaves ESOLactScope alone.
// Scope pills and the metric toggle share one row (compaction pass) — a thin divider marks the
// seam so the two still read as separate controls despite sitting inline.
export default function EnterpriseSolutionsActivity({ tab, transactions, scope, onScopeChange, metric, onMetricChange, detailType, onToggleDetail }) {
  const isCt = tab === 'clicktask'
  const metricIsLicense = isCt || metric === 'license'
  const unit = metricIsLicense ? 'Licenses' : 'Buses'
  const nameKey = isCt ? 'customer' : 'school'
  const changeKey = metricIsLicense ? 'licenseCount' : 'buses'
  const nameHead = isCt ? 'Customer' : 'School'

  const txns = filteredActivityTxns(transactions, scope, { nameKey, changeKey })
  const added = txns.filter((t) => t._change > 0).reduce((s, t) => s + t._change, 0)
  const removed = txns.filter((t) => t._change < 0).reduce((s, t) => s + Math.abs(t._change), 0)
  const scopeLabel = { today: 'Today', month: 'This Month', all: 'All Time' }[scope]
  const detailRows = detailType ? txns.filter((t) => (detailType === 'add' ? t._change > 0 : t._change < 0)).sort((a, b) => b._date - a._date) : []

  return (
    <div className="rounded-2xl bg-white border border-[#e9ecf5] shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-3 mb-3">
      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onScopeChange(s.key)}
            className="text-[11.5px] font-semibold rounded-md px-2.5 py-1.5 border"
            style={scope === s.key ? { background: '#7c3aed', borderColor: '#7c3aed', color: '#fff' } : { background: '#f4f6fb', borderColor: '#e9ecf5', color: '#64748b' }}
          >
            {s.label}
          </button>
        ))}

        {!isCt && (
          <>
            <span className="w-px h-4 bg-[#e9ecf5] mx-0.5" aria-hidden="true" />
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onMetricChange(m.key)}
                className="text-[11.5px] font-semibold rounded-md px-2.5 py-1.5 border"
                style={metric === m.key ? { background: '#7c3aed', borderColor: '#7c3aed', color: '#fff' } : { background: '#f4f6fb', borderColor: '#e9ecf5', color: '#64748b' }}
              >
                {m.label}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onToggleDetail('add')}
          className="text-left rounded-xl border p-2"
          style={{ borderColor: detailType === 'add' ? '#7c3aed' : '#e9ecf5', boxShadow: detailType === 'add' ? '0 0 0 1.5px #7c3aed inset' : 'none' }}
        >
          <div className="w-5 h-5 rounded-lg flex items-center justify-center text-[11px] mb-0.5" style={{ background: 'rgba(0,212,170,0.14)', color: '#00d4aa' }}>
            ➕
          </div>
          <div className="text-[15px] font-extrabold text-[#111827]">{added.toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-[#8891a5]">{unit} Added</div>
        </button>
        <button
          type="button"
          onClick={() => onToggleDetail('remove')}
          className="text-left rounded-xl border p-2"
          style={{ borderColor: detailType === 'remove' ? '#7c3aed' : '#e9ecf5', boxShadow: detailType === 'remove' ? '0 0 0 1.5px #7c3aed inset' : 'none' }}
        >
          <div className="w-5 h-5 rounded-lg flex items-center justify-center text-[11px] mb-0.5" style={{ background: 'rgba(255,92,124,0.14)', color: '#ff5c7c' }}>
            ➖
          </div>
          <div className="text-[15px] font-extrabold text-[#111827]">{removed.toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-[#8891a5]">{unit} Removed</div>
        </button>
      </div>

      {detailType && (
        <div className="mt-4 border-t border-[#eef0f7] pt-3.5">
          <div className="text-[11px] font-bold text-[#8891a5] uppercase tracking-wide mb-2.5">
            {detailType === 'add' ? '➕ Added' : '➖ Removed'} — {scopeLabel}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-2.5 py-1.5 text-[10.5px] text-[#8891a5] uppercase border-b border-[#eef0f7]">Date</th>
                  <th className="text-left px-2.5 py-1.5 text-[10.5px] text-[#8891a5] uppercase border-b border-[#eef0f7]">{nameHead}</th>
                  <th className="text-right px-2.5 py-1.5 text-[10.5px] text-[#8891a5] uppercase border-b border-[#eef0f7]">Change</th>
                  <th className="text-left px-2.5 py-1.5 text-[10.5px] text-[#8891a5] uppercase border-b border-[#eef0f7]">Location</th>
                </tr>
              </thead>
              <tbody>
                {!detailRows.length ? (
                  <tr>
                    <td colSpan={4} className="text-center py-3.5 text-[13px] text-[#94a0b8]">
                      No records in this period
                    </td>
                  </tr>
                ) : (
                  detailRows.map((t, i) => (
                    <tr key={i}>
                      <td className="px-2.5 py-2 text-[12px] text-[#64748b] border-b border-[#f2f4f9]">{t.date || '—'}</td>
                      <td className="px-2.5 py-2 text-[13px] font-semibold text-[#1e293b] border-b border-[#f2f4f9]">{t._name || '—'}</td>
                      <td className="px-2.5 py-2 text-[13px] font-bold text-right border-b border-[#f2f4f9]" style={{ color: t._change > 0 ? '#00d4aa' : '#ff5c7c' }}>
                        {t._change > 0 ? '+' : ''}
                        {t._change}
                      </td>
                      <td className="px-2.5 py-2 text-[12px] text-[#64748b] border-b border-[#f2f4f9]">{t.location || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
