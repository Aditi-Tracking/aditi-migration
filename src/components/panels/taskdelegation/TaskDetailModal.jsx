import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import OverlayShell from '../../shared/OverlayShell'
import { useAttachmentCache } from '../../../hooks/useAttachmentCache'
import {
  TD_ATTACHMENT_MAX_BYTES,
  TD_STATUS_META,
  assigneeNamesForTask,
  canRemoveAttachment,
  deleteAttachment,
  fetchAttachments,
  fmtDate,
  fmtDateTime,
  saveNote,
  saveTentativeDate,
  setMyTaskStatus,
  uploadTaskAttachment,
} from '../../../lib/taskDelegation'
import TaskStatusBadge from './TaskStatusBadge'
import AttachmentLightbox from './AttachmentLightbox'

// Ported from old-portal/js/taskDelegation.js's tdOpenTaskDetailModal and its supporting
// functions. Shared by both roles — MD gets a read-only note + an Edit button in the header;
// an assignee gets an editable note (saved onBlur) + tentative-date picker + a 3-way status
// control (not a cycling toggle, so status can move backward) instead. Attachments are a shared
// thread on the task, editable by whichever role is looking (upload) or gated per-uploader
// (remove).
export default function TaskDetailModal({ taskId, tasks, assignees, taskAssigneeMap, isMdUser, onClose, onEdit, onTaskPatched }) {
  const { currentUser } = useAuth()
  const open = !!taskId
  const task = tasks.find((t) => String(t.id) === String(taskId))

  const [noteInput, setNoteInput] = useState('')
  const [tentativeInput, setTentativeInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploadBusy, setUploadBusy] = useState(false)
  const [lightboxAttachment, setLightboxAttachment] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const boxRef = useRef(null)
  const { getUrl, clear } = useAttachmentCache()

  useEffect(() => {
    if (!open || !task) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the modal's local state whenever the open task changes, not a render loop
    setNoteInput(task.note || '')
    setTentativeInput(task.tentative_date || '')
    setAttachments([])
    setLightboxAttachment(null)
    setUploadBusy(false)
    fetchAttachments(task.id).then((rows) => {
      // Guards against a slow fetch resolving after the modal moved to a different task.
      setAttachments((prev) => (task && String(taskId) === String(task.id) ? rows : prev))
    })
    // tabIndex="-1" + immediate focus is what lets Ctrl+V paste-to-upload work the instant the
    // modal opens, without requiring the user to click into a field first.
    boxRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the open task actually changes
  }, [open, taskId])

  useEffect(() => {
    if (!open) clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear the blob cache whenever the modal fully closes
  }, [open])

  if (!task) return null

  async function handleStatusClick(status) {
    if (task.status === status) return
    const patch = await setMyTaskStatus(task.id, status)
    onTaskPatched(task.id, patch)
  }

  async function handleNoteBlur() {
    if (noteInput === (task.note || '')) return
    try {
      await saveNote(task.id, noteInput)
      onTaskPatched(task.id, { note: noteInput })
    } catch (e) {
      alert('❌ Failed to save note: ' + e.message)
    }
  }

  async function handleTentativeChange(value) {
    setTentativeInput(value)
    try {
      const newVal = await saveTentativeDate(task.id, value)
      onTaskPatched(task.id, { tentative_date: newVal })
    } catch (e) {
      alert('❌ Failed to save planned date: ' + e.message)
    }
  }

  async function handleFiles(fileList) {
    if (uploadBusy) return // an upload is already running — ignore the repeat trigger instead of racing it
    const files = Array.from(fileList || [])
    if (!files.length) return
    setUploadBusy(true)
    try {
      for (const file of files) {
        if (file.size > TD_ATTACHMENT_MAX_BYTES) {
          alert(`❌ "${file.name}" is larger than 10MB and was skipped.`)
          continue
        }
        try {
          await uploadTaskAttachment(task.id, file, currentUser.email)
        } catch (e) {
          alert(`❌ Failed to upload "${file.name}": ${e.message}`)
        }
      }
      setAttachments(await fetchAttachments(task.id))
    } finally {
      setUploadBusy(false)
    }
  }

  function handlePaste(e) {
    const items = e.clipboardData && e.clipboardData.items
    if (!items) return
    const imageItem = Array.from(items).find((item) => item.type && item.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    const named = new File([file], file.name || `pasted-${Date.now()}.png`, { type: file.type })
    handleFiles([named])
  }

  async function handleOpenAttachment(a) {
    if ((a.file_type || '').startsWith('image/')) {
      const url = await getUrl(a.file_path)
      setLightboxAttachment(a)
      setLightboxUrl(url)
      return
    }
    try {
      const url = await getUrl(a.file_path)
      const link = document.createElement('a')
      link.href = url
      link.download = a.file_name
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      alert('❌ Failed to open attachment: ' + e.message)
    }
  }

  async function handleRemoveAttachment(a, e) {
    e.stopPropagation()
    if (!confirm('Remove this attachment? This cannot be undone.')) return
    try {
      await deleteAttachment(a)
    } catch (e2) {
      alert('❌ Failed to remove attachment: ' + e2.message)
      return
    }
    setAttachments(await fetchAttachments(task.id))
  }

  return (
    <>
      <OverlayShell open={open} onClose={onClose} maxWidth="max-w-4xl">
        <div ref={boxRef} tabIndex={-1} onPaste={handlePaste} className="outline-none">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-[16px] font-semibold text-text truncate">{task.task_title}</div>
              <TaskStatusBadge status={task.status} />
            </div>
            {isMdUser && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onEdit(task.id)
                }}
                title="Edit"
                aria-label="Edit"
                className="px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text"
              >
                ✏️
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left column: read-only task metadata */}
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted opacity-70 mb-1.5">Task Details</div>
              <div className="rounded-xl border border-border bg-surface-2 divide-y divide-border mb-4">
                <DetailRow label="Assigned To" value={assigneeNamesForTask(task, taskAssigneeMap, assignees)} />
                <DetailRow label="Assigned By" value={task.assigned_by || '—'} />
                <DetailRow label="Due Date" value={fmtDate(task.due_date)} />
                <DetailRow label="Tentative Date" value={task.tentative_date ? fmtDate(task.tentative_date) : 'Not set yet'} />
              </div>

              <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted opacity-70 mb-1.5">📄 Description</div>
              <div className="rounded-xl bg-surface-2 border-l-[3px] border-primary px-4 py-3.5 min-h-[100px] mb-4">
                <div className="text-[13px] text-text whitespace-pre-wrap">{task.task_description || '—'}</div>
              </div>

              <div className="flex justify-between items-center mb-2.5">
                <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted opacity-70">📎 Attachments</div>
                <label className={`px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-[11.5px] font-semibold cursor-pointer ${uploadBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                  {uploadBusy ? '⏳ Uploading…' : '+ Upload'}
                  <input
                    type="file"
                    multiple
                    disabled={uploadBusy}
                    onChange={(e) => {
                      handleFiles(e.target.files)
                      e.target.value = ''
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className={`border border-dashed border-border rounded-xl px-3.5 py-3 text-center text-text-muted text-[11.5px] mb-3.5 ${uploadBusy ? 'opacity-60' : ''}`}>
                📋 Paste a screenshot here (Ctrl+V), or click <strong className="text-text">+ Upload</strong> to choose a file
              </div>
              {!attachments.length ? (
                <p className="text-text-muted text-[12px]">No attachments yet.</p>
              ) : (
                <div className="flex flex-wrap gap-3.5">
                  {attachments.map((a) => (
                    <AttachmentThumb
                      key={a.id}
                      attachment={a}
                      getUrl={getUrl}
                      canRemove={canRemoveAttachment(a, currentUser, isMdUser)}
                      onOpen={() => handleOpenAttachment(a)}
                      onRemove={(e) => handleRemoveAttachment(a, e)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right column: note (read-only for MD / editable for assignee) + assignee's actions */}
            <div>
              {isMdUser ? (
                <div className="mb-4">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted opacity-70 mb-1.5">📝 Assignee's Note</div>
                  <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-3 min-h-[70px]">
                    <div className="text-[13px] text-text whitespace-pre-wrap">{task.note || '(no note yet)'}</div>
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted opacity-70 mb-1.5">📝 Your Note</div>
                  <textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    onBlur={handleNoteBlur}
                    rows={4}
                    placeholder="Add a note…"
                    className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none resize-none mb-3"
                  />
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-[11px] text-text-muted mb-1">When will you do this?</label>
                      <input
                        type="date"
                        value={tentativeInput}
                        onChange={(e) => handleTentativeChange(e.target.value)}
                        className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
                      />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {/* Each button sets its own status directly (not a cycling toggle) so the
                          assignee can also move backward — e.g. Completed -> Ongoing. */}
                      {Object.entries(TD_STATUS_META).map(([status, m]) => {
                        const active = task.status === status
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => handleStatusClick(status)}
                            className="rounded-lg px-3 py-1.5 text-[12px] font-bold border whitespace-nowrap"
                            style={{
                              borderColor: active ? m.color : 'var(--color-border)',
                              background: active ? m.color + '22' : 'var(--color-surface-2)',
                              color: active ? m.color : 'var(--color-text-muted)',
                            }}
                          >
                            {m.icon} {m.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {task.status === 'completed' && (
                <div className="text-[12px] text-text-muted mb-4">Completed at: {fmtDateTime(task.completed_at)}</div>
              )}
            </div>
          </div>
        </div>
      </OverlayShell>

      <AttachmentLightbox
        attachment={lightboxAttachment}
        url={lightboxUrl}
        onClose={() => {
          setLightboxAttachment(null)
          setLightboxUrl(null)
        }}
      />
    </>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-baseline gap-2 px-3.5 py-2">
      <span className="min-w-[110px] shrink-0 text-[11.5px] font-semibold text-text-muted">{label}</span>
      <span className="text-[13px] font-semibold text-text">{value}</span>
    </div>
  )
}

// Compact square-thumbnail grid — same visual density as Field Service's photo picker.
// Uploader/timestamp move into a title="" tooltip so the grid itself stays clean.
function AttachmentThumb({ attachment: a, getUrl, canRemove, onOpen, onRemove }) {
  const [url, setUrl] = useState(null)
  const isImage = (a.file_type || '').startsWith('image/')
  const tooltip = `${a.file_name} · ${a.uploaded_by} · ${fmtDateTime(a.uploaded_at)}`

  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    getUrl(a.file_path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [a.file_path, isImage, getUrl])

  return (
    <div className="relative w-[72px] shrink-0">
      <div
        onClick={onOpen}
        title={tooltip}
        className="w-[72px] h-[72px] rounded-lg border border-border bg-surface-2 flex items-center justify-center overflow-hidden cursor-pointer text-[26px]"
      >
        {isImage ? url && <img src={url} alt="" className="w-full h-full object-cover" /> : '📄'}
      </div>
      {!isImage && (
        <div title={tooltip} className="text-[9.5px] text-text-muted text-center mt-1 w-[72px] truncate">
          {a.file_name}
        </div>
      )}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          aria-label="Remove"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white text-[10px] leading-5"
        >
          ✕
        </button>
      )}
    </div>
  )
}
