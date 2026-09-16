import { CATEGORY_BADGE_TONE, fmtDate } from '../../../lib/hrEmployee'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'
import ChecklistBadge from './ChecklistBadge'

// won/warm/lost (CATEGORY_BADGE_TONE) map directly onto StatusBadge's existing
// primary/warning/danger tones — same colors CategoryBadge.jsx hand-rolled,
// now retired since this was its only consumer.
const CATEGORY_STATUS_TONE = { won: 'primary', warm: 'warning', lost: 'danger' }

// Ported from old-portal/js/hrEmployee.js's _heTableRowsHtml, shared by Employee List and Exited
// Staff. Migrated onto the shared table system — the sticky-header/reachable-scrollbar problem
// this file's own comment used to describe (production's synced-scrollbar hack, dropped here for
// the same reason Renewals dropped it in Phase 1a) is now handled automatically by Table.jsx.
//
// Employee List and Exited Staff open different modals on row click (EmployeeFormModal's full
// edit form vs ExitChecklistModal, which only shows the employee's name) — so truncating
// Department/Designation/Location/Contact here has a full same-tab fallback on Employee List but
// only an indirect one on Exited Staff (the same employee is still findable via Employee List's
// own unfiltered view, just not via a same-tab click). Truncated anyway for row-height
// consistency with every other migrated table — flagged in MIGRATION-NOTES.md as a
// discoverability gap worth a team decision, not something this migration silently papers over.
export default function EmployeeTable({ rows, showChecklist, onRowClick, checklistStatusAll, checklistItemsLength }) {
  const columns = ['Name', 'Category', 'Department', 'Designation', 'Location', 'DOJ', 'Contact (Official)', ...(showChecklist ? ['Checklist'] : [])]

  return (
    <Table>
      <TableHead>
        {columns.map((h) => (
          <Th key={h}>{h}</Th>
        ))}
      </TableHead>
      <tbody>
        {!rows.length ? (
          <tr>
            <Td colSpan={columns.length} align="center" className="py-8 text-text-muted">
              No employees found.
            </Td>
          </tr>
        ) : (
          rows.map((e) => (
            <Tr key={e.id} onClick={() => onRowClick(e.id)}>
              <Td className="max-w-[160px] truncate font-semibold text-text" title={e.full_name || ''}>
                {e.full_name}
              </Td>
              <Td>
                <StatusBadge tone={CATEGORY_STATUS_TONE[CATEGORY_BADGE_TONE[e.category]] || 'warning'}>{e.category || '—'}</StatusBadge>
              </Td>
              <Td className="max-w-[130px] truncate" title={e.department || ''}>
                {e.department || '—'}
              </Td>
              <Td className="max-w-[130px] truncate" title={e.designation || ''}>
                {e.designation || '—'}
              </Td>
              <Td className="max-w-[110px] truncate" title={e.location || ''}>
                {e.location || '—'}
              </Td>
              <Td className="whitespace-nowrap">{fmtDate(e.doj)}</Td>
              <Td className="max-w-[150px] truncate" title={e.contact_official || ''}>
                {e.contact_official || '—'}
              </Td>
              {showChecklist && (
                <Td>
                  <ChecklistBadge employeeId={e.id} checklistStatusAll={checklistStatusAll} checklistItemsLength={checklistItemsLength} />
                </Td>
              )}
            </Tr>
          ))
        )}
      </tbody>
    </Table>
  )
}
