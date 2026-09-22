import { useEffect, useRef, useState } from 'react'
import { CN } from '../../lib/contentNodes'
import {
  createCardOnly,
  extractYoutubeId,
  flattenCardTree,
  invalidateContentNodes,
  resolveTargetNode,
  saveYoutubeLink,
  uploadFiles,
} from '../../lib/cnUploadDelete'
import OverlayShell from './OverlayShell'

// Ported from old-portal/js/upload.js's openUploadModal/submitUpload/_submitYoutubeLink/
// createCardOnly. One shared modal, parametrized by `sectionName` (the exact content_nodes
// section name — must match what the owning panel passes to CN.getSection elsewhere).
export default function UploadModal({ open, sectionName, onClose, onUploaded }) {
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [cats, setCats] = useState([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [subCats, setSubCats] = useState([])
  const [selectedSubCardId, setSelectedSubCardId] = useState('') // '' = upload to parent

  const [newCardType, setNewCardType] = useState('top') // 'top' | 'sub'
  const [newSubParentOptions, setNewSubParentOptions] = useState([])
  const [newSubParentId, setNewSubParentId] = useState('')
  const [newCardName, setNewCardName] = useState('')
  const [creatingCardOnly, setCreatingCardOnly] = useState(false)
  const [cardOnlyStatus, setCardOnlyStatus] = useState(null) // { ok, message } | null

  const [uploadType, setUploadType] = useState('file') // 'file' | 'youtube'
  const [files, setFiles] = useState([])
  const [displayName, setDisplayName] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')

  const [progress, setProgress] = useState(null) // { pct, label } | null
  const [status, setStatus] = useState(null) // { ok, message } | null
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets every field each time the modal opens
    setMode('existing')
    setSelectedCardId('')
    setSubCats([])
    setSelectedSubCardId('')
    setNewCardType('top')
    setNewSubParentOptions([])
    setNewSubParentId('')
    setNewCardName('')
    setCardOnlyStatus(null)
    setUploadType('file')
    setFiles([])
    setDisplayName('')
    setYoutubeUrl('')
    setProgress(null)
    setStatus(null)
    setSubmitting(false)
    CN.load().then(() => {
      const section = CN.getSection(sectionName)
      const options = section ? CN.getCategories(section.id) : []
      setCats(options)
      if (options.length) setSelectedCardId(String(options[0].id))
    })
  }, [open, sectionName])

  useEffect(() => {
    if (!selectedCardId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-derives the sub-card list whenever the selected card changes
      setSubCats([])
      return
    }
    setSubCats(flattenCardTree(parseInt(selectedCardId)))
    setSelectedSubCardId('')
  }, [selectedCardId])

  useEffect(() => {
    if (mode !== 'new' || newCardType !== 'sub') return
    const section = CN.getSection(sectionName)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-derives the parent-card picker whenever New Card / Sub-Card mode is entered
    setNewSubParentOptions(section ? flattenCardTree(section.id) : [])
  }, [mode, newCardType, sectionName])

  if (!open) return null

  function handleFilesChosen(fileList) {
    const list = Array.from(fileList || [])
    if (!list.length) return
    setFiles(list)
    if (list.length === 1 && !displayName.trim()) {
      setDisplayName(list[0].name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '))
    }
  }

  function handleYoutubeUrlChange(val) {
    setYoutubeUrl(val)
    const id = extractYoutubeId(val)
    if (id && !displayName.trim()) setDisplayName('YouTube Video')
  }

  async function handleCreateCardOnly() {
    if (!newCardName.trim()) {
      setCardOnlyStatus({ ok: false, message: 'Please enter a card name first.' })
      return
    }
    setCreatingCardOnly(true)
    setCardOnlyStatus(null)
    try {
      await createCardOnly({
        section: sectionName,
        newCardType,
        newCardName: newCardName.trim(),
        newSubParentId: newSubParentId ? parseInt(newSubParentId) : null,
      })
      setCardOnlyStatus({ ok: true, message: `✅ ${newCardType === 'sub' ? 'Sub-card' : 'Card'} "${newCardName.trim()}" created successfully!` })
      setNewCardName('')
      await invalidateContentNodes()
      onUploaded?.()
      if (newCardType === 'sub') {
        const section = CN.getSection(sectionName)
        setNewSubParentOptions(section ? flattenCardTree(section.id) : [])
      }
    } catch (e) {
      setCardOnlyStatus({ ok: false, message: '❌ ' + e.message })
    } finally {
      setCreatingCardOnly(false)
    }
  }

  async function handleSubmit() {
    const trimmedName = displayName.trim()
    const isYoutube = uploadType === 'youtube'
    const isMulti = files.length > 1

    if (isYoutube) {
      const ytId = extractYoutubeId(youtubeUrl)
      if (!ytId) return setStatus({ ok: false, message: '⚠️ Please enter a valid YouTube link.' })
      if (!trimmedName) return setStatus({ ok: false, message: '⚠️ Please enter a display name.' })
    } else {
      if (!files.length) return setStatus({ ok: false, message: '⚠️ Please select a file first.' })
      if (!isMulti && !trimmedName) return setStatus({ ok: false, message: '⚠️ Please enter a display name for the file.' })
    }
    if (mode === 'new' && !newCardName.trim()) return setStatus({ ok: false, message: '⚠️ Please enter a card name.' })

    setSubmitting(true)
    setStatus(null)
    try {
      const useSubCard = selectedSubCardId && selectedSubCardId !== ''
      const nodeId = await resolveTargetNode({
        section: sectionName,
        mode,
        existingNodeId: mode === 'existing' ? parseInt(useSubCard ? selectedSubCardId : selectedCardId) : null,
        newCardType,
        newCardName: newCardName.trim(),
        newSubParentId: newSubParentId ? parseInt(newSubParentId) : null,
      })

      if (isYoutube) {
        setProgress({ pct: 70, label: 'Saving link…' })
        await saveYoutubeLink({ nodeId, displayName: trimmedName, youtubeUrl })
      } else {
        setProgress({ pct: 5, label: isMulti ? `Uploading file 1 of ${files.length}…` : 'Uploading…' })
        await uploadFiles({
          section: sectionName,
          nodeId,
          files,
          displayName: trimmedName,
          onFileProgress: (i, pct) => {
            const base = Math.round((i / files.length) * 100)
            const chunk = Math.round(pct / files.length)
            setProgress({ pct: base + chunk, label: isMulti ? `Uploading file ${i + 1} of ${files.length}…` : `Uploading… ${pct}%` })
          },
        })
      }

      setProgress({ pct: 100, label: 'Done!' })
      setStatus({ ok: true, message: isMulti ? `✅ ${files.length} files uploaded successfully!` : isYoutube ? '✅ YouTube link saved successfully!' : '✅ File uploaded successfully!' })
      await invalidateContentNodes()
      onUploaded?.()
      setTimeout(() => onClose(), 1400)
    } catch (e) {
      setStatus({ ok: false, message: '❌ ' + e.message })
      setSubmitting(false)
    }
  }

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="mb-4">
        <div className="text-[17px] font-bold text-text">Upload to {sectionName}</div>
        <div className="text-[14px] text-text-muted mt-0.5">Choose a card then pick your file</div>
      </div>

      <div className="flex gap-2 mb-3.5">
        <ToggleButton active={mode === 'existing'} onClick={() => setMode('existing')}>
          Existing Card
        </ToggleButton>
        <ToggleButton active={mode === 'new'} onClick={() => setMode('new')}>
          New Card
        </ToggleButton>
      </div>

      {mode === 'existing' ? (
        <div className="mb-3">
          <FieldLabel>Select Card</FieldLabel>
          <select value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text mb-2.5">
            {!cats.length && <option value="">No cards yet — create one below</option>}
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.Name}
              </option>
            ))}
          </select>
          {subCats.length > 0 && (
            <div>
              <FieldLabel>Sub-Card (optional)</FieldLabel>
              <select value={selectedSubCardId} onChange={(e) => setSelectedSubCardId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text">
                <option value="">— Upload directly to parent card —</option>
                {subCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3">
          <div className="flex gap-2 mb-2.5">
            <ToggleButton active={newCardType === 'top'} onClick={() => setNewCardType('top')}>
              Top-Level Card
            </ToggleButton>
            <ToggleButton active={newCardType === 'sub'} onClick={() => setNewCardType('sub')} accent="#a78bfa">
              Sub-Card
            </ToggleButton>
          </div>
          {newCardType === 'sub' && (
            <div className="mb-2.5">
              <FieldLabel>Parent Card</FieldLabel>
              <select value={newSubParentId} onChange={(e) => setNewSubParentId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text">
                <option value="">{newSubParentOptions.length ? 'Select a parent card' : 'No cards yet in this section'}</option>
                {newSubParentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <FieldLabel>{newCardType === 'sub' ? 'Sub-Card Name' : 'New Card Name'}</FieldLabel>
          <input
            type="text"
            value={newCardName}
            onChange={(e) => setNewCardName(e.target.value)}
            placeholder="e.g. Onboarding Kit"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text mb-2"
          />
          <button
            type="button"
            onClick={handleCreateCardOnly}
            disabled={creatingCardOnly}
            className="w-full rounded-lg border border-border bg-surface-2 text-text text-[14.5px] font-bold py-2 disabled:opacity-60"
          >
            {creatingCardOnly ? '⏳ Creating…' : '✨ Create Card Only (no file)'}
          </button>
          {cardOnlyStatus && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-[14px] border ${cardOnlyStatus.ok ? 'border-primary/30 bg-primary-tint text-primary' : 'border-danger/30 bg-danger-tint text-danger'}`}>
              {cardOnlyStatus.message}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3.5 mb-2.5">
        <ToggleButton active={uploadType === 'file'} onClick={() => setUploadType('file')}>
          📄 File
        </ToggleButton>
        <ToggleButton active={uploadType === 'youtube'} onClick={() => setUploadType('youtube')} accent="#ff4444">
          ▶️ YouTube Link
        </ToggleButton>
      </div>

      {uploadType === 'file' ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            handleFilesChosen(e.dataTransfer.files)
          }}
          className="border border-dashed border-border rounded-xl px-4 py-5 text-center cursor-pointer"
        >
          <div className="text-[15.5px] font-bold text-text">{files.length ? `✅ ${files.length > 1 ? `${files.length} files selected` : files[0].name}` : 'Click to choose or drag & drop a file'}</div>
          <div className="text-[13.5px] text-text-muted mt-1">
            {files.length > 1
              ? `Total: ${(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2)} MB — names auto-filled from filenames`
              : files.length === 1
                ? `${(files[0].size / 1024 / 1024).toFixed(2)} MB — ${files[0].type || 'unknown type'}`
                : 'PDF, Video, Image, Doc — any format'}
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFilesChosen(e.target.files)} />
        </div>
      ) : (
        <div>
          <FieldLabel>YouTube URL</FieldLabel>
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => handleYoutubeUrlChange(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text"
          />
          {extractYoutubeId(youtubeUrl) && (
            <img src={`https://img.youtube.com/vi/${extractYoutubeId(youtubeUrl)}/hqdefault.jpg`} alt="" className="w-full rounded-lg border border-border mt-2.5" />
          )}
        </div>
      )}

      {files.length > 1 && (
        <div className="mt-2.5 max-h-[140px] overflow-y-auto flex flex-col gap-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-[14px]">
              <span className="text-primary font-extrabold min-w-[18px]">{i + 1}.</span>
              <span className="flex-1 text-text truncate">{f.name}</span>
              <span className="text-text-muted shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        <FieldLabel>Display Name</FieldLabel>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Name shown to users"
          disabled={files.length > 1}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text disabled:opacity-50"
        />
      </div>

      {progress && (
        <div className="mt-3.5">
          <div className="text-[13.5px] text-text-muted mb-1.5">{progress.label}</div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {status && (
        <div className={`mt-3 rounded-lg px-3 py-2.5 text-[14.5px] border ${status.ok ? 'border-primary/30 bg-primary-tint text-primary' : 'border-danger/30 bg-danger-tint text-danger'}`}>
          {status.message}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full mt-4 rounded-lg bg-primary text-white font-extrabold text-[15.5px] py-3 disabled:opacity-60"
      >
        {submitting ? 'Uploading…' : uploadType === 'youtube' ? 'Save YouTube Link' : 'Upload File'}
      </button>
    </OverlayShell>
  )
}

function ToggleButton({ active, onClick, accent = '#00d4aa', children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg border py-2.5 text-[14.5px] font-extrabold"
      style={active ? { borderColor: accent, background: accent + '1a', color: accent } : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
    >
      {children}
    </button>
  )
}

function FieldLabel({ children }) {
  return <label className="block text-[13.5px] font-bold text-text-muted mb-1.5">{children}</label>
}
