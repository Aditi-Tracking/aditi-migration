import { useEffect, useRef, useState } from 'react'
import { RU_LOCATIONS, fetchImportJob, fetchUploadHistory, isValidExcelFile, uploadRenewalsFile } from '../../../lib/renewals'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 40 // ~2 minutes

// Ported from old-portal/js/renewals.js's loadRenewalsUpload/ruUpload/
// ruWatchProcessing/ruLoadHistory. Two distinct location concepts: `location`
// (the shared location bar, prop) decides which location's Upload History is
// shown; `uploadLocation` (this component's own state, always blank on entry
// and on every location-bar switch while mounted) decides where the file
// being uploaded gets tagged — conflating them would silently mistag an
// upload's data.
//
// The processing poll is scoped to this component's own mount lifetime
// (cleared on unmount, and also cancelled if the shared location changes
// mid-poll) rather than surviving navigation the way production's global
// timer does — a deliberate, agreed simplification: nothing is lost
// (import_jobs + Upload History always have the real outcome), only the
// live toast is affected if the user navigates away mid-poll.
export default function UploadTab({ location, allowedLocations }) {
  const [uploadLocation, setUploadLocation] = useState('')
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null) // { kind: 'info'|'success'|'error', text, summary } | null
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pollingFilePath, setPollingFilePath] = useState(null)

  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  const fileInputRef = useRef(null)

  function refreshHistory() {
    setHistoryLoading(true)
    setHistoryError('')
    fetchUploadHistory(location)
      .then(setHistory)
      .catch((e) => setHistoryError(e.message))
      .finally(() => setHistoryLoading(false))
  }

  // Fires on first mount AND whenever the shared location bar changes while
  // this tab stays open — mirrors ruSwitchLocation re-entering whichever tab
  // is active, which for Upload means loadRenewalsUpload() runs again.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh load triggered by a location change, not a synchronous render loop
    setUploadLocation('')
    setFile(null)
    setStatus(null)
    setSubmitting(false)
    setPollingFilePath(null) // cancels any in-progress poll tied to the previous location context
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError('')
    fetchUploadHistory(location)
      .then((files) => !cancelled && setHistory(files))
      .catch((e) => !cancelled && setHistoryError(e.message))
      .finally(() => !cancelled && setHistoryLoading(false))
    return () => {
      cancelled = true
    }
  }, [location])

  // Polls import_jobs directly instead of diffing row counts — the pipeline
  // upserts (same customer + same date = update, not insert), so
  // re-processing the same file never changes counts even on a fully
  // successful run.
  useEffect(() => {
    if (!pollingFilePath) return
    let attempts = 0
    let stopped = false

    function finish(job) {
      if (stopped) return
      stopped = true
      clearInterval(intervalId)
      if (job && job.status === 'done') {
        setStatus({
          kind: 'success',
          text: '✅ Done',
          summary: `Rows processed: ${job.rows_processed} · Matched: ${job.matched} · Unmatched: ${job.unmatched} · Missing from file (assumed paid): ${job.closed}`,
        })
      } else if (job && job.status === 'error') {
        setStatus({ kind: 'error', text: '❌ Processing failed', summary: job.error_message || 'Unknown error' })
      } else {
        setStatus({
          kind: 'error',
          text: '⚠️ Still processing after 2 minutes',
          summary: 'No status update yet — refresh this page shortly to re-check.',
        })
      }
      setFile(null)
      setUploadLocation('')
      setSubmitting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setPollingFilePath(null)
      refreshHistory()
    }

    const intervalId = setInterval(async () => {
      attempts++
      // A single failed poll tick must never kill the loop — retried next tick.
      let job = null
      try {
        job = await fetchImportJob(pollingFilePath)
      } catch {
        /* ignore — retried next tick */
      }
      const finished = job && job.status !== 'processing'
      if (finished || attempts >= MAX_POLL_ATTEMPTS) finish(job)
    }, POLL_INTERVAL_MS)

    return () => {
      stopped = true
      clearInterval(intervalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshHistory closes over the current `location`; re-run only when a NEW poll starts
  }, [pollingFilePath])

  function handleFileSelect(selected) {
    if (!selected) return
    if (!isValidExcelFile(selected)) {
      alert('⚠️ Please choose an .xlsx or .xls file.')
      return
    }
    setFile(selected)
  }

  async function handleSubmit() {
    if (!file || !uploadLocation) return
    setSubmitting(true)
    setStatus({ kind: 'info', text: '⏳ Uploading file…', summary: '' })
    try {
      const path = await uploadRenewalsFile(file, uploadLocation)
      setStatus({ kind: 'info', text: '⏳ Processing… (this runs in the background, may take a minute)', summary: '' })
      setPollingFilePath(path)
    } catch (e) {
      setStatus({ kind: 'error', text: '❌ ' + e.message, summary: '' })
      setSubmitting(false)
    }
  }

  const uploadLocationOptions = RU_LOCATIONS.filter((l) => allowedLocations.includes(l.value))
  const canSubmit = !!file && !!uploadLocation && !submitting

  return (
    <div>
      <div className="mb-4">
        <label className="block text-[12px] font-bold text-text-muted mb-1.5">Location (required before uploading)</label>
        <select
          value={uploadLocation}
          onChange={(e) => setUploadLocation(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 text-text px-3.5 py-2 text-[13px] font-bold min-w-[220px]"
        >
          <option value="">Select location…</option>
          {uploadLocationOptions.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0])
        }}
        className={`rounded-2xl border-2 border-dashed px-5 py-9 text-center cursor-pointer mb-5 transition-colors ${
          dragOver ? 'border-primary' : 'border-border'
        }`}
      >
        <div className="text-[36px] mb-2.5 text-text-muted">⬆️</div>
        <div className="font-bold text-[14.5px] text-text">{file ? file.name : 'Click to choose or drag & drop the Accounts Excel file'}</div>
        <div className="text-[12px] text-text-muted mt-1">.xlsx or .xls only</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => handleFileSelect(e.target.files[0])}
        />
      </div>

      <div className="flex justify-end mb-5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-xl bg-primary text-white font-bold text-[13.5px] px-5 py-2.5 disabled:opacity-50"
        >
          Upload & Process
        </button>
      </div>

      {status && (
        <div className={`rounded-xl border p-4 mb-6 ${status.kind === 'error' ? 'border-danger/30 bg-danger-tint' : 'border-border'}`}>
          <div className={`font-semibold text-[13.5px] ${status.kind === 'error' ? 'text-danger' : 'text-text'}`}>{status.text}</div>
          {status.summary && <div className="text-[12.5px] text-text-muted mt-1.5">{status.summary}</div>}
        </div>
      )}

      <div className="text-[14.5px] font-semibold text-text mb-2.5">Upload History</div>
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="border-collapse text-[12.5px] w-full">
            <thead>
              <tr className="bg-surface-2 text-text-muted text-left border-b border-border">
                <th className="px-3 py-1.5">File</th>
                <th className="px-3 py-1.5">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-text-muted">
                    Loading…
                  </td>
                </tr>
              ) : historyError ? (
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-danger">
                    ⚠️ Could not load history: {historyError}
                  </td>
                </tr>
              ) : history.length ? (
                history.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 text-text">{f.name}</td>
                    <td className="px-3 py-1.5 text-text-muted">{f.created_at ? new Date(f.created_at).toLocaleString('en-IN') : '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-text-muted">
                    No uploads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
