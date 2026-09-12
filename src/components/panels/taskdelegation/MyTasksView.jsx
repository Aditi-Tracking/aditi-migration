import { fmtDate, isTaskOverdue } from '../../../lib/taskDelegation'
import TaskDelegationKpiGrid from './TaskDelegationKpiGrid'
import TaskStatusBadge from './TaskStatusBadge'

// Ported from old-portal/js/taskDelegation.js's tdRenderMyTasksTable/tdRenderMyTasksKpis — sorted
// pending/ongoing first, then by due date ascending; completed tasks sink to the bottom, sorted by
// most-recently-completed first. Nothing in this table is ever an input — note/tentative
// date/status are only edited inside the shared detail modal (tdOpenTaskDetailModal).
export default function MyTasksView({ tasks, activeKpi, onKpiClick, onOpenTask }) {
  let rows = tasks
  if (activeKpi === 'pending') rows = rows.filter((t) => t.status === 'pending')
  if (activeKpi === 'ongoing') rows = rows.filter((t) => t.status === 'ongoing')
  if (activeKpi === 'completed') rows = rows.filter((t) => t.status === 'completed')

  rows = [...rows].sort((a, b) => {
    const aDone = a.status === 'completed'
    const bDone = b.status === 'completed'
    if (aDone !== bDone) return aDone ? 1 : -1
    return aDone
      ? String(b.completed_at || '').localeCompare(String(a.completed_at || ''))
      : String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
  })

  return (
    <div>
      <TaskDelegationKpiGrid tasks={tasks} activeKpi={activeKpi} onKpiClick={onKpiClick} />

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b-2 border-border">
                {['Title', 'Due Date', 'Tentative Date', 'Status'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-text-muted">
                    {tasks.length ? 'No tasks match this filter.' : "You don't have any delegated tasks yet."}
                  </td>
                </tr>
              ) : (
                rows.map((t) => {
                  const overdue = isTaskOverdue(t)
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onOpenTask(t.id)}
                      className={`border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer ${t.status === 'completed' ? 'opacity-65' : ''}`}
                    >
                      <td className={`px-3 py-2.5 ${t.status === 'completed' ? 'line-through' : ''}`}>{t.task_title}</td>
                      <td className="px-3 py-2.5">
                        {overdue ? <span className="text-danger font-bold">⚠️ {fmtDate(t.due_date)}</span> : fmtDate(t.due_date)}
                      </td>
                      <td className="px-3 py-2.5">{t.tentative_date ? fmtDate(t.tentative_date) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <TaskStatusBadge status={t.status} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
