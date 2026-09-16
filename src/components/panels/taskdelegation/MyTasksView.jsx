import { fmtDate, isTaskOverdue } from '../../../lib/taskDelegation'
import TaskDelegationKpiGrid from './TaskDelegationKpiGrid'
import TaskStatusBadge from './TaskStatusBadge'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'

// Ported from old-portal/js/taskDelegation.js's tdRenderMyTasksTable/tdRenderMyTasksKpis — sorted
// pending/ongoing first, then by due date ascending; completed tasks sink to the bottom, sorted by
// most-recently-completed first. Nothing in this table is ever an input — note/tentative
// date/status are only edited inside the shared detail modal (tdOpenTaskDetailModal). Migrated
// onto the shared table system — Title gained truncate+tooltip, safe since TaskDetailModal (row
// click) shows the full title in its header. The completed-row opacity-65 dimming and line-through
// use a CSS property (opacity) that doesn't compete with the zebra stripe's own background-color
// utility, unlike Recurring Bills'/CRM Vehicle's highlight cases — no zebra escape hatch needed.
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

      <Table>
        <TableHead>
          <Th>Title</Th>
          <Th>Due Date</Th>
          <Th>Tentative Date</Th>
          <Th>Status</Th>
        </TableHead>
        <tbody>
          {!rows.length ? (
            <tr>
              <Td colSpan={4} align="center" className="py-8 text-text-muted">
                {tasks.length ? 'No tasks match this filter.' : "You don't have any delegated tasks yet."}
              </Td>
            </tr>
          ) : (
            rows.map((t) => {
              const overdue = isTaskOverdue(t)
              const completed = t.status === 'completed'
              return (
                <Tr key={t.id} onClick={() => onOpenTask(t.id)} className={completed ? 'opacity-65' : ''}>
                  <Td className={`max-w-[260px] truncate ${completed ? 'line-through' : ''}`} title={t.task_title}>
                    {t.task_title}
                  </Td>
                  <Td>{overdue ? <span className="text-danger font-bold">⚠️ {fmtDate(t.due_date)}</span> : fmtDate(t.due_date)}</Td>
                  <Td>{t.tentative_date ? fmtDate(t.tentative_date) : '—'}</Td>
                  <Td>
                    <TaskStatusBadge status={t.status} />
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
