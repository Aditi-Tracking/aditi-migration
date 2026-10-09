import { useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { JOB_TYPE_CONFIG, REVIEW_PHOTO_LABEL, canCreateFieldService, createEntry, getCurrentAuthUserId, requiresGoogleReview, uploadEntryPhoto } from '../../../lib/fieldService'
import PhotoUploadSection from './PhotoUploadSection'

const JOB_TYPES = Object.entries(JOB_TYPE_CONFIG)

// kind: 'job' (the per-job-type photo section) | 'review' (the single Google review screenshot).
// Both live in ONE array so the index-based upload/retry/remove handlers keep working unchanged.
function newPhoto(file, kind) {
  return { file, kind, blobUrl: URL.createObjectURL(file), status: 'pending', progress: 0, error: null }
}

// Ported from old-portal/js/fieldservice.js's _fsRenderSubmitForm/_fsSelectJobType/
// _fsRenderDynamicFields/fsSubmitEntry/_fsUploadPhoto/_fsAfterUploadRoundCheck/_fsResetForm.
// Selecting a job type fully resets fields + photos (not just hides them) so switching types can
// never leave a stale value behind. The form locks (client/location/job-type/fields disabled)
// once the entry row itself is saved — a guard against a duplicate field_service_entries row from
// a second click while photos are still uploading/retrying — but individual photo retries and
// removals stay interactive regardless (see PhotoUploadSection's own comment on that quirk).
export default function SubmitEntryTab() {
  const { currentUser } = useAuth()
  const [clientName, setClientName] = useState('')
  const [location, setLocation] = useState('')
  const [jobType, setJobType] = useState(null)
  const [fieldValues, setFieldValues] = useState({})
  const [photos, setPhotos] = useState([])
  const [savedEntryId, setSavedEntryId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState(null) // { text, tone: 'info'|'success'|'warn'|'error' }
  const [postSaveMode, setPostSaveMode] = useState(false) // true once the button becomes "Log/Start Another Entry"

  const cfg = jobType ? JOB_TYPE_CONFIG[jobType] : null
  const locked = !!savedEntryId

  // Mirrors `photos` state synchronously so the async upload loop (which needs to read the
  // latest array between awaits) never has to fall back to reading stale closure state or
  // abusing a setState updater as a read — every function that changes `photos` updates this
  // ref in the same breath.
  const photosRef = useRef(photos)
  function setPhotosAndRef(updater) {
    setPhotos((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      photosRef.current = next
      return next
    })
  }

  function revokeAllPhotoUrls(list) {
    list.forEach((p) => URL.revokeObjectURL(p.blobUrl))
  }

  function handleSelectJobType(key) {
    if (locked) return
    // Job photos always reset on a type switch. The review screenshot survives only if the new type
    // also requires one — otherwise it is discarded so a stale one can never upload.
    const keepReview = requiresGoogleReview(key)
    revokeAllPhotoUrls(photos.filter((p) => p.kind === 'job' || !keepReview))
    setJobType(key)
    setFieldValues({})
    setPhotosAndRef((prev) => prev.filter((p) => p.kind === 'review' && keepReview))
  }

  function handleAddPhotos(fileList, kind = 'job') {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    if (kind === 'review') {
      // Single slot: a new pick replaces the old one.
      photosRef.current.filter((p) => p.kind === 'review').forEach((p) => URL.revokeObjectURL(p.blobUrl))
      const picked = newPhoto(files[0], 'review')
      setPhotosAndRef((prev) => [...prev.filter((p) => p.kind !== 'review'), picked])
      return
    }
    setPhotosAndRef((prev) => [...prev, ...files.map((f) => newPhoto(f, 'job'))])
  }

  function handleRemovePhoto(i) {
    setPhotosAndRef((prev) => {
      const removed = prev[i]
      if (removed) URL.revokeObjectURL(removed.blobUrl)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  function updatePhoto(i, patch) {
    setPhotosAndRef((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }

  async function uploadOne(entryId, i) {
    const isReview = photosRef.current[i].kind === 'review'
    updatePhoto(i, { status: 'uploading', progress: 0, error: null })
    try {
      await uploadEntryPhoto(
        entryId,
        photosRef.current[i].file,
        isReview ? REVIEW_PHOTO_LABEL : cfg.photoLabel,
        (pct) => updatePhoto(i, { progress: pct }),
        isReview ? 'google_review' : 'job'
      )
      updatePhoto(i, { status: 'done', progress: 100 })
    } catch (e) {
      updatePhoto(i, { status: 'error', error: e.message })
    }
  }

  function afterUploadRoundCheck() {
    const failed = photosRef.current.filter((p) => p.status === 'error').length
    if (!failed) {
      setStatus({ text: '✅ Entry submitted successfully!', tone: 'success' })
    } else {
      setStatus({
        text: `⚠️ Entry saved, but ${failed} photo${failed > 1 ? 's' : ''} failed to upload — tap ↻ on a thumbnail to retry, or start a new entry.`,
        tone: 'warn',
      })
    }
    setPostSaveMode(true)
  }

  async function handleRetryPhoto(i) {
    const item = photosRef.current[i]
    if (!item || item.status !== 'error' || !savedEntryId) return
    await uploadOne(savedEntryId, i)
    afterUploadRoundCheck()
  }

  async function handleSubmit() {
    if (savedEntryId) return // guard: this form instance already saved an entry
    if (!canCreateFieldService(currentUser)) {
      setStatus({ text: '⛔ You do not have permission to submit field service entries.', tone: 'error' })
      return
    }
    const trimmedClient = clientName.trim()
    const trimmedLocation = location.trim()
    if (!trimmedClient) {
      setStatus({ text: '⚠️ Client name is required.', tone: 'error' })
      return
    }
    if (!trimmedLocation) {
      setStatus({ text: '⚠️ Location is required.', tone: 'error' })
      return
    }
    if (!jobType) {
      setStatus({ text: '⚠️ Please select a job type.', tone: 'error' })
      return
    }
    const details = {}
    for (const f of cfg.fields) {
      const val = (fieldValues[f.key] || '').trim()
      if (f.required !== false && !val) {
        setStatus({ text: `⚠️ Please fill in "${f.label}".`, tone: 'error' })
        return
      }
      if (val) details[f.key] = val
    }
    const reviewRequired = requiresGoogleReview(jobType)
    if (reviewRequired && !photosRef.current.some((p) => p.kind === 'review')) {
      setStatus({ text: '⚠️ Please upload the Google review screenshot.', tone: 'error' })
      return
    }

    setSubmitting(true)
    setStatus({ text: '⏳ Saving entry…', tone: 'info' })
    try {
      const engineerId = await getCurrentAuthUserId()
      if (!engineerId) throw new Error('Could not verify your session — please log in again.')

      const saved = await createEntry({ engineerId, clientName: trimmedClient, location: trimmedLocation, jobType, details, googleReviewTaken: reviewRequired })
      setSavedEntryId(saved.id)

      // Not gated on cfg.photoLabel — a job type with no job-photo section (e.g. Sensor Replace) must
      // still upload a review screenshot if it requires one. Job photos can't exist when photoLabel is null.
      if (photosRef.current.length) {
        setStatus({ text: '⏳ Uploading photos…', tone: 'info' })
        // Sequential, not parallel — a failed upload doesn't block or lose the others, and this
        // avoids piling concurrent XHRs onto one bucket.
        for (let i = 0; i < photosRef.current.length; i++) {
          await uploadOne(saved.id, i)
        }
      }
      afterUploadRoundCheck()
    } catch (e) {
      setStatus({ text: '❌ ' + e.message, tone: 'error' })
      setSubmitting(false)
      return
    }
    setSubmitting(false)
  }

  function handleReset() {
    revokeAllPhotoUrls(photosRef.current)
    setClientName('')
    setLocation('')
    setJobType(null)
    setFieldValues({})
    setPhotosAndRef([])
    setSavedEntryId(null)
    setSubmitting(false)
    setStatus(null)
    setPostSaveMode(false)
  }

  const STATUS_CLASS = {
    info: 'bg-primary-tint text-primary',
    success: 'bg-primary-tint text-primary',
    warn: 'bg-[#f0a500]/15 text-[#f0a500]',
    error: 'bg-danger-tint text-danger',
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 max-w-[640px]">
      <div className="text-[15px] font-extrabold text-text mb-4">🛠️ New Field Service Entry</div>

      <div className="mb-4">
        <label className="block text-[12.5px] font-semibold text-text-muted mb-1.5">Client Name *</label>
        <input
          type="text"
          value={clientName}
          disabled={locked}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Client name"
          className="w-full box-border px-3.5 py-3 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[14px] outline-none disabled:opacity-60"
        />
      </div>

      <div className="mb-5">
        <label className="block text-[12.5px] font-semibold text-text-muted mb-1.5">Location *</label>
        <input
          type="text"
          value={location}
          disabled={locked}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Site / location"
          className="w-full box-border px-3.5 py-3 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[14px] outline-none disabled:opacity-60"
        />
      </div>

      <div className="mb-5">
        <label className="block text-[12.5px] font-semibold text-text-muted mb-2.5">Job Type *</label>
        <div className="flex flex-col border-[1.5px] border-border rounded-xl overflow-hidden">
          {JOB_TYPES.map(([key, c], i) => {
            const active = jobType === key
            return (
              <button
                key={key}
                type="button"
                disabled={locked}
                onClick={() => handleSelectJobType(key)}
                className={`flex items-center gap-3 w-full px-4 py-4 text-left text-[13.5px] font-bold min-h-[52px] disabled:opacity-60 ${
                  i > 0 ? 'border-t border-border' : ''
                } ${active ? 'bg-primary-tint text-primary' : 'bg-surface-2 text-text'}`}
              >
                <span
                  className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center ${active ? 'border-primary' : 'border-text-muted'}`}
                >
                  {active && <span className="w-[9px] h-[9px] rounded-full bg-primary" />}
                </span>
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {cfg && !!cfg.fields.length && (
        <div>
          {cfg.fields.map((f) => {
            const req = f.required !== false
            return (
              <div key={f.key} className="mb-4">
                <label className="block text-[12.5px] font-semibold text-text-muted mb-1.5">
                  {f.label}
                  {req ? ' *' : ''}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    value={fieldValues[f.key] || ''}
                    disabled={locked}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    rows={3}
                    className="w-full box-border px-3 py-2.5 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[13.5px] outline-none resize-y disabled:opacity-60"
                  />
                ) : (
                  <input
                    type="text"
                    inputMode={f.numeric ? 'numeric' : undefined}
                    pattern={f.numeric ? '[0-9]*' : undefined}
                    value={fieldValues[f.key] || ''}
                    disabled={locked}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full box-border px-3.5 py-3 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[14px] outline-none disabled:opacity-60"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {cfg && (
        <>
          <PhotoUploadSection
            kind="job"
            photoLabel={cfg.photoLabel}
            photos={photos}
            pickerDisabled={locked}
            onAddFiles={(files) => handleAddPhotos(files, 'job')}
            onRemove={handleRemovePhoto}
            onRetry={handleRetryPhoto}
          />

          {requiresGoogleReview(jobType) && (
            <PhotoUploadSection
              kind="review"
              multiple={false}
              photoLabel={`${REVIEW_PHOTO_LABEL} *`}
              photos={photos}
              pickerDisabled={locked}
              onAddFiles={(files) => handleAddPhotos(files, 'review')}
              onRemove={handleRemovePhoto}
              onRetry={handleRetryPhoto}
            />
          )}
        </>
      )}

      {status && <div className={`px-3.5 py-2.5 rounded-lg text-[13px] font-semibold mb-3.5 ${STATUS_CLASS[status.tone]}`}>{status.text}</div>}

      <button
        type="button"
        onClick={postSaveMode ? handleReset : handleSubmit}
        disabled={submitting}
        className="w-full py-4 rounded-xl border-none bg-primary text-white font-extrabold text-[15px] disabled:opacity-60"
      >
        {submitting ? '⏳ Submitting…' : postSaveMode ? (status?.tone === 'warn' ? '🆕 Start New Entry' : '🆕 Log Another Entry') : '✅ Submit Entry'}
      </button>
    </div>
  )
}
