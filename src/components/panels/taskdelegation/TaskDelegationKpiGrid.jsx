import { TD_STATUS_META } from '../../../lib/taskDelegation'

// Shared by AllTasksTab (MD) and MyTasksView (assignee) — same 4-tile shape in both of
// tdRenderAllTasksKpis/tdRenderMyTasksKpis. Colors kept per-status (matches production's own
// semantic coloring for these tiles), unified to TD_STATUS_META rather than each caller repeating
// its own color literals.
export default function TaskDelegationKpiGrid({ tasks, activeKpi, onKpiClick }) {
  const pending = tasks.filter((t) => t.status === 'pending').length
  const ongoing = tasks.filter((t) => t.status === 'ongoing').length
  const completed = tasks.filter((t) => t.status === 'completed').length
  const tiles = [
    { id: 'all', label: 'Total Tasks', value: tasks.length, color: '#818cf8' },
    { id: 'pending', label: 'Pending', value: pending, color: TD_STATUS_META.pending.color },
    { id: 'ongoing', label: 'Ongoing', value: ongoing, color: TD_STATUS_META.ongoing.color },
    { id: 'completed', label: 'Completed', value: completed, color: TD_STATUS_META.completed.color },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {tiles.map((t) => {
        const isActive = t.id === 'all' ? !activeKpi : activeKpi === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onKpiClick(t.id)}
            className={`text-left rounded-xl border p-3.5 ${isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface'}`}
          >
            <div className="text-[11px] text-text-muted">{t.label}</div>
            <div className="text-[19px] font-bold mt-1" style={{ color: t.color }}>
              {t.value}
            </div>
          </button>
        )
      })}
    </div>
  )
}
