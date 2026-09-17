import { JOB_TYPE_CONFIG } from '../../../../lib/fieldService'

const PRESETS = [
  ['yesterday', 'Yesterday'],
  ['7d', 'Last 7 Days'],
  ['30d', 'Last 30 Days'],
  ['3m', 'Last 3 Months'],
  ['6m', 'Last 6 Months'],
  ['alltime', 'All Time'],
  ['custom', 'Custom'],
]

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderFilters/_fsdOnPresetChange. Now
// rendered inline on the tab-selector row (matching production's #fsdInlineFilters placement) —
// an earlier session's deliberate two-row split is reversed here, per explicit instruction. No
// margin-bottom of its own anymore: as a flex child sharing FieldServicePanel's tab row, its
// vertical spacing comes from that row's own mb-4, not from here.
export default function DashboardFilterBar({ preset, customFrom, customTo, jobType, engineerId, engineerOptions, viewAll, onChange, onClear }) {
  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      <select
        value={preset}
        onChange={(e) => onChange({ preset: e.target.value })}
        className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
      >
        {PRESETS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {preset === 'custom' && (
        <>
          <input
            type="date"
            title="From date"
            value={customFrom}
            onChange={(e) => onChange({ customFrom: e.target.value })}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
          />
          <input
            type="date"
            title="To date"
            value={customTo}
            onChange={(e) => onChange({ customTo: e.target.value })}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
          />
        </>
      )}
      <select
        value={jobType}
        onChange={(e) => onChange({ jobType: e.target.value })}
        className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
      >
        <option value="">All Job Types</option>
        {Object.entries(JOB_TYPE_CONFIG).map(([k, c]) => (
          <option key={k} value={k}>
            {c.label}
          </option>
        ))}
      </select>
      {viewAll && (
        <select
          value={engineerId}
          onChange={(e) => onChange({ engineerId: e.target.value })}
          className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-text text-[12px]"
        >
          <option value="">All Engineers</option>
          {engineerOptions.map((en) => (
            <option key={en.engineer_id} value={en.engineer_id}>
              {en.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={onClear} className="px-3 py-1.5 rounded-lg border border-border text-text-muted text-[12px] font-semibold">
        Clear
      </button>
    </div>
  )
}
