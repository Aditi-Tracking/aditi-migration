// Ported from old-portal/js/leads.js's filters-bar + lSetType/lReset.
const STAGES = [
  { key: '', label: 'All' },
  { key: 'Won', label: '✓ Won' },
  { key: 'Pending', label: '● Pending' },
  { key: 'Lost', label: '✕ Lost' },
]

export default function SmartFleetFilterBar({
  search,
  onSearchChange,
  sourceChannelOptions,
  selSourceChannel,
  onSourceChannelChange,
  teamOptions,
  selTeam,
  onTeamChange,
  repOptions,
  selRep,
  onRepChange,
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
        placeholder="Search customer, phone, email..."
        className="flex-1 min-w-[160px] rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-text outline-none"
      />
      <select
        value={selSourceChannel}
        onChange={(e) => onSourceChannelChange(e.target.value)}
        className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
      >
        <option value="">All Sources</option>
        {sourceChannelOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={selTeam}
        onChange={(e) => onTeamChange(e.target.value)}
        className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
      >
        <option value="">All Teams</option>
        {teamOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={selRep}
        onChange={(e) => onRepChange(e.target.value)}
        className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
      >
        <option value="">All Sales Rep</option>
        {repOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <span className="text-[11px] font-semibold text-text-muted">Stage:</span>
      {STAGES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onStageChange(s.key)}
          className={`text-[11.5px] font-medium rounded-md px-2.5 py-1.5 border ${
            stageFilter === s.key ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
          }`}
        >
          {s.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="text-[11.5px] font-medium text-text-muted border border-border rounded-md px-2.5 py-1.5"
      >
        ↺ Reset
      </button>
    </div>
  )
}
