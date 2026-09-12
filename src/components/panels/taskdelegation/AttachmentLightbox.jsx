import { useEffect } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { fmtDateTime } from '../../../lib/taskDelegation'

// Ported from old-portal/js/taskDelegation.js's tdOpenAttachmentLightbox/tdCloseAttachmentLightbox —
// a single image, no prev/next nav (unlike Renewals' ScreenshotLightbox, which flips between a
// call's several screenshots). Escape closes, matching production's own keydown listener.
export default function AttachmentLightbox({ attachment, url, onClose }) {
  const open = !!attachment

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-xl">
      <div className="text-center">
        {url ? (
          <img src={url} alt="" className="max-w-full max-h-[80vh] rounded-lg mx-auto" />
        ) : (
          <p className="text-text-muted text-[13px] py-10">Loading…</p>
        )}
        {attachment && (
          <div className="text-text-muted text-[11.5px] mt-2.5">
            {attachment.file_name} · {attachment.uploaded_by} · {fmtDateTime(attachment.uploaded_at)}
          </div>
        )}
      </div>
    </OverlayShell>
  )
}
