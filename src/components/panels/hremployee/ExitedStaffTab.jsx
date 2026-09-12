import EmployeeTable from './EmployeeTable'

// Ported from old-portal/js/hrEmployee.js's heRenderExitedStaff. Deliberately does NOT reuse the
// Employee List tab's search/filter state — that would leak stale filter state into this tab
// with no visible control here to explain it (production's own comment on why this is separate).
export default function ExitedStaffTab({ employees, checklistStatusAll, checklistItemsLength, onOpenChecklist }) {
  const rows = employees.filter((e) => e.category === 'Exited Staff')

  return (
    <div>
      <div className="flex justify-end mb-2.5">
        <span className="text-[12px] text-text-muted">
          {rows.length} exited employee{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      <EmployeeTable rows={rows} showChecklist onRowClick={onOpenChecklist} checklistStatusAll={checklistStatusAll} checklistItemsLength={checklistItemsLength} />
    </div>
  )
}
