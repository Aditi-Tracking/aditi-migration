import { useRef } from 'react'
import Icon from '../../shared/Icon'

// The visit's mandatory attachment: a photo (camera, or any image file) or a screenshot of the live location. Choosing one reads the device's position and
// burns the time and the coordinates into the image (see lib/visitPhoto.js). `photo` / the handlers come from usePhotoCapture. The status line is a
// reserved line: processing, a location problem (with Retry) and the "captured" confirmation all live there, so nothing around it moves.
// Props: photo, onPick(file), onRetry(), onClear(), error (the form's validation message), disabled.
const BTN = 'inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border-[1.5px] border-border bg-surface-2 text-text text-[13.5px] font-semibold disabled:opacity-60'

export default function PhotoCapture({ photo, onPick, onRetry, onClear, error, disabled = false }) {
  const cameraRef = useRef(null)
  const fileRef = useRef(null)
  const busy = photo.status === 'processing'
  // "Retry" redoes the position + stamp for the SAME photo (after the rep has allowed location). It stays available when the form's own
  // validation message has taken over the status line, otherwise a blocked submit would leave no way to retry.
  const retryButton =
    photo.status === 'error' && photo.file ? (
      <button type="button" onClick={onRetry} className="ml-2 underline bg-transparent border-none text-danger font-bold" data-role="retry-geo">
        Retry
      </button>
    ) : null

  function chosen(e) {
    const f = e.target.files?.[0]
    e.target.value = '' // the same file can be chosen again
    if (f) onPick(f)
  }

  return (
    <div id="fv-attachment" className="sm:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-1 min-h-[24px]">
        <span id="fv-attachment-label" className="block text-[12.5px] font-semibold text-text-muted">
          Photo or location screenshot *
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-2">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={chosen} data-role="camera-input" tabIndex={-1} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={chosen} data-role="file-input" tabIndex={-1} />
          <button type="button" disabled={disabled || busy} onClick={() => cameraRef.current?.click()} className={BTN} aria-describedby="fv-attachment-status">
            <Icon name="camera" size={16} />
            {photo.status === 'ready' ? 'Retake photo' : 'Take photo'}
          </button>
          <button type="button" disabled={disabled || busy} onClick={() => fileRef.current?.click()} className={BTN}>
            <Icon name="upload" size={16} />
            Choose image
          </button>
        </div>
        <div className="w-[132px] h-[104px] shrink-0 rounded-xl border-[1.5px] border-dashed border-border bg-surface-2 flex items-center justify-center overflow-hidden">
          {photo.previewUrl ? (
            <img src={photo.previewUrl} alt="The photo that will be attached, with its time and location stamped on it" className="w-full h-full object-cover" data-role="preview" />
          ) : busy ? (
            <Icon name="loader" size={20} />
          ) : (
            <span className="text-[11.5px] text-text-muted px-2 text-center">No photo yet</span>
          )}
        </div>
        {photo.status !== 'empty' && !busy && (
          <button type="button" disabled={disabled} onClick={onClear} className="bg-transparent border-none text-text-muted text-[12.5px] font-semibold underline self-center" data-role="clear-photo">
            Remove
          </button>
        )}
      </div>
      <div id="fv-attachment-status" aria-live="polite" className="min-h-[36px] pt-1.5 text-[12px] leading-[16px]">
        {error ? (
          <span className="font-semibold text-danger">
            {error}
            {retryButton}
          </span>
        ) : busy ? (
          <span className="text-text-muted">Getting your location and stamping the photo…</span>
        ) : photo.status === 'error' ? (
          <span className="text-danger font-semibold">
            {photo.error}
            {retryButton}
          </span>
        ) : photo.status === 'ready' ? (
          <span className="text-text-muted inline-flex items-center gap-1.5" data-role="geo-ok">
            <Icon name="pin" size={13} />
            {photo.geo.lat.toFixed(5)}, {photo.geo.lng.toFixed(5)}
            {Number.isFinite(photo.geo.accuracy) ? ` (±${Math.round(photo.geo.accuracy)} m)` : ''} · {photo.stamped ? 'time and location stamped on the photo' : 'location recorded (this image type could not be stamped)'}
          </span>
        ) : (
          <span className="text-text-muted">The time and your location are stamped on it automatically.</span>
        )}
      </div>
    </div>
  )
}
