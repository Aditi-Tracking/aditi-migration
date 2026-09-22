import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { SUPABASE_ANON, SUPABASE_URL } from '../../../lib/supabaseClient'
import { holidayCache } from '../../../lib/holidayCache'
import { normalizeHolidayLocation as holNormLoc } from '../../../lib/holidayLocation'

// Ported from old-portal/js/hr.js's loadHolidayCard/renderHolidayCard/
// filterHolidayBranch. Note: this table's RLS policy is on the 'anon' role
// specifically, so it's always queried with SUPABASE_ANON, even for a
// logged-in user — never the user's JWT. Do not "fix" that.
const OWNER_TIER_RAW_ROLES = ['managing director', 'mis', 'pc', 'executive assistant', 'ea']
const BRANCHES = [
  { key: 'Mumbai', label: '🏙️ Mumbai' },
  { key: 'Goa', label: '🏖️ Goa' },
  { key: 'Bangalore', label: '🌆 Bangalore' },
  { key: 'Gujarat', label: '🏛️ Gujarat' },
]

function fmtDate(d) {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function HolidayOverlay({ open, onClose }) {
  const { currentUser } = useAuth()
  const [loading, setLoading] = useState(!holidayCache.fetched)
  const [error, setError] = useState('')
  const [branchFilter, setBranchFilter] = useState('Mumbai')
  const [, forceRerender] = useState(0)

  const isOwnerTier =
    currentUser?.role === 'owner' || OWNER_TIER_RAW_ROLES.includes((currentUser?.rawRole || '').toLowerCase())
  const empLoc = holNormLoc(currentUser?.location || 'Mumbai')
  const effectiveLoc = isOwnerTier ? branchFilter : empLoc

  useEffect(() => {
    if (!open || holidayCache.fetched) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError('')
    const anonHdrs = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, Accept: 'application/json' }
    fetch(`${SUPABASE_URL}/rest/v1/Holiday%20List?select=*&order=Date.asc`, { headers: anonHdrs })
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .then((data) => {
        holidayCache.rows = data
        holidayCache.fetched = true
        setLoading(false)
        forceRerender((n) => n + 1)
      })
      .catch((e) => {
        setLoading(false)
        setError('Failed to load holiday data. (' + e.message + ')')
      })
  }, [open])

  if (!open) return null

  const rows = [...holidayCache.rows]
    .filter((r) => holNormLoc(r['Location']) === effectiveLoc)
    .sort((a, b) => new Date(a['Date']) - new Date(b['Date']))

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rowsWithStatus = rows.map((r) => {
    const hDate = new Date(r['Date'])
    hDate.setHours(0, 0, 0, 0)
    const diff = Math.round((hDate - today) / 86400000)
    const status = diff < 0 ? 'Past' : diff === 0 ? '🎉 Today!' : 'Upcoming'
    return { ...r, hDate, diff, status }
  })
  const nextHol = rowsWithStatus.find((r) => r.diff > 0) || null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex items-center gap-3 mb-4 pr-8">
        <div className="w-10 h-10 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <div>
          <div className="text-[17px] font-bold text-text">Holiday List</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[13.5px] text-text-muted">Company Holiday Calendar</span>
            <span className="text-[12.5px] font-semibold px-2 py-0.5 rounded-full bg-primary-tint text-primary border border-primary/20">
              📍 {isOwnerTier ? branchFilter : empLoc}
            </span>
          </div>
        </div>
      </div>

      {isOwnerTier && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          {BRANCHES.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBranchFilter(b.key)}
              className={`rounded-full px-3 py-1.5 text-[13.5px] font-semibold border transition-colors ${
                branchFilter === b.key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-2 text-text-muted border-border hover:text-text'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {nextHol && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary-tint px-4 py-2.5 mb-4">
          <div className="text-[22px]">🗓️</div>
          <div className="flex-1">
            <div className="text-[12px] font-bold text-text-muted uppercase tracking-wide">Next Holiday</div>
            <div className="text-[15px] font-bold text-primary">{nextHol['Holiday']}</div>
            <div className="text-[13px] text-text-muted">
              {nextHol['Day']}, {fmtDate(nextHol.hDate)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[22px] font-extrabold text-primary leading-none">{nextHol.diff}</div>
            <div className="text-[11.5px] font-semibold text-text-muted mt-1">DAYS LEFT</div>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-8 text-text-muted text-[14.5px]">Fetching holiday data…</div>}
      {!loading && error && <div className="text-center py-8 text-danger text-[14.5px]">⚠️ {error}</div>}
      {!loading && !error && !rowsWithStatus.length && (
        <div className="text-center py-8 text-text-muted text-[14.5px]">🏖️ No holiday records found for this branch.</div>
      )}
      {!loading && !error && rowsWithStatus.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border">
                <th className="px-3 py-2 text-left font-bold text-text-muted uppercase text-[12px] tracking-wide">#</th>
                <th className="px-3 py-2 text-left font-bold text-text-muted uppercase text-[12px] tracking-wide">Holiday</th>
                <th className="px-3 py-2 text-left font-bold text-text-muted uppercase text-[12px] tracking-wide whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-left font-bold text-text-muted uppercase text-[12px] tracking-wide">Day</th>
                <th className="px-3 py-2 text-left font-bold text-text-muted uppercase text-[12px] tracking-wide">Branch</th>
                <th className="px-3 py-2 text-left font-bold text-text-muted uppercase text-[12px] tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithStatus.map((r, i) => (
                <tr key={i} className={`border-b border-border last:border-0 ${r.status === '🎉 Today!' ? 'bg-primary-tint' : ''}`}>
                  <td className="px-3 py-2 text-text-muted">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold text-text">{r['Holiday'] || '—'}</td>
                  <td className="px-3 py-2 text-text-muted whitespace-nowrap">{fmtDate(r.hDate)}</td>
                  <td className="px-3 py-2 text-text-muted">{r['Day'] || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-surface-2 border border-border px-2 py-0.5 text-[12.5px] text-text-muted">
                      {holNormLoc(r['Location'])}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${
                        r.status === 'Past'
                          ? 'bg-surface-2 text-text-muted border border-border'
                          : 'bg-primary-tint text-primary border border-primary/20'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </OverlayShell>
  )
}
