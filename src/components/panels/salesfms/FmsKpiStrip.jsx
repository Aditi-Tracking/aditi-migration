import { useEffect, useState } from 'react'
import { fmtAvgTime, fmtHours } from '../../../lib/fmsFormat'
import { OPEN_STATES, STAGES, fetchSalesFmsSummary } from '../../../lib/salesFms'

// The strip above the list: one compact row of plain tiles, no card around them. Six COUNT tiles — In pipeline (open leads only), Overdue, Demo and Quotation
// (the open leads currently at that stage), Won and Lost — then three STAGE tiles (the average time First Call, Demo Booked and Quotation take: "1.2d", or
// hours under a day; Negotiation has no average tile). A count tile is a one-click filter and sets the table's own filters, exactly like the column filters:
// In pipeline / Overdue / Won / Lost set the State filter, Demo and Quotation set the Current stage filter (the same current_stage the table shows: the stage
// after the latest stamped one), and clicking the selected tile again clears it. The summary also carries the First Call / Negotiation / Closure counts
// (stage_first_call, stage_negotiation, stage_closure); they are not shown as tiles, but the table's Current stage filter still reaches those leads.
// An average tile turns red when its average is over the stage's limit (Demo 48h, Quotation 48h — see STAGES in lib/salesFms.js); the average delay against
// plan is in its tooltip. ONE request (sales_fms_summary). Fixed height whether loading, loaded or failed, so the table below never moves. The tiles share
// the row's width (each grows a little, within a cap) and the nine of them fit one line from a 1280px-wide screen up (sidebar included); on a narrower screen the row wraps.
// `refreshKey` changes whenever the list changes (a save, a close, another tab's write); `filters` are the table's current filters ({ state, currentStage });
// onPick(state[], stage[]).
const TILES = [
  { key: 'open', label: 'In pipeline', state: OPEN_STATES, stage: [], tip: 'Open leads only — a lead that is already Won or Lost is not counted here (see Won and Lost).' },
  { key: 'overdue', label: 'Overdue', state: ['overdue'], stage: [], tone: 'text-danger', tip: 'Open leads past the planned time of the stage they are at' },
  { key: 'stage_demo', label: 'Demo', state: [], stage: ['demo'], tip: 'Open leads currently at Demo' },
  { key: 'stage_quotation', label: 'Quotation', state: [], stage: ['quotation'], tip: 'Open leads currently at Quotation' },
  { key: 'won', label: 'Won', state: ['closed_won'], stage: [], tone: 'text-[#16A34A]', tip: 'Leads closed Won' },
  { key: 'lost', label: 'Lost', state: ['closed_lost'], stage: [], tone: 'text-text-muted', tip: 'Leads closed Lost' },
]
const AVG_STAGES = STAGES.map((s, i) => ({ ...s, i })).filter((s) => s.key !== 'negotiation') // i = the stage's place in the summary's 'stages' list
const TILE = 'h-[52px] flex-1 min-w-0 rounded-lg border px-2.5 py-1 flex flex-col justify-between transition-colors'
const COUNT_TILE = `${TILE} basis-[96px] max-w-[128px] text-left bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary`
const AVG_TILE = `${TILE} basis-[104px] max-w-[132px]`
const num = (v) => (v === null || v === undefined ? null : Number(v))
const signed = (h) => (h === null ? '—' : `${h > 0 ? '+' : h < 0 ? '−' : ''}${fmtHours(h)}`)
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`
const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x))

export default function FmsKpiStrip({ refreshKey, filters, onPick }) {
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

  return (
    <div className="mb-3 flex flex-wrap items-stretch gap-2 min-h-[52px]" data-role="kpi-strip">
      {TILES.map((t) => {
        const on = sameSet(filters?.state, t.state) && sameSet(filters?.currentStage, t.stage)
        const n = counts && counts[t.key] !== undefined && counts[t.key] !== null ? counts[t.key] : null
        return (
          <button
            key={t.key}
            type="button"
            data-tile={t.key}
            aria-pressed={on}
            aria-label={`${t.label}: ${n === null ? 'loading' : n} — ${on ? 'clear this filter' : 'filter the list'}`}
            title={t.tip}
            onClick={() => onPick(t.state, t.stage)}
            className={`${COUNT_TILE} ${on ? 'border-primary bg-primary-tint ring-1 ring-primary' : 'border-border hover:bg-surface-2'}`}
          >
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted truncate">{t.label}</span>
            <span className={`text-[18px] leading-none font-extrabold tabular-nums ${n === 0 ? 'text-text-muted' : t.tone || 'text-text'}`}>{n === null ? '–' : n}</span>
          </button>
        )
      })}
      <span className="w-px self-stretch bg-border mx-0.5" aria-hidden="true" />
      {AVG_STAGES.map((s) => {
        const st = stages?.[s.i]
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
          <div key={s.key} data-stage={s.key} title={tip} className={`${AVG_TILE} ${over ? 'border-danger bg-danger-tint' : 'border-border'}`}>
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
      {state.error && (
        <span className="self-center text-[11px] text-danger" role="status">
          {state.error}
        </span>
      )}
    </div>
  )
}
