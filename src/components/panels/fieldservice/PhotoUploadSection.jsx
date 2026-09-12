// Ported from old-portal/js/fieldservice.js's _fsRenderPhotoSection/_fsRenderPhotoPreview.
// Purely presentational — the parent (SubmitEntryTab) owns `photos` and the actual upload
// orchestration, matching production's split between the picker/preview markup and
// fsSubmitEntry/_fsUploadPhoto's logic.
//
// Real, faithfully-kept quirk, not fixed: the ✕ remove button shows whenever a photo isn't
// mid-upload — including on an already-`done` (successfully uploaded) thumbnail, post-submit.
// Clicking it only removes the item from this local preview array; it never deletes the photo's
// storage file or DB row, which stay attached to the saved entry regardless. A user who removes a
// "done" thumbnail here will still see that photo if they reopen the entry later.
export default function PhotoUploadSection({ photoLabel, photos, pickerDisabled, onAddFiles, onRemove, onRetry }) {
  if (!photoLabel) return null

  function handleChange(e) {
    onAddFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="mb-4">
      <label className="block text-[12.5px] font-semibold text-text-muted mb-2">{photoLabel}</label>
      <div className="flex gap-2.5 flex-wrap">
        <label
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-3.5 rounded-lg border-[1.5px] border-dashed border-border bg-surface-2 text-text-muted text-[13px] font-bold text-center box-border ${
            pickerDisabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
          }`}
        >
          📷 Take Photo
          <input type="file" accept="image/*" capture="environment" multiple disabled={pickerDisabled} onChange={handleChange} className="hidden" />
        </label>
        <label
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-3.5 rounded-lg border-[1.5px] border-dashed border-border bg-surface-2 text-text-muted text-[13px] font-bold text-center box-border ${
            pickerDisabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
          }`}
        >
          🖼️ Choose from Gallery
          <input type="file" accept="image/*" multiple disabled={pickerDisabled} onChange={handleChange} className="hidden" />
        </label>
      </div>
      {!!photos.length && (
        <div className="flex flex-wrap gap-2.5 mt-3">
          {photos.map((p, i) => (
            <div key={i} className="relative w-[72px] h-[72px] shrink-0">
              <img src={p.blobUrl} alt="" className="w-full h-full object-cover rounded-lg border border-border" />
              {p.status === 'uploading' && (
                <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-[11px] font-bold rounded-lg">
                  {p.progress}%
                </div>
              )}
              {p.status === 'error' && (
                <div
                  onClick={() => onRetry(i)}
                  title={`Retry upload — ${p.error || ''}`}
                  className="absolute inset-0 bg-danger/55 flex items-center justify-center text-white text-[19px] rounded-lg cursor-pointer"
                >
                  ↻
                </div>
              )}
              {p.status === 'done' && (
                <div className="absolute bottom-0.5 right-0.5 bg-primary text-white rounded-full w-[18px] h-[18px] flex items-center justify-center text-[10px] font-extrabold">
                  ✓
                </div>
              )}
              {p.status !== 'uploading' && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border-none bg-danger text-white text-[10.5px] leading-5"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
