import { useEffect } from 'react'

// Ported from old-portal/js/fieldservice.js's _fsEnsureLightbox/_fsShowLightboxImage/
// _fsLightboxPrev/_fsLightboxNext/_fsCloseLightbox. Bucket is public — plain <img src>, no blob
// fetching/auth needed, unlike every private-bucket lightbox elsewhere in this project.
export default function PhotoLightbox({ photos, index, onIndexChange, onClose }) {
  const open = !!photos

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + photos.length) % photos.length)
      else if (e.key === 'ArrowRight') onIndexChange((index + 1) % photos.length)
      else if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, index, photos, onIndexChange, onClose])

  if (!open) return null

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center"
    >
      <button type="button" onClick={onClose} className="absolute top-4 right-5 text-white text-[26px] bg-transparent border-none">
        ✕
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 bg-white/10 text-white text-[22px] w-11 h-11 rounded-full border-none"
        >
          ‹
        </button>
      )}
      <img src={photos[index]} alt="" className="max-w-[90vw] max-h-[80vh] rounded-lg object-contain" />
      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => onIndexChange((index + 1) % photos.length)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 bg-white/10 text-white text-[22px] w-11 h-11 rounded-full border-none"
        >
          ›
        </button>
      )}
      <div className="text-[#ccc] mt-3.5 text-[13px]">
        {index + 1} / {photos.length}
      </div>
    </div>
  )
}
