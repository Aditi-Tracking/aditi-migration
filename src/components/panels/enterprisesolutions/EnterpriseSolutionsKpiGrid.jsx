// Ported from old-portal/js/entsol.js's esolRenderKPIs/esolKpiClick. Every tile is clickable —
// unlike SmartFleet/Enterprise Lead/IMS, none of ESOL's KPI tiles are purely informational. Each
// carries one of 3 distinct action types: 'filter' (toggles a cross-filter field), 'clear'
// (resets everything), or 'sort' (CoolBus's "Total Buses" tile SORTS the table by buses — it does
// not filter). MTD's colored net value and Total Buses' colored "+N added" are real JSX spans
// here, not innerHTML strings like production.
export default function EnterpriseSolutionsKpiGrid({ tab, data, mtd, crossFilter, sortKey, onFilterClick, onClearClick, onKpiSortClick }) {
  const netColor = (n) => (n > 0 ? '#00d4aa' : n < 0 ? '#ff5c7c' : '#64748b')
  const netText = (n) => (n > 0 ? '+' : '') + n

  let tiles
  if (tab === 'clicktask') {
    const d = data.clicktask
    const avg = d.totalCustomers ? (d.totalCustomerLicenses / d.totalCustomers).toFixed(1) : '—'
    const licNet = mtd.lic.added - mtd.lic.removed
    tiles = [
      { label: 'Total Customers', value: d.totalCustomers || 0, sub: 'Active license holders', accent: '#00d4aa', icon: '👥', act: { type: 'filter', key: 'type', val: 'Customer' } },
      { label: 'Total Licenses', value: (d.totalCustomerLicenses || 0).toLocaleString('en-IN'), sub: 'Across all customers', accent: '#f0a500', icon: '🏷️', act: { type: 'clear' } },
      { label: 'Trial Customers', value: d.totalTrialCustomers || 0, sub: `${d.totalTrialLicenses || 0} trial licenses`, accent: '#a78bfa', icon: '⏱️', act: { type: 'filter', key: 'type', val: 'Trial' } },
      { label: 'Avg Licenses / Customer', value: avg, sub: 'Mean deployment size', accent: '#4e9af1', icon: '📊', act: { type: 'clear' } },
      { label: 'MTD Activity', value: <span style={{ color: netColor(licNet) }}>{netText(licNet)}</span>, sub: 'Net licenses this month', accent: '#ff5c7c', icon: '📈', act: { type: 'clear' } },
    ]
  } else {
    const d = data.coolbus
    const avg = d.totalSchools ? (d.totalSchoolLicenses / d.totalSchools).toFixed(1) : '—'
    const licNet = mtd.lic.added - mtd.lic.removed
    tiles = [
      { label: 'Total Schools', value: d.totalSchools || 0, sub: 'Active deployments', accent: '#4e9af1', icon: '🏢', act: { type: 'filter', key: 'type', val: 'Customer' } },
      { label: 'Total Licenses', value: (d.totalSchoolLicenses || 0).toLocaleString('en-IN'), sub: 'Across all schools', accent: '#00d4aa', icon: '🏷️', act: { type: 'clear' } },
      { label: 'Trial Schools', value: d.totalTrialSchools || 0, sub: `${d.totalTrialLicenses || 0} trial licenses`, accent: '#a78bfa', icon: '⏱️', act: { type: 'filter', key: 'type', val: 'Trial' } },
      {
        label: 'Total Buses',
        value: (d.totalSchoolBuses || 0).toLocaleString('en-IN'),
        sub: (
          <>
            <span style={{ color: '#00d4aa', fontWeight: 700, fontSize: '1.3em' }}>+{mtd.bus.added}</span> added this month
          </>
        ),
        accent: '#f97316',
        icon: '🚌',
        act: { type: 'sort', key: 'buses' },
      },
      { label: 'Avg Licenses / School', value: avg, sub: 'Mean deployment size', accent: '#f0a500', icon: '📊', act: { type: 'clear' } },
      { label: 'MTD Activity', value: <span style={{ color: netColor(licNet) }}>{netText(licNet)}</span>, sub: 'Net licenses this month', accent: '#ff5c7c', icon: '📈', act: { type: 'clear' } },
    ]
  }

  function handleClick(act) {
    if (act.type === 'filter') onFilterClick(act.key, act.val)
    else if (act.type === 'clear') onClearClick()
    else if (act.type === 'sort') onKpiSortClick(act.key)
  }

  const gridColsClass = tab === 'clicktask' ? 'lg:grid-cols-5' : 'lg:grid-cols-6'

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${gridColsClass} gap-3 mb-4`}>
      {tiles.map((t, i) => {
        const active = t.act.type === 'filter' ? crossFilter[t.act.key] === t.act.val : t.act.type === 'sort' ? sortKey === t.act.key : false
        return (
          <button
            key={i}
            type="button"
            onClick={() => handleClick(t.act)}
            className="text-left rounded-2xl border bg-white p-3.5"
            style={{ borderColor: active ? t.accent : '#e9ecf5', boxShadow: active ? `0 0 0 2px ${t.accent} inset` : '0 1px 2px rgba(15,23,42,0.04)' }}
          >
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] mb-2" style={{ background: t.accent + '1f', color: t.accent }}>
              {t.icon}
            </span>
            <div className="text-[10.5px] font-bold text-[#8891a5]">{t.label}</div>
            <div className="text-[19px] font-extrabold text-[#111827] mt-0.5">{t.value}</div>
            <div className="text-[11px] text-[#94a0b8] mt-0.5">{t.sub}</div>
          </button>
        )
      })}
    </div>
  )
}
