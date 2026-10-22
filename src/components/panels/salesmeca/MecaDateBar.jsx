import Icon from '../../shared/Icon'
import { GRANULARITIES } from '../../../lib/salesMeca'

const SEG = 'h-8 px-3 text-[12.5px] font-semibold border-none'
const NAV = 'inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-transparent text-text-muted hover:bg-surface-2 hover:text-text'

// The date filter of Sales Rep MeCa: what kind of period (Month / Quarter / Year), then a navigator that steps to the previous / next one and a
// Today jump. One fixed-height row; `children` is the right-hand end of the row (the warnings link, the Set up gear).
// Props: gran, label (the current period, e.g. "October 2026"), isCurrent (the period shown already contains today), onGran(key),
//        onShift(-1 | 1), onToday()
export default function MecaDateBar({ gran, label, isCurrent, onGran, onShift, onToday, children }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 min-h-8">
      <div role="group" aria-label="Kind of period" className="inline-flex rounded-lg border border-border overflow-hidden">
        {GRANULARITIES.map((g) => (
          <button key={g.key} type="button" aria-pressed={gran === g.key} onClick={() => onGran(g.key)} className={`${SEG} ${gran === g.key ? 'bg-primary text-white' : 'bg-surface-2 text-text-muted hover:text-text'}`}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1.5">
        <button type="button" aria-label="Previous period" onClick={() => onShift(-1)} className={NAV}>
          <Icon name="chevron-left" size={16} />
        </button>
        <span data-role="period-label" className="inline-block w-[236px] text-center text-[13px] font-semibold text-text truncate" title={label}>
          {label}
        </span>
        <button type="button" aria-label="Next period" onClick={() => onShift(1)} className={NAV}>
          <Icon name="chevron-right" size={16} />
        </button>
        <button type="button" onClick={onToday} disabled={isCurrent} className="inline-flex items-center h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50">
          Today
        </button>
      </div>

      <div className="ml-auto inline-flex items-center gap-2">{children}</div>
    </div>
  )
}
