// Same inline filter-row pattern as Field Service Dashboard's DashboardFilterBar.jsx. Every
// control gets a fixed width — a plain <select>/<input> otherwise auto-sizes to its currently
// selected text ("Pick a month first" vs "All Weeks" vs "Week 4 (21 Sep – 26 Sep)" are wildly
// different lengths), and since this row is right-aligned (justify-end), that resize shifts the
// whole row's left edge — the entire filter bar visibly jumps sideways on every selection.
export default function CollectionsFilterBar({ filters, months, weekOptions, locations, names, onChange, onClear }) {
  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      <select
        value={filters.month}
        // Week number is only meaningful for a chosen month — clear it whenever the month
        // itself changes, so a stale "Week 4" from a longer month can't silently misapply.
        onChange={(e) => onChange({ month: e.target.value, week: '' })}
        className="w-[120px] px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
      >
        <option value="">All Months</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={filters.week}
        onChange={(e) => onChange({ week: e.target.value })}
        disabled={!filters.month}
        title={filters.month ? undefined : 'Pick a month first'}
        className="w-[210px] px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px] disabled:opacity-50"
      >
        {/* Only enabled once a Month is picked (a week number means nothing without one) — the
            option text itself says so, since a merely-greyed-out "All Weeks" looks identical to
            a real, clickable option and gives no hint about why it won't open. */}
        <option value="">{filters.month ? 'All Weeks' : 'Pick a month first'}</option>
        {weekOptions.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        title="Filter to a single day"
        value={filters.date}
        onChange={(e) => onChange({ date: e.target.value })}
        className="w-[150px] px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
      />
      <select
        value={filters.location}
        onChange={(e) => onChange({ location: e.target.value })}
        className="w-[140px] px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
      >
        <option value="">All Locations</option>
        {locations.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <select
        value={filters.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="w-[140px] px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
      >
        <option value="">All Employees</option>
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button type="button" onClick={onClear} className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-text-muted text-[12px] font-semibold">
        Clear
      </button>
    </div>
  )
}
