import { useState } from 'react'
import {
  canUndo as canUndoCheck,
  fmtDate,
  fmtDateTime,
  hasAttachment,
  isDone,
  isOngoing,
  markDone,
  setOngoing,
  taskRequiresAttachment,
  undoTask,
} from '../../../lib/taskChecklist'

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Ported from old-portal/js/tasks.js's tRenderTable + deptShowRemarksInput/
// deptSubmitDone/tUndoTask/tShowOngoing/tSubmitOngoing. No single-row
// delete exists in production — delete is bulk-checkbox-only.
export default function TaskTable({
  rows,
  total,
  page,
  totalPages,
  onPageChange,
  canDelete,
  currentUser,
  selectedIds,
  onSelectedIdsChange,
  onDeleteSelected,
  afterMutation,
  onOpenUpload,
}) {
  const [markDoneRowId, setMarkDoneRowId] = useState(null)
  const [remarksDraft, setRemarksDraft] = useState('')
  const [ongoingRowId, setOngoingRowId] = useState(null)
  const [ongoingDraft, setOngoingDraft] = useState(tomorrowISO())
  const [savingId, setSavingId] = useState(null)

  const canUndoUser = canUndoCheck(currentUser)
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  function toggleSelected(id) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedIdsChange(next)
  }

  function toggleSelectAll(checked) {
    const next = new Set(selectedIds)
    rows.forEach((r) => (checked ? next.add(r.id) : next.delete(r.id)))
    onSelectedIdsChange(next)
  }

  function openMarkDone(row) {
    setMarkDoneRowId(row.id)
    setRemarksDraft('')
  }

  async function submitMarkDone(row) {
    if (taskRequiresAttachment(row.task) && !hasAttachment(row)) {
      alert('📎 This task cannot be marked Done without the mandatory attachment! Please upload a file/PDF in the 📎 column first.')
      setMarkDoneRowId(null)
      return
    }
    setSavingId(row.id)
    try {
      const remarks = remarksDraft.trim()
      await markDone({ id: row.id, remarks })
      afterMutation((r) => (r.id === row.id ? { ...r, actual: new Date().toISOString(), remarks } : r))
      setMarkDoneRowId(null)
      setRemarksDraft('')
    } catch {
      alert('Could not save. Please try again.')
    } finally {
      setSavingId(null)
    }
  }

  function blockedMarkDone() {
    alert('📎 This task cannot be marked Done without the mandatory attachment! Please upload a file/PDF in the 📎 column first.')
  }

  async function handleUndo(row) {
    if (!canUndoUser) {
      alert('⛔ Undo access is restricted to MIS and PC only.')
      return
    }
    setSavingId(row.id)
    try {
      await undoTask({ id: row.id })
      afterMutation((r) => (r.id === row.id ? { ...r, actual: '', remarks: '' } : r))
    } catch {
      alert('⚠️ UI updated but DB sync failed. Please refresh.')
    } finally {
      setSavingId(null)
    }
  }

  function openOngoing(row) {
    setOngoingRowId(row.id)
    setOngoingDraft(tomorrowISO())
  }

  async function submitOngoing(row) {
    if (!ongoingDraft) {
      alert('Please select a date!')
      return
    }
    setSavingId(row.id)
    try {
      await setOngoing({ id: row.id, date: ongoingDraft })
      afterMutation((r) => (r.id === row.id ? { ...r, expectedDate: ongoingDraft } : r))
      setOngoingRowId(null)
    } catch {
      alert('Could not set ongoing date.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
        <span className="text-[13px] font-semibold text-text">All Tasks</span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[11.5px] text-text-muted">{total} task{total !== 1 ? 's' : ''}</span>
          {canDelete && selectedIds.size > 0 && (
            <button
              type="button"
              onClick={onDeleteSelected}
              className="text-[11.5px] font-semibold text-danger bg-danger-tint border border-danger/25 rounded-md px-3 py-1.5"
            >
              🗑️ Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              {canDelete && (
                <th className="px-2 py-2.5 w-8 text-center">
                  <input type="checkbox" checked={allChecked} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </th>
              )}
              <th className="px-3 py-2.5 font-semibold text-text-muted uppercase text-[10px]">Name</th>
              <th className="px-3 py-2.5 font-semibold text-text-muted uppercase text-[10px]">Task</th>
              <th className="px-3 py-2.5 font-semibold text-text-muted uppercase text-[10px]">Planned</th>
              <th className="px-3 py-2.5 font-semibold text-text-muted uppercase text-[10px]">Actual</th>
              <th className="px-3 py-2.5 font-semibold text-text-muted uppercase text-[10px]">Remarks</th>
              <th className="px-3 py-2.5 font-semibold text-text-muted uppercase text-[10px]">Action</th>
              <th className="px-3 py-2.5 font-semibold text-text-muted uppercase text-[10px]">Ongoing</th>
              <th className="px-3 py-2.5 font-semibold text-text-muted uppercase text-[10px] text-center">Upload</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={9} className="text-center py-10 text-text-muted">
                  No tasks found
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const done = isDone(row)
              const ongoing = !done && isOngoing(row)
              const needsAttach = taskRequiresAttachment(row.task)
              const attachMissing = needsAttach && !hasAttachment(row)
              const saving = savingId === row.id

              return (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  {canDelete && (
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} />
                    </td>
                  )}
                  <td className="px-3 py-2 font-semibold text-text whitespace-nowrap">{row.name || '—'}</td>
                  <td className="px-3 py-2 text-text max-w-[200px] truncate" title={row.task}>
                    {row.task || '—'}
                    {needsAttach && <span className="text-danger font-bold ml-1" title="Attachment Mandatory">*</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ongoing && row.expectedDate ? (
                      <div className="flex flex-col">
                        <span className="font-semibold text-primary">{fmtDate(row.expectedDate)}</span>
                        <span className="text-[10.5px] text-text-muted">from {fmtDate(row.planned)}</span>
                      </div>
                    ) : (
                      <span className="text-text-muted">{fmtDate(row.planned)}</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${row.actual ? 'text-primary' : 'text-text-muted'}`}>
                    {fmtDateTime(row.actual)}
                  </td>
                  <td className="px-3 py-2 max-w-[160px]">
                    {row.remarks ? (
                      <span className="bg-surface-2 rounded px-1.5 py-0.5 text-text block truncate" title={row.remarks}>
                        {row.remarks}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 min-w-[130px]">
                    {done ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-primary font-semibold flex items-center gap-1">✅ Done</span>
                        {canUndoUser && (
                          <button
                            type="button"
                            onClick={() => handleUndo(row)}
                            disabled={saving}
                            className="w-full text-[11px] font-semibold text-danger bg-danger-tint border border-danger/25 rounded-md px-2 py-1 disabled:opacity-60"
                          >
                            ↩️ Undo
                          </button>
                        )}
                      </div>
                    ) : markDoneRowId === row.id ? (
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          value={remarksDraft}
                          onChange={(e) => setRemarksDraft(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && submitMarkDone(row)}
                          placeholder="Remarks (optional)..."
                          autoFocus
                          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11.5px] text-text outline-none"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => submitMarkDone(row)}
                            disabled={saving}
                            className="flex-1 text-[11px] font-semibold bg-primary text-white rounded-md py-1 disabled:opacity-60"
                          >
                            ✅ Submit
                          </button>
                          <button
                            type="button"
                            onClick={() => setMarkDoneRowId(null)}
                            className="text-[11px] text-text-muted border border-border rounded-md px-2"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : attachMissing ? (
                      <button
                        type="button"
                        onClick={blockedMarkDone}
                        title="First upload 📎 the document"
                        className="w-full text-[11px] font-semibold text-danger bg-danger-tint border border-dashed border-danger/40 rounded-md px-2 py-1.5"
                      >
                        📎 Upload Required
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openMarkDone(row)}
                        className="w-full text-[11px] font-semibold text-white bg-primary rounded-md px-2 py-1.5"
                      >
                        ✅ Mark Done
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 min-w-[120px]">
                    {done ? (
                      <span className="text-primary font-semibold text-[11.5px]">✅ Done</span>
                    ) : ongoing ? (
                      <div className="flex flex-col">
                        <span className="text-primary font-semibold text-[11.5px]">🔄 Ongoing</span>
                        {row.expectedDate && <span className="text-[10.5px] text-text-muted">📅 {fmtDate(row.expectedDate)}</span>}
                      </div>
                    ) : ongoingRowId === row.id ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9.5px] text-text-muted uppercase tracking-wide">Expected Completion</label>
                        <input
                          type="date"
                          value={ongoingDraft}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setOngoingDraft(e.target.value)}
                          className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11.5px] text-text outline-none"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => submitOngoing(row)}
                            disabled={savingId === row.id}
                            className="flex-1 text-[11px] font-semibold bg-primary text-white rounded-md py-1 disabled:opacity-60"
                          >
                            ✓ Set
                          </button>
                          <button
                            type="button"
                            onClick={() => setOngoingRowId(null)}
                            className="text-[11px] text-text-muted border border-border rounded-md px-2"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openOngoing(row)}
                        className="w-full text-[11px] font-semibold text-primary bg-primary-tint border border-primary/25 rounded-md px-2 py-1.5"
                      >
                        🔄 Ongoing
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.uploadUrl ? (
                      <a
                        href={row.uploadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="See your uploaded file"
                        className="inline-flex w-8 h-8 items-center justify-center rounded-md bg-primary-tint border border-primary/25 text-primary"
                      >
                        📄
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenUpload(row.id, row.task)}
                        title={attachMissing ? 'Mandatory — File/PDF' : 'Upload file'}
                        className={`relative inline-flex w-8 h-8 items-center justify-center rounded-md border ${
                          attachMissing ? 'bg-danger-tint border-danger/40 text-danger' : 'bg-primary-tint border-primary/25 text-primary'
                        }`}
                      >
                        📎
                        {needsAttach && <span className="absolute -top-1 -right-1 text-danger font-bold text-[11px]">*</span>}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 px-4 py-3 border-t border-border flex-wrap">
          <span className="text-[11px] text-text-muted mr-2">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="text-[11.5px] rounded-md border border-border bg-surface-2 text-text px-2.5 py-1 disabled:opacity-40"
          >
            ‹
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`text-[11.5px] rounded-md border px-2.5 py-1 ${
                p === page ? 'bg-primary text-white border-primary' : 'border-border bg-surface-2 text-text'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="text-[11.5px] rounded-md border border-border bg-surface-2 text-text px-2.5 py-1 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
