import Icon from '../../shared/Icon'
import Td from '../../shared/table/Td'
import { fmtHours, fmtMoment } from '../../../lib/fmsFormat'
import { stageFacts } from '../../../lib/salesFms'

const MUTED = 'text-text-muted'
const DANGER = 'text-danger'
const AMBER = 'text-[#B77900]'
const GREEN = 'text-[#16A34A]'

// What is true of ONE stage of ONE lead, as a single fixed-height line (the fixed-row-height rule), with the full sentence in the tooltip:
//   done       check icon + the actual time, and how late (+5h, red) or early (-1d 2h, green) against plan
//   current    Overdue 5h (red)  |  Due 18 Oct, 3:45 pm  |  Not scheduled (amber: no planned time to be late against)
//   upcoming   its planned time, muted (or a dash)
//   skipped    a later stage was already reached without it
// `index` is 0..3 (STAGES order). The cell never wraps and never changes the row's height.
function stageCellView(row, index) {
  const f = stageFacts(row, index)
  if (f.state === 'done') {
    const late = f.delayH !== null && f.delayH >= 1
    const early = f.delayH !== null && f.delayH <= -1
    const took = f.cycleH !== null ? ` · took ${fmtHours(f.cycleH)}` : ''
    return {
      tone: '',
      icon: 'check',
      iconTone: late ? DANGER : GREEN,
      text: fmtMoment(f.actual),
      suffix: late ? `+${fmtHours(f.delayH)}` : early ? `-${fmtHours(f.delayH)}` : '',
      suffixTone: late ? DANGER : GREEN,
      title: `${f.label}: done ${fmtMoment(f.actual, true)}${f.planned ? ` (planned ${fmtMoment(f.planned, true)}${late ? `, ${fmtHours(f.delayH)} late` : early ? `, ${fmtHours(f.delayH)} early` : ', on time'})` : ' (no planned time)'}${took}`,
    }
  }
  if (f.state === 'current') {
    if (!f.planned) return { tone: AMBER, text: 'Not scheduled', title: `${f.label}: this is the current stage and it has no planned time yet` }
    if (f.overdueH > 0) return { tone: `${DANGER} font-semibold`, icon: 'alert', text: `Overdue ${fmtHours(f.overdueH)}`, title: `${f.label}: planned ${fmtMoment(f.planned, true)} — ${fmtHours(f.overdueH)} overdue` }
    return { tone: 'text-primary', text: `Due ${fmtMoment(f.planned)}`, title: `${f.label}: planned ${fmtMoment(f.planned, true)}` }
  }
  if (f.state === 'skipped') return { tone: `${MUTED} italic`, text: 'Skipped', title: `${f.label}: passed over — a later stage was already reached` }
  return { tone: MUTED, text: f.planned ? fmtMoment(f.planned) : '—', title: f.planned ? `${f.label}: planned ${fmtMoment(f.planned, true)}` : `${f.label}: no planned time yet` }
}

export default function FmsStageCell({ row, index, className = '' }) {
  const v = stageCellView(row, index)
  return (
    <Td className={className} title={v.title}>
      <span className={`flex items-center gap-1 h-5 text-[12px] leading-5 whitespace-nowrap overflow-hidden ${v.tone}`}>
        {v.icon && <Icon name={v.icon} size={11} className={`shrink-0 ${v.iconTone || ''}`} />}
        <span className="truncate">{v.text}</span>
        {v.suffix && <span className={`shrink-0 text-[11px] font-semibold ${v.suffixTone}`}>{v.suffix}</span>}
      </span>
    </Td>
  )
}
