import { RU_CALL_ATTACHMENT_MAX_COUNT } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's screenshot picker + preview grid
// (_ruRenderCallScreenshotPreview/_ruRemovePendingCallScreenshot). Purely
// presentational — file-picker input + preview thumbnails + remove — the
// actual add-files validation (image-only, size/count caps) and the
// paste-to-add path both live in CallLogPanel (the parent), which owns
// `files` and is the single entrypoint both funnel through, matching
// production's _ruAddCallScreenshotFiles being the shared entrypoint for
// both the picker and Ctrl+V paste.
export default function CallScreenshotUpload({ files, onAddFiles, onRemove }) {
  return (
    <div className="mt-2.5">
      <label className="block text-[10.5px] text-text-muted mb-1">
        Screenshots (optional, image only, max 5MB each, up to {RU_CALL_ATTACHMENT_MAX_COUNT}){' '}
        <span className="font-normal">— or paste screenshots (Ctrl+V, one at a time)</span>
      </label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          onAddFiles(e.target.files)
          e.target.value = ''
        }}
        className="w-full text-[11px] text-text-muted"
      />
      {!!files.length && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {files.map((f, i) => (
            <div key={i} className="relative w-14 h-14 shrink-0">
              <img src={f.blobUrl} alt="" className="w-full h-full object-cover rounded-lg border border-border" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                title="Remove"
                className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] leading-none flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
