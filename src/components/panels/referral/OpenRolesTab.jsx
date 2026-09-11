import { useMemo, useState } from 'react'

// Ported from old-portal/js/referral.js's loadReferralOpenings/
// _populateReferralFilters/renderReferralOpenings. Filters are client-side
// over already-loaded data, same as the original.
export default function OpenRolesTab({ openings, loading, error, onRefer }) {
  const [locFilter, setLocFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')

  const locations = useMemo(
    () => [...new Set(openings.map((o) => o.location).filter(Boolean))].sort(),
    [openings]
  )
  const departments = useMemo(
    () => [...new Set(openings.map((o) => o.department).filter(Boolean))].sort(),
    [openings]
  )

  const rows = openings.filter(
    (o) => (!locFilter || o.location === locFilter) && (!deptFilter || o.department === deptFilter)
  )

  return (
    <div>
      <div className="flex gap-3 flex-wrap mb-4">
        <select
          value={locFilter}
          onChange={(e) => setLocFilter(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text"
        >
          <option value="">All Locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">Loading open roles…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>}
      {!loading && !error && !rows.length && (
        <div className="text-center py-12 text-text-muted">
          <div className="text-[13px] font-semibold text-text mb-1">No Open Roles Right Now</div>
          <div className="text-[12px]">
            Check back soon, or browse every live role on the{' '}
            <a
              href="https://erp.adititracking.com/jobs"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              careers page
            </a>
            .
          </div>
        </div>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((o) => (
            <div key={o.id} className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
              <div className="text-[13.5px] font-semibold text-text">{o.role_title || 'Role'}</div>
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10.5px] rounded border border-border bg-surface-2 px-1.5 py-0.5 text-text-muted">
                  📍 {o.location || '—'}
                </span>
                {o.department && (
                  <span className="text-[10.5px] rounded border border-border bg-surface-2 px-1.5 py-0.5 text-text-muted">
                    {o.department}
                  </span>
                )}
                <span className="text-[10.5px] rounded border border-border bg-surface-2 px-1.5 py-0.5 text-text-muted">
                  {o.openings_count || 1} opening{(o.openings_count || 1) === 1 ? '' : 's'}
                </span>
              </div>
              <div className="text-[12px] text-text-muted leading-relaxed min-h-[40px]">
                {(o.jd_text || 'See the full JD for details.').slice(0, 140)}
                {(o.jd_text || '').length > 140 ? '…' : ''}
              </div>
              <div className="flex gap-2 mt-auto">
                <button
                  type="button"
                  onClick={() => onRefer(o.id, o.role_title || 'Role')}
                  className="flex-1 rounded-md bg-primary text-white text-[12px] font-medium py-2"
                >
                  🤝 Refer a Friend
                </button>
                {o.jd_url && (
                  <a
                    href={o.jd_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-center rounded-md border border-border text-text-muted text-[12px] font-medium py-2"
                  >
                    Full JD
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
