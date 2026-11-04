import { useEffect, useRef, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { uploadTaskAttachment } from '../../../lib/taskChecklist'

// Ported from old-portal/js/tasks.js's tOpenTaskUpload/tProcessTaskFile/
// tSubmitTaskUpload — click, drag & drop, or Ctrl+V paste of a screenshot,
// all funneling into the same upload call. Only opened for tasks with no
// existing attachment (see TaskTable's uploadUrl branch), so there's no
// "existing files" list to show here.
// Multi-file: click/drag-drop/paste all ADD to the selection rather than replacing it, so a mix of
// (e.g.) two screenshots pasted one after another both end up queued for the same upload.
export default function TaskUploadModal({ target, onClose, onUploaded }) {
  const [files, setFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState(null) // { text, kind: 'info'|'success'|'error' } | null
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!target) return
    // Reset fresh each time a new task opens — it stays mounted between opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiles([])
    setStatus(null)
    setUploading(false)
  }, [target])

  useEffect(() => {
    if (!target) return
    function onPaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const pasted = item.getAsFile()
          if (!pasted) continue
          setFiles((prev) => [...prev, new File([pasted], `screenshot_${Date.now()}.png`, { type: 'image/png' })])
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [target])

  if (!target) return null

  function addFiles(list) {
    const picked = Array.from(list || [])
    if (picked.length) setFiles((prev) => [...prev, ...picked])
  }

  function removeFile(i) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    if (!files.length) {
      alert('Please select at least one file first!')
      return
    }
    setUploading(true)
    setStatus({ text: '⏳ Uploading...', kind: 'info' })
    try {
      const savedValue = await uploadTaskAttachment({ id: target.id, files })
      const isCloud = savedValue.startsWith('http')
      onUploaded(target.id, savedValue)
      setStatus(
        isCloud
          ? { text: `✅ Upload successful! ${files.length > 1 ? `${files.length} files saved` : 'File saved'} to cloud.`, kind: 'success' }
          : { text: '⚠️ Cloud upload failed — saved locally only', kind: 'error' }
      )
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setStatus({ text: '❌ Error: ' + e.message, kind: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const statusColor = status?.kind === 'success' ? 'text-primary bg-primary-tint' : status?.kind === 'error' ? 'text-danger bg-danger-tint' : 'text-text-muted bg-surface-2'

  return (
    <OverlayShell open={!!target} onClose={onClose} maxWidth="max-w-md">
      <div className="pr-8 mb-4">
        <div className="text-[15px] font-semibold text-text">📎 Upload Attachment</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">{target.task}</div>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          addFiles(e.dataTransfer.files)
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          dragActive || files.length ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'
        }`}
      >
        <div className="text-[13px] font-medium text-text">{files.length ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Click, drag & drop, or paste (Ctrl+V)'}</div>
        <div className="text-[11px] text-text-muted mt-1">
          {files.length ? 'Click to add more' : 'You can upload one or more files, drag & drop, or copy-paste screenshots directly'}
        </div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </div>

      {!!files.length && (
        <div className="flex flex-col gap-1 mt-3">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-text">
              <span className="flex-1 truncate">📄 {f.name}</span>
              <span className="text-text-muted shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
              <button type="button" onClick={() => removeFile(i)} className="text-text-muted hover:text-danger shrink-0" title="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {status && <div className={`mt-3 rounded-md px-3 py-2 text-[12px] text-center ${statusColor}`}>{status.text}</div>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={uploading || !files.length}
        className="w-full mt-3 rounded-md bg-primary text-white text-[13px] font-semibold py-2.5 disabled:opacity-60"
      >
        {uploading ? 'Uploading…' : `Upload${files.length > 1 ? ` (${files.length})` : ''}`}
      </button>
    </OverlayShell>
  )
}
