import { useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { JOB_TYPE_CONFIG, engineerName, isReviewPhoto, publicPhotoUrl, requiresGoogleReview } from '../../../lib/fieldService'
import PhotoLightbox from './PhotoLightbox'

// Ported from old-portal/js/fieldservice.js's _fsOpenDetail/_fsOpenLightbox.
export default function EntryDetailModal({ entry, viewAll, onClose }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  if (!entry) return null

  const cfg = JOB_TYPE_CONFIG[entry.job_type]
  const label = cfg ? cfg.label : entry.job_type
  const dateStr = entry.created_at ? new Date(entry.created_at).toLocaleString('en-IN') : '—'
  const details = entry.details || {}
  const allPhotos = entry.field_service_photos || []
  const photos = allPhotos.filter((p) => !isReviewPhoto(p))
  const reviewPhotos = allPhotos.filter(isReviewPhoto)
  // One lightbox sequence: job photos first, then review screenshots (review thumbnail j opens at photos.length + j)
  const photoUrls = [...photos, ...reviewPhotos].map((p) => publicPhotoUrl(p.storage_path))

  return (
    <>
      <OverlayShell open={!!entry} onClose={onClose} maxWidth="max-w-lg">
        <div className="text-[17px] font-extrabold text-text mb-1">{entry.client_name}</div>
        <div className={`text-[12.5px] text-text-muted ${viewAll ? 'mb-1' : 'mb-4'}`}>
          📍 {entry.location} · 🗓️ {dateStr}
        </div>
        {viewAll && <div className="text-[12.5px] text-text-muted mb-4">👷 {engineerName(entry.engineer_id)}</div>}

        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11.5px] font-bold bg-primary-tint text-primary border border-primary/25">
          {label}
        </span>

        {/* Only for entries that took a review, or job types that require one — never "No" for the rest. */}
        {(entry.google_review_taken || requiresGoogleReview(entry.job_type)) && (
          <div className="text-[13px] mt-3">
            <span className="text-text-muted font-semibold">⭐ Google Review taken: </span>
            {entry.google_review_taken ? 'Yes' : 'No'}
          </div>
        )}

        {!!(cfg && cfg.fields.length) && (
          <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px] mt-4">
            {cfg.fields.map((f) => (
              <div key={f.key} className="contents">
                <div className="text-text-muted font-semibold">{f.label}</div>
                <div>{details[f.key] || '—'}</div>
              </div>
            ))}
          </div>
        )}

        {!!photos.length && (
          <div className="mt-4">
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide mb-2">📷 Photos ({photos.length})</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
              {photos.map((p, i) => (
                <div
                  key={p.id || i}
                  onClick={() => setLightboxIndex(i)}
                  className="cursor-pointer aspect-square rounded-lg overflow-hidden border border-border"
                >
                  <img src={publicPhotoUrl(p.storage_path)} alt="" loading="lazy" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {entry.google_review_taken && (
          <div className="mt-4">
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide mb-2">⭐ Google Review Screenshot</div>
            {reviewPhotos.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {reviewPhotos.map((p, j) => (
                  <div
                    key={p.id || j}
                    onClick={() => setLightboxIndex(photos.length + j)}
                    className="cursor-pointer aspect-square rounded-lg overflow-hidden border border-border"
                  >
                    <img src={publicPhotoUrl(p.storage_path)} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-text-muted text-[12px]">Marked taken, but no screenshot attached.</div>
            )}
          </div>
        )}
      </OverlayShell>

      <PhotoLightbox photos={lightboxIndex == null ? null : photoUrls} index={lightboxIndex || 0} onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
    </>
  )
}
