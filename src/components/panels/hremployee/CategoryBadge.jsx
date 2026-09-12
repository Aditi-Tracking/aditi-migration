import { CATEGORY_BADGE_TONE } from '../../../lib/hrEmployee'

const TONE_STYLE = {
  won: 'bg-primary-tint text-primary',
  warm: 'bg-[#f0a500]/15 text-[#f0a500]',
  lost: 'bg-danger-tint text-danger',
}

export default function CategoryBadge({ category }) {
  const tone = CATEGORY_BADGE_TONE[category] || 'warm'
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${TONE_STYLE[tone]}`}>{category || '—'}</span>
}
