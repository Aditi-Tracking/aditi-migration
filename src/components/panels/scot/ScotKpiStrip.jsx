import { useEffect, useState } from 'react'
import { fetchScotSummary } from '../../../lib/scot'
import { SCOT_TILES } from './scotColumns'

// The strip above the list: one compact row of plain tiles, no card around them — how many follow-ups are active, never called yet, overdue, due today, not yet
// scheduled, how many clients were called this week (calendar week, India time) and how many were won back. A tile is a one-click filter, except
// "Called this week" (a count of clients with a call, not a state of the list). ONE request (scot_summary), counted for what the caller may see.
// Fixed height whether loading, loaded or failed, so the table below never moves. `refreshKey` changes whenever the list changes; `active` is the
// tile currently applied (its key, or null).
const TILE = 'h-[52px] rounded-lg border px-3 py-1 flex flex-col justify-between w-[124px]'

export default function ScotKpiStrip({ refreshKey, active, onPick }) {
  const [state, setState] = useState({ key: null, data: null, error: '' })
  useEffect(() => {
    if (state.key === refreshKey) return undefined
    let cancelled = false
    fetchScotSummary()
      .then((data) => !cancelled && setState({ key: refreshKey, data, error: '' }))
      .catch((e) => !cancelled && setState((s) => ({ key: refreshKey, data: s.data, error: e.message })))
    return () => {
      cancelled = true
    }
  }, [refreshKey, state.key])

  const d = state.data
  return (
    <div className="mb-3 flex flex-wrap items-stretch gap-2 min-h-[52px]" data-role="kpi-strip">
      {SCOT_TILES.map((t) => {
        const value = d ? d[t.key] : '–'
        const body = (
          <>
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted truncate">{t.label}</span>
            <span className={`text-[18px] leading-none font-extrabold tabular-nums ${t.tone || 'text-text'}`}>{value}</span>
          </>
        )
        if (!t.filters) {
          return (
            <div key={t.key} data-tile={t.key} title="Clients with at least one call logged since Monday (India time)" className={`${TILE} border-border`}>
              {body}
            </div>
          )
        }
        const on = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            data-tile={t.key}
            aria-pressed={on}
            aria-label={`${t.label}: ${d ? d[t.key] : 'loading'} — filter the list`}
            onClick={() => onPick(on ? null : t)}
            className={`${TILE} text-left bg-transparent ${on ? 'border-primary bg-primary-tint' : 'border-border hover:bg-surface-2'}`}
          >
            {body}
          </button>
        )
      })}
      <span className="self-center text-[11px] text-danger min-h-[14px]" role="status">
        {state.error}
      </span>
    </div>
  )
}
