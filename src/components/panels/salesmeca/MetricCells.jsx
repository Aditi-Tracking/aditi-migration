import { fmtAvg, fmtCount, fmtMoney, fmtPct, metrics } from '../../../lib/salesMeca'
import Td from '../../shared/table/Td'
import { MECA_COL } from './mecaColumns'

const DASH = <span className="text-text-muted">—</span>

// What the target figure is made of, as a small label next to it — so a pro-rata week or a part-set quarter is never mistaken for a
// stored monthly target. `note` is the cell's target note (see lib/salesMeca.js); `perRep` — the cell is ONE rep's.
function targetNote(note, perRep) {
  if (!note) return { text: '', title: '' }
  if (note.prorata) return { text: 'pro-rata', title: 'Worked out from the monthly target, by the days in this week' }
  if (note.partial) {
    return perRep
      ? { text: `${note.monthsSet} of ${note.monthsTotal} mo`, title: `A target is set for ${note.monthsSet} of the ${note.monthsTotal} months — months without one add nothing` }
      : { text: 'part set', title: 'Some reps have no target for some of these months — only targets that are set are added up' }
  }
  return { text: '', title: '' }
}

// The cell colour of a value band (lib/salesMeca.js cellBands). Soft tint + text colour, so the row height never changes and the figure stays legible.
const BAND_CLASS = {
  red: 'bg-danger-tint text-danger font-semibold',
  amber: 'bg-[rgba(245,158,11,0.16)] text-[#B77900] font-semibold',
  green: 'bg-[rgba(22,163,74,0.14)] text-[#16A34A] font-semibold',
}
const bandClass = (b) => (b?.band ? BAND_CLASS[b.band] : '')
const bandTitle = (base, b) => (b?.tip ? `${base} — ${b.tip}` : base)

// The eight figure columns of one row, in the order of the MeCa tables: Meetings · Clients · Conversion · Turnover · Avg Rs Sale ·
// Target · % of target · Gap. `cell` is a report cell (lib/salesMeca.js); `perRep` says whether it is one rep's (it changes the wording of
// a part-set target). `fractions` shows one decimal on the counts. `strong` for a Total row. `bands` (cellBands) colours Conversion, Turnover, Avg Rs Sale
// and % of target; leave it out for the company's own row.
export default function MetricCells({ cell, perRep = true, fractions = false, strong = false, bands = null }) {
  const m = metrics(cell)
  const note = targetNote(cell.note, perRep && (cell.note?.reps ?? 1) === 1)
  const weight = strong ? 'font-bold' : ''
  const count = (n) => (fractions ? fmtCount(n) : String(n))
  const behind = m.gap !== null && m.gap > 0
  return (
    <>
      <Td className={`${MECA_COL.count} tabular-nums whitespace-nowrap ${weight}`} align="right">
        {count(cell.meetings)}
      </Td>
      <Td className={`${MECA_COL.count} tabular-nums whitespace-nowrap ${weight}`} align="right">
        {count(cell.clients)}
      </Td>
      <Td className={`${MECA_COL.pct} tabular-nums whitespace-nowrap ${weight} ${bandClass(bands?.conversion)}`} align="right" title={bandTitle('Clients ÷ meetings in the same period', bands?.conversion)}>
        {m.conversion === null ? DASH : fmtPct(m.conversion, 1)}
      </Td>
      <Td className={`${MECA_COL.money} tabular-nums whitespace-nowrap ${weight} ${bandClass(bands?.turnover)}`} align="right" title={bandTitle('Turnover — the closure amounts of the clients won (this is what is measured against the target)', bands?.turnover)}>
        {fmtMoney(cell.turnover)}
      </Td>
      <Td className={`${MECA_COL.money} tabular-nums whitespace-nowrap ${weight} ${bandClass(bands?.avgSale)}`} align="right" title={bandTitle('Turnover ÷ the clients that have an amount', bands?.avgSale)}>
        {m.avgSale === null ? DASH : fmtAvg(m.avgSale)}
      </Td>
      <Td className={`${MECA_COL.target} tabular-nums whitespace-nowrap ${weight}`} align="right" title={note.title}>
        {cell.target === null ? (
          DASH
        ) : (
          <>
            {note.text && <span className="mr-1.5 text-[10.5px] font-normal text-text-muted">{note.text}</span>}
            {fmtMoney(cell.target)}
          </>
        )}
      </Td>
      <Td className={`${MECA_COL.pct} tabular-nums whitespace-nowrap ${weight} ${bandClass(bands?.pct)}`} align="right" title={bandTitle('Turnover ÷ target', bands?.pct)}>
        {m.pct === null ? DASH : fmtPct(m.pct)}
      </Td>
      <Td className={`${MECA_COL.money} tabular-nums whitespace-nowrap ${weight} ${m.gap !== null && !behind ? 'text-[#16A34A]' : ''}`} align="right" title="Target − turnover; a minus means the target is beaten">
        {m.gap === null ? DASH : m.gap < 0 ? `−${fmtMoney(-m.gap)}` : fmtMoney(m.gap)}
      </Td>
    </>
  )
}
