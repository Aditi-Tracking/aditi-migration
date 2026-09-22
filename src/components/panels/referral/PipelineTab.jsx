import { useEffect, useState } from 'react'
import { SB_HDRS, SUPABASE_URL } from '../../../lib/supabaseClient'

// Ported from old-portal/js/referral.js's loadReferralPipeline/
// _renderPipelineRow/_refPipeToggleFields/saveReferralPipelineRow. Reloads
// fresh every time this tab is switched to (no "loaded once" cache), same
// as the original — it's mounted/unmounted by ReferralPanel on each switch.
const STATUS_OPTIONS = [
  'Submitted',
  'Under Review',
  'Shortlisted/Interview',
  'Selected/Offered',
  'Joined',
  '90-Day Completed',
  'Incentive Paid',
  'Closed-Not Eligible',
]

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function PipelineRow({ row }) {
  const [status, setStatus] = useState(row.status)
  const [joiningDate, setJoiningDate] = useState(row.joining_date || '')
  const [paidAmount, setPaidAmount] = useState(row.paid_amount || 2000)
  const [paidDate, setPaidDate] = useState(row.paid_date || '')
  const [saveMsg, setSaveMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const showJoining = status === 'Joined' || status === '90-Day Completed' || status === 'Incentive Paid'
  const showPayout = status === 'Incentive Paid' || status === '90-Day Completed'

  async function save() {
    setSaving(true)
    setSaveMsg('Saving…')
    const patch = { status }
    if (joiningDate) patch.joining_date = joiningDate
    if (status === 'Incentive Paid') {
      patch.paid_flag = true
      if (paidAmount) patch.paid_amount = Number(paidAmount)
      if (paidDate) patch.paid_date = paidDate
    }
    if (status === '90-Day Completed') patch.eligible_flag = true

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/referrals?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { ...SB_HDRS(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `Failed (${res.status})`)
      }
      setSaveMsg('✅ Saved')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (e) {
      setSaveMsg('⚠️ ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 mb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15.5px] font-bold text-text">{row.candidate_name}</div>
          <div className="text-[13.5px] text-primary font-semibold mt-0.5">for {row.opening_title || '—'}</div>
        </div>
        <span className="text-[12.5px] font-semibold rounded-full px-2.5 py-1 border bg-primary-tint text-primary border-primary/20">
          {row.status}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3.5">
        <div className="rounded-lg bg-surface-2 px-3.5 py-3">
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-text-muted mb-2">Candidate</div>
          <div className="text-[14.5px] text-text space-y-1">
            <div>🙋 {row.candidate_name}</div>
            <div>📱 {row.candidate_mobile}</div>
            {row.candidate_email && (
              <div>
                ✉️{' '}
                <a href={`mailto:${row.candidate_email}`} className="text-primary">
                  {row.candidate_email}
                </a>
              </div>
            )}
            {row.candidate_city && <div>📍 {row.candidate_city}</div>}
            {row.resume_url && (
              <div>
                <a href={row.resume_url} target="_blank" rel="noreferrer" className="text-primary">
                  📎 View Resume
                </a>
              </div>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-surface-2 px-3.5 py-3">
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-text-muted mb-2">Referred By</div>
          <div className="text-[14.5px] text-text space-y-1">
            <div>👤 {row.referrer_name}</div>
            <div>📍 {row.referrer_branch || row.referrer_dept || '—'}</div>
            <div>🗓️ Submitted {fmtDate(row.submitted_at)}</div>
          </div>
        </div>
      </div>

      {row.note && <div className="text-[14px] text-text mt-3 bg-surface-2 rounded-md px-2.5 py-2">📝 {row.note}</div>}

      <div className="flex flex-wrap items-center gap-2.5 mt-3.5 pt-3.5 border-t border-border">
        <label className="text-[13px] font-semibold text-text-muted">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[14px] text-text"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {showJoining && (
          <span className="flex items-center gap-1.5">
            <label className="text-[13px] font-semibold text-text-muted">Joining Date</label>
            <input
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
              className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[14px] text-text"
            />
          </span>
        )}
        {showPayout && (
          <span className="flex items-center gap-1.5">
            <label className="text-[13px] font-semibold text-text-muted">Paid ₹</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[14px] text-text"
            />
            <label className="text-[13px] font-semibold text-text-muted">Paid Date</label>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[14px] text-text"
            />
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary text-white text-[13.5px] font-semibold px-3 py-1.5 disabled:opacity-60"
        >
          Save
        </button>
        {saveMsg && <span className="text-[13px] font-semibold text-text-muted">{saveMsg}</span>}
      </div>
    </div>
  )
}

export default function PipelineTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch, refires every time this tab remounts (matches old-portal's per-switch reload)
    setLoading(true)
    fetch(`${SUPABASE_URL}/rest/v1/referrals?select=*&order=submitted_at.desc`, { headers: SB_HDRS() })
      .then((res) => {
        if (!res.ok) throw new Error('Could not load referrals (' + res.status + ')')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setRows(data)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <div className="text-[15px] font-bold text-text mb-4">All Referrals — Pipeline View</div>
      {loading && <div className="text-center py-16 text-text-muted text-[15px]">Loading all referrals…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[15px]">⚠️ {error}</div>}
      {!loading && !error && !rows.length && (
        <div className="text-center py-12 text-text-muted">
          <div className="text-[15px] font-bold text-text mb-1">No Referrals Yet</div>
          <div className="text-[14px]">Once employees start referring friends, they'll show up here.</div>
        </div>
      )}
      {!loading && !error && rows.map((r) => <PipelineRow key={r.id} row={r} />)}
    </div>
  )
}
