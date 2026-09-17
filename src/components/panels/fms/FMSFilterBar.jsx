// Ported from old-portal/js/fms.js's fmsApplyFilters + the filters-row markup.
// Created-By is only shown for fms_view_all/override users, matching
// production's createdByEl.style.display toggle.
export default function FMSFilterBar({
  search,
  onSearchChange,
  clientType,
  onClientTypeChange,
  showCreatedBy,
  createdBy,
  onCreatedByChange,
  createdByOptions,
  location,
  onLocationChange,
  locationOptions,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onReset,
  pagination,
}) {
  const inputClass = 'bg-surface border border-border rounded-md px-3 py-1.5 text-[12.5px] text-text'

  return (
    <div className="rounded-xl border border-border bg-surface p-3 mb-3.5 flex flex-wrap gap-2.5 items-center">
      <input
        type="text"
        placeholder="🔍 Search SO, client, ticket..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className={`${inputClass} flex-1 min-w-[180px]`}
      />
      <select value={clientType} onChange={(e) => onClientTypeChange(e.target.value)} className={inputClass}>
        <option value="">All Clients</option>
        <option value="nbd">🆕 NBD Only</option>
        <option value="existing">👤 Existing Only</option>
      </select>
      {showCreatedBy && (
        <select value={createdBy} onChange={(e) => onCreatedByChange(e.target.value)} className={inputClass}>
          <option value="">All Created By</option>
          {createdByOptions.map((o) => (
            <option key={o.email} value={o.email}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      <select value={location} onChange={(e) => onLocationChange(e.target.value)} className={inputClass}>
        <option value="">All Locations</option>
        {locationOptions.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className={inputClass} />
      <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className={inputClass} />
      <button type="button" onClick={onReset} className="text-[12px] text-text-muted border border-border rounded-md px-3 py-1.5">
        Reset
      </button>
      <span className="ml-1">{pagination}</span>
    </div>
  )
}
