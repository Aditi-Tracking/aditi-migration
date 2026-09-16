import { fmtDate } from '../../../lib/taskDelegation'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'

// Ported from old-portal/js/taskDelegation.js's tdRenderAssigneesTable/tdToggleAssigneeActive.
// No hard delete anywhere in this module — only this active/inactive toggle. Migrated onto the
// shared table system — Name and Email gained truncate+tooltip. Unlike AllTasksTab/MyTasksView,
// there's no row-click/detail view here to fall back on (rows have no onClick at all, matching
// production exactly), but tooltip-only is the established baseline for this project regardless
// (same SmartFleet-vs-Task-Checklist precedent as before) — Name/Email are short enough fields
// that this is a safe, low-risk truncation, not one hiding information with no way to see it.
// The Active toggle is a custom slide-switch (semantically distinct from a plain checkbox), not
// migrated onto CheckboxCell — stays custom, same reasoning as CRM Vehicle's status bars.
export default function AssigneesTab({ assignees, onToggleActive }) {
  if (!assignees.length) {
    return <p className="text-center py-10 text-text-muted text-[13px]">No assignees yet — click "+ Add Assignee" to get started.</p>
  }

  return (
    <Table>
      <TableHead>
        <Th>Name</Th>
        <Th>Email</Th>
        <Th>Emp ID</Th>
        <Th>Active</Th>
        <Th>Added On</Th>
      </TableHead>
      <tbody>
        {assignees.map((a) => (
          <Tr key={a.id}>
            <Td className="max-w-[180px] truncate" title={a.employee_name}>
              {a.employee_name}
            </Td>
            <Td className="max-w-[220px] truncate" title={a.email_id}>
              {a.email_id}
            </Td>
            <Td>{a.emp_id || '—'}</Td>
            <Td>
              <label className="relative inline-block w-9 h-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!a.is_active}
                  onChange={(e) => onToggleActive(a.id, e.target.checked)}
                  className="opacity-0 w-0 h-0 absolute"
                />
                <span className={`absolute inset-0 rounded-full transition-colors ${a.is_active ? 'bg-primary' : 'bg-border'}`}>
                  <span
                    className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-all ${
                      a.is_active ? 'left-[18px]' : 'left-[3px]'
                    }`}
                  />
                </span>
              </label>
            </Td>
            <Td className="text-text-muted text-[11.5px]">{fmtDate(a.added_at)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}
