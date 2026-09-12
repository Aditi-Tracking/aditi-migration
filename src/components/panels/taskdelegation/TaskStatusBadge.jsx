import { TD_STATUS_META } from '../../../lib/taskDelegation'

export default function TaskStatusBadge({ status }) {
  const m = TD_STATUS_META[status] || TD_STATUS_META.pending
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ background: m.color + '22', color: m.color }}
    >
      {m.icon} {m.label}
    </span>
  )
}
