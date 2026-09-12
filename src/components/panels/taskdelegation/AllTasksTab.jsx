import { assigneeNamesForTask, fmtDate, taskHasAssignee } from '../../../lib/taskDelegation'
import TaskDelegationKpiGrid from './TaskDelegationKpiGrid'
import TaskStatusBadge from './TaskStatusBadge'

// Ported from old-portal/js/taskDelegation.js's tdRenderAllTasksTable/tdRenderAllTasksKpis/
// tdRenderAllTasksFilterOptions. KPI tiles double as the status filter (replacing a dropdown) —
// counts respect the assignee dropdown but not activeKpi itself, since that's the filter these very
// tiles control.
export default function AllTasksTab({
  tasks,
  assignees,
  taskAssigneeMap,
  filterAssignee,
  onFilterAssigneeChange,
  activeKpi,
  onKpiClick,
  onOpenTask,
  onEditTask,
}) {
  const scoped = filterAssignee ? tasks.filter((t) => taskHasAssignee(t, filterAssignee, taskAssigneeMap)) : tasks

  let rows = scoped
  if (activeKpi === 'pending') rows = rows.filter((t) => t.status === 'pending')
  if (activeKpi === 'ongoing') rows = rows.filter((t) => t.status === 'ongoing')
  if (activeKpi === 'completed') rows = rows.filter((t) => t.status === 'completed')

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
        <div />
        <select
          value={filterAssignee}
          onChange={(e) => onFilterAssigneeChange(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-text"
        >
          <option value="">All Assignees</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.email_id}>
              {a.employee_name}
            </option>
          ))}
        </select>
      </div>

      <TaskDelegationKpiGrid tasks={scoped} activeKpi={activeKpi} onKpiClick={onKpiClick} />

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b-2 border-border">
                {['Title', 'Assigned To', 'Due Date', 'Status', 'Note', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-text-muted">
                    No tasks match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} onClick={() => onOpenTask(t.id)} className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer">
                    <td className="px-3 py-2.5">
                      {t.task_title}
                      {t.source_recurring_template_id && (
                        <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#818cf822] text-[#818cf8]">
                          🔁 Recurring
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{assigneeNamesForTask(t, taskAssigneeMap, assignees)}</td>
                    <td className="px-3 py-2.5">{fmtDate(t.due_date)}</td>
                    <td className="px-3 py-2.5">
                      <TaskStatusBadge status={t.status} />
                    </td>
                    <td className="px-3 py-2.5 text-text-muted text-[11.5px] max-w-[220px] truncate">{t.note || '—'}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onEditTask(t.id)}
                        title="Edit"
                        aria-label="Edit"
                        className="px-2 py-1.5 rounded-md border border-border bg-surface-2 text-text"
                      >
                        ✏️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
