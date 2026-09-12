import { useEffect, useState } from 'react'
import { RU_NOT_CONNECTED_REASON_LABELS } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's _ruRenderCustomerCallHistory —
// most-recent-first, capped at 50 rows (see fetchCustomerCallHistory).
export default function CallHistoryList({ rows, loading, getUrl, onOpenLightbox }) {
  if (loading) return <p className="text-text-muted text-[12.5px]">Loading…</p>
  if (!rows.length) return <p className="text-text-muted text-[12.5px]">No calls logged yet.</p>

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {rows.map((r, i) => (
        <HistoryRow key={i} row={r} getUrl={getUrl} onOpenLightbox={onOpenLightbox} />
      ))}
    </div>
  )
}

function HistoryRow({ row: r, getUrl, onOpenLightbox }) {
  const paths = (r.call_attachments || []).map((a) => a.screenshot_url)
  const note = r.connected
    ? r.conversation_notes || '—'
    : [RU_NOT_CONNECTED_REASON_LABELS[r.not_connected_reason] || r.not_connected_reason, r.conversation_notes].filter(Boolean).join(' — ') ||
      '—'
  const amount = r.amount_recovered ? `₹${Number(r.amount_recovered).toLocaleString('en-IN')}` : ''

  return (
    <div className="flex gap-2.5 items-start py-2 border-b border-border last:border-b-0 text-[12px]">
      <span className={`inline-block w-[9px] h-[9px] rounded-full mt-1 shrink-0 ${r.connected ? 'bg-primary' : 'bg-danger'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between gap-2">
          <span className="font-semibold text-text">{r.call_date}</span>
          {amount && <span className="text-primary font-semibold">{amount}</span>}
        </div>
        <div className="text-text-muted mt-0.5 break-words">{note}</div>
      </div>
      {!!paths.length && (
        <div className="flex gap-1 shrink-0">
          {paths.map((p, ai) => (
            <Thumbnail key={ai} path={p} getUrl={getUrl} onClick={() => onOpenLightbox(paths, ai)} />
          ))}
        </div>
      )}
    </div>
  )
}

// call-attachments is a private bucket — each thumbnail starts as an empty
// placeholder box and gets its real image swapped in once the authenticated
// fetch resolves (see useScreenshotCache). A failed fetch just leaves the
// placeholder empty; clicking it still surfaces a real error via the
// lightbox's own fetch attempt.
function Thumbnail({ path, getUrl, onClick }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    getUrl(path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [path, getUrl])

  return (
    <div onClick={onClick} title="View screenshot" className="w-10 h-10 rounded-lg bg-surface-2 cursor-pointer overflow-hidden shrink-0">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  )
}
