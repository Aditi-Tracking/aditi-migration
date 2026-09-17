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
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import { CheckboxTh, CheckboxTd } from '../../shared/table/CheckboxCell'
import TopPagination from '../../shared/table/TopPagination'

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Ported from old-portal/js/tasks.js's tRenderTable + deptShowRemarksInput/
// deptSubmitDone/tUndoTask/tShowOngoing/tSubmitOngoing. No single-row
// delete exists in production — delete is bulk-checkbox-only.
// Migrated onto the shared table system (src/components/shared/table/) —
// markup/styling only, the bulk-delete flow itself (including the
// tFetchTasks() reload fix) lives in TaskChecklistPanel.jsx and is
// untouched here. Also restores the select-all checkbox's indeterminate
// state (old-portal/js/tasks.js:1020's `all.indeterminate = ...`), which
// the original React port never carried over — a straight production-
// parity fix, not a new behavior.
export default function TaskTable({
  rows,
  total,
  page,
  pageSize,
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
  const someSelectedOnPage = rows.some((r) => selectedIds.has(r.id))

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
    <Table
      title="All Tasks"
      actions={
        <div className="flex items-center gap-2">
          {canDelete && selectedIds.size > 0 && (
            <button
              type="button"
              onClick={onDeleteSelected}
              className="text-[11.5px] font-semibold text-danger bg-danger-tint border border-danger/25 rounded-md px-3 py-1.5"
            >
              🗑️ Delete Selected ({selectedIds.size})
            </button>
          )}
          <TopPagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
        </div>
      }
    >
      <TableHead>
        {canDelete && <CheckboxTh checked={allChecked} indeterminate={someSelectedOnPage && !allChecked} onChange={toggleSelectAll} />}
        <Th>Name</Th>
        <Th>Task</Th>
        <Th>Planned</Th>
        <Th>Actual</Th>
        <Th>Remarks</Th>
        <Th>Action</Th>
        <Th>Ongoing</Th>
        <Th align="center">Upload</Th>
      </TableHead>
      <tbody>
        {!rows.length && (
          <tr>
            <Td colSpan={9} align="center" className="py-10 text-text-muted">
              No tasks found
            </Td>
          </tr>
        )}
        {rows.map((row) => {
          const done = isDone(row)
          const ongoing = !done && isOngoing(row)
          const needsAttach = taskRequiresAttachment(row.task)
          const attachMissing = needsAttach && !hasAttachment(row)
          const saving = savingId === row.id

          return (
            <Tr key={row.id}>
              {canDelete && <CheckboxTd checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} />}
              <Td className="max-w-[130px] truncate font-semibold text-text" title={row.name || ''}>
                {row.name || '—'}
              </Td>
              <Td className="text-text max-w-[200px] truncate" title={row.task}>
                {row.task || '—'}
                {needsAttach && <span className="text-danger font-bold ml-1" title="Attachment Mandatory">*</span>}
              </Td>
              <Td className="whitespace-nowrap">
                {ongoing && row.expectedDate ? (
                  <div className="flex flex-col">
                    <span className="font-semibold text-primary">{fmtDate(row.expectedDate)}</span>
                    <span className="text-[10.5px] text-text-muted">from {fmtDate(row.planned)}</span>
                  </div>
                ) : (
                  <span className="text-text-muted">{fmtDate(row.planned)}</span>
                )}
              </Td>
              <Td className={`whitespace-nowrap ${row.actual ? 'text-primary' : 'text-text-muted'}`}>{fmtDateTime(row.actual)}</Td>
              <Td className="max-w-[160px]">
                {row.remarks ? (
                  <span className="bg-surface-2 rounded px-1.5 py-0.5 text-text block truncate" title={row.remarks}>
                    {row.remarks}
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </Td>
              <Td className="min-w-[130px]">
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
              </Td>
              <Td className="min-w-[120px]">
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
              </Td>
              <Td align="center">
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
              </Td>
            </Tr>
          )
        })}
      </tbody>
    </Table>
  )
}
