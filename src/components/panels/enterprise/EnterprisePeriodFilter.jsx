import { ENTERPRISE_PERIODS } from '../../../lib/enterpriseLead'

// Sits above the KPI grid — the one filter that scopes EVERYTHING below it (KPIs, funnel, charts,
// table, Explorer dropdown options), keyed off each lead's own Entry date. Plain button group
// (not a <select>) since there are only 5 options and the active one should be visible at a
// glance, same reasoning as the KPI tiles' own always-visible active state.
export default function EnterprisePeriodFilter({ period, onChange }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[11px] font-semibold text-text-muted">Period:</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {ENTERPRISE_PERIODS.map((p) => {
          const isActive = period === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              className={`text-[12px] font-medium rounded-md px-3 py-1.5 border transition-colors ${
                isActive ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-surface text-text-muted'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
