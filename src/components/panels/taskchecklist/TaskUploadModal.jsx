import { useEffect, useRef, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { uploadTaskAttachment } from '../../../lib/taskChecklist'

// Ported from old-portal/js/tasks.js's tOpenTaskUpload/tProcessTaskFile/
// tSubmitTaskUpload — click, drag & drop, or Ctrl+V paste of a screenshot,
// all funneling into the same upload call. Only opened for tasks with no
// existing attachment (see TaskTable's uploadUrl branch), so there's no
// "existing files" list to show here.
export default function TaskUploadModal({ target, onClose, onUploaded }) {
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState(null) // { text, kind: 'info'|'success'|'error' } | null
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!target) return
    // Reset fresh each time a new task opens — it stays mounted between opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFile(null)
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
          setFile(new File([pasted], `screenshot_${Date.now()}.png`, { type: 'image/png' }))
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [target])

  if (!target) return null

  async function handleSubmit() {
    if (!file) {
      alert('Please select a file first!')
      return
    }
    setUploading(true)
    setStatus({ text: '⏳ Uploading...', kind: 'info' })
    try {
      const savedValue = await uploadTaskAttachment({ id: target.id, file })
      const isCloud = savedValue.startsWith('http')
      onUploaded(target.id, savedValue)
      setStatus(
        isCloud
          ? { text: '✅ Upload successful! File saved to cloud.', kind: 'success' }
          : { text: '⚠️ Cloud upload failed — saved locally only', kind: 'error' }
      )
      setFile(null)
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
          const dropped = e.dataTransfer.files?.[0]
          if (dropped) setFile(dropped)
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          dragActive || file ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'
        }`}
      >
        <div className="text-[13px] font-medium text-text">{file ? file.name : 'Click, drag & drop, or paste (Ctrl+V)'}</div>
        <div className="text-[11px] text-text-muted mt-1">
          {file ? `${(file.size / 1024).toFixed(1)} KB` : 'You can upload a file, drag & drop, or copy-paste a screenshot directly'}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />
      </div>

      {status && <div className={`mt-3 rounded-md px-3 py-2 text-[12px] text-center ${statusColor}`}>{status.text}</div>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={uploading || !file}
        className="w-full mt-3 rounded-md bg-primary text-white text-[13px] font-semibold py-2.5 disabled:opacity-60"
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
    </OverlayShell>
  )
}
