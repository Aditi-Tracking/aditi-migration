import { Fragment, useState } from 'react'
import { JOB_TYPE_CONFIG, engineerName, publicPhotoUrl } from '../../../../lib/fieldService'
import { FSD_PAGE_SIZE } from '../../../../lib/fieldServiceDashboard'

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderTable/_fsdToggleRow/
// _fsdRenderExpandedRow/_fsdRenderPagination. Row-expand toggles re-render from the already-
// fetched page (local state only) — no re-fetch needed, matching production's own _fsdLastRows
// cache.
export default function DashboardEntriesTable({ rows, total, page, onPageChange, viewAll, loading, error }) {
  const [expandedId, setExpandedId] = useState(null)
  const totalPages = Math.max(1, Math.ceil(total / FSD_PAGE_SIZE))

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="text-[13px] font-semibold text-text mb-2.5">Entries</div>

      {loading && <div className="text-center py-10 text-text-muted text-[13px]">⏳ Loading entries…</div>}
      {!loading && error && <div className="text-center py-10 text-danger text-[13px]">⚠️ Could not load entries — please try again.</div>}
      {!loading && !error && !rows.length && <div className="text-center py-10 text-text-muted text-[13px]">No entries found.</div>}

      {!loading && !error && !!rows.length && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b-2 border-border">
                  {['Date', 'Job Type', 'Client', 'Location', ...(viewAll ? ['Engineer'] : []), 'Photos'].map((h) => (
                    <th key={h} className="text-left px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide text-text-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const cfg = JOB_TYPE_CONFIG[e.job_type]
                  const jobLabel = (cfg && cfg.label) || e.job_type
                  const photoCount = (e.field_service_photos || []).length
                  const expanded = expandedId === e.id
                  return (
                    <Fragment key={e.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : e.id)}
                        className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                      >
                        <td className="px-2.5 py-2 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="px-2.5 py-2">{jobLabel}</td>
                        <td className="px-2.5 py-2">{e.client_name}</td>
                        <td className="px-2.5 py-2">{e.location}</td>
                        {viewAll && <td className="px-2.5 py-2">{engineerName(e.engineer_id)}</td>}
                        <td className="px-2.5 py-2 text-center">{photoCount}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={viewAll ? 6 : 5} className="p-0">
                            <ExpandedRow entry={e} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-center gap-2.5 mt-3.5">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => onPageChange(page - 1)}
              className="px-3 py-1.5 rounded-md border border-border text-text-muted text-[12px] font-semibold disabled:opacity-50"
            >
              ‹ Prev
            </button>
            <span className="text-[12px] text-text-muted px-2.5">
              Page {page + 1} of {totalPages} ({total} total)
            </span>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-3 py-1.5 rounded-md border border-border text-text-muted text-[12px] font-semibold disabled:opacity-50"
            >
              Next ›
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Bucket is public — reuses Phase 1's publicPhotoUrl() directly, no signed URLs.
function ExpandedRow({ entry: e }) {
  const cfg = JOB_TYPE_CONFIG[e.job_type]
  const fieldDefs = (cfg && cfg.fields) || []
  const details = e.details || {}
  const detailEntries = fieldDefs.filter((f) => details[f.key] != null && details[f.key] !== '')
  const photos = e.field_service_photos || []

  return (
    <div className="px-4 py-3.5 bg-surface-2 border-t border-border">
      <div className="text-[12.5px] font-bold text-text mb-1.5">Details</div>
      {detailEntries.length ? (
        detailEntries.map((f) => (
          <div key={f.key} className="mb-1.5 text-[12px]">
            <span className="text-text-muted">{f.label}:</span> <span className="font-semibold text-text">{details[f.key]}</span>
          </div>
        ))
      ) : (
        <div className="text-text-muted text-[12px]">No additional details for this job type.</div>
      )}

      <div className="text-[12.5px] font-bold text-text mt-3.5 mb-1.5">Photos</div>
      {photos.length ? (
        <div className="flex flex-wrap gap-1">
          {photos.map((p) => (
            <a key={p.id} href={publicPhotoUrl(p.storage_path)} target="_blank" rel="noopener noreferrer" className="inline-block m-1 text-center">
              <img src={publicPhotoUrl(p.storage_path)} alt={p.field_label || p.file_name} className="w-[90px] h-[90px] object-cover rounded-lg border border-border" />
              <div className="text-[10px] text-text-muted max-w-[90px] overflow-hidden text-ellipsis whitespace-nowrap">{p.field_label || p.file_name}</div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-text-muted text-[12px]">No photos attached.</div>
      )}
    </div>
  )
}
