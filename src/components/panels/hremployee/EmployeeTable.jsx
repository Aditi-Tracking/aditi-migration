import { fmtDate } from '../../../lib/hrEmployee'
import CategoryBadge from './CategoryBadge'
import ChecklistBadge from './ChecklistBadge'

// Ported from old-portal/js/hrEmployee.js's _heTableRowsHtml, shared by Employee List and Exited
// Staff. Deliberately simplified: production syncs a dummy top scrollbar with the real table
// container to fake a sticky header + reachable horizontal scrollbar (position:sticky on a thead
// inside overflow-x:auto doesn't stick to the page on its own — a real CSS limitation). Dropped in
// favor of a plain scrollable table, same simplification already applied in Renewals' Phase 1a for
// the identical underlying problem.
export default function EmployeeTable({ rows, showChecklist, onRowClick, checklistStatusAll, checklistItemsLength }) {
  const columns = ['Name', 'Category', 'Department', 'Designation', 'Location', 'DOJ', 'Contact (Official)', ...(showChecklist ? ['Checklist'] : [])]

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-border">
              {columns.map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-text-muted">
                  No employees found.
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} onClick={() => onRowClick(e.id)} className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer">
                  <td className="px-3 py-2.5 font-semibold text-text">{e.full_name}</td>
                  <td className="px-3 py-2.5">
                    <CategoryBadge category={e.category} />
                  </td>
                  <td className="px-3 py-2.5 text-text">{e.department || '—'}</td>
                  <td className="px-3 py-2.5 text-text">{e.designation || '—'}</td>
                  <td className="px-3 py-2.5 text-text">{e.location || '—'}</td>
                  <td className="px-3 py-2.5 text-text whitespace-nowrap">{fmtDate(e.doj)}</td>
                  <td className="px-3 py-2.5 text-text">{e.contact_official || '—'}</td>
                  {showChecklist && (
                    <td className="px-3 py-2.5">
                      <ChecklistBadge employeeId={e.id} checklistStatusAll={checklistStatusAll} checklistItemsLength={checklistItemsLength} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
