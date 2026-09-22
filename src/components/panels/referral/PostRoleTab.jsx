import { useEffect, useState } from 'react'
import { SB_HDRS, SUPABASE_URL } from '../../../lib/supabaseClient'
import FormField from './FormField'

const inputClass =
  'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[14.5px] text-text outline-none focus:border-primary'

// Ported from old-portal/js/referral.js's submitNewOpening/loadAdminOpeningsList/
// deleteOpening. Reloads the admin list fresh every time this tab is
// switched to, same as the original.
export default function PostRoleTab({ onOpeningsChanged }) {
  const [title, setTitle] = useState('')
  const [count, setCount] = useState(1)
  const [dept, setDept] = useState('')
  const [loc, setLoc] = useState('')
  const [jd, setJd] = useState('')
  const [jdUrl, setJdUrl] = useState('')
  const [status, setStatus] = useState(null) // { text, kind } | null

  const [adminList, setAdminList] = useState([])
  const [adminLoading, setAdminLoading] = useState(true)
  const [adminError, setAdminError] = useState('')

  async function loadAdminList() {
    setAdminLoading(true)
    setAdminError('')
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/job_openings?select=*&order=posted_date.desc`, { headers: SB_HDRS() })
      if (!res.ok) throw new Error('Failed (' + res.status + ')')
      setAdminList(await res.json())
    } catch (e) {
      setAdminError(e.message)
    } finally {
      setAdminLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch, refires every time this tab remounts (matches old-portal's per-switch reload)
    loadAdminList()
  }, [])

  async function submit(e) {
    e.preventDefault()
    const t = title.trim()
    const l = loc.trim()
    if (!t || !l) {
      setStatus({ text: '⚠️ Role title and location are required.', kind: 'danger' })
      return
    }
    setStatus({ text: '⏳ Posting…', kind: 'warn' })
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/job_openings`, {
        method: 'POST',
        headers: { ...SB_HDRS(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          role_title: t,
          department: dept.trim() || null,
          location: l,
          openings_count: count,
          jd_text: jd.trim() || null,
          jd_url: jdUrl.trim() || null,
          status: 'Open',
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `Failed (${res.status})`)
      }
      setStatus({ text: '✅ Opening posted!', kind: 'success' })
      setTitle('')
      setDept('')
      setLoc('')
      setJd('')
      setJdUrl('')
      setCount(1)
      loadAdminList()
      onOpeningsChanged?.()
    } catch (e) {
      setStatus({ text: '❌ ' + e.message, kind: 'danger' })
    }
  }

  async function handleDelete(id, roleTitle) {
    if (!confirm(`Delete "${roleTitle}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/job_openings?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...SB_HDRS(), Prefer: 'return=minimal' },
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `Failed (${res.status})`)
      }
      loadAdminList()
      onOpeningsChanged?.()
    } catch (e) {
      alert('Could not delete: ' + e.message)
    }
  }

  const statusClass =
    status?.kind === 'danger'
      ? 'bg-danger-tint text-danger'
      : status?.kind === 'success'
        ? 'bg-primary-tint text-primary'
        : 'bg-surface-2 text-text-muted'

  return (
    <div>
      <div className="text-[15px] font-bold text-text mb-4">Post a New Opening</div>
      <form onSubmit={submit} className="max-w-xl flex flex-col gap-3.5">
        <div className="flex gap-3">
          <FormField label="Role Title" className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Inside Sales Executive"
              className={inputClass}
            />
          </FormField>
          <FormField label="No. of Openings" className="w-32">
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>
        <div className="flex gap-3">
          <FormField label="Department" className="flex-1">
            <input type="text" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Sales" className={inputClass} />
          </FormField>
          <FormField label="Location" className="flex-1">
            <input type="text" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. Mumbai" className={inputClass} />
          </FormField>
        </div>
        <FormField label="Short Job Description">
          <textarea
            rows={4}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Key responsibilities, requirements..."
            className={inputClass}
          />
        </FormField>
        <FormField label="Link to Full JD (optional)">
          <input
            type="text"
            value={jdUrl}
            onChange={(e) => setJdUrl(e.target.value)}
            placeholder="https://erp.adititracking.com/jobs/..."
            className={inputClass}
          />
        </FormField>
        <button type="submit" className="rounded-md bg-primary text-white text-[15px] font-semibold py-2.5">
          Post Opening
        </button>
        {status && <div className={`rounded-md px-3 py-2 text-[14px] font-semibold text-center ${statusClass}`}>{status.text}</div>}
      </form>

      <div className="text-[15px] font-bold text-text mt-8 mb-4">Manage Existing Openings</div>
      {adminLoading && <div className="text-text-muted text-[14.5px]">Loading…</div>}
      {!adminLoading && adminError && <div className="text-danger text-[14.5px]">⚠️ {adminError}</div>}
      {!adminLoading && !adminError && !adminList.length && (
        <div className="text-text-muted text-[14.5px]">No openings posted yet.</div>
      )}
      {!adminLoading &&
        !adminError &&
        adminList.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3.5 rounded-xl border border-border bg-surface px-4 py-3 mb-2.5">
            <div className="flex-1 min-w-[180px]">
              <div className="text-[15px] font-bold text-text">{o.role_title}</div>
              <div className="text-[13.5px] text-text-muted mt-0.5">
                {o.location || '—'} · {o.department || '—'} · {o.openings_count || 1} opening
                {(o.openings_count || 1) === 1 ? '' : 's'}
              </div>
            </div>
            <span className="text-[12.5px] font-semibold rounded-full px-2.5 py-1 border bg-primary-tint text-primary border-primary/20">
              {o.status}
            </span>
            <button
              type="button"
              onClick={() => handleDelete(o.id, o.role_title)}
              className="rounded-md border border-danger/25 bg-danger-tint text-danger text-[13.5px] font-semibold px-3 py-1.5"
            >
              Delete
            </button>
          </div>
        ))}
    </div>
  )
}
