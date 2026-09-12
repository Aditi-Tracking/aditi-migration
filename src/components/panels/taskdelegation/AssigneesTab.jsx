import { fmtDate } from '../../../lib/taskDelegation'

// Ported from old-portal/js/taskDelegation.js's tdRenderAssigneesTable/tdToggleAssigneeActive.
// No hard delete anywhere in this module — only this active/inactive toggle.
export default function AssigneesTab({ assignees, onToggleActive }) {
  if (!assignees.length) {
    return <p className="text-center py-10 text-text-muted text-[13px]">No assignees yet — click "+ Add Assignee" to get started.</p>
  }

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-border">
              {['Name', 'Email', 'Emp ID', 'Active', 'Added On'].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignees.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2.5">{a.employee_name}</td>
                <td className="px-3 py-2.5">{a.email_id}</td>
                <td className="px-3 py-2.5">{a.emp_id || '—'}</td>
                <td className="px-3 py-2.5">
                  <label className="relative inline-block w-9 h-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!a.is_active}
                      onChange={(e) => onToggleActive(a.id, e.target.checked)}
                      className="opacity-0 w-0 h-0 absolute"
                    />
                    <span
                      className={`absolute inset-0 rounded-full transition-colors ${a.is_active ? 'bg-primary' : 'bg-border'}`}
                    >
                      <span
                        className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-all ${
                          a.is_active ? 'left-[18px]' : 'left-[3px]'
                        }`}
                      />
                    </span>
                  </label>
                </td>
                <td className="px-3 py-2.5 text-text-muted text-[11.5px]">{fmtDate(a.added_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
