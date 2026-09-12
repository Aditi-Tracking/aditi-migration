import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import OverlayShell from '../../shared/OverlayShell'
import { backfillChecklistStatus, fmtDate, refreshExitData, saveChecklistRemarks, toggleChecklistItem } from '../../../lib/hrEmployee'

// Ported from old-portal/js/hrEmployee.js's heOpenExitChecklistModal/heRenderChecklistRows/
// heToggleChecklistItem/heSaveChecklistRemarks. The backfill-missing-rows check on open uses the
// SAME shared backfillChecklistStatus helper as EmployeeFormModal's save path (real duplication
// in production, extracted here) — covers the case where checklist items were added to the master
// list after this employee had already exited.
export default function ExitChecklistModal({ employee, checklistItems, checklistStatusAll, canEdit, onClose, onChecklistStatusChange, onDataRefreshed }) {
  const { currentUser } = useAuth()
  const [remarksDrafts, setRemarksDrafts] = useState({})

  useEffect(() => {
    if (!employee) return
    const rowsForEmp = checklistStatusAll.filter((r) => r.employee_id === employee.id)
    if (rowsForEmp.length < checklistItems.length) {
      backfillChecklistStatus(employee.id, checklistItems, rowsForEmp).then((created) => {
        if (created) refreshExitData().then(onDataRefreshed)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- backfill check only needs to run once per employee the modal opens for
  }, [employee?.id])

  if (!employee) return null

  const byItemId = {}
  checklistItems.forEach((i) => {
    byItemId[i.id] = i
  })
  const rows = checklistStatusAll
    .filter((r) => r.employee_id === employee.id)
    .slice()
    .sort((a, b) => (byItemId[a.checklist_item_id]?.sort_order || 0) - (byItemId[b.checklist_item_id]?.sort_order || 0))

  const total = rows.length || 5
  const completed = rows.filter((r) => r.status === 'completed').length

  async function handleToggle(row) {
    if (!canEdit) return
    try {
      const payload = await toggleChecklistItem(row, currentUser?.email)
      onChecklistStatusChange(checklistStatusAll.map((r) => (r.id === row.id ? { ...r, ...payload } : r)))
    } catch (e) {
      alert('❌ Update failed: ' + e.message)
    }
  }

  async function handleRemarksBlur(row, value) {
    if (!canEdit || row.remarks === value) return
    try {
      await saveChecklistRemarks(row.id, value)
      onChecklistStatusChange(checklistStatusAll.map((r) => (r.id === row.id ? { ...r, remarks: value } : r)))
    } catch (e) {
      alert('❌ Failed to save remarks: ' + e.message)
    }
  }

  return (
    <OverlayShell open={!!employee} onClose={onClose} maxWidth="max-w-md">
      <div className="text-[15px] font-semibold text-text mb-1">Exit Checklist — {employee.full_name}</div>

      <div className="mb-4 mt-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[12px] font-semibold text-text-muted">
            {completed}/{total} completed
          </span>
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.round((completed / total) * 100)}%` }} />
        </div>
      </div>

      {rows.map((r) => {
        const item = byItemId[r.checklist_item_id] || {}
        const isDone = r.status === 'completed'
        const draft = remarksDrafts[r.id] ?? r.remarks ?? ''
        return (
          <div key={r.id} className="rounded-lg border border-border bg-surface-2 p-3.5 mb-2.5">
            <div className="flex items-center justify-between gap-2.5">
              <div className="font-semibold text-[13px] text-text">{item.item_name || '—'}</div>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => handleToggle(r)}
                className={`px-3.5 py-1 rounded-full text-[11.5px] font-bold border disabled:cursor-not-allowed ${
                  isDone ? 'border-primary/35 bg-primary-tint text-primary' : 'border-[#f0a500]/35 bg-[#f0a500]/15 text-[#f0a500]'
                }`}
              >
                {isDone ? '✅ Completed' : '⏳ Pending'}
              </button>
            </div>
            {isDone && (
              <div className="text-[11px] text-text-muted mt-1.5">
                By {r.completed_by || '—'} · {r.completed_on ? fmtDate(r.completed_on) : '—'}
              </div>
            )}
            <input
              type="text"
              placeholder="Remarks (optional)"
              value={draft}
              disabled={!canEdit}
              onChange={(e) => setRemarksDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
              onBlur={(e) => handleRemarksBlur(r, e.target.value)}
              className="w-full box-border mt-2 px-3 py-1.5 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none disabled:opacity-60"
            />
          </div>
        )
      })}
    </OverlayShell>
  )
}
