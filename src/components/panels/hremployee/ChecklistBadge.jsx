import { checklistCountFor } from '../../../lib/hrEmployee'

const TONE_STYLE = {
  won: 'bg-primary-tint text-primary',
  warm: 'bg-[#f0a500]/15 text-[#f0a500]',
  lost: 'bg-danger-tint text-danger',
}

export default function ChecklistBadge({ employeeId, checklistStatusAll, checklistItemsLength }) {
  const { completed, total } = checklistCountFor(employeeId, checklistStatusAll, checklistItemsLength)
  const tone = completed === 0 ? 'lost' : completed === total ? 'won' : 'warm'
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${TONE_STYLE[tone]}`}>{completed}/{total} completed</span>
}
