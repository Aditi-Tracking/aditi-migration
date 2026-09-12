import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'

// Ported from old-portal/js/renewals.js's ruOpenScreenshotLightbox/
// _ruShowLightboxImage/_ruLightboxPrev/_ruLightboxNext/
// ruCloseScreenshotLightbox. Deliberately a sibling overlay (owned by
// MyCustomersTab), not nested inside CustomerDetailModal — matching
// production's flat DOM structure, and sharing the same blob-URL cache
// (useScreenshotCache) the modal's thumbnails use.
export default function ScreenshotLightbox({ paths, index, getUrl, onIndexChange, onClose }) {
  const open = !!paths
  const [url, setUrl] = useState(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the shown image whenever index/paths change, not a render loop
    setUrl(null)
    getUrl(paths[index])
      .then((u) => !cancelled && setUrl(u))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, paths, index, getUrl])

  // Left/Right navigate between this call's attachments, Escape closes —
  // only while actually open, so this doesn't steal arrow keys elsewhere.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + paths.length) % paths.length)
      else if (e.key === 'ArrowRight') onIndexChange((index + 1) % paths.length)
      else if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, index, paths, onIndexChange, onClose])

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-xl">
      <div className="text-center">
        {url ? (
          <img src={url} alt="" className="max-w-full max-h-[80vh] rounded-lg mx-auto" />
        ) : (
          <p className="text-text-muted text-[13px] py-10">Loading…</p>
        )}
        {paths && paths.length > 1 && (
          <div className="flex items-center justify-center gap-4 mt-2.5">
            <button
              type="button"
              onClick={() => onIndexChange((index - 1 + paths.length) % paths.length)}
              className="rounded-lg border border-border px-3 py-1 text-[12.5px] text-text-muted"
            >
              ‹ Prev
            </button>
            <span className="text-text-muted text-[12px]">
              {index + 1} / {paths.length}
            </span>
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % paths.length)}
              className="rounded-lg border border-border px-3 py-1 text-[12.5px] text-text-muted"
            >
              Next ›
            </button>
          </div>
        )}
      </div>
    </OverlayShell>
  )
}
