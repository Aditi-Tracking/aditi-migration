// Ported from old-portal/js/ims.js's _imsRenderKPIs. Real semantic colors kept (zero=red/
// low=amber/ok=green/etc.), not unified to a categorical palette — these carry actual inventory-
// health meaning, unlike Enterprise Lead's decorative city/source-mix rainbow.
//
// Approved fix, not a byte-for-byte port: production's highlight logic checks the literal clicked
// DOM element's label text, so "Total SKUs" and "Total Stock" (both filter:'all') behave
// asymmetrically — only "Total SKUs" can ever show the active ring; clicking "Total Stock" clears
// every tile's highlight and applies none. Here both simply derive `isActive` from the shared
// `filter` state, so they highlight together whenever filter==='all' — consistent, no functional
// downside, same category as the Mapping/Enterprise KPI-highlight fixes.
export default function IMSKpiGrid({ kpis, dateLabel, filter, onFilterClick }) {
  const pct = (v) => (kpis.total ? Math.round((v / kpis.total) * 100) : 0)

  const tiles = [
    { key: 'all', label: 'Total SKUs', value: kpis.total, sub: 'All inventory items', color: '#4e9af1', icon: '📦' },
    { key: 'zero', label: 'Zero Stock', value: kpis.zero, sub: `${pct(kpis.zero)}% items`, color: '#ff5c7c', icon: '🚨' },
    { key: 'low', label: 'Low Stock', value: kpis.low, sub: 'Below threshold', color: '#f0a500', icon: '⚠️' },
    { key: 'ok', label: 'Healthy Stock', value: kpis.ok, sub: `${pct(kpis.ok)}% items`, color: '#00d4aa', icon: '✅' },
    { key: 'all', label: 'Total Stock', value: kpis.totalStock.toLocaleString('en-IN'), sub: `Units on ${dateLabel}`, color: '#a78bfa', icon: '🏭' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {tiles.map((t, i) => {
        const isActive = filter === t.key
        return (
          <button
            key={i}
            type="button"
            onClick={() => onFilterClick(t.key)}
            className={`text-left rounded-xl border p-3.5 relative overflow-hidden ${isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface'}`}
          >
            <div className="text-[10.5px] uppercase tracking-wide text-text-muted font-semibold mb-2">{t.label}</div>
            <div className="text-[20px] font-extrabold leading-none mb-1" style={{ color: t.color }}>
              {t.value}
            </div>
            <div className="text-[11px] text-text-muted">{t.sub}</div>
            <div className="absolute bottom-2.5 right-3.5 text-[26px] opacity-10">{t.icon}</div>
          </button>
        )
      })}
    </div>
  )
}
