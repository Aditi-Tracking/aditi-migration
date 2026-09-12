import { useEffect, useRef, useState } from 'react'
import CallScreenshotUpload from './CallScreenshotUpload'
import { submitCall, todayStr, uploadCallAttachments, validateScreenshotFiles } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's ruCustomerRowHtml's call-log panel
// + ruToggleConnectedFields/ruSaveCall/_ruUploadCallAttachments. Conditionally
// rendered by the parent (mount = "panel open"), which gives "reopening
// starts fresh" for free — production needs an explicit reset because its
// panel stays in the DOM the whole time, just hidden via style.display.
//
// Paste-to-add is scoped to THIS panel's own focused wrapper (tabIndex=-1 +
// focus-on-mount), not a global document listener — production does the
// same, deliberately, because multiple rows' call panels can be open at
// once (ruToggleCallPanel never closes any other row's panel), so paste
// must go to whichever panel actually has focus, not "whichever is open."
export default function CallLogPanel({ customer, crmPerson, onSaved, onCancel }) {
  const [connected, setConnected] = useState(null) // null | true | false
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [pendingFiles, setPendingFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  function addFiles(fileList) {
    const { files: next, errors } = validateScreenshotFiles(pendingFiles, Array.from(fileList))
    errors.forEach((msg) => alert('⚠️ ' + msg))
    setPendingFiles(next)
  }

  function removeFile(i) {
    const removed = pendingFiles[i]
    if (removed) URL.revokeObjectURL(removed.blobUrl)
    setPendingFiles(pendingFiles.filter((_, idx) => idx !== i))
  }

  function revokeAllPending() {
    pendingFiles.forEach((f) => URL.revokeObjectURL(f.blobUrl))
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItem = Array.from(items).find((item) => item.type?.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault() // an image on the clipboard has no business landing as text in Notes
    const file = imageItem.getAsFile()
    if (file) addFiles([file])
  }

  function handleCancel() {
    revokeAllPending()
    onCancel()
  }

  async function handleSave() {
    if (connected === null) {
      alert('⚠️ Please select Connected or Not Connected.')
      return
    }

    // Only meaningful when Connected — nothing was recovered on a call that
    // didn't go through, and the field itself is hidden for Not Connected.
    let amountRecovered = null
    if (connected) {
      const raw = amount.trim()
      if (raw !== '') {
        amountRecovered = Number(raw)
        if (!Number.isFinite(amountRecovered) || amountRecovered < 0) {
          alert('⚠️ Please enter a valid non-negative received amount.')
          return
        }
      }
    }

    if (!connected && !reason) {
      alert('⚠️ Please select a reason.')
      return
    }

    setSubmitting(true)
    try {
      const callDate = todayStr()
      const savedCall = await submitCall({
        customerId: customer.id,
        calledBy: crmPerson.id,
        callDate,
        connected,
        amountRecovered,
        notes: notes.trim(),
        notConnectedReason: connected ? null : reason,
      })

      if (pendingFiles.length) {
        try {
          await uploadCallAttachments(
            customer.id,
            savedCall.id,
            pendingFiles.map((p) => p.file)
          )
        } catch (attachErr) {
          // The call itself is already saved — surface the attachment
          // failure distinctly rather than letting it read as a total failure.
          alert('⚠️ Call saved, but attaching screenshots failed: ' + attachErr.message)
        }
      }

      revokeAllPending()
      onSaved({ callDate, connected, amountRecovered })
    } catch (e) {
      alert('❌ Could not save call: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      onPaste={handlePaste}
      className="outline-none max-w-[360px] rounded-xl border border-border bg-surface p-3.5 shadow-lg"
    >
      <div className="flex rounded-lg border border-border overflow-hidden mb-2.5">
        <button
          type="button"
          onClick={() => setConnected(true)}
          className={`flex-1 py-1.5 text-[12px] font-bold transition-colors ${
            connected === true ? 'bg-primary text-white' : 'text-text-muted'
          }`}
        >
          Connected
        </button>
        <button
          type="button"
          onClick={() => setConnected(false)}
          className={`flex-1 py-1.5 text-[12px] font-bold border-l border-border transition-colors ${
            connected === false ? 'bg-danger text-white' : 'text-text-muted'
          }`}
        >
          Not Connected
        </button>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Conversation notes…"
        rows={2}
        className="w-full rounded-lg border border-border bg-surface-2 text-text px-2.5 py-2 text-[12.5px] mb-2.5 outline-none resize-y"
      />

      {connected === false && (
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 text-text px-2 py-1.5 text-[12.5px] mb-2.5"
        >
          <option value="">Select reason…</option>
          <option value="no_answer">No Answer</option>
          <option value="switched_off">Switched Off</option>
          <option value="call_later">Call Later</option>
        </select>
      )}

      {connected === true && (
        <div className="mb-2.5">
          <label className="block text-[10.5px] text-text-muted mb-1">Amount received (optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-border bg-surface-2 text-text px-2 py-1 text-[12px]"
          />
        </div>
      )}

      <CallScreenshotUpload files={pendingFiles} onAddFiles={addFiles} onRemove={removeFile} />

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-primary text-white font-bold text-[12.5px] px-4 py-1.5 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save Call'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-border text-text-muted font-bold text-[12.5px] px-4 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
