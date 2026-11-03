import { RANGE_OPTIONS } from '../../../lib/salesMeca'

const SEG = 'h-8 px-3 text-[12.5px] font-semibold border-none'
const DATE = 'h-8 w-[150px] rounded-lg border border-border bg-surface-2 px-2 text-[12.5px] text-text outline-none focus:border-primary'

// The date filter of Sales Rep MeCa: ONE single-select control shared by the whole tab (every number — meetings, clients, turnover, the target, the
// Company total and every rep's row — answers the same range). This Week · Previous Week · This Month · Last Month · Last 3 Months · Custom (a start and an
// end date, both included). The range the choice means today is spelled out beside it, so nobody has to work out which days "This Week" is.
// One fixed-height row: the range text and the custom-date message have reserved room, so choosing an option never moves the table below.
// Props: value { key, from, to }, onChange(value), range (what lib/salesMeca.js rangeFor resolved: { label, error }), children (the right-hand end of the row:
// the warnings link, the Set up gear).
export default function MecaRangeFilter({ value, onChange, range, children }) {
  const custom = value.key === 'custom'
  return (
    <div className="mb-3" data-role="range-filter">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-8">
        <div role="group" aria-label="Date range" className="inline-flex flex-wrap rounded-lg border border-border overflow-hidden">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              data-range={o.key}
              aria-pressed={value.key === o.key}
              onClick={() => onChange({ ...value, key: o.key })}
              className={`${SEG} ${value.key === o.key ? 'bg-primary text-white' : 'bg-surface-2 text-text-muted hover:bg-surface hover:text-text'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {custom && (
          <div className="inline-flex items-center gap-2" data-role="custom-dates">
            <label className="text-[11.5px] text-text-muted inline-flex items-center gap-1.5">
              From
              <input type="date" className={DATE} value={value.from} aria-label="From date" onChange={(e) => onChange({ ...value, from: e.target.value })} />
            </label>
            <label className="text-[11.5px] text-text-muted inline-flex items-center gap-1.5">
              To
              <input type="date" className={DATE} value={value.to} aria-label="To date" min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
            </label>
          </div>
        )}
        <div className="ml-auto inline-flex items-center gap-2">{children}</div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 min-h-[18px]">
        <span data-role="period-label" className="text-[13px] font-semibold text-text">
          {range.label}
        </span>
        {range.error && (
          <span role="alert" data-role="range-error" className="text-[12px] text-danger">
            {range.error}
          </span>
        )}
      </div>
    </div>
  )
}
