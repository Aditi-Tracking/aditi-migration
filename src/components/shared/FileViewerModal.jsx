import { useEffect } from 'react'
import { useFileViewer } from '../../context/FileViewerContext'

// Restyled version of old-portal's #file-viewer-overlay. The Google-Drive
// toolbar-clip trick (shift the iframe up, let the wrapper's overflow-hidden
// crop it) is ported; the old code's extra decorative mask <div>s are
// dropped since overflow-hidden on the wrapper already clips/blocks that
// area on its own — same visible result, fewer elements.
export default function FileViewerModal() {
  const { viewer, closeFileViewer } = useFileViewer()

  useEffect(() => {
    if (!viewer) return
    function onKeyDown(e) {
      if (e.key === 'Escape') closeFileViewer()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [viewer, closeFileViewer])

  if (!viewer) return null

  const { title, mode, src, isGoogle, isSafari } = viewer
  const clipGoogleToolbar = mode === 'iframe' && isGoogle && !isSafari

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) closeFileViewer()
      }}
      className="fixed inset-0 z-[300] bg-black/75 flex items-center justify-center p-3"
    >
      <div className="w-full max-w-4xl h-[85vh] bg-surface rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <span className="text-[15px] font-semibold text-text truncate pr-3">{title}</span>
          <button
            type="button"
            onClick={closeFileViewer}
            className="w-7 h-7 rounded-md bg-surface-2 border border-border text-text-muted flex items-center justify-center shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 relative overflow-hidden bg-black">
          {mode === 'video' ? (
            <video src={src} controls className="w-full h-full object-contain bg-black" />
          ) : (
            <iframe
              key={src}
              src={src}
              title={title}
              className="absolute left-0 w-full border-0"
              style={clipGoogleToolbar ? { top: '-64px', height: 'calc(100% + 128px)' } : { top: 0, height: '100%' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
