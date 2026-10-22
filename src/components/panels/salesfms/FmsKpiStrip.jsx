import { useEffect, useState } from 'react'
import { fmtAvgTime, fmtHours } from '../../../lib/fmsFormat'
import { STAGES, fetchSalesFmsSummary } from '../../../lib/salesFms'

// The strip above the list: one compact row of plain tiles, no card around them. Six STATE tiles (how many leads are in each state — a tile is a
// one-click filter) and four STAGE tiles (the average time each stage takes: "1.2d", or hours under a day). A stage tile turns red when its average is
// over the stage's limit (Demo 48h, Quotation 48h, Negotiation 72h — see STAGES in lib/salesFms.js); the average delay against plan is in its tooltip.
// ONE request (sales_fms_summary). Fixed height whether loading, loaded or failed, so the table below never moves. `refreshKey` changes whenever the
// list changes (a save, a close, another tab's write); `active` is the state filter currently applied.
const TILES = [
  { key: 'total', label: 'In pipeline', filter: null },
  { key: 'overdue', label: 'Overdue', filter: 'overdue', tone: 'text-danger' },
  { key: 'not_scheduled', label: 'Not scheduled', filter: 'not_scheduled', tone: 'text-[#B77900]' },
  { key: 'on_track', label: 'On track', filter: 'on_track', tone: 'text-primary' },
  { key: 'won', label: 'Won', filter: 'closed_won', tone: 'text-[#16A34A]' },
  { key: 'lost', label: 'Lost', filter: 'closed_lost', tone: 'text-text-muted' },
]
const TILE = 'h-[52px] rounded-lg border px-3 py-1 flex flex-col justify-between'
const num = (v) => (v === null || v === undefined ? null : Number(v))
const signed = (h) => (h === null ? '—' : `${h > 0 ? '+' : h < 0 ? '−' : ''}${fmtHours(h)}`)
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`

export default function FmsKpiStrip({ refreshKey, active, onPick }) {
  const [state, setState] = useState({ key: null, data: null, error: '' })
  useEffect(() => {
    if (state.key === refreshKey) return undefined
    let cancelled = false
    fetchSalesFmsSummary()
      .then((data) => !cancelled && setState({ key: refreshKey, data, error: '' }))
      .catch((e) => !cancelled && setState((s) => ({ key: refreshKey, data: s.data, error: e.message })))
    return () => {
      cancelled = true
    }
  }, [refreshKey, state.key])

  const counts = state.data?.counts
  const stages = state.data?.stages
  const picked = active?.length === 1 ? active[0] : null

  return (
    <div className="mb-3 flex flex-wrap items-stretch gap-2 min-h-[52px]" data-role="kpi-strip">
      {TILES.map((t) => {
        const on = t.filter ? picked === t.filter : !active?.length
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            aria-label={`${t.label}: ${counts ? counts[t.key] : 'loading'}${t.filter ? ' — filter the list' : ' — show all'}`}
            onClick={() => onPick(t.filter)}
            className={`${TILE} w-[104px] text-left bg-transparent ${on ? 'border-primary bg-primary-tint' : 'border-border hover:bg-surface-2'}`}
          >
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted truncate">{t.label}</span>
            <span className={`text-[18px] leading-none font-extrabold tabular-nums ${t.tone || 'text-text'}`}>{counts ? counts[t.key] : '–'}</span>
          </button>
        )
      })}
      <span className="w-px self-stretch bg-border mx-1" aria-hidden="true" />
      {STAGES.map((s, i) => {
        const st = stages?.[i]
        const cycle = num(st?.avg_cycle_h)
        const delay = num(st?.avg_delay_h)
        const over = s.slaHours && cycle !== null && cycle > s.slaHours
        const tip = [
          `${s.label} — average time taken ${cycle === null ? 'not yet known' : `${fmtHours(cycle)} over ${plural(st?.cycle_n ?? 0, 'lead')}`}`,
          `average delay against plan ${signed(delay)} over ${plural(st?.delay_n ?? 0, 'lead')}`,
          s.slaHours ? `limit ${s.slaHours}h${over ? ' — over the limit' : ''}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <div key={s.key} data-stage={s.key} title={tip} className={`${TILE} w-[112px] ${over ? 'border-danger bg-danger-tint' : 'border-border'}`}>
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted truncate">{s.label}</span>
            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className={`text-[18px] leading-none font-extrabold tabular-nums ${over ? 'text-danger' : 'text-text'}`} data-role="avg">
                {cycle === null ? '—' : fmtAvgTime(cycle)}
              </span>
              <span className="text-[10.5px] text-text-muted">avg</span>
            </span>
          </div>
        )
      })}
      <span className="self-center text-[11px] text-danger min-h-[14px]" role="status">
        {state.error}
      </span>
    </div>
  )
}
