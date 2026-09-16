import { assigneeNamesForTask, fmtDate, taskHasAssignee } from '../../../lib/taskDelegation'
import TaskDelegationKpiGrid from './TaskDelegationKpiGrid'
import TaskStatusBadge from './TaskStatusBadge'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'

// Ported from old-portal/js/taskDelegation.js's tdRenderAllTasksTable/tdRenderAllTasksKpis/
// tdRenderAllTasksFilterOptions. KPI tiles double as the status filter (replacing a dropdown) —
// counts respect the assignee dropdown but not activeKpi itself, since that's the filter these very
// tiles control. Migrated onto the shared table system — Title and Assigned To gained
// truncate+tooltip (a real gap against the fixed-row-height convention, not present before), safe
// since TaskDetailModal (opened on row click) already shows both in full as the fallback. The
// Recurring pill's #818cf8 doesn't match any StatusBadge tone (closest is purple's #A855F7, a
// visibly different hue) — color escape hatch, same treatment as FMS's NBD badge.
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

      <Table>
        <TableHead>
          <Th>Title</Th>
          <Th>Assigned To</Th>
          <Th>Due Date</Th>
          <Th>Status</Th>
          <Th>Note</Th>
          <Th align="center">Actions</Th>
        </TableHead>
        <tbody>
          {!rows.length ? (
            <tr>
              <Td colSpan={6} align="center" className="py-8 text-text-muted">
                No tasks match these filters.
              </Td>
            </tr>
          ) : (
            rows.map((t) => {
              const assignedTo = assigneeNamesForTask(t, taskAssigneeMap, assignees)
              return (
                <Tr key={t.id} onClick={() => onOpenTask(t.id)}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[220px] truncate" title={t.task_title}>
                        {t.task_title}
                      </span>
                      {t.source_recurring_template_id && <StatusBadge color="#818cf8">🔁 Recurring</StatusBadge>}
                    </div>
                  </Td>
                  <Td className="max-w-[180px] truncate" title={assignedTo}>
                    {assignedTo}
                  </Td>
                  <Td>{fmtDate(t.due_date)}</Td>
                  <Td>
                    <TaskStatusBadge status={t.status} />
                  </Td>
                  <Td className="text-text-muted text-[11.5px] max-w-[220px] truncate">{t.note || '—'}</Td>
                  <Td align="center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onEditTask(t.id)}
                      title="Edit"
                      aria-label="Edit"
                      className="px-2 py-1.5 rounded-md border border-border bg-surface-2 text-text"
                    >
                      ✏️
                    </button>
                  </Td>
                </Tr>
              )
            })
          )}
        </tbody>
      </Table>
    </div>
  )
}
