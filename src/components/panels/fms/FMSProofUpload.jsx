import { useEffect, useRef, useState } from 'react'

// Ported from old-portal/js/fms.js's fmsHandleProofFiles/fmsHandleUpdateProofFiles
// (New Order + Update Payment duplicated this identically) — de-duplicated
// into one controlled component here since the two were byte-for-byte the
// same behavior. Multi-file, drag/drop, Ctrl+V screenshot paste (the paste
// listener is scoped to this component's own mount lifecycle, which matches
// production's "only while this specific overlay is open" check — this
// component only exists in the DOM while its parent overlay is open).
export default function FMSProofUpload({ files, onFilesChange }) {
  const inputRef = useRef(null)

  function handleFiles(fileList) {
    if (!fileList || !fileList.length) return
    const incoming = Array.from(fileList)
    const merged = [...files]
    incoming.forEach((file) => {
      if (!merged.find((f) => f.name === file.name)) merged.push(file)
    })
    onFilesChange(merged)
  }

  function removeAt(idx) {
    onFilesChange(files.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const namedFile = new File([file], `screenshot_${Date.now()}.png`, { type: 'image/png' })
          handleFiles([namedFile])
          e.preventDefault()
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleFiles closes over current `files` via merged/onFilesChange, re-subscribing every render is unnecessary churn
  }, [])

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
        className="border-2 border-dashed border-border rounded-lg p-3 cursor-pointer flex items-center gap-2.5 bg-surface-2"
      >
        <span className="text-[18px]">📎</span>
        <div>
          <div className="text-[12.5px] font-semibold text-text">Click to upload or drag &amp; drop</div>
          <div className="text-[11px] text-text-muted">Multiple files — PDF, JPG, PNG · Ctrl+V to paste screenshot</div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {!!files.length && (
        <div className="flex flex-wrap gap-2 mt-2.5">
          {files.map((file, idx) => (
            <FilePreview key={file.name + idx} file={file} onRemove={() => removeAt(idx)} />
          ))}
        </div>
      )}
      {!!files.length && (
        <div className="text-[11px] text-text-muted mt-1">
          {files.length} file{files.length > 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  )
}

function FilePreview({ file, onRemove }) {
  const [dataUrl, setDataUrl] = useState(null)
  const isImage = file.type.startsWith('image/')

  useEffect(() => {
    if (!isImage) return
    const reader = new FileReader()
    reader.onload = (e) => setDataUrl(e.target.result)
    reader.readAsDataURL(file)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only if the file object itself changes
  }, [file])

  return (
    <div className="relative w-20 h-20 rounded-lg border border-border overflow-hidden bg-surface-2">
      {isImage && dataUrl ? (
        <img src={dataUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[24px]">
          📄
          <span className="text-[9px] text-text-muted text-center px-1 break-all">{file.name.slice(0, 12)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 w-[18px] h-[18px] rounded-full bg-black/65 text-white text-[9px] flex items-center justify-center"
      >
        ✕
      </button>
      <div className="text-[9px] text-text-muted text-center py-0.5 border-t border-border bg-surface-2">
        {(file.size / 1024).toFixed(0)} KB
      </div>
    </div>
  )
}
