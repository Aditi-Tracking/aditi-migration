// Ported from old-portal/js/enterprise.js's filter bar + enReset. State/prop names are
// `cityFilter`/`ownerFilter`/`stageFilter` — deliberately NOT `sourceFilter`, so this doesn't
// inherit production's `enFSource`-is-actually-the-city-filter naming trap (confirmed: enFSource
// is populated with cities, "All Cities" placeholder — nothing to do with lead source).
export default function EnterpriseFilterBar({
  search,
  onSearchChange,
  cityOptions,
  cityFilter,
  onCityChange,
  ownerOptions,
  ownerFilter,
  onOwnerChange,
  stageOptions,
  stageFilter,
  onStageChange,
  onReset,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 mb-4">
      <span className="text-[11px] font-semibold text-text-muted">Filter:</span>
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search name, city, phone, owner..."
        className="flex-1 min-w-[160px] rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-text outline-none"
      />
      <select value={cityFilter} onChange={(e) => onCityChange(e.target.value)} className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none">
        <option value="">All Cities</option>
        {cityOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select value={ownerFilter} onChange={(e) => onOwnerChange(e.target.value)} className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none">
        <option value="">All Owners</option>
        {ownerOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select value={stageFilter} onChange={(e) => onStageChange(e.target.value)} className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none">
        <option value="">All Stages</option>
        {stageOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button type="button" onClick={onReset} className="text-[11.5px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5">
        Reset
      </button>
    </div>
  )
}
